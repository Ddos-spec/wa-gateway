const sessionService = require('../services/session.service');

/**
 * Send WhatsApp message
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const sendMessage = async (req, res) => {
  try {
    const { phone, message, sessionId = 'default' } = req.body;

    // Validation
    if (!phone || !message) {
      return res.status(400).json({
        error: 'Phone number and message are required'
      });
    }

    // Get socket connection for session
    const sock = sessionService.getConnection(sessionId);

    if (!sock) {
      return res.status(500).json({
        error: 'WhatsApp connection not established for this session'
      });
    }

    // Send message
    const response = await sock.sendMessage(
      phone + '@s.whatsapp.net',
      { text: message }
    );

    res.json({
      success: true,
      response,
      message: 'Message sent successfully'
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get message history
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getHistory = (req, res) => {
  try {
    // TODO: Implement actual message history from database
    // For now, returning empty array
    res.json({ success: true, messages: [] });
  } catch (error) {
    console.error('Error getting message history:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  sendMessage,
  getHistory
};
