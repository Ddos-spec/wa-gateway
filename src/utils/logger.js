const pino = require('pino');
const path = require('path');
const fs = require('fs');

/**
 * Structured Logger Utility
 * Provides consistent logging across the application
 */

class Logger {
    constructor(options = {}) {
        this.logsDir = options.logsDir || path.join(__dirname, '../../activity_logs');
        this.systemLog = [];
        this.maxLogEntries = options.maxLogEntries || 1000;
        this.logFile = path.join(this.logsDir, 'system.log');

        // Ensure logs directory exists
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }

        // Initialize pino logger
        this.pino = pino({
            level: process.env.LOG_LEVEL || 'info'
        });

        // Load existing logs on initialization
        this.loadSystemLogFromDisk();
    }

    /**
     * Log an info message
     * @param {string} message - Log message
     * @param {string} sessionId - Optional session ID
     * @param {Object} metadata - Optional additional metadata
     */
    info(message, sessionId = null, metadata = {}) {
        this._log('info', message, sessionId, metadata);
    }

    /**
     * Log a warning message
     * @param {string} message - Log message
     * @param {string} sessionId - Optional session ID
     * @param {Object} metadata - Optional additional metadata
     */
    warn(message, sessionId = null, metadata = {}) {
        this._log('warn', message, sessionId, metadata);
    }

    /**
     * Log an error message
     * @param {string} message - Log message
     * @param {string} sessionId - Optional session ID
     * @param {Object} metadata - Optional additional metadata
     */
    error(message, sessionId = null, metadata = {}) {
        this._log('error', message, sessionId, metadata);
    }

    /**
     * Log a debug message
     * @param {string} message - Log message
     * @param {string} sessionId - Optional session ID
     * @param {Object} metadata - Optional additional metadata
     */
    debug(message, sessionId = null, metadata = {}) {
        this._log('debug', message, sessionId, metadata);
    }

    /**
     * Log a success message (custom level)
     * @param {string} message - Log message
     * @param {string} sessionId - Optional session ID
     * @param {Object} metadata - Optional additional metadata
     */
    success(message, sessionId = null, metadata = {}) {
        this._log('success', message, sessionId, metadata);
    }

    /**
     * Internal logging method
     * @private
     */
    _log(level, message, sessionId, metadata) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            sessionId: sessionId || 'SYSTEM',
            message,
            ...metadata
        };

        // Add to in-memory log
        this.systemLog.push(logEntry);

        // Keep only last N entries in memory
        if (this.systemLog.length > this.maxLogEntries) {
            this.systemLog.shift();
        }

        // Write to disk (append)
        this._writeLogToDisk(logEntry);

        // Log to pino
        const pinoMethod = this.pino[level] || this.pino.info;
        pinoMethod.call(this.pino, {
            sessionId: logEntry.sessionId,
            ...metadata
        }, message);
    }

    /**
     * Write log entry to disk
     * @private
     */
    _writeLogToDisk(logEntry) {
        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            fs.appendFileSync(this.logFile, logLine, 'utf-8');
        } catch (error) {
            console.error('Failed to write log to disk:', error.message);
        }
    }

    /**
     * Load system logs from disk
     */
    loadSystemLogFromDisk() {
        try {
            if (fs.existsSync(this.logFile)) {
                const data = fs.readFileSync(this.logFile, 'utf-8');
                const lines = data.trim().split('\n').filter(line => line);

                // Load last N entries
                const recentLines = lines.slice(-this.maxLogEntries);
                this.systemLog = recentLines.map(line => {
                    try {
                        return JSON.parse(line);
                    } catch (e) {
                        return null;
                    }
                }).filter(entry => entry !== null);

                this.pino.info(`Loaded ${this.systemLog.length} log entries from disk`);
            }
        } catch (error) {
            this.pino.error(`Failed to load system log: ${error.message}`);
        }
    }

    /**
     * Get recent log entries
     * @param {number} limit - Number of entries to return
     * @param {string} sessionId - Filter by session ID
     * @returns {Array} Log entries
     */
    getRecentLogs(limit = 100, sessionId = null) {
        let logs = this.systemLog;

        if (sessionId) {
            logs = logs.filter(entry => entry.sessionId === sessionId);
        }

        return logs.slice(-limit);
    }

    /**
     * Clear in-memory logs
     */
    clearMemoryLogs() {
        this.systemLog = [];
        this.pino.info('In-memory logs cleared');
    }

    /**
     * Clear log file
     */
    clearLogFile() {
        try {
            fs.writeFileSync(this.logFile, '', 'utf-8');
            this.pino.info('Log file cleared');
        } catch (error) {
            this.pino.error(`Failed to clear log file: ${error.message}`);
        }
    }

    /**
     * Get log statistics
     * @returns {Object} Log statistics
     */
    getStats() {
        const stats = {
            totalEntries: this.systemLog.length,
            byLevel: {},
            bySession: {},
            oldestEntry: this.systemLog[0]?.timestamp,
            newestEntry: this.systemLog[this.systemLog.length - 1]?.timestamp
        };

        this.systemLog.forEach(entry => {
            // Count by level
            stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;

            // Count by session
            stats.bySession[entry.sessionId] = (stats.bySession[entry.sessionId] || 0) + 1;
        });

        return stats;
    }
}

// Singleton instance
let loggerInstance = null;

/**
 * Get or create logger instance
 * @param {Object} options - Logger options
 * @returns {Logger} Logger instance
 */
function getLogger(options = {}) {
    if (!loggerInstance) {
        loggerInstance = new Logger(options);
    }
    return loggerInstance;
}

module.exports = { Logger, getLogger };
