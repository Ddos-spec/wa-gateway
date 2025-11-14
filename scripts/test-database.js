/**
 * Database Test Script
 *
 * Tests all database operations and models
 */

require('dotenv').config();

const {
    initializeDatabase,
    Admin,
    User,
    WaFolder,
    WaNumber,
    ChatLog,
    postgres,
    redis,
    closeDatabase
} = require('../db');

async function testPostgreSQL() {
    console.log('\n🔍 Testing PostgreSQL Connection...');

    try {
        const result = await postgres.query('SELECT NOW() as time, version()');
        console.log('✓ PostgreSQL connection successful');
        console.log(`  Time: ${result.rows[0].time}`);
        console.log(`  Version: ${result.rows[0].version.substring(0, 50)}...`);
        return true;
    } catch (error) {
        console.error('✗ PostgreSQL connection failed:', error.message);
        return false;
    }
}

async function testRedis() {
    console.log('\n🔍 Testing Redis Connection...');

    try {
        const pong = await redis.ping();
        console.log('✓ Redis connection successful');
        console.log(`  Ping response: ${pong}`);

        // Test set/get
        await redis.set('test:key', 'test-value', 60);
        const value = await redis.get('test:key');
        console.log('✓ Redis set/get test successful');
        console.log(`  Value: ${value}`);

        // Clean up
        await redis.del('test:key');

        return true;
    } catch (error) {
        console.error('✗ Redis connection failed:', error.message);
        return false;
    }
}

async function testAdminModel() {
    console.log('\n🔍 Testing Admin Model...');

    try {
        // Create test admin
        const testEmail = `test-admin-${Date.now()}@test.com`;
        const admin = await Admin.create({
            email: testEmail,
            password: 'test123'
        });
        console.log('✓ Admin created:', admin.email);

        // Find by email
        const foundAdmin = await Admin.findByEmail(testEmail);
        console.log('✓ Admin found by email:', foundAdmin.email);

        // Authenticate
        const authResult = await Admin.authenticate(testEmail, 'test123');
        console.log('✓ Admin authenticated:', authResult ? 'Success' : 'Failed');

        // Get statistics
        const stats = await Admin.getStatistics(admin.id);
        console.log('✓ Admin statistics:', stats);

        // Clean up
        await Admin.delete(admin.id);
        console.log('✓ Admin deleted');

        return true;
    } catch (error) {
        console.error('✗ Admin model test failed:', error.message);
        return false;
    }
}

async function testUserModel() {
    console.log('\n🔍 Testing User Model...');

    try {
        // Create test admin first
        const adminEmail = `test-admin-${Date.now()}@test.com`;
        const admin = await Admin.create({
            email: adminEmail,
            password: 'test123'
        });

        // Create test user
        const userEmail = `test-user-${Date.now()}@test.com`;
        const user = await User.create({
            adminId: admin.id,
            email: userEmail,
            password: 'test123'
        });
        console.log('✓ User created:', user.email);

        // Find by email
        const foundUser = await User.findByEmail(userEmail);
        console.log('✓ User found by email:', foundUser.email);

        // Authenticate
        const authResult = await User.authenticate(userEmail, 'test123');
        console.log('✓ User authenticated:', authResult ? 'Success' : 'Failed');

        // Get users by admin
        const users = await User.getAllByAdmin(admin.id);
        console.log('✓ Users fetched for admin:', users.length);

        // Get statistics
        const stats = await User.getStatistics(user.id);
        console.log('✓ User statistics:', stats);

        // Clean up
        await User.delete(user.id);
        await Admin.delete(admin.id);
        console.log('✓ User and admin deleted');

        return true;
    } catch (error) {
        console.error('✗ User model test failed:', error.message);
        return false;
    }
}

async function testWaFolderModel() {
    console.log('\n🔍 Testing WaFolder Model...');

    try {
        // Create test admin
        const adminEmail = `test-admin-${Date.now()}@test.com`;
        const admin = await Admin.create({
            email: adminEmail,
            password: 'test123'
        });

        // Create test folder
        const folder = await WaFolder.create({
            adminId: admin.id,
            folderName: 'Test Folder'
        });
        console.log('✓ Folder created:', folder.folder_name);

        // Get all folders by admin
        const folders = await WaFolder.getAllByAdmin(admin.id);
        console.log('✓ Folders fetched:', folders.length);

        // Get folder with counts
        const foldersWithCounts = await WaFolder.getAllWithCounts(admin.id);
        console.log('✓ Folders with counts:', foldersWithCounts.length);

        // Clean up
        await WaFolder.delete(folder.id);
        await Admin.delete(admin.id);
        console.log('✓ Folder and admin deleted');

        return true;
    } catch (error) {
        console.error('✗ WaFolder model test failed:', error.message);
        return false;
    }
}

