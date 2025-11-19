import logger from "../utils/logger.js";
import messages from "../config/messages.js";

class MessageService {
    constructor(client) {
        this.client = client;

        // Group metadata cache to avoid repeated fetches
        this.groupMetadataCache = new Map();
        this.metadataCacheTimeout = 300000; // 5 minutes

        // Message rate limiting to prevent session conflicts
        this.lastMessageTime = new Map();
        this.messageDelay = 300; // 300ms delay between messages

        // Start cache cleanup interval
        this.startCacheCleanup();
    }

    /**
     * Wait before sending message to prevent session conflicts
     */
    async waitBeforeSend(to) {
        const lastTime = this.lastMessageTime.get(to) || 0;
        const now = Date.now();
        const timeSinceLastMessage = now - lastTime;

        if (timeSinceLastMessage < this.messageDelay) {
            const waitTime = this.messageDelay - timeSinceLastMessage;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastMessageTime.set(to, Date.now());
    }

    /**
     * Start cache cleanup interval
     */
    startCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [jid, data] of this.groupMetadataCache.entries()) {
                if (now - data.timestamp > this.metadataCacheTimeout) {
                    this.groupMetadataCache.delete(jid);
                }
            }
        }, 60000); // Cleanup every minute
    }

    /**
     * Send a text message
     */
    async sendText(to, text, options = {}) {
        try {
            if (!to || !text) {
                throw new Error('Missing required parameters: to or text');
            }

            await this.waitBeforeSend(to);

            return await Promise.race([
                this.client.sendMessage(to, { text }, options),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Send message timeout')), 30000)
                )
            ]);
        } catch (error) {
            logger.error(`Failed to send text to ${to}:`, error.message);

            // Fallback: try without options
            try {
                return await this.client.sendMessage(to, { text });
            } catch (fallbackError) {
                throw error;
            }
        }
    }

    /**
     * Reply to a message
     */
    async reply(from, content, quotedMsg) {
        try {
            return await this.sendTextDirect(from, content, { quoted: quotedMsg });
        } catch (error) {
            logger.warn('Fallback: Sending reply without quote');
            return await this.sendTextDirect(from, content);
        }
    }

    /**
     * Send text directly
     */
    async sendTextDirect(to, text, options = {}) {
        try {
            await this.waitBeforeSend(to);

            return await Promise.race([
                this.client.sendMessage(to, { text }, options),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Send timeout')), 30000)
                )
            ]);
        } catch (error) {
            if (options.quoted) {
                logger.warn('Retrying without quoted message');
                try {
                    return await this.client.sendMessage(to, { text });
                } catch (retryError) {
                    throw retryError;
                }
            }
            throw error;
        }
    }

    /**
     * Send image
     */
    async sendImage(to, buffer, caption = "", options = {}) {
        try {
            if (!buffer || !Buffer.isBuffer(buffer)) {
                throw new Error('Invalid image buffer');
            }

            await this.waitBeforeSend(to);

            return await Promise.race([
                this.client.sendMessage(to, { image: buffer, caption }, options),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Send image timeout')), 30000)
                )
            ]);
        } catch (error) {
            logger.error(`Failed to send image to ${to}:`, error.message);

            // Fallback: send caption as text
            if (caption) {
                return await this.sendText(to, `🖼️ ${caption}\n\n_Gambar gagal dikirim_`);
            }
            throw error;
        }
    }

    /**
     * Send contact
     */
    async sendContact(to, numbers, name, quoted = null) {
        try {
            if (!Array.isArray(numbers) || numbers.length === 0) {
                throw new Error('Invalid phone numbers');
            }

            await this.waitBeforeSend(to);

            const contacts = numbers.map(num => ({
                displayName: name,
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${name}\nFN:${name}\nitem1.TEL;waid=${num}:${num}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
            }));

            return await Promise.race([
                this.client.sendMessage(to, {
                    contacts: { displayName: name, contacts }
                }, { quoted }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Send contact timeout')), 20000)
                )
            ]);
        } catch (error) {
            logger.error(`Failed to send contact:`, error.message);

            // Fallback: send as text
            const contactText = `📞 *Kontak: ${name}*\n${numbers.map(num => `• ${num}`).join('\n')}`;
            return await this.sendText(to, contactText);
        }
    }

    /**
     * Send mentions
     */
    async sendMentions(to, text, mentions = [], options = {}) {
        try {
            await this.waitBeforeSend(to);

            return await Promise.race([
                this.client.sendMessage(to, { text, mentions }, options),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Send mentions timeout')), 20000)
                )
            ]);
        } catch (error) {
            logger.warn('Fallback: Sending as regular text without mentions');
            return await this.sendText(to, text);
        }
    }

    /**
     * Send welcome message
     */
    async sendWelcome(groupId, newMember, groupName) {
        const welcomeText = messages.welcome.join(
            newMember.split("@")[0],
            groupName
        );

        return await this.sendMentionsDirect(groupId, welcomeText, [newMember], {
            footer: groupName
        });
    }

    /**
     * Send goodbye message
     */
    async sendGoodbye(groupId, leftMember, groupName) {
        const goodbyeText = messages.welcome.leave(
            leftMember.split("@")[0],
            groupName
        );

        return await this.sendMentionsDirect(groupId, goodbyeText, [leftMember], {
            footer: groupName
        });
    }

    /**
     * Send promotion message
     */
    async sendPromotion(groupId, promotedMember, groupName) {
        const promoteText = messages.welcome.promote(
            promotedMember.split("@")[0],
            groupName
        );

        return await this.sendMentionsDirect(groupId, promoteText, [promotedMember], {
            footer: groupName
        });
    }

    /**
     * Send demotion message
     */
    async sendDemotion(groupId, demotedMember, groupName) {
        const demoteText = messages.welcome.demote(
            demotedMember.split("@")[0],
            groupName
        );

        return await this.sendMentionsDirect(groupId, demoteText, [demotedMember], {
            footer: groupName
        });
    }

    /**
     * Send mentions directly
     */
    async sendMentionsDirect(to, text, mentions = [], options = {}) {
        try {
            await this.waitBeforeSend(to);

            return await this.client.sendMessage(to, {
                text,
                mentions
            }, options);
        } catch (error) {
            logger.error(`Failed to send mentions:`, error.message);
            throw error;
        }
    }

    /**
     * Send error message
     */
    async sendError(to, errorType = 'general', quotedMsg = null) {
        try {
            const errorMessage = messages.errors?.[errorType] || messages.errors?.general ||
                               "❌ Terjadi kesalahan. Silakan coba lagi.";
            return await this.sendTextDirect(to, errorMessage, { quoted: quotedMsg });
        } catch (error) {
            return await this.sendTextDirect(to, "❌ Terjadi kesalahan sistem.");
        }
    }

    /**
     * Send restriction message
     */
    async sendRestriction(to, restrictionType, quotedMsg = null) {
        const restrictionMessage = messages.restrictions[restrictionType];
        if (restrictionMessage) {
            return await this.sendTextDirect(to, restrictionMessage, { quoted: quotedMsg });
        }
    }

    /**
     * Send wait message
     */
    async sendWait(to, quotedMsg = null) {
        try {
            const waitMessage = messages.wait || "⏳ Tunggu sebentar...";
            return await this.sendTextDirect(to, waitMessage, { quoted: quotedMsg });
        } catch (error) {
            return await this.sendTextDirect(to, "⏳ Proses...");
        }
    }

    /**
     * Send media
     */
    async sendMedia(to, mediaBuffer, mediaType, options = {}) {
        try {
            await this.waitBeforeSend(to);

            const mediaObject = {};
            mediaObject[mediaType] = mediaBuffer;

            return await this.client.sendMessage(to, mediaObject, options);
        } catch (error) {
            logger.error(`Failed to send ${mediaType}:`, error.message);
            throw error;
        }
    }

    /**
     * Send video
     */
    async sendVideo(to, buffer, caption = "", options = {}) {
        try {
            await this.waitBeforeSend(to);

            return await this.client.sendMessage(to, {
                video: buffer,
                caption
            }, options);
        } catch (error) {
            logger.error(`Failed to send video:`, error.message);
            throw error;
        }
    }

    /**
     * Send audio
     */
    async sendAudio(to, buffer, options = {}) {
        try {
            await this.waitBeforeSend(to);

            return await this.client.sendMessage(to, {
                audio: buffer,
                mimetype: 'audio/mp4'
            }, options);
        } catch (error) {
            logger.error(`Failed to send audio:`, error.message);
            throw error;
        }
    }

    /**
     * Send sticker
     */
    async sendSticker(to, buffer, options = {}) {
        try {
            await this.waitBeforeSend(to);

            return await this.client.sendMessage(to, {
                sticker: buffer
            }, options);
        } catch (error) {
            logger.error(`Failed to send sticker:`, error.message);
            throw error;
        }
    }

    /**
     * Send document
     */
    async sendDocument(to, buffer, filename, mimetype, options = {}) {
        try {
            await this.waitBeforeSend(to);

            return await this.client.sendMessage(to, {
                document: buffer,
                fileName: filename,
                mimetype: mimetype
            }, options);
        } catch (error) {
            logger.error(`Failed to send document:`, error.message);
            throw error;
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const botInfo = await this.client.user;
            return {
                status: 'healthy',
                botId: botInfo?.id,
                timestamp: new Date()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date()
            };
        }
    }
}

export default MessageService;
