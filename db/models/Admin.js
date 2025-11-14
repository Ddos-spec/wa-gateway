/**
 * Admin Model
 *
 * Handles database operations for admin users
 */

const postgres = require('../postgres');
const bcrypt = require('bcryptjs');
const { getLogger } = require('../../src/utils/logger');

const logger = getLogger();

class AdminModel {
    /**
     * Create a new admin
     * @param {Object} data - Admin data
     * @param {string} data.email - Admin email
     * @param {string} data.password - Plain text password
     * @returns {Promise<Object>} Created admin (without password)
     */
    static async create({ email, password }) {
        try {
            // Hash password
            const passwordHash = await bcrypt.hash(password, 10);

            const query = `
                INSERT INTO admins (email, password_hash)
                VALUES ($1, $2)
                RETURNING id, email, created_at;
            `;

            const result = await postgres.query(query, [email, passwordHash]);

            logger.info('Admin created', 'DATABASE', { email });

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to create admin', 'DATABASE', {
                email,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Find admin by email
     * @param {string} email - Admin email
     * @returns {Promise<Object|null>} Admin or null
     */
    static async findByEmail(email) {
        try {
            const query = `
                SELECT id, email, password_hash, created_at
                FROM admins
                WHERE email = $1;
            `;

            const result = await postgres.query(query, [email]);

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to find admin by email', 'DATABASE', {
                email,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Find admin by ID
     * @param {number} id - Admin ID
     * @returns {Promise<Object|null>} Admin or null
     */
    static async findById(id) {
        try {
            const query = `
                SELECT id, email, created_at
                FROM admins
                WHERE id = $1;
            `;

            const result = await postgres.query(query, [id]);

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to find admin by ID', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Authenticate admin
     * @param {string} email - Admin email
     * @param {string} password - Plain text password
     * @returns {Promise<Object|null>} Admin data (without password) or null
     */
    static async authenticate(email, password) {
        try {
            const admin = await this.findByEmail(email);

            if (!admin) {
                return null;
            }

            // Verify password
            const isValid = await bcrypt.compare(password, admin.password_hash);

            if (!isValid) {
                return null;
            }

            // Return admin without password
            const { password_hash, ...adminWithoutPassword } = admin;

            logger.info('Admin authenticated', 'DATABASE', { email });

            return adminWithoutPassword;
        } catch (error) {
            logger.error('Failed to authenticate admin', 'DATABASE', {
                email,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update admin password
     * @param {number} id - Admin ID
     * @param {string} newPassword - New plain text password
     * @returns {Promise<boolean>}
     */
    static async updatePassword(id, newPassword) {
        try {
            const passwordHash = await bcrypt.hash(newPassword, 10);

            const query = `
                UPDATE admins
                SET password_hash = $1
                WHERE id = $2;
            `;

            await postgres.query(query, [passwordHash, id]);

            logger.info('Admin password updated', 'DATABASE', { id });

            return true;
        } catch (error) {
            logger.error('Failed to update admin password', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get all admins
     * @returns {Promise<Array>} Array of admins
     */
    static async getAll() {
        try {
            const query = `
                SELECT id, email, created_at
                FROM admins
                ORDER BY created_at DESC;
            `;

            const result = await postgres.query(query);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get all admins', 'DATABASE', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete admin
     * @param {number} id - Admin ID
     * @returns {Promise<boolean>}
     */
    static async delete(id) {
        try {
            const query = `
                DELETE FROM admins
                WHERE id = $1;
            `;

            await postgres.query(query, [id]);

            logger.info('Admin deleted', 'DATABASE', { id });

            return true;
        } catch (error) {
            logger.error('Failed to delete admin', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get admin's statistics
     * @param {number} adminId - Admin ID
     * @returns {Promise<Object>} Statistics
     */
    static async getStatistics(adminId) {
        try {
            const query = `
                SELECT
                    (SELECT COUNT(*) FROM users WHERE admin_id = $1) as total_users,
                    (SELECT COUNT(*) FROM wa_folders WHERE admin_id = $1) as total_folders,
                    (SELECT COUNT(*) FROM wa_numbers WHERE user_id IN (SELECT id FROM users WHERE admin_id = $1)) as total_wa_numbers
            `;

            const result = await postgres.query(query, [adminId]);

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to get admin statistics', 'DATABASE', {
                adminId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = AdminModel;