async function testWaNumberModel() {
    console.log('\n🔍 Testing WaNumber Model...');

    try {
        // Create test admin and user
        const adminEmail = `test-admin-${Date.now()}@test.com`;
        const admin = await Admin.create({
            email: adminEmail,
            password: 'test123'
        });

        const userEmail = `test-user-${Date.now()}@test.com`;
        const user = await User.create({
            adminId: admin.id,
            email: userEmail,
            password: 'test123'
        });

        // Create folder
        const folder = await WaFolder.create({
            adminId: admin.id,
            folderName: 'Test Folder'
        });

        // Create WA number
        const timestamp = Date.now();
        const waNumber = await WaNumber.create({
            userId: user.id,
            folderId: folder.id,
            phoneNumber: `+62812${timestamp}`,
            sessionName: `test-session-${timestamp}`
        });
        console.log('✓ WA Number created:', waNumber.phone_number);

        // Find by phone number
        const foundWaNumber = await WaNumber.findByPhoneNumber(waNumber.phone_number);
        console.log('✓ WA Number found by phone:', foundWaNumber.phone_number);

        // Get all by user
        const waNumbers = await WaNumber.getAllByUser(user.id);
        console.log('✓ WA Numbers fetched for user:', waNumbers.length);

        // Get grouped by folder
        const grouped = await WaNumber.getGroupedByFolder(user.id);
        console.log('✓ WA Numbers grouped by folder:', Object.keys(grouped));

        // Clean up
        await WaNumber.delete(waNumber.id);
        await WaFolder.delete(folder.id);
        await User.delete(user.id);
        await Admin.delete(admin.id);
        console.log('✓ All test data deleted');

        return true;
    } catch (error) {
        console.error('✗ WaNumber model test failed:', error.message);
        return false;
    }
}

async function testChatLogModel() {
    console.log('\n🔍 Testing ChatLog Model...');

    try {
        // Create necessary test data
        const adminEmail = `test-admin-${Date.now()}@test.com`;
        const admin = await Admin.create({
            email: adminEmail,
            password: 'test123'
        });

        const userEmail = `test-user-${Date.now()}@test.com`;
        const user = await User.create({
            adminId: admin.id,
            email: userEmail,
            password: 'test123'
        });

        const timestamp = Date.now();
        const waNumber = await WaNumber.create({
            userId: user.id,
            folderId: null,
            phoneNumber: `+62812${timestamp}`,
            sessionName: `test-session-${timestamp}`
        });

        // Create chat log
        const chatLog = await ChatLog.create({
            waNumberId: waNumber.id,
            senderPhone: waNumber.phone_number,
            recipientPhone: '+628123456789',
            messageContent: 'Test message',
            messageType: 'text',
            direction: 'outgoing'
        });
        console.log('✓ Chat log created:', chatLog.id);

        // Get chat logs
        const logs = await ChatLog.getByWaNumber(waNumber.id);
        console.log('✓ Chat logs fetched:', logs.length);

        // Get statistics
        const stats = await ChatLog.getStatistics(waNumber.id);
        console.log('✓ Chat statistics:', stats);

        // Clean up
        await WaNumber.delete(waNumber.id); // Will cascade delete chat logs
        await User.delete(user.id);
        await Admin.delete(admin.id);
        console.log('✓ All test data deleted');

        return true;
    } catch (error) {
        console.error('✗ ChatLog model test failed:', error.message);
        return false;
    }
}

async function testRedisSession() {
    console.log('\n🔍 Testing Redis Session Storage...');

    try {
        const sessionId = `test-session-${Date.now()}`;
        const sessionData = {
            phoneNumber: '+628123456789',
            status: 'connected',
            owner: 'test@test.com'
        };

        // Save session
        await redis.saveSession(sessionId, sessionData);
        console.log('✓ Session saved to Redis');

        // Get session
        const retrieved = await redis.getSession(sessionId);
        console.log('✓ Session retrieved:', retrieved.phoneNumber);

        // Get all session IDs
        const sessionIds = await redis.getAllSessionIds();
        console.log('✓ All session IDs:', sessionIds.length);

        // Delete session
        await redis.deleteSession(sessionId);
        console.log('✓ Session deleted');

        return true;
    } catch (error) {
        console.error('✗ Redis session test failed:', error.message);
        return false;
    }
}

async function runAllTests() {
    console.log('='.repeat(60));
    console.log('WA Gateway - Database Tests');
    console.log('='.repeat(60));

    const results = {
        total: 0,
        passed: 0,
        failed: 0
    };

    try {
        // Initialize database
        console.log('\n📦 Initializing database connections...');
        await initializeDatabase();
        console.log('✓ Database initialized');

        // Run tests
        const tests = [
            { name: 'PostgreSQL', fn: testPostgreSQL },
            { name: 'Redis', fn: testRedis },
            { name: 'Admin Model', fn: testAdminModel },
            { name: 'User Model', fn: testUserModel },
            { name: 'WaFolder Model', fn: testWaFolderModel },
            { name: 'WaNumber Model', fn: testWaNumberModel },
            { name: 'ChatLog Model', fn: testChatLogModel },
            { name: 'Redis Session', fn: testRedisSession }
        ];

        for (const test of tests) {
            results.total++;
            const passed = await test.fn();
            if (passed) {
                results.passed++;
            } else {
                results.failed++;
            }
        }

        // Display results
        console.log('\n' + '='.repeat(60));
        console.log('Test Results:');
        console.log('='.repeat(60));
        console.log(`Total:  ${results.total}`);
        console.log(`Passed: ${results.passed} ✓`);
        console.log(`Failed: ${results.failed} ${results.failed > 0 ? '✗' : ''}`);
        console.log('='.repeat(60));

        if (results.failed === 0) {
            console.log('\n✓ All tests passed!');
            console.log('\nThe database is ready to use.');
        } else {
            console.log(`\n✗ ${results.failed} test(s) failed!`);
            console.log('\nPlease fix the errors before proceeding.');
        }

    } catch (error) {
        console.error('\n✗ Test suite failed:', error.message);
        console.error(error.stack);
    } finally {
        // Close database connections
        console.log('\n📦 Closing database connections...');
        await closeDatabase();
        console.log('✓ Connections closed');
        process.exit(results.failed > 0 ? 1 : 0);
    }
}

// Run tests
runAllTests().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
