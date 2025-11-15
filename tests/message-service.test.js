const MessageService = require('../src/services/message-service');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

// Mock dependencies
const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

// Mock Baileys socket
const mockSock = {
    sendMessage: jest.fn(),
};

const mockSessionManager = {
    getSession: jest.fn(),
    // Add the 'sessions' map to the mock
    sessions: {
        get: jest.fn(),
    },
};

describe('MessageService', () => {
    let messageService;
    const sessionId = 'test-session';
    const to = '6281234567890';
    const normalizedJid = jidNormalizedUser(`${to}@s.whatsapp.net`);

    beforeEach(() => {
        jest.clearAllMocks();
        messageService = new MessageService(mockSessionManager, mockLogger, {});

        // Setup the mocks to return a valid, connected session
        const mockSession = {
            sock: mockSock,
            isConnected: true,
        };
        mockSessionManager.getSession.mockReturnValue(mockSession);
        mockSessionManager.sessions.get.mockReturnValue(mockSession);
    });

    const testSuccess = async (method, payload, ...args) => {
        // Arrange
        mockSock.sendMessage.mockResolvedValue({ key: { id: 'test-message-id' } });

        // Act
        const result = await messageService[method](sessionId, to, ...args);

        // Assert
        expect(mockSessionManager.getSession).toHaveBeenCalledWith(sessionId);
        expect(mockSessionManager.sessions.get).toHaveBeenCalledWith(sessionId);
        expect(mockSock.sendMessage).toHaveBeenCalledWith(normalizedJid, payload);
        expect(result).toEqual({
            status: 'success',
            messageId: 'test-message-id',
            to: normalizedJid,
        });
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining(`sent to ${normalizedJid}`),
            'MESSAGING',
            { sessionId }
        );
    };

    const testFailure = async (method, ...args) => {
        // Arrange
        const errorMessage = 'Session not found or not connected';
        mockSessionManager.getSession.mockReturnValue({ isConnected: false }); // Simulate disconnected

        // Act & Assert
        await expect(messageService[method](sessionId, to, ...args))
            .rejects.toThrow(errorMessage);
        
        expect(mockSock.sendMessage).not.toHaveBeenCalled();
    };

    describe('sendText', () => {
        const text = 'Hello, world!';
        it('should send a text message successfully', () => testSuccess('sendText', { text }, text));
        it('should fail if session is not connected', () => testFailure('sendText', text));
    });

    describe('sendImage', () => {
        const imageUrl = 'http://example.com/image.jpg';
        const caption = 'A nice image';
        it('should send an image message successfully', () => testSuccess('sendImage', { image: { url: imageUrl }, caption }, imageUrl, caption));
        it('should fail if session is not connected', () => testFailure('sendImage', imageUrl, caption));
    });

    describe('sendVideo', () => {
        const videoUrl = 'http://example.com/video.mp4';
        const caption = 'A nice video';
        it('should send a video message successfully', () => testSuccess('sendVideo', { video: { url: videoUrl }, caption }, videoUrl, caption));
        it('should fail if session is not connected', () => testFailure('sendVideo', videoUrl, caption));
    });

    describe('sendAudio', () => {
        const audioUrl = 'http://example.com/audio.mp3';
        it('should send an audio message successfully', () => testSuccess('sendAudio', { audio: { url: audioUrl }, mimetype: 'audio/mp4' }, audioUrl));
        it('should fail if session is not connected', () => testFailure('sendAudio', audioUrl));
    });

    describe('sendDocument', () => {
        const docUrl = 'http://example.com/doc.pdf';
        const filename = 'document.pdf';
        const mimetype = 'application/pdf';
        it('should send a document message successfully', () => testSuccess('sendDocument', { document: { url: docUrl }, fileName: filename, mimetype }, docUrl, filename, mimetype));
        it('should fail if session is not connected', () => testFailure('sendDocument', docUrl, filename, mimetype));
    });

    describe('sendSticker', () => {
        const stickerUrl = 'http://example.com/sticker.webp';
        it('should send a sticker message successfully', () => testSuccess('sendSticker', { sticker: { url: stickerUrl } }, stickerUrl));
        it('should fail if session is not connected', () => testFailure('sendSticker', stickerUrl));
    });

    describe('Error Handling', () => {
        it('should throw an error if recipient is invalid', async () => {
            const invalidTo = 'invalid-number';
            await expect(messageService.sendText(sessionId, invalidTo, 'test'))
                .rejects.toThrow('Invalid recipient JID');
        });

        it('should handle sendMessage failure and log the error', async () => {
            const errorMessage = 'WhatsApp failed to send';
            mockSock.sendMessage.mockRejectedValue(new Error(errorMessage));

            await expect(messageService.sendText(sessionId, to, 'test'))
                .rejects.toThrow(errorMessage);
            
            expect(mockLogger.error).toHaveBeenCalledWith(
                `Failed to send message to ${normalizedJid}`,
                'MESSAGING',
                { sessionId, error: errorMessage }
            );
        });
    });
});
