const { Boom } = require('@hapi/boom');

/**
 * Reconnection Strategy with Exponential Backoff
 * Handles intelligent reconnection logic for WhatsApp sessions
 */

class ReconnectStrategy {
    constructor(config = {}) {
        this.initialDelay = config.initialDelay || 5000;       // 5 seconds
        this.maxDelay = config.maxDelay || 60000;              // 60 seconds
        this.factor = config.factor || 2;                       // Exponential factor
        this.maxAttempts = config.maxAttempts || 10;           // Max attempts
        this.fatalStatusCodes = config.fatalStatusCodes || [401, 403, 428];

        // Post-pairing restart codes (EXPECTED disconnects after successful pairing)
        this.postPairingRestartCodes = config.postPairingRestartCodes || [515];
        this.postPairingWindow = config.postPairingWindow || 10000; // 10 seconds window after pairing

        // Track reconnection attempts per session
        this.retries = new Map();
        this.reconnectTimers = new Map();

        // Track pairing success timestamps for post-pairing detection
        this.pairingSuccessTimestamps = new Map();
    }

    /**
     * Mark pairing as successful for a session
     * This helps detect post-pairing expected disconnects (like error 515)
     * @param {string} sessionId - Session identifier
     */
    markPairingSuccess(sessionId) {
        this.pairingSuccessTimestamps.set(sessionId, Date.now());
    }

    /**
     * Check if disconnect is a post-pairing restart
     * Error 515 after successful pairing is EXPECTED - it means "restart required"
     * @param {string} sessionId - Session identifier
     * @param {number} statusCode - Disconnect status code
     * @returns {boolean} True if this is a post-pairing restart
     */
    isPostPairingRestart(sessionId, statusCode) {
        if (!this.postPairingRestartCodes.includes(statusCode)) {
            return false;
        }

        const pairingTime = this.pairingSuccessTimestamps.get(sessionId);
        if (!pairingTime) {
            return false;
        }

        const timeSincePairing = Date.now() - pairingTime;
        return timeSincePairing <= this.postPairingWindow;
    }

    /**
     * Determine if should reconnect based on error
     * @param {Object} lastDisconnect - Last disconnect info from Baileys
     * @param {string} sessionId - Session identifier (optional, for post-pairing detection)
     * @returns {Object} { shouldReconnect, reason, statusCode, isPostPairingRestart }
     */
    shouldReconnect(lastDisconnect, sessionId = null) {
        const statusCode = this._extractStatusCode(lastDisconnect);
        const reason = this._extractReason(lastDisconnect);

        // Check if it's a post-pairing restart (expected disconnect)
        const isPostPairingRestart = sessionId ?
            this.isPostPairingRestart(sessionId, statusCode) : false;

        // Check if it's a fatal error
        const isFatal = this.fatalStatusCodes.includes(statusCode);

        return {
            shouldReconnect: !isFatal,
            reason,
            statusCode,
            isFatal,
            isPostPairingRestart
        };
    }

    /**
     * Schedule reconnection with exponential backoff
     * @param {string} sessionId - Session identifier
     * @param {Function} reconnectFn - Function to call for reconnection
     * @param {Object} options - Options { isPostPairingRestart: boolean }
     * @returns {Object} { delay, attempt }
     */
    scheduleReconnect(sessionId, reconnectFn, options = {}) {
        const { isPostPairingRestart = false } = options;

        // Get current retry count
        const attempt = this.getRetryCount(sessionId);

        // Check if max attempts reached (skip for post-pairing restart)
        if (!isPostPairingRestart && attempt >= this.maxAttempts) {
            return {
                scheduled: false,
                reason: 'Max reconnection attempts reached',
                attempt
            };
        }

        // Calculate delay
        let delay;
        if (isPostPairingRestart) {
            // IMMEDIATE reconnect for post-pairing (< 100ms)
            delay = 50; // 50ms minimal delay for safety
        } else {
            // Normal exponential backoff
            delay = this.calculateDelay(attempt);
        }

        // Clear any existing timer
        this.cancelScheduledReconnect(sessionId);

        // Schedule reconnection
        const timer = setTimeout(async () => {
            try {
                await reconnectFn();
                // On success, reset retry count and clear pairing timestamp
                this.resetRetries(sessionId);
                this.pairingSuccessTimestamps.delete(sessionId);
            } catch (error) {
                // On failure, increment will happen on next call
                console.error(`Reconnection failed for ${sessionId}:`, error.message);
            } finally {
                // Clean up timer reference
                this.reconnectTimers.delete(sessionId);
            }
        }, delay);

        // Store timer reference
        this.reconnectTimers.set(sessionId, timer);

        // Increment retry count (but don't count post-pairing restart as retry)
        if (!isPostPairingRestart) {
            this.incrementRetries(sessionId);
        }

        return {
            scheduled: true,
            delay,
            attempt: isPostPairingRestart ? 0 : attempt + 1,
            isPostPairingRestart
        };
    }

