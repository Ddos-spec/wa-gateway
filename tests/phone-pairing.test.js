const fs = require('fs');
const path = require('path');
const PhonePairing = require('../phone-pairing');

const PAIRING_STATUS_FILE = path.join(__dirname, '../pairing_statuses.json');

// Mock the log function
const mockLog = jest.fn();

describe('PhonePairing', () => {
    let phonePairing;

    beforeEach(() => {
        // Reset the pairing status file before each test
        if (fs.existsSync(PAIRING_STATUS_FILE)) {
            fs.unlinkSync(PAIRING_STATUS_FILE);
        }
        phonePairing = new PhonePairing(mockLog);
    });

    afterEach(() => {
        // Clean up the pairing status file after each test
        if (fs.existsSync(PAIRING_STATUS_FILE)) {
            fs.unlinkSync(PAIRING_STATUS_FILE);
        }
    });

    test('should create a new pairing request', async () => {
        const userId = 'test-user';
        const phoneNumber = '6281234567890';
        const { sessionId, isNew } = await phonePairing.createPairing(userId, phoneNumber);

        expect(isNew).toBe(true);
        expect(sessionId).toBeDefined();

        const status = phonePairing.getPairingStatus(sessionId);
        expect(status).toEqual(expect.objectContaining({
            owner: userId,
            phoneNumber: '6281234567890',
            status: 'PENDING_REQUEST'
        }));
    });

    test('should update a pairing status', async () => {
        const userId = 'test-user';
        const phoneNumber = '6281234567890';
        const { sessionId } = await phonePairing.createPairing(userId, phoneNumber);

        await phonePairing.updatePairingStatus(sessionId, {
            status: 'AWAITING_PAIRING',
            detail: 'Please provide the pairing code.',
            pairingCode: '123-456'
        });

        // We need to re-load to get the latest status after an async update
        phonePairing.loadPairingStatusesFromFile();
        const status = phonePairing.getPairingStatus(sessionId);

        expect(status.status).toBe('AWAITING_PAIRING');
        expect(status.detail).toBe('Please provide the pairing code.');
        expect(status.pairingCode).toBe('123-456');
    });

    test('should load pairing statuses from file', async () => {
        const initialStatuses = {
            'pair_12345': {
                sessionId: 'pair_12345',
                phoneNumber: '6281234567890',
                owner: 'test-user',
                status: 'CONNECTED',
                detail: 'Already connected',
                createdAt: new Date().toISOString()
            }
        };
        fs.writeFileSync(PAIRING_STATUS_FILE, JSON.stringify(initialStatuses, null, 2));

        const newPhonePairing = new PhonePairing(mockLog);
        const status = newPhonePairing.getPairingStatus('pair_12345');
        expect(status).toBeDefined();
        expect(status.status).toBe('CONNECTED');
    });

    // This test replaces the obsolete "no duplicate" test.
    // It verifies that the custom session ID is correctly used.
    test('should create a pairing request with a custom session ID', async () => {
        const userId = 'test-user';
        const phoneNumber = '6281234567890';
        const customSessionId = 'my-custom-session-123';

        const { sessionId } = await phonePairing.createPairing(userId, phoneNumber, customSessionId);

        expect(sessionId).toBe(customSessionId);
        const status = phonePairing.getPairingStatus(customSessionId);
        expect(status).toBeDefined();
        expect(status.owner).toBe(userId);
    });
});
