// Memory optimization for production environments
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
    // useMultiFileAuthState, // Removed in favor of Redis
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    isJidBroadcast,
    Browsers,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { createClient } = require('redis'); // Redis Import
const useRedisAuthState = require('./redis-auth'); // Redis Auth Strategy
const { initializeApi, apiToken, getWebhookUrl } = require('./api_v1');
const { initializeLegacyApi } = require('./legacy_api');
const { formatPhoneNumber, toWhatsAppFormat } = require('./phone-utils');
const { randomUUID } = require('crypto');
const crypto = require('crypto'); // Add crypto for encryption
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const session = require('express-session');
const PhonePairing = require('./phone-pairing'); // Add PhonePairing import
const RedisStore = require('connect-redis').default;

// User Manager & Activity Logger removed for performance
// const UserManager = require('./users');
// const ActivityLogger = require('./activity-logger');
// ActivityLogger removed

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- REDIS SETUP ---
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'; // Default to localhost if not set
const redisClient = createClient({ url: REDIS_URL });
const redisSessionClient = createClient({
    url: REDIS_URL,
    legacyMode: true
});

redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));
redisClient.on('connect', () => console.log('✅ Connected to Redis'));
redisSessionClient.on('error', (err) => console.error('❌ Redis Session Store Error', err));
redisSessionClient.on('connect', () => console.log('✅ Connected to Redis Session Store'));

// Connect to Redis immediately
(async () => {
    await Promise.all([
        redisClient.connect(),
        redisSessionClient.connect()
    ]);
})();
// -------------------

const sessions = new Map();
const sessionTokens = new Map();
const wsClients = new Map();
const logger = pino({ level: 'info' });

