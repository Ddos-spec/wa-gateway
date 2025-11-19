const fetch = require('node-fetch');
const { default: PQueue } = require('p-queue');
const RedisService = require('./redis.service');
const logger = require('../utils/logger');

class WebhookService {
  constructor() {
    this.queue = new PQueue({ concurrency: 5 });
    this.timeout = 5000;
    this.maxRetries = 3;
  }

  async sendWebhook(url, payload, retries = 0) {
    try {
      if (!url) {
        logger.warn('No webhook URL provided, skipping');
        return false;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'WhatsApp-Gateway/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        logger.info(`Webhook sent successfully to ${url}`);
        return true;
      } else {
        logger.warn(`Webhook failed with status ${response.status}: ${url}`);

        if (retries < this.maxRetries) {
          const delay = Math.pow(2, retries) * 1000;
          logger.info(`Retrying webhook in ${delay}ms (attempt ${retries + 1}/${this.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return await this.sendWebhook(url, payload, retries + 1);
        }

        return false;
      }
    } catch (error) {
      logger.error(`Webhook error: ${error.message}`);

      if (retries < this.maxRetries && error.name !== 'AbortError') {
        const delay = Math.pow(2, retries) * 1000;
        logger.info(`Retrying webhook in ${delay}ms (attempt ${retries + 1}/${this.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return await this.sendWebhook(url, payload, retries + 1);
      }

      return false;
    }
  }

  async getWebhookUrl(sessionId) {
    try {
      const session = await RedisService.getSession(sessionId);
      return session?.webhookUrl || process.env.BASE_WEBHOOK_URL;
    } catch (error) {
      logger.error(`Error getting webhook URL for ${sessionId}:`, error.message);
      return process.env.BASE_WEBHOOK_URL;
    }
  }

  async sendMessage(sessionId, messageData) {
    try {
      const webhookUrl = await this.getWebhookUrl(sessionId);

      const payload = {
        event: 'message',
        sessionId,
        timestamp: new Date().toISOString(),
        data: messageData,
      };

      this.queue.add(() => this.sendWebhook(webhookUrl, payload));

      return true;
    } catch (error) {
      logger.error(`Error sending message webhook for ${sessionId}:`, error.message);
      return false;
    }
  }

  async sendStatus(sessionId, statusData) {
    try {
      const webhookUrl = await this.getWebhookUrl(sessionId);

      const payload = {
        event: 'status',
        sessionId,
        timestamp: new Date().toISOString(),
        data: statusData,
      };

      this.queue.add(() => this.sendWebhook(webhookUrl, payload));

      return true;
    } catch (error) {
      logger.error(`Error sending status webhook for ${sessionId}:`, error.message);
      return false;
    }
  }

  async sendPairingCode(sessionId, codeData) {
    try {
      const webhookUrl = await this.getWebhookUrl(sessionId);

      const payload = {
        event: 'pairing_code',
        sessionId,
        timestamp: new Date().toISOString(),
        data: codeData,
      };

      this.queue.add(() => this.sendWebhook(webhookUrl, payload));

      return true;
    } catch (error) {
      logger.error(`Error sending pairing code webhook for ${sessionId}:`, error.message);
      return false;
    }
  }

  async sendError(sessionId, errorData) {
    try {
      const webhookUrl = await this.getWebhookUrl(sessionId);

      const payload = {
        event: 'error',
        sessionId,
        timestamp: new Date().toISOString(),
        data: errorData,
      };

      this.queue.add(() => this.sendWebhook(webhookUrl, payload));

      return true;
    } catch (error) {
      logger.error(`Error sending error webhook for ${sessionId}:`, error.message);
      return false;
    }
  }

  getQueueStatus() {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
    };
  }
}

module.exports = new WebhookService();
