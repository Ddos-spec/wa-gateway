const express = require('express');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csurf = require('csurf');
const validator = require('validator');
const { formatPhoneNumber, toWhatsAppFormat, isValidPhoneNumber } = require('./phone-utils');
// Remove: const { log } = require('./index');

const router = express.Router();

// Webhook URL management is now handled by saveSessionSettings/loadSessionSettings in index.js
// The old functions (get/set/deleteWebhookUrl) are obsolete and removed.

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

function initializeApi(sessions, sessionTokens, createSession, getSessionsDetails, deleteSession, log, phonePairing, saveSessionSettings, regenerateSessionToken, redisClient) {
    if (redisClient) {
        setRedisClient(redisClient);
    }

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
        // Trust proxy headers for proper IP detection
        trustProxy: true,
        standardHeaders: true,
        legacyHeaders: false
    });
    
    router.use(apiLimiter);
    // CSRF protection for dashboard and sensitive endpoints (not for API clients)
    // router.use(csurf()); // Uncomment if you want CSRF for all POST/DELETE

    const validateToken = (req, res, next) => {
        // Allow access if the user is authenticated via admin session cookie
        if (req.session && req.session.adminAuthed) {
            // To make downstream logic consistent, we can attach currentUser like in checkAuth
            req.currentUser = {
                email: req.session.userEmail,
                role: req.session.userRole
            };
            return next();
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token == null) {
            return res.status(401).json({ status: 'error', message: 'No token provided' });
        }
        
        const sessionId = req.query.sessionId || req.body.sessionId || req.params.sessionId;
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
            
            // Log activity removed
            
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

    // All obsolete campaign and recipient list endpoints have been removed.

    // Middleware for session-based authentication check
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
    
    
    // Debug endpoint to check session status
    router.get('/debug/sessions', checkCampaignAccess, (req, res) => {
        const debugInfo = {};
        sessions.forEach((session, sessionId) => {
            debugInfo[sessionId] = {
                status: session.status,
                hasSock: !!session.sock,
                sockConnected: session.sock ? 'yes' : 'no',
                owner: session.owner,
                detail: session.detail
            };
        });
        res.json(debugInfo);
    });

    // Official WhatsApp Phone Pairing Endpoint
    router.post('/session/pair-phone', checkAuth, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
        // Accept sessionId from frontend, default to null if not provided
        const { phoneNumber, sessionId: customSessionId } = req.body;
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
            // If a custom session ID is provided, check if it already exists.
            if (customSessionId && (sessions.has(customSessionId) || phonePairing.getPairingStatus(customSessionId))) {
                return res.status(409).json({
                    status: 'error',
                    message: `Session with ID "${customSessionId}" already exists or is pending.`
                });
            }

            // Find and delete any stale pairing sessions for this number to ensure a fresh start
            const stalePairing = phonePairing.findStalePairing(phoneNumber);
            if (stalePairing && stalePairing.sessionId) {
                const staleSessionId = stalePairing.sessionId;
                log(`Deleting stale pairing session ${staleSessionId} for number ${phoneNumber}.`, 'SYSTEM');
                await deleteSession(staleSessionId); // Deletes auth folder & main session
                phonePairing.deletePairing(staleSessionId); // Deletes from pairing_statuses.json
            }

            // Use the custom session ID if provided, otherwise create a new one.
            // The 'createPairing' function now needs to accept an optional sessionId.
            // This change will be made to the PhonePairing class definition.
            const { sessionId } = await phonePairing.createPairing(currentUser.email, phoneNumber, customSessionId);

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

    // Consolidated endpoint for GETTING and POSTING session settings
    router.route('/sessions/:sessionId/settings')
        .get(async (req, res) => {
            const { sessionId } = req.params;
            const session = sessions.get(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }
            res.status(200).json(session.settings || {});
        })
        .post(async (req, res) => {
            log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, body: req.body });
            const { sessionId } = req.params;
            const settings = req.body;

            if (typeof settings !== 'object' || settings === null) {
                return res.status(400).json({ status: 'error', message: 'Invalid settings format. Expected an object.' });
            }

            try {
                await saveSessionSettings(sessionId, settings);
                res.status(200).json({ status: 'success', message: 'Settings saved successfully.' });
            } catch (error) {
                log(`API Error saving settings for ${sessionId}: ${error.message}`, 'SYSTEM', { error });
                res.status(500).json({ status: 'error', message: 'Failed to save settings.' });
            }
        });

    router.delete('/sessions/:sessionId', async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl, params: req.params });
        const { sessionId } = req.params;
        
        // Get current user from session
        const currentUser = req.session && req.session.adminAuthed ? {
            email: req.session.userEmail,
            role: req.session.userRole
        } : null;
        
        try {
            await deleteSession(sessionId);
            
            // Log activity
                    // Log session delete removed            
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

        // Activity logging removed
        
        log('Messages sent', sessionId, { 
            event: 'messages-sent', 
            sessionId, 
            count: results.length, 
            phoneNumbers: phoneNumbers,
            messages: messageContents 
        });
        res.status(200).json(results);
    });

    // Endpoint to regenerate API token
    router.post('/sessions/:sessionId/regenerate-token', checkAuth, async (req, res) => {
        log('API request', 'SYSTEM', { event: 'api-request', method: req.method, endpoint: req.originalUrl });
        const { sessionId } = req.params;

        try {
            // The regenerateSessionToken function needs to be passed into initializeApi
            const newToken = await regenerateSessionToken(sessionId);
            res.status(200).json({ status: 'success', message: 'Token regenerated successfully.', token: newToken });
        } catch (error) {
            log(`API Error regenerating token for ${sessionId}: ${error.message}`, 'SYSTEM', { error });
            res.status(500).json({ status: 'error', message: 'Failed to regenerate token.' });
        }
    });

    router.delete('/message', async (req, res) => {
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

module.exports = { initializeApi };