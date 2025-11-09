// Gemini Final Fix - Version 2.0
const SCRIPT_VERSION = "GEMINI_FIX_V2";
console.log(`Starting Super-Light-Web-Whatsapp-API-Server - Version: ${SCRIPT_VERSION}`);

// Memory optimization for production environments
globalThis.crypto = require('node:crypto').webcrypto; // Ensure Web Crypto API is globally available for Baileys

if (process.env.NODE_ENV === 'production') {
    // Limit V8 heap if not already set
    if (!process.env.NODE_OPTIONS) {
        process.env.NODE_OPTIONS = '--max-old-space-size=1024';
    }
    // Optimize garbage collection
    if (global.gc) {
        setInterval(() => {
            global.gc();
        }, 60000); // Run GC every minute
    }
}

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    isJidBroadcast,
    Browsers
} = require('@whiskeysockets/baileys');
const RedisAuthState = require('./redis-auth-state');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { initializeApi, apiToken, getWebhookUrl } = require('./api_v1');
const { initializeLegacyApi } = require('./legacy_api');
const { randomUUID } = require('crypto');
const crypto = require('crypto'); // Add crypto for encryption
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const UserManager = require('./users');
const ActivityLogger = require('./activity-logger');
const PhonePairing = require('./phone-pairing');
const { Curve, signedKeyPair } = require('@whiskeysockets/baileys/lib/Utils/crypto'); // Import Curve and signedKeyPair for key generation

const redis = require('redis');
const sessions = new Map();
const retries = new Map();
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
let schedulerInterval;

// Initialize Redis client
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  },
  password: process.env.REDIS_PASSWORD
});

// Initialize webhook queue
const WebhookQueue = require('./webhook-queue');
let webhookQueue;

// Initialize Redis connection
(async () => {
  try {
    await redisClient.connect();
    console.log('✅ Redis client connected successfully');
    
    // Initialize webhook queue after Redis connection
    webhookQueue = new WebhookQueue();
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error.message);
    process.exit(1);
  }
})();

// Track WebSocket connections with their associated users
const wsClients = new Map(); // Maps WebSocket client to user info

const logger = pino({ level: 'debug' });

const TOKENS_FILE = path.join(__dirname, 'session_tokens.json');
const ENCRYPTED_TOKENS_FILE = path.join(__dirname, 'session_tokens.enc');
let sessionTokens = new Map();

// Encryption key - MUST be stored in .env file
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
if (!process.env.TOKEN_ENCRYPTION_KEY) {
    console.warn('⚠️  WARNING: Using random encryption key. Set TOKEN_ENCRYPTION_KEY in .env file!');
    console.warn(`Add this to your .env file: TOKEN_ENCRYPTION_KEY=${ENCRYPTION_KEY}`);
}

// Initialize user management and activity logging
const userManager = new UserManager(ENCRYPTION_KEY);
const activityLogger = new ActivityLogger(ENCRYPTION_KEY);
const phonePairing = new PhonePairing(log);

// Encryption functions
function encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

// Enhanced token management with encryption
function saveTokens() {
    try {
        const tokensToSave = Object.fromEntries(sessionTokens);
        const jsonString = JSON.stringify(tokensToSave, null, 2);
        const encrypted = encrypt(jsonString);
        
        fs.writeFileSync(ENCRYPTED_TOKENS_FILE, encrypted, 'utf-8');
        
        // Set file permissions (read/write for owner only)
        if (process.platform !== 'win32') {
            fs.chmodSync(ENCRYPTED_TOKENS_FILE, 0o600);
        }
        
        // Keep backward compatibility - save plain JSON but with warning
        if (fs.existsSync(TOKENS_FILE)) {
            fs.unlinkSync(TOKENS_FILE); // Remove old plain file
        }
    } catch (error) {
        console.error('Error saving encrypted tokens:', error);
        throw error; // Rethrow the error so the caller can handle it
    }
}

function loadTokens() {
    try {
        // Try to load encrypted file first
        if (fs.existsSync(ENCRYPTED_TOKENS_FILE)) {
            const encrypted = fs.readFileSync(ENCRYPTED_TOKENS_FILE, 'utf-8');
            const decrypted = decrypt(encrypted);
            const tokensFromFile = JSON.parse(decrypted);
            
            sessionTokens.clear();
            for (const [key, value] of Object.entries(tokensFromFile)) {
                sessionTokens.set(key, value);
            }
            return;
        }
        
        // Fallback: migrate from old plain JSON file
        if (fs.existsSync(TOKENS_FILE)) {
            console.log('📦 Migrating plain tokens to encrypted format...');
            const tokensFromFile = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
            
            sessionTokens.clear();
            for (const [key, value] of Object.entries(tokensFromFile)) {
                sessionTokens.set(key, value);
            }
            
            // Save as encrypted and remove old file
            saveTokens();
            fs.unlinkSync(TOKENS_FILE);
            console.log('✅ Migration complete! Tokens are now encrypted.');
        }
    } catch (error) {
        console.error('Error loading tokens:', error);
        sessionTokens.clear();
    }
}

// --- PATH DEBUGGING ---
console.log(`[PATH_DEBUG] __dirname: ${__dirname}`);
// Persistent directory paths
const SESSION_PATH = process.env.SESSION_PATH || path.join(__dirname, 'sessions');
const AUTH_PATH = process.env.AUTH_PATH || path.join(__dirname, 'auth_info_baileys');
const mediaDir = path.join(__dirname, 'media');
console.log(`[PATH_DEBUG] SESSION_PATH: ${SESSION_PATH}`);
console.log(`[PATH_DEBUG] AUTH_PATH: ${AUTH_PATH}`);
console.log(`[PATH_DEBUG] mediaDir: ${mediaDir}`);

