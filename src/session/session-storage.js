const fs = require('fs');
const path = require('path');

/**
 * Session Storage Manager
 * Handles loading and saving session settings and credentials
 */

class SessionStorage {
    constructor(logger, options = {}) {
        this.logger = logger;
        this.authDir = options.authDir || path.join(__dirname, '../../auth_info_baileys');
        this.tokensFile = options.tokensFile || path.join(__dirname, '../../session_tokens.enc');

        // Ensure auth directory exists
        if (!fs.existsSync(this.authDir)) {
            fs.mkdirSync(this.authDir, { recursive: true });
        }
    }

    /**
     * Load session settings from disk
     * @param {string} sessionId - Session identifier
     * @returns {Object} Session settings
     */
    async loadSettings(sessionId) {
        const settingsPath = this._getSettingsPath(sessionId);

        try {
            if (fs.existsSync(settingsPath)) {
                const data = fs.readFileSync(settingsPath, 'utf-8');
                const settings = JSON.parse(data);

                this.logger.debug(`Settings loaded for ${sessionId}`, sessionId, {
                    webhooks: settings.webhooks?.length || 0
                });

                return settings;
            }
        } catch (error) {
            this.logger.error(
                `Failed to load settings for ${sessionId}: ${error.message}`,
                sessionId
            );
        }

        // Return default settings
        return this._getDefaultSettings();
    }

    /**
     * Save session settings to disk
     * @param {string} sessionId - Session identifier
     * @param {Object} settings - Settings to save
     */
    async saveSettings(sessionId, settings) {
        const settingsPath = this._getSettingsPath(sessionId);
        const sessionDir = path.dirname(settingsPath);

        try {
            // Ensure session directory exists
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            // Save settings
            fs.writeFileSync(
                settingsPath,
                JSON.stringify(settings, null, 2),
                'utf-8'
            );

            this.logger.debug(`Settings saved for ${sessionId}`, sessionId);

            return true;
        } catch (error) {
            this.logger.error(
                `Failed to save settings for ${sessionId}: ${error.message}`,
                sessionId
            );
            return false;
        }
    }

    /**
     * Check if session exists on disk
     * @param {string} sessionId - Session identifier
     * @returns {boolean} True if session exists
     */
    sessionExists(sessionId) {
        const sessionDir = this._getSessionDir(sessionId);
        return fs.existsSync(sessionDir);
    }

    /**
     * Get all existing session IDs from disk
     * @returns {Array<string>} Array of session IDs
     */
    getAllSessionIds() {
        try {
            if (!fs.existsSync(this.authDir)) {
                return [];
            }

            return fs.readdirSync(this.authDir)
                .filter(name => {
                    const sessionPath = path.join(this.authDir, name);
                    return fs.statSync(sessionPath).isDirectory();
                });
        } catch (error) {
            this.logger.error(`Failed to read session directories: ${error.message}`);
            return [];
        }
    }

    /**
     * Delete session from disk
     * @param {string} sessionId - Session identifier
     * @returns {boolean} True if deleted successfully
     */
    deleteSession(sessionId) {
        const sessionDir = this._getSessionDir(sessionId);

        try {
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
                this.logger.info(`Session data deleted for ${sessionId}`, sessionId);
                return true;
            }
            return false;
        } catch (error) {
            this.logger.error(
                `Failed to delete session data for ${sessionId}: ${error.message}`,
                sessionId
            );
            return false;
        }
    }

    /**
     * Get session directory path
     * @param {string} sessionId - Session identifier
     * @returns {string} Directory path
     */
    _getSessionDir(sessionId) {
        return path.join(this.authDir, sessionId);
    }

    /**
     * Get settings file path
     * @param {string} sessionId - Session identifier
     * @returns {string} Settings file path
     */
    _getSettingsPath(sessionId) {
        return path.join(this._getSessionDir(sessionId), 'settings.json');
    }

    /**
     * Get default settings
     * @private
     */
    _getDefaultSettings() {
        return {
            webhooks: [],
            webhook_from_me: true,
            webhook_group: true,
            webhook_individual: true,
            save_image: true,
            save_video: true,
            save_audio: true,
            save_sticker: false,
            save_document: true
        };
    }

    /**
     * Get session statistics
     * @returns {Object} Storage statistics
     */
    getStats() {
        const sessionIds = this.getAllSessionIds();
        const stats = {
            totalSessions: sessionIds.length,
            sessions: []
        };

        for (const sessionId of sessionIds) {
            const sessionDir = this._getSessionDir(sessionId);
            const settingsPath = this._getSettingsPath(sessionId);

            try {
                const dirStats = fs.statSync(sessionDir);
                const hasSettings = fs.existsSync(settingsPath);

                stats.sessions.push({
                    sessionId,
                    hasSettings,
                    createdAt: dirStats.birthtime,
                    modifiedAt: dirStats.mtime
                });
            } catch (error) {
                this.logger.error(`Failed to get stats for ${sessionId}: ${error.message}`);
            }
        }

        return stats;
    }

    /**
     * Clean up orphaned session directories
     * @param {Array<string>} activeSessions - Array of active session IDs
     * @returns {number} Number of cleaned up sessions
     */
    cleanupOrphaned(activeSessions = []) {
        const allSessions = this.getAllSessionIds();
        let cleaned = 0;

        for (const sessionId of allSessions) {
            if (!activeSessions.includes(sessionId)) {
                if (this.deleteSession(sessionId)) {
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) {
            this.logger.info(`Cleaned up ${cleaned} orphaned session(s)`);
        }

        return cleaned;
    }

    /**
     * Backup session data
     * @param {string} sessionId - Session identifier
     * @param {string} backupDir - Backup directory
     * @returns {boolean} True if backup successful
     */
    backupSession(sessionId, backupDir) {
        const sessionDir = this._getSessionDir(sessionId);
        const backupPath = path.join(backupDir, `${sessionId}_${Date.now()}`);

        try {
            if (!fs.existsSync(sessionDir)) {
                this.logger.warn(`Session ${sessionId} does not exist for backup`, sessionId);
                return false;
            }

            // Ensure backup directory exists
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            // Copy directory recursively
            fs.cpSync(sessionDir, backupPath, { recursive: true });

            this.logger.info(`Session ${sessionId} backed up to ${backupPath}`, sessionId);
            return true;

        } catch (error) {
            this.logger.error(
                `Failed to backup session ${sessionId}: ${error.message}`,
                sessionId
            );
            return false;
        }
    }

    /**
     * Restore session from backup
     * @param {string} sessionId - Session identifier
     * @param {string} backupPath - Path to backup
     * @returns {boolean} True if restore successful
     */
    restoreSession(sessionId, backupPath) {
        const sessionDir = this._getSessionDir(sessionId);

        try {
            if (!fs.existsSync(backupPath)) {
                this.logger.error(`Backup path does not exist: ${backupPath}`, sessionId);
                return false;
            }

            // Delete existing session if any
            if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }

            // Copy backup to session directory
            fs.cpSync(backupPath, sessionDir, { recursive: true });

            this.logger.info(`Session ${sessionId} restored from ${backupPath}`, sessionId);
            return true;

        } catch (error) {
            this.logger.error(
                `Failed to restore session ${sessionId}: ${error.message}`,
                sessionId
            );
            return false;
        }
    }
}

module.exports = SessionStorage;
