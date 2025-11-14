/**
 * WaFolder Model
 *
 * Handles database operations for WhatsApp folders
 */

const postgres = require('../postgres');
const { getLogger } = require('../../src/utils/logger');

const logger = getLogger();

class WaFolderModel {
    /**
     * Create a new folder
     * @param {Object} data - Folder data
     * @param {number} data.adminId - Admin ID who created this folder
     * @param {string} data.folderName - Folder name
     * @returns {Promise<Object>} Created folder
     */
    static async create({ adminId, folderName }) {
        try {
            const query = `
                INSERT INTO wa_folders (admin_id, folder_name)
                VALUES ($1, $2)
                RETURNING id, admin_id, folder_name, created_at;
            `;

            const result = await postgres.query(query, [adminId, folderName]);

            logger.info('WA Folder created', 'DATABASE', { folderName, adminId });

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to create WA folder', 'DATABASE', {
                folderName,
                adminId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Find folder by ID
     * @param {number} id - Folder ID
     * @returns {Promise<Object|null>} Folder or null
     */
    static async findById(id) {
        try {
            const query = `
                SELECT id, admin_id, folder_name, created_at
                FROM wa_folders
                WHERE id = $1;
            `;

            const result = await postgres.query(query, [id]);

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Failed to find folder by ID', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get all folders for an admin
     * @param {number} adminId - Admin ID
     * @returns {Promise<Array>} Array of folders
     */
    static async getAllByAdmin(adminId) {
        try {
            const query = `
                SELECT id, admin_id, folder_name, created_at
                FROM wa_folders
                WHERE admin_id = $1
                ORDER BY folder_name ASC;
            `;

            const result = await postgres.query(query, [adminId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get folders by admin', 'DATABASE', {
                adminId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Update folder name
     * @param {number} id - Folder ID
     * @param {string} newName - New folder name
     * @returns {Promise<Object>} Updated folder
     */
    static async updateName(id, newName) {
        try {
            const query = `
                UPDATE wa_folders
                SET folder_name = $1
                WHERE id = $2
                RETURNING id, admin_id, folder_name, created_at;
            `;

            const result = await postgres.query(query, [newName, id]);

            logger.info('WA Folder name updated', 'DATABASE', { id, newName });

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to update folder name', 'DATABASE', {
                id,
                newName,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete folder
     * @param {number} id - Folder ID
     * @returns {Promise<boolean>}
     */
    static async delete(id) {
        try {
            const query = `
                DELETE FROM wa_folders
                WHERE id = $1;
            `;

            await postgres.query(query, [id]);

            logger.info('WA Folder deleted', 'DATABASE', { id });

            return true;
        } catch (error) {
            logger.error('Failed to delete folder', 'DATABASE', {
                id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get folder with WA numbers
     * @param {number} folderId - Folder ID
     * @returns {Promise<Object>} Folder with WA numbers
     */
    static async getWithNumbers(folderId) {
        try {
            const folderQuery = `
                SELECT id, admin_id, folder_name, created_at
                FROM wa_folders
                WHERE id = $1;
            `;

            const numbersQuery = `
                SELECT id, user_id, phone_number, session_name, created_at, updated_at
                FROM wa_numbers
                WHERE folder_id = $1
                ORDER BY created_at DESC;
            `;

            const [folderResult, numbersResult] = await Promise.all([
                postgres.query(folderQuery, [folderId]),
                postgres.query(numbersQuery, [folderId])
            ]);

            if (folderResult.rows.length === 0) {
                return null;
            }

            return {
                ...folderResult.rows[0],
                wa_numbers: numbersResult.rows
            };
        } catch (error) {
            logger.error('Failed to get folder with numbers', 'DATABASE', {
                folderId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get folder statistics
     * @param {number} folderId - Folder ID
     * @returns {Promise<Object>} Statistics
     */
    static async getStatistics(folderId) {
        try {
            const query = `
                SELECT
                    COUNT(DISTINCT w.id) as total_wa_numbers,
                    COUNT(DISTINCT w.user_id) as total_users,
                    COUNT(c.id) as total_messages
                FROM wa_numbers w
                LEFT JOIN chat_logs c ON w.id = c.wa_number_id
                WHERE w.folder_id = $1;
            `;

            const result = await postgres.query(query, [folderId]);

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to get folder statistics', 'DATABASE', {
                folderId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get all folders with counts
     * @param {number} adminId - Admin ID
     * @returns {Promise<Array>} Array of folders with counts
     */
    static async getAllWithCounts(adminId) {
        try {
            const query = `
                SELECT
                    f.id,
                    f.admin_id,
                    f.folder_name,
                    f.created_at,
                    COUNT(DISTINCT w.id) as wa_number_count
                FROM wa_folders f
                LEFT JOIN wa_numbers w ON f.id = w.folder_id
                WHERE f.admin_id = $1
                GROUP BY f.id, f.admin_id, f.folder_name, f.created_at
                ORDER BY f.folder_name ASC;
            `;

            const result = await postgres.query(query, [adminId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get folders with counts', 'DATABASE', {
                adminId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = WaFolderModel;
