import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    delay
} from "@whiskeysockets/baileys";
import pino from "pino";
import readline from "readline";
// Queue system removed - direct execution
import fs from "fs";

import logger from "./utils/logger.js";
import config from "./config/settings.js";
import ListManager from "./models/ListManager.js";
import AfkManager from "./models/AfkManager.js";
import TestiManager from "./models/TestiManager.js";
import SewaManager from "./models/SewaManager.js";
import WelcomeManager from "./models/WelcomeManager.js";
import AntilinkManager from "./models/AntilinkManager.js";
import ProdukManager from "./models/ProdukManager.js";
import TemplateManager from "./models/TemplateManager.js";
import MessageService from "./services/MessageService.js";
import GroupService from "./services/GroupService.js";
import CommandHandler from "./handlers/CommandHandler.js";
import CommandRegistry from "./commands/registry/CommandRegistry.js";
import MessageHandler from "./handlers/MessageHandler.js";
import authMiddleware from "./middleware/authMiddleware.js";

// QRCode for connection
let QRCode;

class WhatsAppBot {
    constructor() {
        this.client = null;
        this.store = null;
        this.listManager = new ListManager();
        this.afkManager = new AfkManager();
        this.testiManager = new TestiManager();
        this.sewaManager = new SewaManager();
        this.welcomeManager = new WelcomeManager();
        this.antilinkManager = new AntilinkManager();
        this.produkManager = new ProdukManager();
        this.templateManager = new TemplateManager();
        this.services = {};
        this.commandHandler = new CommandHandler();
        this.commandRegistry = new CommandRegistry(this.commandHandler);
        this.messageHandler = null;

        // Connection state management to prevent loops
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000; // Start with 3 seconds
        this.isConnecting = false;
        this.lastDisconnectTime = 0;

        // Session health tracking
        this.sessionErrors = 0;
        this.maxSessionErrors = 10;
        this.lastHealthCheck = Date.now();
        this.healthCheckInterval = null;

        this.initializeStore();
        this.setupCommandHandler();
    }

    /**
     * Initialize message store
     */
    initializeStore() {
        // Memory store sudah tidak tersedia di Baileys 6.7.18+
        // Menggunakan simple in-memory storage untuk backwards compatibility
        this.store = {
            chats: new Map(),
            contacts: new Map(),
            messages: new Map(),

            // Method untuk bind ke socket events
            bind: (ev) => {
                ev.on('chats.upsert', (chats) => {
                    chats.forEach(chat => this.store.chats.set(chat.id, chat));
                });

                ev.on('contacts.upsert', (contacts) => {
                    contacts.forEach(contact => this.store.contacts.set(contact.id, contact));
                });

                ev.on('messages.upsert', ({ messages }) => {
                    messages.forEach(msg => {
                        if (msg.key?.id) {
                            this.store.messages.set(msg.key.id, msg);
                        }
                    });
                });
            }
        };
    }

    /**
     * Setup command handler with middleware
     */
    setupCommandHandler() {
        this.commandHandler.use(authMiddleware);
        // Commands will be loaded asynchronously
    }

    /**
     * Load all commands using CommandRegistry
     */
    async loadCommands() {
        try {
            logger.info('Loading commands using CommandRegistry...');
            const totalLoaded = await this.commandRegistry.loadAllCommands();
            logger.info(`Successfully loaded ${totalLoaded} commands automatically`);
            return totalLoaded;
        } catch (error) {
            logger.error('Error loading commands via CommandRegistry:', error);
            throw error;
        }
    }

    /**
     * Initialize services
     */
    initializeServices() {
        this.services = {
            messageService: new MessageService(this.client),
            groupService: new GroupService(this.client, this.welcomeManager),
            listManager: this.listManager,
            afkManager: this.afkManager,
            testiManager: this.testiManager,
            sewaManager: this.sewaManager,
            welcomeManager: this.welcomeManager,
            antilinkManager: this.antilinkManager,
            produkManager: this.produkManager,
            templateManager: this.templateManager
        };

        this.messageHandler = new MessageHandler(
            this.client,
            this.services,
            this.commandHandler
        );
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Connection updates - direct execution
        this.client.ev.on("connection.update", async (update) => {
            try {
                await this.handleConnectionUpdate(update);
            } catch (error) {
                logger.error("Error in connection update:", error);
            }
        });

        // Messages - direct execution
        this.client.ev.on("messages.upsert", async (m) => {
            try {
                await this.messageHandler.handleMessage(m);
            } catch (err) {
                logger.error("Error in message handler:", err);
                this.sessionErrors++;
                this.checkSessionHealth();
            }
        });

        // Group participant updates - direct execution
        this.client.ev.on("group-participants.update", async (update) => {
            try {
                await this.handleGroupUpdate(update);
            } catch (error) {
                logger.error("Error in group update:", error);
            }
        });

        // Store events - bind to client events
        this.store.bind(this.client.ev);

        // Start session health monitoring
        this.startHealthMonitoring();
    }

