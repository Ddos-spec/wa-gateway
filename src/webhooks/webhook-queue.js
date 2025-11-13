const axios = require('axios');

/**
 * Webhook Queue with Retry Mechanism
 * Non-blocking webhook delivery with automatic retries
 */

class WebhookQueue {
    constructor(logger, options = {}) {
        this.logger = logger;
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 2000;           // 2 seconds
        this.timeout = options.timeout || 10000;                 // 10 seconds
        this.concurrency = options.concurrency || 5;             // Max 5 concurrent requests

        this.queue = [];
        this.processing = false;
        this.activeRequests = 0;

        // Statistics
        this.stats = {
            total: 0,
            success: 0,
            failed: 0,
            retried: 0
        };
    }

    /**
     * Add webhook to queue
     * @param {string} url - Webhook URL
     * @param {Object} payload - Webhook payload
     * @param {Object} options - Additional options
     */
    async add(url, payload, options = {}) {
        const webhookTask = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            url,
            payload,
            attempts: 0,
            maxRetries: options.maxRetries || this.maxRetries,
            addedAt: new Date().toISOString(),
            sessionId: payload.sessionId || 'unknown'
        };

        this.queue.push(webhookTask);
        this.stats.total++;

        this.logger.debug(`Webhook queued: ${url}`, webhookTask.sessionId, {
            queueSize: this.queue.length
        });

        // Start processing if not already running
        if (!this.processing) {
            this.process();
        }
    }

    /**
     * Process webhook queue
     * @private
     */
    async process() {
        if (this.processing) return;

        this.processing = true;

        while (this.queue.length > 0 || this.activeRequests > 0) {
            // Wait if we've reached concurrency limit
            if (this.activeRequests >= this.concurrency) {
                await this._sleep(100);
                continue;
            }

            // Get next task
            const task = this.queue.shift();
            if (!task) {
                await this._sleep(100);
                continue;
            }

            // Process task without blocking
            this._processTask(task);
        }

        this.processing = false;
    }

    /**
     * Process individual webhook task
     * @private
     */
    async _processTask(task) {
        this.activeRequests++;

        try {
            await this._sendWebhook(task);
            this.stats.success++;

            this.logger.debug(`Webhook sent successfully: ${task.url}`, task.sessionId);

        } catch (error) {
            task.attempts++;

            if (task.attempts < task.maxRetries) {
                // Retry
                this.logger.warn(
                    `Webhook failed (attempt ${task.attempts}/${task.maxRetries}): ${error.message}`,
                    task.sessionId
                );

                this.stats.retried++;

                // Add back to queue after delay
                setTimeout(() => {
                    this.queue.push(task);
                    if (!this.processing) {
                        this.process();
                    }
                }, this.retryDelay * task.attempts); // Exponential backoff

            } else {
                // Max retries reached
                this.logger.error(
                    `Webhook failed permanently after ${task.attempts} attempts: ${task.url}`,
                    task.sessionId,
                    { error: error.message }
                );

                this.stats.failed++;
            }
        } finally {
            this.activeRequests--;
        }
    }

    /**
     * Send webhook via HTTP POST
     * @private
     */
    async _sendWebhook(task) {
        const { url, payload } = task;

        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'WhatsApp-Gateway-Webhook/1.0',
                'X-Webhook-ID': task.id,
                'X-Attempt': task.attempts.toString()
            },
            timeout: this.timeout,
            validateStatus: (status) => status >= 200 && status < 300
        });

        return response.data;
    }

    /**
     * Sleep helper
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get queue statistics
     * @returns {Object} Queue stats
     */
    getStats() {
        return {
            ...this.stats,
            queueSize: this.queue.length,
            activeRequests: this.activeRequests,
            processing: this.processing,
            successRate: this.stats.total > 0
                ? ((this.stats.success / this.stats.total) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Get queue status
     * @returns {Object} Queue status
     */
    getStatus() {
        return {
            queueSize: this.queue.length,
            activeRequests: this.activeRequests,
            processing: this.processing,
            pendingTasks: this.queue.map(task => ({
                id: task.id,
                url: task.url,
                attempts: task.attempts,
                maxRetries: task.maxRetries,
                sessionId: task.sessionId
            }))
        };
    }

    /**
     * Clear queue
     */
    clear() {
        const clearedCount = this.queue.length;
        this.queue = [];
        this.logger.info(`Webhook queue cleared: ${clearedCount} tasks removed`);
        return clearedCount;
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            total: 0,
            success: 0,
            failed: 0,
            retried: 0
        };
        this.logger.info('Webhook statistics reset');
    }

    /**
     * Wait for queue to be empty
     * @param {number} timeout - Max wait time in ms
     * @returns {Promise<boolean>} True if queue emptied, false if timeout
     */
    async waitForEmpty(timeout = 30000) {
        const startTime = Date.now();

        while (this.queue.length > 0 || this.activeRequests > 0) {
            if (Date.now() - startTime > timeout) {
                return false;
            }
            await this._sleep(100);
        }

        return true;
    }

    /**
     * Shutdown queue gracefully
     * @param {number} timeout - Max wait time for pending requests
     */
    async shutdown(timeout = 10000) {
        this.logger.info('Shutting down webhook queue...', null, {
            pendingTasks: this.queue.length,
            activeRequests: this.activeRequests
        });

        // Wait for queue to empty or timeout
        const emptied = await this.waitForEmpty(timeout);

        if (!emptied) {
            this.logger.warn(`Webhook queue shutdown with ${this.queue.length} pending tasks`);
        }

        // Clear remaining tasks
        this.clear();

        this.logger.info('Webhook queue shutdown complete');
    }
}

module.exports = WebhookQueue;
