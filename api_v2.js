const express = require('express');
const { body, param, validationResult } = require('express-validator');

function initializeApiV2(services) {
    const { sessionManager, messageService, phonePairing, authService, logger } = services;
    const router = express.Router();

    // --- Middleware ---

    const requireAuth = (req, res, next) => {
        if (!req.session.authed) {
            return res.status(401).json({ status: 'error', message: 'Authentication required' });
        }
        next();
    };

    const requireAdmin = (req, res, next) => {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ status: 'error', message: 'Admin access required' });
        }
        next();
    };

    // ============================================
    // AUTHENTICATION
    // ============================================

    router.post('/admin/login', [
        body('password').isString().notEmpty().withMessage('Password is required'),
        body('email').optional().isEmail().withMessage('Invalid email format'),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: 'error', message: 'Validation failed', errors: errors.array() });
        }

        try {
            const { email, password } = req.body;

            // Legacy admin login (no email provided)
            if (!email) {
                const adminPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
                if (password === adminPassword) {
                    // Create a default admin session (legacy mode)
                    req.session.authed = true;
                    req.session.user = {
                        id: 0,
                        email: 'admin@legacy',
                        role: 'admin'
                    };
                    logger.info('Legacy admin login successful', 'AUTH');
                    return res.status(200).json({
                        status: 'success',
                        message: 'Login successful',
                        role: 'admin',
                        email: 'admin@legacy'
                    });
                } else {
                    logger.warn('Legacy admin login failed', 'AUTH');
                    return res.status(401).json({ status: 'error', message: 'Invalid password' });
                }
            }

            // Database-based login (email + password)
            const authResult = await authService.authenticate(email, password);
            if (!authResult.success) {
                logger.warn('Authentication failed', 'AUTH', { email });
                return res.status(401).json({ status: 'error', message: authResult.error });
            }

            // Set session
            req.session.authed = true;
            req.session.user = {
                id: authResult.user.id,
                email: authResult.user.email,
                role: authResult.userType
            };

            logger.info('User login successful', 'AUTH', { email, role: authResult.userType });
            return res.status(200).json({
                status: 'success',
                message: 'Login successful',
                role: authResult.userType,
                email: authResult.user.email
            });

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

    // ============================================
    // USER MANAGEMENT (Admin Only)
    // ============================================

    router.get('/users', requireAuth, requireAdmin, async (req, res) => {
        try {
            const adminId = req.session.user.id;
            const users = await authService.getUsersForAdmin(adminId);
            // Enrich with session data
            const sessions = sessionManager.getSessionsForUser(null, true);
            const usersWithSessions = users.map(u => ({
                ...u,
                role: 'user', // Add role explicitly
                sessions: sessions.filter(s => s.owner === u.email)
            }));
            res.status(200).json(usersWithSessions); // Return array directly as per original frontend
        } catch (error) {
            logger.error('Failed to get users', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', message: 'Failed to retrieve users' });
        }
    });

    router.post('/users', requireAuth, requireAdmin, [
        body('email').isEmail().withMessage('A valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
        body('role').isIn(['user', 'admin']).withMessage('Role must be either user or admin'),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: 'error', errors: errors.array() });
        }
        try {
            const { email, password, role } = req.body;
            const adminId = req.session.user.id;
            const { user } = await authService.createUser({ adminId, email, password, role });
            res.status(201).json({ status: 'success', data: user });
        } catch (error) {
            logger.error('Failed to create user', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', error: error.message }); // Match frontend error expectation
        }
    });

    router.put('/users/:email', requireAuth, requireAdmin, [
        param('email').isEmail(),
        body('password').optional().isLength({ min: 6 }),
        body('isActive').isBoolean(),
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: 'error', errors: errors.array() });
        }
        try {
            const userToUpdate = await authService.findUserByEmail(req.params.email);
            if (!userToUpdate) {
                return res.status(404).json({ status: 'error', error: 'User not found' });
            }

            const updates = { is_active: req.body.isActive };
            if (req.body.password) {
                updates.password = req.body.password;
            }

            const updatedUser = await authService.updateUser(userToUpdate.id, updates);
            res.status(200).json({ status: 'success', data: updatedUser });
        } catch (error) {
            logger.error('Failed to update user', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', error: error.message });
        }
    });

    router.delete('/users/:email', requireAuth, requireAdmin, [
        param('email').isEmail()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ status: 'error', errors: errors.array() });
        }
        try {
            if (req.params.email === req.session.user.email) {
                return res.status(400).json({ status: 'error', error: 'Cannot delete your own account.' });
            }
            const userToDelete = await authService.findUserByEmail(req.params.email);
            if (!userToDelete) {
                return res.status(404).json({ status: 'error', error: 'User not found' });
            }
            await authService.deleteUser(userToDelete.id);
            res.status(200).json({ status: 'success', message: 'User deleted successfully' });
        } catch (error) {
            logger.error('Failed to delete user', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', error: error.message });
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
            const { email, role } = req.session.user;
            const sessions = sessionManager.getSessionsForUser(email, role === 'admin');
            res.status(200).json({ status: 'success', data: sessions });
        } catch (error) {
            logger.error('Failed to get sessions', 'API_V2', { error: error.message });
            res.status(500).json({ status: 'error', message: 'Failed to retrieve sessions' });
        }
    });

    router.delete('/sessions/:sessionId', requireAuth, async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { email, role } = req.session.user;
            const session = sessionManager.getSession(sessionId);
            if (!session) {
                return res.status(404).json({ status: 'error', message: 'Session not found' });
            }
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
            const { email, role } = req.session.user;

            const session = sessionManager.getSession(sessionId);
            if (!session) {
                return res.status(404).json({ status: 'error', message: 'Session not found' });
            }

            if (role !== 'admin' && session.owner !== email) {
                return res.status(403).json({ status: 'error', message: 'Access denied' });
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