    /**
     * Start session health monitoring
     */
    startHealthMonitoring() {
        // Clear any existing interval
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        // Check session health every 5 minutes
        this.healthCheckInterval = setInterval(() => {
            this.checkSessionHealth();
        }, 300000); // 5 minutes

        logger.info("Session health monitoring started");
    }

    /**
     * Check session health and cleanup if needed
     */
    async checkSessionHealth() {
        try {
            const now = Date.now();
            const timeSinceLastCheck = now - this.lastHealthCheck;

            // Reset error counter every 10 minutes
            if (timeSinceLastCheck > 600000) {
                this.sessionErrors = 0;
                this.lastHealthCheck = now;
            }

            // If too many session errors, cleanup and reconnect
            if (this.sessionErrors >= this.maxSessionErrors) {
                logger.error(`Session health critical: ${this.sessionErrors} errors detected`);
                logger.warn("Attempting session cleanup and reconnection...");

                // Cleanup session
                await this.cleanupCorruptedSession();

                // Reset counters
                this.sessionErrors = 0;
                this.reconnectAttempts = 0;

                // Attempt reconnect
                setTimeout(() => {
                    if (!this.isConnecting) {
                        this.attemptReconnect();
                    }
                }, 3000);
            }
        } catch (error) {
            logger.error("Error checking session health:", error);
        }
    }

    /**
     * Cleanup corrupted session files
     */
    async cleanupCorruptedSession() {
        try {
            const sessionPath = config.paths.session;
            logger.warn("Cleaning up corrupted session...");

            // Close current connection
            if (this.client) {
                try {
                    await this.client.ws.close();
                } catch (err) {
                    // Ignore close errors
                }
                this.client = null;
            }

            // Delete session files
            if (fs.existsSync(sessionPath)) {
                // Backup creds.json before cleanup
                const credsPath = `${sessionPath}/creds.json`;
                if (fs.existsSync(credsPath)) {
                    const backupPath = `${sessionPath}/creds.json.backup`;
                    fs.copyFileSync(credsPath, backupPath);
                    logger.info("Session credentials backed up");
                }

                // Remove session directory
                fs.rmSync(sessionPath, { recursive: true, force: true });
                logger.info("Corrupted session cleaned up");

                // Recreate session directory
                fs.mkdirSync(sessionPath, { recursive: true });

                // Restore creds if backup exists
                const backupPath = `${sessionPath}.backup/creds.json.backup`;
                if (fs.existsSync(backupPath)) {
                    fs.copyFileSync(backupPath, `${sessionPath}/creds.json`);
                    logger.info("Session credentials restored from backup");
                }
            }

            logger.success("Session cleanup completed");
        } catch (error) {
            logger.error("Error cleaning up session:", error);
        }
    }