// Ensure all necessary directories exist
[SESSION_PATH, AUTH_PATH, mediaDir].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[SYSTEM] Created directory: ${dir}`);
    }
  } catch (error) {
      console.error(`[SYSTEM] FATAL: Could not create directory ${dir}. Please check permissions. Error: ${error.message}`);
      process.exit(1);
  }
});

// Trust proxy for cPanel and other reverse proxy environments
// Only trust first proxy, not all (prevents security issues)
app.set('trust proxy', 1);

app.use(bodyParser.json({ limit: '10mb' })); // Increased limit to handle larger requests
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/media', express.static(mediaDir)); // Serve uploaded media
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Increased limit for urlencoded data
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'"]
      }
    }
  })
);
app.use(rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { status: 'error', message: 'Too many requests, please try again later.' },
    // Trust only first proxy, not all (security fix)
    trustProxy: 1,
    standardHeaders: true,
    legacyHeaders: false
}));

const ADMIN_PASSWORD = process.env.ADMIN_DASHBOARD_PASSWORD;

// Session limits configuration
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS) || 10;
const SESSION_TIMEOUT_HOURS = parseInt(process.env.SESSION_TIMEOUT_HOURS) || 24;

// Reconnection logic
const MAX_RETRIES = 5;
const RETRY_DELAYS = [5000, 10000, 30000, 60000, 120000]; // ms

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    // Try to authenticate the WebSocket connection
    const url = new URL(req.url, `http://${req.headers.host}`);
    const wsToken = url.searchParams.get('token');
    
    let userInfo = null;
    
    if (wsToken && global.wsAuthTokens) {
        const tokenData = global.wsAuthTokens.get(wsToken);
        if (tokenData && tokenData.expires > Date.now()) {
            userInfo = {
                email: tokenData.email,
                role: tokenData.role
            };
            // Delete the token after use (one-time use)
            global.wsAuthTokens.delete(wsToken);
        }
    }
    
    // Store the user info for this WebSocket client
    wsClients.set(ws, userInfo);
    
    // Send initial session data based on user permissions
    if (userInfo) {
        ws.send(JSON.stringify({
            type: 'session-update',
            data: getSessionsDetails(userInfo.email, userInfo.role === 'admin')
        }));
    }
    
    ws.on('close', () => {
        // Clean up when client disconnects
        wsClients.delete(ws);
    });
});

app.use(session({
  store: new FileStore({
    path: SESSION_PATH,
    retries: 5, // Tambah retry attempts
    minTimeout: 100,
    maxTimeout: 500,
    reapInterval: 3600, // Cleanup expired sessions setiap 1 jam
    ttl: 86400, // Session TTL 24 jam
    logFn: (msg) => {
      // Suppress retry errors yang tidak fatal
      if (!msg.includes('will retry')) {
        console.log('[session-file-store]', msg);
      }
    }
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 86400000 // 24 jam
  }
}));

// Serve homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve API documentation
app.get('/api-documentation', (req, res) => {
    res.sendFile(path.join(__dirname, 'api_documentation.html'));
});

// Redirect old URL to new one
app.get('/api_documentation.md', (req, res) => {
    res.redirect('/api-documentation');
});

// Admin login endpoint - supports both legacy password and new email/password
app.post('/admin/login', express.json(), async (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    
    // Legacy support: if only password is provided, try admin password
    if (!email && password === ADMIN_PASSWORD) {
        req.session.adminAuthed = true;
        req.session.userEmail = 'admin@localhost';
        req.session.userRole = 'admin';
        await activityLogger.logLogin('admin@localhost', ip, userAgent, true);
        return res.json({ success: true, role: 'admin' });
    }
    
    // New email/password authentication
    if (email && password) {
        const user = await userManager.authenticateUser(email, password);
        if (user) {
            req.session.adminAuthed = true;
            req.session.userEmail = user.email;
            req.session.userRole = user.role;
            req.session.userId = user.id;
            await activityLogger.logLogin(user.email, ip, userAgent, true);
            return res.json({
                success: true, 
                role: user.role,
                email: user.email 
            });
        }
    }
    
    await activityLogger.logLogin(email || 'unknown', ip, userAgent, false);
    res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Middleware to protect admin dashboard
function requireAdminAuth(req, res, next) {
    if (req.session && req.session.adminAuthed) {
        return next();
    }
    res.status(401).sendFile(path.join(__dirname, 'admin', 'login.html'));
}

// Middleware to check if user is admin role
function requireAdminRole(req, res, next) {
    if (req.session && req.session.adminAuthed && req.session.userRole === 'admin') {
        return next();
    }
    res.status(403).json({ success: false, message: 'Admin access required' });
}

// Helper to get current user info
function getCurrentUser(req) {
    if (!req.session || !req.session.adminAuthed) return null;
    return {
        email: req.session.userEmail,
        role: req.session.userRole,
        id: req.session.userId
    };
}

// Serve login page only if not authenticated
app.get('/admin/login.html', (req, res) => {
    if (req.session && req.session.adminAuthed) {
        return res.redirect('/admin/dashboard.html');
    }
    res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// Protect dashboard and /admin route
app.get('/admin/dashboard.html', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});
app.get('/admin', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

// Protect user management page (admin only)
app.get('/admin/users.html', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'users.html'));
});

// Protect activities page
app.get('/admin/activities.html', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'activities.html'));
});

