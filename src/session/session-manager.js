const { randomUUID } = require('crypto');
const BaileysConfig = require('../../config/baileys.config');
const SocketManager = require('../connection/socket-manager');
const ConnectionHandler = require('../connection/connection-handler');
const ReconnectStrategy = require('../connection/reconnect-strategy');

/**
 * Session Manager
 * Orchestrates WhatsApp sessions with all components
 */

class SessionManager {
    constructor(
        sessionStorage,
        webhookHandler,
        logger,
        dbModels, // { User, Admin, WaNumber }
        phonePairing,
        options = {}
    ) {
        this.sessionStorage = sessionStorage;
        this.webhookHandler = webhookHandler;
        this.logger = logger;
        this.db = dbModels; // Store db models
        this.phonePairing = phonePairing;

        // Configuration
        this.maxSessions = options.maxSessions || 10;
        this.authDir = options.authDir;

        // Active sessions storage
        this.sessions = new Map(); // sessionId -> session object
        this.sessionTokens = new Map(); // sessionId -> API token
        this.wsAuthTokens = new Map(); // wsToken -> { userInfo, expires }

        // Initialize shared components
        this.baileysConfig = new BaileysConfig({
            environment: process.env.NODE_ENV
        });

        this.reconnectStrategy = new ReconnectStrategy(
            this.baileysConfig.getReconnectConfig()
        );

        // Callbacks
        this.onBroadcast = options.onBroadcast || (() => {});
        this.onWebhookEvent = options.onWebhookEvent || (() => {});
    }

    /**
     * Create a new WhatsApp session
     * @param {string} sessionId - Unique session identifier
     * @param {string} creatorEmail - Email of user creating session
     * @param {string} phoneNumber - Optional phone number for pairing
     * @returns {Object} Created session info
     */
    async createSession(sessionId, creatorEmail, phoneNumber = null) {
        try {
            // Validate session limit
            if (this.sessions.size >= this.maxSessions) {
                throw new Error(`Maximum sessions limit (${this.maxSessions}) reached`);
            }

            // Check if session already exists
            if (this.sessions.has(sessionId)) {
                throw new Error(`Session ${sessionId} already exists`);
            }

            this.logger.info(`Creating session: ${sessionId}`, sessionId, {
                creator: creatorEmail,
                phoneNumber: phoneNumber || 'QR'
            });

            // Generate API token
            const token = randomUUID();
            this.sessionTokens.set(sessionId, token);

            // Load session settings
            const settings = await this.sessionStorage.loadSettings(sessionId);

            // Create session object
            const session = {
                sessionId,
                status: 'CREATING',
                detail: 'Initializing session...',
                qr: '',
                owner: creatorEmail,
                settings,
                sock: null,
                socketManager: null,
                connectionHandler: null,
                createdAt: new Date().toISOString()
            };

            this.sessions.set(sessionId, session);

            // Kepemilikan akan dicatat di tabel wa_numbers saat nomor dibuat/dipasangkan
            // if (creatorEmail) {
            //     // this.db.User.addSession... (logika baru jika diperlukan)
            // }

            // Broadcast state change
            this._broadcastStateChange(sessionId, 'CREATING', 'Initializing session...');

            // Connect to WhatsApp
            await this.connectSession(sessionId, phoneNumber);

            return {
                sessionId,
                token,
                status: 'CREATING',
                message: 'Session creation started'
            };

        } catch (error) {
            this.logger.error(
                `Failed to create session: ${error.message}`,
                sessionId,
                { error: error.stack }
            );

            // Cleanup on failure
            this.sessions.delete(sessionId);
            this.sessionTokens.delete(sessionId);

            throw error;
        }
    }

