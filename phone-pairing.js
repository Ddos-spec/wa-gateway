const { randomBytes } = require('crypto');

class PhonePairing {
    constructor(sessions, sessionTokens, log) {
        this.sessions = sessions;
        this.sessionTokens = sessionTokens;
        this.log = log;
    }

    async pairPhone(userId, phoneNumber) {
        // Cek apakah kombinasi userId dan phoneNumber sudah ada dalam sessions
        for (let [sessionId, session] of this.sessions) {
            if (session.owner && session.phoneNumber && session.owner === userId && session.phoneNumber === phoneNumber) {
                throw new Error('Phone number already paired with this user');
            }
        }
        
        // Generate kode unik (dengan huruf kapital)
        const pairCode = randomBytes(4).toString('hex').toUpperCase();
        const sessionId = `pair_${phoneNumber.replace(/\D/g, '')}_${Date.now()}`;
        
        // Simpan data pairing dalam sessions (seperti session biasa)
        this.sessions.set(sessionId, {
            sessionId: sessionId,
            phoneNumber: phoneNumber,
            owner: userId,
            status: 'PENDING_PAIR',
            detail: 'Awaiting phone confirmation',
            pairCode: pairCode,
            qr: null,
            createdAt: new Date().toISOString()
        });
        
        // Simpan juga token pairing
        this.sessionTokens.set(sessionId, pairCode);
        
        this.log(`Phone pairing created for ${phoneNumber}`, sessionId);
        
        return { pairCode, sessionId };
    }
    
    validatePairCode(pairCode) {
        // Cari session berdasarkan pairCode
        for (let [sessionId, session] of this.sessions) {
            if (session.pairCode === pairCode && session.status === 'PENDING_PAIR') {
                return { sessionId, phoneNumber: session.phoneNumber, owner: session.owner };
            }
        }
        
        return null;
    }
    
    getPairingByUserId(userId) {
        const pairings = [];
        for (let [sessionId, session] of this.sessions) {
            if (session.owner === userId && session.status && session.status.includes('PAIR')) {
                pairings.push({
                    sessionId: sessionId,
                    phoneNumber: session.phoneNumber,
                    status: session.status,
                    detail: session.detail,
                    createdAt: session.createdAt
                });
            }
        }
        return pairings;
    }
}

module.exports = PhonePairing;