    /**
     * Handle connection updates
     */
    async handleConnectionUpdate({ connection, lastDisconnect, qr, isNewLogin }) {
        try {
        // Handle QR code display
        if (qr) {
            if (!QRCode) {
                QRCode = (await import('qrcode-terminal')).default;
            }
            console.log('\n');
            QRCode.generate(qr, { small: true });
            console.log('\n');
            logger.info('📱 Scan QR code di atas dengan WhatsApp Anda');
            logger.info('⚠️  PENTING: Pastikan koneksi internet stabil saat scan!');
            logger.info('⏳ Tunggu hingga muncul pesan "Bot connected"...');
        }

        switch (connection) {
            case "open":
                // Wait a bit for connection to stabilize
                await delay(2000);

                // Validate connection is actually open
                if (this.client && this.client.user) {
                    const userId = this.client.user.id.split(":")[0];
                    logger.success(`✅ Bot connected as ${userId}`);

                    // Verify session is saved
                    const credsPath = `${config.paths.session}/creds.json`;
                    if (fs.existsSync(credsPath)) {
                        logger.success('✅ Session saved successfully');
                    } else {
                        logger.warn('⚠️  Warning: Session may not be saved properly');
                    }

                    // Reset reconnection attempts on successful connection
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 3000;
                    this.isConnecting = false;

                    // Mark online after successful connection
                    if (isNewLogin) {
                        logger.info('🎉 New login detected - session established');
                    }
                } else {
                    logger.warn('⚠️  Connection opened but user info not available');
                }
                break;
            case "close":
                this.isConnecting = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || '';
                const currentTime = Date.now();

                // Log disconnect reason
                logger.warn(`Connection closed: ${statusCode || 'unknown'} - ${errorMessage}`);

                // Prevent rapid reconnection attempts
                if (currentTime - this.lastDisconnectTime < 5000) {
                    logger.warn("⏱️ Rapid disconnection detected, waiting before reconnect...");
                    this.lastDisconnectTime = currentTime;
                    return;
                }
                this.lastDisconnectTime = currentTime;

                // Handle different error codes
                if (statusCode === 515) {
                    // 515 = Restart Required - This is NORMAL after first QR scan
                    // Session is VALID, just needs reconnection
                    logger.info("🔄 Connection needs restart (this is normal after QR scan)");

                    // Check if session was saved
                    const credsPath = `${config.paths.session}/creds.json`;
                    if (fs.existsSync(credsPath)) {
                        logger.success("✅ Session saved successfully!");
                        logger.info("🔄 Auto-reconnecting in 3 seconds...");

                        // Auto-reconnect after delay
                        setTimeout(() => {
                            if (!this.isConnecting) {
                                this.reconnectAttempts = 0; // Reset counter
                                this.attemptReconnect();
                            }
                        }, 3000);
                    } else {
                        logger.warn("⚠️  Session not found, may need to scan QR again");
                        setTimeout(() => {
                            if (!this.isConnecting) {
                                this.attemptReconnect();
                            }
                        }, 3000);
                    }
                    return;
                } else if (statusCode === 401) {
                    // 401 = Unauthorized - Session truly invalid
                    logger.error("🚫 Session invalidated (logged out or banned)");

                    // Only cleanup if session exists
                    const sessionPath = config.paths.session;
                    if (fs.existsSync(sessionPath)) {
                        try {
                            fs.rmSync(sessionPath, { recursive: true, force: true });
                            fs.mkdirSync(sessionPath, { recursive: true });
                            logger.info("✅ Invalid session cleaned up");
                        } catch (err) {
                            logger.error("Failed to cleanup session:", err);
                        }
                    }

                    logger.info("💡 Please restart bot to scan QR code again");
                    process.exit(1);
                    return;
                } else if (statusCode === 403) {
                    // Device not authorized
                    logger.error("❌ Device not authorized");
                    logger.info("💡 Please delete sessionn folder and restart bot");
                    process.exit(1);
                    return;
                } else if (statusCode === 428) {
                    // Connection replaced by another session
                    logger.warn("🔄 Connection replaced by another session");
                    logger.info("💡 Close other WhatsApp sessions first");

                    setTimeout(() => {
                        if (!this.isConnecting) {
                            this.attemptReconnect();
                        }
                    }, 3000);
                    return;
                } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    // Max reconnection attempts reached
                    logger.error(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping bot.`);
                    logger.info("💡 Please check your internet connection and restart manually");
                    return;
                } else {
                    // Attempt reconnection with exponential backoff
                    this.reconnectAttempts++;
                    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30s

                    logger.warn(`🔄 Connection closed (${statusCode || 'unknown'}), attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay/1000}s...`);

                    setTimeout(() => {
                        if (!this.isConnecting) {
                            this.attemptReconnect();
                        }
                    }, delay);
                }
                break;
            case "connecting":
                if (!this.isConnecting) {
                    this.isConnecting = true;
                    logger.info("🔗 Connecting to WhatsApp...");
                }
                break;
            }
        } catch (error) {
            logger.error("Error handling connection update:", error);
        }
    }

    /**
     * Attempt to reconnect with proper state management
     */
    async attemptReconnect() {
        if (this.isConnecting) {
            logger.debug("Reconnection already in progress, skipping...");
            return;
        }

        try {
            this.isConnecting = true;
            logger.info("🔄 Attempting to reconnect...");

            // Close existing connection if any
            if (this.client) {
                try {
                    await this.client.ws.close();
                } catch (err) {
                    // Ignore close errors
                }
                this.client = null;
            }

            // Wait a bit before reconnecting
            await delay(2000);

            // Restart the bot
            await this.start();
        } catch (error) {
            this.isConnecting = false;
            logger.error("Reconnection failed:", error.message);

            // Retry with exponential backoff
            const retryDelay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 30000);
            logger.warn(`Will retry in ${retryDelay/1000} seconds...`);

            setTimeout(() => {
                if (!this.isConnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    this.attemptReconnect();
                }
            }, retryDelay);
        }
    }

    /**
     * Handle group participant updates
     */
    async handleGroupUpdate(update) {
        try {
            const isWelcome = this.services.groupService.isWelcomeEnabled(update.id);
            if (!isWelcome) return;

            const metadata = await this.services.groupService.getGroupMetadata(update.id);
            if (!metadata) return;

            for (const participant of update.participants) {
                switch (update.action) {
                    case "add":
                        await this.services.messageService.sendWelcome(
                            update.id,
                            participant,
                            metadata.subject
                        );
                        break;
                    case "remove":
                        await this.services.messageService.sendGoodbye(
                            update.id,
                            participant,
                            metadata.subject
                        );
                        break;
                    case "promote":
                        await this.services.messageService.sendPromotion(
                            update.id,
                            participant,
                            metadata.subject
                        );
                        break;
                    case "demote":
                        await this.services.messageService.sendDemotion(
                            update.id,
                            participant,
                            metadata.subject
                        );
                        break;
                }
            }
        } catch (error) {
            logger.error("Error handling group update", error);
        }
    }

    /**
     * Get pairing code
     */
    async getPairingCode() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        return new Promise((resolve) => {
            rl.question("Masukkan nomor WhatsApp (awali dengan 62): ", (phone) => {
                rl.close();
                resolve(phone.trim());
            });
        });
    }

    /**
     * Start the bot
     */
    async start() {
        try {
            logger.info("Starting WhatsApp Bot...");

            // Ensure session directory exists
            const sessionPath = config.paths.session;
            if (!fs.existsSync(sessionPath)) {
                fs.mkdirSync(sessionPath, { recursive: true });
                logger.info("📁 Session directory created");
            }

            // Setup authentication
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            logger.info(`📱 Using Baileys version: ${version.join('.')}`);
            logger.info(`🔧 Session path: ${sessionPath}`);

            // Create completely silent logger to suppress all Baileys noise
            const silentLogger = {
                level: 'silent',
                fatal: () => {},
                error: () => {},
                warn: () => {},
                info: () => {},
                debug: () => {},
                trace: () => {},
                child: () => silentLogger
            };

            // Create WhatsApp socket with optimized config
            this.client = makeWASocket({
                logger: silentLogger,
                auth: {
                    creds: state.creds,
                    keys: state.keys,
                },
                // Updated browser config to match WhatsApp Web
                browser: ["Chrome (Linux)", "", ""],
                version,
                // Connection optimization - prevent 408 timeout errors
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: undefined, // Let it use default, less strict
                keepAliveIntervalMs: 25000, // Increased from 10s to 25s for better stability
                qrTimeout: 60000,
                // Message handling
                getMessage: async (key) => {
                    if (this.store?.messages?.has(key.id)) {
                        return this.store.messages.get(key.id);
                    }
                    return undefined;
                },
                // Prevent sync issues
                printQRInTerminal: false,
                markOnlineOnConnect: false,
                syncFullHistory: false,
                defaultQueryTimeoutMs: undefined,
                // Link preview and media
                generateHighQualityLinkPreview: false,
                // Reconnect options
                shouldSyncHistoryMessage: () => false,
                emitOwnEvents: false,
                // Better handling for multi-device
                fireInitQueries: true,
                // Performance
                shouldIgnoreJid: (jid) => {
                    return jid === 'status@broadcast';
                },
                retryRequestDelayMs: 250,
                maxMsgRetryCount: 5,
                appStateMacVerification: {
                    patch: false,
                    snapshot: false
                }
            });

            // Setup pairing code ONLY for new sessions (no existing creds)
            const credsPath = `${config.paths.session}/creds.json`;
            if (config.bot.usePairingCode && !fs.existsSync(credsPath)) {
                const phoneNumber = await this.getPairingCode();
                const code = await this.client.requestPairingCode(phoneNumber);
                logger.info(`📱 Pairing code: ${code}`);
            } else if (config.bot.usePairingCode && fs.existsSync(credsPath)) {
                logger.info('🔗 Using existing session - skipping pairing code');
            }

            // IMPORTANT: Save credentials BEFORE setting up other handlers
            this.client.ev.on("creds.update", async () => {
                try {
                    await saveCreds();
                    logger.debug("Credentials saved successfully");
                } catch (error) {
                    logger.error("Failed to save credentials:", error);
                }
            });

            // Initialize services and handlers
            this.initializeServices();
            this.setupEventHandlers();

            // Load commands asynchronously
            await this.loadCommands();

            logger.success("WhatsApp Bot initialized successfully!");

        } catch (error) {
            logger.error("Failed to start bot", error);
            process.exit(1);
        }
    }

    /**
     * Stop the bot gracefully while preserving session
     */
    async stop() {
        try {
            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
                logger.info("Session health monitoring stopped");
            }

            if (this.client) {
                // Gracefully close connection without destroying session
                // Use close() instead of end() to properly clean up
                await this.client.ws.close();
                this.client = null;
                logger.info("✅ Bot stopped successfully (session preserved)");
            }
        } catch (error) {
            logger.error("❌ Error stopping bot", error);
            // Force close if graceful close fails
            if (this.client) {
                this.client = null;
            }
        }
    }

    /**
     * Force logout and destroy session (use only when needed)
     */
    async forceLogout() {
        try {
            if (this.client) {
                await this.client.logout();
                this.client = null;
                logger.info("Bot logged out and session destroyed");
            }
        } catch (error) {
            logger.error("Error during force logout", error);
        }
    }
}

export default WhatsAppBot;