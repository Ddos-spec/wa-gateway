/**
 * Session Service
 * Manages WhatsApp socket connections for multiple sessions
 */

// In-memory storage for active connections
const activeConnections = {};

/**
 * Add a new connection to the storage
 * @param {string} sessionId - Unique session identifier
 * @param {Object} socket - WhatsApp socket connection
 */
function addConnection(sessionId, socket) {
  activeConnections[sessionId] = socket;
  console.log(`Session ${sessionId} added to active connections`);
}

/**
 * Get a connection by session ID
 * @param {string} sessionId - Unique session identifier
 * @returns {Object|null} WhatsApp socket connection or null
 */
function getConnection(sessionId) {
  return activeConnections[sessionId] || null;
}

/**
 * Remove a connection from storage
 * @param {string} sessionId - Unique session identifier
 */
function removeConnection(sessionId) {
  if (activeConnections[sessionId]) {
    delete activeConnections[sessionId];
    console.log(`Session ${sessionId} removed from active connections`);
  }
}

/**
 * Get all active session IDs
 * @returns {Array<string>} Array of active session IDs
 */
function getActiveSessions() {
  return Object.keys(activeConnections);
}

/**
 * Get status of all sessions
 * @returns {Object} Sessions status information
 */
function getSessionsStatus() {
  const sessions = getActiveSessions();
  return {
    activeSessions: sessions.length,
    sessions: sessions,
    timestamp: new Date().toISOString()
  };
}

/**
 * Check if a session exists
 * @param {string} sessionId - Unique session identifier
 * @returns {boolean} True if session exists, false otherwise
 */
function hasSession(sessionId) {
  return activeConnections.hasOwnProperty(sessionId);
}

module.exports = {
  addConnection,
  getConnection,
  removeConnection,
  getActiveSessions,
  getSessionsStatus,
  hasSession
};
