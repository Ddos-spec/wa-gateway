import { io } from 'socket.io-client';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3000';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.subscriptions = new Map();
  }

  connect() {
    if (this.socket?.connected) {
      console.log('WebSocket already connected');
      return this.socket;
    }

    this.socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket.id);
      this.isConnected = true;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('WebSocket reconnected after', attemptNumber, 'attempts');
      this.resubscribeAll();
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.subscriptions.clear();
    }
  }

  subscribeToSession(sessionId, callbacks) {
    if (!this.socket) {
      this.connect();
    }

    this.socket.emit('subscribe', sessionId);

    const listeners = {
      pairing_code: (data) => {
        if (data.sessionId === sessionId && callbacks.onPairingCode) {
          callbacks.onPairingCode(data);
        }
      },
      pairing_status: (data) => {
        if (data.sessionId === sessionId && callbacks.onStatus) {
          callbacks.onStatus(data);
        }
      },
      pairing_connected: (data) => {
        if (data.sessionId === sessionId && callbacks.onConnected) {
          callbacks.onConnected(data);
        }
      },
      pairing_error: (data) => {
        if (data.sessionId === sessionId && callbacks.onError) {
          callbacks.onError(data);
        }
      },
      message_received: (data) => {
        if (data.sessionId === sessionId && callbacks.onMessage) {
          callbacks.onMessage(data);
        }
      },
    };

    Object.entries(listeners).forEach(([event, handler]) => {
      this.socket.on(event, handler);
    });

    this.subscriptions.set(sessionId, { callbacks, listeners });

    console.log('Subscribed to session:', sessionId);
  }

  unsubscribeFromSession(sessionId) {
    if (!this.socket) return;

    this.socket.emit('unsubscribe', sessionId);

    const subscription = this.subscriptions.get(sessionId);
    if (subscription) {
      Object.entries(subscription.listeners).forEach(([event, handler]) => {
        this.socket.off(event, handler);
      });

      this.subscriptions.delete(sessionId);
      console.log('Unsubscribed from session:', sessionId);
    }
  }

  resubscribeAll() {
    console.log('Resubscribing to all sessions...');
    this.subscriptions.forEach((subscription, sessionId) => {
      this.socket.emit('subscribe', sessionId);
    });
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      socketId: this.socket?.id,
    };
  }
}

const websocketService = new WebSocketService();

export default websocketService;
