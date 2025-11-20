const { default: makeWASocket, useSingleFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

/**
 * Function to connect to WhatsApp with QR code authentication
 * @param {string} sessionId - Unique identifier for the session
 * @param {function} onQR - Callback function to handle QR code
 * @returns {Promise<Object>} - Returns the socket connection and state
 */
async function connectWithQR(sessionId, onQR) {
  try {
    const authPath = path.join(__dirname, `./auth_info_${sessionId}.json`);
    const { state, saveState } = useSingleFileAuthState(authPath);

    const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'debug' }),
      printQRInTerminal: false,
      auth: state,
      browser: Browsers['chrome'] // Updated browser option
    });

    store.bind(sock.ev);

    sock.ev.process(
      async (events) => {
        // Credentials updated
        if (events['creds.update']) {
          await saveState();
        }

        // Connection updated
        if (events['connection.update']) {
          const { connection, lastDisconnect } = events['connection.update'];

          if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
          }

          if (connection === 'open') {
            console.log('WhatsApp connection opened for session:', sessionId);
          }
        }

        // Print QR code when auth failure occurs
        if(events['connection.update'].qr) {
          onQR(events['connection.update'].qr);
        }
      }
    );

    return { sock, state };
  } catch (error) {
    console.error('Error in QR connection:', error);
    throw error;
  }
}

module.exports = { connectWithQR };