// Protect campaigns page
app.get('/admin/campaigns.html', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'campaigns.html'));
});

// Admin logout endpoint
app.post('/admin/logout', requireAdminAuth, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true, redirect: '/admin/login.html' });
    });
});

// User management endpoints
app.get('/api/v1/users', requireAdminAuth, (req, res) => {
    const currentUser = getCurrentUser(req);
    if (currentUser.role === 'admin') {
        // Admin can see all users
        res.json(userManager.getAllUsers());
    } else {
        // Regular users can only see themselves
        res.json([userManager.getUser(currentUser.email)]);
    }
});

app.post('/api/v1/users', requireAdminRole, async (req, res) => {
    const { email, password, role = 'user' } = req.body;
    const currentUser = getCurrentUser(req);
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    
    try {
        const newUser = await userManager.createUser({
            email,
            password,
            role,
            createdBy: currentUser.email
        });
        
        await activityLogger.logUserCreate(currentUser.email, email, role, ip, userAgent);
        res.status(201).json(newUser);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/v1/users/:email', requireAdminRole, async (req, res) => {
    const { email } = req.params;
    const updates = req.body;
    const currentUser = getCurrentUser(req);
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    
    try {
        const updatedUser = await userManager.updateUser(email, updates);
        await activityLogger.logUserUpdate(currentUser.email, email, updates, ip, userAgent);
        res.json(updatedUser);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/v1/users/:email', requireAdminRole, async (req, res) => {
    const { email } = req.params;
    const currentUser = getCurrentUser(req);
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    
    try {
        await userManager.deleteUser(email);
        await activityLogger.logUserDelete(currentUser.email, email, ip, userAgent);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get current user info
app.get('/api/v1/me', (req, res) => {
    if (!req.session || !req.session.adminAuthed) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    const currentUser = getCurrentUser(req);
    const user = userManager.getUser(currentUser.email);
    res.json(user);
});

// Generate WebSocket authentication token
app.get('/api/v1/ws-auth', requireAdminAuth, (req, res) => {
    const currentUser = getCurrentUser(req);
    // Create a temporary token for WebSocket authentication
    const wsToken = crypto.randomBytes(32).toString('hex');
    
    // Store the token temporarily (expires in 30 seconds)
    const tokenData = {
        email: currentUser.email,
        role: currentUser.role,
        expires: Date.now() + 30000 // 30 seconds
    };
    
    // Store in a temporary map (you might want to use Redis in production)
    if (!global.wsAuthTokens) {
        global.wsAuthTokens = new Map();
    }
    global.wsAuthTokens.set(wsToken, tokenData);
    
    // Clean up expired tokens
    setTimeout(() => {
        global.wsAuthTokens.delete(wsToken);
    }, 30000);
    
    res.json({ wsToken });
});

// Activity endpoints
app.get('/api/v1/activities', requireAdminAuth, async (req, res) => {
    const currentUser = getCurrentUser(req);
    const { limit = 100, startDate, endDate } = req.query;
    
    if (currentUser.role === 'admin') {
        // Admin can see all activities
        const activities = await activityLogger.getActivities({
            limit: parseInt(limit),
            startDate,
            endDate
        });
        res.json(activities);
    } else {
        // Regular users see only their activities
        const activities = await activityLogger.getUserActivities(currentUser.email, parseInt(limit));
        res.json(activities);
    }
});

app.get('/api/v1/activities/summary', requireAdminRole, async (req, res) => {
    const { days = 7 } = req.query;
    const summary = await activityLogger.getActivitySummary(null, parseInt(days));
    res.json(summary);
});

// Test endpoint to verify log injection
app.get('/admin/test-logs', requireAdminAuth, (req, res) => {
    let logData = [];
    try {
        if (fs.existsSync(SYSTEM_LOG_FILE)) {
            const lines = fs.readFileSync(SYSTEM_LOG_FILE, 'utf-8').split('\n').filter(Boolean);
            const entries = lines.map(line => {
                try { return JSON.parse(line); } catch { return null; }
            }).filter(Boolean);
            logData = entries;
        }
    } catch (error) {
        console.error('Test endpoint error:', error);
    }
    res.json({
        logFileExists: fs.existsSync(SYSTEM_LOG_FILE),
        logCount: logData.length,
        logs: logData
    });
});

// Update logs endpoint
app.post('/admin/update-logs', requireAdminAuth, express.json(), (req, res) => {
    const { logs } = req.body;
    
    if (!Array.isArray(logs)) {
        return res.status(400).json({ error: 'Invalid logs data' });
    }
    
    try {
        // Clear the in-memory log
        systemLog.length = 0;
        
        // Update in-memory log with new data
        logs.forEach(log => {
            if (log.details && log.details.event === 'messages-sent') {
                systemLog.push(log);
            }
        });
        
        // Rewrite the system.log file
        const logLines = logs.map(log => JSON.stringify(log)).join('\n');
        fs.writeFileSync(SYSTEM_LOG_FILE, logLines + '\n');
        
        log('System log updated', 'SYSTEM', { event: 'log-updated', count: logs.length });
        res.json({ success: true, message: 'Logs updated successfully' });
    } catch (error) {
        console.error('Error updating logs:', error);
        res.status(500).json({ error: 'Failed to update logs' });
    }
});

const v1ApiRouter = initializeApi(sessions, sessionTokens, createSession, getSessionsDetails, deleteSession, log, userManager, activityLogger, phonePairing, saveSessionSettings, undefined, redisClient);
const legacyApiRouter = initializeLegacyApi(sessions, sessionTokens);
app.use('/api/v1', v1ApiRouter);
app.use('/api', legacyApiRouter); // Mount legacy routes at /api

// Set up campaign sender event listeners for WebSocket updates
if (v1ApiRouter.campaignSender) {
    v1ApiRouter.campaignSender.on('progress', (data) => {
        // Broadcast campaign progress to authenticated WebSocket clients
        wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
                const userInfo = wsClients.get(client);
                if (userInfo) {
                    client.send(JSON.stringify({
                        type: 'campaign-progress',
                        ...data
                    }));
                }
            }
        });
    });
    
    v1ApiRouter.campaignSender.on('status', (data) => {
        // Broadcast campaign status updates
        wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
                const userInfo = wsClients.get(client);
                if (userInfo) {
                    client.send(JSON.stringify({
                        type: 'campaign-status',
                        ...data
                    }));
                }
            }
        });
    });
}
// Prevent serving sensitive files
app.use((req, res, next) => {
    if (req.path.includes('session_tokens.json') || req.path.endsWith('.bak')) {
        return res.status(403).send('Forbidden');
    }
    next();
});

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            const userInfo = wsClients.get(client);
            
            // If it's a session update, filter based on user permissions
            if (data.type === 'session-update') {
                let filteredData = { ...data };
                
                if (userInfo && userInfo.email) {
                    // Send filtered sessions based on user permissions
                    filteredData.data = getSessionsDetails(userInfo.email, userInfo.role === 'admin');
                } else {
                    // Unauthenticated connections get no session data
                    filteredData.data = [];
                }
                
                client.send(JSON.stringify(filteredData));
            } else {
                // For other message types (logs), send as-is
                client.send(JSON.stringify(data));
            }
        }
    });
}

