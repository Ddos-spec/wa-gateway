require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');

const RedisService = require('./services/redis.service');
const BaileysPairingService = require('./services/baileys-pairing.service');
const WebhookService = require('./services/webhook.service');
const setupPairingSocket = require('./websocket/pairing.socket');
const pairingRoutes = require('./routes/pairing.route');
const logger = require('./utils/logger');

const { maxAttachmentSize } = require('./config');
const { restoreSessions } = require('./sessions');
const { routes } = require('./routes');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

app.use(bodyParser.json({ limit: maxAttachmentSize + 1000000 }));
app.use(bodyParser.urlencoded({ limit: maxAttachmentSize + 1000000, extended: true }));

async function initialize() {
  try {
    logger.info('Initializing WhatsApp Gateway...');

    logger.info('Connecting to Redis...');
    await RedisService.connect();
    logger.info('Redis connected successfully');

    if (process.env.AUTO_RESTORE_SESSIONS !== 'false') {
      logger.info('Restoring existing sessions...');
      const result = await BaileysPairingService.restoreSessions();
      logger.info(`Sessions restored: ${result.restored}, Failed: ${result.failed}`);

      restoreSessions();
    }

    setupPairingSocket(io, BaileysPairingService);
    logger.info('WebSocket handlers initialized');

    logger.info('Initialization complete');
  } catch (error) {
    logger.error('Initialization error:', error.message);
    throw error;
  }
}

app.use('/api/pairing', pairingRoutes);

app.use('/', routes);

app.get('/health', async (req, res) => {
  try {
    const redisPing = await RedisService.ping();
    const redisStatus = RedisService.getConnectionStatus();

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      redis: {
        connected: redisStatus.connected,
        ping: redisPing,
      },
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: req.path,
  });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

async function gracefulShutdown(signal) {
  logger.info(`${signal} received, starting graceful shutdown...`);

  server.close(() => {
    logger.info('HTTP server closed');
  });

  try {
    const sessions = Array.from(BaileysPairingService.sessions.keys());
    logger.info(`Cleaning up ${sessions.length} active sessions...`);

    await RedisService.disconnect();
    logger.info('Redis disconnected');

    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

const PORT = process.env.PORT || 3000;

initialize()
  .then(() => {
    server.listen(PORT, () => {
      logger.info(`WhatsApp Gateway started on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API available at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

module.exports = { app, server, io };
