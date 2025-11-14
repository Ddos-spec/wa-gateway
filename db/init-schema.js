/**
 * Database Schema Initialization Script
 *
 * Creates all required tables, indexes, and views for the WA Gateway application
 */

const postgres = require('./postgres');
const { getLogger } = require('../src/utils/logger');

const logger = getLogger();

/**
 * Initialize database schema
 * Creates all tables, indexes, and views if they don't exist
 */
async function initializeSchema() {
    try {
        logger.info('Starting database schema initialization...', 'DATABASE');

        // Create tables
        await createAdminsTable();
        await createUsersTable();
        await createWaFoldersTable();
        await createWaNumbersTable();
        await createChatLogsTable();

        // Create indexes
        await createIndexes();

        // Create views
        await createViews();

        logger.info('Database schema initialized successfully', 'DATABASE');
        return true;

    } catch (error) {
        logger.error('Failed to initialize database schema', 'DATABASE', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Create admins table
 */
async function createAdminsTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS admins (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    await postgres.query(query);
    logger.info('Admins table created/verified', 'DATABASE');
}

/**
 * Create users table
 */
async function createUsersTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    await postgres.query(query);
    logger.info('Users table created/verified', 'DATABASE');
}

/**
 * Create wa_folders table
 */
async function createWaFoldersTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS wa_folders (
            id SERIAL PRIMARY KEY,
            admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
            folder_name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    await postgres.query(query);
    logger.info('WA Folders table created/verified', 'DATABASE');
}

/**
 * Create wa_numbers table
 */
async function createWaNumbersTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS wa_numbers (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            folder_id INTEGER REFERENCES wa_folders(id) ON DELETE SET NULL,
            phone_number VARCHAR(20) NOT NULL UNIQUE,
            session_name VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    await postgres.query(query);
    logger.info('WA Numbers table created/verified', 'DATABASE');
}

/**
 * Create chat_logs table
 */
async function createChatLogsTable() {
    const query = `
        CREATE TABLE IF NOT EXISTS chat_logs (
            id SERIAL PRIMARY KEY,
            wa_number_id INTEGER NOT NULL REFERENCES wa_numbers(id) ON DELETE CASCADE,
            sender_phone VARCHAR(20) NOT NULL,
            recipient_phone VARCHAR(20) NOT NULL,
            message_content TEXT,
            message_type VARCHAR(50) DEFAULT 'text',
            direction VARCHAR(20) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    await postgres.query(query);
    logger.info('Chat Logs table created/verified', 'DATABASE');
}

/**
 * Create all necessary indexes
 */
async function createIndexes() {
    const indexes = [
        // Users indexes
        'CREATE INDEX IF NOT EXISTS idx_users_admin_id ON users(admin_id);',
        'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);',

        // WA Folders indexes
        'CREATE INDEX IF NOT EXISTS idx_wa_folders_admin_id ON wa_folders(admin_id);',

        // WA Numbers indexes
        'CREATE INDEX IF NOT EXISTS idx_wa_numbers_user_id ON wa_numbers(user_id);',
        'CREATE INDEX IF NOT EXISTS idx_wa_numbers_folder_id ON wa_numbers(folder_id);',
        'CREATE INDEX IF NOT EXISTS idx_wa_numbers_phone_number ON wa_numbers(phone_number);',
        'CREATE INDEX IF NOT EXISTS idx_wa_numbers_session_name ON wa_numbers(session_name);',

        // Chat Logs indexes
        'CREATE INDEX IF NOT EXISTS idx_chat_logs_wa_number_id ON chat_logs(wa_number_id);',
        'CREATE INDEX IF NOT EXISTS idx_chat_logs_sender_recipient ON chat_logs(sender_phone, recipient_phone);',
        'CREATE INDEX IF NOT EXISTS idx_chat_logs_created_at ON chat_logs(created_at);',
        'CREATE INDEX IF NOT EXISTS idx_chat_logs_direction ON chat_logs(direction);'
    ];

    for (const indexQuery of indexes) {
        await postgres.query(indexQuery);
    }

    logger.info('Database indexes created/verified', 'DATABASE');
}

/**
 * Create database views
 */
async function createViews() {
    // View: Chat Summary
    const chatSummaryView = `
        CREATE OR REPLACE VIEW view_chat_summary AS
        SELECT
            w.id AS wa_number_id,
            w.phone_number,
            w.session_name,
            u.email AS user_email,
            f.folder_name,
            COUNT(c.id) AS total_messages,
            SUM(CASE WHEN c.direction = 'incoming' THEN 1 ELSE 0 END) AS incoming_count,
            SUM(CASE WHEN c.direction = 'outgoing' THEN 1 ELSE 0 END) AS outgoing_count,
            MAX(c.created_at) AS last_message_at
        FROM wa_numbers w
        LEFT JOIN users u ON w.user_id = u.id
        LEFT JOIN wa_folders f ON w.folder_id = f.id
        LEFT JOIN chat_logs c ON w.id = c.wa_number_id
        GROUP BY w.id, w.phone_number, w.session_name, u.email, f.folder_name
        ORDER BY last_message_at DESC NULLS LAST;
    `;

    await postgres.query(chatSummaryView);

    // View: User WA Details
    const userWaDetailsView = `
        CREATE OR REPLACE VIEW view_user_wa_details AS
        SELECT
            u.id AS user_id,
            u.email AS user_email,
            u.admin_id,
            w.id AS wa_number_id,
            w.phone_number,
            w.session_name,
            f.id AS folder_id,
            f.folder_name,
            w.created_at AS wa_created_at,
            COUNT(c.id) AS total_messages
        FROM users u
        LEFT JOIN wa_numbers w ON u.id = w.user_id
        LEFT JOIN wa_folders f ON w.folder_id = f.id
        LEFT JOIN chat_logs c ON w.id = c.wa_number_id
        GROUP BY u.id, u.email, u.admin_id, w.id, w.phone_number, w.session_name, f.id, f.folder_name, w.created_at
        ORDER BY u.id, f.folder_name, w.created_at DESC;
    `;

    await postgres.query(userWaDetailsView);

    logger.info('Database views created/verified', 'DATABASE');
}

/**
 * Drop all tables (use with caution!)
 */
async function dropAllTables() {
    logger.warn('Dropping all tables...', 'DATABASE');

    const queries = [
        'DROP VIEW IF EXISTS view_user_wa_details;',
        'DROP VIEW IF EXISTS view_chat_summary;',
        'DROP TABLE IF EXISTS chat_logs CASCADE;',
        'DROP TABLE IF EXISTS wa_numbers CASCADE;',
        'DROP TABLE IF EXISTS wa_folders CASCADE;',
        'DROP TABLE IF EXISTS users CASCADE;',
        'DROP TABLE IF EXISTS admins CASCADE;'
    ];

    for (const query of queries) {
        await postgres.query(query);
    }

    logger.warn('All tables dropped', 'DATABASE');
}

/**
 * Check if database schema is initialized
 */
async function isSchemaInitialized() {
    try {
        const result = await postgres.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'admins'
            );
        `);

        return result.rows[0].exists;
    } catch (error) {
        logger.error('Failed to check schema initialization', 'DATABASE', {
            error: error.message
        });
        return false;
    }
}

module.exports = {
    initializeSchema,
    dropAllTables,
    isSchemaInitialized
};
