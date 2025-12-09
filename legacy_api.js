const express = require('express');
const multer = require('multer');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('validator');
const { validateToken } = require('./api_v1');
const { formatPhoneNumber, toWhatsAppFormat } = require('./phone-utils');

const router = express.Router();
const upload = multer(); // for form-data parsing

// This is a simplified version of the sendMessage function from api_v1.js
// In a real app, you'd likely want to share this logic.
async function sendLegacyMessage(sock, to, message) {
    try {
        const jid = jidNormalizedUser(to);
        const result = await sock.sendMessage(jid, message);
        return { status: 'success', message: `Message sent to ${to}`, messageId: result.key.id };
    } catch (error) {
        console.error(`Failed to send legacy message to ${to}:`, error);
        return { status: 'error', message: `Failed to send legacy message to ${to}. Reason: ${error.message}` };
    }
}

const legacyLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // limit each IP to 10 requests per minute
    message: { status: 'error', message: 'Too many requests, please try again later.' },
    // Trust proxy headers for proper IP detection
    trustProxy: true,
    standardHeaders: true,
    legacyHeaders: false
});

function initializeLegacyApi(sessions, sessionTokens, scheduleMessageSend, validateWhatsAppRecipient) {
    // Enable parsing of URL-encoded bodies (for x-www-form-urlencoded)
    router.use(express.urlencoded({ extended: true }));
    router.use(express.json());

    // Apply rate limiting
    router.use(legacyLimiter);

    // Compatibility Middleware: Map 'apikey' from query/body to Authorization header
    router.use((req, res, next) => {
        const apiKey = req.query.apikey || req.body.apikey;
        if (apiKey && !req.headers['authorization']) {
            req.headers['authorization'] = `Bearer ${apiKey}`;
        }
        next();
    });

    // Apply token validation
    router.use((req, res, next) => validateToken(req, res, next, sessionTokens));

    // Legacy JSON/Form endpoint
    router.post('/send-message', async (req, res) => {
        // Extract params from body (POST) or query (GET - though this is POST route)
        // Support both JSON and UrlEncoded
        const { 
            sessionId, // Optional, if not provided we can try to find session by token? No, token map is sessionId -> token.
            // Wait, validateToken validates the token. 
            // If we don't have sessionId in body, we need to find which session this token belongs to.
            // But validateToken doesn't attach sessionId to req.
            
            number, // Old param name
            receiver, // New param name
            message, // Old param name
            text, // New param name
            mtype,
            url
        } = req.body;

        // Resolve effective parameters
        const targetNumber = number || receiver;
        const targetMessage = message || text;
        
        // If sessionId is not provided, we need to find it from the token
        let targetSessionId = sessionId;
        if (!targetSessionId) {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            // Find session by token
            for (const [sessId, sessToken] of sessionTokens.entries()) {
                if (sessToken === token) {
                    targetSessionId = sessId;
                    break;
                }
            }
        }

        if (!targetSessionId || !targetNumber) {
            return res.status(400).json({ status: 'error', message: 'Session ID (or valid ApiKey) and receiver/number are required.' });
        }

        const session = sessions.get(targetSessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${targetSessionId} not found or not connected.` });
        }

        const formattedNumber = formatPhoneNumber(targetNumber);
        if (!/^\d+$/.test(formattedNumber)) {
            return res.status(400).json({ status: 'error', message: 'Invalid phone number format.' });
        }
        const destination = toWhatsAppFormat(formattedNumber);

        try {
            await validateWhatsAppRecipient(session.sock, destination, targetSessionId);
        } catch (error) {
            return res.status(400).json({ status: 'error', message: 'Recipient is not a valid WhatsApp user.' });
        }

        const sendPromise = scheduleMessageSend(targetSessionId, async () => {
            const activeSession = sessions.get(targetSessionId);
            if (!activeSession || !activeSession.sock || activeSession.status !== 'CONNECTED') {
                throw new Error('Session not available during send process.');
            }
            if (mtype === 'image' && url) {
                return sendLegacyMessage(activeSession.sock, destination, { 
                    image: { url: url },
                    caption: targetMessage || ''
                });
            }
            if (!targetMessage) {
                throw new Error('Message content is required for text type.');
            }
            return sendLegacyMessage(activeSession.sock, destination, { text: targetMessage });
        });

        try {
            const result = await sendPromise;
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Legacy form-data endpoint
    router.post('/message', upload.none(), async (req, res) => {
        const { phone, message, sessionId } = req.body;
        const targetSessionId = sessionId || 'putra';
        if (!phone || !message) {
            return res.status(400).json({ status: 'error', message: 'phone and message are required.' });
        }
        // Input validation
        const formattedPhone = formatPhoneNumber(phone);
        if (!/^\d+$/.test(formattedPhone)) {
            return res.status(400).json({ status: 'error', message: 'Invalid phone number format.' });
        }
        if (typeof message !== 'string' || message.length === 0 || message.length > 4096) {
            return res.status(400).json({ status: 'error', message: 'Invalid message content.' });
        }
        
        const session = sessions.get(targetSessionId);
        if (!session || !session.sock || session.status !== 'CONNECTED') {
            return res.status(404).json({ status: 'error', message: `Session ${targetSessionId} not found or not connected.` });
        }

        const destination = toWhatsAppFormat(formattedPhone);

        try {
            await validateWhatsAppRecipient(session.sock, destination, targetSessionId);
        } catch (error) {
            return res.status(400).json({ status: 'error', message: 'Recipient is not a valid WhatsApp user.' });
        }

        try {
            const result = await scheduleMessageSend(targetSessionId, async () => {
                const activeSession = sessions.get(targetSessionId);
                if (!activeSession || !activeSession.sock || activeSession.status !== 'CONNECTED') {
                    throw new Error('Session not available during send process.');
                }
                return sendLegacyMessage(activeSession.sock, destination, { text: message });
            });
            res.status(200).json(result);
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    return router;
}

module.exports = { initializeLegacyApi }; 
