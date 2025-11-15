const { jidNormalizedUser, downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { formatPhoneNumber, toWhatsAppJid, isValidJid } = require('../../phone-utils');

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
     * @returns {Object} Message result
     */
    async sendText(sessionId, to, text) {
        this.validateSession(sessionId);
        const jid = this._normalizeJid(to);
        const sock = this.sessionManager.sessions.get(sessionId).sock;

        try {
            const result = await sock.sendMessage(jid, { text });
            this.logger.info(`Text message sent to ${jid}`, 'MESSAGING', { sessionId });
            return { status: 'success', messageId: result.key.id, to: jid };
        } catch (error) {
            this.logger.error(`Failed to send message to ${jid}`, 'MESSAGING', { sessionId, error: error.message });
            throw error;
        }
    }

    /**
     * Send an image message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {string} imageUrl - Image URL
     * @param {string} caption - Optional caption
     * @returns {Object} Message result
     */
    async sendImage(sessionId, to, imageUrl, caption = '') {
        this.validateSession(sessionId);
        const jid = this._normalizeJid(to);
        const sock = this.sessionManager.sessions.get(sessionId).sock;

        try {
            const messageContent = {
                image: { url: imageUrl },
                caption: caption,
            };
            const result = await sock.sendMessage(jid, messageContent);
            this.logger.info(`Image message sent to ${jid}`, 'MESSAGING', { sessionId });
            return { status: 'success', messageId: result.key.id, to: jid };
        } catch (error) {
            this.logger.error(`Failed to send image to ${jid}`, 'MESSAGING', { sessionId, error: error.message });
            throw error;
        }
    }

    /**
     * Send a video message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {string} videoUrl - Video URL
     * @param {string} caption - Optional caption
     * @returns {Object} Message result
     */
    async sendVideo(sessionId, to, videoUrl, caption = '') {
        this.validateSession(sessionId);
        const jid = this._normalizeJid(to);
        const sock = this.sessionManager.sessions.get(sessionId).sock;

        try {
            const messageContent = {
                video: { url: videoUrl },
                caption: caption,
            };
            const result = await sock.sendMessage(jid, messageContent);
            this.logger.info(`Video message sent to ${jid}`, 'MESSAGING', { sessionId });
            return { status: 'success', messageId: result.key.id, to: jid };
        } catch (error) {
            this.logger.error(`Failed to send video to ${jid}`, 'MESSAGING', { sessionId, error: error.message });
            throw error;
        }
    }

    /**
     * Send an audio message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {string} audioUrl - Audio URL
     * @returns {Object} Message result
     */
    async sendAudio(sessionId, to, audioUrl) {
        this.validateSession(sessionId);
        const jid = this._normalizeJid(to);
        const sock = this.sessionManager.sessions.get(sessionId).sock;

        try {
            const result = await sock.sendMessage(jid, {
                audio: { url: audioUrl },
                mimetype: 'audio/mp4',
            });
            this.logger.info(`Audio message sent to ${jid}`, 'MESSAGING', { sessionId });
            return { status: 'success', messageId: result.key.id, to: jid };
        } catch (error) {
            this.logger.error(`Failed to send audio to ${jid}`, 'MESSAGING', { sessionId, error: error.message });
            throw error;
        }
    }

    /**
     * Send a document message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {string} documentUrl - Document URL
     * @param {string} filename - Document filename
     * @param {string} mimetype - Document MIME type
     * @returns {Object} Message result
     */
    async sendDocument(sessionId, to, documentUrl, filename, mimetype) {
        this.validateSession(sessionId);
        const jid = this._normalizeJid(to);
        const sock = this.sessionManager.sessions.get(sessionId).sock;

        try {
            const messageContent = {
                document: { url: documentUrl },
                fileName: filename,
                mimetype: mimetype,
            };
            const result = await sock.sendMessage(jid, messageContent);
            this.logger.info(`Document sent to ${jid}`, 'MESSAGING', { sessionId });
            return { status: 'success', messageId: result.key.id, to: jid };
        } catch (error) {
            this.logger.error(`Failed to send document to ${jid}`, 'MESSAGING', { sessionId, error: error.message });
            throw error;
        }
    }

    /**
     * Send a sticker message
     * @param {string} sessionId - Session identifier
     * @param {string} to - Recipient JID or phone number
     * @param {string} stickerUrl - Sticker URL
     * @returns {Object} Message result
     */
    async sendSticker(sessionId, to, stickerUrl) {
        this.validateSession(sessionId);
        const jid = this._normalizeJid(to);
        const sock = this.sessionManager.sessions.get(sessionId).sock;

        try {
            const result = await sock.sendMessage(jid, {
                sticker: { url: stickerUrl },
            });
            this.logger.info(`Sticker sent to ${jid}`, 'MESSAGING', { sessionId });
            return { status: 'success', messageId: result.key.id, to: jid };
        } catch (error) {
            this.logger.error(`Failed to send sticker to ${jid}`, 'MESSAGING', { sessionId, error: error.message });
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
        this.validateSession(sessionId);
        const sock = this.sessionManager.sessions.get(sessionId).sock;

        try {
            await sock.sendMessage(messageKey.remoteJid, { delete: messageKey });
            this.logger.info(`Message deleted: ${messageKey.id}`, 'MESSAGING', { sessionId });
            return { status: 'success', messageId: messageKey.id };
        } catch (error) {
            this.logger.error(`Failed to delete message: ${error.message}`, 'MESSAGING', { sessionId });
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
                    logger: this.logger.pino, // Assuming pino logger instance
                    reuploadRequest: (m) => new Promise((resolve) => resolve(m)),
                }
            );
            return buffer;
        } catch (error) {
            this.logger.error(`Failed to download media: ${error.message}`, 'MESSAGING');
            throw error;
        }
    }

    /**
     * Get message statistics
     * @returns {Object} Message statistics
     */
    getStats() {
        return {
            service: 'MessageService',
            status: 'operational',
            mediaDir: this.mediaDir,
        };
    }

    /**
     * Normalize JID (convert phone number to JID)
     * @private
     */
    _normalizeJid(identifier) {
        if (isValidJid(identifier)) {
            return identifier;
        }
        const formatted = formatPhoneNumber(identifier);
        if (formatted) {
            return toWhatsAppJid(formatted);
        }
        throw new Error('Invalid recipient JID');
    }

    /**
     * Validate session is connected
     * @param {string} sessionId - Session identifier
     * @throws {Error} If session not connected
     */
    validateSession(sessionId) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session || !session.isConnected) {
            throw new Error('Session not found or not connected');
        }
    }
}

module.exports = MessageService;
