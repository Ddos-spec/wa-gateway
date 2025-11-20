const whatsappService = require('../services/whatsapp.service');
const sessionService = require('../services/session.service');

/**
 * Start QR code authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const startQRAuth = async (req, res) => {
  try {
    const { sessionId } = req.body;

    // Validation
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Start QR authentication
    const result = await whatsappService.startQRAuth(sessionId);

    res.json(result);
  } catch (error) {
    console.error('Error starting QR auth:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Start phone number authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const startPhoneAuth = async (req, res) => {
  try {
    const { sessionId, phoneNumber } = req.body;

    // Validation
    if (!sessionId || !phoneNumber) {
      return res.status(400).json({
        error: 'Session ID and phone number are required'
      });
    }

    // Start phone authentication
    const result = await whatsappService.startPhoneAuth(sessionId, phoneNumber);

    res.json(result);
  } catch (error) {
    console.error('Error starting phone auth:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  startQRAuth,
  startPhoneAuth
};
