const Redis = require('ioredis');
const logger = require('../utils/logger');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async connect() {
    try {
      const config = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy: (times) => {
          if (times > this.maxReconnectAttempts) {
            logger.error('Redis: Max reconnection attempts reached');
            return null;
          }
          const delay = Math.min(times * 200, 2000);
          logger.info(`Redis: Reconnecting in ${delay}ms (attempt ${times})`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
      };

      this.client = new Redis(config);

      this.client.on('connect', () => {
        logger.info(`Redis: Connecting to ${config.host}:${config.port}`);
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        logger.info('Redis: Connected and ready');
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        logger.error('Redis error:', err.message);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis: Connection closed');
      });

      this.client.on('reconnecting', () => {
        this.reconnectAttempts++;
        logger.info('Redis: Reconnecting...');
      });

      await this.client.ping();
      logger.info('Redis: Connection test successful');

      return true;
    } catch (error) {
      logger.error('Redis: Connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        this.isConnected = false;
        logger.info('Redis: Disconnected gracefully');
      }
    } catch (error) {
      logger.error('Redis: Disconnect error:', error.message);
      if (this.client) {
        this.client.disconnect();
      }
    }
  }

  async saveSession(sessionData) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }

      const { sessionId } = sessionData;
      if (!sessionId) {
        throw new Error('sessionId is required');
      }

      const key = `wa:session:${sessionId}`;
      const data = {
        ...sessionData,
        updatedAt: Date.now(),
      };

      await this.client.hset(key, data);
      await this.client.sadd('wa:sessions', sessionId);

      logger.info(`Redis: Session saved - ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`Redis: Save session error - ${error.message}`);
      throw error;
    }
  }

  async getSession(sessionId) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }

      const key = `wa:session:${sessionId}`;
      const data = await this.client.hgetall(key);

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      return data;
    } catch (error) {
      logger.error(`Redis: Get session error - ${error.message}`);
      throw error;
    }
  }

  async getAllSessions() {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }

      const sessionIds = await this.client.smembers('wa:sessions');
      const sessions = [];

      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      logger.error(`Redis: Get all sessions error - ${error.message}`);
      throw error;
    }
  }

  async deleteSession(sessionId) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }

      const key = `wa:session:${sessionId}`;
      await this.client.del(key);
      await this.client.srem('wa:sessions', sessionId);

      logger.info(`Redis: Session deleted - ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(`Redis: Delete session error - ${error.message}`);
      throw error;
    }
  }

  async updateSessionStatus(sessionId, status, additionalData = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }

      const key = `wa:session:${sessionId}`;
      const updateData = {
        status,
        lastActivity: Date.now(),
        ...additionalData,
      };

      await this.client.hset(key, updateData);
      logger.info(`Redis: Session status updated - ${sessionId}: ${status}`);

      return true;
    } catch (error) {
      logger.error(`Redis: Update session status error - ${error.message}`);
      throw error;
    }
  }

  async getSessionsByStatus(status) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }

      const allSessions = await this.getAllSessions();
      return allSessions.filter(session => session.status === status);
    } catch (error) {
      logger.error(`Redis: Get sessions by status error - ${error.message}`);
      throw error;
    }
  }

  async ping() {
    try {
      if (!this.client) {
        return false;
      }
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

module.exports = new RedisService();
