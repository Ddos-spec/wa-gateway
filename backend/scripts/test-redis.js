require('dotenv').config();
const Redis = require('ioredis');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

async function testRedis() {
  console.log(colors.blue + '===== Redis Connection Test =====' + colors.reset + '\n');

  const config = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  };

  console.log(colors.yellow + 'Configuration:' + colors.reset);
  console.log('  Host: ' + config.host);
  console.log('  Port: ' + config.port);
  console.log('  Password: ' + (config.password ? '***' : 'none') + '\n');

  const client = new Redis(config);

  try {
    console.log(colors.yellow + 'Test 1: Ping' + colors.reset);
    const pingResult = await client.ping();
    console.log(colors.green + '✓ Ping successful: ' + pingResult + colors.reset + '\n');

    console.log(colors.yellow + 'Test 2: Set' + colors.reset);
    await client.set('test:key', 'test-value');
    console.log(colors.green + '✓ Set successful' + colors.reset + '\n');

    console.log(colors.yellow + 'Test 3: Get' + colors.reset);
    const value = await client.get('test:key');
    console.log(colors.green + '✓ Get successful: ' + value + colors.reset + '\n');

    console.log(colors.yellow + 'Test 4: Delete' + colors.reset);
    await client.del('test:key');
    console.log(colors.green + '✓ Delete successful' + colors.reset + '\n');

    console.log(colors.yellow + 'Test 5: Hash operations' + colors.reset);
    await client.hset('test:hash', { field1: 'value1', field2: 'value2' });
    const hashData = await client.hgetall('test:hash');
    console.log(colors.green + '✓ Hash set/get successful:' + colors.reset, hashData);
    await client.del('test:hash');
    console.log(colors.green + '✓ Hash deleted' + colors.reset + '\n');

    console.log(colors.green + '===== All tests passed! =====' + colors.reset);
    await client.quit();
    process.exit(0);
  } catch (error) {
    console.error(colors.red + '✗ Test failed: ' + error.message + colors.reset);
    await client.quit();
    process.exit(1);
  }
}

testRedis();
