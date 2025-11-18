/**
 * Create Admin User Script
 * 
 * Run this script to create the first admin user in the database
 * Usage: node scripts/create-admin.js <email> <password>
 */

require('dotenv').config();
const { initializeDatabase, Admin } = require('../db');
const { getLogger } = require('../src/utils/logger');

const logger = getLogger();

async function createAdmin() {
    try {
        const email = process.argv[2];
        const password = process.argv[3];

        if (!email || !password) {
            console.error('Usage: node scripts/create-admin.js <email> <password>');
            console.error('Example: node scripts/create-admin.js admin@example.com mypassword123');
            process.exit(1);
        }

        console.log('============================================================');
        console.log('Creating Admin User');
        console.log('============================================================\n');

        // Initialize database connection
        console.log('📦 Connecting to database...');
        await initializeDatabase();
        console.log('✓ Database connected\n');

        // Create admin user
        console.log('👤 Creating admin user...');
        const admin = await Admin.create({ email, password });
        console.log('✓ Admin user created successfully!');
        console.log(`   Email: ${admin.email}`);
        console.log(`   ID: ${admin.id}`);
        console.log(`   Created at: ${admin.created_at}`);

        console.log('\n✅ Admin user setup complete!');
        console.log('You can now login with:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);
        
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Error creating admin user:', error.message);
        if (error.message.includes('duplicate key')) {
            console.error('   This email already exists in the database.');
        }
        process.exit(1);
    }
}

createAdmin();
