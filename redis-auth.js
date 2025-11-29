const { BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');

/**
 * Redis Auth State for Baileys
 * Stores session data in Redis hash maps.
 * 
 * Key Structure:
 * - `wa:sess:{sessionId}` (Hash): Stores 'creds' and keys
 * 
 * @param {import('redis').RedisClientType} redisClient - The connected Redis client
 * @param {string} sessionId - The session ID
 */
const useRedisAuthState = async (redisClient, sessionId) => {
    const KEY_PREFIX = `wa:sess:${sessionId}:`;

    // Helper to get a specific key from Redis
    const readData = async (category) => {
        try {
            const data = await redisClient.get(KEY_PREFIX + category);
            return data ? JSON.parse(data, BufferJSON.reviver) : null;
        } catch (error) {
            console.error(`Error reading ${category} from Redis:`, error);
            return null;
        }
    };

    // Helper to set data to Redis
    const writeData = async (category, data) => {
        try {
            await redisClient.set(KEY_PREFIX + category, JSON.stringify(data, BufferJSON.replacer));
        } catch (error) {
            console.error(`Error writing ${category} to Redis:`, error);
        }
    };

    // Helper to delete data
    const removeData = async (category) => {
        try {
            await redisClient.del(KEY_PREFIX + category);
        } catch (error) {
            console.error(`Error deleting ${category} from Redis:`, error);
        }
    };

    // Initialize creds
    const credsData = await readData('creds');
    const creds = credsData || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        const value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            data[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
                        } else if (value) {
                            data[id] = value;
                        }
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                tasks.push(writeData(key, value));
                            } else {
                                tasks.push(removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => {
            return writeData('creds', creds);
        }
    };
};

module.exports = useRedisAuthState;