// System log history (in-memory)
const systemLog = [];
const MAX_LOG_ENTRIES = 1000;
const SYSTEM_LOG_FILE = path.join(__dirname, 'system.log');

// Load last N log entries from disk on startup
function loadSystemLogFromDisk() {
    if (!fs.existsSync(SYSTEM_LOG_FILE)) return;
    const lines = fs.readFileSync(SYSTEM_LOG_FILE, 'utf-8').split('\n').filter(Boolean);
    const lastLines = lines.slice(-MAX_LOG_ENTRIES);
    for (const line of lastLines) {
        try {
            const entry = JSON.parse(line);
            systemLog.push(entry);
        } catch {}
    }
}

function rotateSystemLogIfNeeded() {
    try {
        if (fs.existsSync(SYSTEM_LOG_FILE)) {
            const stats = fs.statSync(SYSTEM_LOG_FILE);
            if (stats.size > 5 * 1024 * 1024) { // 5MB
                if (fs.existsSync(SYSTEM_LOG_FILE + '.bak')) {
                    fs.unlinkSync(SYSTEM_LOG_FILE + '.bak');
                }
                fs.renameSync(SYSTEM_LOG_FILE, SYSTEM_LOG_FILE + '.bak');
            }
        }
    } catch (e) {
        console.error('Failed to rotate system.log:', e.message);
    }
}

function log(message, sessionId = 'SYSTEM', details = {}) {
    const logEntry = {
        type: 'log',
        sessionId,
        message,
        details,
        timestamp: new Date().toISOString()
    };
    // Only persist and show in dashboard if this is a sent message log (event: 'messages-sent')
    if (details && details.event === 'messages-sent') {
        systemLog.push(logEntry);
        if (systemLog.length > MAX_LOG_ENTRIES) {
            systemLog.shift(); // Remove oldest
        }
        try {
            rotateSystemLogIfNeeded();
            fs.appendFileSync(SYSTEM_LOG_FILE, JSON.stringify(logEntry) + '\n');
        } catch (e) {
            console.error('Failed to write to system.log:', e.message);
        }
    }
    console.log(`[${sessionId}] ${message}`);
    broadcast(logEntry);
}

// --- Start Webhook Settings Management ---
function getSettingsFilePath(sessionId) {
    return path.join(__dirname, 'auth_info_baileys', sessionId, 'settings.json');
}

async function saveSessionSettings(sessionId, settings) {
    try {
        const filePath = getSettingsFilePath(sessionId);
        await fs.promises.writeFile(filePath, JSON.stringify(settings, null, 2));
        // Update in-memory session object
        if (sessions.has(sessionId)) {
            sessions.get(sessionId).settings = settings;
        }
        log(`Webhook settings saved for session ${sessionId}`, sessionId);
    } catch (error) {
        log(`Error saving settings for session ${sessionId}: ${error.message}`, sessionId, { error });
        throw error;
    }
}

