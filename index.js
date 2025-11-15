// ============================================
// PART 1: IMPORTS & CONFIGURATION
// ============================================
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const session = require('express-session');
const { RedisStore } = require('connect-redis');

// Database and new modules
const { redis, initializeDatabase, User, Admin, WaNumber } = require('./db');
const authService = require('./src/auth/auth-service');

// Refactored Modules
const { getLogger } = require('./src/utils/logger');
const SessionManager = require('./src/session/session-manager');
const SessionStorage = require('./src/session/session-storage');
const WebhookQueue = require('./src/webhooks/webhook-queue');
const WebhookHandler = require('./src/webhooks/webhook-handler');
const MessageService = require('./src/services/message-service');
const PhonePairing = require('./phone-pairing');
const { encrypt, decrypt } = require('./crypto-utils');
const { initializeApiV2 } = require('./api_v2');

// Environment variables
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS) || 10;
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

// ============================================
// PART 2: APP SETUP
// ============================================
const logger = getLogger();
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Declare variables that will be initialized in startServer
let sessionManager, webhookQueue, subscriber;

// ============================================
// PART 3: WEBSOCKET & REAL-TIME MANAGEMENT
// ============================================
const dashboardClients = new Set();
const pairingSubscriptions = new Map(); // sessionId -> Set<WebSocket>

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!sessionManager || !token || !sessionManager.validateWsToken(token)) {
        ws.close(4001, 'Invalid or expired authentication token');
        return;
    }

    const userInfo = sessionManager.getUserInfoFromWsToken(token);
    logger.info('WebSocket client connected', 'WEBSOCKET', { user: userInfo.email });

    ws.on('message', (rawMessage) => {
        try {
            const message = JSON.parse(rawMessage);
            if (message.type === 'subscribe_pairing' && message.sessionId) {
                const { sessionId } = message;
                if (!pairingSubscriptions.has(sessionId)) {
                    pairingSubscriptions.set(sessionId, new Set());
                }
                pairingSubscriptions.get(sessionId).add(ws);
                ws.pairingSessionId = sessionId;
                logger.info(`Client subscribed to pairing updates for ${sessionId}`, 'WEBSOCKET');
            } else if (message.type === 'subscribe_dashboard') {
                dashboardClients.add(ws);
                ws.isDashboardClient = true;
                ws.send(JSON.stringify({
                    event: 'session-list',
                    data: sessionManager.getSessionsForUser(userInfo.email, userInfo.role === 'admin')
                }));
                logger.info('Client subscribed to dashboard updates', 'WEBSOCKET');
            }
        } catch (error) {
            logger.error('Failed to handle WebSocket message', 'WEBSOCKET', { error: error.message });
        }
    });

    ws.on('close', () => {
        if (ws.pairingSessionId && pairingSubscriptions.has(ws.pairingSessionId)) {
            pairingSubscriptions.get(ws.pairingSessionId).delete(ws);
            if (pairingSubscriptions.get(ws.pairingSessionId).size === 0) {
                pairingSubscriptions.delete(ws.pairingSessionId);
            }
        }
        if (ws.isDashboardClient) {
            dashboardClients.delete(ws);
        }
        logger.info('WebSocket client disconnected', 'WEBSOCKET');
    });

    ws.on('error', (error) => logger.error('WebSocket error', 'WEBSOCKET', { error: error.message }));
});

function broadcast(data) {
    const message = JSON.stringify(data);
    dashboardClients.forEach((ws) => {
        if (ws.readyState === ws.OPEN) {
            ws.send(message);
        }
    });
}

