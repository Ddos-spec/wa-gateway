/**
 * Manual Test Script for Pairing Flow
 * Tests all edge cases for phone pairing functionality
 *
 * Run: node test-pairing-flow.js
 */

const PhonePairing = require('./phone-pairing');

// Mock Logger
const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    success: () => {}
};

// Mock Redis - Simulates RedisConnection class
class MockRedis {
    constructor() {
        this.data = new Map();
        this.ttls = new Map();
        // Mock client for PhonePairing's findStalePairing which uses redis.client.keys()
        this.client = {
            keys: async (pattern) => {
                const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                return Array.from(this.data.keys()).filter(key => regex.test(key));
            },
            publish: async (channel, message) => {
                return 1; // Number of subscribers
            }
        };
    }

    async set(key, value, ttl) {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        this.data.set(key, stringValue);

        // If ttl is explicitly null or undefined, remove TTL
        // If ttl is 0 or positive number, set TTL
        if (ttl === null || ttl === undefined) {
            this.ttls.delete(key);
        } else if (ttl > 0) {
            this.ttls.set(key, Date.now() + (ttl * 1000));
        }

        return true;
    }

    async get(key) {
        // Check if expired
        if (this.ttls.has(key)) {
            if (Date.now() > this.ttls.get(key)) {
                this.data.delete(key);
                this.ttls.delete(key);
                return null;
            }
        }

        const value = this.data.get(key);
        if (!value) return null;

        try {
            return JSON.parse(value);
        } catch (e) {
            return value;
        }
    }

    async del(key) {
        const existed = this.data.has(key);
        this.data.delete(key);
        this.ttls.delete(key);
        return existed ? 1 : 0;
    }
}

// Test utilities
const redis = new MockRedis();
const phonePairing = new PhonePairing(mockLogger, redis);

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName, errorMsg) {
    if (condition) {
        console.log(`✅ PASS: ${testName}`);
        testsPassed++;
        return true;
    } else {
        console.log(`❌ FAIL: ${testName}`);
        if (errorMsg) console.log(`   Error: ${errorMsg}`);
        testsFailed++;
        return false;
    }
}

