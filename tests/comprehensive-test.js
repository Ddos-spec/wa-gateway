#!/usr/bin/env node

/**
 * Comprehensive Test Suite for WA-Gateway
 * Tests all critical functionality before deployment
 */

const axios = require('axios');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ADMIN_PASSWORD = process.env.ADMIN_DASHBOARD_PASSWORD || 'admin';

let sessionCookie = '';
let testSessionId = '';

// ANSI colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, type = 'info') {
    const prefix = {
        'info': `${colors.cyan}[INFO]${colors.reset}`,
        'success': `${colors.green}[✓]${colors.reset}`,
        'error': `${colors.red}[✗]${colors.reset}`,
        'warning': `${colors.yellow}[!]${colors.reset}`,
        'test': `${colors.blue}[TEST]${colors.reset}`
    };
    console.log(`${prefix[type]} ${message}`);
}

function logSection(title) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${colors.cyan}${title}${colors.reset}`);
    console.log(`${'='.repeat(60)}\n`);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: Admin Authentication
async function testAdminAuth() {
    logSection('TEST 1: Admin Authentication');

    try {
        // Test with correct password
        log('Testing login with correct password...', 'test');
        const response = await axios.post(`${BASE_URL}/admin/login`, {
            password: ADMIN_PASSWORD
        });

        if (response.status === 200 && response.data.status === 'success') {
            sessionCookie = response.headers['set-cookie']?.[0] || '';
            log('✓ Login successful with correct password', 'success');
            log(`  Session cookie: ${sessionCookie.substring(0, 50)}...`, 'info');
        } else {
            throw new Error('Login failed');
        }

        // Test with wrong password
        log('Testing login with wrong password...', 'test');
        try {
            await axios.post(`${BASE_URL}/admin/login`, {
                password: 'wrongpassword'
            });
            log('✗ Wrong password should be rejected!', 'error');
            return false;
        } catch (error) {
            if (error.response?.status === 401) {
                log('✓ Wrong password correctly rejected', 'success');
            } else {
                throw error;
            }
        }

        return true;
    } catch (error) {
        log(`✗ Admin auth test failed: ${error.message}`, 'error');
        return false;
    }
}

// Test 2: Session Management API
async function testSessionAPI() {
    logSection('TEST 2: Session Management API');

    try {
        // Get sessions list
        log('Fetching sessions list...', 'test');
        const response = await axios.get(`${BASE_URL}/api/v2/sessions`, {
            headers: { Cookie: sessionCookie }
        });

        if (response.status === 200 && response.data.status === 'success') {
            log(`✓ Sessions list retrieved: ${response.data.data.length} sessions`, 'success');
        } else {
            throw new Error('Failed to get sessions');
        }

        return true;
    } catch (error) {
        log(`✗ Session API test failed: ${error.message}`, 'error');
        return false;
    }
}

// Test 3: Phone Number Formatting
async function testPhoneNumberFormatting() {
    logSection('TEST 3: Phone Number Formatting');

    const { formatPhoneNumber } = require('../phone-utils');

    const testCases = [
        { input: '08123456789', expected: '628123456789', description: 'Format with 0 prefix' },
        { input: '8123456789', expected: '628123456789', description: 'Format without 0' },
        { input: '+6281234567890', expected: '6281234567890', description: 'Format with +62' },
        { input: '0812-3456-789', expected: '628123456789', description: 'Format with dashes' },
        { input: '0812 3456 789', expected: '628123456789', description: 'Format with spaces' },
        { input: '62812 345 6789', expected: '628123456789', description: 'Format 62 with spaces' }
    ];

    let allPassed = true;

    for (const testCase of testCases) {
        const result = formatPhoneNumber(testCase.input);
        if (result === testCase.expected) {
            log(`✓ ${testCase.description}: ${testCase.input} → ${result}`, 'success');
        } else {
            log(`✗ ${testCase.description}: Expected ${testCase.expected}, got ${result}`, 'error');
            allPassed = false;
        }
    }

    return allPassed;
}

// Test 4: API Documentation Accessibility
async function testAPIDocs() {
    logSection('TEST 4: API Documentation');

    try {
        log('Checking API docs page...', 'test');
        const response = await axios.get(`${BASE_URL}/admin/docs.html`, {
            headers: { Cookie: sessionCookie }
        });

        if (response.status === 200) {
            log('✓ API docs page accessible', 'success');

            // Check for key endpoints in docs
            const html = response.data;
            const endpoints = [
                '/api/v2/pairing/start',
                '/api/v2/sessions',
                '/api/v2/messages/send'
            ];

            for (const endpoint of endpoints) {
                if (html.includes(endpoint)) {
                    log(`  ✓ Endpoint documented: ${endpoint}`, 'success');
                } else {
                    log(`  ✗ Endpoint missing: ${endpoint}`, 'error');
                }
            }
        } else {
            throw new Error('API docs not accessible');
        }

        return true;
    } catch (error) {
        log(`✗ API docs test failed: ${error.message}`, 'error');
        return false;
    }
}

// Test 5: WebSocket Authentication
async function testWebSocketAuth() {
    logSection('TEST 5: WebSocket Authentication');

    try {
        log('Getting WebSocket token...', 'test');
        const response = await axios.get(`${BASE_URL}/api/v2/ws-auth`, {
            headers: { Cookie: sessionCookie }
        });

        if (response.status === 200 && response.data.wsToken) {
            log('✓ WebSocket token obtained', 'success');
            log(`  Token: ${response.data.wsToken.substring(0, 30)}...`, 'info');
            return true;
        } else {
            throw new Error('Failed to get WebSocket token');
        }
    } catch (error) {
        log(`✗ WebSocket auth test failed: ${error.message}`, 'error');
        return false;
    }
}

// Test 6: Redis Connection
async function testRedisConnection() {
    logSection('TEST 6: Redis Connection');

    try {
        const redis = require('../db/redis');

        // Check if Redis is connected
        if (redis.client && redis.client.isOpen) {
            log('✓ Redis client is connected', 'success');

            // Test Redis operations
            log('Testing Redis SET operation...', 'test');
            await redis.set('test:key', { value: 'test' }, 60);
            log('✓ Redis SET successful', 'success');

            log('Testing Redis GET operation...', 'test');
            const value = await redis.get('test:key');
            if (value && value.value === 'test') {
                log('✓ Redis GET successful', 'success');
            } else {
                throw new Error('Redis GET returned wrong value');
            }

            log('Testing Redis DEL operation...', 'test');
            await redis.del('test:key');
            log('✓ Redis DEL successful', 'success');

            return true;
        } else {
            throw new Error('Redis client not connected');
        }
    } catch (error) {
        log(`✗ Redis connection test failed: ${error.message}`, 'error');
        return false;
    }
}

// Test 7: Check for PostgreSQL References
async function testNoPostgreSQL() {
    logSection('TEST 7: No PostgreSQL Dependencies');

    try {
        const fs = require('fs');
        const path = require('path');

        // Read index.js
        const indexContent = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

        // Check for postgres imports
        if (indexContent.includes("require('./db/postgres')") ||
            indexContent.includes("require('./db/index')")) {
            log('✗ PostgreSQL imports found in index.js', 'error');
            return false;
        }

        log('✓ No PostgreSQL imports in index.js', 'success');

        // Check if only Redis is used
        if (indexContent.includes("require('./db/redis')")) {
            log('✓ Redis-only architecture confirmed', 'success');
        }

        return true;
    } catch (error) {
        log(`✗ PostgreSQL check failed: ${error.message}`, 'error');
        return false;
    }
}

// Test 8: Pairing API Endpoint
async function testPairingAPI() {
    logSection('TEST 8: Pairing API Endpoint');

    try {
        // Note: This will create a session but won't complete pairing
        // We're just testing if the endpoint is working
        log('Testing /api/v2/pairing/start endpoint...', 'test');

        const testPhone = '6281234567890';
        const response = await axios.post(`${BASE_URL}/api/v2/pairing/start`, {
            phoneNumber: testPhone
        }, {
            headers: { Cookie: sessionCookie }
        });

        if (response.status === 202 && response.data.sessionId) {
            testSessionId = response.data.sessionId;
            log('✓ Pairing endpoint working', 'success');
            log(`  Session ID: ${testSessionId}`, 'info');

            // Wait a bit for session to initialize
            await sleep(2000);

            // Clean up test session
            log('Cleaning up test session...', 'test');
            try {
                await axios.delete(`${BASE_URL}/api/v2/sessions/${testSessionId}`, {
                    headers: { Cookie: sessionCookie }
                });
                log('✓ Test session cleaned up', 'success');
            } catch (cleanupError) {
                log('Warning: Could not clean up test session', 'warning');
            }

            return true;
        } else {
            throw new Error('Unexpected response from pairing endpoint');
        }
    } catch (error) {
        log(`✗ Pairing API test failed: ${error.response?.data?.message || error.message}`, 'error');
        if (error.response?.data) {
            log(`  Response: ${JSON.stringify(error.response.data)}`, 'error');
        }
        return false;
    }
}

// Main test runner
async function runAllTests() {
    console.log('\n');
    console.log(`${colors.cyan}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║   WA-GATEWAY COMPREHENSIVE TEST SUITE                 ║${colors.reset}`);
    console.log(`${colors.cyan}╚═══════════════════════════════════════════════════════╝${colors.reset}`);
    console.log(`\nTesting against: ${BASE_URL}\n`);

    const tests = [
        { name: 'Admin Authentication', fn: testAdminAuth },
        { name: 'Session Management API', fn: testSessionAPI },
        { name: 'Phone Number Formatting', fn: testPhoneNumberFormatting },
        { name: 'API Documentation', fn: testAPIDocs },
        { name: 'WebSocket Authentication', fn: testWebSocketAuth },
        { name: 'Redis Connection', fn: testRedisConnection },
        { name: 'No PostgreSQL Dependencies', fn: testNoPostgreSQL },
        { name: 'Pairing API Endpoint', fn: testPairingAPI }
    ];

    const results = [];

    for (const test of tests) {
        const passed = await test.fn();
        results.push({ name: test.name, passed });
        await sleep(500); // Small delay between tests
    }

    // Summary
    logSection('TEST SUMMARY');

    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;

    results.forEach(result => {
        const status = result.passed ?
            `${colors.green}✓ PASSED${colors.reset}` :
            `${colors.red}✗ FAILED${colors.reset}`;
        console.log(`${status} - ${result.name}`);
    });

    console.log('\n' + '='.repeat(60));
    if (passedCount === totalCount) {
        console.log(`${colors.green}ALL TESTS PASSED (${passedCount}/${totalCount})${colors.reset}`);
        console.log('='.repeat(60) + '\n');
        process.exit(0);
    } else {
        console.log(`${colors.red}SOME TESTS FAILED (${passedCount}/${totalCount})${colors.reset}`);
        console.log('='.repeat(60) + '\n');
        process.exit(1);
    }
}

// Run tests
runAllTests().catch(error => {
    console.error(`${colors.red}[FATAL] Test suite crashed: ${error.message}${colors.reset}`);
    console.error(error.stack);
    process.exit(1);
});
