/**
 * Redis Session Storage
 *
 * Handles persistence of WhatsApp session data in Redis
 */

const redis = require('../../db/redis');
const { getLogger } = require('../utils/logger');

const logger = getLogger();

class RedisSessionStorage {
    constructor() {
        this.sessionPrefix = 'wa:session:';
        this.metadataPrefix = 'wa:metadata:';
        const timeoutDays = parseInt(process.env.SESSION_TIMEOUT_DAYS) || 30;
        this.defaultTTL = timeoutDays * 24 * 60 * 60; // 30 days default in seconds
    }

    /**
     * Save session state to Redis
     * @param {string} sessionId - Session ID
     * @param {Object} sessionData - Session data to save
     * @param {number} ttl - Time to live in seconds (optional)
     * @returns {Promise<boolean>}
     */
    async saveSessionState(sessionId, sessionData, ttl = null) {
        try {
            const key = `${this.sessionPrefix}${sessionId}`;
            await redis.saveSession(sessionId, sessionData, ttl || this.defaultTTL);

            logger.debug('Session state saved to Redis', 'REDIS_SESSION', {
                sessionId
            });

            return true;
        } catch (error) {
            logger.error('Failed to save session state', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get session state from Redis
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>}
     */
    async getSessionState(sessionId) {
        try {
            const sessionData = await redis.getSession(sessionId);

            if (sessionData) {
                logger.debug('Session state retrieved from Redis', 'REDIS_SESSION', {
                    sessionId
                });
            }

            return sessionData;
        } catch (error) {
            logger.error('Failed to get session state', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Delete session from Redis
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>}
     */
    async deleteSession(sessionId) {
        try {
            await redis.deleteSession(sessionId);

            // Also delete metadata
            await this.deleteMetadata(sessionId);

            logger.debug('Session deleted from Redis', 'REDIS_SESSION', {
                sessionId
            });

            return true;
        } catch (error) {
            logger.error('Failed to delete session', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Check if session exists in Redis
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>}
     */
    async sessionExists(sessionId) {
        try {
            const key = `${this.sessionPrefix}${sessionId}`;
            return await redis.exists(key);
        } catch (error) {
            logger.error('Failed to check session existence', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get all session IDs
     * @returns {Promise<Array<string>>}
     */
    async getAllSessionIds() {
        try {
            const sessionIds = await redis.getAllSessionIds();

            logger.debug('Retrieved all session IDs from Redis', 'REDIS_SESSION', {
                count: sessionIds.length
            });

            return sessionIds;
        } catch (error) {
            logger.error('Failed to get all session IDs', 'REDIS_SESSION', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Update session TTL
     * @param {string} sessionId - Session ID
     * @param {number} ttl - Time to live in seconds
     * @returns {Promise<boolean>}
     */
    async extendSessionTTL(sessionId, ttl = null) {
        try {
            await redis.extendSessionTTL(sessionId, ttl || this.defaultTTL);

            logger.debug('Session TTL extended', 'REDIS_SESSION', {
                sessionId,
                ttl: ttl || this.defaultTTL
            });

            return true;
        } catch (error) {
            logger.error('Failed to extend session TTL', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Save session metadata
     * @param {string} sessionId - Session ID
     * @param {Object} metadata - Metadata to save
     * @returns {Promise<boolean>}
     */
    async saveMetadata(sessionId, metadata) {
        try {
            const key = `${this.metadataPrefix}${sessionId}`;
            await redis.set(key, metadata, this.defaultTTL);

            logger.debug('Session metadata saved', 'REDIS_SESSION', {
                sessionId
            });

            return true;
        } catch (error) {
            logger.error('Failed to save session metadata', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get session metadata
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>}
     */
    async getMetadata(sessionId) {
        try {
            const key = `${this.metadataPrefix}${sessionId}`;
            return await redis.get(key);
        } catch (error) {
            logger.error('Failed to get session metadata', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Delete session metadata
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>}
     */
    async deleteMetadata(sessionId) {
        try {
            const key = `${this.metadataPrefix}${sessionId}`;
            await redis.del(key);

            return true;
        } catch (error) {
            logger.error('Failed to delete session metadata', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Save QR code for session
     * @param {string} sessionId - Session ID
     * @param {string} qrCode - QR code string
     * @returns {Promise<boolean>}
     */
    async saveQRCode(sessionId, qrCode) {
        try {
            const key = `wa:qr:${sessionId}`;
            await redis.set(key, qrCode, 300); // 5 minutes TTL

            logger.debug('QR code saved', 'REDIS_SESSION', { sessionId });

            return true;
        } catch (error) {
            logger.error('Failed to save QR code', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get QR code for session
     * @param {string} sessionId - Session ID
     * @returns {Promise<string|null>}
     */
    async getQRCode(sessionId) {
        try {
            const key = `wa:qr:${sessionId}`;
            return await redis.get(key);
        } catch (error) {
            logger.error('Failed to get QR code', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Save connection status
     * @param {string} sessionId - Session ID
     * @param {string} status - Connection status
     * @returns {Promise<boolean>}
     */
    async saveConnectionStatus(sessionId, status) {
        try {
            const key = `wa:status:${sessionId}`;
            await redis.set(key, status, this.defaultTTL);

            logger.debug('Connection status saved', 'REDIS_SESSION', {
                sessionId,
                status
            });

            return true;
        } catch (error) {
            logger.error('Failed to save connection status', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get connection status
     * @param {string} sessionId - Session ID
     * @returns {Promise<string|null>}
     */
    async getConnectionStatus(sessionId) {
        try {
            const key = `wa:status:${sessionId}`;
            return await redis.get(key);
        } catch (error) {
            logger.error('Failed to get connection status', 'REDIS_SESSION', {
                sessionId,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Get storage statistics
     * @returns {Object}
     */
    getStats() {
        return redis.getStats();
    }
}

// Create singleton instance
const redisSessionStorage = new RedisSessionStorage();

module.exports = redisSessionStorage;
