/**
 * ChatLog Model
 *
 * Handles database operations for chat logs
 */

const postgres = require('../postgres');
const { getLogger } = require('../../src/utils/logger');

const logger = getLogger();

class ChatLogModel {
    /**
     * Create a new chat log entry
     * @param {Object} data - Chat log data
     * @param {number} data.waNumberId - WA number ID
     * @param {string} data.senderPhone - Sender phone number
     * @param {string} data.recipientPhone - Recipient phone number
     * @param {string} data.messageContent - Message content
     * @param {string} data.messageType - Message type (text, image, video, etc.)
     * @param {string} data.direction - Message direction (incoming, outgoing)
     * @returns {Promise<Object>} Created chat log
     */
    static async create({
        waNumberId,
        senderPhone,
        recipientPhone,
        messageContent,
        messageType = 'text',
        direction
    }) {
        try {
            const query = `
                INSERT INTO chat_logs (
                    wa_number_id,
                    sender_phone,
                    recipient_phone,
                    message_content,
                    message_type,
                    direction
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, wa_number_id, sender_phone, recipient_phone, message_content, message_type, direction, created_at;
            `;

            const result = await postgres.query(query, [
                waNumberId,
                senderPhone,
                recipientPhone,
                messageContent,
                messageType,
                direction
            ]);

            logger.debug('Chat log created', 'DATABASE', {
                waNumberId,
                direction,
                messageType
            });

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to create chat log', 'DATABASE', {
                waNumberId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get chat logs for a WA number
     * @param {number} waNumberId - WA number ID
     * @param {Object} options - Query options
     * @param {number} options.limit - Limit number of results
     * @param {number} options.offset - Offset for pagination
     * @param {string} options.direction - Filter by direction (incoming, outgoing)
     * @param {string} options.messageType - Filter by message type
     * @returns {Promise<Array>} Array of chat logs
     */
    static async getByWaNumber(waNumberId, options = {}) {
        try {
            const {
                limit = 100,
                offset = 0,
                direction = null,
                messageType = null
            } = options;

            let query = `
                SELECT id, wa_number_id, sender_phone, recipient_phone,
                       message_content, message_type, direction, created_at
                FROM chat_logs
                WHERE wa_number_id = $1
            `;

            const params = [waNumberId];
            let paramCount = 1;

            if (direction) {
                paramCount++;
                query += ` AND direction = $${paramCount}`;
                params.push(direction);
            }

            if (messageType) {
                paramCount++;
                query += ` AND message_type = $${paramCount}`;
                params.push(messageType);
            }

            query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
            params.push(limit, offset);

            const result = await postgres.query(query, params);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get chat logs by WA number', 'DATABASE', {
                waNumberId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get chat logs between two numbers
     * @param {number} waNumberId - WA number ID
     * @param {string} otherPhone - Other party's phone number
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of chat logs
     */
    static async getConversation(waNumberId, otherPhone, options = {}) {
        try {
            const { limit = 100, offset = 0 } = options;

            const query = `
                SELECT id, wa_number_id, sender_phone, recipient_phone,
                       message_content, message_type, direction, created_at
                FROM chat_logs
                WHERE wa_number_id = $1
                  AND (
                    (sender_phone = $2 OR recipient_phone = $2)
                  )
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4;
            `;

            const result = await postgres.query(query, [
                waNumberId,
                otherPhone,
                limit,
                offset
            ]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get conversation', 'DATABASE', {
                waNumberId,
                otherPhone,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get recent conversations for a WA number
     * @param {number} waNumberId - WA number ID
     * @param {number} limit - Number of conversations to return
     * @returns {Promise<Array>} Array of recent conversations with last message
     */
    static async getRecentConversations(waNumberId, limit = 50) {
        try {
            const query = `
                WITH ranked_messages AS (
                    SELECT
                        *,
                        CASE
                            WHEN direction = 'incoming' THEN sender_phone
                            WHEN direction = 'outgoing' THEN recipient_phone
                        END as contact_phone,
                        ROW_NUMBER() OVER (
                            PARTITION BY
                                CASE
                                    WHEN direction = 'incoming' THEN sender_phone
                                    WHEN direction = 'outgoing' THEN recipient_phone
                                END
                            ORDER BY created_at DESC
                        ) as rn
                    FROM chat_logs
                    WHERE wa_number_id = $1
                )
                SELECT
                    contact_phone,
                    message_content as last_message,
                    message_type as last_message_type,
                    direction as last_direction,
                    created_at as last_message_at,
                    (
                        SELECT COUNT(*)
                        FROM chat_logs c2
                        WHERE c2.wa_number_id = $1
                          AND (
                            (c2.direction = 'incoming' AND c2.sender_phone = ranked_messages.contact_phone) OR
                            (c2.direction = 'outgoing' AND c2.recipient_phone = ranked_messages.contact_phone)
                          )
                    ) as total_messages
                FROM ranked_messages
                WHERE rn = 1
                ORDER BY created_at DESC
                LIMIT $2;
            `;

            const result = await postgres.query(query, [waNumberId, limit]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get recent conversations', 'DATABASE', {
                waNumberId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get chat statistics for a WA number
     * @param {number} waNumberId - WA number ID
     * @returns {Promise<Object>} Chat statistics
     */
    static async getStatistics(waNumberId) {
        try {
            const query = `
                SELECT
                    COUNT(*) as total_messages,
                    SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming_count,
                    SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing_count,
                    COUNT(DISTINCT CASE WHEN direction = 'incoming' THEN sender_phone END) as unique_senders,
                    COUNT(DISTINCT CASE WHEN direction = 'outgoing' THEN recipient_phone END) as unique_recipients,
                    MAX(created_at) as last_message_at,
                    MIN(created_at) as first_message_at
                FROM chat_logs
                WHERE wa_number_id = $1;
            `;

            const result = await postgres.query(query, [waNumberId]);

            return result.rows[0];
        } catch (error) {
            logger.error('Failed to get chat statistics', 'DATABASE', {
                waNumberId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get message type distribution
     * @param {number} waNumberId - WA number ID
     * @returns {Promise<Array>} Message type distribution
     */
    static async getMessageTypeDistribution(waNumberId) {
        try {
            const query = `
                SELECT
                    message_type,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
                FROM chat_logs
                WHERE wa_number_id = $1
                GROUP BY message_type
                ORDER BY count DESC;
            `;

            const result = await postgres.query(query, [waNumberId]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get message type distribution', 'DATABASE', {
                waNumberId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Search messages by content
     * @param {number} waNumberId - WA number ID
     * @param {string} searchTerm - Search term
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of matching messages
     */
    static async search(waNumberId, searchTerm, options = {}) {
        try {
            const { limit = 100, offset = 0 } = options;

            const query = `
                SELECT id, wa_number_id, sender_phone, recipient_phone,
                       message_content, message_type, direction, created_at
                FROM chat_logs
                WHERE wa_number_id = $1
                  AND message_content ILIKE $2
                ORDER BY created_at DESC
                LIMIT $3 OFFSET $4;
            `;

            const result = await postgres.query(query, [
                waNumberId,
                `%${searchTerm}%`,
                limit,
                offset
            ]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to search chat logs', 'DATABASE', {
                waNumberId,
                searchTerm,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Delete chat logs for a WA number
     * @param {number} waNumberId - WA number ID
     * @param {Object} options - Delete options
     * @param {Date} options.before - Delete messages before this date
     * @returns {Promise<number>} Number of deleted messages
     */
    static async deleteByWaNumber(waNumberId, options = {}) {
        try {
            let query = 'DELETE FROM chat_logs WHERE wa_number_id = $1';
            const params = [waNumberId];

            if (options.before) {
                query += ' AND created_at < $2';
                params.push(options.before);
            }

            query += ' RETURNING id;';

            const result = await postgres.query(query, params);

            logger.info('Chat logs deleted', 'DATABASE', {
                waNumberId,
                count: result.rowCount
            });

            return result.rowCount;
        } catch (error) {
            logger.error('Failed to delete chat logs', 'DATABASE', {
                waNumberId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get daily message statistics
     * @param {number} waNumberId - WA number ID
     * @param {number} days - Number of days to fetch (default: 30)
     * @returns {Promise<Array>} Daily statistics
     */
    static async getDailyStatistics(waNumberId, days = 30) {
        try {
            const query = `
                SELECT
                    DATE(created_at) as date,
                    COUNT(*) as total_messages,
                    SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming_count,
                    SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing_count
                FROM chat_logs
                WHERE wa_number_id = $1
                  AND created_at >= CURRENT_DATE - INTERVAL '1 day' * $2
                GROUP BY DATE(created_at)
                ORDER BY date DESC;
            `;

            const result = await postgres.query(query, [waNumberId, days]);

            return result.rows;
        } catch (error) {
            logger.error('Failed to get daily statistics', 'DATABASE', {
                waNumberId,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get count of messages for a WA number
     * @param {number} waNumberId - WA number ID
     * @returns {Promise<number>} Message count
     */
    static async getCount(waNumberId) {
        try {
            const query = `
                SELECT COUNT(*) as count
                FROM chat_logs
                WHERE wa_number_id = $1;
            `;

            const result = await postgres.query(query, [waNumberId]);

            return parseInt(result.rows[0].count);
        } catch (error) {
            logger.error('Failed to get message count', 'DATABASE', {
                waNumberId,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = ChatLogModel;
