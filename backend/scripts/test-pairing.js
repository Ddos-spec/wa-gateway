require('dotenv').config();
const axios = require('axios');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'test123';
const TEST_SESSION_ID = 'TEST_' + Date.now();
const TEST_PHONE = process.env.TEST_PHONE || '6281234567890';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json',
  },
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPairing() {
  console.log(colors.blue + '===== Phone Pairing Test =====' + colors.reset + '\n');

  try {
    console.log(colors.yellow + 'Step 1: Starting pairing session' + colors.reset);
    console.log('  Session ID: ' + TEST_SESSION_ID);
    console.log('  Phone: ' + TEST_PHONE + '\n');

    const startResponse = await api.post('/api/pairing/start/' + TEST_SESSION_ID, {
      phoneNumber: TEST_PHONE,
    });

    const { pairingCode, status } = startResponse.data;

    console.log(colors.green + '✓ Pairing session started' + colors.reset);
    console.log(colors.cyan + '\n╔═══════════════════════════════════════╗' + colors.reset);
    console.log(colors.cyan + '║     PAIRING CODE: ' + pairingCode + '        ║' + colors.reset);
    console.log(colors.cyan + '╚═══════════════════════════════════════╝' + colors.reset);
    console.log('\n' + colors.yellow + 'Instructions:' + colors.reset);
    console.log('1. Open WhatsApp on your phone');
    console.log('2. Go to Settings > Linked Devices');
    console.log('3. Tap "Link a Device"');
    console.log('4. Tap "Link with phone number instead"');
    console.log('5. Enter this code: ' + colors.cyan + pairingCode + colors.reset);
    console.log('\nWaiting for connection (max 2 minutes)...\n');

    let connected = false;
    const maxAttempts = 60;
    let attempts = 0;

    while (!connected && attempts < maxAttempts) {
      attempts++;
      await sleep(2000);

      const statusResponse = await api.get('/api/pairing/status/' + TEST_SESSION_ID);
      const currentStatus = statusResponse.data.status;

      process.stdout.write('\r' + colors.yellow + 'Polling... Attempt ' + attempts + '/' + maxAttempts + ' - Status: ' + currentStatus + colors.reset + '      ');

      if (currentStatus === 'connected') {
        connected = true;
        console.log('\n' + colors.green + '✓ Session connected!' + colors.reset + '\n');
      } else if (currentStatus === 'error' || currentStatus === 'logged_out') {
        console.log('\n' + colors.red + '✗ Connection failed: ' + currentStatus + colors.reset);
        throw new Error('Connection failed');
      }
    }

    if (!connected) {
      console.log('\n' + colors.red + '✗ Connection timeout (2 minutes)' + colors.reset);
      throw new Error('Connection timeout');
    }

    console.log(colors.yellow + 'Step 2: Sending test message' + colors.reset);
    const testRecipient = TEST_PHONE;

    const sendResponse = await api.post('/api/pairing/send/' + TEST_SESSION_ID, {
      to: testRecipient,
      message: 'Test message from WhatsApp Gateway - Pairing successful!',
    });

    console.log(colors.green + '✓ Test message sent' + colors.reset);
    console.log('  Message ID: ' + sendResponse.data.messageId + '\n');

    console.log(colors.yellow + 'Step 3: Cleaning up' + colors.reset);
    await api.delete('/api/pairing/session/' + TEST_SESSION_ID);
    console.log(colors.green + '✓ Session deleted' + colors.reset + '\n');

    console.log(colors.green + '===== All tests passed! =====' + colors.reset);
    process.exit(0);
  } catch (error) {
    console.error('\n' + colors.red + '✗ Test failed: ' + (error.response?.data?.message || error.message) + colors.reset);

    try {
      await api.delete('/api/pairing/session/' + TEST_SESSION_ID);
      console.log(colors.yellow + 'Session cleaned up' + colors.reset);
    } catch (cleanupError) {
      console.error(colors.red + 'Cleanup failed' + colors.reset);
    }

    process.exit(1);
  }
}

testPairing();
