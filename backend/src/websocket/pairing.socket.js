const logger = require('../utils/logger');

function setupPairingSocket(io, pairingService) {
  pairingService.on('pairing_code', (data) => {
    logger.info(`WebSocket: Broadcasting pairing_code for ${data.sessionId}`);
    io.to(data.sessionId).emit('pairing_code', data);
    io.emit('pairing_code', data);
  });

  pairingService.on('pairing_status', (data) => {
    logger.info(`WebSocket: Broadcasting pairing_status for ${data.sessionId}: ${data.status}`);
    io.to(data.sessionId).emit('pairing_status', data);
    io.emit('pairing_status', data);
  });

  pairingService.on('pairing_connected', (data) => {
    logger.info(`WebSocket: Broadcasting pairing_connected for ${data.sessionId}`);
    io.to(data.sessionId).emit('pairing_connected', data);
    io.emit('pairing_connected', data);
  });

  pairingService.on('pairing_error', (data) => {
    logger.info(`WebSocket: Broadcasting pairing_error for ${data.sessionId}`);
    io.to(data.sessionId).emit('pairing_error', data);
    io.emit('pairing_error', data);
  });

  pairingService.on('message_received', (data) => {
    logger.info(`WebSocket: Broadcasting message_received for ${data.sessionId}`);
    io.to(data.sessionId).emit('message_received', data);
    io.emit('message_received', data);
  });

  io.on('connection', (socket) => {
    logger.info(`WebSocket: Client connected - ${socket.id}`);

    socket.on('subscribe', (sessionId) => {
      if (sessionId) {
        socket.join(sessionId);
        logger.info(`WebSocket: Client ${socket.id} subscribed to ${sessionId}`);
        socket.emit('subscribed', { sessionId });
      }
    });

    socket.on('unsubscribe', (sessionId) => {
      if (sessionId) {
        socket.leave(sessionId);
        logger.info(`WebSocket: Client ${socket.id} unsubscribed from ${sessionId}`);
        socket.emit('unsubscribed', { sessionId });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`WebSocket: Client disconnected - ${socket.id}`);
    });

    socket.on('error', (error) => {
      logger.error(`WebSocket error for ${socket.id}:`, error.message);
    });
  });

  logger.info('WebSocket: Pairing socket handlers initialized');
}

module.exports = setupPairingSocket;
