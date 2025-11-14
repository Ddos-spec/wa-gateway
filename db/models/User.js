/**
 * User Model
 *
 * Handles database operations for regular users
 */

const postgres = require('../postgres');
const bcrypt = require('bcryptjs');
const { getLogger } = require('../../src/utils/logger');

const logger = getLogger();

class UserModel {
    /**
     * Create a new user
     * @param {Object} data - User data
     * @param {number} data.adminId - Admin ID who created this user
     * @param {string} data.email - User email
     * @param {string} data.password - Plain text password
     * @returns {Promise<Object>} Created user (without password)
     */
    static async create({ adminId, email, password }) {
        try {
            // Hash password
            const passwordHash = await bcrypt.hash(password, 10);

            const query = `
                INSERT INTO users (admin_id, email, password_hash)
                VALUES ($1, $2, $3)
                RETURNING id, admin_id, email, created_at, updated_at;
            `;

            const result = await postgres.query(query, [adminId, email, passwordHash]);

            logger.info('User created', 'DATABASE', { email, adminId });

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to create user', 'DATABASE', {
                email,
                adminId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Find user by email
     * @param {string} email - User email
     * @returns {Promise<Object|null>} User or null
     */
    static async findByEmail(email) {
        try {
            const query = `
                SELECT id, admin_id, email, password_hash, created_at, updated_at
                FROM users
                WHERE email = $1;
            `;

            const result = await postgres.query(query, [email]);

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to find user by email', 'DATABASE', {
                email,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Find user by ID
     * @param {number} id - User ID
     * @returns {Promise<Object|null>} User or null
     */
    static async findById(id) {
        try {
            const query = `
                SELECT id, admin_id, email, created_at, updated_at
                FROM users
                WHERE id = $1;
            `;

            const result = await postgres.query(query, [id]);

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to find user by ID', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Authenticate user
     * @param {string} email - User email
     * @param {string} password - Plain text password
     * @returns {Promise<Object|null>} User data (without password) or null
     */
    static async authenticate(email, password) {
        try {
            const user = await this.findByEmail(email);

            if (!user) {
                return null;
            }

            // Verify password
            const isValid = await bcrypt.compare(password, user.password_hash);

            if (!isValid) {
                return null;
            }

            // Return user without password
            const { password_hash, ...userWithoutPassword } = user;

            logger.info('User authenticated', 'DATABASE', { email });

            return userWithoutPassword;
        } catch (error) {
            logger.error('Failed to authenticate user', 'DATABASE', {
                email,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update user password
     * @param {number} id - User ID
     * @param {string} newPassword - New plain text password
     * @returns {Promise<boolean>}
     */
    static async updatePassword(id, newPassword) {
        try {
            const passwordHash = await bcrypt.hash(newPassword, 10);

            const query = `
                UPDATE users
                SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2;
            `;

            await postgres.query(query, [passwordHash, id]);

            logger.info('User password updated', 'DATABASE', { id });

            return true;
        } catch (error) {
            logger.error('Failed to update user password', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update user email
     * @param {number} id - User ID
     * @param {string} newEmail - New email
     * @returns {Promise<boolean>}
     */
    static async updateEmail(id, newEmail) {
        try {
            const query = `
                UPDATE users
                SET email = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2;
            `;

            await postgres.query(query, [newEmail, id]);

            logger.info('User email updated', 'DATABASE', { id, newEmail });

            return true;
        } catch (error) {
            logger.error('Failed to update user email', 'DATABASE', {
                id,
                newEmail,
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
    static async getAllByAdmin(adminId) {
        try {
            const query = `
                SELECT id, admin_id, email, created_at, updated_at
                FROM users
                WHERE admin_id = $1
                ORDER BY created_at DESC;
            `;

            const result = await postgres.query(query, [adminId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get users by admin', 'DATABASE', {
                adminId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get all users
     * @returns {Promise<Array>} Array of users
     */
    static async getAll() {
        try {
            const query = `
                SELECT id, admin_id, email, created_at, updated_at
                FROM users
                ORDER BY created_at DESC;
            `;

            const result = await postgres.query(query);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get all users', 'DATABASE', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete user
     * @param {number} id - User ID
     * @returns {Promise<boolean>}
     */
    static async delete(id) {
        try {
            const query = `
                DELETE FROM users
                WHERE id = $1;
            `;

            await postgres.query(query, [id]);

            logger.info('User deleted', 'DATABASE', { id });

            return true;
        } catch (error) {
            logger.error('Failed to delete user', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get user's WA numbers with folder information
     * @param {number} userId - User ID
     * @returns {Promise<Array>} Array of WA numbers with folder info
     */
    static async getWaNumbersWithFolders(userId) {
        try {
            const query = `
                SELECT
                    w.id,
                    w.phone_number,
                    w.session_name,
                    w.created_at,
                    w.updated_at,
                    f.id as folder_id,
                    f.folder_name
                FROM wa_numbers w
                LEFT JOIN wa_folders f ON w.folder_id = f.id
                WHERE w.user_id = $1
                ORDER BY f.folder_name, w.created_at DESC;
            `;

            const result = await postgres.query(query, [userId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get user WA numbers', 'DATABASE', {
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get user statistics
     * @param {number} userId - User ID
     * @returns {Promise<Object>} Statistics
     */
    static async getStatistics(userId) {
        try {
            const query = `
                SELECT
                    (SELECT COUNT(*) FROM wa_numbers WHERE user_id = $1) as total_wa_numbers,
                    (SELECT COUNT(*) FROM chat_logs WHERE wa_number_id IN (SELECT id FROM wa_numbers WHERE user_id = $1)) as total_messages,
                    (SELECT COUNT(*) FROM chat_logs WHERE wa_number_id IN (SELECT id FROM wa_numbers WHERE user_id = $1) AND direction = 'incoming') as total_incoming,
                    (SELECT COUNT(*) FROM chat_logs WHERE wa_number_id IN (SELECT id FROM wa_numbers WHERE user_id = $1) AND direction = 'outgoing') as total_outgoing
            `;

            const result = await postgres.query(query, [userId]);

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to get user statistics', 'DATABASE', {
                userId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = UserModel;
