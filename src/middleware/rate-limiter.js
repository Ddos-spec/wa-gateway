/**
 * Rate Limiter Middleware
 * Prevents spam/abuse by limiting requests per IP/user
 */

class RateLimiter {
    constructor(redis, logger) {
        this.redis = redis;
        this.logger = logger;
        this.prefix = 'wa-gateway:rate-limit:';
    }

    /**
     * Create rate limiting middleware
     * @param {Object} options - Rate limiting options
     * @param {number} options.windowMs - Time window in milliseconds
     * @param {number} options.max - Maximum requests in window
     * @param {string} options.keyPrefix - Key prefix for this limiter
     * @param {string} options.message - Error message to show
     * @returns {Function} Express middleware
     */
    create(options = {}) {
        const {
            windowMs = 60000, // 1 minute default
            max = 5, // 5 requests per minute default
            keyPrefix = 'default',
            message = 'Too many requests, please try again later.'
        } = options;

        return async (req, res, next) => {
            try {
                // Get identifier (IP address or user ID)
                const identifier = req.session?.user?.id || req.ip || req.connection.remoteAddress;
                const key = `${this.prefix}${keyPrefix}:${identifier}`;

                // Get current count
                const current = await this.redis.client.get(key);
                const count = current ? parseInt(current, 10) : 0;

                if (count >= max) {
                    // Rate limit exceeded
                    this.logger.warn(
                        `Rate limit exceeded for ${identifier} on ${keyPrefix}`,
                        'RATE_LIMIT',
                        { identifier, keyPrefix, count, max }
                    );

                    return res.status(429).json({
                        status: 'error',
                        message: message,
                        retryAfter: Math.ceil(windowMs / 1000) // seconds
                    });
                }

                // Increment counter
                if (count === 0) {
                    // First request in window, set with expiry
                    await this.redis.client.setex(key, Math.ceil(windowMs / 1000), 1);
                } else {
                    // Increment existing counter
                    await this.redis.client.incr(key);
                }

                // Add rate limit headers
                res.setHeader('X-RateLimit-Limit', max);
                res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count - 1));

                next();

            } catch (error) {
                // On error, allow request (fail open)
                this.logger.error(
                    `Rate limiter error: ${error.message}`,
                    'RATE_LIMIT',
                    { error: error.stack }
                );
                next();
            }
        };
    }

    /**
     * Reset rate limit for specific key
     * @param {string} keyPrefix - Key prefix
     * @param {string} identifier - User/IP identifier
     */
    async reset(keyPrefix, identifier) {
        const key = `${this.prefix}${keyPrefix}:${identifier}`;
        await this.redis.client.del(key);
        this.logger.info(`Rate limit reset for ${identifier} on ${keyPrefix}`, 'RATE_LIMIT');
    }

    /**
     * Get current rate limit status
     * @param {string} keyPrefix - Key prefix
     * @param {string} identifier - User/IP identifier
     * @returns {Object} Status {count, limit, remaining}
     */
    async getStatus(keyPrefix, identifier, max) {
        const key = `${this.prefix}${keyPrefix}:${identifier}`;
        const current = await this.redis.client.get(key);
        const count = current ? parseInt(current, 10) : 0;

        return {
            count,
            limit: max,
            remaining: Math.max(0, max - count)
        };
    }
}

module.exports = RateLimiter;
