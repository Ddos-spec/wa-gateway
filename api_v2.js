const express = require('express');
const { body, query, validationResult } = require('express-validator');

function initializeApiV2(services) {
    const { sessionManager, messageService, phonePairing, logger } = services;
    const router = express.Router();

    // Middleware untuk validasi token API
    const validateToken = (req, res, next) => {
        const sessionId = req.params.sessionId || req.query.sessionId || req.body.sessionId;
        const authHeader = req.headers['authorization'];
        const token = authHeader?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ status: 'error', message: 'Authorization token is missing' });
        }
        if (!sessionId) {
            return res.status(400).json({ status: 'error', message: 'sessionId is required' });
        }

        if (!sessionManager.validateToken(sessionId, token)) {
            return res.status(403).json({ status: 'error', message: 'Invalid or expired token for the given session' });
        }

        req.sessionId = sessionId;
        next();
    };
    
    // Middleware untuk memeriksa otentikasi sesi admin (cookie)
    const requireAuth = (req, res, next) => {
        if (!req.session.authed) {
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }
        next();
    };

    // ============================================
    // SESSION MANAGEMENT
    // ============================================

    // Membuat sesi baru
    router.post('/sessions', requireAuth, [
        body('sessionId').isString().notEmpty().withMessage('sessionId must be a non-empty string'),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: 'error', errors: errors.array() });
        }

        try {
            const { sessionId } = req.body;
            const creatorEmail = req.session.user.email;
            const result = await sessionManager.createSession(sessionId, creatorEmail);
            res.status(201).json({ status: 'success', ...result });
        } catch (error) {
            logger.error('Failed to create session', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // Mendapatkan semua sesi untuk pengguna yang login
    router.get('/sessions', requireAuth, (req, res) => {
        try {
            const { email, role } = req.session.user;
            const sessions = sessionManager.getSessionsForUser(email, role === 'admin');
            res.status(200).json({ status: 'success', data: sessions });
        } catch (error) {
            logger.error('Failed to get sessions', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', message: 'Failed to retrieve sessions' });
        }
    });

    // Menghapus sesi
    router.delete('/sessions/:sessionId', requireAuth, async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { email, role } = req.session.user;

            const session = sessionManager.getSession(sessionId);
            if (!session) {
                return res.status(404).json({ status: 'error', message: 'Session not found' });
            }

            // Admin bisa menghapus sesi apa pun, pengguna biasa hanya sesi miliknya
            if (role !== 'admin' && session.owner !== email) {
                return res.status(403).json({ status: 'error', message: 'Access denied' });
            }

            await sessionManager.deleteSession(sessionId);
            res.status(200).json({ status: 'success', message: `Session ${sessionId} deleted` });
        } catch (error) {
            logger.error('Failed to delete session', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', message: error.message });
        }
    });
    
    // Mendapatkan status sesi
    router.get('/sessions/:sessionId/status', requireAuth, (req, res) => {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ status: 'error', message: 'Session not found' });
        }
        res.status(200).json({ status: 'success', data: session });
    });

    // Regenerate token
    router.post('/sessions/:sessionId/regenerate-token', requireAuth, async (req, res) => {
        try {
            const { sessionId } = req.params;
            const newToken = sessionManager.regenerateToken(sessionId);
            res.status(200).json({ status: 'success', token: newToken });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ============================================
    // MESSAGE SENDING
    // ============================================

    router.post('/messages/send', validateToken, [
        body('to').isString().notEmpty(),
        body('type').isIn(['text', 'image', 'video', 'audio', 'document']),
        body('text').optional().isString(),
        body('mediaUrl').optional().isURL(),
        body('caption').optional().isString(),
        body('fileName').optional().isString(),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: 'error', errors: errors.array() });
        }

        try {
            const { to, type, text, mediaUrl, caption, fileName } = req.body;
            let result;

            switch (type) {
                case 'text':
                    result = await messageService.sendText(req.sessionId, to, text);
                    break;
                case 'image':
                    result = await messageService.sendImage(req.sessionId, to, mediaUrl, caption);
                    break;
                case 'video':
                    result = await messageService.sendVideo(req.sessionId, to, mediaUrl, caption);
                    break;
                case 'audio':
                    result = await messageService.sendAudio(req.sessionId, to, mediaUrl);
                    break;
                case 'document':
                    result = await messageService.sendDocument(req.sessionId, to, mediaUrl, fileName, caption);
                    break;
            }
            res.status(200).json({ status: 'success', data: result });
        } catch (error) {
            logger.error('Failed to send message', 'API_V2', { error: error.message, sessionId: req.sessionId });
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ============================================
    // PHONE PAIRING
    // ============================================
    
    router.post('/pairing/start', requireAuth, [
        body('phoneNumber').isString().notEmpty().withMessage('phoneNumber is required'),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: 'error', errors: errors.array() });
        }

        try {
            const { phoneNumber } = req.body;
            const creatorEmail = req.session.user.email;
            
            const { sessionId } = await phonePairing.createPairing(creatorEmail, phoneNumber);
            await sessionManager.createSession(sessionId, creatorEmail, phoneNumber);

            res.status(202).json({
                status: 'success',
                message: 'Pairing process initiated. Check session status for updates.',
                sessionId: sessionId
            });
        } catch (error) {
            logger.error('Failed to start pairing', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    return router;
}

module.exports = { initializeApiV2 };