// ============================================
// PART 4: EXPRESS MIDDLEWARE
// ============================================
app.set('trust proxy', 1);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { status: 'error', message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
}));

        // 2. Initialize Middleware that depends on DB/Redis
        app.use(session({
            store: new RedisStore({ client: redis.client, prefix: process.env.REDIS_SESSION_PREFIX || 'wa-gateway:session:' }),
            secret: process.env.SESSION_SECRET || 'a_very_secret_key',
            resave: false,
            saveUninitialized: false,
            cookie: {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: (parseInt(process.env.SESSION_TIMEOUT_DAYS) || 1) * 24 * 60 * 60 * 1000,
            }
        }));

        app.use('/admin', express.static(path.join(__dirname, 'admin')));
        app.use('/media', express.static(path.join(__dirname, 'media')));

        // 3. Initialize services 
        const phonePairing = new PhonePairing(logger, redis);
        const sessionStorage = new SessionStorage(logger, { authDir: path.join(__dirname, 'auth_info_baileys') });
        webhookQueue = new WebhookQueue(logger, {
            maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES) || 3,
            concurrency: parseInt(process.env.WEBHOOK_CONCURRENCY) || 5,
            timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 10000
        });
        const webhookHandler = new WebhookHandler(webhookQueue, logger, async (sessionId) => {
            const settings = await sessionStorage.loadSettings(sessionId);
            const defaultWebhook = process.env.WEBHOOK_URL;
            const urls = settings?.webhooks?.length ? settings.webhooks : (defaultWebhook ? [defaultWebhook] : []);
            return urls;
        });

        // 3. Initialize SessionManager which depends on other services
        sessionManager = new SessionManager(sessionStorage, webhookHandler, logger, { User, Admin, WaNumber }, phonePairing, {
            maxSessions: MAX_SESSIONS,
            onBroadcast: (data) => broadcast(data),
        });
        
        const messageService = new MessageService(sessionManager, logger, { mediaDir: path.join(__dirname, 'media') });

        // 4. Initialize API routes which depend on all services
        const apiV2Router = initializeApiV2({ sessionManager, messageService, phonePairing, authService, logger });
        app.use('/api/v2', apiV2Router);

        // Redirect legacy API calls
        app.use('/api/v1', (req, res, next) => {
            logger.warn(`Legacy API call to /api/v1${req.path} redirected to /api/v2`, 'API');
            req.url = req.originalUrl.replace('/api/v1', '/api/v2');
            apiV2Router(req, res, next);
        });
        app.use('/api', (req, res, next) => {
            logger.warn(`Legacy API call to /api${req.path} redirected to /api/v2`, 'API');
            req.url = req.originalUrl.replace('/api', '/api/v2');
            apiV2Router(req, res, next);
        });

        // 5. Connect Redis subscriber for real-time updates
        subscriber = redis.client.duplicate();
        // await subscriber.connect(); // REMOVED: This was causing the double-connect issue. The duplicated client shares the connection.
        
        subscriber.psubscribe('wa-gateway:pairing-updates:*', (err) => {
            if (err) logger.error('Failed to subscribe to pairing updates', 'REDIS_SUB', { error: err });
            else logger.info('Subscribed to pairing update channels', 'REDIS_SUB');
        });
        subscriber.on('pmessage', (pattern, channel, message) => {
            const sessionId = channel.split(':').pop();
            if (pairingSubscriptions.has(sessionId)) {
                pairingSubscriptions.get(sessionId).forEach(ws => {
                    if (ws.readyState === ws.OPEN) ws.send(message);
                });
            }
        });

        // 6. Load persistent data and start server
        loadTokens(sessionManager);
        await sessionManager.initializeExistingSessions();

        server.listen(PORT, () => {
            logger.info(`🚀 Server is running on port ${PORT}`, 'SYSTEM');
            logger.info(`📱 Admin dashboard: ${PUBLIC_URL}/admin/dashboard.html`, 'SYSTEM');
            logger.info('✨ Real-time pairing enabled via WebSockets', 'SYSTEM');
        });
    } catch (error) {
        logger.error('Failed to start server', 'SYSTEM', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`, 'SYSTEM');
    saveTokens();
    if (subscriber) subscriber.disconnect();
    if (webhookQueue) await webhookQueue.shutdown();
    if (sessionManager) await sessionManager.shutdown();
    server.close(() => {
        logger.info('HTTP server closed.', 'SYSTEM');
        process.exit(0);
    });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();
