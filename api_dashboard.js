/**
 * User Dashboard API
 *
 * API endpoints for user dashboard functionality
 */

const express = require('express');
const router = express.Router();
const authService = require('./src/auth/auth-service');
const { User, WaNumber, WaFolder, ChatLog, Admin } = require('./db');
const { getLogger } = require('./src/utils/logger');

const logger = getLogger();

let services = {}; // Will be injected from main app

/**
 * Middleware to check authentication
 */
function requireAuth(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    const sessionData = authService.validateSessionToken(token);

    if (!sessionData) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }

    // Attach user info to request
    req.user = sessionData;
    next();
}

/**
 * Middleware to check admin role
 */
function requireAdmin(req, res, next) {
    if (req.user.userType !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
    }
    next();
}

/**
 * Initialize dashboard API
 * @param {Express.Application} app - Express app
 * @param {Object} injectedServices - Services from main app
 */
function initializeDashboardApi(app, injectedServices) {
    services = injectedServices;

    // ==================== AUTHENTICATION ====================

    /**
     * POST /api/dashboard/login
     * User/Admin login
     */
    router.post('/login', async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Email and password are required'
                });
            }

            const authResult = await authService.authenticate(email, password);

            if (!authResult.success) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid credentials'
                });
            }

            // Generate session token
            const token = authService.generateSessionToken(authResult.user, authResult.userType);

            logger.info('User logged in via dashboard', 'DASHBOARD_API', {
                email,
                userType: authResult.userType
            });

            res.json({
                success: true,
                token,
                user: {
                    id: authResult.user.id,
                    email: authResult.user.email,
                    userType: authResult.userType,
                    adminId: authResult.user.admin_id || authResult.user.id
                }
            });

        } catch (error) {
            logger.error('Login error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Login failed'
            });
        }
    });

    /**
     * POST /api/dashboard/logout
     * Logout
     */
    router.post('/logout', requireAuth, async (req, res) => {
        try {
            const token = req.headers['authorization']?.replace('Bearer ', '');
            authService.revokeSessionToken(token);

            res.json({
                success: true,
                message: 'Logged out successfully'
            });

        } catch (error) {
            logger.error('Logout error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Logout failed'
            });
        }
    });

    /**
     * GET /api/dashboard/me
     * Get current user info
     */
    router.get('/me', requireAuth, async (req, res) => {
        try {
            const user = await authService.getUserById(req.user.userId, req.user.userType);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            res.json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    userType: req.user.userType,
                    adminId: user.admin_id || user.id,
                    createdAt: user.created_at
                }
            });

        } catch (error) {
            logger.error('Get user info error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get user info'
            });
        }
    });

    // ==================== USER DASHBOARD ====================

    /**
     * GET /api/dashboard/wa-numbers
     * Get user's WA numbers grouped by folder
     */
    router.get('/wa-numbers', requireAuth, async (req, res) => {
        try {
            const userId = req.user.userId;

            const waNumbers = await WaNumber.getGroupedByFolder(userId);

            res.json({
                success: true,
                data: waNumbers
            });

        } catch (error) {
            logger.error('Get WA numbers error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get WA numbers'
            });
        }
    });

    /**
     * GET /api/dashboard/wa-numbers/:id/chats
     * Get chat logs for a specific WA number
     */
    router.get('/wa-numbers/:id/chats', requireAuth, async (req, res) => {
        try {
            const waNumberId = parseInt(req.params.id);
            const { limit = 100, offset = 0, direction, messageType } = req.query;

            // Verify user owns this WA number
            const waNumber = await WaNumber.findById(waNumberId);

            if (!waNumber) {
                return res.status(404).json({
                    success: false,
                    error: 'WA number not found'
                });
            }

            // Check ownership
            if (waNumber.user_id !== req.user.userId && req.user.userType !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            const chats = await ChatLog.getByWaNumber(waNumberId, {
                limit: parseInt(limit),
                offset: parseInt(offset),
                direction,
                messageType
            });

            res.json({
                success: true,
                data: chats
            });

        } catch (error) {
            logger.error('Get chats error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get chats'
            });
        }
    });

    /**
     * GET /api/dashboard/wa-numbers/:id/conversations
     * Get recent conversations for a WA number
     */
    router.get('/wa-numbers/:id/conversations', requireAuth, async (req, res) => {
        try {
            const waNumberId = parseInt(req.params.id);
            const { limit = 50 } = req.query;

            // Verify user owns this WA number
            const waNumber = await WaNumber.findById(waNumberId);

            if (!waNumber) {
                return res.status(404).json({
                    success: false,
                    error: 'WA number not found'
                });
            }

            // Check ownership
            if (waNumber.user_id !== req.user.userId && req.user.userType !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            const conversations = await ChatLog.getRecentConversations(waNumberId, parseInt(limit));

            res.json({
                success: true,
                data: conversations
            });

        } catch (error) {
            logger.error('Get conversations error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get conversations'
            });
        }
    });

    /**
     * GET /api/dashboard/wa-numbers/:id/conversation/:phone
     * Get conversation with specific phone number
     */
    router.get('/wa-numbers/:id/conversation/:phone', requireAuth, async (req, res) => {
        try {
            const waNumberId = parseInt(req.params.id);
            const otherPhone = req.params.phone;
            const { limit = 100, offset = 0 } = req.query;

            // Verify user owns this WA number
            const waNumber = await WaNumber.findById(waNumberId);

            if (!waNumber) {
                return res.status(404).json({
                    success: false,
                    error: 'WA number not found'
                });
            }

            // Check ownership
            if (waNumber.user_id !== req.user.userId && req.user.userType !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            const conversation = await ChatLog.getConversation(waNumberId, otherPhone, {
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            res.json({
                success: true,
                data: conversation
            });

        } catch (error) {
            logger.error('Get conversation error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get conversation'
            });
        }
    });

    /**
     * POST /api/dashboard/wa-numbers/:id/send-message
     * Send message from dashboard
     */
    router.post('/wa-numbers/:id/send-message', requireAuth, async (req, res) => {
        try {
            const waNumberId = parseInt(req.params.id);
            const { to, message, messageType = 'text' } = req.body;

            if (!to || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Recipient and message are required'
                });
            }

            // Verify user owns this WA number
            const waNumber = await WaNumber.findById(waNumberId);

            if (!waNumber) {
                return res.status(404).json({
                    success: false,
                    error: 'WA number not found'
                });
            }

            // Check ownership
            if (waNumber.user_id !== req.user.userId && req.user.userType !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            // Send message using message service
            const sessionId = waNumber.session_name;

            if (!services.messageService) {
                return res.status(503).json({
                    success: false,
                    error: 'Message service not available'
                });
            }

            const result = await services.messageService.sendText(
                sessionId,
                to,
                message
            );

            // Log the message
            await ChatLog.create({
                waNumberId,
                senderPhone: waNumber.phone_number,
                recipientPhone: to,
                messageContent: message,
                messageType: 'text',
                direction: 'outgoing'
            });

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Send message error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to send message'
            });
        }
    });

    /**
     * GET /api/dashboard/wa-numbers/:id/statistics
     * Get statistics for a WA number
     */
    router.get('/wa-numbers/:id/statistics', requireAuth, async (req, res) => {
        try {
            const waNumberId = parseInt(req.params.id);

            // Verify user owns this WA number
            const waNumber = await WaNumber.findById(waNumberId);

            if (!waNumber) {
                return res.status(404).json({
                    success: false,
                    error: 'WA number not found'
                });
            }

            // Check ownership
            if (waNumber.user_id !== req.user.userId && req.user.userType !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }

            const statistics = await ChatLog.getStatistics(waNumberId);

            res.json({
                success: true,
                data: statistics
            });

        } catch (error) {
            logger.error('Get statistics error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get statistics'
            });
        }
    });

    /**
     * GET /api/dashboard/user/statistics
     * Get user's overall statistics
     */
    router.get('/user/statistics', requireAuth, async (req, res) => {
        try {
            const userId = req.user.userId;

            const statistics = await User.getStatistics(userId);

            res.json({
                success: true,
                data: statistics
            });

        } catch (error) {
            logger.error('Get user statistics error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get statistics'
            });
        }
    });

    // ==================== ADMIN ENDPOINTS ====================

    /**
     * POST /api/dashboard/admin/users
     * Create new user (admin only)
     */
    router.post('/admin/users', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Email and password are required'
                });
            }

            const adminId = req.user.userId;

            const result = await authService.createUser(adminId, email, password);

            logger.info('User created by admin', 'DASHBOARD_API', {
                adminId,
                userEmail: email
            });

            res.json({
                success: true,
                data: result.user
            });

        } catch (error) {
            logger.error('Create user error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to create user'
            });
        }
    });

    /**
     * GET /api/dashboard/admin/users
     * Get all users for admin
     */
    router.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
        try {
            const adminId = req.user.userId;

            const users = await authService.getUsersForAdmin(adminId);

            res.json({
                success: true,
                data: users
            });

        } catch (error) {
            logger.error('Get users error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get users'
            });
        }
    });

    /**
     * POST /api/dashboard/admin/folders
     * Create new folder (admin only)
     */
    router.post('/admin/folders', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { folderName } = req.body;

            if (!folderName) {
                return res.status(400).json({
                    success: false,
                    error: 'Folder name is required'
                });
            }

            const adminId = req.user.userId;

            const folder = await WaFolder.create({
                adminId,
                folderName
            });

            logger.info('Folder created', 'DASHBOARD_API', {
                adminId,
                folderName
            });

            res.json({
                success: true,
                data: folder
            });

        } catch (error) {
            logger.error('Create folder error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to create folder'
            });
        }
    });

    /**
     * GET /api/dashboard/admin/folders
     * Get all folders for admin
     */
    router.get('/admin/folders', requireAuth, requireAdmin, async (req, res) => {
        try {
            const adminId = req.user.userId;

            const folders = await WaFolder.getAllWithCounts(adminId);

            res.json({
                success: true,
                data: folders
            });

        } catch (error) {
            logger.error('Get folders error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get folders'
            });
        }
    });

    /**
     * POST /api/dashboard/admin/wa-numbers
     * Register WA number (admin only)
     */
    router.post('/admin/wa-numbers', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { userId, folderId, phoneNumber, sessionName } = req.body;

            if (!userId || !phoneNumber || !sessionName) {
                return res.status(400).json({
                    success: false,
                    error: 'userId, phoneNumber, and sessionName are required'
                });
            }

            const waNumber = await WaNumber.create({
                userId,
                folderId: folderId || null,
                phoneNumber,
                sessionName
            });

            logger.info('WA number registered', 'DASHBOARD_API', {
                userId,
                phoneNumber,
                sessionName
            });

            res.json({
                success: true,
                data: waNumber
            });

        } catch (error) {
            logger.error('Register WA number error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to register WA number'
            });
        }
    });

    /**
     * GET /api/dashboard/admin/wa-numbers
     * Get all WA numbers (admin only)
     */
    router.get('/admin/wa-numbers', requireAuth, requireAdmin, async (req, res) => {
        try {
            const adminId = req.user.userId;

            const waNumbers = await WaNumber.getAllByAdmin(adminId);

            res.json({
                success: true,
                data: waNumbers
            });

        } catch (error) {
            logger.error('Get WA numbers error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get WA numbers'
            });
        }
    });

    /**
     * GET /api/dashboard/admin/statistics
     * Get admin statistics
     */
    router.get('/admin/statistics', requireAuth, requireAdmin, async (req, res) => {
        try {
            const adminId = req.user.userId;

            const statistics = await Admin.getStatistics(adminId);

            res.json({
                success: true,
                data: statistics
            });

        } catch (error) {
            logger.error('Get admin statistics error', 'DASHBOARD_API', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to get statistics'
            });
        }
    });

    // Mount router
    app.use('/api/dashboard', router);

    logger.info('Dashboard API initialized', 'DASHBOARD_API');
}

module.exports = { initializeDashboardApi };