// --- Session & Messaging Controls ---
const INSTANCE_ID = process.env.INSTANCE_ID || `wa-gateway-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
const SESSION_LOCK_TTL_SECONDS = parseInt(process.env.SESSION_LOCK_TTL_SECONDS || '120', 10);
const MESSAGE_RATE_LIMIT = parseInt(process.env.MAX_MESSAGES_PER_MINUTE || '15', 10);
const MESSAGE_RATE_WINDOW_MS = 60 * 1000;
const MIN_SEND_DELAY_MS = parseInt(process.env.MIN_SEND_DELAY_MS || '3000', 10);
const MAX_SEND_DELAY_MS = parseInt(process.env.MAX_SEND_DELAY_MS || '7000', 10);
const WARMUP_MIN_DELAY_MS = parseInt(process.env.WARMUP_MIN_DELAY_MS || '6000', 10);
const WARMUP_MAX_DELAY_MS = parseInt(process.env.WARMUP_MAX_DELAY_MS || '12000', 10);
const WARMUP_WINDOW_HOURS = parseInt(process.env.WARMUP_WINDOW_HOURS || '72', 10);
const MAX_MESSAGES_PER_BATCH = parseInt(process.env.MAX_MESSAGES_PER_BATCH || '50', 10);
const RECIPIENT_CACHE_TTL_MS = parseInt(process.env.RECIPIENT_CACHE_TTL_MS || (60 * 60 * 1000).toString(), 10);
const CALL_RESPONSE_TTL_MS = parseInt(process.env.CALL_RESPONSE_TTL_MS || '300000', 10);
const MESSAGE_HOURLY_LIMIT = parseInt(process.env.MESSAGE_HOURLY_LIMIT || '200', 10);
const MESSAGE_COOLDOWN_MINUTES = parseInt(process.env.MESSAGE_COOLDOWN_MINUTES || '10', 10);
const MESSAGE_COOLDOWN_JITTER_MS = parseInt(process.env.MESSAGE_COOLDOWN_JITTER_MS || '15000', 10);
const MESSAGE_BURST_LIMIT = parseInt(process.env.MESSAGE_BURST_LIMIT || '12', 10);
const MESSAGE_BURST_WINDOW_SECONDS = parseInt(process.env.MESSAGE_BURST_WINDOW_SECONDS || '25', 10);
const BURST_DELAY_MIN_MS = parseInt(process.env.BURST_DELAY_MIN_MS || '5000', 10);
const BURST_DELAY_MAX_MS = parseInt(process.env.BURST_DELAY_MAX_MS || '11000', 10);

const DISABLE_SESSION_LOCK = process.env.DISABLE_SESSION_LOCK === 'true';
const STRICT_SESSION_LOCK = process.env.STRICT_SESSION_LOCK === 'true';

const sessionSendQueues = new Map(); // Map<sessionId, QueueState>
const recipientValidationCache = new Map(); // Map<jid, { timestamp, exists, data }>
const sessionReconnectState = new Map(); // Map<sessionId, { attempts }>
const sessionLockIntervals = new Map(); // Map<sessionId, Interval>
const callResponseTracker = new Map(); // Map<sessionId:callId, { rejectHandled, replyHandled, timer }>
// ------------------------------------

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0000000000000000000000000000000000000000000000000000000000000000';
const TOKENS_FILE = path.join(__dirname, 'session_tokens.json');
const ENCRYPTED_TOKENS_FILE = path.join(__dirname, 'session_tokens.enc');

const userManager = {
    authenticateUser: async (email, password) => {
        // Simple mock authentication
        if (email === 'admin@localhost' && password === process.env.ADMIN_DASHBOARD_PASSWORD) {
            return { email: 'admin@localhost', role: 'admin', id: 'system-admin' };
        }
        return null;
    },
    addSessionToUser: async () => {},
    removeSessionFromUser: async () => {},
    getSessionOwner: () => ({ email: 'admin@localhost' })
};


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = (min, max) => {
    if (max <= min) return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

function ensureSessionQueueState(sessionId) {
    if (!sessionSendQueues.has(sessionId)) {
        sessionSendQueues.set(sessionId, {
            queue: [],
            processing: false,
            connectedAt: Date.now(),
            windowStart: 0,
            sentInWindow: 0,
            lastSentAt: 0,
            recentMessages: [],
            cooldownUntil: null,
            lastThrottleLog: 0
        });
    }
    return sessionSendQueues.get(sessionId);
}

async function processSessionQueue(sessionId) {
    const state = sessionSendQueues.get(sessionId);
    if (!state || state.processing) {
        return;
    }
    state.processing = true;

    while (state.queue.length > 0) {
        const now = Date.now();
        if (!state.windowStart || now - state.windowStart >= MESSAGE_RATE_WINDOW_MS) {
            state.windowStart = now;
            state.sentInWindow = 0;
        }

        if (MESSAGE_RATE_LIMIT > 0 && state.sentInWindow >= MESSAGE_RATE_LIMIT) {
            const waitFor = Math.max((state.windowStart + MESSAGE_RATE_WINDOW_MS) - now, 0);
            await sleep(waitFor || 500);
            continue;
        }

        const throttled = await applyAdvancedThrottle(sessionId, state);
        if (throttled) {
            continue;
        }

        const job = state.queue.shift();
        try {
            const result = await job.operation();
            state.sentInWindow += 1;
            const sentAt = Date.now();
            state.lastSentAt = sentAt;
            trackRecentMessage(state, sentAt);
            job.resolve(result);
        } catch (error) {
            job.reject(error);
        }

        const delay = calculateHumanDelayMs(state);
        await sleep(delay);
    }

    state.processing = false;
}

function trackRecentMessage(state, ts) {
    if (!state.recentMessages) {
        state.recentMessages = [];
    }
    state.recentMessages.push(ts);
    pruneRecentMessages(state, ts);
}

function pruneRecentMessages(state, now) {
    const hourWindowMs = 60 * 60 * 1000;
    state.recentMessages = (state.recentMessages || []).filter((timestamp) => {
        return (now - timestamp) <= hourWindowMs;
    });
}

async function applyAdvancedThrottle(sessionId, state) {
    const now = Date.now();

    if (state.cooldownUntil && now < state.cooldownUntil) {
        if (!state.lastThrottleLog || (now - state.lastThrottleLog) > 5000) {
            emitThrottleEvent(sessionId, 'cooldown-active', {
                remainingMs: state.cooldownUntil - now
            });
            state.lastThrottleLog = now;
        }
        await sleep(Math.min(state.cooldownUntil - now, 5000));
        return true;
    }

    pruneRecentMessages(state, now);

    if (MESSAGE_HOURLY_LIMIT > 0 && state.recentMessages.length >= MESSAGE_HOURLY_LIMIT) {
        const jitter = randomBetween(0, MESSAGE_COOLDOWN_JITTER_MS);
        const cooldownMs = (MESSAGE_COOLDOWN_MINUTES * 60 * 1000) + jitter;
        state.cooldownUntil = now + cooldownMs;
        emitThrottleEvent(sessionId, 'cooldown-start', {
            hourlyCount: state.recentMessages.length,
            cooldownMs
        });
        return true;
    }

    if (MESSAGE_BURST_LIMIT > 0 && MESSAGE_BURST_WINDOW_SECONDS > 0) {
        const burstWindowMs = MESSAGE_BURST_WINDOW_SECONDS * 1000;
        const burstCount = state.recentMessages.filter((timestamp) => {
            return (now - timestamp) <= burstWindowMs;
        }).length;

        if (burstCount >= MESSAGE_BURST_LIMIT) {
            const burstDelay = randomBetween(BURST_DELAY_MIN_MS, BURST_DELAY_MAX_MS);
            emitThrottleEvent(sessionId, 'burst-delay', {
                burstCount,
                burstWindowMs,
                delayMs: burstDelay
            });
            await sleep(burstDelay);
        }
    }

    return false;
}

function emitThrottleEvent(sessionId, status, metrics = {}) {
    log(`[Throttle] ${status} - session ${sessionId}`, sessionId, {
        status,
        ...metrics
    });
    broadcast({
        type: 'throttle-event',
        data: {
            sessionId,
            status,
            metrics,
            timestamp: Date.now()
        }
    });
}

function calculateHumanDelayMs(state) {
    const warmupWindowMs = WARMUP_WINDOW_HOURS * 60 * 60 * 1000;
    const now = Date.now();
    const connectedAt = state.connectedAt || now;
    const isWarm = (now - connectedAt) > warmupWindowMs;
    const minDelay = isWarm ? MIN_SEND_DELAY_MS : WARMUP_MIN_DELAY_MS;
    const maxDelay = isWarm ? MAX_SEND_DELAY_MS : WARMUP_MAX_DELAY_MS;
    return randomBetween(minDelay, maxDelay);
}

function registerSessionConnected(sessionId) {
    const state = ensureSessionQueueState(sessionId);
    state.connectedAt = Date.now();
    state.windowStart = Date.now();
    state.sentInWindow = 0;
    state.cooldownUntil = null;
    state.lastThrottleLog = 0;
    state.recentMessages = [];
}

async function cleanupSessionResources(sessionId) {
    if (sessionSendQueues.has(sessionId)) {
        const state = sessionSendQueues.get(sessionId);
        if (state && state.queue) {
            state.queue.length = 0;
        }
        sessionSendQueues.delete(sessionId);
    }
    recipientValidationCache.forEach((entry, key) => {
        if (entry.sessionId === sessionId) {
            recipientValidationCache.delete(key);
        }
    });
    await clearSessionContacts(sessionId);
}

function scheduleMessageSend(sessionId, operation) {
    const state = ensureSessionQueueState(sessionId);
    return new Promise((resolve, reject) => {
        state.queue.push({ operation, resolve, reject });
        processSessionQueue(sessionId);
    });
}

async function validateWhatsAppRecipient(sock, destination, sessionId) {
    const cacheKey = `${sessionId}:${destination}`;
    const now = Date.now();
    const cached = recipientValidationCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < RECIPIENT_CACHE_TTL_MS) {
        if (!cached.exists) {
            throw new Error('Nomor tidak terdaftar di WhatsApp');
        }
        return cached.data;
    }

    const lookup = await sock.onWhatsApp(destination);
    const record = Array.isArray(lookup) ? lookup[0] : null;
    if (!record || !record.exists) {
        recipientValidationCache.set(cacheKey, { exists: false, timestamp: now, sessionId });
        throw new Error('Nomor tidak terdaftar di WhatsApp');
    }
    recipientValidationCache.set(cacheKey, { exists: true, timestamp: now, data: record, sessionId });
    return record;
}

function hasCallResponseHandled(sessionId, callId, type) {
    const key = `${sessionId}:${callId}`;
    const entry = callResponseTracker.get(key);
    if (!entry) {
        return false;
    }
    return !!entry[`${type}Handled`];
}

function markCallResponseHandled(sessionId, callId, type) {
    const key = `${sessionId}:${callId}`;
    const entry = callResponseTracker.get(key) || { rejectHandled: false, replyHandled: false, timeout: null };
    if (entry.timeout) {
        clearTimeout(entry.timeout);
    }
    entry[`${type}Handled`] = true;
    entry.timeout = setTimeout(() => {
        const existing = callResponseTracker.get(key);
        if (existing && existing.timeout) {
            clearTimeout(existing.timeout);
        }
        callResponseTracker.delete(key);
    }, CALL_RESPONSE_TTL_MS);
    callResponseTracker.set(key, entry);
}

function normalizeContactId(value) {
    if (!value) return '';
    if (value.includes('@')) {
        return value.split('@')[0].replace(/\D/g, '');
    }
    return formatPhoneNumber(value);
}

async function getSessionContacts(sessionId) {
    try {
        const raw = await redisClient.get(`${CONTACTS_KEY_PREFIX}${sessionId}`);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        log(`Error loading contacts for ${sessionId}: ${error.message}`, 'SYSTEM');
        return [];
    }
}

async function saveSessionContacts(sessionId, contacts) {
    try {
        await redisClient.set(`${CONTACTS_KEY_PREFIX}${sessionId}`, JSON.stringify(contacts));
    } catch (error) {
        log(`Error saving contacts for ${sessionId}: ${error.message}`, 'SYSTEM');
    }
}

async function upsertSessionContact(sessionId, contact) {
    const contacts = await getSessionContacts(sessionId);
    const now = Date.now();
    const normalized = {
        ...contact,
        updatedAt: now
    };
    const index = contacts.findIndex((item) => item.contactId === contact.contactId);
    if (index >= 0) {
        normalized.createdAt = contacts[index].createdAt || now;
        contacts[index] = { ...contacts[index], ...normalized };
    } else {
        normalized.createdAt = now;
        contacts.push(normalized);
    }
    await saveSessionContacts(sessionId, contacts);
    return normalized;
}

async function removeSessionContact(sessionId, contactId) {
    const contacts = await getSessionContacts(sessionId);
    const index = contacts.findIndex((contact) => contact.contactId === contactId);
    if (index === -1) {
        return false;
    }
    contacts.splice(index, 1);
    await saveSessionContacts(sessionId, contacts);
    return true;
}

async function clearSessionContacts(sessionId) {
    try {
        await redisClient.del(`${CONTACTS_KEY_PREFIX}${sessionId}`);
    } catch (error) {
        log(`Error clearing contacts for ${sessionId}: ${error.message}`, 'SYSTEM');
    }
}

const SESSION_LOCK_KEY_PREFIX = 'wa:session_lock:';
const CONTACTS_KEY_PREFIX = 'wa:contacts:';

async function acquireSessionLock(sessionId) {
    if (DISABLE_SESSION_LOCK) {
        return true;
    }
    try {
        const result = await redisClient.set(
            `${SESSION_LOCK_KEY_PREFIX}${sessionId}`,
            INSTANCE_ID,
            {
                NX: true,
                EX: SESSION_LOCK_TTL_SECONDS
            }
        );
        if (result === 'OK') {
            startSessionLockHeartbeat(sessionId);
            return true;
        }
        const existingOwner = await redisClient.get(`${SESSION_LOCK_KEY_PREFIX}${sessionId}`);
        if (existingOwner === INSTANCE_ID) {
            startSessionLockHeartbeat(sessionId);
            return true;
        }
    } catch (error) {
        console.error(`Failed to acquire session lock for ${sessionId}:`, error.message);
        return !STRICT_SESSION_LOCK;
    }
    return false;
}

function startSessionLockHeartbeat(sessionId) {
    if (DISABLE_SESSION_LOCK) return;
    stopSessionLockHeartbeat(sessionId);
    const intervalMs = Math.max(Math.floor((SESSION_LOCK_TTL_SECONDS * 1000) / 2), 30000);
    const interval = setInterval(async () => {
        try {
            const lockKey = `${SESSION_LOCK_KEY_PREFIX}${sessionId}`;
            const owner = await redisClient.get(lockKey);
            if (owner === INSTANCE_ID) {
                await redisClient.expire(lockKey, SESSION_LOCK_TTL_SECONDS);
            } else {
                stopSessionLockHeartbeat(sessionId);
            }
        } catch (error) {
            console.error(`Session lock heartbeat failed for ${sessionId}:`, error.message);
        }
    }, intervalMs);
    sessionLockIntervals.set(sessionId, interval);
}

function stopSessionLockHeartbeat(sessionId) {
    if (sessionLockIntervals.has(sessionId)) {
        clearInterval(sessionLockIntervals.get(sessionId));
        sessionLockIntervals.delete(sessionId);
    }
}

async function releaseSessionLock(sessionId) {
    if (DISABLE_SESSION_LOCK) return;
    stopSessionLockHeartbeat(sessionId);
    try {
        const lockKey = `${SESSION_LOCK_KEY_PREFIX}${sessionId}`;
        const owner = await redisClient.get(lockKey);
        if (owner === INSTANCE_ID) {
            await redisClient.del(lockKey);
        }
    } catch (error) {
        console.error(`Failed to release session lock for ${sessionId}:`, error.message);
    }
}

function scheduleReconnectWithBackoff(sessionId, baseDelayMs = 5000) {
    const state = sessionReconnectState.get(sessionId) || { attempts: 0, timer: null };
    if (state.timer) {
        clearTimeout(state.timer);
    }
    state.attempts += 1;
    const cappedDelay = Math.min(baseDelayMs * Math.pow(2, state.attempts - 1), 60000);
    const delay = cappedDelay + randomBetween(500, 2000);
    state.timer = setTimeout(() => {
        state.timer = null;
        connectToWhatsApp(sessionId);
    }, delay);
    sessionReconnectState.set(sessionId, state);
    return delay;
}

function resetReconnectBackoff(sessionId) {
    const state = sessionReconnectState.get(sessionId);
    if (state && state.timer) {
        clearTimeout(state.timer);
    }
    sessionReconnectState.delete(sessionId);
}

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

// Ensure media directory exists
const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir);
}

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

app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

const ADMIN_PASSWORD = process.env.ADMIN_DASHBOARD_PASSWORD;

// Session limits configuration
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS) || 10;
const SESSION_TIMEOUT_HOURS = parseInt(process.env.SESSION_TIMEOUT_HOURS) || 24;

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

// Gunakan Redis sebagai session store agar stateless antar instance
const sessionStore = new RedisStore({
    client: redisSessionClient,
    prefix: 'wa:express-session:',
    disableTouch: false
});

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 86400000 // 1 day
    }
}));

// FORCE ADMIN AUTH MIDDLEWARE (Simplified Mode)
// app.use((req, res, next) => {
//     if (!req.session) req.session = {};
//     req.session.adminAuthed = true;
//     req.session.userEmail = 'admin@localhost';
//     req.session.userRole = 'admin';
//     req.session.userId = 'system-admin';
//     next();
// });

// Redirect root to admin login
app.get('/', (req, res) => {
    res.redirect('/admin/login.html');
});

// Serve API documentation
app.get('/api-documentation', (req, res) => {
    res.sendFile(path.join(__dirname, 'api_documentation.html'));
});

app.get('/healthz', async (req, res) => {
    const redisStatus = redisClient.isReady ? 'up' : 'down';
    const redisSessionStatus = redisSessionClient.isReady ? 'up' : 'down';
    const healthy = redisStatus === 'up' && redisSessionStatus === 'up';
    res.status(healthy ? 200 : 503).json({
        status: healthy ? 'ok' : 'degraded',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        dependencies: {
            redis: redisStatus,
            redisSessionStore: redisSessionStatus
        }
    });
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
        // Log removed
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
            // Log removed
            return res.json({ 
                success: true, 
                role: user.role,
                email: user.email 
            });
        }
    }
    
    // Log removed
    res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Middleware to protect admin dashboard
function requireAdminAuth(req, res, next) {
    if (req.session && req.session.adminAuthed) {
        return next();
    }
    res.redirect('/admin/login.html');
}

// Middleware to check if user is admin role
function requireAdminRole(req, res, next) {
    next();
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

// Admin pages removed (users, activities, campaigns)

// Admin logout endpoint
app.post('/admin/logout', requireAdminAuth, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true, redirect: '/admin/login.html' });
    });
});

// User management endpoints
// User endpoints removed

// User update/delete endpoints removed

// Get current user info
app.get('/api/v1/me', (req, res) => {
    res.json({
        email: 'admin@localhost',
        role: 'admin',
        isActive: true,
        id: 'system-admin'
    });
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

// Activities endpoint removed

// Activities summary endpoint removed

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

const phonePairing = new PhonePairing(log);

const v1ApiRouter = initializeApi(
    sessions,
    sessionTokens,
    createSession,
    getSessionsDetails,
    deleteSession,
    log,
    phonePairing,
    saveSessionSettings,
    regenerateSessionToken,
    redisClient,
    scheduleMessageSend,
    validateWhatsAppRecipient,
    getSessionContacts,
    upsertSessionContact,
    removeSessionContact,
    postToWebhook
);
const legacyApiRouter = initializeLegacyApi(
    sessions,
    sessionTokens,
    scheduleMessageSend,
    validateWhatsAppRecipient
);
app.use('/api/v1', v1ApiRouter);
app.use('/api', legacyApiRouter); // Mount legacy routes at /api

// Campaign WS listeners removed
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

// --- Start Webhook Settings Management (Redis Version) ---
async function saveSessionSettings(sessionId, settings) {
    try {
        await redisClient.set(`wa:settings:${sessionId}`, JSON.stringify(settings));
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
        const data = await redisClient.get(`wa:settings:${sessionId}`);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        log(`Error loading settings for session ${sessionId}: ${error.message}`, sessionId, { error });
    }
    return {}; // Return empty object if no settings found or error
}
// --- End Webhook Settings Management ---

// ... (postToWebhook and updateSessionState remain same) ...

// Update postToWebhook to accept sessionId and use getWebhookUrl(sessionId)
async function postToWebhook(data) {
    const sessionId = data.sessionId || 'SYSTEM';
    const webhookUrl = await getWebhookUrl(sessionId); // Changed to await since it's now async
    if (!webhookUrl) return;
    const payload = {
        ...data,
        meta: {
            ...(data.meta || {}),
            source: 'wa-gateway',
            sessionId
        }
    };

    try {
        await axios.post(webhookUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'X-WA-Gateway-Source': 'wa-gateway',
                'X-WA-Session-Id': sessionId
            },
            timeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '10000', 10)
        });
        log(`Successfully posted to webhook: ${webhookUrl}`);
    } catch (error) {
        log(`Failed to post to webhook: ${error.message}`);
    }
}

function updateSessionState(sessionId, status, detail, qr, reason) {
    const oldSession = sessions.get(sessionId) || {};
    const newSession = {
        ...oldSession,
        sessionId: sessionId, // Explicitly ensure sessionId is preserved
        status,
        detail,
        qr,
        reason
    };
    sessions.set(sessionId, newSession);

    // Debug logging for QR updates
    if (qr && qr.length > 0) {
        console.log(`[${sessionId}] 🔄 updateSessionState called with QR:`, {
            status,
            qrLength: qr.length,
            qrPreview: qr.substring(0, 50) + '...'
        });
    }

    const sessionDetails = getSessionsDetails();
    const ourSession = sessionDetails.find(s => s.sessionId === sessionId);
    if (ourSession && ourSession.qr) {
        console.log(`[${sessionId}] ✅ Session has QR in broadcast data (length: ${ourSession.qr.length})`);
    }

    broadcast({ type: 'session-update', data: sessionDetails });

    postToWebhook({
        event: 'session-status',
        sessionId,
        status,
        detail,
        reason
    });
}

async function connectToWhatsApp(sessionId) {
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

    // Use Redis Auth Strategy instead of MultiFile
    const { state, saveCreds } = await useRedisAuthState(redisClient, sessionId);
    
    const { version, isLatest } = await fetchLatestBaileysVersion();
    log(`Using WA version: ${version.join('.')}, isLatest: ${isLatest}`, sessionId);

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        browser: Browsers.macOS('Chrome'),
        virtualLinkPreviewEnabled: false,  // More aggressive optimization
        shouldIgnoreJid: (jid) => isJidBroadcast(jid),
        qrTimeout: 30000,
        connectTimeoutMs: 60000, // Increased to 60s
        defaultQueryTimeoutMs: 0, // No timeout for queries
        keepAliveIntervalMs: 60000,  // Increased from 30000 to reduce connection overhead
        fireInitQueries: false,
        emitOwnEvents: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        retryRequestDelayMs: 5000,
        maxMsgRetryCount: 1,
    });

    sock.ev.on('creds.update', saveCreds);

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
        const defaultWebhookUrl = await getWebhookUrl(sessionId); // Get default webhook for this session
        if (!hasWebhooks && !defaultWebhookUrl) {
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
        
        // Helper to extract clean number from JID
        const getJidPhoneNumber = (jid) => {
            if (!jid) return null;
            const userPart = jid.split(':')[0].split('@')[0];
            return userPart + '@s.whatsapp.net';
        };

        let standardizedPhoneNumber = null;

        // 1. Try to use the specific phone number provided by Baileys (handles LID cases for incoming messages)
        if (msg.key.senderPn) {
            standardizedPhoneNumber = getJidPhoneNumber(msg.key.senderPn);
        } 
        // 2. If not available, check remoteJid. If it's NOT a LID, use it.
        else if (msg.key.remoteJid && !msg.key.remoteJid.includes('@lid')) {
            standardizedPhoneNumber = getJidPhoneNumber(msg.key.remoteJid);
        }

        // 3. Special Handling for "From Me" messages where remoteJid is a LID (Privacy ID).
        // In this case, we can't easily resolve the recipient's number without a store.
        // To avoid returning a confusing LID in 'phoneNumber', we fallback to the Bot's OWN number.
        if (!standardizedPhoneNumber && fromMe) {
             if (session && session.sock && session.sock.user && session.sock.user.id) {
                 standardizedPhoneNumber = getJidPhoneNumber(session.sock.user.id);
             }
        }

        // 4. Last resort: use whatever we have
        if (!standardizedPhoneNumber) {
            standardizedPhoneNumber = msg.key.remoteJid;
        }

        const payload = {
            event: 'message',
            sessionId,
            phoneNumber: standardizedPhoneNumber,
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
        if (defaultWebhookUrl && !allWebhookUrls.includes(defaultWebhookUrl)) {
            allWebhookUrls.push(defaultWebhookUrl);
        }

        // Only proceed if we have URLs to send to
        if (allWebhookUrls.length === 0) {
            return; // No webhooks configured
        }

        for (const url of allWebhookUrls) {
            try {
                await axios.post(url, payload, {
                    headers: { 'Content-Type': 'application/json' }
                });
                log(`Sent message webhook to ${url}`, sessionId);
            } catch (error) {
                log(`Failed to send message webhook to ${url}: ${error.message}`, sessionId, { error });
            }
        }
    }
    // --- End Advanced Webhook Handler ---

    sock.ev.on('messages.upsert', async (m) => {
        // Pass the entire message object to our new handler
        await handleWebhookForMessage(m, sessionId);
    });

    sock.ev.on('call', async (callEvents) => {
        if (!Array.isArray(callEvents)) {
            return;
        }
        const sessionState = sessions.get(sessionId) || {};
        const sessionSettings = sessionState.settings || {};

        for (const callEvent of callEvents) {
            const payload = {
                id: callEvent.id,
                from: callEvent.from,
                chatId: callEvent.chatId,
                groupJid: callEvent.groupJid || null,
                isGroup: !!callEvent.isGroup,
                isVideo: !!callEvent.isVideo,
                status: callEvent.status,
                offline: !!callEvent.offline,
                latencyMs: callEvent.latencyMs || null,
                timestamp: callEvent.date ? callEvent.date.getTime() : Date.now()
            };

            log('Call event received', sessionId, { event: 'call-event', ...payload });
            try {
                await postToWebhook({
                    event: 'call-event',
                    sessionId,
                    call: payload
                });
            } catch (error) {
                log('Failed to post call event to webhook', sessionId, { error: error.message });
            }

            const isOffer = callEvent.status === 'offer';

            if (sessionSettings.auto_reject_calls && isOffer && !hasCallResponseHandled(sessionId, callEvent.id, 'reject')) {
                try {
                    await sock.rejectCall(callEvent.id, callEvent.from);
                    markCallResponseHandled(sessionId, callEvent.id, 'reject');
                    log('Incoming call auto-rejected', sessionId, { callId: callEvent.id, from: callEvent.from });
                } catch (error) {
                    log('Failed to auto-reject call', sessionId, { error: error.message, callId: callEvent.id });
                }
            }

            const replyTemplate = typeof sessionSettings.auto_reply_call_message === 'string'
                ? sessionSettings.auto_reply_call_message.trim()
                : '';

            if (replyTemplate && isOffer && !hasCallResponseHandled(sessionId, callEvent.id, 'reply')) {
                try {
                    await scheduleMessageSend(sessionId, async () => {
                        const activeSession = sessions.get(sessionId);
                        if (!activeSession || !activeSession.sock || activeSession.status !== 'CONNECTED') {
                            throw new Error('Session tidak tersedia saat auto-reply call.');
                        }
                        await activeSession.sock.sendMessage(callEvent.chatId || callEvent.from, {
                            text: replyTemplate
                        });
                    });
                    markCallResponseHandled(sessionId, callEvent.id, 'reply');
                    log('Auto reply sent for call', sessionId, { callId: callEvent.id, to: callEvent.from });
                } catch (error) {
                    log('Failed to send auto reply for call', sessionId, { error: error.message, callId: callEvent.id });
                }
            }
        }
    });

    // --- Message Reactions Handler ---
    sock.ev.on('messages.reaction', async (reactions) => {
        const session = sessions.get(sessionId);
        if (!session) return;

        const defaultWebhookUrl = await getWebhookUrl(sessionId);
        const settings = session.settings || {};
        const hasWebhooks = settings.webhooks && settings.webhooks.length > 0;

        if (!hasWebhooks && !defaultWebhookUrl) return;

        for (const reaction of reactions) {
            const payload = {
                event: 'reaction',
                sessionId,
                messageId: reaction.key.id,
                remoteJid: reaction.key.remoteJid,
                participant: reaction.key.participant,
                emoji: reaction.reaction?.text || null,
                removed: !reaction.reaction?.text, // empty text means reaction removed
                timestamp: Date.now()
            };

            log(`Reaction event: ${payload.emoji || 'removed'} on message ${payload.messageId}`, sessionId);

            const allWebhookUrls = [];
            if (settings.webhooks && Array.isArray(settings.webhooks)) {
                allWebhookUrls.push(...settings.webhooks);
            }
            if (defaultWebhookUrl && !allWebhookUrls.includes(defaultWebhookUrl)) {
                allWebhookUrls.push(defaultWebhookUrl);
            }

            for (const url of allWebhookUrls) {
                try {
                    await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
                } catch (error) {
                    log(`Failed to send reaction webhook: ${error.message}`, sessionId);
                }
            }
        }
    });

    // --- Presence Updates Handler ---
    sock.ev.on('presence.update', async (presenceData) => {
        const session = sessions.get(sessionId);
        if (!session) return;

        const defaultWebhookUrl = await getWebhookUrl(sessionId);
        const settings = session.settings || {};
        const hasWebhooks = settings.webhooks && settings.webhooks.length > 0;

        if (!hasWebhooks && !defaultWebhookUrl) return;

        const payload = {
            event: 'presence',
            sessionId,
            jid: presenceData.id,
            presences: presenceData.presences,
            timestamp: Date.now()
        };

        log(`Presence update for ${presenceData.id}`, sessionId);

        const allWebhookUrls = [];
        if (settings.webhooks && Array.isArray(settings.webhooks)) {
            allWebhookUrls.push(...settings.webhooks);
        }
        if (defaultWebhookUrl && !allWebhookUrls.includes(defaultWebhookUrl)) {
            allWebhookUrls.push(defaultWebhookUrl);
        }

        for (const url of allWebhookUrls) {
            try {
                await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
            } catch (error) {
                log(`Failed to send presence webhook: ${error.message}`, sessionId);
            }
        }
    });

    // --- Message Updates Handler (edits, deletes, poll votes) ---
    sock.ev.on('messages.update', async (updates) => {
        const session = sessions.get(sessionId);
        if (!session) return;

        const defaultWebhookUrl = await getWebhookUrl(sessionId);
        const settings = session.settings || {};
        const hasWebhooks = settings.webhooks && settings.webhooks.length > 0;

        if (!hasWebhooks && !defaultWebhookUrl) return;

        for (const update of updates) {
            // Determine update type
            let updateType = 'unknown';
            if (update.update?.pollUpdates) {
                updateType = 'poll_vote';
            } else if (update.update?.message) {
                updateType = 'message_edit';
            } else if (update.update?.status === 5) {
                updateType = 'message_delete';
            }

            const payload = {
                event: 'message_update',
                sessionId,
                updateType,
                messageId: update.key.id,
                remoteJid: update.key.remoteJid,
                participant: update.key.participant,
                update: update.update,
                timestamp: Date.now()
            };

            log(`Message update: ${updateType} for ${update.key.id}`, sessionId);

            const allWebhookUrls = [];
            if (settings.webhooks && Array.isArray(settings.webhooks)) {
                allWebhookUrls.push(...settings.webhooks);
            }
            if (defaultWebhookUrl && !allWebhookUrls.includes(defaultWebhookUrl)) {
                allWebhookUrls.push(defaultWebhookUrl);
            }

            for (const url of allWebhookUrls) {
                try {
                    await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
                } catch (error) {
                    log(`Failed to send message update webhook: ${error.message}`, sessionId);
                }
            }
        }
    });

    // --- Group Updates Handler ---
    sock.ev.on('groups.update', async (updates) => {
        const session = sessions.get(sessionId);
        if (!session) return;

        const defaultWebhookUrl = await getWebhookUrl(sessionId);
        const settings = session.settings || {};
        const hasWebhooks = settings.webhooks && settings.webhooks.length > 0;

        if (!hasWebhooks && !defaultWebhookUrl) return;

        for (const update of updates) {
            const payload = {
                event: 'group_update',
                sessionId,
                groupId: update.id,
                subject: update.subject,
                description: update.desc,
                restrict: update.restrict,
                announce: update.announce,
                timestamp: Date.now()
            };

            log(`Group update for ${update.id}`, sessionId);

            const allWebhookUrls = [];
            if (settings.webhooks && Array.isArray(settings.webhooks)) {
                allWebhookUrls.push(...settings.webhooks);
            }
            if (defaultWebhookUrl && !allWebhookUrls.includes(defaultWebhookUrl)) {
                allWebhookUrls.push(defaultWebhookUrl);
            }

            for (const url of allWebhookUrls) {
                try {
                    await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
                } catch (error) {
                    log(`Failed to send group update webhook: ${error.message}`, sessionId);
                }
            }
        }
    });

    // --- Group Participants Update Handler ---
    sock.ev.on('group-participants.update', async (update) => {
        const session = sessions.get(sessionId);
        if (!session) return;

        const defaultWebhookUrl = await getWebhookUrl(sessionId);
        const settings = session.settings || {};
        const hasWebhooks = settings.webhooks && settings.webhooks.length > 0;

        if (!hasWebhooks && !defaultWebhookUrl) return;

        const payload = {
            event: 'group_participants_update',
            sessionId,
            groupId: update.id,
            participants: update.participants,
            action: update.action, // 'add', 'remove', 'promote', 'demote'
            timestamp: Date.now()
        };

        log(`Group participants update: ${update.action} in ${update.id}`, sessionId);

        const allWebhookUrls = [];
        if (settings.webhooks && Array.isArray(settings.webhooks)) {
            allWebhookUrls.push(...settings.webhooks);
        }
        if (defaultWebhookUrl && !allWebhookUrls.includes(defaultWebhookUrl)) {
            allWebhookUrls.push(defaultWebhookUrl);
        }

        for (const url of allWebhookUrls) {
            try {
                await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' } });
            } catch (error) {
                log(`Failed to send group participants webhook: ${error.message}`, sessionId);
            }
        }
    });

    let lastQr = '';

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            if (qr === lastQr) {
                // Skip broadcasting duplicate QR to prevent frontend flicker/confusion
                return;
            }
            lastQr = qr;

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
                // console.log(`[${sessionId}] 📱 QR CODE STRING LENGTH:`, qr ? qr.length : 0);
                // console.log(`[${sessionId}] 📡 Broadcasting QR to frontend via WebSocket...`);
                updateStatus('GENERATING_QR', 'QR code available.', qr);
                // console.log(`[${sessionId}] ✅ QR broadcast complete. Check frontend!`);
            }
        }

        if (connection === 'open') {
            log(`Connection is now open for ${sessionId}.`);
            lastQr = ''; // Reset last QR on success
            registerSessionConnected(sessionId);
            resetReconnectBackoff(sessionId);
            
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

            // Allow 428 (Precondition Required) to reconnect. Only stop on 401 (Unauthorized) and 403 (Forbidden).
            const shouldReconnect = statusCode !== 401 && statusCode !== 403;

            log(`Connection closed. Reason: ${reason}, statusCode: ${statusCode}. Reconnecting: ${shouldReconnect}`, sessionId);

            // Special handling for restartRequired (515)
            if (statusCode === DisconnectReason.restartRequired) {
                log(`Session ${sessionId} requires restart (normal during sync). Reconnecting immediately...`, sessionId);
                resetReconnectBackoff(sessionId);
                setTimeout(() => connectToWhatsApp(sessionId), 1000);
                return;
            }
            
            // Special handling for 428 (Precondition Required)
            if (statusCode === 428) {
                 const delay = scheduleReconnectWithBackoff(sessionId, 2000);
                 log(`Session ${sessionId} encountered 428 (Precondition Required). Retrying in ${delay}ms`, sessionId);
                 return;
            }

            updateStatus('DISCONNECTED', 'Connection closed.', '', reason);

            if (shouldReconnect) {
                const delay = scheduleReconnectWithBackoff(sessionId);
                log(`Scheduling reconnect for session ${sessionId} in ${delay}ms`, sessionId);
            } else {
                log(`Not reconnecting for session ${sessionId} due to fatal error.`, sessionId);
                if (pairingInfo) {
                    phonePairing.updatePairingStatus(sessionId, {
                        status: 'PAIRING_FAILED',
                        detail: `Connection failed: ${reason}`
                    });
                }
                const sessionDir = path.join(__dirname, 'auth_info_baileys', sessionId);
                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                    log(`Cleared session data for ${sessionId}`, sessionId);
                }
                await cleanupSessionResources(sessionId);
                await releaseSessionLock(sessionId);
                resetReconnectBackoff(sessionId);
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

    const lockAcquired = await acquireSessionLock(sessionId);
    if (!lockAcquired) {
        throw new Error(`Session ${sessionId} is locked by another instance. Try again from the owning server.`);
    }

    // Register session in Redis for persistence tracking
    try {
        await redisClient.sAdd('wa:session_list', sessionId);
    } catch (err) {
        log(`Error registering session ${sessionId} in Redis: ${err.message}`, 'SYSTEM');
    }
    
    try {
        const token = crypto.randomBytes(32).toString('hex');
        sessionTokens.set(sessionId, token);
        saveTokens();
        
        sessions.set(sessionId, { 
            sessionId: sessionId, 
            status: 'CREATING', 
            detail: 'Session is being created.',
            owner: createdBy
        });
        
        if (createdBy) {
            await userManager.addSessionToUser(createdBy, sessionId);
        }
        
        const timeoutMs = Math.min(SESSION_TIMEOUT_HOURS * 60 * 60 * 1000, 24 * 60 * 60 * 1000);
        setTimeout(async () => {
            const session = sessions.get(sessionId);
            if (session && session.status !== 'CONNECTED') {
                await deleteSession(sessionId);
                log(`Auto-deleted inactive session after ${SESSION_TIMEOUT_HOURS} hours: ${sessionId}`, 'SYSTEM');
            }
        }, timeoutMs);
        
        connectToWhatsApp(sessionId);
        return { status: 'success', message: `Session ${sessionId} created.`, token };
    } catch (error) {
        await releaseSessionLock(sessionId);
        throw error;
    }
}

async function deleteSession(sessionId) {
    resetReconnectBackoff(sessionId);
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
    
    // Clear pairing status if it exists
    if (phonePairing) {
        await phonePairing.deletePairing(sessionId);
    }

    sessions.delete(sessionId);
    sessionTokens.delete(sessionId);
    saveTokens();
    
    // Clean up Redis session data
    try {
        const keys = await redisClient.keys(`wa:sess:${sessionId}:*`);
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
        // Also delete settings and remove from session list
        await redisClient.del(`wa:settings:${sessionId}`);
        await redisClient.sRem('wa:session_list', sessionId); // Remove from tracking list
        log(`Cleared Redis session data for ${sessionId}`, 'SYSTEM');
    } catch (error) {
        log(`Error clearing Redis data for ${sessionId}: ${error.message}`, 'SYSTEM');
    }

    // const sessionDir = path.join(__dirname, 'auth_info_baileys', sessionId);
    // if (fs.existsSync(sessionDir)) {
    //     fs.rmSync(sessionDir, { recursive: true, force: true });
    // }

    await cleanupSessionResources(sessionId);
    await releaseSessionLock(sessionId);

    log(`Session ${sessionId} deleted and data cleared.`, 'SYSTEM');
    broadcast({ type: 'session-update', data: getSessionsDetails() });
}

// Function to regenerate API token for a session
async function regenerateSessionToken(sessionId) {
    if (!sessions.has(sessionId)) {
        throw new Error('Session not found');
    }
    const newToken = crypto.randomBytes(32).toString('hex');
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
    const sessionIds = new Set();

    // 1. Try to load from Redis List
    try {
        const redisSessions = await redisClient.sMembers('wa:session_list');
        if (redisSessions && redisSessions.length > 0) {
            log(`Found ${redisSessions.length} sessions in Redis list.`);
            redisSessions.forEach(id => sessionIds.add(id));
        } else {
            // 2. Self-Healing: Scan for orphan sessions in Redis (Migration from pure keys)
            log('Checking Redis for untracked sessions (Self-Healing)...');
            const keys = await redisClient.keys('wa:sess:*:creds');
            for (const key of keys) {
                // Format: wa:sess:{sessionId}:creds
                const parts = key.split(':');
                if (parts.length >= 3) {
                    const sessionId = parts[2];
                    sessionIds.add(sessionId);
                    await redisClient.sAdd('wa:session_list', sessionId); // Heal it
                    log(`Recovered orphan session from Redis: ${sessionId}`);
                }
            }
        }
    } catch (err) {
        log(`Error scanning Redis for sessions: ${err.message}`, 'SYSTEM');
    }

    // 3. Fallback: Check local filesystem (Legacy)
    const sessionsDir = path.join(__dirname, 'auth_info_baileys');
    if (fs.existsSync(sessionsDir)) {
        const sessionFolders = fs.readdirSync(sessionsDir);
        for (const sessionId of sessionFolders) {
            const sessionPath = path.join(sessionsDir, sessionId);
            if (fs.statSync(sessionPath).isDirectory()) {
                sessionIds.add(sessionId);
            }
        }
    }

    log(`Found ${sessionIds.size} total unique session(s) to initialize.`);

    // 4. Re-initialize
    for (const sessionId of sessionIds) {
        // Avoid re-initializing if already active (unlikely during startup but safe)
        if (!sessions.has(sessionId)) {
            log(`Re-initializing session: ${sessionId}`);
            try {
                await createSession(sessionId); 
            } catch (error) {
                log(`Skipped session ${sessionId} during bootstrap: ${error.message}`, 'SYSTEM');
            }
        }
    }
}

loadSystemLogFromDisk();
server.listen(PORT, () => {
    log(`Server is running on port ${PORT}`);
    log('Admin dashboard available at http://localhost:3000/admin/dashboard.html');
    loadTokens(); // Load tokens at startup
    initializeExistingSessions();
    
    // Start campaign scheduler
    // startCampaignScheduler();
});

// Campaign Scheduler Removed

// Graceful shutdown to clean up
const gracefulShutdown = (signal) => {
  console.log(`[SYSTEM] Received ${signal}, shutting down gracefully...`);
  
  // Close all WA sessions
  for (const [sessionId, session] of sessions.entries()) {
    try {
      console.log(`[${sessionId}] Closing session...`);
      // session.sock?.logout(); // DO NOT LOGOUT on shutdown, it kills the session!
      session.sock?.ws?.close(); // Just close the connection
    } catch (err) {
      console.error(`[${sessionId}] Error during shutdown:`, err);
    }
  }
  
  // Close Express server
  server.close(() => {
    console.log('[SYSTEM] HTTP server closed');
    process.exit(0);
  });
  
  // Force exit jika tidak selesai dalam 10 detik
  setTimeout(() => {
    console.error('[SYSTEM] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server };
