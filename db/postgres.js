/**
 * PostgreSQL Database Connection Manager
 *
 * Handles connection pooling and provides query methods for PostgreSQL database
 */

const { Pool } = require('pg');
const { getLogger } = require('../src/utils/logger');

class PostgresConnection {
    constructor() {
        this.pool = null;
        this.logger = getLogger();
        this.isConnected = false;
    }

    /**
     * Initialize the database connection pool
     */
    async connect() {
        try {
            // Use DATABASE_URL if available, otherwise construct from individual params
            const connectionConfig = process.env.DATABASE_URL ? {
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
            } : {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT) || 5432,
                database: process.env.DB_NAME || 'wagateway',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD,
                ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
            };

            this.pool = new Pool({
                ...connectionConfig,
                max: 20, // Maximum number of clients in the pool
                idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
                connectionTimeoutMillis: 2000, // Timeout if connection takes too long
            });

            // Test the connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            this.isConnected = true;
            this.logger.info('PostgreSQL connection pool initialized successfully', 'DATABASE');

            // Log connection info (without sensitive data)
            this.logger.info(`Connected to database: ${connectionConfig.database || 'from URL'}`, 'DATABASE');

            return true;
        } catch (error) {
            this.logger.error('Failed to connect to PostgreSQL', 'DATABASE', {
                error: error.message,
                code: error.code
            });
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Execute a query with parameters
     * @param {string} text - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object>} Query result
     */
    async query(text, params) {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;

            this.logger.debug('Query executed', 'DATABASE', {
                duration: `${duration}ms`,
                rows: result.rowCount
            });

            return result;
        } catch (error) {
            this.logger.error('Query execution error', 'DATABASE', {
                error: error.message,
                query: text.substring(0, 100) // Log first 100 chars of query
            });
            throw error;
        }
    }

    /**
     * Get a client from the pool for transactions
     * @returns {Promise<Object>} Database client
     */
    async getClient() {
        try {
            return await this.pool.connect();
        } catch (error) {
            this.logger.error('Failed to get client from pool', 'DATABASE', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Execute a transaction
     * @param {Function} callback - Transaction callback function
     * @returns {Promise<any>} Transaction result
     */
    async transaction(callback) {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('Transaction failed and rolled back', 'DATABASE', {
                error: error.message
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Check if database connection is healthy
     * @returns {Promise<boolean>}
     */
    async healthCheck() {
        try {
            const result = await this.query('SELECT 1 as health');
            return result.rows.length > 0;
        } catch (error) {
            this.logger.error('Database health check failed', 'DATABASE', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * Get connection pool stats
     * @returns {Object} Pool statistics
     */
    getStats() {
        if (!this.pool) {
            return { connected: false };
        }

        return {
            connected: this.isConnected,
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount
        };
    }

    /**
     * Close all connections in the pool
     */
    async close() {
        try {
            if (this.pool) {
                await this.pool.end();
                this.isConnected = false;
                this.logger.info('PostgreSQL connection pool closed', 'DATABASE');
            }
        } catch (error) {
            this.logger.error('Error closing PostgreSQL pool', 'DATABASE', {
                error: error.message
            });
            throw error;
        }
    }
}

// Create a singleton instance
const postgresConnection = new PostgresConnection();

module.exports = postgresConnection;
