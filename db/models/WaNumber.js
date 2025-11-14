/**
 * WaNumber Model
 *
 * Handles database operations for WhatsApp numbers
 */

const postgres = require('../postgres');
const { getLogger } = require('../../src/utils/logger');

const logger = getLogger();

class WaNumberModel {
    /**
     * Create a new WA number
     * @param {Object} data - WA number data
     * @param {number} data.userId - User ID who owns this number
     * @param {number} data.folderId - Folder ID (optional)
     * @param {string} data.phoneNumber - Phone number
     * @param {string} data.sessionName - Session name
     * @returns {Promise<Object>} Created WA number
     */
    static async create({ userId, folderId, phoneNumber, sessionName }) {
        try {
            const query = `
                INSERT INTO wa_numbers (user_id, folder_id, phone_number, session_name)
                VALUES ($1, $2, $3, $4)
                RETURNING id, user_id, folder_id, phone_number, session_name, created_at, updated_at;
            `;

            const result = await postgres.query(query, [
                userId,
                folderId || null,
                phoneNumber,
                sessionName
            ]);

            logger.info('WA Number created', 'DATABASE', { phoneNumber, sessionName, userId });

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to create WA number', 'DATABASE', {
                phoneNumber,
                sessionName,
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Find WA number by ID
     * @param {number} id - WA number ID
     * @returns {Promise<Object|null>} WA number or null
     */
    static async findById(id) {
        try {
            const query = `
                SELECT id, user_id, folder_id, phone_number, session_name, created_at, updated_at
                FROM wa_numbers
                WHERE id = $1;
            `;

            const result = await postgres.query(query, [id]);

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to find WA number by ID', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Find WA number by phone number
     * @param {string} phoneNumber - Phone number
     * @returns {Promise<Object|null>} WA number or null
     */
    static async findByPhoneNumber(phoneNumber) {
        try {
            const query = `
                SELECT id, user_id, folder_id, phone_number, session_name, created_at, updated_at
                FROM wa_numbers
                WHERE phone_number = $1;
            `;

            const result = await postgres.query(query, [phoneNumber]);

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to find WA number by phone', 'DATABASE', {
                phoneNumber,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Find WA number by session name
     * @param {string} sessionName - Session name
     * @returns {Promise<Object|null>} WA number or null
     */
    static async findBySessionName(sessionName) {
        try {
            const query = `
                SELECT id, user_id, folder_id, phone_number, session_name, created_at, updated_at
                FROM wa_numbers
                WHERE session_name = $1;
            `;

            const result = await postgres.query(query, [sessionName]);

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to find WA number by session name', 'DATABASE', {
                sessionName,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get all WA numbers for a user
     * @param {number} userId - User ID
     * @returns {Promise<Array>} Array of WA numbers
     */
    static async getAllByUser(userId) {
        try {
            const query = `
                SELECT
                    w.id,
                    w.user_id,
                    w.folder_id,
                    w.phone_number,
                    w.session_name,
                    w.created_at,
                    w.updated_at,
                    f.folder_name
                FROM wa_numbers w
                LEFT JOIN wa_folders f ON w.folder_id = f.id
                WHERE w.user_id = $1
                ORDER BY f.folder_name NULLS FIRST, w.created_at DESC;
            `;

            const result = await postgres.query(query, [userId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get WA numbers by user', 'DATABASE', {
                userId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get all WA numbers in a folder
     * @param {number} folderId - Folder ID
     * @returns {Promise<Array>} Array of WA numbers
     */
    static async getAllByFolder(folderId) {
        try {
            const query = `
                SELECT id, user_id, folder_id, phone_number, session_name, created_at, updated_at
                FROM wa_numbers
                WHERE folder_id = $1
                ORDER BY created_at DESC;
            `;

            const result = await postgres.query(query, [folderId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get WA numbers by folder', 'DATABASE', {
                folderId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update WA number folder
     * @param {number} id - WA number ID
     * @param {number|null} folderId - New folder ID
     * @returns {Promise<Object>} Updated WA number
     */
    static async updateFolder(id, folderId) {
        try {
            const query = `
                UPDATE wa_numbers
                SET folder_id = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING id, user_id, folder_id, phone_number, session_name, created_at, updated_at;
            `;

            const result = await postgres.query(query, [folderId, id]);

            logger.info('WA Number folder updated', 'DATABASE', { id, folderId });

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to update WA number folder', 'DATABASE', {
                id,
                folderId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete WA number
     * @param {number} id - WA number ID
     * @returns {Promise<boolean>}
     */
    static async delete(id) {
        try {
            const query = `
                DELETE FROM wa_numbers
                WHERE id = $1;
            `;

            await postgres.query(query, [id]);

            logger.info('WA Number deleted', 'DATABASE', { id });

            return true;
        } catch (error) {
            logger.error('Failed to delete WA number', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get WA number with chat statistics
     * @param {number} id - WA number ID
     * @returns {Promise<Object|null>} WA number with statistics
     */
    static async getWithStatistics(id) {
        try {
            const query = `
                SELECT
                    w.id,
                    w.user_id,
                    w.folder_id,
                    w.phone_number,
                    w.session_name,
                    w.created_at,
                    w.updated_at,
                    f.folder_name,
                    COUNT(c.id) as total_messages,
                    SUM(CASE WHEN c.direction = 'incoming' THEN 1 ELSE 0 END) as incoming_count,
                    SUM(CASE WHEN c.direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing_count,
                    MAX(c.created_at) as last_message_at
                FROM wa_numbers w
                LEFT JOIN wa_folders f ON w.folder_id = f.id
                LEFT JOIN chat_logs c ON w.id = c.wa_number_id
                WHERE w.id = $1
                GROUP BY w.id, w.user_id, w.folder_id, w.phone_number, w.session_name, w.created_at, w.updated_at, f.folder_name;
            `;

            const result = await postgres.query(query, [id]);

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to get WA number with statistics', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get all WA numbers for admin (all users under admin)
     * @param {number} adminId - Admin ID
     * @returns {Promise<Array>} Array of WA numbers
     */
    static async getAllByAdmin(adminId) {
        try {
            const query = `
                SELECT
                    w.id,
                    w.user_id,
                    w.folder_id,
                    w.phone_number,
                    w.session_name,
                    w.created_at,
                    w.updated_at,
                    u.email as user_email,
                    f.folder_name
                FROM wa_numbers w
                INNER JOIN users u ON w.user_id = u.id
                LEFT JOIN wa_folders f ON w.folder_id = f.id
                WHERE u.admin_id = $1
                ORDER BY f.folder_name NULLS FIRST, w.created_at DESC;
            `;

            const result = await postgres.query(query, [adminId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get WA numbers by admin', 'DATABASE', {
                adminId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get WA numbers grouped by folder for a user
     * @param {number} userId - User ID
     * @returns {Promise<Object>} WA numbers grouped by folder
     */
    static async getGroupedByFolder(userId) {
        try {
            const query = `
                SELECT
                    w.id,
                    w.user_id,
                    w.folder_id,
                    w.phone_number,
                    w.session_name,
                    w.created_at,
                    w.updated_at,
                    COALESCE(f.folder_name, 'Uncategorized') as folder_name
                FROM wa_numbers w
                LEFT JOIN wa_folders f ON w.folder_id = f.id
                WHERE w.user_id = $1
                ORDER BY f.folder_name NULLS LAST, w.created_at DESC;
            `;

            const result = await postgres.query(query, [userId]);

            // Group by folder
            const grouped = {};
            result.rows.forEach(row => {
                const folderName = row.folder_name;
                if (!grouped[folderName]) {
                    grouped[folderName] = [];
                }
                grouped[folderName].push(row);
            });

            return grouped;
        } catch (error) {
            logger.error('Failed to get WA numbers grouped by folder', 'DATABASE', {
                userId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = WaNumberModel;
