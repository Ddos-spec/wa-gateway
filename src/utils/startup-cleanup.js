/**
 * Startup Cleanup Utility
 * Cleans up orphaned pairing sessions on server startup
 */

class StartupCleanup {
    constructor(redis, logger) {
        this.redis = redis;
        this.logger = logger;
    }

    /**
     * Clean up expired/orphaned pairing sessions
     * Run this on server startup to prevent data pollution
     */
    async cleanupOrphanedPairingSessions() {
        try {
            this.logger.info('Running startup cleanup for orphaned pairing sessions...', 'STARTUP');

            // Find all pairing keys
            const pattern = 'wa-gateway:pairing:*';
            const keys = await this.redis.client.keys(pattern);

            if (keys.length === 0) {
                this.logger.info('No pairing sessions found. Nothing to clean up.', 'STARTUP');
                return {
                    cleaned: 0,
                    active: 0
                };
            }

            let cleanedCount = 0;
            let activeCount = 0;

            // Check each session
            for (const key of keys) {
                try {
                    const session = await this.redis.get(key);

                    if (!session) {
                        // Key exists but no data (corrupted)
                        await this.redis.client.del(key);
                        cleanedCount++;
                        this.logger.debug(`Cleaned corrupted session: ${key}`, 'STARTUP');
                        continue;
                    }

                    // Check if session is old and not CONNECTED
                    const createdAt = new Date(session.createdAt);
                    const ageMinutes = (Date.now() - createdAt.getTime()) / 60000;

                    // If older than 10 minutes and not CONNECTED, cleanup
                    if (ageMinutes > 10 && session.status !== 'CONNECTED') {
                        await this.redis.del(key);
                        cleanedCount++;
                        this.logger.debug(
                            `Cleaned orphaned session: ${session.sessionId} (age: ${ageMinutes.toFixed(1)} min, status: ${session.status})`,
                            'STARTUP'
                        );
                    } else {
                        activeCount++;
                    }

                } catch (error) {
                    this.logger.error(
                        `Error processing session ${key}: ${error.message}`,
                        'STARTUP',
                        { error: error.stack }
                    );
                }
            }

            this.logger.info(
                `Startup cleanup complete. Cleaned: ${cleanedCount}, Active: ${activeCount}`,
                'STARTUP'
            );

            return {
                cleaned: cleanedCount,
                active: activeCount
            };

        } catch (error) {
            this.logger.error(
                `Startup cleanup failed: ${error.message}`,
                'STARTUP',
                { error: error.stack }
            );

            // Don't throw - allow server to start even if cleanup fails
            return {
                cleaned: 0,
                active: 0,
                error: error.message
            };
        }
    }

    /**
     * Clean up rate limit keys (optional, for fresh start)
     */
    async cleanupRateLimitKeys() {
        try {
            const pattern = 'wa-gateway:rate-limit:*';
            const keys = await this.redis.client.keys(pattern);

            if (keys.length > 0) {
                await this.redis.client.del(...keys);
                this.logger.info(`Cleaned ${keys.length} rate limit keys`, 'STARTUP');
            }

            return keys.length;

        } catch (error) {
            this.logger.error(
                `Rate limit cleanup failed: ${error.message}`,
                'STARTUP'
            );
            return 0;
        }
    }

    /**
     * Run all cleanup tasks
     */
    async runAll() {
        this.logger.info('=== RUNNING STARTUP CLEANUP ===', 'STARTUP');

        const pairingResult = await this.cleanupOrphanedPairingSessions();

        // Don't clean rate limits on every startup (only if needed)
        // const rateLimitCount = await this.cleanupRateLimitKeys();

        this.logger.info('=== STARTUP CLEANUP COMPLETE ===', 'STARTUP', {
            pairingSessions: pairingResult
        });

        return pairingResult;
    }
}

module.exports = StartupCleanup;
