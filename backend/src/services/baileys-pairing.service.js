const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;
const RedisService = require('./redis.service');
const WebhookService = require('./webhook.service');
const logger = require('../utils/logger');

class BaileysPairingService extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.sessionPath = process.env.SESSION_PATH || './session';
  }

  validatePhoneNumber(phoneNumber) {
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    if (!cleanPhone.startsWith('62')) {
      throw new Error('Phone number must start with 62 (Indonesia)');
    }

    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      throw new Error('Invalid phone number length');
    }

    return cleanPhone;
  }

  async startWithPairingCode(sessionId, phoneNumber, webhookUrl = null) {
    try {
      const validatedPhone = this.validatePhoneNumber(phoneNumber);

      const existingSession = await RedisService.getSession(sessionId);
      if (existingSession && existingSession.status === 'connected') {
        throw new Error('Session already exists and is connected');
      }

      const sessionDir = path.join(this.sessionPath, sessionId);
      await fs.mkdir(sessionDir, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['WhatsApp Gateway', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: true,
      });

      let pairingCode = null;

      if (!sock.authState.creds.registered) {
        pairingCode = await sock.requestPairingCode(validatedPhone);
        logger.info(`Pairing code generated for ${sessionId}: ${pairingCode}`);
      }

      const sessionData = {
        sessionId,
        phoneNumber: validatedPhone,
        authType: 'pairing',
        status: 'waiting_pairing',
        pairingCode: pairingCode,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        webhookUrl: webhookUrl || process.env.BASE_WEBHOOK_URL,
      };

      await RedisService.saveSession(sessionData);

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(sessionId, sock, update);
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        await this.handleMessages(sessionId, messages, type);
      });

      this.sessions.set(sessionId, {
        socket: sock,
        phoneNumber: validatedPhone,
        authType: 'pairing',
      });

      this.emit('pairing_code', {
        sessionId,
        phoneNumber: validatedPhone,
        pairingCode,
        expiresIn: 300,
      });

      if (webhookUrl || process.env.BASE_WEBHOOK_URL) {
        await WebhookService.sendPairingCode(sessionId, {
          phoneNumber: validatedPhone,
          pairingCode,
          expiresIn: 300,
        });
      }

      return {
        sessionId,
        phoneNumber: validatedPhone,
        pairingCode,
        status: 'waiting_pairing',
        expiresIn: 300,
      };
    } catch (error) {
      logger.error(`Error starting pairing session ${sessionId}:`, error.message);

      await RedisService.updateSessionStatus(sessionId, 'error', {
        error: error.message,
      });

      this.emit('pairing_error', {
        sessionId,
        error: error.message,
      });

      throw error;
    }
  }

  async handleConnectionUpdate(sessionId, sock, update) {
    const { connection, lastDisconnect, qr } = update;

    try {
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : false;

        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : null;

        logger.info(`Connection closed for ${sessionId}. Status: ${statusCode}, Reconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          await this.deleteSession(sessionId);

          this.emit('pairing_status', {
            sessionId,
            status: 'logged_out',
            message: 'Session logged out',
          });

          await WebhookService.sendStatus(sessionId, {
            status: 'logged_out',
            message: 'Session logged out',
          });
        } else if (statusCode === 428 || statusCode === 515) {
          await RedisService.updateSessionStatus(sessionId, 'disconnected', {
            error: 'Connection lost - Device may be blocked or rate limited',
          });

          this.emit('pairing_error', {
            sessionId,
            error: 'Connection lost',
            statusCode,
          });

          await WebhookService.sendStatus(sessionId, {
            status: 'error',
            error: 'Connection lost',
            statusCode,
          });

          this.sessions.delete(sessionId);
        } else if (shouldReconnect) {
          await RedisService.updateSessionStatus(sessionId, 'reconnecting');

          this.emit('pairing_status', {
            sessionId,
            status: 'reconnecting',
          });
        } else {
          await RedisService.updateSessionStatus(sessionId, 'disconnected');
          this.sessions.delete(sessionId);
        }
      } else if (connection === 'open') {
        const phoneNumber = sock.user?.id?.split(':')[0] || 'unknown';

        await RedisService.updateSessionStatus(sessionId, 'connected', {
          phoneNumber,
          connectedAt: Date.now(),
        });

        logger.info(`Session ${sessionId} connected successfully`);

        this.emit('pairing_connected', {
          sessionId,
          phoneNumber,
          status: 'connected',
        });

        await WebhookService.sendStatus(sessionId, {
          status: 'connected',
          phoneNumber,
          message: 'Session connected successfully',
        });
      } else if (connection === 'connecting') {
        await RedisService.updateSessionStatus(sessionId, 'connecting');

        this.emit('pairing_status', {
          sessionId,
          status: 'connecting',
        });
      }
    } catch (error) {
      logger.error(`Error handling connection update for ${sessionId}:`, error.message);
    }
  }

  async handleMessages(sessionId, messages, type) {
    try {
      for (const message of messages) {
        if (!message.message) continue;

        const messageData = {
          key: message.key,
          messageTimestamp: message.messageTimestamp,
          pushName: message.pushName,
          message: message.message,
        };

        await RedisService.updateSessionStatus(sessionId, 'connected', {
          lastActivity: Date.now(),
        });

        this.emit('message_received', {
          sessionId,
          message: messageData,
        });

        await WebhookService.sendMessage(sessionId, messageData);

        logger.info(`Message received for ${sessionId} from ${message.key.remoteJid}`);
      }
    } catch (error) {
      logger.error(`Error handling messages for ${sessionId}:`, error.message);
    }
  }

  async sendMessage(sessionId, to, message) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found or not connected');
      }

      const { socket } = session;
      if (!socket) {
        throw new Error('Socket not available');
      }

      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

      const result = await socket.sendMessage(jid, { text: message });

      logger.info(`Message sent from ${sessionId} to ${jid}`);

      await RedisService.updateSessionStatus(sessionId, 'connected', {
        lastActivity: Date.now(),
      });

      return {
        success: true,
        messageId: result.key.id,
        timestamp: result.messageTimestamp,
      };
    } catch (error) {
      logger.error(`Error sending message from ${sessionId}:`, error.message);
      throw error;
    }
  }

  async sendMedia(sessionId, to, buffer, mimetype, caption = null) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found or not connected');
      }

      const { socket } = session;
      if (!socket) {
        throw new Error('Socket not available');
      }

      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

      let mediaType = 'document';
      if (mimetype.startsWith('image/')) mediaType = 'image';
      else if (mimetype.startsWith('video/')) mediaType = 'video';
      else if (mimetype.startsWith('audio/')) mediaType = 'audio';

      const messageContent = {
        [mediaType]: buffer,
        mimetype,
      };

      if (caption && (mediaType === 'image' || mediaType === 'video')) {
        messageContent.caption = caption;
      }

      const result = await socket.sendMessage(jid, messageContent);

      logger.info(`Media sent from ${sessionId} to ${jid}`);

      await RedisService.updateSessionStatus(sessionId, 'connected', {
        lastActivity: Date.now(),
      });

      return {
        success: true,
        messageId: result.key.id,
        timestamp: result.messageTimestamp,
      };
    } catch (error) {
      logger.error(`Error sending media from ${sessionId}:`, error.message);
      throw error;
    }
  }

  async deleteSession(sessionId) {
    try {
      const session = this.sessions.get(sessionId);

      if (session && session.socket) {
        try {
          await session.socket.logout();
        } catch (error) {
          logger.warn(`Error logging out session ${sessionId}:`, error.message);
        }
      }

      this.sessions.delete(sessionId);

      await RedisService.deleteSession(sessionId);

      const sessionDir = path.join(this.sessionPath, sessionId);
      try {
        await fs.rm(sessionDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn(`Error deleting session directory ${sessionId}:`, error.message);
      }

      logger.info(`Session ${sessionId} deleted successfully`);

      return true;
    } catch (error) {
      logger.error(`Error deleting session ${sessionId}:`, error.message);
      throw error;
    }
  }

  async getAllSessions() {
    try {
      const redisSessions = await RedisService.getAllSessions();

      const enrichedSessions = redisSessions.map(session => {
        const activeSession = this.sessions.get(session.sessionId);
        return {
          ...session,
          socketConnected: !!activeSession,
          socketStatus: activeSession ? 'active' : 'inactive',
        };
      });

      return enrichedSessions;
    } catch (error) {
      logger.error('Error getting all sessions:', error.message);
      throw error;
    }
  }

  async restoreSessions() {
    try {
      logger.info('Starting session restoration...');

      const sessionDir = this.sessionPath;
      let directories = [];

      try {
        const entries = await fs.readdir(sessionDir, { withFileTypes: true });
        directories = entries
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name);
      } catch (error) {
        logger.warn('Session directory not found, creating:', sessionDir);
        await fs.mkdir(sessionDir, { recursive: true });
        return { restored: 0, failed: 0 };
      }

      let restored = 0;
      let failed = 0;

      for (const sessionId of directories) {
        try {
          const sessionPath = path.join(sessionDir, sessionId);
          const credsPath = path.join(sessionPath, 'creds.json');

          try {
            await fs.access(credsPath);
          } catch {
            logger.warn(`No creds.json found for ${sessionId}, skipping`);
            continue;
          }

          const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
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
            await this.handleConnectionUpdate(sessionId, sock, update);
          });

          sock.ev.on('messages.upsert', async ({ messages, type }) => {
            await this.handleMessages(sessionId, messages, type);
          });

          this.sessions.set(sessionId, {
            socket: sock,
            authType: 'restored',
          });

          const existingSession = await RedisService.getSession(sessionId);
          if (!existingSession) {
            await RedisService.saveSession({
              sessionId,
              authType: 'restored',
              status: 'connecting',
              createdAt: Date.now(),
              lastActivity: Date.now(),
              webhookUrl: process.env.BASE_WEBHOOK_URL,
            });
          } else {
            await RedisService.updateSessionStatus(sessionId, 'connecting');
          }

          restored++;
          logger.info(`Session ${sessionId} restored successfully`);
        } catch (error) {
          failed++;
          logger.error(`Failed to restore session ${sessionId}:`, error.message);
        }
      }

      logger.info(`Session restoration completed. Restored: ${restored}, Failed: ${failed}`);
      return { restored, failed };
    } catch (error) {
      logger.error('Error in restoreSessions:', error.message);
      throw error;
    }
  }

  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    return {
      exists: !!session,
      connected: !!session,
    };
  }
}

module.exports = new BaileysPairingService();
