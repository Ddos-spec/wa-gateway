const fs = require('fs');
const path = require('path');
const { formatPhoneNumber } = require('./phone-utils');

const PAIRING_STATUS_FILE = path.join(__dirname, 'pairing_statuses.json');

class PhonePairing {
    constructor(log) {
        this.log = log;
        this.pairingStatuses = new Map();
        this.loadPairingStatuses();
    }

    // Load pairing statuses from JSON file
    loadPairingStatuses() {
        try {
            if (fs.existsSync(PAIRING_STATUS_FILE)) {
                const data = fs.readFileSync(PAIRING_STATUS_FILE, 'utf-8');
                const statuses = JSON.parse(data);
                for (const [sessionId, status] of Object.entries(statuses)) {
                    this.pairingStatuses.set(sessionId, status);
                }
                this.log('Loaded pairing statuses from file.');
            }
        } catch (error) {
            this.log(`Error loading pairing statuses: ${error.message}`, 'ERROR');
        }
    }

    // Save pairing statuses to JSON file
    savePairingStatuses() {
        try {
            const statuses = Object.fromEntries(this.pairingStatuses);
            fs.writeFileSync(PAIRING_STATUS_FILE, JSON.stringify(statuses, null, 2), 'utf-8');
        } catch (error) {
            this.log(`Error saving pairing statuses: ${error.message}`, 'ERROR');
        }
    }

    // Create a new pairing request
    async createPairing(userId, phoneNumber) {
        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);

        const sessionId = `pair_${formattedPhoneNumber.replace(/\D/g, '')}_${Date.now()}`;

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
        this.savePairingStatuses();

        this.log(`Phone pairing created for ${formattedPhoneNumber}`, sessionId);
        return { sessionId, isNew: true };
    }

    // Update the status of a pairing
    updatePairingStatus(sessionId, updates) {
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
        this.savePairingStatuses();
        this.log(`Pairing status updated for ${sessionId}: ${updates.status || currentStatus.status}`);
    }

    // Get a pairing status by session ID
    getPairingStatus(sessionId) {
        return this.pairingStatuses.get(sessionId);
    }

    // Find any non-connected pairing session by phone number
    findStalePairing(phoneNumber) {
        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
        for (const [sessionId, status] of this.pairingStatuses) {
            if (status.phoneNumber === formattedPhoneNumber && status.status !== 'CONNECTED') {
                return status;
            }
        }
        return null;
    }

    // Find a pending pairing session by phone number
    findPendingPairingByPhone(phoneNumber) {
        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
        for (const [sessionId, status] of this.pairingStatuses) {
            if (status.phoneNumber === formattedPhoneNumber && status.status === 'PENDING_REQUEST') {
                return status;
            }
        }
        return null;
    }

    // Get all pairings for a specific user
    getPairingsByUserId(userId) {
        const pairings = [];
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

    // Remove a pairing from the system
    deletePairing(sessionId) {
        if (this.pairingStatuses.has(sessionId)) {
            this.pairingStatuses.delete(sessionId);
            this.savePairingStatuses();
            this.log(`Pairing data for session ${sessionId} has been deleted.`);
            return true;
        }
        return false;
    }
}

module.exports = PhonePairing;
