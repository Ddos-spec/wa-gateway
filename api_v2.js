const express = require('express');
const { body, param, validationResult } = require('express-validator');
const RateLimiter = require('./src/middleware/rate-limiter');

function initializeApiV2(services) {
    const { sessionManager, messageService, phonePairing, authService, logger, redis } = services;
    const router = express.Router();

    // Initialize rate limiter
    const rateLimiter = new RateLimiter(redis, logger);

    // --- Middleware ---

    const requireAuth = (req, res, next) => {
        if (!req.session.authed) {
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }
        next();
    };

    // Rate limiting for pairing endpoint (3 attempts per 2 minutes)
    const pairingRateLimit = rateLimiter.create({
        windowMs: 120000, // 2 minutes
        max: 3, // 3 pairing attempts
        keyPrefix: 'pairing',
        message: 'Too many pairing attempts. Please wait 2 minutes before trying again.'
    });

    // ============================================
    // AUTHENTICATION
    // ============================================

    router.post('/admin/login', [
        body('password').isString().notEmpty().withMessage('Password is required'),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
        }

        try {
            const { password } = req.body;
            const adminPassword = process.env.ADMIN_DASHBOARD_PASSWORD;

            if (password === adminPassword) {
                req.session.authed = true;
                req.session.user = {
                    id: 0,
                    email: 'admin',
                    role: 'admin'
                };

                await new Promise((resolve, reject) => {
                    req.session.save((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });

                logger.info('Admin login successful', 'AUTH', { sessionId: req.sessionID });
                return res.status(200).json({
                    status: 'success',
                    message: 'Login successful',
                    role: 'admin',
                    email: 'admin'
                });
            } else {
                logger.warn('Admin login failed', 'AUTH');
                return res.status(401).json({ status: 'error', message: 'Invalid password' });
            }
        } catch (error) {
            logger.error('Login error', 'AUTH', { error: error.message });
            return res.status(500).json({ status: 'error', message: 'Internal server error during login' });
        }
    });

    router.post('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                logger.error('Logout error', 'AUTH', { error: err.message });
                return res.status(500).json({ status: 'error', message: 'Failed to logout' });
            }
            res.status(200).json({ status: 'success', message: 'Logged out successfully' });
        });
    });

    // Check current session
    router.get('/me', requireAuth, (req, res) => {
        try {
            const user = req.session.user;
            res.status(200).json({
                email: user.email,
                role: user.role,
                id: user.id
            });
        } catch (error) {
            logger.error('Failed to get current user', 'AUTH', { error: error.message });
            res.status(500).json({ status: 'error', message: 'Failed to get user info' });
        }
    });

    // ============================================
    // SESSION MANAGEMENT
    // ============================================

    // This is now handled by the pairing flow, but could be used for QR-only sessions
    router.post('/sessions', requireAuth, [
        body('sessionId').isString().notEmpty(),
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

    router.get('/sessions', requireAuth, (req, res) => {
        try {
            const sessions = sessionManager.getSessionsForUser(null, true); // Admin gets all sessions
            res.status(200).json({ status: 'success', data: sessions });
        } catch (error) {
            logger.error('Failed to get sessions', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', message: 'Failed to retrieve sessions' });
        }
    });

    router.delete('/sessions/:sessionId', requireAuth, async (req, res) => {
        try {
            const { sessionId } = req.params;
            const session = sessionManager.getSession(sessionId);
            if (!session) {
                return res.status(404).json({ status: 'error', message: 'Session not found' });
            }
            await sessionManager.deleteSession(sessionId);
            res.status(200).json({ status: 'success', message: `Session ${sessionId} deleted` });
        } catch (error) {
            logger.error('Failed to delete session', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', message: error.message });
        }
    });
    
    router.get('/sessions/:sessionId/status', requireAuth, (req, res) => {
        const { sessionId } = req.params;
        const session = sessionManager.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ status: 'error', message: 'Session not found' });
        }
        res.status(200).json({ status: 'success', data: session });
    });

    router.post('/sessions/:sessionId/regenerate-token', requireAuth, async (req, res) => {
        try {
            const { sessionId } = req.params;
            const newToken = sessionManager.regenerateToken(sessionId);
            res.status(200).json({ status: 'success', token: newToken });
        } catch (error) {
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    router.put('/sessions/:sessionId/settings', requireAuth, [
        body('webhooks').optional().isArray(),
        body('webhooks.*').optional().isURL(),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: 'error', errors: errors.array() });
        }

        try {
            const { sessionId } = req.params;
            const session = sessionManager.getSession(sessionId);
            if (!session) {
                return res.status(404).json({ status: 'error', message: 'Session not found' });
            }

            await sessionManager.updateSettings(sessionId, req.body);
            res.status(200).json({ status: 'success', message: 'Settings updated successfully' });

        } catch (error) {
            logger.error('Failed to update settings', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ============================================
    // MESSAGE SENDING
    // ============================================
    // This requires a valid session-specific token, not a user cookie
    const validateApiToken = (req, res, next) => {
        const sessionId = req.params.sessionId || req.body.sessionId;
        const authHeader = req.headers['authorization'];
        const token = authHeader?.split(' ')[1];
        if (!token) return res.status(401).json({ status: 'error', message: 'Authorization token is missing' });
        if (!sessionId) return res.status(400).json({ status: 'error', message: 'sessionId is required' });
        if (!sessionManager.validateToken(sessionId, token)) return res.status(403).json({ status: 'error', message: 'Invalid or expired token' });
        req.sessionId = sessionId;
        next();
    };

    router.post('/messages/send', validateApiToken, [
        body('to').isString().notEmpty(),
        body('type').isIn(['text', 'image', 'video', 'audio', 'document', 'sticker']),
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
            const { to, type, text, mediaUrl, caption, fileName, mimetype } = req.body;
            let result;
            switch (type) {
                case 'text': result = await messageService.sendText(req.sessionId, to, text); break;
                case 'image': result = await messageService.sendImage(req.sessionId, to, mediaUrl, caption); break;
                case 'video': result = await messageService.sendVideo(req.sessionId, to, mediaUrl, caption); break;
                case 'audio': result = await messageService.sendAudio(req.sessionId, to, mediaUrl); break;
                case 'document': result = await messageService.sendDocument(req.sessionId, to, mediaUrl, fileName, mimetype); break;
                case 'sticker': result = await messageService.sendSticker(req.sessionId, to, mediaUrl); break;
            }
            res.status(200).json({ status: 'success', data: result });
        } catch (error) {
            logger.error('Failed to send message', 'API_V2', { error: error.message, sessionId: req.sessionId });
            res.status(500).json({ status: 'error', message: error.message });
        }
    });

    // ============================================
    // WEBSOCKET AUTHENTICATION
    // ============================================

    router.get('/ws-auth', requireAuth, (req, res) => {
        try {
            const email = req.session.user.email;
            const wsToken = sessionManager.generateWsToken(email);
            res.status(200).json({ wsToken });
        } catch (error) {
            logger.error('Failed to generate WS token', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', message: 'Failed to generate WebSocket token' });
        }
    });

    // ============================================
    // PHONE PAIRING
    // ============================================
    
    router.post('/pairing/start', requireAuth, pairingRateLimit, [
        body('phoneNumber').isString().notEmpty().withMessage('phoneNumber is required'),
        body('sessionName')
            .optional()
            .isString()
            .matches(/^[a-zA-Z0-9_-]{3,30}$/)
            .withMessage('sessionName must be 3-30 characters (letters, numbers, hyphens, underscores only)'),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: 'error', errors: errors.array() });
        }
        try {
            const { phoneNumber, sessionName } = req.body;
            const creatorEmail = req.session.user.email;

            // If custom sessionName provided, check if it already exists
            if (sessionName) {
                const existingSession = sessionManager.getSession(sessionName);
                if (existingSession) {
                    return res.status(409).json({
                        status: 'error',
                        message: `Session name "${sessionName}" already exists. Please choose a different name.`
                    });
                }
            }

            // Check if there's already an active pairing session for this number
            const existingPairing = await phonePairing.findStalePairing(phoneNumber);
            if (existingPairing) {
                logger.info('Found existing pairing session, reusing it', 'API_V2', {
                    sessionId: existingPairing.sessionId,
                    phoneNumber
                });

                // Return existing session instead of creating duplicate
                return res.status(202).json({
                    status: 'success',
                    message: 'Returning existing pairing session.',
                    sessionId: existingPairing.sessionId
                });
            }

            const { sessionId } = await phonePairing.createPairing(creatorEmail, phoneNumber, sessionName);
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