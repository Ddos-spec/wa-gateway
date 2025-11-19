/**
 * Connection Handler
 * Manages WhatsApp connection events and state transitions
 */

class ConnectionHandler {
    constructor(
        socketManager,
        reconnectStrategy,
        webhookHandler,
        logger,
        options = {}
    ) {
        this.socketManager = socketManager;
        this.reconnectStrategy = reconnectStrategy;
        this.webhookHandler = webhookHandler;
        this.logger = logger;

        // Callbacks
        this.onStateChange = options.onStateChange || (() => {});
        this.onPhonePairingUpdate = options.onPhonePairingUpdate || (() => {});
        this.onWebhookEvent = options.onWebhookEvent || (() => {});

        // State
        this.sessionId = socketManager.sessionId;
        this.phoneNumber = socketManager.phoneNumber;
        this.isPhonePairing = !!this.phoneNumber;
    }

    /**
     * Setup event handlers for socket
     * @param {Object} sock - Baileys socket instance
     * @param {Object} session - Session object
     */
    setupEventHandlers(sock, session) {
        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            await this._handleConnectionUpdate(update, session);
        });

        // Handle incoming messages
        sock.ev.on('messages.upsert', async (message) => {
            await this._handleIncomingMessage(message, session);
        });

        // Handle health failures
        sock.ev.on('health.failed', async (data) => {
            await this._handleHealthFailure(data);
        });

        this.logger.debug('Event handlers setup complete', this.sessionId);
    }

    /**
     * Handle connection update event
     * @private
     */
    async _handleConnectionUpdate(update, session) {
        try {
            const { connection, lastDisconnect, qr, isNewLogin } = update;

            // Handle QR code or pairing code
            if (qr) {
                await this._handleQrOrPairing(qr);
                return;
            }

            // Handle connection open
            if (connection === 'open') {
                await this._handleConnectionOpen(session, isNewLogin);
                return;
            }

            // Handle connection close
            if (connection === 'close') {
                await this._handleConnectionClose(lastDisconnect);
                return;
            }

            // Handle connecting state (shows user is entering code)
            if (connection === 'connecting' && this.isPhonePairing) {
                this.logger.info(
                    'Connection state changed to connecting - user may be entering code',
                    this.sessionId
                );

                // Mark pairing as in progress - this helps detect post-pairing restart
                this.reconnectStrategy.markPairingSuccess(this.sessionId);

                // Notify that pairing might be in progress
                if (this.onPhonePairingUpdate) {
                    this.onPhonePairingUpdate(this.sessionId, {
                        status: 'CODE_ENTERED',
                        detail: 'Code entered! Connecting... (< 5 seconds)'
                    });
                }

                this.onStateChange(
                    this.sessionId,
                    'CONNECTING',
                    'Code entered! Connecting...'
                );
            }

            // Handle other connection states
            if (connection) {
                this.logger.debug(
                    `Connection state: ${connection}`,
                    this.sessionId
                );

                this.onStateChange(this.sessionId, connection.toUpperCase(), `Connection ${connection}...`);
            }

        } catch (error) {
            this.logger.error(
                `Error in connection.update handler: ${error.message}`,
                this.sessionId,
                { error: error.stack }
            );
        }
    }

    /**
     * Handle QR code or pairing code request
     * @private
     */
    async _handleQrOrPairing(qr) {
        try {
            if (this.isPhonePairing) {
                // Request pairing code (duplicate prevention handled in SocketManager)
                this.logger.info(
                    `Requesting pairing code for ${this.phoneNumber}...`,
                    this.sessionId
                );

                this.onStateChange(
                    this.sessionId,
                    'AWAITING_PAIRING',
                    'Requesting pairing code...'
                );

                const pairingCode = await this.socketManager.requestPairingCode();

                // Update state with pairing code
                this.onStateChange(
                    this.sessionId,
                    'AWAITING_PAIRING',
                    `Enter this code in WhatsApp: ${pairingCode}`,
                    '',
                    ''
                );

                // Notify phone pairing update
                if (this.onPhonePairingUpdate) {
                    this.onPhonePairingUpdate(this.sessionId, {
                        status: 'AWAITING_PAIRING',
                        detail: `Enter this code in WhatsApp: ${pairingCode}`,
                        pairingCode
                    });
                }

            } else {
                // Regular QR code session
                this.logger.info('QR code generated', this.sessionId);

                this.onStateChange(
                    this.sessionId,
                    'GENERATING_QR',
                    'QR code available.',
                    qr
                );
            }

        } catch (error) {
            this.logger.error(
                `Failed to handle QR/pairing: ${error.message}`,
                this.sessionId
            );

            this.onStateChange(
                this.sessionId,
                'PAIRING_FAILED',
                `Failed to get pairing code: ${error.message}`
            );
        }
    }

    /**
     * Handle connection open
     * @private
     */
    async _handleConnectionOpen(session, isNewLogin) {
        try {
            const sock = this.socketManager.getSocket();
            const userName = sock.user?.name || 'Unknown';
            const userJid = sock.user?.id || '';

            this.logger.success(
                `Connection is now open for ${this.sessionId}`,
                this.sessionId,
                { userName, userJid, isNewLogin }
            );

            let detailMessage = `Connected as ${userName}`;

            // Handle phone pairing success
            if (this.isPhonePairing) {
                detailMessage = `Phone number ${this.phoneNumber} successfully paired as ${userName}!`;

                this.logger.info(
                    `Phone pairing successful: ${this.phoneNumber} -> ${userName} (${userJid})`,
                    this.sessionId
                );

                // Notify pairing success with complete information
                if (this.onPhonePairingUpdate) {
                    this.onPhonePairingUpdate(this.sessionId, {
                        status: 'CONNECTED',
                        detail: detailMessage,
                        phoneNumber: this.phoneNumber,
                        userName: userName,
                        userJid: userJid,
                        isNewLogin: isNewLogin
                    });
                }

                // Send webhook event
                this.onWebhookEvent({
                    event: 'phone-pair-success',
                    sessionId: this.sessionId,
                    phoneNumber: this.phoneNumber,
                    userName: userName,
                    userJid: userJid,
                    message: 'Phone number successfully paired.'
                });
            }

            // Update state to connected
            this.onStateChange(
                this.sessionId,
                'CONNECTED',
                detailMessage,
                '',
                ''
            );

            // Start health monitoring
            this.socketManager.startHealthMonitoring();

            // Reset reconnection attempts
            this.reconnectStrategy.resetRetries(this.sessionId);

        } catch (error) {
            this.logger.error(
                `Error handling connection open: ${error.message}`,
                this.sessionId,
                { error: error.stack }
            );
        }
    }

    /**
     * Handle connection close
     * @private
     */
    async _handleConnectionClose(lastDisconnect) {
        try {
            // Stop health monitoring
            this.socketManager.stopHealthMonitoring();

            // Determine if should reconnect (pass sessionId for post-pairing detection)
            const { shouldReconnect, reason, statusCode, isFatal, isPostPairingRestart } =
                this.reconnectStrategy.shouldReconnect(lastDisconnect, this.sessionId);

            // Log with context about post-pairing restart
            if (isPostPairingRestart) {
                this.logger.info(
                    `Post-pairing restart detected (Error ${statusCode}). This is EXPECTED after successful pairing. Reconnecting immediately...`,
                    this.sessionId
                );

                // Notify user that pairing is completing
                if (this.isPhonePairing && this.onPhonePairingUpdate) {
                    this.onPhonePairingUpdate(this.sessionId, {
                        status: 'RESTARTING',
                        detail: 'Pairing successful! Finalizing connection...'
                    });
                }

                this.onStateChange(
                    this.sessionId,
                    'RESTARTING',
                    'Pairing successful! Finalizing connection...'
                );
            } else {
                this.logger.warn(
                    `Connection closed. Reason: ${reason}, statusCode: ${statusCode}. Will reconnect: ${shouldReconnect}`,
                    this.sessionId
                );

                // Update state
                this.onStateChange(
                    this.sessionId,
                    'DISCONNECTED',
                    'Connection closed.',
                    '',
                    reason
                );
            }

            if (shouldReconnect) {
                // Schedule reconnection (immediate for post-pairing restart)
                const result = this.reconnectStrategy.scheduleReconnect(
                    this.sessionId,
                    async () => {
                        this.logger.info('Attempting reconnection...', this.sessionId);
                        // Reconnection will be handled by SessionManager
                        // Emit event for reconnection
                        this.onWebhookEvent({
                            event: 'reconnection-attempt',
                            sessionId: this.sessionId,
                            reason,
                            isPostPairingRestart
                        });
                    },
                    { isPostPairingRestart }
                );

                if (result.scheduled) {
                    if (isPostPairingRestart) {
                        this.logger.info(
                            `Post-pairing reconnection scheduled in ${result.delay}ms (immediate)`,
                            this.sessionId
                        );
                    } else {
                        this.logger.info(
                            `Reconnection scheduled in ${result.delay}ms (attempt ${result.attempt})`,
                            this.sessionId
                        );
                    }
                } else {
                    this.logger.error(
                        `Reconnection not scheduled: ${result.reason}`,
                        this.sessionId
                    );
                }

            } else {
                // Fatal error, don't reconnect
                this.logger.error(
                    `Not reconnecting for session ${this.sessionId} due to fatal error (${statusCode})`,
                    this.sessionId
                );

                // Notify pairing failure if phone pairing
                if (this.isPhonePairing && this.onPhonePairingUpdate) {
                    this.onPhonePairingUpdate(this.sessionId, {
                        status: 'PAIRING_FAILED',
                        detail: `Connection failed: ${reason}`
                    });
                }

                // Emit fatal error event
                this.onWebhookEvent({
                    event: 'fatal-disconnect',
                    sessionId: this.sessionId,
                    reason,
                    statusCode
                });
            }

        } catch (error) {
            this.logger.error(
                `Error handling connection close: ${error.message}`,
                this.sessionId,
                { error: error.stack }
            );
        }
    }

    /**
     * Handle incoming message
     * @private
     */
    async _handleIncomingMessage(message, session) {
        try {
            await this.webhookHandler.handleMessage(
                message,
                this.sessionId,
                session
            );
        } catch (error) {
            this.logger.error(
                `Error handling incoming message: ${error.message}`,
                this.sessionId,
                { error: error.stack }
            );
        }
    }

    /**
     * Handle health check failure
     * @private
     */
    async _handleHealthFailure(data) {
        try {
            this.logger.error(
                `Health check failed ${data.failures} times consecutively`,
                this.sessionId
            );

            // Emit webhook event
            this.onWebhookEvent({
                event: 'health-check-failed',
                sessionId: this.sessionId,
                consecutiveFailures: data.failures
            });

            // Could trigger manual reconnection here if needed

        } catch (error) {
            this.logger.error(
                `Error handling health failure: ${error.message}`,
                this.sessionId
            );
        }
    }

    /**
     * Cleanup handler
     */
    cleanup() {
        this.socketManager.stopHealthMonitoring();
        this.reconnectStrategy.cleanup(this.sessionId);
        this.logger.debug('Connection handler cleaned up', this.sessionId);
    }
}

module.exports = ConnectionHandler;
