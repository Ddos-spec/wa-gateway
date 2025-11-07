const { randomBytes } = require('crypto');
const { formatPhoneNumber } = require('./phone-utils');

class PhonePairing {
    constructor(sessions, sessionTokens, log) {
        this.sessions = sessions;
        this.sessionTokens = sessionTokens;
        this.log = log;
    }

    // Generate 8-character alphanumeric pairing code
    generatePairCode() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 8; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    async pairPhone(userId, phoneNumber) {
        // Format phone number to international format with +62 prefix
        const formattedPhoneNumber = formatPhoneNumber(phoneNumber);

        // Cek apakah kombinasi userId dan phoneNumber sudah ada dalam sessions
        for (let [sessionId, session] of this.sessions) {
            if (session.owner && session.phoneNumber && session.owner === userId && session.phoneNumber === formattedPhoneNumber) {
                throw new Error('Phone number already paired with this user');
            }
        }

        // Generate 8-character pairing code
        const pairCode = this.generatePairCode();
        const sessionId = `pair_${formattedPhoneNumber.replace(/\D/g, '')}_${Date.now()}`;

        // Simpan data pairing dalam sessions (seperti session biasa)
        this.sessions.set(sessionId, {
            sessionId: sessionId,
            phoneNumber: formattedPhoneNumber,
            owner: userId,
            status: 'PENDING_PAIR',
            detail: 'Awaiting phone confirmation',
            pairCode: pairCode,
            qr: null,
            createdAt: new Date().toISOString()
        });

        // Simpan juga token pairing
        this.sessionTokens.set(sessionId, pairCode);

        this.log(`Phone pairing created for ${formattedPhoneNumber}`, sessionId);

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

    // Method to validate an incoming message as a pairing code
    validateIncomingMessage(message, senderJid) {
        // Extract phone number from sender JID (format: 1234567890@s.whatsapp.net)
        const senderPhoneNumber = senderJid.split('@')[0];
        
        // Get the message text (for text messages)
        let messageText = '';
        if (message.message && message.message.conversation) {
            messageText = message.message.conversation;
        } else if (message.message && message.message.extendedTextMessage && message.message.extendedTextMessage.text) {
            messageText = message.message.extendedTextMessage.text;
        }

        // Trim and uppercase the message text for comparison
        messageText = messageText.trim().toUpperCase();

        // Check if the message text matches any pending pairing code
        for (let [sessionId, session] of this.sessions) {
            if (session.status === 'PENDING_PAIR' && 
                session.pairCode === messageText && 
                session.phoneNumber.endsWith(senderPhoneNumber)) {
                
                // Valid pairing code received
                this.log(`Valid pairing code received from ${senderJid} for session ${sessionId}`, sessionId);
                
                // Update session status to PAIRED
                session.status = 'PAIRED';
                session.detail = 'Phone number successfully paired';
                this.sessions.set(sessionId, session);

                return {
                    success: true,
                    sessionId: sessionId,
                    phoneNumber: session.phoneNumber,
                    owner: session.owner
                };
            }
        }

        return {
            success: false,
            message: 'Invalid or expired pairing code'
        };
    }

    getPairingByUserId(userId) {
        const pairings = [];
        for (let [sessionId, session] of this.sessions) {
            if (session.owner === userId && session.status && session.status.includes('PAIR')) {
                pairings.push({
                    sessionId: sessionId,
                    phoneNumber: `+${session.phoneNumber}`, // Display with + prefix
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