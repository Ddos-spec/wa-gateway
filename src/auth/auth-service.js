/**
 * Authentication Service
 *
 * Handles user and admin authentication using PostgreSQL
 */

const { Admin, User } = require('../../db');
const { getLogger } = require('../utils/logger');
const crypto = require('crypto');

const logger = getLogger();

class AuthService {
    constructor() {
        this.sessionTokens = new Map(); // In-memory session tokens
        const timeoutDays = parseInt(process.env.SESSION_TIMEOUT_DAYS) || 30;
        this.tokenTTL = timeoutDays * 24 * 60 * 60 * 1000; // 30 days default in milliseconds
    }

    /**
     * Authenticate user or admin
     * @param {string} email - Email
     * @param {string} password - Password
     * @returns {Promise<Object>} Authentication result
     */
    async authenticate(email, password) {
        try {
            // Try admin authentication first
            const admin = await Admin.authenticate(email, password);
            if (admin) {
                logger.info('Admin authenticated successfully', 'AUTH', { email });
                return {
                    success: true,
                    userType: 'admin',
                    user: admin
                };
            }

            // Try user authentication
            const user = await User.authenticate(email, password);
            if (user) {
                logger.info('User authenticated successfully', 'AUTH', { email });
                return {
                    success: true,
                    userType: 'user',
                    user: user
                };
            }

            // No authentication succeeded
            logger.warn('Authentication failed', 'AUTH', { email });
            return {
                success: false,
                error: 'Invalid email or password'
            };

        } catch (error) {
            logger.error('Authentication error', 'AUTH', {
                email,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Create admin account
     * @param {string} email - Admin email
     * @param {string} password - Admin password
     * @returns {Promise<Object>} Created admin
     */
    async createAdmin(email, password) {
        try {
            const admin = await Admin.create({ email, password });

            logger.info('Admin account created', 'AUTH', { email });

            return {
                success: true,
                admin
            };

        } catch (error) {
            logger.error('Failed to create admin account', 'AUTH', {
                email,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Create user account
     * @param {number} adminId - Admin ID who creates the user
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} Created user
     */
    async createUser(adminId, email, password) {
        try {
            const user = await User.create({ adminId, email, password });

            logger.info('User account created', 'AUTH', { email, adminId });

            return {
                success: true,
                user
            };

        } catch (error) {
            logger.error('Failed to create user account', 'AUTH', {
                email,
                adminId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Generate session token
     * @param {Object} user - User or admin object
     * @param {string} userType - 'admin' or 'user'
     * @returns {string} Session token
     */
    generateSessionToken(user, userType) {
        const token = crypto.randomBytes(32).toString('hex');

        const sessionData = {
            userId: user.id,
            email: user.email,
            userType: userType,
            adminId: user.admin_id || user.id, // For users, use admin_id; for admins, use their own id
            createdAt: Date.now(),
            expiresAt: Date.now() + this.tokenTTL
        };

        this.sessionTokens.set(token, sessionData);

        logger.debug('Session token generated', 'AUTH', {
            email: user.email,
            userType
        });

        return token;
    }

    /**
     * Validate session token
     * @param {string} token - Session token
     * @returns {Object|null} Session data or null if invalid
     */
    validateSessionToken(token) {
        const sessionData = this.sessionTokens.get(token);

        if (!sessionData) {
            return null;
        }

        // Check if token has expired
        if (Date.now() > sessionData.expiresAt) {
            this.sessionTokens.delete(token);
            logger.debug('Session token expired', 'AUTH');
            return null;
        }

        return sessionData;
    }

    /**
     * Revoke session token
     * @param {string} token - Session token
     * @returns {boolean}
     */
    revokeSessionToken(token) {
        const deleted = this.sessionTokens.delete(token);

        if (deleted) {
            logger.debug('Session token revoked', 'AUTH');
        }

        return deleted;
    }

    /**
     * Get user by ID
     * @param {number} userId - User ID
     * @param {string} userType - 'admin' or 'user'
     * @returns {Promise<Object|null>} User or admin object
     */
    async getUserById(userId, userType) {
        try {
            if (userType === 'admin') {
                return await Admin.findById(userId);
            } else {
                return await User.findById(userId);
            }
        } catch (error) {
            logger.error('Failed to get user by ID', 'AUTH', {
                userId,
                userType,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Change password
     * @param {number} userId - User ID
     * @param {string} userType - 'admin' or 'user'
     * @param {string} currentPassword - Current password
     * @param {string} newPassword - New password
     * @returns {Promise<Object>} Result
     */
    async changePassword(userId, userType, currentPassword, newPassword) {
        try {
            // Get user
            const user = await this.getUserById(userId, userType);

            if (!user) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            // Verify current password
            const authResult = await this.authenticate(user.email, currentPassword);

            if (!authResult.success) {
                return {
                    success: false,
                    error: 'Current password is incorrect'
                };
            }

            // Update password
            if (userType === 'admin') {
                await Admin.updatePassword(userId, newPassword);
            } else {
                await User.updatePassword(userId, newPassword);
            }

            logger.info('Password changed successfully', 'AUTH', {
                userId,
                userType
            });

            return {
                success: true,
                message: 'Password changed successfully'
            };

        } catch (error) {
            logger.error('Failed to change password', 'AUTH', {
                userId,
                userType,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get all users for an admin
     * @param {number} adminId - Admin ID
     * @returns {Promise<Array>} Array of users
     */
    async getUsersForAdmin(adminId) {
        try {
            return await User.getAllByAdmin(adminId);
        } catch (error) {
            logger.error('Failed to get users for admin', 'AUTH', {
                adminId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete user account
     * @param {number} userId - User ID
     * @param {string} userType - 'admin' or 'user'
     * @returns {Promise<Object>} Result
     */
    async deleteUser(userId, userType) {
        try {
            if (userType === 'admin') {
                await Admin.delete(userId);
            } else {
                await User.delete(userId);
            }

            logger.info('User account deleted', 'AUTH', { userId, userType });

            return {
                success: true,
                message: 'User deleted successfully'
            };

        } catch (error) {
            logger.error('Failed to delete user', 'AUTH', {
                userId,
                userType,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Clean up expired session tokens
     */
    cleanupExpiredTokens() {
        const now = Date.now();
        let cleaned = 0;

        for (const [token, sessionData] of this.sessionTokens.entries()) {
            if (now > sessionData.expiresAt) {
                this.sessionTokens.delete(token);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug('Cleaned up expired session tokens', 'AUTH', { count: cleaned });
        }

        return cleaned;
    }

    /**
     * Get session statistics
     * @returns {Object} Session statistics
     */
    getStats() {
        return {
            activeSessions: this.sessionTokens.size
        };
    }
}

// Create singleton instance
const authService = new AuthService();

// Clean up expired tokens every hour
setInterval(() => {
    authService.cleanupExpiredTokens();
}, 60 * 60 * 1000);

module.exports = authService;
