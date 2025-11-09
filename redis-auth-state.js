const redis = require('redis');
const { Buffer } = require('buffer');

class RedisAuthState {
  constructor(redisClient, sessionId) {
    this.redis = redisClient;
    this.sessionId = sessionId;
  }

  async getAuthState() {
    const credsKey = `whatsapp:auth:creds:${this.sessionId}`;
    const keysKey = `whatsapp:auth:keys:${this.sessionId}`;
    
    // Get credentials
    const credsData = await this.redis.get(credsKey);
    const creds = credsData ? JSON.parse(credsData) : {};
    
    // Convert Buffer objects back from plain objects after JSON.parse
    if (creds.noiseKey && typeof creds.noiseKey.public === 'object' && creds.noiseKey.public.type === 'Buffer') {
        creds.noiseKey.public = Buffer.from(creds.noiseKey.public.data);
    }
    if (creds.noiseKey && typeof creds.noiseKey.private === 'object' && creds.noiseKey.private.type === 'Buffer') {
        creds.noiseKey.private = Buffer.from(creds.noiseKey.private.data);
    }
    
    // Get keys
    const keysData = await this.redis.hGetAll(keysKey);
    const keys = keysData || {};

    return {
      creds,
      keys: {
        get: async (type, ids) => {
          const keys = {};
          for (const id of ids) {
            const key = `${type}:${id}`;
            const value = await this.redis.hGet(keysKey, key);
            if (value) {
              try {
                keys[id] = JSON.parse(value);
              } catch (e) {
                // If JSON parsing fails, treat as binary data
                keys[id] = Buffer.from(value, 'base64');
              }
            }
          }
          return keys;
        },
        set: async (data) => {
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              const key = `${type}:${id}`;
              const serializedValue = Buffer.isBuffer(value) 
                ? value.toString('base64') 
                : JSON.stringify(value);
              await this.redis.hSet(keysKey, key, serializedValue);
            }
          }
        }
      }
    };
  }

  async saveCreds(creds) {
    const credsKey = `whatsapp:auth:creds:${this.sessionId}`;
    await this.redis.setEx(credsKey, 86400 * 7, JSON.stringify(creds)); // 7 days TTL
  }

  static async createAuthState(redisClient, sessionId) {
    const authState = new RedisAuthState(redisClient, sessionId);
    try {
      return await authState.getAuthState();
    } catch (error) {
      console.error(`Failed to create auth state for session ${sessionId}:`, error.message);
      // Return a default auth state to allow connection to proceed
      return {
        creds: {},
        keys: {
          get: async (type, ids) => {
            console.warn(`Redis auth keys get failed for ${type}, returning empty:`, error.message);
            return {};
          },
          set: async (data) => {
            console.warn(`Redis auth keys set failed, data not saved:`, error.message);
          }
        }
      };
    }
  }
}

module.exports = RedisAuthState;