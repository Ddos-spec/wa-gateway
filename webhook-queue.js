const { Queue, Worker } = require('bullmq');
const redis = require('redis');
const axios = require('axios');

class WebhookQueue {
  constructor() {
    this.redisClient = redis.createClient({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD
    });
    
    this.webhookQueue = new Queue('webhookQueue', {
      connection: this.redisClient,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 500,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    });
    
    this.startWorker();
  }

  async startWorker() {
    this.worker = new Worker('webhookQueue', async (job) => {
      const { url, payload, sessionId } = job.data;
      
      try {
        await axios.post(url, payload, {
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'WhatsApp-Gateway-Webhook/1.0'
          },
          timeout: 10000 // 10 second timeout
        });
        
        console.log(`✅ Webhook sent successfully to ${url} for session ${sessionId}`);
        return { success: true, sessionId, url };
      } catch (error) {
        console.error(`❌ Failed to send webhook to ${url} for session ${sessionId}:`, error.message);
        throw error; // This will trigger retry logic
      }
    }, { 
      connection: this.redisClient,
      concurrency: 5 // Process up to 5 webhooks concurrently
    });

    this.worker.on('completed', (job) => {
      console.log(`✅ Webhook job ${job.id} completed for session ${job.data.sessionId}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Webhook job ${job.id} failed for session ${job.data.sessionId}:`, err.message);
    });
  }

  async addToQueue(sessionId, webhookUrl, payload) {
    if (!webhookUrl) {
      console.log(`⚠️ No webhook URL configured for session ${sessionId}, skipping queue`);
      return;
    }
    
    try {
      const job = await this.webhookQueue.add('webhook', {
        url: webhookUrl,
        payload,
        sessionId
      });
      
      console.log(`📤 Added webhook job to queue for session ${sessionId}, job ID: ${job.id}`);
      return job.id;
    } catch (error) {
      console.error(`❌ Failed to add job to webhook queue for session ${sessionId}:`, error.message);
      throw error;
    }
  }

  async getQueueStats() {
    const waiting = await this.webhookQueue.getWaitingCount();
    const active = await this.webhookQueue.getActiveCount();
    const completed = await this.webhookQueue.getCompletedCount();
    const failed = await this.webhookQueue.getFailedCount();
    
    return {
      waiting,
      active,
      completed,
      failed
    };
  }

  async close() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.webhookQueue) {
      await this.webhookQueue.close();
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

module.exports = WebhookQueue;