const express = require('express');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const { formatPhoneNumber, toWhatsAppFormat, isValidPhoneNumber } = require('./phone-utils');

const router = express.Router();

// --- Unified Webhook Settings Management ---
function getSettingsFilePath(sessionId) {
    const sessionPath = path.join(__dirname, 'auth_info_baileys', sessionId);
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }
    return path.join(sessionPath, 'settings.json');
}

async function loadSessionSettings(sessionId) {
    try {
        const filePath = getSettingsFilePath(sessionId);
        if (fs.existsSync(filePath)) {
            const data = await fs.promises.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Error loading settings for session ${sessionId}: ${error.message}`);
    }
    return {}; // Return empty object if no settings found or error
}

async function saveSessionSettings(sessionId, settings) {
    try {
        const filePath = getSettingsFilePath(sessionId);
        await fs.promises.writeFile(filePath, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error(`Error saving settings for session ${sessionId}: ${error.message}`);
        throw error;
    }
}

// This function is now used to get the "default" or first webhook URL for simple cases.
// The main logic in index.js handles multiple webhooks.
async function getWebhookUrl(sessionId) {
    const settings = await loadSessionSettings(sessionId);
    if (settings && settings.webhooks && settings.webhooks.length > 0) {
        return settings.webhooks[0]; // Return the first URL as the default
    }
    return process.env.WEBHOOK_URL || ''; // Fallback to environment variable
}

// This function sets the "default" (first) webhook URL.
async function setWebhookUrl(sessionId, url) {
    const settings = await loadSessionSettings(sessionId);
    settings.webhooks = [url]; // Overwrite with a single URL
    await saveSessionSettings(sessionId, settings);
}

// This function clears all webhook URLs.
async function deleteWebhookUrl(sessionId) {
    const settings = await loadSessionSettings(sessionId);
    settings.webhooks = [];
    await saveSessionSettings(sessionId, settings);
}
// --- End of Unified Webhook Settings Management ---

// Multer setup for file uploads
const mediaDir = path.join(__dirname, 'media');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, mediaDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${randomUUID()}${ext}`);
    }
});
const upload = multer({ storage });

