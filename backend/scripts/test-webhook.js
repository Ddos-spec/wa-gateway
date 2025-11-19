require('dotenv').config();
const http = require('http');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

const MOCK_PORT = 4000;
let receivedPayloads = [];

async function testWebhook() {
  console.log(colors.blue + '===== Webhook Delivery Test =====' + colors.reset + '\n');

  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      let body = '';

      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          receivedPayloads.push(payload);

          console.log(colors.green + '\n✓ Webhook received!' + colors.reset);
          console.log(colors.yellow + 'Payload:' + colors.reset);
          console.log(JSON.stringify(payload, null, 2));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error(colors.red + '✗ Failed to parse payload: ' + error.message + colors.reset);
          res.writeHead(400);
          res.end();
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(MOCK_PORT, () => {
    console.log(colors.yellow + 'Mock webhook server started on port ' + MOCK_PORT + colors.reset);
    console.log(colors.yellow + 'Webhook URL: http://localhost:' + MOCK_PORT + '/webhook' + colors.reset);
    console.log('\n' + colors.blue + 'Instructions:' + colors.reset);
    console.log('1. Update your .env file:');
    console.log('   BASE_WEBHOOK_URL=http://localhost:' + MOCK_PORT + '/webhook');
    console.log('2. Restart your backend server');
    console.log('3. Trigger an event (start pairing, send message, etc.)');
    console.log('4. Watch for webhook deliveries below\n');
    console.log(colors.green + 'Listening for webhooks... (Press Ctrl+C to exit)' + colors.reset + '\n');
  });

  setTimeout(() => {
    if (receivedPayloads.length === 0) {
      console.log(colors.yellow + '\nNo webhooks received yet. Make sure to:' + colors.reset);
      console.log('- Update BASE_WEBHOOK_URL in .env');
      console.log('- Restart backend server');
      console.log('- Trigger an event (pairing, message, etc.)');
    } else {
      console.log(colors.green + '\n===== Received ' + receivedPayloads.length + ' webhook(s) =====' + colors.reset);
    }
  }, 30000);

  process.on('SIGINT', () => {
    console.log('\n' + colors.yellow + 'Shutting down mock server...' + colors.reset);
    server.close(() => {
      console.log(colors.green + '\nReceived ' + receivedPayloads.length + ' total webhook(s)' + colors.reset);
      process.exit(0);
    });
  });
}

testWebhook();
