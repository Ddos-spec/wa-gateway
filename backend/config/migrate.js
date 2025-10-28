const pool = require('./db');
const bcrypt = require('bcryptjs');

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting database migration...');
    
    // Drop existing tables to ensure a clean slate
    await client.query('DROP TABLE IF EXISTS session_logs;');
    await client.query('DROP TABLE IF EXISTS sessions;');
    await client.query('DROP TABLE IF EXISTS config;');
    console.log('✅ Dropped existing tables.');

    // Create config table
    await client.query(`
      CREATE TABLE config (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table "config" created');
    
    // Create sessions table with STATUS column
    await client.query(`
      CREATE TABLE sessions (
        id SERIAL PRIMARY KEY,
        session_name VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'offline',
        wa_number VARCHAR(20),
        profile_name VARCHAR(100),
        webhook_url TEXT,
        webhook_events JSONB DEFAULT '{"audio": false, "group": false, "image": false, "video": false, "from_me": true, "document": false, "individual": true, "update_status": true}'::jsonb,
        api_key VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table "sessions" created with status column');
    
    // Create session_logs table
    await client.query(`
      CREATE TABLE session_logs (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        details JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table "session_logs" created');
    
    // Insert default admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO config (username, password)
      VALUES ($1, $2)
      ON CONFLICT (username) DO NOTHING
    `, ['admin', hashedPassword]);
    console.log('✅ Default admin user created (username: admin, password: admin123)');
    
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = migrate;