/**
 * Redis Connection Manager
 *
 * Handles Redis connection and provides methods for session persistence and caching
 */

const Redis = require('ioredis');
const { getLogger } = require('../src/utils/logger');

class RedisConnection {
    constructor() {
        this.client = null;
        this.logger = getLogger();
        this.isConnected = false;
        this.sessionPrefix = process.env.REDIS_SESSION_PREFIX || 'wa-gateway:session:';
        const timeoutDays = parseInt(process.env.SESSION_TIMEOUT_DAYS) || 30;
        this.sessionTTL = timeoutDays * 24 * 60 * 60; // 30 days default in seconds
    }

    /**
     * Initialize Redis connection
     */
    async connect() {
        try {
            // Use REDIS_URL if available, otherwise construct from individual params
            const connectionConfig = process.env.REDIS_URL ?
                process.env.REDIS_URL : {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    password: process.env.REDIS_PASSWORD,
                    db: parseInt(process.env.REDIS_DB) || 0,
                };

            this.client = new Redis(connectionConfig, {
                maxRetriesPerRequest: 3,
                enableReadyCheck: true,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                }
            });

            // Event handlers
            this.client.on('connect', () => {
                this.logger.info('Redis client connected', 'REDIS');
            });

            this.client.on('ready', () => {
                this.isConnected = true;
                this.logger.info('Redis client ready', 'REDIS');
            });

            this.client.on('error', (error) => {
                this.logger.error('Redis client error', 'REDIS', {
                    error: error.message
                });
            });

            this.client.on('close', () => {
                this.isConnected = false;
                this.logger.warn('Redis connection closed', 'REDIS');
            });

            this.client.on('reconnecting', () => {
                this.logger.info('Redis client reconnecting', 'REDIS');
            });

            // Wait for connection to be ready
            await new Promise((resolve, reject) => {
                this.client.once('ready', resolve);
                this.client.once('error', reject);

                // Timeout after 5 seconds
                setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
            });

            // Test the connection
            await this.client.ping();

            this.logger.info('Redis connection established successfully', 'REDIS');
            return true;

        } catch (error) {
            this.logger.error('Failed to connect to Redis', 'REDIS', {
                error: error.message,
                stack: error.stack
            });
            this.isConnected = false;
            throw error;
        }
    }

    // ==================== SESSION MANAGEMENT ====================

    /**
     * Save WhatsApp session data to Redis
     * @param {string} sessionId - Session identifier
     * @param {Object} sessionData - Session data to store
     * @param {number} ttl - Time to live in seconds (optional)
     */
    async saveSession(sessionId, sessionData, ttl = null) {
        try {
            const key = `${this.sessionPrefix}${sessionId}`;
            const value = JSON.stringify(sessionData);
            const expiryTime = ttl || this.sessionTTL;

            await this.client.setex(key, expiryTime, value);

            this.logger.debug('Session saved to Redis', 'REDIS', {
                sessionId,
                ttl: expiryTime
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to save session', 'REDIS', {
                sessionId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get WhatsApp session data from Redis
     * @param {string} sessionId - Session identifier
     * @returns {Promise<Object|null>} Session data or null if not found
     */
    async getSession(sessionId) {
        try {
            const key = `${this.sessionPrefix}${sessionId}`;
            const value = await this.client.get(key);

            if (!value) {
                return null;
            }

            return JSON.parse(value);
        } catch (error) {
            this.logger.error('Failed to get session', 'REDIS', {
                sessionId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete WhatsApp session from Redis
     * @param {string} sessionId - Session identifier
     */
    async deleteSession(sessionId) {
        try {
            const key = `${this.sessionPrefix}${sessionId}`;
            await this.client.del(key);

            this.logger.debug('Session deleted from Redis', 'REDIS', {
                sessionId
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to delete session', 'REDIS', {
                sessionId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get all session IDs
     * @returns {Promise<Array<string>>} Array of session IDs
     */
    async getAllSessionIds() {
        try {
            const pattern = `${this.sessionPrefix}*`;
            const keys = await this.client.keys(pattern);

            // Remove prefix from keys to get session IDs
            const sessionIds = keys.map(key => key.replace(this.sessionPrefix, ''));

            return sessionIds;
        } catch (error) {
            this.logger.error('Failed to get all session IDs', 'REDIS', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update session TTL (extend expiration)
     * @param {string} sessionId - Session identifier
     * @param {number} ttl - Time to live in seconds
     */
    async extendSessionTTL(sessionId, ttl = null) {
        try {
            const key = `${this.sessionPrefix}${sessionId}`;
            const expiryTime = ttl || this.sessionTTL;

            await this.client.expire(key, expiryTime);

            this.logger.debug('Session TTL extended', 'REDIS', {
                sessionId,
                ttl: expiryTime
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to extend session TTL', 'REDIS', {
                sessionId,
                error: error.message
            });
            throw error;
        }
    }

    // ==================== CACHING ====================

    /**
     * Set a cache value
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttl - Time to live in seconds (optional)
     */
    async set(key, value, ttl = null) {
        try {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

            if (ttl) {
                await this.client.setex(key, ttl, stringValue);
            } else {
                await this.client.set(key, stringValue);
            }

            return true;
        } catch (error) {
            this.logger.error('Failed to set cache', 'REDIS', {
                key,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get a cache value
     * @param {string} key - Cache key
     * @returns {Promise<any>} Cached value or null
     */
    async get(key) {
        try {
            const value = await this.client.get(key);

            if (!value) {
                return null;
            }

            // Try to parse as JSON, if fails return as string
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        } catch (error) {
            this.logger.error('Failed to get cache', 'REDIS', {
                key,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete a cache key
     * @param {string} key - Cache key
     */
    async del(key) {
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            this.logger.error('Failed to delete cache', 'REDIS', {
                key,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Check if key exists
     * @param {string} key - Cache key
     * @returns {Promise<boolean>}
     */
    async exists(key) {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            this.logger.error('Failed to check key existence', 'REDIS', {
                key,
                error: error.message
            });
            throw error;
        }
    }

    // ==================== UTILITIES ====================

    /**
     * Ping Redis server
     * @returns {Promise<string>} "PONG" if successful
     */
    async ping() {
        try {
            return await this.client.ping();
        } catch (error) {
            this.logger.error('Redis ping failed', 'REDIS', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get Redis server info
     * @returns {Promise<Object>}
     */
    async getInfo() {
        try {
            const info = await this.client.info();
            return info;
        } catch (error) {
            this.logger.error('Failed to get Redis info', 'REDIS', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Check if Redis connection is healthy
     * @returns {Promise<boolean>}
     */
    async healthCheck() {
        try {
            const result = await this.ping();
            return result === 'PONG';
        } catch (error) {
            this.logger.error('Redis health check failed', 'REDIS', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get connection stats
     * @returns {Object}
     */
    getStats() {
        return {
            connected: this.isConnected,
            status: this.client ? this.client.status : 'disconnected'
        };
    }

    /**
     * Close Redis connection
     */
    async close() {
        try {
            if (this.client) {
                await this.client.quit();
                this.isConnected = false;
                this.logger.info('Redis connection closed', 'REDIS');
            }
        } catch (error) {
            this.logger.error('Error closing Redis connection', 'REDIS', {
                error: error.message
            });
            throw error;
        }
    }
}

// Create a singleton instance
const redisConnection = new RedisConnection();

module.exports = redisConnection;
