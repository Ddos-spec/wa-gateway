const { jidNormalizedUser, downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

/**
 * Message Service
 * Centralized service for sending WhatsApp messages
 */

class MessageService {
    constructor(sessionManager, logger, options = {}) {
        this.sessionManager = sessionManager;
        this.logger = logger;
        this.mediaDir = options.mediaDir || path.join(__dirname, '../../media');

        // Ensure media directory exists
        if (!fs.existsSync(this.mediaDir)) {
            fs.mkdirSync(this.mediaDir, { recursive: true });
        }
    }

    /**
     * Send a text message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {string} text - Message text
     * @param {Object} options - Additional options
     * @returns {Object} Message result
     */
    async sendText(sessionId, to, text, options = {}) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session || !session.isConnected) {
            throw new Error('Session not connected');
        }

        const jid = this._normalizeJid(to);

        try {
            const sock = this.sessionManager.sessions.get(sessionId).sock;
            const result = await sock.sendMessage(jid, {
                text: text
            });

            this.logger.info(`Text message sent to ${to}`, sessionId);

            return {
                success: true,
                messageId: result.key.id,
                to: jid,
                timestamp: result.messageTimestamp
            };

        } catch (error) {
            this.logger.error(
                `Failed to send text message: ${error.message}`,
                sessionId
            );
            throw error;
        }
    }

    /**
     * Send an image message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {Buffer|string} image - Image buffer or URL
     * @param {string} caption - Optional caption
     * @returns {Object} Message result
     */
    async sendImage(sessionId, to, image, caption = '') {
        const session = this.sessionManager.getSession(sessionId);
        if (!session || !session.isConnected) {
            throw new Error('Session not connected');
        }

        const jid = this._normalizeJid(to);

        try {
            const sock = this.sessionManager.sessions.get(sessionId).sock;

            const messageContent = {
                image: typeof image === 'string' ? { url: image } : image,
            };

            if (caption) {
                messageContent.caption = caption;
            }

            const result = await sock.sendMessage(jid, messageContent);

            this.logger.info(`Image message sent to ${to}`, sessionId);

            return {
                success: true,
                messageId: result.key.id,
                to: jid,
                timestamp: result.messageTimestamp
            };

        } catch (error) {
            this.logger.error(
                `Failed to send image: ${error.message}`,
                sessionId
            );
            throw error;
        }
    }

    /**
     * Send a video message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {Buffer|string} video - Video buffer or URL
     * @param {string} caption - Optional caption
     * @returns {Object} Message result
     */
    async sendVideo(sessionId, to, video, caption = '') {
        const session = this.sessionManager.getSession(sessionId);
        if (!session || !session.isConnected) {
            throw new Error('Session not connected');
        }

        const jid = this._normalizeJid(to);

        try {
            const sock = this.sessionManager.sessions.get(sessionId).sock;

            const messageContent = {
                video: typeof video === 'string' ? { url: video } : video,
            };

            if (caption) {
                messageContent.caption = caption;
            }

            const result = await sock.sendMessage(jid, messageContent);

            this.logger.info(`Video message sent to ${to}`, sessionId);

            return {
                success: true,
                messageId: result.key.id,
                to: jid,
                timestamp: result.messageTimestamp
            };

        } catch (error) {
            this.logger.error(
                `Failed to send video: ${error.message}`,
                sessionId
            );
            throw error;
        }
    }

    /**
     * Send an audio message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {Buffer|string} audio - Audio buffer or URL
     * @returns {Object} Message result
     */
    async sendAudio(sessionId, to, audio) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session || !session.isConnected) {
            throw new Error('Session not connected');
        }

        const jid = this._normalizeJid(to);

        try {
            const sock = this.sessionManager.sessions.get(sessionId).sock;

            const result = await sock.sendMessage(jid, {
                audio: typeof audio === 'string' ? { url: audio } : audio,
                mimetype: 'audio/mp4'
            });

            this.logger.info(`Audio message sent to ${to}`, sessionId);

            return {
                success: true,
                messageId: result.key.id,
                to: jid,
                timestamp: result.messageTimestamp
            };

        } catch (error) {
            this.logger.error(
                `Failed to send audio: ${error.message}`,
                sessionId
            );
            throw error;
        }
    }

    /**
     * Send a document message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {Buffer|string} document - Document buffer or URL
     * @param {string} filename - Document filename
     * @param {string} mimetype - Document MIME type
     * @param {string} caption - Optional caption
     * @returns {Object} Message result
     */
    async sendDocument(sessionId, to, document, filename, mimetype, caption = '') {
        const session = this.sessionManager.getSession(sessionId);
        if (!session || !session.isConnected) {
            throw new Error('Session not connected');
        }

        const jid = this._normalizeJid(to);

        try {
            const sock = this.sessionManager.sessions.get(sessionId).sock;

            const messageContent = {
                document: typeof document === 'string' ? { url: document } : document,
                fileName: filename,
                mimetype: mimetype
            };

            if (caption) {
                messageContent.caption = caption;
            }

            const result = await sock.sendMessage(jid, messageContent);

            this.logger.info(`Document sent to ${to}`, sessionId);

            return {
                success: true,
                messageId: result.key.id,
                to: jid,
                timestamp: result.messageTimestamp
            };

        } catch (error) {
            this.logger.error(
                `Failed to send document: ${error.message}`,
                sessionId
            );
            throw error;
        }
    }

    /**
     * Send a sticker message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {Buffer|string} sticker - Sticker buffer or URL
     * @returns {Object} Message result
     */
    async sendSticker(sessionId, to, sticker) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session || !session.isConnected) {
            throw new Error('Session not connected');
        }

        const jid = this._normalizeJid(to);

        try {
            const sock = this.sessionManager.sessions.get(sessionId).sock;

            const result = await sock.sendMessage(jid, {
                sticker: typeof sticker === 'string' ? { url: sticker } : sticker
            });

            this.logger.info(`Sticker sent to ${to}`, sessionId);

            return {
                success: true,
                messageId: result.key.id,
                to: jid,
                timestamp: result.messageTimestamp
            };

        } catch (error) {
            this.logger.error(
                `Failed to send sticker: ${error.message}`,
                sessionId
            );
            throw error;
        }
    }

    /**
     * Delete a message
     * @param {string} sessionId - Session identifier
     * @param {Object} messageKey - Message key to delete
     * @returns {Object} Delete result
     */
    async deleteMessage(sessionId, messageKey) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session || !session.isConnected) {
            throw new Error('Session not connected');
        }

        try {
            const sock = this.sessionManager.sessions.get(sessionId).sock;

            await sock.sendMessage(messageKey.remoteJid, {
                delete: messageKey
            });

            this.logger.info(`Message deleted: ${messageKey.id}`, sessionId);

            return {
                success: true,
                messageId: messageKey.id
            };

        } catch (error) {
            this.logger.error(
                `Failed to delete message: ${error.message}`,
                sessionId
            );
            throw error;
        }
    }

    /**
     * Download media from message
     * @param {Object} message - Message object
     * @returns {Buffer} Media buffer
     */
    async downloadMedia(message) {
        try {
            const buffer = await downloadMediaMessage(
                message,
                'buffer',
                {},
                {
                    logger: this.logger.pino,
                    reuploadRequest: null
                }
            );

            return buffer;

        } catch (error) {
            this.logger.error(`Failed to download media: ${error.message}`);
            throw error;
        }
    }

    /**
     * Normalize JID (convert phone number to JID)
     * @private
     */
    _normalizeJid(identifier) {
        // If already a JID, return as is
        if (identifier.includes('@')) {
            return identifier;
        }

        // Convert phone number to JID
        return jidNormalizedUser(identifier);
    }

    /**
     * Validate session is connected
     * @param {string} sessionId - Session identifier
     * @throws {Error} If session not connected
     */
    validateSession(sessionId) {
        const session = this.sessionManager.getSession(sessionId);

        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        if (!session.isConnected) {
            throw new Error(`Session ${sessionId} is not connected`);
        }

        return true;
    }

    /**
     * Get message statistics
     * @returns {Object} Message statistics
     */
    getStats() {
        // This would ideally be tracked over time
        // For now, return basic info
        return {
            service: 'MessageService',
            status: 'operational',
            mediaDir: this.mediaDir
        };
    }
}

module.exports = MessageService;
