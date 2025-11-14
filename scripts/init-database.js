/**
 * Database Initialization Script
 *
 * Initializes database connections, creates schema, and sets up default admin account
 */

require('dotenv').config();

const { initializeDatabase, Admin, postgres, redis } = require('../db');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log('='.repeat(60));
    console.log('WA Gateway - Database Initialization');
    console.log('='.repeat(60));
    console.log('');

    try {
        // Step 1: Connect to databases
        console.log('Step 1: Connecting to databases...');
        await initializeDatabase();
        console.log('✓ Connected to PostgreSQL and Redis');
        console.log('');

        // Step 2: Test connections
        console.log('Step 2: Testing database connections...');

        // Test PostgreSQL
        const pgResult = await postgres.query('SELECT NOW() as current_time');
        console.log('✓ PostgreSQL connection OK');
        console.log(`  Current time: ${pgResult.rows[0].current_time}`);

        // Test Redis
        const redisPing = await redis.ping();
        console.log('✓ Redis connection OK');
        console.log(`  Ping result: ${redisPing}`);
        console.log('');

        // Step 3: Check for existing admins
        console.log('Step 3: Checking for existing admins...');
        const admins = await Admin.getAll();
        console.log(`  Found ${admins.length} admin(s)`);
        console.log('');

        // Step 4: Create default admin if none exists
        if (admins.length === 0) {
            console.log('Step 4: Creating default admin account...');
            console.log('');

            const defaultEmail = await question('  Admin email (default: admin@wagateway.local): ') || 'admin@wagateway.local';
            const defaultPassword = await question('  Admin password (default: admin123): ') || 'admin123';

            console.log('');
            console.log('  Creating admin account...');

            const admin = await Admin.create({
                email: defaultEmail,
                password: defaultPassword
            });

            console.log('✓ Admin account created successfully');
            console.log(`  Email: ${admin.email}`);
            console.log(`  ID: ${admin.id}`);
            console.log('');
            console.log('  ⚠️  IMPORTANT: Please change the default password after first login!');
            console.log('');
        } else {
            console.log('Step 4: Admin account(s) already exist');
            console.log('');
            admins.forEach((admin, index) => {
                console.log(`  ${index + 1}. ${admin.email} (ID: ${admin.id})`);
            });
            console.log('');
        }

        // Step 5: Display connection info
        console.log('Step 5: Database connection information');
        console.log('');
        console.log('PostgreSQL:');
        console.log(`  Host: ${process.env.DB_HOST}`);
        console.log(`  Port: ${process.env.DB_PORT}`);
        console.log(`  Database: ${process.env.DB_NAME}`);
        console.log(`  User: ${process.env.DB_USER}`);
        console.log('');
        console.log('Redis:');
        console.log(`  Host: ${process.env.REDIS_HOST}`);
        console.log(`  Port: ${process.env.REDIS_PORT}`);
        console.log(`  DB: ${process.env.REDIS_DB}`);
        console.log('');

        // Step 6: Display pool stats
        console.log('Step 6: Connection pool statistics');
        const pgStats = postgres.getStats();
        console.log('');
        console.log('PostgreSQL Pool:');
        console.log(`  Connected: ${pgStats.connected}`);
        console.log(`  Total connections: ${pgStats.totalCount}`);
        console.log(`  Idle connections: ${pgStats.idleCount}`);
        console.log(`  Waiting connections: ${pgStats.waitingCount}`);
        console.log('');

        const redisStats = redis.getStats();
        console.log('Redis:');
        console.log(`  Connected: ${redisStats.connected}`);
        console.log(`  Status: ${redisStats.status}`);
        console.log('');

        // Success message
        console.log('='.repeat(60));
        console.log('✓ Database initialization completed successfully!');
        console.log('='.repeat(60));
        console.log('');
        console.log('Next steps:');
        console.log('  1. Start the server: npm start');
        console.log('  2. Login to admin dashboard: http://localhost:3000/admin');
        console.log('  3. Create users and manage WA sessions');
        console.log('');

    } catch (error) {
        console.error('');
        console.error('✗ Database initialization failed!');
        console.error('');
        console.error('Error:', error.message);
        console.error('');

        if (error.code === 'ECONNREFUSED') {
            console.error('Connection refused. Please check:');
            console.error('  1. Database server is running');
            console.error('  2. Connection details in .env file are correct');
            console.error('  3. Firewall allows connections');
        } else if (error.code === '28P01') {
            console.error('Authentication failed. Please check:');
            console.error('  1. Database username and password in .env file');
            console.error('  2. User has permissions to access the database');
        } else if (error.code === '3D000') {
            console.error('Database does not exist. Please:');
            console.error('  1. Create the database first');
            console.error('  2. Run: createdb wagateway');
        }

        console.error('');
        process.exit(1);
    } finally {
        // Close connections
        await postgres.close();
        await redis.close();
        rl.close();
    }
}

// Run the script
main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