    /**
     * Calculate delay with exponential backoff
     * @param {number} attempt - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateDelay(attempt) {
        const delay = this.initialDelay * Math.pow(this.factor, attempt);
        return Math.min(delay, this.maxDelay);
    }

    /**
     * Get current retry count for session
     * @param {string} sessionId - Session identifier
     * @returns {number} Retry count
     */
    getRetryCount(sessionId) {
        return this.retries.get(sessionId) || 0;
    }

    /**
     * Increment retry count for session
     * @param {string} sessionId - Session identifier
     */
    incrementRetries(sessionId) {
        const current = this.getRetryCount(sessionId);
        this.retries.set(sessionId, current + 1);
    }

    /**
     * Reset retry count for session
     * @param {string} sessionId - Session identifier
     */
    resetRetries(sessionId) {
        this.retries.delete(sessionId);
    }

    /**
     * Cancel scheduled reconnection
     * @param {string} sessionId - Session identifier
     */
    cancelScheduledReconnect(sessionId) {
        const timer = this.reconnectTimers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(sessionId);
        }
    }

    /**
     * Check if reconnection is scheduled
     * @param {string} sessionId - Session identifier
     * @returns {boolean} True if scheduled
     */
    isReconnectScheduled(sessionId) {
        return this.reconnectTimers.has(sessionId);
    }

    /**
     * Get reconnection status
     * @param {string} sessionId - Session identifier
     * @returns {Object} Status information
     */
    getStatus(sessionId) {
        return {
            attempts: this.getRetryCount(sessionId),
            maxAttempts: this.maxAttempts,
            isScheduled: this.isReconnectScheduled(sessionId),
            nextDelay: this.calculateDelay(this.getRetryCount(sessionId))
        };
    }

    /**
     * Clean up session data
     * @param {string} sessionId - Session identifier
     */
    cleanup(sessionId) {
        this.cancelScheduledReconnect(sessionId);
        this.resetRetries(sessionId);
        this.pairingSuccessTimestamps.delete(sessionId);
    }

    /**
     * Clean up all sessions
     */
    cleanupAll() {
        // Cancel all timers
        for (const [sessionId] of this.reconnectTimers) {
            this.cancelScheduledReconnect(sessionId);
        }

        // Clear retry counts and pairing timestamps
        this.retries.clear();
        this.pairingSuccessTimestamps.clear();
    }

    /**
     * Extract status code from lastDisconnect
     * @private
     */
    _extractStatusCode(lastDisconnect) {
        if (!lastDisconnect?.error) return 0;

        if (lastDisconnect.error instanceof Boom) {
            return lastDisconnect.error.output.statusCode;
        }

        return 0;
    }

    /**
     * Extract reason from lastDisconnect
     * @private
     */
    _extractReason(lastDisconnect) {
        if (!lastDisconnect?.error) return 'Unknown';

        try {
            const boom = new Boom(lastDisconnect.error);
            return boom.output?.payload?.error || 'Unknown';
        } catch (e) {
            return lastDisconnect.error.message || 'Unknown';
        }
    }

    /**
     * Get statistics
     * @returns {Object} Reconnection statistics
     */
    getStats() {
        const stats = {
            totalSessions: this.retries.size,
            scheduledReconnects: this.reconnectTimers.size,
            sessions: []
        };

        for (const [sessionId, attempts] of this.retries) {
            stats.sessions.push({
                sessionId,
                attempts,
                isScheduled: this.isReconnectScheduled(sessionId),
                nextDelay: this.calculateDelay(attempts)
            });
        }

        return stats;
    }
}

module.exports = ReconnectStrategy;
