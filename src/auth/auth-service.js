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
        // This is a singleton, so state can be stored here if needed,
        // but for now, we rely on the database models.
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
                return { success: true, userType: 'admin', user: admin };
            }

            // Try user authentication
            const user = await User.authenticate(email, password);
            if (user) {
                logger.info('User authenticated successfully', 'AUTH', { email });
                return { success: true, userType: 'user', user: user };
            }

            logger.warn('Authentication failed', 'AUTH', { email });
            return { success: false, error: 'Invalid email or password' };

        } catch (error) {
            logger.error('Authentication error', 'AUTH', { email, error: error.message });
            throw error;
        }
    }

    /**
     * Create a new user account.
     * @param {number} adminId - The ID of the admin creating the user.
     * @param {string} email - The new user's email.
     * @param {string} password - The new user's password.
     * @param {string} role - The role of the new user ('user' or 'admin').
     * @returns {Promise<Object>} The created user or admin object.
     */
    async createUser({ adminId, email, password, role }) {
        try {
            if (role === 'admin') {
                const admin = await Admin.create({ email, password });
                logger.info('Admin account created', 'AUTH', { email });
                return { user: admin, role: 'admin' };
            }
            const user = await User.create({ adminId, email, password });
            logger.info('User account created', 'AUTH', { email, adminId });
            return { user, role: 'user' };
        } catch (error) {
            logger.error('Failed to create user/admin account', 'AUTH', { email, adminId, role, error: error.message });
            throw error;
        }
    }
    
    /**
     * Find a user by their email.
     * @param {string} email - The email of the user to find.
     * @returns {Promise<Object|null>} The user object or null if not found.
     */
    async findUserByEmail(email) {
        // This could be expanded to check both admins and users if needed
        return User.findByEmail(email);
    }

    /**
     * Update a user's details.
     * @param {number} userId - The ID of the user to update.
     * @param {Object} updates - The fields to update.
     * @returns {Promise<Object>} The updated user object.
     */
    async updateUser(userId, updates) {
        try {
            const updatedUser = await User.update(userId, updates);
            logger.info('User updated successfully', 'AUTH', { userId, updates: Object.keys(updates) });
            return updatedUser;
        } catch (error) {
            logger.error('Failed to update user', 'AUTH', { userId, error: error.message });
            throw error;
        }
    }

    /**
     * Get all users for an admin.
     * @param {number} adminId - The ID of the admin.
     * @returns {Promise<Array>} A list of users.
     */
    async getUsersForAdmin(adminId) {
        try {
            const users = await User.getAllByAdmin(adminId);
            // We can enrich this data if needed, e.g., adding session counts
            return users;
        } catch (error) {
            logger.error('Failed to get users for admin', 'AUTH', { adminId, error: error.message });
            throw error;
        }
    }

    /**
     * Delete a user account.
     * @param {number} userId - The ID of the user to delete.
     * @returns {Promise<boolean>} True if deletion was successful.
     */
    async deleteUser(userId) {
        try {
            const success = await User.delete(userId);
            if (success) {
                logger.info('User account deleted', 'AUTH', { userId });
            }
            return success;
        } catch (error) {
            logger.error('Failed to delete user', 'AUTH', { userId, error: error.message });
            throw error;
        }
    }
    
    // Other methods like password changes, token management etc. can remain here
}

// Create singleton instance
const authService = new AuthService();

module.exports = authService;
