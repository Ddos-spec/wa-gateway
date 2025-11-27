const fs = require('fs');
const path = require('path');
const { formatPhoneNumber } = require('./phone-utils');

const PAIRING_STATUS_FILE = path.join(__dirname, 'pairing_statuses.json');
const LOCK_FILE = path.join(__dirname, 'pairing_statuses.lock');

class PhonePairing {
    constructor(log) {
        this.log = log;
        this.pairingStatuses = new Map();
        // Initial load. Subsequent operations will re-load to ensure data is fresh.
        this.loadPairingStatusesFromFile();
    }

    // --- Lock Management ---
    async acquireLock(timeout = 5000) {
        const startTime = Date.now();
        while (fs.existsSync(LOCK_FILE)) {
            if (Date.now() - startTime > timeout) {
                throw new Error('Failed to acquire lock: Timeout');
            }
            await new Promise(resolve => setTimeout(resolve, 50)); // Wait 50ms before retrying
        }
        fs.writeFileSync(LOCK_FILE, process.pid.toString());
    }

    releaseLock() {
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
        }
    }
    // --- End Lock Management ---

    // Load pairing statuses from JSON file into the in-memory map
    loadPairingStatusesFromFile() {
        try {
            if (fs.existsSync(PAIRING_STATUS_FILE)) {
                const data = fs.readFileSync(PAIRING_STATUS_FILE, 'utf-8');
                const statuses = JSON.parse(data);
                this.pairingStatuses.clear(); // Clear existing map
                for (const [sessionId, status] of Object.entries(statuses)) {
                    this.pairingStatuses.set(sessionId, status);
                }
            }
        } catch (error) {
            this.log(`Error loading pairing statuses: ${error.message}`, 'ERROR');
        }
    }

    // Save the in-memory map to the JSON file
    savePairingStatusesToFile() {
        try {
            const statuses = Object.fromEntries(this.pairingStatuses);
            fs.writeFileSync(PAIRING_STATUS_FILE, JSON.stringify(statuses, null, 2), 'utf-8');
        } catch (error) {
            this.log(`Error saving pairing statuses: ${error.message}`, 'ERROR');
        }
    }

    // Create a new pairing request (Atomic Operation)
    async createPairing(userId, phoneNumber, customSessionId = null) {
        await this.acquireLock();
        try {
            this.loadPairingStatusesFromFile(); // Load latest data

            const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
            // Use custom ID if provided, otherwise generate
            const sessionId = customSessionId || `pair_${formattedPhoneNumber.replace(/\D/g, '')}_${Date.now()}`;

            const newPairing = {
                sessionId: sessionId,
                phoneNumber: formattedPhoneNumber,
                owner: userId,
                status: 'PENDING_REQUEST',
                detail: 'Awaiting Baileys connection to request pairing code.',
                pairingCode: null,
                qr: null,
                createdAt: new Date().toISOString()
            };

            this.pairingStatuses.set(sessionId, newPairing);
            this.savePairingStatusesToFile(); // Save updated data

            this.log(`Phone pairing created for ${formattedPhoneNumber}`, sessionId);
            return { sessionId, isNew: true };
        } finally {
            this.releaseLock();
        }
    }

    // Update the status of a pairing (Atomic Operation)
    async updatePairingStatus(sessionId, updates) {
        await this.acquireLock();
        try {
            this.loadPairingStatusesFromFile(); // Load latest data

            if (!this.pairingStatuses.has(sessionId)) {
                this.log(`Attempted to update non-existent pairing session: ${sessionId}`, 'ERROR');
                return;
            }

            const currentStatus = this.pairingStatuses.get(sessionId);
            const updatedStatus = {
                ...currentStatus,
                ...updates,
                updatedAt: new Date().toISOString()
            };

            this.pairingStatuses.set(sessionId, updatedStatus);
            this.savePairingStatusesToFile(); // Save updated data
            this.log(`Pairing status updated for ${sessionId}: ${updates.status || currentStatus.status}`);
        } finally {
            this.releaseLock();
        }
    }

    // Get a pairing status by session ID (Read-only, no lock needed)
    getPairingStatus(sessionId) {
        // This reads from the in-memory cache which might be slightly stale,
        // but it's fast and doesn't require a lock. For critical checks, the atomic operations are used.
        return this.pairingStatuses.get(sessionId);
    }

    // Find any non-connected pairing session by phone number (Read-only)
    findStalePairing(phoneNumber) {
        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
        for (const [sessionId, status] of this.pairingStatuses) {
            if (status.phoneNumber === formattedPhoneNumber && status.status !== 'CONNECTED') {
                return status;
            }
        }
        return null;
    }

    // Find a pending pairing session by phone number (Read-only)
    findPendingPairingByPhone(phoneNumber) {
        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
        for (const [sessionId, status] of this.pairingStatuses) {
            if (status.phoneNumber === formattedPhoneNumber && status.status === 'PENDING_REQUEST') {
                return status;
            }
        }
        return null;
    }

    // Get all pairings for a specific user (Read-only)
    getPairingsByUserId(userId) {
        const pairings = [];
        // We do a fresh read here to ensure the user gets the most up-to-date list.
        this.loadPairingStatusesFromFile();
        for (let [sessionId, session] of this.pairingStatuses) {
            if (session.owner === userId) {
                pairings.push({
                    sessionId: sessionId,
                    phoneNumber: `+${session.phoneNumber}`, // Display with + prefix
                    status: session.status,
                    detail: session.detail,
                    pairingCode: session.pairingCode,
                    createdAt: session.createdAt
                });
            }
        }
        return pairings;
    }

    // Remove a pairing from the system (Atomic Operation)
    async deletePairing(sessionId) {
        await this.acquireLock();
        try {
            this.loadPairingStatusesFromFile(); // Load latest data

            if (this.pairingStatuses.has(sessionId)) {
                this.pairingStatuses.delete(sessionId);
                this.savePairingStatusesToFile(); // Save updated data
                this.log(`Pairing data for session ${sessionId} has been deleted.`);
                return true;
            }
            return false;
        } finally {
            this.releaseLock();
        }
    }
}

module.exports = PhonePairing;
