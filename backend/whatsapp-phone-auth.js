const { default: makeWASocket, useSingleFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

// Store for WhatsApp connections
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

/**
 * Function to connect to WhatsApp with phone number authentication (OTP)
 * @param {string} sessionId - Unique identifier for the session
 * @param {string} phoneNumber - Phone number with country code (e.g. 6281234567890)
 * @param {function} onOTP - Callback function to handle OTP request
 * @returns {Promise<Object>} - Returns the socket connection and state
 */
async function connectWithPhoneNumber(sessionId, phoneNumber, onOTP) {
  try {
    const authPath = path.join(__dirname, `./auth_info_${sessionId}`);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'debug' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['WhatsApp Gateway', 'Chrome', '1.0.0'],
      syncFullHistory: false,
    });

    store.bind(sock.ev);

    sock.ev.process(
      async (events) => {
        // Credentials updated
        if (events['creds.update']) {
          await saveCreds();
        }

        // Connection updated
        if (events['connection.update']) {
          const { connection, lastDisconnect, isNewLogin } = events['connection.update'];
          
          if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
          }
          
          if (connection === 'open') {
            console.log('WhatsApp connection opened for session:', sessionId);
            console.log('New login:', isNewLogin);
          }
        }

        // Handle authentication credentials
        if (events['creds.update']) {
          const authState = state;
          if (isNewLogin || !authState.creds.registered) {
            // Request phone code for registration
            if (phoneNumber) {
              try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`Pairing code for ${phoneNumber}: ${code}`);
                onOTP(code);
              } catch (err) {
                console.error('Error requesting pairing code:', err);
                throw err;
              }
            }
          }
        }
      }
    );

    return { sock, state };
  } catch (error) {
    console.error('Error in phone number connection:', error);
    throw error;
  }
}

module.exports = { connectWithPhoneNumber };