    /**
     * Connect session to WhatsApp
     * @param {string} sessionId - Session identifier
     * @param {string} phoneNumber - Optional phone number for pairing
     */
    async connectSession(sessionId, phoneNumber = null) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        try {
            this._updateSessionState(sessionId, 'CONNECTING', 'Initializing session...');

            // Create socket manager
            const socketManager = new SocketManager(
                sessionId,
                this.baileysConfig,
                this.sessionStorage,
                this.logger,
                {
                    phoneNumber,
                    authDir: this.authDir
                }
            );

            // Initialize socket
            const sock = await socketManager.initialize();

            // Create connection handler
            const connectionHandler = new ConnectionHandler(
                socketManager,
                this.reconnectStrategy,
                this.webhookHandler,
                this.logger,
                {
                    onStateChange: this._updateSessionState.bind(this),
                    onPhonePairingUpdate: this._handlePhonePairingUpdate.bind(this),
                    onWebhookEvent: this.onWebhookEvent
                }
            );

            // Setup event handlers
            connectionHandler.setupEventHandlers(sock, session);

            // Update session with managers
            session.sock = sock;
            session.socketManager = socketManager;
            session.connectionHandler = connectionHandler;

            this.sessions.set(sessionId, session);

            this.logger.info('Session connected to WhatsApp', sessionId);

        } catch (error) {
            this.logger.error(
                `Failed to connect session: ${error.message}`,
                sessionId,
                { error: error.stack }
            );

            this._updateSessionState(
                sessionId,
                'ERROR',
                `Connection failed: ${error.message}`
            );

            throw error;
        }
    }

    /**
     * Delete a session
     * @param {string} sessionId - Session identifier
     * @returns {boolean} True if deleted successfully
     */
    async deleteSession(sessionId) {
        try {
            const session = this.sessions.get(sessionId);
            if (!session) {
                this.logger.warn(`Session ${sessionId} not found for deletion`, sessionId);
                return false;
            }

            this.logger.info(`Deleting session: ${sessionId}`, sessionId);

            // Cleanup connection handler
            if (session.connectionHandler) {
                session.connectionHandler.cleanup();
            }

            // Close socket
            if (session.socketManager) {
                await session.socketManager.close();
            }

            // Menghapus file sesi akan memaksa pemasangan ulang.
            // Kita tidak menghapus entri WaNumber dari DB agar tidak kehilangan data.
            // const waNumber = await this.db.WaNumber.findBySessionName(sessionId);
            // if (waNumber) {
            //     await this.db.WaNumber.delete(waNumber.id);
            // }

            // Delete from storage
            this.sessionStorage.deleteSession(sessionId);

            // Remove from active sessions
            this.sessions.delete(sessionId);
            this.sessionTokens.delete(sessionId);

            // Cleanup reconnect strategy
            this.reconnectStrategy.cleanup(sessionId);

            // Broadcast deletion
            this.onBroadcast({
                event: 'session-deleted',
                sessionId
            });

            this.logger.info(`Session deleted successfully: ${sessionId}`, sessionId);

            return true;

        } catch (error) {
            this.logger.error(
                `Failed to delete session: ${error.message}`,
                sessionId,
                { error: error.stack }
            );
            return false;
        }
    }

    /**
     * Get session details
     * @param {string} sessionId - Session identifier
     * @returns {Object|null} Session details
     */
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return null;
        }

        return {
            sessionId: session.sessionId,
            status: session.status,
            detail: session.detail,
            qr: session.qr,
            owner: session.owner,
            token: this.sessionTokens.get(sessionId),
            createdAt: session.createdAt,
            isConnected: session.socketManager?.isConnected() || false,
            healthStatus: session.socketManager?.getHealthStatus() || null
        };
    }

    /**
     * Get all sessions for a user
     * @param {string} userEmail - User email
     * @param {boolean} isAdmin - Is admin user
     * @returns {Array} Array of session details
     */
    getSessionsForUser(userEmail, isAdmin = false) {
        const sessions = Array.from(this.sessions.values())
            .filter(s => {
                if (isAdmin) return true;
                return s.owner === userEmail;
            })
            .map(s => this.getSession(s.sessionId));

        return sessions;
    }

    /**
     * Regenerate API token for session
     * @param {string} sessionId - Session identifier
     * @returns {string} New token
     */
    regenerateToken(sessionId) {
        if (!this.sessions.has(sessionId)) {
            throw new Error(`Session ${sessionId} not found`);
        }

        const newToken = randomUUID();
        this.sessionTokens.set(sessionId, newToken);

        this.logger.info(`Token regenerated for session: ${sessionId}`, sessionId);

        return newToken;
    }

    /**
     * Validate API token
     * @param {string} sessionId - Session identifier
     * @param {string} token - Token to validate
     * @returns {boolean} True if valid
     */
    validateToken(sessionId, token) {
        const expectedToken = this.sessionTokens.get(sessionId);
        return expectedToken === token;
    }

    /**
     * Update session state (internal)
     * @private
     */
    _updateSessionState(sessionId, status, detail = '', qr = '', reason = '') {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return;
        }

        session.status = status;
        session.detail = detail;
        session.qr = qr;
        if (reason) {
            session.reason = reason;
        }

        this.sessions.set(sessionId, session);

        // Broadcast state change
        this._broadcastStateChange(sessionId, status, detail, qr, reason);

        this.logger.debug(`Session state updated: ${status}`, sessionId, { detail });
    }

    /**
     * Broadcast state change
     * @private
     */
    _broadcastStateChange(sessionId, status, detail, qr = '', reason = '') {
        this.onBroadcast({
            event: 'session-state-changed',
            sessionId,
            status,
            detail,
            qr,
            reason,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle phone pairing update
     * @private
     */
    _handlePhonePairingUpdate(sessionId, data) {
        if (this.phonePairing) {
            this.phonePairing.updatePairingStatus(sessionId, data);
        }
    }

    /**
     * Initialize existing sessions from disk
     * @returns {number} Number of sessions initialized
     */
    async initializeExistingSessions() {
        const sessionIds = this.sessionStorage.getAllSessionIds();
        this.logger.info(`Found ${sessionIds.length} existing session(s). Initializing...`);

        let initialized = 0;
        for (const sessionId of sessionIds) {
            try {
                const waNumber = await this.db.WaNumber.findBySessionName(sessionId);
                let ownerEmail = null;
                if (waNumber) {
                    const owner = await this.db.User.findById(waNumber.user_id);
                    if (owner) {
                        ownerEmail = owner.email;
                    }
                }

                if (!this.sessionTokens.has(sessionId)) {
                    this.sessionTokens.set(sessionId, randomUUID());
                }

                await this.createSession(sessionId, ownerEmail);
                initialized++;
            } catch (error) {
                this.logger.error(
                    `Failed to re-initialize session ${sessionId}: ${error.message}`,
                    sessionId
                );
            }
        }
        this.logger.info(`Initialized ${initialized}/${sessionIds.length} session(s)`);
        return initialized;
    }

    /**
     * Get session statistics
     * @returns {Object} Statistics
     */
    getStats() {
        const stats = {
            totalSessions: this.sessions.size,
            maxSessions: this.maxSessions,
            byStatus: {},
            byOwner: {},
            reconnectStats: this.reconnectStrategy.getStats()
        };

        for (const session of this.sessions.values()) {
            // Count by status
            stats.byStatus[session.status] = (stats.byStatus[session.status] || 0) + 1;

            // Count by owner
            const owner = session.owner || 'unknown';
            stats.byOwner[owner] = (stats.byOwner[owner] || 0) + 1;
        }

        return stats;
    }

    /**
     * Shutdown all sessions gracefully
     */
    async shutdown() {
        this.logger.info('Shutting down all sessions...');

        const sessionIds = Array.from(this.sessions.keys());

        for (const sessionId of sessionIds) {
            try {
                await this.deleteSession(sessionId);
            } catch (error) {
                this.logger.error(
                    `Error shutting down session ${sessionId}: ${error.message}`,
                    sessionId
                );
            }
        }

        // Cleanup reconnect strategy
        this.reconnectStrategy.cleanupAll();

        this.logger.info('All sessions shut down');
    }

    /**
     * Get tokens map (for persistence)
     * @returns {Map} Session tokens
     */
    getTokens() {
        return this.sessionTokens;
    }

    /**
     * Load tokens (from persistence)
     * @param {Map} tokens - Tokens to load
     */
    loadTokens(tokens) {
        this.sessionTokens = new Map(tokens);
        this.logger.info(`Loaded ${tokens.size} session token(s)`);
    }

    // --- WebSocket Token Management ---

    generateWsToken(userInfo) {
        const token = randomUUID();
        this.wsAuthTokens.set(token, {
            userInfo,
            expires: Date.now() + 30000 // 30 detik
        });
        // Hapus token setelah kedaluwarsa
        setTimeout(() => this.wsAuthTokens.delete(token), 31000);
        return token;
    }

    validateWsToken(token) {
        const tokenData = this.wsAuthTokens.get(token);
        if (!tokenData) return false;
        return Date.now() < tokenData.expires;
    }

    getUserInfoFromWsToken(token) {
        const tokenData = this.wsAuthTokens.get(token);
        if (tokenData && this.validateWsToken(token)) {
            this.wsAuthTokens.delete(token); // Token sekali pakai
            return tokenData.userInfo;
        }
        return null;
    }
}

module.exports = SessionManager;
