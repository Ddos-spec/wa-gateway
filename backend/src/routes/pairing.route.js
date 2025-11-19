const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const BaileysPairingService = require('../services/baileys-pairing.service');
const RedisService = require('../services/redis.service');
const apiKeyMiddleware = require('../middleware/apiKey.middleware');
const logger = require('../utils/logger');

const router = express.Router();

router.use(apiKeyMiddleware);

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

router.post(
  '/start/:sessionId',
  [
    param('sessionId').isString().notEmpty().withMessage('sessionId is required'),
    body('phoneNumber')
      .isString()
      .notEmpty()
      .withMessage('phoneNumber is required')
      .matches(/^62\d{8,13}$/)
      .withMessage('Phone number must start with 62 and be 10-15 digits'),
    body('webhookUrl').optional().isURL().withMessage('Invalid webhook URL'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { phoneNumber, webhookUrl } = req.body;

      logger.info(`Starting pairing session: ${sessionId} for ${phoneNumber}`);

      const result = await BaileysPairingService.startWithPairingCode(
        sessionId,
        phoneNumber,
        webhookUrl
      );

      res.status(200).json({
        success: true,
        sessionId: result.sessionId,
        phoneNumber: result.phoneNumber,
        pairingCode: result.pairingCode,
        status: result.status,
        expiresIn: result.expiresIn,
      });
    } catch (error) {
      logger.error(`Error starting pairing session: ${error.message}`);

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          error: 'Session already exists',
          message: error.message,
        });
      }

      if (error.message.includes('Phone number')) {
        return res.status(400).json({
          error: 'Invalid phone number',
          message: error.message,
        });
      }

      res.status(500).json({
        error: 'Failed to start pairing session',
        message: error.message,
      });
    }
  }
);

router.get(
  '/status/:sessionId',
  [param('sessionId').isString().notEmpty().withMessage('sessionId is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = await RedisService.getSession(sessionId);

      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          message: `Session ${sessionId} does not exist`,
        });
      }

      const socketStatus = BaileysPairingService.getSessionStatus(sessionId);

      res.status(200).json({
        sessionId: session.sessionId,
        phoneNumber: session.phoneNumber,
        status: session.status,
        authType: session.authType,
        lastActivity: session.lastActivity,
        connected: socketStatus.connected,
        createdAt: session.createdAt,
        pairingCode: session.pairingCode,
      });
    } catch (error) {
      logger.error(`Error getting session status: ${error.message}`);
      res.status(500).json({
        error: 'Failed to get session status',
        message: error.message,
      });
    }
  }
);

router.post(
  '/send/:sessionId',
  [
    param('sessionId').isString().notEmpty().withMessage('sessionId is required'),
    body('to')
      .isString()
      .notEmpty()
      .withMessage('Recipient phone number is required'),
    body('message').isString().notEmpty().withMessage('Message is required'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { to, message } = req.body;

      const session = await RedisService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          message: `Session ${sessionId} does not exist`,
        });
      }

      if (session.status !== 'connected') {
        return res.status(400).json({
          error: 'Session not connected',
          message: `Session ${sessionId} is not connected. Current status: ${session.status}`,
        });
      }

      const result = await BaileysPairingService.sendMessage(sessionId, to, message);

      res.status(200).json({
        success: true,
        messageId: result.messageId,
        timestamp: result.timestamp,
      });
    } catch (error) {
      logger.error(`Error sending message: ${error.message}`);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Session not found',
          message: error.message,
        });
      }

      res.status(500).json({
        error: 'Failed to send message',
        message: error.message,
      });
    }
  }
);