function initializeApi(sessions, sessionTokens, createSession, getSessionsDetails, deleteSession, log, userManager, phonePairing, regenerateSessionToken, updateSessionState) {
    // Security middlewares
    router.use(helmet());
    
    // More lenient rate limiter for authenticated dashboard requests
    const apiLimiter = rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 100, // Increased from 30 to 100 requests per minute
        message: { status: 'error', message: 'Too many requests, please try again later.' },
        skip: (req) => {
            // Skip rate limiting for authenticated admin users
            return req.session && req.session.adminAuthed;
        },
        standardHeaders: true,
        legacyHeaders: false
    });
    
    router.use(apiLimiter);

    const validateToken = (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token == null) {
            return res.status(401).json({ status: 'error', message: 'No token provided' });
        }
        
        const sessionId = req.query.sessionId || req.body.sessionId || req.params?.sessionId;
        if (sessionId) {
            const expectedToken = sessionTokens.get(sessionId);
            if (expectedToken && token === expectedToken) {
                return next();
            }
        }
        
        const isAnyTokenValid = Array.from(sessionTokens.values()).includes(token);
        if (isAnyTokenValid) {
            if (sessionId) {
                 return res.status(403).json({ status: 'error', message: `Invalid token for session ${sessionId}` });
            }
            return next();
        }

        return res.status(403).json({ status: 'error', message: 'Invalid token' });
    };

    // Unprotected routes
    router.post('/sessions', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        
        // Get current user from session
        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;
        
        // Check if user is authenticated or has master API key
        if (!currentUser) {
            const masterKey = req.headers['x-master-key'];
            const requiredMasterKey = process.env.MASTER_API_KEY;
            
            if (requiredMasterKey && masterKey !== requiredMasterKey) {
                log('Unauthorized session creation attempt', 'SYSTEM', { 
                    event: 'auth-failed', 
                    endpoint: req.originalUrl,
                    ip: req.ip 
                });
                return res.status(401).json({ 
                    status: 'error', 
                    message: 'Master API key required for session creation' 
                });
            }
        }
        
        const { sessionId } = req.body;
        if (!sessionId) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'sessionId is required', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'sessionId is required' });
        }
        
        // Convert spaces to underscores
        const sanitizedSessionId = sessionId.trim().replace(/\s+/g, '_');
        
        try {
            // Pass the creator email to createSession
            const creatorEmail = currentUser ? currentUser.email : null;
            await createSession(sanitizedSessionId, creatorEmail);
            const token = sessionTokens.get(sanitizedSessionId);
            
            log('Session created', sanitizedSessionId, { 
                event: 'session-created', 
                sessionId: sanitizedSessionId,
                createdBy: currentUser ? currentUser.email : 'api-key'
            });
            res.status(201).json({ status: 'success', message: `Session ${sanitizedSessionId} created.`, token: token });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            res.status(500).json({ status: 'error', message: `Failed to create session: ${error.message}` });
        }
    });

    router.get('/sessions', (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });
        
        // Get current user from session
        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;
        
        if (currentUser) {
            // If authenticated, filter sessions based on role
            res.status(200).json(getSessionsDetails(currentUser.email, currentUser.role === 'admin'));
        } else {
            // For API access without authentication, show all sessions (backward compatibility)
            res.status(200).json(getSessionsDetails());
        }
    });

    // Middleware to check campaign access (session-based)
    const checkAuth = async (req, res, next) => {
        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;
        
        if (!currentUser) {
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }
        
        req.currentUser = currentUser;
        next();
    };

    // Official WhatsApp Phone Pairing Endpoint
    router.post('/session/pair-phone', checkAuth, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { phoneNumber } = req.body;
        const currentUser = req.currentUser;

        if (!phoneNumber) {
            return res.status(400).json({
                status: 'error',
                message: 'phoneNumber is required'
            });
        }

        // Validate phone number format
        if (!isValidPhoneNumber(phoneNumber)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid phone number format. Use international format (e.g., 628123456789)'
            });
        }

        try {
            // Find and delete any stale pairing sessions for this number to ensure a fresh start
            const stalePairing = phonePairing.findStalePairing(phoneNumber);
            if (stalePairing && stalePairing.sessionId) {
                const staleSessionId = stalePairing.sessionId;
                log(`Deleting stale pairing session ${staleSessionId} for number ${phoneNumber}.`, 'SYSTEM');
                await deleteSession(staleSessionId); // Deletes auth folder & main session
                phonePairing.deletePairing(staleSessionId); // Deletes from pairing_statuses.json
            }

            const { sessionId } = await phonePairing.createPairing(currentUser.email, phoneNumber);

            // This will create a session and start the connection process
            // The connectToWhatsApp function will see the PENDING_REQUEST and handle pairing
            await createSession(sessionId, currentUser.email);

            res.status(202).json({
                status: 'success',
                message: 'Pairing process initiated. Please check the session status for updates.',
                sessionId: sessionId
            });

        } catch (error) {
            log('Phone pairing error', 'SYSTEM', {
                event: 'phone-pair-error',
                error: error.message,
                endpoint: req.originalUrl,
                phoneNumber: phoneNumber
            });

            res.status(500).json({
                status: 'error',
                message: 'Failed to initiate pairing. Please try again.'
            });
        }
    });

    // Endpoint to check pairing status
    router.get('/session/:sessionId/pair-status', (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });

        const { sessionId } = req.params;

        try {
            const pairingStatus = phonePairing.getPairingStatus(sessionId);

            if (!pairingStatus) {
                // Also check regular sessions for non-pairing statuses
                const regularSession = sessions.get(sessionId);
                if (regularSession) {
                    return res.status(200).json({
                        status: 'success',
                        sessionId: sessionId,
                        sessionStatus: regularSession.status,
                        detail: regularSession.detail || '',
                        phoneNumber: regularSession.phoneNumber || null,
                        pairingCode: null // No pairing code for regular sessions
                    });
                }

                return res.status(404).json({
                    status: 'error',
                    message: 'Session or pairing request not found'
                });
            }

            res.status(200).json({
                status: 'success',
                sessionId: sessionId,
                sessionStatus: pairingStatus.status,
                detail: pairingStatus.detail || '',
                phoneNumber: pairingStatus.phoneNumber || null,
                pairingCode: pairingStatus.pairingCode || null
            });

        } catch (error) {
            log('Pair status check error', 'SYSTEM', {
                event: 'pair-status-error',
                error: error.message,
                endpoint: req.originalUrl,
                sessionId
            });

            res.status(500).json({
                status: 'error',
                message: 'Failed to check pairing status'
            });
        }
    });

    // All routes below this are protected by token
    router.use(validateToken);

    router.get('/sessions/:sessionId/qr', async (req, res) => {
        const { sessionId } = req.params;
        const session = sessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        log(`QR code requested for ${sessionId}`, sessionId);
        // The function `updateSessionState` is not available here, but it is not critical.
        // The main logic in `connectToWhatsApp` will handle the QR generation.
        // For now, just triggering the connection logic is enough.
        // In a future refactor, `updateSessionState` could be passed to `initializeApi`.
        const sessionData = sessions.get(sessionId);
        if (sessionData && sessionData.sock) {
            // A simple way to trigger reconnection/QR generation if needed
            sessionData.sock.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: new Error('QR regeneration requested'), date: new Date() } });
        }
        res.status(200).json({ message: 'QR generation triggered.' });
    });

    router.post('/sessions/:sessionId/settings', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { sessionId } = req.params;
        const settings = req.body;

        if (typeof settings !== 'object' || settings === null) {
            return res.status(400).json({ status: 'error', message: 'Invalid settings format. Expected an object.' });
        }

        try {
            await saveSessionSettings(sessionId, settings);
            // Update in-memory session object in index.js
            const session = sessions.get(sessionId);
            if (session) {
                session.settings = settings;
            }
            res.status(200).json({ status: 'success', message: 'Settings saved successfully.' });
        } catch (error) {
            log(`API Error saving settings for ${sessionId}: ${error.message}`, 'SYSTEM', { error });
            res.status(500).json({ status: 'error', message: 'Failed to save settings.' });
        }
    });

    router.post('/sessions/:sessionId/generate-token', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, params: req.params });
        const { sessionId } = req.params;

        try {
            const newToken = await regenerateSessionToken(sessionId);
            res.status(200).json({ status: 'success', message: 'API Token regenerated successfully.', token: newToken });
        } catch (error) {
            log(`API Error regenerating token for ${sessionId}: ${error.message}`, 'SYSTEM', { error });
            res.status(500).json({ status: 'error', message: `Failed to regenerate API Token: ${error.message}` });
        }
    });

    router.delete('/sessions/:sessionId', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, params: req.params });
        
        const sessionId = req.params?.sessionId;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'Session ID is missing from the request URL.' });
        }

        // Get current user from session
        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;

        // If not authenticated via session, validate the token as a fallback
        if (!currentUser) {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];

            if (token == null) {
                return res.status(401).json({ status: 'error', message: 'Authentication required. No token provided.' });
            }

            const expectedToken = sessionTokens.get(sessionId);
            if (!expectedToken || token !== expectedToken) {
                // Also check if it's a valid token for ANY session, but just not this one.
                const isAnyTokenValid = Array.from(sessionTokens.values()).includes(token);
                if (isAnyTokenValid) {
                    return res.status(403).json({ status: 'error', message: `Invalid token for session ${sessionId}` });
                }
                return res.status(403).json({ status: 'error', message: 'Invalid token.' });
            }
        }
        
        try {
            // Re-check ownership if user is authenticated via session but is not an admin
            if (currentUser && currentUser.role !== 'admin' && userManager) {
                const sessionDetails = getSessionsDetails(currentUser.email, false).find(s => s.sessionId === sessionId);
                if (!sessionDetails) {
                     return res.status(403).json({ 
                        status: 'error', 
                        message: 'Access denied or session not found.' 
                    });
                }
            }
            
            await deleteSession(sessionId);
            
            log('Session deleted', sessionId, { event: 'session-deleted', sessionId });
            res.status(200).json({ status: 'success', message: `Session ${sessionId} deleted.` });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            res.status(500).json({ status: 'error', message: `Failed to delete session: ${error.message}` });
        }
    });

    async function sendMessage(sock, to, message) {
        try {
            const jid = jidNormalizedUser(to);
            const result = await sock.sendMessage(jid, message);
            return { status: 'success', message: `Message sent to ${to}`, messageId: result.key.id };
        } catch (error) {
            console.error(`Failed to send message to ${to}:`, error);
            return { status: 'error', message: `Failed to send message to ${to}. Reason: ${error.message}` };
        }
    }

    // Webhook setup endpoint
    router.post('/webhook', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { url, sessionId } = req.body;
        if (!url || !sessionId) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'URL and sessionId are required.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'URL and sessionId are required.' });
        }
        await setWebhookUrl(sessionId, url);
        log('Webhook URL updated', url, { event: 'webhook-updated', sessionId, url });
        res.status(200).json({ status: 'success', message: `Webhook URL for session ${sessionId} updated to ${url}` });
    });
    
    // Add GET and DELETE endpoints for webhook management
    router.get('/webhook', async (req, res) => {
        const { sessionId } = req.query;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId is required.' });
        }
        const url = await getWebhookUrl(sessionId);
        res.status(200).json({ status: 'success', sessionId, url: url || null });
    });

    router.delete('/webhook', async (req, res) => {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId is required.' });
        }
        await deleteWebhookUrl(sessionId);
        log('Webhook URL deleted', '', { event: 'webhook-deleted', sessionId });
        res.status(200).json({ status: 'success', message: `Webhook for session ${sessionId} deleted.` });
    });

    // Hardened media upload endpoint
    router.post('/media', upload.single('file'), (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        if (!req.file) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'No file uploaded.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'No file uploaded.' });
        }
        // Restrict file type and size
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (!allowedTypes.includes(req.file.mimetype)) {
            fs.unlinkSync(req.file.path);
            log('API error', 'SYSTEM', { event: 'api-error', error: 'Invalid file type.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, PDF, DOC, DOCX, XLS, XLSX.' });
        }
        if (req.file.size > 25 * 1024 * 1024) { // 25MB
            fs.unlinkSync(req.file.path);
            log('API error', 'SYSTEM', { event: 'api-error', error: 'File too large.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'File too large. Max 25MB.' });
        }
        const mediaId = req.file.filename;
        log('File uploaded', mediaId, { event: 'file-uploaded', mediaId });
        res.status(201).json({
            status: 'success',
            message: 'File uploaded successfully.',
            mediaId: mediaId,
            url: `/media/${mediaId}`
        });
    });

    // Main message sending endpoint
    router.post('/messages', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, query: req.query });
        const { sessionId } = req.query;
        if (!sessionId) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'sessionId query parameter is required', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'sessionId query parameter is required' });
        }
        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            log('API error', 'SYSTEM', { event: 'api-error', error: `Session ${sessionId} not found or not connected.`, endpoint: req.originalUrl });
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }
        const messages = Array.isArray(req.body) ? req.body : [req.body];
        const results = [];
        const phoneNumbers = []; // Track all phone numbers for logging
        const messageContents = []; // Track message contents with formatting
        
        for (const msg of messages) {
            const { recipient_type, to, type, text, image, document } = msg;
            // Input validation
            if (!to || !type) {
                results.push({ status: 'error', message: 'Invalid message format. "to" and "type" are required.' });
                continue;
            }
            if (!to.endsWith('@g.us')) {
                // Validate phone number format
                const formattedTo = formatPhoneNumber(to);
                if (!/^\d+$/.test(formattedTo)) {
                    results.push({ status: 'error', message: 'Invalid recipient format.' });
                    continue;
                }
            }
            
            // Add phone number to the list for logging
            phoneNumbers.push(to);
            
            // Track message content based on type
            let messageContent = {
                type: type,
                to: to
            };
            
            if (type === 'text') {
                if (!text || typeof text.body !== 'string' || text.body.length === 0 || text.body.length > 4096) {
                    results.push({ status: 'error', message: 'Invalid text message content.' });
                    continue;
                }
                messageContent.text = text.body; // Preserve formatting
            }
            if (type === 'image' && image) {
                if (image.id && !validator.isAlphanumeric(image.id.replace(/[\.\-]/g, ''))) {
                    results.push({ status: 'error', message: 'Invalid image ID.' });
                    continue;
                }
                if (image.link && !validator.isURL(image.link)) {
                    results.push({ status: 'error', message: 'Invalid image URL.' });
                    continue;
                }
                messageContent.image = {
                    caption: image.caption || '',
                    url: image.link || `/media/${image.id}` // Convert media ID to URL for display
                };
            }
            if (type === 'document' && document) {
                if (document.id && !validator.isAlphanumeric(document.id.replace(/[\.\-]/g, ''))) {
                    results.push({ status: 'error', message: 'Invalid document ID.' });
                    continue;
                }
                if (document.link && !validator.isURL(document.link)) {
                    results.push({ status: 'error', message: 'Invalid document URL.' });
                    continue;
                }
                messageContent.document = {
                    filename: document.filename || 'document',
                    url: document.link || `/media/${document.id}` // Convert media ID to URL for display
                };
            }
            
            messageContents.push(messageContent);

            let destination;
            if (recipient_type === 'group') {
                destination = to.endsWith('@g.us') ? to : `${to}@g.us`;
            } else {
                // Format the phone number for individual recipients
                const formattedTo = formatPhoneNumber(to);
                destination = toWhatsAppFormat(formattedTo);
            }

            let messagePayload;
            let options = {};

            try {
                switch (type) {
                    case 'text':
                        if (!text || !text.body) {
                             throw new Error('For "text" type, "text.body" is required.');
                        }
                        messagePayload = { text: text.body };
                        break;

                    case 'image':
                        if (!image || (!image.link && !image.id)) {
                             throw new Error('For "image" type, "image.link" or "image.id" is required.');
                        }
                        const imageUrl = image.id ? path.join(mediaDir, image.id) : image.link;
                        messagePayload = { image: { url: imageUrl }, caption: image.caption };
                        break;

                    case 'document':
                         if (!document || (!document.link && !document.id)) {
                             throw new Error('For "document" type, "document.link" or "document.id" is required.');
                        }
                        const docUrl = document.id ? path.join(mediaDir, document.id) : document.link;
                        messagePayload = { document: { url: docUrl }, mimetype: document.mimetype, fileName: document.filename };
                        break;

                    default:
                        throw new Error(`Unsupported message type: ${type}`);
                }

                const result = await sendMessage(session.sock, destination, messagePayload);
                results.push(result);

            } catch (error) {
                results.push({ status: 'error', message: `Failed to process message for ${to}: ${error.message}` });
            }
        }
        
        log('Messages sent', sessionId, { 
            event: 'messages-sent', 
            sessionId, 
            count: results.length, 
            phoneNumbers: phoneNumbers,
            messages: messageContents 
        });
        res.status(200).json(results);
    });

    router.post('/message/delete', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        const { sessionId, messageId, remoteJid } = req.body;

        if (!sessionId || !messageId || !remoteJid) {
            log('API error', 'SYSTEM', { event: 'api-error', error: 'sessionId, messageId, and remoteJid are required.', endpoint: req.originalUrl });
            return res.status(400).json({ status: 'error', message: 'sessionId, messageId, and remoteJid are required.' });
        }

        const session = sessions.get(sessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            log('API error', 'SYSTEM', { event: 'api-error', error: `Session ${sessionId} not found or not connected.`, endpoint: req.originalUrl });
            return res.status(404).json({ status: 'error', message: `Session ${sessionId} not found or not connected.` });
        }

        try {
            await session.sock.chatModify({
                clear: { messages: [{ id: messageId, fromMe: true, timestamp: 0 }] }
            }, remoteJid);
            
            // The above is for clearing. For actual deletion:
            await session.sock.sendMessage(remoteJid, { delete: { remoteJid: remoteJid, fromMe: true, id: messageId } });

            log('Message deleted', messageId, { event: 'message-deleted', messageId, sessionId });
            res.status(200).json({ status: 'success', message: `Attempted to delete message ${messageId}` });
        } catch (error) {
            log('API error', 'SYSTEM', { event: 'api-error', error: error.message, endpoint: req.originalUrl });
            console.error(`Failed to delete message ${messageId}:`, error);
            res.status(500).json({ status: 'error', message: `Failed to delete message. Reason: ${error.message}` });
        }
    });
    
    return router;
}

module.exports = { initializeApi, getWebhookUrl: getWebhookUrl };

module.exports = { initializeApi, getWebhookUrl: getWebhookUrl };