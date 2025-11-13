/**
 * Webhook Handler for Incoming WhatsApp Messages
 * Filters and processes messages based on session settings
 */

class WebhookHandler {
    constructor(webhookQueue, logger, getWebhookUrlFn) {
        this.webhookQueue = webhookQueue;
        this.logger = logger;
        this.getWebhookUrl = getWebhookUrlFn;

        // Message type to setting key mapping
        this.typeFilterMap = {
            'imageMessage': 'save_image',
            'videoMessage': 'save_video',
            'audioMessage': 'save_audio',
            'stickerMessage': 'save_sticker',
            'documentMessage': 'save_document',
            'documentWithCaptionMessage': 'save_document'
        };
    }

    /**
     * Handle incoming WhatsApp message
     * @param {Object} message - Message from Baileys
     * @param {string} sessionId - Session identifier
     * @param {Object} session - Session object with settings
     */
    async handleMessage(message, sessionId, session) {
        try {
            // Validate inputs
            if (!session) {
                this.logger.debug(`No session found for ${sessionId}`, sessionId);
                return;
            }

            const settings = session.settings || {};

            // Check if webhooks are configured
            const hasWebhooks = settings.webhooks && settings.webhooks.length > 0;
            const defaultWebhookUrl = await this.getWebhookUrl(sessionId);

            if (!hasWebhooks && !defaultWebhookUrl) {
                // No webhooks configured, skip
                return;
            }

            // Extract message
            const msg = message.messages[0];
            if (!msg.message) {
                // Empty message, notification, or status update
                return;
            }

            // Apply filters
            const shouldProcess = this._applyFilters(msg, settings);
            if (!shouldProcess.allowed) {
                this.logger.debug(
                    `Message filtered out: ${shouldProcess.reason}`,
                    sessionId
                );
                return;
            }

            // Build payload
            const payload = this._buildPayload(msg, sessionId);

            // Get all webhook URLs
            const webhookUrls = this._getWebhookUrls(settings, defaultWebhookUrl);

            // Send to all configured webhooks
            for (const url of webhookUrls) {
                await this.webhookQueue.add(url, payload);
            }

            this.logger.info(
                `Message from ${payload.from} queued for ${webhookUrls.length} webhook(s)`,
                sessionId
            );

        } catch (error) {
            this.logger.error(
                `Error handling webhook for message: ${error.message}`,
                sessionId,
                { error: error.stack }
            );
        }
    }

    /**
     * Apply filters to determine if message should be processed
     * @private
     */
    _applyFilters(msg, settings) {
        const fromMe = msg.key.fromMe;
        const isGroup = msg.key.remoteJid.endsWith('@g.us');
        const messageType = Object.keys(msg.message)[0];

        // Filter 1: fromMe
        if (fromMe && !settings.webhook_from_me) {
            return { allowed: false, reason: 'fromMe filtered' };
        }

        // Filter 2: Group messages
        if (isGroup && !settings.webhook_group) {
            return { allowed: false, reason: 'group message filtered' };
        }

        // Filter 3: Individual messages
        if (!isGroup && !settings.webhook_individual) {
            return { allowed: false, reason: 'individual message filtered' };
        }

        // Filter 4: Message type
        const settingKeyForType = this.typeFilterMap[messageType];
        if (settingKeyForType && settings[settingKeyForType] === false) {
            return { allowed: false, reason: `${messageType} filtered` };
        }

        return { allowed: true };
    }

    /**
     * Build webhook payload
     * @private
     */
    _buildPayload(msg, sessionId) {
        return {
            event: 'message',
            sessionId,
            from: msg.key.remoteJid,
            fromMe: msg.key.fromMe,
            isGroup: msg.key.remoteJid.endsWith('@g.us'),
            messageId: msg.key.id,
            timestamp: msg.messageTimestamp,
            data: msg
        };
    }

    /**
     * Get all webhook URLs (session-specific + default)
     * @private
     */
    _getWebhookUrls(settings, defaultWebhookUrl) {
        const urls = [];

        // Add session-specific webhooks
        if (settings.webhooks && Array.isArray(settings.webhooks)) {
            urls.push(...settings.webhooks);
        }

        // Add default webhook if not already included
        if (defaultWebhookUrl && !urls.includes(defaultWebhookUrl)) {
            urls.push(defaultWebhookUrl);
        }

        return urls;
    }

    /**
     * Get filter statistics for a session
     * @param {Object} settings - Session settings
     * @returns {Object} Filter configuration
     */
    getFilterConfig(settings = {}) {
        return {
            fromMe: settings.webhook_from_me || false,
            group: settings.webhook_group || false,
            individual: settings.webhook_individual || false,
            mediaTypes: {
                image: settings.save_image || false,
                video: settings.save_video || false,
                audio: settings.save_audio || false,
                sticker: settings.save_sticker || false,
                document: settings.save_document || false
            },
            webhookCount: (settings.webhooks || []).length
        };
    }
}

module.exports = WebhookHandler;