async function loadSessionSettings(sessionId) {
    try {
        const filePath = getSettingsFilePath(sessionId);
        if (fs.existsSync(filePath)) {
            const data = await fs.promises.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        log(`Error loading settings for session ${sessionId}: ${error.message}`, sessionId, { error });
    }
    return {}; // Return empty object if no settings found or error
}
// --- End Webhook Settings Management ---

// Update postToWebhook to accept sessionId and use getWebhookUrl(sessionId)
async function postToWebhook(data) {
    const sessionId = data.sessionId || 'SYSTEM';
    const webhookUrl = await getWebhookUrl(sessionId); // Changed to await since it's now async
    if (!webhookUrl) return;

    try {
        if (webhookQueue) {
            // Add to queue for asynchronous processing
            await webhookQueue.addToQueue(sessionId, webhookUrl, data);
            log(`Webhook job queued for: ${webhookUrl}`, sessionId);
        } else {
            // Fallback to direct call if queue is not available
            await axios.post(webhookUrl, data, {
                headers: { 'Content-Type': 'application/json' }
            });
            log(`Successfully posted to webhook: ${webhookUrl}`);
        }
    } catch (error) {
        log(`Failed to queue/post to webhook: ${error.message}`);
    }
}

function updateSessionState(sessionId, status, detail, qr, reason) {
    const oldSession = sessions.get(sessionId) || {};
    const newSession = {
        ...oldSession,
        sessionId: sessionId, // Explicitly ensure sessionId is preserved
        status,
        detail,
        qr, // This is the QR code string when available
        reason
    };
    sessions.set(sessionId, newSession);

    try {
        // Log QR code availability for debugging
        if (qr) {
            log(`QR code updated for ${sessionId}, broadcasting to clients`, sessionId);
        }
        
        broadcast({ type: 'session-update', data: getSessionsDetails() });
    } catch (error) {
        log(`Error broadcasting session update for ${sessionId}: ${error.message}`, sessionId, { error });
    }

    postToWebhook({
        event: 'session-status',
        sessionId,
        status,
        detail,
        reason
    });
}

async function createSessionWithRetry(sessionId, retryCount = 0) {
    const session = sessions.get(sessionId);
    if (session) {
        session.retryCount = retryCount;
    }
    const pairingInfo = phonePairing.getPairingStatus(sessionId);
    const phoneNumber = pairingInfo ? pairingInfo.phoneNumber : null;

    const updateStatus = (status, detail, qr = '', reason = '') => {
        if (pairingInfo) {
            phonePairing.updatePairingStatus(sessionId, { status, detail, qr, reason });
        }
        updateSessionState(sessionId, status, detail, qr, reason);
    };

    updateStatus('CONNECTING', 'Initializing session...');
    log('Starting session...', sessionId);

    // Load settings for the session
    const settings = await loadSessionSettings(sessionId);
    if (sessions.has(sessionId)) {
        sessions.get(sessionId).settings = settings;
    }

    try {
            // Use Redis auth state instead of file-based
            const { creds, keys } = await RedisAuthState.createAuthState(redisClient, sessionId);
        
            // Ensure noiseKey is initialized for new sessions or if missing
            if (!creds.noiseKey) {
                creds.noiseKey = Curve.generateKeyPair();
                log(`Generated new noiseKey for session ${sessionId}`, sessionId);
                // Also save this new creds to Redis immediately
                await RedisAuthState.prototype.saveCreds.call({ redis: redisClient, sessionId }, creds);
            }

            // Ensure signedIdentityKey is initialized for new sessions or if missing
            if (!creds.signedIdentityKey) {
                creds.signedIdentityKey = Curve.generateKeyPair();
                log(`Generated new signedIdentityKey for session ${sessionId}`, sessionId);
                // Save immediately
                await RedisAuthState.prototype.saveCreds.call({ redis: redisClient, sessionId }, creds);
            }

            // Ensure signedPreKey is initialized for new sessions or if missing
            // signedPreKey requires a keyId and keyPair
            if (!creds.signedPreKey) {
                // keyId is usually 1, but can be any unique ID
                creds.signedPreKey = signedKeyPair(creds.signedIdentityKey, 1);
                log(`Generated new signedPreKey for session ${sessionId}`, sessionId);
                // Save immediately
                await RedisAuthState.prototype.saveCreds.call({ redis: redisClient, sessionId }, creds);
            }

            // Ensure registrationId is initialized for new sessions or if missing
            if (!creds.registrationId) {
                creds.registrationId = Math.floor(Math.random() * 16383) + 1; // Random 1-16383
                log(`Generated new registrationId for session ${sessionId}`, sessionId);
                // Save immediately
                await RedisAuthState.prototype.saveCreds.call({ redis: redisClient, sessionId }, creds);
            }
        
            const { version, isLatest } = await fetchLatestBaileysVersion();
            log(`Using WA version: ${version.join('.')}, isLatest: ${isLatest}`, sessionId);
        const sock = makeWASocket({
            version,
            auth: {
                creds: creds,
                keys: makeCacheableSignalKeyStore(keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Chrome'), // Changed to macOS browser
            virtualLinkPreviewEnabled: false,  // More aggressive optimization
            shouldIgnoreJid: (jid) => isJidBroadcast(jid),
            qrTimeout: 60000, // Increased timeout to 60 seconds
            connectTimeoutMs: 90000, // Increased timeout to 90 seconds
            keepAliveIntervalMs: 45000,  // Increased from 30000 to reduce connection overhead
            fireInitQueries: false,
            emitOwnEvents: false,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            retryRequestDelayMs: 3000,  // Increased from 2000 to reduce retry frequency
            maxMsgRetryCount: 3,
            // Add timeout for socket connection
            connectOpts: {
                timeout: 90000, // 90 seconds
            }
        });

    sock.ev.on('creds.update', async (creds) => {
        await RedisAuthState.prototype.saveCreds.call(
            { redis: redisClient, sessionId }, 
            creds
        );
    });

    // --- Start Advanced Webhook Handler ---
    async function handleWebhookForMessage(message, sessionId) {
        const session = sessions.get(sessionId);
        // Ensure settings are loaded
        if (!session) {
            return;
        }
        
        // Ensure settings exist, default to empty object if not
        const settings = session.settings || {};
        
        // Check if we have either session-specific webhooks or a default webhook
        const hasWebhooks = settings.webhooks && settings.webhooks.length > 0;
        const initialDefaultWebhookUrl = await getWebhookUrl(sessionId); // Get default webhook for this session
        if (!hasWebhooks && !initialDefaultWebhookUrl) {
            return; // No webhooks configured for this session
        }
        const msg = message.messages[0];
        if (!msg.message) return; // Ignore empty messages, notifications, etc.

        const fromMe = msg.key.fromMe;
        const isGroup = msg.key.remoteJid.endsWith('@g.us');
        
        // Get the primary key of the message content to determine its type
        const messageType = Object.keys(msg.message)[0];

        // --- Apply Filters based on settings ---
        if (fromMe && !settings.webhook_from_me) return;
        if (isGroup && !settings.webhook_group) return;
        if (!isGroup && !settings.webhook_individual) return;

        // Map Baileys message types to our setting keys
        const typeFilterMap = {
            'imageMessage': 'save_image',
            'videoMessage': 'save_video',
            'audioMessage': 'save_audio',
            'stickerMessage': 'save_sticker',
            'documentMessage': 'save_document',
            'documentWithCaptionMessage': 'save_document' // Treat this as a document
        };

        const settingKeyForType = typeFilterMap[messageType];
        if (settingKeyForType && !settings[settingKeyForType]) {
            // This message type is explicitly disabled in the settings, so we stop here.
            return;
        }
        
        // --- If all filters pass, prepare and send the webhook ---
        const payload = {
            event: 'message',
            sessionId,
            from: msg.key.remoteJid,
            fromMe: fromMe,
            isGroup: isGroup,
            messageId: msg.key.id,
            timestamp: msg.messageTimestamp,
            data: msg
        };

        log(`Message from ${payload.from} passed filters. Sending to webhooks...`, sessionId);

        // Array to hold all webhook URLs to send to
        const allWebhookUrls = [];
        
        // Add session-specific webhooks if they exist
        if (settings.webhooks && Array.isArray(settings.webhooks) && settings.webhooks.length > 0) {
            allWebhookUrls.push(...settings.webhooks);
        }
        
        // Add default webhook for this session if it's different from session-specific ones
        const sessionDefaultWebhookUrl = await getWebhookUrl(sessionId);
        if (sessionDefaultWebhookUrl && !allWebhookUrls.includes(sessionDefaultWebhookUrl)) {
            allWebhookUrls.push(sessionDefaultWebhookUrl);
        }

        // Only proceed if we have URLs to send to
        if (allWebhookUrls.length === 0) {
            return; // No webhooks configured
        }

        for (const url of allWebhookUrls) {
            try {
                // Add webhook to queue for asynchronous processing
                if (webhookQueue) {
                    await webhookQueue.addToQueue(sessionId, url, payload);
                    log(`Webhook job queued for ${url}`, sessionId);
                } else {
                    // Fallback to direct call if queue is not available
                    await axios.post(url, payload, {
                        headers: { 'Content-Type': 'application/json' }
                    });
                    log(`Sent message webhook to ${url}`, sessionId);
                }
            } catch (error) {
                log(`Failed to queue/send message webhook to ${url}: ${error.message}`, sessionId, { error });
            }
        }
    }
    // --- End Advanced Webhook Handler ---

    sock.ev.on('messages.upsert', async (m) => {
        // Pass the entire message object to our new handler
        await handleWebhookForMessage(m, sessionId);
    });

    sock.ev.on('connection.update', async (update) => {
        log(`Connection update for ${sessionId}: ${JSON.stringify(update)}`, sessionId); // Added detailed log

        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            if (pairingInfo) {
                // This is a pairing session. Request a phone code instead of using the QR.
                try {
                    log(`Requesting pairing code for ${phoneNumber}...`, sessionId);
                    updateStatus('AWAITING_PAIRING', 'Requesting pairing code...');

                    const pairingCode = await sock.requestPairingCode(phoneNumber);
                    const formattedCode = pairingCode.slice(0, 4) + '-' + pairingCode.slice(4);
                    log(`Pairing code generated: ${formattedCode}`, sessionId);

                    phonePairing.updatePairingStatus(sessionId, {
                        status: 'AWAITING_PAIRING',
                        detail: `Enter this code in WhatsApp: ${formattedCode}`,
                        pairingCode: formattedCode
                    });
                    updateSessionState(sessionId, 'AWAITING_PAIRING', `Enter this code in WhatsApp: ${formattedCode}`, '', '');

                } catch (error) {
                    log(`Failed to request pairing code: ${error.message}`, sessionId, { error });
                    updateStatus('PAIRING_FAILED', `Failed to get pairing code: ${error.message}`);
                }
            } else {
                // This is a regular session, so use the QR code.
                log('QR code generated.', sessionId);
                updateStatus('GENERATING_QR', 'QR code available.', qr);
            }
        }

        if (connection === 'open') {
            log(`Connection is now open for ${sessionId}.`);
            const session = sessions.get(sessionId);
            if (session) {
                session.retryCount = 0; // Reset retry count on successful connection
            }
            
            let detailMessage = `Connected as ${sock.user?.name || 'Unknown'}`;
            if (pairingInfo && pairingInfo.status.includes('AWAITING')) {
                detailMessage = `Phone number ${pairingInfo.phoneNumber} successfully paired!`;
                phonePairing.updatePairingStatus(sessionId, {
                    status: 'CONNECTED',
                    detail: detailMessage
                });
                postToWebhook({
                    event: 'phone-pair-success',
                    sessionId,
                    phoneNumber: pairingInfo.phoneNumber,
                    message: 'Phone number successfully paired.'
                });
                setTimeout(() => {
                    phonePairing.deletePairing(sessionId);
                }, 60000);
            }
            updateStatus('CONNECTED', detailMessage, '', '');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 0;
            const reason = new Boom(lastDisconnect?.error)?.output?.payload?.error || 'Unknown';

            if (statusCode === 428) {
                log(`[RECONNECT_LOGIC] Detected statusCode 428 for session ${sessionId}.`, sessionId);
                if (retryCount < MAX_RETRIES) {
                    const delay = RETRY_DELAYS[retryCount];
                    log(`Connection timeout (428). Retrying in ${delay/1000}s (attempt ${retryCount + 1}/${MAX_RETRIES})`, sessionId);
                    updateStatus('RECONNECTING', `Connection timeout. Retrying in ${delay/1000}s...`);
                    setTimeout(() => {
                        createSessionWithRetry(sessionId, retryCount + 1);
                    }, delay);
                } else {
                    log(`Max retries reached for 428 error. Manual intervention required.`, sessionId);
                    updateStatus('CONNECTION_FAILED', 'Connection timeout - QR not scanned', '', reason);
                }
            } else {
                const shouldReconnect = statusCode !== 401 && statusCode !== 403;
                log(`Connection closed. Reason: ${reason}, statusCode: ${statusCode}. Reconnecting: ${shouldReconnect}`, sessionId);
                updateStatus('DISCONNECTED', 'Connection closed.', '', reason);

                if (shouldReconnect) {
                    setTimeout(() => createSessionWithRetry(sessionId, 0), 5000);
                } else {
                    log(`Not reconnecting for session ${sessionId} due to fatal error: ${reason}`, sessionId);
                    if (pairingInfo) {
                        phonePairing.updatePairingStatus(sessionId, {
                            status: 'PAIRING_FAILED',
                            detail: `Connection failed: ${reason}`
                        });
                    }
                    // On fatal, non-reconnectable errors, clear the session data to force a fresh start next time.
                    const sessionDir = path.join(AUTH_PATH, sessionId);
                    if (fs.existsSync(sessionDir)) {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                        log(`Cleared session data for ${sessionId} due to fatal error.`, sessionId);
                    }
                }
            }
        }
    });

    const session = sessions.get(sessionId);
    if (session) {
        session.sock = sock;
        sessions.set(sessionId, session);
    } else {
        log(`Warning: Session ${sessionId} not found when trying to set socket`, sessionId);
    }
} catch (error) {
    log(`Error in createSessionWithRetry for ${sessionId}: ${error.message}`, sessionId, { error: error.stack });
    updateStatus('CONNECTION_FAILED', `Connection failed: ${error.message}`);
    // Remove the session from sessions map to avoid stuck status
    sessions.delete(sessionId);
    broadcast({ type: 'session-update', data: getSessionsDetails() });
}
}

function getSessionsDetails(userEmail = null, isAdmin = false) {
    return Array.from(sessions.values())
        .filter(s => {
            // Admin can see all sessions
            if (isAdmin) return true;
            // Regular users can only see their own sessions
            return s.owner === userEmail;
        })
        .map(s => ({
            sessionId: s.sessionId,
            status: s.status,
            detail: s.detail,
            qr: s.qr,
            token: sessionTokens.get(s.sessionId) || null,
            owner: s.owner || 'system', // Include owner info
            settings: s.settings || {} // Include session settings
        }));
}

// API Endpoints
app.get('/sessions', (req, res) => {
    const currentUser = getCurrentUser(req);
    if (currentUser) {
        res.json(getSessionsDetails(currentUser.email, currentUser.role === 'admin'));
    } else {
        // For backwards compatibility, show all sessions if not authenticated
        res.json(getSessionsDetails());
    }
});

async function createSession(sessionId, createdBy = null) {
    if (sessions.has(sessionId)) {
        throw new Error('Session already exists');
    }
    
    // Check session limit
    if (sessions.size >= MAX_SESSIONS) {
        throw new Error(`Maximum session limit (${MAX_SESSIONS}) reached. Please delete unused sessions.`);
    }
    
    const token = randomUUID();
    sessionTokens.set(sessionId, token);
    saveTokens();
    
    // Set a placeholder before async connection with owner info
    sessions.set(sessionId, {
        sessionId: sessionId, 
        status: 'CREATING', 
        detail: 'Session is being created.',
        owner: createdBy // Track who created this session
    });
    
    // Track session ownership in user manager
    if (createdBy) {
        await userManager.addSessionToUser(createdBy, sessionId);
    }
    
    // Auto-cleanup inactive sessions after timeout
    // Fix for timeout overflow on 32-bit systems - cap at 24 hours max
    const timeoutMs = Math.min(SESSION_TIMEOUT_HOURS * 60 * 60 * 1000, 24 * 60 * 60 * 1000);
    setTimeout(async () => {
        const session = sessions.get(sessionId);
        if (session && session.status !== 'CONNECTED') {
            await deleteSession(sessionId);
            log(`Auto-deleted inactive session after ${SESSION_TIMEOUT_HOURS} hours: ${sessionId}`, 'SYSTEM');
        }
    }, timeoutMs);
    
    createSessionWithRetry(sessionId);
    return { status: 'success', message: `Session ${sessionId} created.`, token };
}



async function deleteSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session && session.sock) {
        try {
            await session.sock.logout();
        } catch (err) {
            log(`Error during logout for session ${sessionId}: ${err.message}`, sessionId);
        }
    }
    
    // Remove session ownership
    if (session && session.owner) {
        try {
            await userManager.removeSessionFromUser(session.owner, sessionId);
        } catch (error) {
            // If user not found, log a warning but continue with session deletion
            log(`Warning: Could not remove session from user ${session.owner}: ${error.message}`, sessionId);
        }
    }
    
    sessions.delete(sessionId);
    sessionTokens.delete(sessionId);
    saveTokens();

    // Delete Redis keys for the session
    const credsKey = `whatsapp:auth:creds:${sessionId}`;
    const keysKey = `whatsapp:auth:keys:${sessionId}`;
    try {
        await redisClient.del(credsKey);
        await redisClient.del(keysKey);
        log(`Deleted Redis auth state for session ${sessionId}`, 'SYSTEM');
    } catch (error) {
        log(`Error deleting Redis auth state for session ${sessionId}: ${error.message}`, 'ERROR');
    }

    // Delete from phone pairing statuses
    phonePairing.deletePairing(sessionId);

    const sessionDir = path.join(AUTH_PATH, sessionId);
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    log(`Session ${sessionId} deleted and data cleared.`, 'SYSTEM');
    broadcast({ type: 'session-update', data: getSessionsDetails() });
}

