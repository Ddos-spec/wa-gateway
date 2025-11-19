const { Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');

/**
 * Baileys WhatsApp Socket Configuration
 * Centralized configuration for makeWASocket
 */

class BaileysConfig {
    constructor(options = {}) {
        this.logger = options.logger || pino({ level: process.env.LOG_LEVEL || 'silent' });
        this.environment = options.environment || process.env.NODE_ENV || 'production';
    }

    /**
     * Get socket configuration based on environment
     * @param {Object} auth - Authentication object {creds, keys}
     * @returns {Object} Socket configuration
     */
    getSocketConfig(auth) {
        const baseConfig = {
            auth,
            logger: this.logger,
            browser: Browsers.windows('Chrome'),
            printQRInTerminal: false,

            // Connection Settings
            qrTimeout: 30000,                    // 30 seconds for QR/Pairing timeout
            connectTimeoutMs: 60000,             // 60 seconds connection timeout (increased for pairing flow)
            keepAliveIntervalMs: 25000,          // 25 seconds keep-alive (improved from 45s)
            retryRequestDelayMs: 2000,           // 2 seconds retry delay (reduced from 3s)
            maxMsgRetryCount: 3,                 // Max 3 retries for messages

            // Privacy & Performance Settings
            markOnlineOnConnect: false,          // Don't auto mark online
            syncFullHistory: false,              // Don't sync full chat history
            virtualLinkPreviewEnabled: false,    // Disable link previews for performance
            emitOwnEvents: false,                // Don't emit own message events

            // Broadcast & JID Settings
            shouldIgnoreJid: (jid) => {
                return jid.endsWith('@broadcast');  // Ignore broadcast messages
            },

            // Query Settings
            fireInitQueries: true,               // Enable init queries for proper handshake

            // Mobile API options for pairing code
            mobile: false,                       // Ensure we're using web API for pairing
        };

        // Development-specific overrides
        if (this.environment === 'development') {
            // Use simple logger without pino-pretty to avoid browser compatibility issues
            baseConfig.logger = pino({ level: 'debug' });
            baseConfig.printQRInTerminal = true;
        }

        return baseConfig;
    }

    /**
     * Get health check configuration
     * @returns {Object} Health check settings
     */
    getHealthCheckConfig() {
        return {
            interval: 30000,                     // Check every 30 seconds
            timeout: 5000,                       // Health check timeout
            maxFailures: 3,                      // Max failures before reconnect
        };
    }

    /**
     * Get reconnection configuration
     * @returns {Object} Reconnection settings
     */
    getReconnectConfig() {
        return {
            initialDelay: 5000,                  // Start with 5 seconds
            maxDelay: 60000,                     // Max 60 seconds
            factor: 2,                           // Exponential factor (5s, 10s, 20s, 40s, 60s)
            maxAttempts: 10,                     // Max reconnection attempts before giving up

            // Fatal error codes that should NOT reconnect
            fatalStatusCodes: [401, 403, 428],

            // Post-pairing restart codes (EXPECTED after successful pairing)
            // Error 515 = "Stream Errored (restart required)" - normal after pairing
            postPairingRestartCodes: [515],
            postPairingWindow: 10000,            // 10 seconds window to detect post-pairing restart
        };
    }

    /**
     * Get WebSocket state descriptions
     * @returns {Object} WebSocket states
     */
    getWebSocketStates() {
        return {
            CONNECTING: 0,
            OPEN: 1,
            CLOSING: 2,
            CLOSED: 3,
        };
    }
}

module.exports = BaileysConfig;