router.post(
  '/send-bulk/:sessionId',
  [
    param('sessionId').isString().notEmpty().withMessage('sessionId is required'),
    body('recipients')
      .isArray({ min: 1 })
      .withMessage('Recipients must be a non-empty array'),
    body('message').isString().notEmpty().withMessage('Message is required'),
    body('delay').optional().isInt({ min: 0 }).withMessage('Delay must be a positive integer'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { recipients, message, delay = 1000 } = req.body;

      const session = await RedisService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          message: `Session ${sessionId} does not exist`,
        });
      }

      if (session.status !== 'connected') {
        return res.status(400).json({
          error: 'Session not connected',
          message: `Session ${sessionId} is not connected. Current status: ${session.status}`,
        });
      }

      const results = [];
      let sent = 0;
      let failed = 0;

      for (const recipient of recipients) {
        try {
          const result = await BaileysPairingService.sendMessage(sessionId, recipient, message);
          results.push({
            recipient,
            success: true,
            messageId: result.messageId,
          });
          sent++;

          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } catch (error) {
          results.push({
            recipient,
            success: false,
            error: error.message,
          });
          failed++;
        }
      }

      res.status(200).json({
        success: true,
        sent,
        failed,
        total: recipients.length,
        results,
      });
    } catch (error) {
      logger.error(`Error sending bulk messages: ${error.message}`);
      res.status(500).json({
        error: 'Failed to send bulk messages',
        message: error.message,
      });
    }
  }
);

router.delete(
  '/session/:sessionId',
  [param('sessionId').isString().notEmpty().withMessage('sessionId is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = await RedisService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          message: `Session ${sessionId} does not exist`,
        });
      }

      await BaileysPairingService.deleteSession(sessionId);

      res.status(200).json({
        success: true,
        message: `Session ${sessionId} deleted successfully`,
      });
    } catch (error) {
      logger.error(`Error deleting session: ${error.message}`);
      res.status(500).json({
        error: 'Failed to delete session',
        message: error.message,
      });
    }
  }
);

router.get(
  '/sessions',
  [
    query('status').optional().isString().withMessage('Status must be a string'),
    query('authType').optional().isString().withMessage('authType must be a string'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { status, authType } = req.query;

      let sessions = await BaileysPairingService.getAllSessions();

      if (status) {
        sessions = sessions.filter(session => session.status === status);
      }

      if (authType) {
        sessions = sessions.filter(session => session.authType === authType);
      }

      res.status(200).json({
        sessions,
        total: sessions.length,
      });
    } catch (error) {
      logger.error(`Error getting sessions: ${error.message}`);
      res.status(500).json({
        error: 'Failed to get sessions',
        message: error.message,
      });
    }
  }
);

router.post(
  '/restart/:sessionId',
  [param('sessionId').isString().notEmpty().withMessage('sessionId is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = await RedisService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          message: `Session ${sessionId} does not exist`,
        });
      }

      BaileysPairingService.sessions.delete(sessionId);

      await RedisService.updateSessionStatus(sessionId, 'restarting');

      const path = require('path');
      const sessionDir = path.join(
        process.env.SESSION_PATH || './session',
        sessionId
      );

      const { useMultiFileAuthState, default: makeWASocket, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
      const pino = require('pino');

      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['WhatsApp Gateway', 'Chrome', '1.0.0'],
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        await BaileysPairingService.handleConnectionUpdate(sessionId, sock, update);
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        await BaileysPairingService.handleMessages(sessionId, messages, type);
      });

      BaileysPairingService.sessions.set(sessionId, {
        socket: sock,
        authType: session.authType,
      });

      res.status(200).json({
        success: true,
        message: `Session ${sessionId} restarted successfully`,
      });
    } catch (error) {
      logger.error(`Error restarting session: ${error.message}`);
      res.status(500).json({
        error: 'Failed to restart session',
        message: error.message,
      });
    }
  }
);

router.get('/health', async (req, res) => {
  try {
    const redisPing = await RedisService.ping();
    const redisStatus = RedisService.getConnectionStatus();
    const sessions = await BaileysPairingService.getAllSessions();
    const connectedSessions = sessions.filter(s => s.status === 'connected');

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      redis: {
        connected: redisStatus.connected,
        ping: redisPing,
      },
      sessions: {
        total: sessions.length,
        connected: connectedSessions.length,
        disconnected: sessions.length - connectedSessions.length,
      },
      uptime: process.uptime(),
    });
  } catch (error) {
    logger.error(`Health check error: ${error.message}`);
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

module.exports = router;
