const SessionManager = require('../src/session/session-manager');
const ConnectionHandler = require('../src/connection/connection-handler');
const SocketManager = require('../src/connection/socket-manager');

// --- Mocks ---
const mockSessionStorage = {
    loadSettings: jest.fn().mockResolvedValue({}),
    deleteSession: jest.fn(),
    getAllSessionIds: jest.fn().mockReturnValue([]),
};
const mockWebhookHandler = {};
const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
};
const mockDbModels = {
    User: {
        findByEmail: jest.fn().mockResolvedValue({ id: 1, email: 'test@example.com' }),
        findById: jest.fn().mockResolvedValue({ id: 1, email: 'test@example.com' }),
    },
    WaNumber: {
        create: jest.fn().mockResolvedValue({}),
        findBySessionName: jest.fn().mockResolvedValue({ user_id: 1 }),
    },
};
const mockPhonePairing = {
    updatePairingStatus: jest.fn(),
};

// Mock Baileys and connection components
let mockConnectionHandlerInstance;
jest.mock('../src/connection/connection-handler', () => {
    return jest.fn().mockImplementation((...args) => {
        mockConnectionHandlerInstance = {
            setupEventHandlers: jest.fn(),
            cleanup: jest.fn(),
            // Capture the callbacks passed by SessionManager
            _onStateChange: args[4].onStateChange,
            _onPhonePairingUpdate: args[4].onPhonePairingUpdate,
            _onWebhookEvent: args[4].onWebhookEvent,
        };
        return mockConnectionHandlerInstance;
    });
});

jest.mock('../src/connection/socket-manager', () => {
    return jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue({ on: jest.fn() }), // Mock a basic socket object
        close: jest.fn().mockResolvedValue(true),
    }));
});


describe('SessionManager', () => {
    let sessionManager;

    beforeEach(() => {
        jest.clearAllMocks();
        sessionManager = new SessionManager(
            mockSessionStorage,
            mockWebhookHandler,
            mockLogger,
            mockDbModels,
            mockPhonePairing,
            { maxSessions: 5 }
        );
    });

    describe('createSession', () => {
        it('should create a session successfully without a phone number', async () => {
            const sessionId = 'new-qr-session';
            const creatorEmail = 'test@example.com';

            const result = await sessionManager.createSession(sessionId, creatorEmail);

            expect(result.sessionId).toBe(sessionId);
            expect(result.token).toBeDefined();
            expect(sessionManager.sessions.has(sessionId)).toBe(true);

            expect(SocketManager).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.any(Object),
                expect.any(Object),
                expect.objectContaining({ phoneNumber: null }) // Explicitly check for null phoneNumber
            );
        });

        it('should throw an error if max sessions are reached', async () => {
            sessionManager.maxSessions = 2;
            sessionManager.sessions.set('session-1', {});
            sessionManager.sessions.set('session-2', {});

            await expect(sessionManager.createSession('session-3', 'user@test.com'))
                .rejects.toThrow('Maximum sessions limit (2) reached');
        });
    });

    describe('Pairing Flow', () => {
        const pairingSessionId = 'pair-session-123';
        const creatorEmail = 'pair-user@example.com';
        const phoneNumber = '6281234567890';

        it('should call SocketManager with a phone number when creating a pairing session', async () => {
            await sessionManager.createSession(pairingSessionId, creatorEmail, phoneNumber);

            expect(SocketManager).toHaveBeenCalledWith(
                pairingSessionId,
                expect.any(Object),
                expect.any(Object),
                expect.any(Object),
                expect.objectContaining({ phoneNumber: phoneNumber }) // Verify phone number is passed
            );
        });

        it('should trigger phonePairing.updatePairingStatus when a pairing code is received', async () => {
            // 1. Create the session to ensure the connection handler is set up
            await sessionManager.createSession(pairingSessionId, creatorEmail, phoneNumber);

            // 2. Ensure the mock connection handler instance was created
            expect(mockConnectionHandlerInstance).toBeDefined();

            // 3. Simulate Baileys emitting a pairing code update
            const pairingUpdateData = { pairingCode: 'ABC-123' };
            // Manually call the captured callback
            mockConnectionHandlerInstance._onPhonePairingUpdate(pairingSessionId, pairingUpdateData);

            // 4. Assert that the session manager correctly relayed this to the phone pairing service
            expect(mockPhonePairing.updatePairingStatus).toHaveBeenCalledTimes(1);
            expect(mockPhonePairing.updatePairingStatus).toHaveBeenCalledWith(
                pairingSessionId,
                pairingUpdateData
            );
        });
    });

    describe('deleteSession', () => {
        it('should delete a session successfully', async () => {
            const sessionId = 'session-to-delete';
            const creatorEmail = 'test@example.com';

            // Create a session first to ensure connectionHandler is properly mocked and set
            await sessionManager.createSession(sessionId, creatorEmail);

            const session = sessionManager.sessions.get(sessionId);
            const mockSocketMgr = session.socketManager; // Get the mocked socketManager from the session
            const connHandlerInstance = session.connectionHandler; // Get the mocked connectionHandler from the session
            
            // Ensure mocks are correctly spied on
            jest.spyOn(mockSocketMgr, 'close');
            jest.spyOn(connHandlerInstance, 'cleanup');
            
            sessionManager.sessionTokens.set(sessionId, 'some-token'); // Ensure token exists for deletion logic

            const result = await sessionManager.deleteSession(sessionId);

            expect(result).toBe(true);
            expect(connHandlerInstance.cleanup).toHaveBeenCalled();
            expect(mockSocketMgr.close).toHaveBeenCalled();
            expect(mockSessionStorage.deleteSession).toHaveBeenCalledWith(sessionId);
            expect(sessionManager.sessions.has(sessionId)).toBe(false);
        });
    });
});
