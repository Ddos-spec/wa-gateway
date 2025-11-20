const sessionService = require('../services/session.service');

/**
 * Get status of all active sessions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getStatus = (req, res) => {
  try {
    const status = sessionService.getSessionsStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get contacts for a session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getContacts = (req, res) => {
  try {
    const { sessionId } = req.query;

    // For now, returning empty array
    // TODO: Implement actual contact fetching from WhatsApp socket
    res.json({ success: true, contacts: [] });
  } catch (error) {
    console.error('Error getting contacts:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getStatus,
  getContacts
};
