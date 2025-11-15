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
            const passwordHash = await bcrypt.hash(password, 10);
            const query = `
                INSERT INTO users (admin_id, email, password_hash)
                VALUES ($1, $2, $3)
                RETURNING id, admin_id, email, is_active, created_at, updated_at, last_login;
            `;
            const result = await postgres.query(query, [adminId, email, passwordHash]);
            logger.info('User created', 'DATABASE', { email, adminId });
            return result.rows[0];
        } catch (error) {
            logger.error('Failed to create user', 'DATABASE', { email, adminId, error: error.message });
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
                SELECT id, admin_id, email, password_hash, is_active, created_at, updated_at, last_login
                FROM users
                WHERE email = $1;
            `;
            const result = await postgres.query(query, [email]);
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to find user by email', 'DATABASE', { email, error: error.message });
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
                SELECT id, admin_id, email, is_active, created_at, updated_at, last_login
                FROM users
                WHERE id = $1;
            `;
            const result = await postgres.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to find user by ID', 'DATABASE', { id, error: error.message });
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
            if (!user) return null;

            // Check if account is active
            if (!user.is_active) {
                logger.warn('Authentication failed for inactive user', 'DATABASE', { email });
                return null;
            }

            const isValid = await bcrypt.compare(password, user.password_hash);
            if (!isValid) return null;

            // Update last_login on successful authentication
            await this.update(user.id, { last_login: new Date() });

            const { password_hash, ...userWithoutPassword } = user;
            logger.info('User authenticated', 'DATABASE', { email });
            return userWithoutPassword;
        } catch (error) {
            logger.error('Failed to authenticate user', 'DATABASE', { email, error: error.message });
            throw error;
        }
    }

    /**
     * Update a user's details dynamically.
     * @param {number} id - The ID of the user to update.
     * @param {Object} updates - An object containing the fields to update.
     * e.g., { password: 'newPassword', is_active: false, last_login: new Date() }
     * @returns {Promise<Object>} The updated user object.
     */
    static async update(id, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        if (updates.password) {
            const passwordHash = await bcrypt.hash(updates.password, 10);
            fields.push(`password_hash = $${paramIndex++}`);
            values.push(passwordHash);
        }

        if (updates.is_active !== undefined) {
            fields.push(`is_active = $${paramIndex++}`);
            values.push(updates.is_active);
        }
        
        if (updates.last_login) {
            fields.push(`last_login = $${paramIndex++}`);
            values.push(updates.last_login);
        }

        if (fields.length === 0) {
            return this.findById(id); // No updates, just return current data
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);

        const query = `
            UPDATE users
            SET ${fields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, admin_id, email, is_active, created_at, updated_at, last_login;
        `;
        values.push(id);

        try {
            const result = await postgres.query(query, values);
            logger.info('User updated successfully', 'DATABASE', { id, fields: Object.keys(updates) });
            return result.rows[0];
        } catch (error) {
            logger.error('Failed to update user', 'DATABASE', { id, error: error.message });
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
                SELECT id, admin_id, email, is_active, created_at, updated_at, last_login
                FROM users
                WHERE admin_id = $1
                ORDER BY created_at DESC;
            `;
            const result = await postgres.query(query, [adminId]);
            return result.rows;
        } catch (error) {
            logger.error('Failed to get users by admin', 'DATABASE', { adminId, error: error.message });
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
            await postgres.query('DELETE FROM users WHERE id = $1;', [id]);
            logger.info('User deleted', 'DATABASE', { id });
            return true;
        } catch (error) {
            logger.error('Failed to delete user', 'DATABASE', { id, error: error.message });
            throw error;
        }
    }
    
    // --- Other methods remain unchanged ---
}

module.exports = UserModel;