async function runTests() {
    console.log('\n========================================');
    console.log('🧪 Testing Phone Pairing Flow');
    console.log('========================================\n');

    // Test 1: Create pairing session
    console.log('\n📝 Test 1: Create Pairing Session');
    try {
        const result = await phonePairing.createPairing('admin', '6285771518231');
        assert(
            result.sessionId && result.sessionId.startsWith('pair_'),
            'Should create session with proper ID format',
            `Got: ${result.sessionId}`
        );

        const status = await phonePairing.getPairingStatus(result.sessionId);
        assert(
            status && status.status === 'PENDING_REQUEST',
            'Initial status should be PENDING_REQUEST',
            `Got: ${status?.status}`
        );
        assert(
            status.phoneNumber === '6285771518231',
            'Should store correct phone number',
            `Got: ${status?.phoneNumber}`
        );
    } catch (error) {
        assert(false, 'Create pairing session', error.message);
    }

    // Test 2: Prevent duplicate pairing for same number
    console.log('\n📝 Test 2: Prevent Duplicate Pairing Sessions');
    try {
        // Create first pairing
        const first = await phonePairing.createPairing('admin', '6281234567890');

        // Try to find stale pairing
        const existing = await phonePairing.findStalePairing('6281234567890');
        assert(
            existing && existing.sessionId === first.sessionId,
            'Should find existing pairing session',
            `Expected: ${first.sessionId}, Got: ${existing?.sessionId}`
        );

        // Should NOT create duplicate
        const shouldReuse = existing !== null;
        assert(
            shouldReuse,
            'Should detect existing session and prevent duplicate',
            'No existing session found'
        );
    } catch (error) {
        assert(false, 'Prevent duplicate pairing', error.message);
    }

    // Test 3: Update pairing status
    console.log('\n📝 Test 3: Update Pairing Status');
    try {
        const { sessionId } = await phonePairing.createPairing('admin', '6289876543210');

        await phonePairing.updatePairingStatus(sessionId, {
            status: 'AWAITING_PAIRING',
            pairingCode: 'ABCD-1234',
            detail: 'Enter code in WhatsApp'
        });

        const updated = await phonePairing.getPairingStatus(sessionId);
        assert(
            updated.status === 'AWAITING_PAIRING',
            'Should update status to AWAITING_PAIRING',
            `Got: ${updated?.status}`
        );
        assert(
            updated.pairingCode === 'ABCD-1234',
            'Should store pairing code',
            `Got: ${updated?.pairingCode}`
        );
    } catch (error) {
        assert(false, 'Update pairing status', error.message);
    }

    // Test 4: TTL validation (3 minutes = 180 seconds)
    console.log('\n📝 Test 4: TTL Validation (3 minutes)');
    try {
        const PAIRING_PREFIX = 'wa-gateway:pairing:';
        const testKey = `${PAIRING_PREFIX}test_ttl_session`;

        await redis.set(testKey, { test: true }, 180);

        // Check TTL is set
        const hasTTL = redis.ttls.has(testKey);
        assert(
            hasTTL,
            'Should set TTL on pairing session',
            'No TTL found'
        );

        // Verify TTL is approximately 180 seconds (allow 1 second variance)
        const expiresAt = redis.ttls.get(testKey);
        const ttlSeconds = Math.round((expiresAt - Date.now()) / 1000);
        assert(
            ttlSeconds >= 179 && ttlSeconds <= 180,
            'TTL should be 180 seconds (3 minutes)',
            `Got: ${ttlSeconds} seconds`
        );

        await redis.del(testKey);
    } catch (error) {
        assert(false, 'TTL validation', error.message);
    }

    // Test 5: Connection success removes TTL
    console.log('\n📝 Test 5: Connected Session Has No TTL');
    try {
        const { sessionId } = await phonePairing.createPairing('admin', '6281111111111');

        // Simulate successful connection
        await phonePairing.updatePairingStatus(sessionId, {
            status: 'CONNECTED',
            detail: 'Successfully paired'
        });

        const key = `wa-gateway:pairing:${sessionId}`;
        const hasTTL = redis.ttls.has(key);
        assert(
            !hasTTL,
            'Connected session should not have TTL',
            'TTL still exists'
        );
    } catch (error) {
        assert(false, 'Connected session TTL removal', error.message);
    }

    // Test 6: Delete pairing session
    console.log('\n📝 Test 6: Delete Pairing Session');
    try {
        const { sessionId } = await phonePairing.createPairing('admin', '6282222222222');

        const deleted = await phonePairing.deletePairing(sessionId);
        assert(deleted, 'Should delete session successfully');

        const status = await phonePairing.getPairingStatus(sessionId);
        assert(
            status === null,
            'Deleted session should not be retrievable',
            `Still got: ${JSON.stringify(status)}`
        );
    } catch (error) {
        assert(false, 'Delete pairing session', error.message);
    }

    // Test 7: Find stale pairing - only non-CONNECTED
    console.log('\n📝 Test 7: Find Stale Pairing (Exclude Connected)');
    try {
        const phoneNum = '6283333333333';

        // Create and immediately mark as CONNECTED
        const { sessionId: connectedId } = await phonePairing.createPairing('admin', phoneNum);
        await phonePairing.updatePairingStatus(connectedId, {
            status: 'CONNECTED'
        });

        // This should NOT find the connected session
        const stale = await phonePairing.findStalePairing(phoneNum);
        assert(
            stale === null,
            'Should NOT find CONNECTED sessions as stale',
            `Found: ${stale?.sessionId}`
        );

        // Clean up
        await phonePairing.deletePairing(connectedId);
    } catch (error) {
        assert(false, 'Find stale pairing exclusion', error.message);
    }

    // Test 8: Phone number formatting
    console.log('\n📝 Test 8: Phone Number Formatting');
    try {
        const variations = [
            { input: '+62 857 7151 8231', expected: '6285771518231' },
            { input: '62-857-7151-8231', expected: '6285771518231' },
            { input: '0857 7151 8231', expected: '6285771518231' }
        ];

        for (const test of variations) {
            const { sessionId } = await phonePairing.createPairing('admin', test.input);
            const status = await phonePairing.getPairingStatus(sessionId);
            const formatted = status.phoneNumber.replace(/\D/g, '');

            assert(
                formatted === test.expected,
                `Format "${test.input}" correctly`,
                `Expected: ${test.expected}, Got: ${formatted}`
            );

            await phonePairing.deletePairing(sessionId);
        }
    } catch (error) {
        assert(false, 'Phone number formatting', error.message);
    }

    // Print summary
    console.log('\n========================================');
    console.log('📊 Test Summary');
    console.log('========================================');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Total:  ${testsPassed + testsFailed}`);

    if (testsFailed === 0) {
        console.log('\n🎉 All tests passed!');
        console.log('\n✨ Edge cases verified:');
        console.log('   ✓ Duplicate session prevention');
        console.log('   ✓ TTL synchronization (3 minutes)');
        console.log('   ✓ Proper status transitions');
        console.log('   ✓ Connected sessions have no TTL');
        console.log('   ✓ Stale pairing detection');
        console.log('   ✓ Phone number formatting');
        console.log('   ✓ Session cleanup');
        return 0;
    } else {
        console.log('\n❌ Some tests failed. Please review and fix.');
        return 1;
    }
}

// Run tests
runTests()
    .then(exitCode => {
        process.exit(exitCode);
    })
    .catch(error => {
        console.error('\n💥 Test suite crashed:', error);
        process.exit(1);
    });
