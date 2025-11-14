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
const FileStore = require('session-file-store')(session);
const crypto = require('crypto');

// Database and new modules
const { initializeDatabase, User, Admin, WaNumber } = require('./db');

// Refactored Modules
const { getLogger } = require('./src/utils/logger');
const SessionManager = require('./src/session/session-manager');
const SessionStorage = require('./src/session/session-storage');
const WebhookQueue = require('./src/webhooks/webhook-queue');
const WebhookHandler = require('./src/webhooks/webhook-handler');
const MessageService = require('./src/services/message-service');

// Existing modules
const PhonePairing = require('./phone-pairing');
const { encrypt, decrypt } = require('./crypto-utils');
const { initializeApiV2 } = require('./api_v2');

// Environment variables
const PORT = process.env.PORT || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS) || 10;
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;

// ============================================
// PART 2: INITIALIZE COMPONENTS
// ============================================
const logger = getLogger();
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const phonePairing = new PhonePairing(logger);

const sessionStorage = new SessionStorage(logger, {
    authDir: path.join(__dirname, 'auth_info_baileys')
});

const webhookQueue = new WebhookQueue(logger, {
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES) || 3,
    concurrency: parseInt(process.env.WEBHOOK_CONCURRENCY) || 5,
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT) || 10000
});

const webhookHandler = new WebhookHandler(
    webhookQueue,
    logger,
    async (sessionId) => {
        const settings = await sessionStorage.loadSettings(sessionId);
        if (settings && settings.webhooks && settings.webhooks.length > 0) {
            return settings.webhooks;
        }
        const defaultWebhook = process.env.WEBHOOK_URL;
        return defaultWebhook ? [defaultWebhook] : [];
    }
);

const sessionManager = new SessionManager(
    sessionStorage,
    webhookHandler,
    logger,
    { User, Admin, WaNumber }, // Pass DB models instead of userManager
    phonePairing,
    {
        maxSessions: MAX_SESSIONS,
        onBroadcast: (data) => broadcast(data),
    }
);

const messageService = new MessageService(sessionManager, logger, {
    mediaDir: path.join(__dirname, 'media')
});

// ============================================
// PART 3: WEBSOCKET MANAGEMENT
// ============================================
const wsClients = new Map();

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token || !sessionManager.validateWsToken(token)) {
        ws.close(4001, 'Invalid or expired authentication token');
        return;
    }

    const userInfo = sessionManager.getUserInfoFromWsToken(token);
    wsClients.set(ws, userInfo);
    logger.info('WebSocket client connected', 'SYSTEM', { user: userInfo.email });

    ws.on('close', () => {
        wsClients.delete(ws);
        logger.info('WebSocket client disconnected', 'SYSTEM');
    });

    ws.on('error', (error) => {
        logger.error('WebSocket error', 'SYSTEM', { error: error.message });
    });
    
    // Send initial full session list
    ws.send(JSON.stringify({
        event: 'session-list',
        data: sessionManager.getSessionsForUser(userInfo.email, userInfo.role === 'admin')
    }));
});

function broadcast(data) {
    const message = JSON.stringify(data);
    wsClients.forEach((userInfo, ws) => {
        if (ws.readyState === ws.OPEN) {
            const isAdmin = userInfo.role === 'admin';
            const session = data.sessionId ? sessionManager.getSession(data.sessionId) : null;
            const isOwner = session && session.owner === userInfo.email;

            if (isAdmin || isOwner || !session) {
                ws.send(message);
            }
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

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { status: 'error', message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(apiLimiter);

const sessionStore = new FileStore({
    path: path.join(__dirname, 'sessions'),
    logFn: logger.debug.bind(logger),
    ttl: (parseInt(process.env.SESSION_TIMEOUT_DAYS) || 1) * 24 * 60 * 60,
});

app.use(session({
    store: sessionStore,
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

// ============================================
// PART 5: TOKEN PERSISTENCE
// ============================================
const ENCRYPTED_TOKENS_FILE = path.join(__dirname, 'session_tokens.enc');

function saveTokens() {
    try {
        const tokensMap = sessionManager.getTokens();
        if (tokensMap.size === 0) return;
        const encrypted = encrypt(JSON.stringify(Object.fromEntries(tokensMap)), ENCRYPTION_KEY);
        fs.writeFileSync(ENCRYPTED_TOKENS_FILE, encrypted, 'utf-8');
        if (process.platform !== 'win32') fs.chmodSync(ENCRYPTED_TOKENS_FILE, 0o600);
        logger.debug('Session tokens saved to disk', 'SYSTEM');
    } catch (error) {
        logger.error('Error saving tokens', 'SYSTEM', { error: error.message });
    }
}

function loadTokens() {
    try {
        if (fs.existsSync(ENCRYPTED_TOKENS_FILE)) {
            const encrypted = fs.readFileSync(ENCRYPTED_TOKENS_FILE, 'utf-8');
            const decrypted = decrypt(encrypted, ENCRYPTION_KEY);
            const tokensMap = new Map(Object.entries(JSON.parse(decrypted)));
            sessionManager.loadTokens(tokensMap);
            logger.info(`Loaded ${tokensMap.size} session token(s) from disk`, 'SYSTEM');
        }
    } catch (error) {
        logger.error('Error loading tokens', 'SYSTEM', { error: error.message });
    }
}

// ============================================
// PART 6: ADMIN & AUTH ROUTES
// ============================================
app.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });

    try {
        let user = await Admin.authenticate(email, password);
        let role = 'admin';
        if (!user) {
            user = await User.authenticate(email, password);
            role = 'user';
        }

        if (user) {
            req.session.authed = true;
            req.session.user = { id: user.id, email: user.email, role: role };
            logger.info(`User logged in: ${user.email}`, 'AUTH');
            return res.json({ success: true, role: role, email: user.email });
        }
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    } catch (error) {
        logger.error('Login error', 'AUTH', { error: error.message });
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    }
});

app.post('/admin/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            logger.error('Logout error', 'AUTH', { error: err.message });
            return res.status(500).json({ success: false });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, redirect: '/admin/login.html' });
    });
});

app.get('/api/v1/ws-auth', (req, res) => {
    if (!req.session.authed) return res.status(401).json({ error: 'Unauthorized' });
    const wsToken = sessionManager.generateWsToken(req.session.user);
    res.json({ wsToken });
});

// ============================================
// PART 7: INITIALIZE API ROUTES
// ============================================
const apiV2Router = initializeApiV2({
    sessionManager,
    messageService,
    phonePairing,
    logger
});
app.use('/api/v2', apiV2Router);

// Redirect legacy API calls to v2 where possible
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


// ============================================
// PART 8: SERVER STARTUP
// ============================================
app.get('/', (req, res) => res.redirect('/admin/dashboard.html'));
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

async function startServer() {
    try {
        await initializeDatabase();
        logger.info('Database connections established.', 'SYSTEM');

        loadTokens();
        await sessionManager.initializeExistingSessions();

        server.listen(PORT, () => {
            logger.info(`🚀 Server is running on port ${PORT}`, 'SYSTEM');
            logger.info(`📱 Admin dashboard: ${PUBLIC_URL}/admin/dashboard.html`, 'SYSTEM');
            logger.info(`✨ Refactored to modular architecture`, 'SYSTEM');
        });
    } catch (error) {
        logger.error('Failed to start server', 'SYSTEM', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`, 'SYSTEM');
    saveTokens();
    await sessionManager.shutdown();
    await webhookQueue.shutdown();
    server.close(() => {
        logger.info('HTTP server closed.', 'SYSTEM');
        process.exit(0);
    });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();