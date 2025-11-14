/**
 * Database Module Entry Point
 *
 * Exports all database connections and models
 */

const postgres = require('./postgres');
const redis = require('./redis');
const { initializeSchema, dropAllTables, isSchemaInitialized } = require('./init-schema');

// Import models
const AdminModel = require('./models/Admin');
const UserModel = require('./models/User');
const WaFolderModel = require('./models/WaFolder');
const WaNumberModel = require('./models/WaNumber');
const ChatLogModel = require('./models/ChatLog');

/**
 * Initialize all database connections
 */
async function initializeDatabase() {
    try {
        // Connect to PostgreSQL
        await postgres.connect();

        // Connect to Redis
        await redis.connect();

        // Check if schema needs initialization
        const schemaExists = await isSchemaInitialized();

        if (!schemaExists) {
            console.log('Database schema not found. Initializing...');
            await initializeSchema();
        } else {
            console.log('Database schema already initialized');
        }

        return true;
    } catch (error) {
        console.error('Failed to initialize database:', error.message);
        throw error;
    }
}

/**
 * Close all database connections gracefully
 */
async function closeDatabase() {
    try {
        await Promise.all([
            postgres.close(),
            redis.close()
        ]);

        console.log('All database connections closed');
        return true;
    } catch (error) {
        console.error('Error closing database connections:', error.message);
        throw error;
    }
}

/**
 * Health check for all database connections
 */
async function healthCheck() {
    try {
        const [postgresHealth, redisHealth] = await Promise.all([
            postgres.healthCheck(),
            redis.healthCheck()
        ]);

        return {
            postgres: postgresHealth,
            redis: redisHealth,
            healthy: postgresHealth && redisHealth
        };
    } catch (error) {
        console.error('Database health check failed:', error.message);
        return {
            postgres: false,
            redis: false,
            healthy: false,
            error: error.message
        };
    }
}

/**
 * Get database statistics
 */
function getStats() {
    return {
        postgres: postgres.getStats(),
        redis: redis.getStats()
    };
}

module.exports = {
    // Connections
    postgres,
    redis,

    // Models
    Admin: AdminModel,
    User: UserModel,
    WaFolder: WaFolderModel,
    WaNumber: WaNumberModel,
    ChatLog: ChatLogModel,

    // Utility functions
    initializeDatabase,
    closeDatabase,
    healthCheck,
    getStats,

    // Schema management
    initializeSchema,
    dropAllTables,
    isSchemaInitialized
};
