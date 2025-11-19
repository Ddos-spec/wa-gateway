const { formatPhoneNumber } = require('./phone-utils');

const PAIRING_PREFIX = 'wa-gateway:pairing:';
const PAIRING_CHANNEL_PREFIX = 'wa-gateway:pairing-updates:';
const PAIRING_TTL = 900; // 15 menit

class PhonePairing {
    constructor(logger, redis) {
        if (!redis || !redis.client) {
            throw new Error('Redis client is required for PhonePairing service.');
        }
        this.log = logger;
        this.redis = redis;
        // Use the same client for publish since it's already connected
        this.publisher = redis.client;
    }

    _getKey(sessionId) {
        return `${PAIRING_PREFIX}${sessionId}`;
    }

    _getChannel(sessionId) {
        return `${PAIRING_CHANNEL_PREFIX}${sessionId}`;
    }

    /**
     * Membuat permintaan pairing baru dan menyimpannya di Redis.
     * @param {string} userId - ID pengguna yang membuat permintaan.
     * @param {string} phoneNumber - Nomor telepon untuk pairing.
     * @returns {Object} Objek berisi sessionId.
     */
    async createPairing(userId, phoneNumber) {
        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
        const sessionId = `pair_${formattedPhoneNumber.replace(/\D/g, '')}_${Date.now()}`;
        const key = this._getKey(sessionId);

        const newPairing = {
            sessionId: sessionId,
            phoneNumber: formattedPhoneNumber,
            owner: userId,
            status: 'PENDING_REQUEST',
            detail: 'Awaiting Baileys connection to request pairing code.',
            pairingCode: null,
            qr: null,
            createdAt: new Date().toISOString()
        };

        await this.redis.set(key, newPairing, PAIRING_TTL);
        this.log.info(`Phone pairing created for ${formattedPhoneNumber}`, 'PAIRING', { sessionId });

        return { sessionId };
    }

    /**
     * Memperbarui status pairing di Redis dan mempublikasikan perubahan.
     * @param {string} sessionId - ID sesi pairing.
     * @param {Object} updates - Perubahan yang akan diterapkan.
     */
    async updatePairingStatus(sessionId, updates) {
        const key = this._getKey(sessionId);
        const currentStatus = await this.redis.get(key);

        if (!currentStatus) {
            this.log.warn(`Attempted to update non-existent pairing session: ${sessionId}`, 'PAIRING');
            return;
        }

        const updatedStatus = {
            ...currentStatus,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        // Jika terhubung, buat sesi permanen (hapus TTL)
        const ttl = updatedStatus.status === 'CONNECTED' ? null : PAIRING_TTL;
        await this.redis.set(key, updatedStatus, ttl);

        // Publikasikan pembaruan ke channel Redis
        try {
            await this.publisher.publish(this._getChannel(sessionId), JSON.stringify(updatedStatus));
        } catch (error) {
            this.log.error('Redis publish error', 'PAIRING', { sessionId, error: error.message });
        }

        this.log.info(`Pairing status updated for ${sessionId}: ${updatedStatus.status}`, 'PAIRING');
    }

    /**
     * Mendapatkan status pairing dari Redis.
     * @param {string} sessionId - ID sesi pairing.
     * @returns {Promise<Object|null>} Status pairing atau null jika tidak ditemukan.
     */
    async getPairingStatus(sessionId) {
        return await this.redis.get(this._getKey(sessionId));
    }

    /**
     * Menemukan sesi pairing yang masih aktif (belum CONNECTED) berdasarkan nomor telepon.
     * @param {string} phoneNumber - Nomor telepon yang dicari.
     * @returns {Promise<Object|null>} Status pairing atau null.
     */
    async findStalePairing(phoneNumber) {
        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
        const pattern = `${PAIRING_PREFIX}pair_${formattedPhoneNumber.replace(/\D/g, '')}_*`;
        const keys = await this.redis.client.keys(pattern);

        for (const key of keys) {
            const status = await this.redis.get(key);
            if (status && status.status !== 'CONNECTED') {
                return status;
            }
        }
        return null;
    }

    /**
     * Menghapus data pairing dari Redis.
     * @param {string} sessionId - ID sesi pairing.
     * @returns {Promise<boolean>} True jika berhasil dihapus.
     */
    async deletePairing(sessionId) {
        const result = await this.redis.del(this._getKey(sessionId));
        if (result) {
            this.log.info(`Pairing data for session ${sessionId} has been deleted.`, 'PAIRING');
        }
        return result > 0;
    }
}

module.exports = PhonePairing;
