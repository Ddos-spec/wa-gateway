// Database Configuration - Location: /backend/config/db.js
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL connection error:', err);
});

pool.query('SELECT NOW()', (err, result) => {
    if (err) {
        console.error('❌ Database connection test failed:', err);
    } else {
        console.log('✅ Database connection test successful:', result.rows[0]);
    }
});

export default pool;