// Function to regenerate API token for a session
async function regenerateSessionToken(sessionId) {
    if (!sessions.has(sessionId)) {
        throw new Error('Session not found');
    }
    const newToken = randomUUID();
    sessionTokens.set(sessionId, newToken);
    saveTokens();
    log(`API Token regenerated for session ${sessionId}`, 'SYSTEM');
    return newToken;
}

const PORT = process.env.PORT || 3000;

// Handle memory errors gracefully
process.on('uncaughtException', (error) => {
    if (error.message && error.message.includes('Out of memory')) {
        console.error('FATAL: Out of memory error. The application will exit.');
        console.error('Consider reducing MAX_SESSIONS or upgrading your hosting plan.');
        process.exit(1);
    }
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function initializeExistingSessions() {
    const sessionsDir = AUTH_PATH;
    if (fs.existsSync(sessionsDir)) {
        const sessionFolders = fs.readdirSync(sessionsDir);
        log(`Found ${sessionFolders.length} existing session(s). Initializing...`);
        for (const sessionId of sessionFolders) {
            const sessionPath = path.join(sessionsDir, sessionId);
            if (fs.statSync(sessionPath).isDirectory()) {
                log(`Re-initializing session: ${sessionId}`);
                await createSession(sessionId); // Await creation to prevent race conditions
            }
        }
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    uptime: process.uptime(),
    redis: redisClient?.isOpen ? 'connected' : 'disconnected',
    sessions: Object.keys(sessions).length,
    activeSessions: Object.values(sessions).filter(s => s.sock?.user).length,
    timestamp: new Date().toISOString()
  };
  
  res.status(200).json(health);
});

// Auto-recovery check setiap 5 menit
setInterval(async () => {
  for (const [sessionId, session] of Object.entries(sessions)) {
    if (!session.sock?.user && (session.retryCount || 0) < MAX_RETRIES) {
      console.log(`[${sessionId}] Session disconnected, attempting recovery...`);
      await createSessionWithRetry(sessionId, session.retryCount || 0);
    }
  }
}, 300000); // 5 menit

loadSystemLogFromDisk();
server.listen(PORT, () => {
    log(`Server is running on port ${PORT}`);
    log(`Admin dashboard available at http://${process.env.APP_HOST || 'localhost'}:${PORT}/admin/dashboard.html`);
    loadTokens(); // Load tokens at startup
    initializeExistingSessions();
    
    // Start campaign scheduler
    startCampaignScheduler();
});

// Campaign scheduler to automatically start campaigns at their scheduled time
function startCampaignScheduler() {
    console.log('📅 Campaign scheduler started - checking every minute for scheduled campaigns');
    
    schedulerInterval = setInterval(async () => {
        await checkAndStartScheduledCampaigns();
    }, 60000); // Check every minute (60,000 ms)
}

// Use the scheduler function from the API router
async function checkAndStartScheduledCampaigns() {
    if (v1ApiRouter && v1ApiRouter.checkAndStartScheduledCampaigns) {
        return await v1ApiRouter.checkAndStartScheduledCampaigns();
    } else {
        console.log('⏳ API router not initialized yet, skipping scheduler check');
        return { error: 'API router not initialized' };
    }
}

// Graceful shutdown untuk SIGTERM/SIGINT
const gracefulShutdown = async (signal) => {
  console.log(`[SYSTEM] Received ${signal}, shutting down gracefully...`);
  
  // Stop scheduler
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  
  // Close all WA sessions
  for (const [sessionId, session] of Object.entries(sessions)) {
    try {
      console.log(`[${sessionId}] Closing session...`);
      await session.sock?.logout();
      await session.sock?.ws?.close();
    } catch (err) {
      console.error(`[${sessionId}] Error during shutdown:`, err);
    }
  }
  
  // Close Redis
  if (redisClient?.isOpen) {
    await redisClient.quit();
    console.log('[SYSTEM] Redis connection closed');
  }
  
  // Close Express server
  server.close(() => {
    console.log('[SYSTEM] HTTP server closed');
    process.exit(0);
  });
  
  // Force exit jika tidak selesai dalam 30 detik
  setTimeout(() => {
    console.error('[SYSTEM] Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));