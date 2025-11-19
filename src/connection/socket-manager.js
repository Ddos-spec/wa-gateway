const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const path = require('path');

/**
 * Socket Manager
 * Manages WhatsApp socket connections with health monitoring
 */

class SocketManager {
    constructor(sessionId, baileysConfig, sessionStorage, logger, options = {}) {
        this.sessionId = sessionId;
        this.baileysConfig = baileysConfig;
        this.sessionStorage = sessionStorage;
        this.logger = logger;

        // Options
        this.phoneNumber = options.phoneNumber || null;
        this.authDir = options.authDir || path.join(__dirname, '../../auth_info_baileys');

        // Socket instance
        this.sock = null;

        // Health monitoring
        this.healthCheckInterval = null;
        this.healthCheckConfig = baileysConfig.getHealthCheckConfig();
        this.consecutiveHealthFailures = 0;

        // WebSocket state constants
        this.wsStates = baileysConfig.getWebSocketStates();

        // Pairing code state - prevent duplicates
        this.pairingCodeRequested = false;
        this.lastPairingCode = null;
        this.pairingCodeTimestamp = null;
    }

    /**
     * Initialize socket connection
     * @returns {Object} Socket instance
     */
    async initialize() {
        try {
            this.logger.info('Initializing socket...', this.sessionId);

            // Load authentication state
            const authPath = path.join(this.authDir, this.sessionId);
            const { state, saveCreds } = await useMultiFileAuthState(authPath);

            // Fetch latest WhatsApp version
            const { version, isLatest } = await fetchLatestBaileysVersion();
            this.logger.debug(
                `Using WA version: ${version.join('.')}, isLatest: ${isLatest}`,
                this.sessionId
            );

            // Get socket configuration
            const socketConfig = this.baileysConfig.getSocketConfig({
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, this.baileysConfig.logger)
            });

            // Add version to config
            socketConfig.version = version;

            // Create socket
            this.sock = makeWASocket(socketConfig);

            // Setup credentials auto-save
            this.sock.ev.on('creds.update', saveCreds);

            this.logger.info('Socket initialized successfully', this.sessionId);

            return this.sock;

        } catch (error) {
            this.logger.error(
                `Failed to initialize socket: ${error.message}`,
                this.sessionId,
                { error: error.stack }
            );
            throw error;
        }
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            return; // Already monitoring
        }

        const { interval } = this.healthCheckConfig;

        this.healthCheckInterval = setInterval(async () => {
            await this._performHealthCheck();
        }, interval);

        this.logger.debug('Health monitoring started', this.sessionId);
    }

    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            this.consecutiveHealthFailures = 0;
            this.logger.debug('Health monitoring stopped', this.sessionId);
        }
    }

    /**
     * Perform health check
     * @private
     */
    async _performHealthCheck() {
        if (!this.sock) {
            return;
        }

        try {
            // Check WebSocket state
            const wsState = this.sock.ws?.readyState;

            if (wsState !== this.wsStates.OPEN) {
                this.consecutiveHealthFailures++;

                this.logger.warn(
                    `Health check failed: WebSocket state is ${this._getWsStateName(wsState)}`,
                    this.sessionId,
                    { consecutiveFailures: this.consecutiveHealthFailures }
                );

                // Check if max failures reached
                if (this.consecutiveHealthFailures >= this.healthCheckConfig.maxFailures) {
                    this.logger.error(
                        'Max health check failures reached, connection may be dead',
                        this.sessionId
                    );
                    // Emit health failure event (can be handled by ConnectionHandler)
                    this.sock.ev.emit('health.failed', {
                        sessionId: this.sessionId,
                        failures: this.consecutiveHealthFailures
                    });
                }

                return;
            }

            // Ping WhatsApp server by sending presence update
            await Promise.race([
                this.sock.sendPresenceUpdate('available'),
                this._timeout(this.healthCheckConfig.timeout)
            ]);

            // Health check passed
            if (this.consecutiveHealthFailures > 0) {
                this.logger.info(
                    'Health check recovered',
                    this.sessionId,
                    { previousFailures: this.consecutiveHealthFailures }
                );
            }

            this.consecutiveHealthFailures = 0;

        } catch (error) {
            this.consecutiveHealthFailures++;

            this.logger.warn(
                `Health check error: ${error.message}`,
                this.sessionId,
                { consecutiveFailures: this.consecutiveHealthFailures }
            );
        }
    }

    /**
     * Get WebSocket state name
     * @private
     */
    _getWsStateName(state) {
        const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        return stateNames[state] || 'UNKNOWN';
    }

    /**
     * Timeout helper
     * @private
     */
    _timeout(ms) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Health check timeout')), ms);
        });
    }

    /**
     * Request pairing code for phone number
     * @returns {string} Formatted pairing code
     */
    async requestPairingCode() {
        if (!this.phoneNumber) {
            throw new Error('Phone number not provided for pairing');
        }

        if (!this.sock) {
            throw new Error('Socket not initialized');
        }

        // Prevent duplicate requests within 5 seconds
        const now = Date.now();
        if (this.pairingCodeRequested && this.pairingCodeTimestamp) {
            const timeSinceLastRequest = now - this.pairingCodeTimestamp;
            if (timeSinceLastRequest < 5000) {
                this.logger.debug(
                    'Pairing code already requested recently, returning cached code',
                    this.sessionId
                );
                return this.lastPairingCode;
            }
        }

        try {
            this.pairingCodeRequested = true;
            this.pairingCodeTimestamp = now;

            this.logger.info(
                `Requesting pairing code for ${this.phoneNumber}...`,
                this.sessionId
            );

            const code = await this.sock.requestPairingCode(this.phoneNumber);
            const formattedCode = code.slice(0, 4) + '-' + code.slice(4);

            this.lastPairingCode = formattedCode;

            this.logger.info(
                `Pairing code generated: ${formattedCode}`,
                this.sessionId
            );

            return formattedCode;

        } catch (error) {
            this.logger.error(
                `Failed to request pairing code: ${error.message}`,
                this.sessionId
            );
            this.pairingCodeRequested = false; // Reset on error
            throw error;
        }
    }

    /**
     * Get current socket state
     * @returns {Object} Socket state
     */
    getState() {
        if (!this.sock) {
            return {
                exists: false,
                wsState: null,
                wsStateName: 'NOT_INITIALIZED'
            };
        }

        const wsState = this.sock.ws?.readyState;

        return {
            exists: true,
            wsState,
            wsStateName: this._getWsStateName(wsState),
            isOpen: wsState === this.wsStates.OPEN,
            user: this.sock.user,
            healthFailures: this.consecutiveHealthFailures
        };
    }

    /**
     * Close socket connection
     */
    async close() {
        this.logger.info('Closing socket...', this.sessionId);

        // Stop health monitoring
        this.stopHealthMonitoring();

        // Reset pairing code state
        this.pairingCodeRequested = false;
        this.lastPairingCode = null;
        this.pairingCodeTimestamp = null;

        // Close socket
        if (this.sock) {
            try {
                await this.sock.end();
                this.logger.info('Socket closed successfully', this.sessionId);
            } catch (error) {
                this.logger.error(
                    `Error closing socket: ${error.message}`,
                    this.sessionId
                );
            } finally {
                this.sock = null;
            }
        }
    }

    /**
     * Get socket instance
     * @returns {Object|null} Socket instance
     */
    getSocket() {
        return this.sock;
    }

    /**
     * Check if socket is connected
     * @returns {boolean} True if connected
     */
    isConnected() {
        if (!this.sock || !this.sock.ws) {
            return false;
        }

        return this.sock.ws.readyState === this.wsStates.OPEN;
    }

    /**
     * Get health status
     * @returns {Object} Health status
     */
    getHealthStatus() {
        return {
            sessionId: this.sessionId,
            isMonitoring: this.healthCheckInterval !== null,
            consecutiveFailures: this.consecutiveHealthFailures,
            maxFailures: this.healthCheckConfig.maxFailures,
            checkInterval: this.healthCheckConfig.interval,
            socketState: this.getState()
        };
    }
}

module.exports = SocketManager;
