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
            detail: 'Please scan the QR code.',
            qr: 'test-qr'
        });

        const status = phonePairing.getPairingStatus(sessionId);
        expect(status.status).toBe('AWAITING_PAIRING');
        expect(status.detail).toBe('Please scan the QR code.');
        expect(status.qr).toBe('test-qr');
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

    test('should create a new pairing even if one exists (deduplication handled by API)', async () => {
        const userId = 'test-user';
        const phoneNumber = '6281234567890';

        // Create the first pairing
        const { sessionId: firstSessionId, isNew: firstIsNew } = await phonePairing.createPairing(userId, phoneNumber);
        expect(firstIsNew).toBe(true);

        // Wait 1ms to ensure unique timestamp
        await new Promise(resolve => setTimeout(resolve, 10));

        // Create a second one for the same number
        const { sessionId: secondSessionId, isNew: secondIsNew } = await phonePairing.createPairing(userId, phoneNumber);
        expect(secondIsNew).toBe(true);
        expect(secondSessionId).not.toBe(firstSessionId);
    });

    test('should use custom session ID if provided', async () => {
        const userId = 'test-user';
        const phoneNumber = '6281234567890';
        const customId = 'my-custom-session';

        const { sessionId, isNew } = await phonePairing.createPairing(userId, phoneNumber, customId);
        expect(sessionId).toBe(customId);

        const status = phonePairing.getPairingStatus(customId);
        expect(status).toBeDefined();
        expect(status.sessionId).toBe(customId);
    });
});
