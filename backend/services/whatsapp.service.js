const { connectWithQR } = require('../whatsapp-qr-auth');
const { connectWithPhoneNumber } = require('../whatsapp-phone-auth');
const sessionService = require('./session.service');

/**
 * Start QR-based authentication for a session
 * @param {string} sessionId - Unique session identifier
 * @returns {Promise<Object>} Authentication result
 */
async function startQRAuth(sessionId) {
  try {
    const connection = await connectWithQR(sessionId, (qr) => {
      console.log('QR Code generated for session:', sessionId);
      // TODO: Emit QR code to frontend via WebSocket
      console.log('QR Code for session', sessionId, ':', qr);
    });

    // Store connection in session service
    sessionService.addConnection(sessionId, connection.sock);

    return {
      success: true,
      sessionId,
      message: 'QR authentication started'
    };
  } catch (error) {
    console.error('Error in QR authentication:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Start phone number-based authentication for a session
 * @param {string} sessionId - Unique session identifier
 * @param {string} phoneNumber - Phone number for authentication
 * @returns {Promise<Object>} Authentication result
 */
async function startPhoneAuth(sessionId, phoneNumber) {
  try {
    const connection = await connectWithPhoneNumber(
      sessionId,
      phoneNumber,
      (code) => {
        console.log('Pairing code for session:', sessionId);
        // TODO: Send pairing code to frontend
        console.log('Pairing code for', phoneNumber, ':', code);
      }
    );

    // Store connection in session service
    sessionService.addConnection(sessionId, connection.sock);

    return {
      success: true,
      sessionId,
      message: 'Phone authentication started'
    };
  } catch (error) {
    console.error('Error in phone authentication:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  startQRAuth,
  startPhoneAuth
};
