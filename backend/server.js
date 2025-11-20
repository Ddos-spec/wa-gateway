const express = require('express');
const { default: makeWASocket, useSingleFileAuthState, DisconnectReason, fetchLatestBaileysVersion, generateForwardMessageContent, prepareWAMessageMedia, generateWAMessageFromContent, generateMessageID, downloadContentFromMessage, makeInMemoryStore, jidDecode, proto, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { connectWithQR } = require('./whatsapp-qr-auth');
const { connectWithPhoneNumber } = require('./whatsapp-phone-auth');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const FileType = require('file-type');
const path = require('path');
const pino = require('pino');

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Store for WhatsApp connections
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) });

// Object to store active connections
const activeConnections = {};

// Function to start QR-based authentication
async function startQRAuth(sessionId) {
  try {
    const connection = await connectWithQR(sessionId, (qr) => {
      console.log('QR Code generated for session:', sessionId);
      // Here you can emit the QR to frontend via WebSocket or store it to be retrieved
      // For now, we'll just log it
      console.log('QR Code for session', sessionId, ':', qr);
    });

    activeConnections[sessionId] = connection.sock;
    return { success: true, sessionId, message: 'QR authentication started' };
  } catch (error) {
    console.error('Error in QR authentication:', error);
    return { success: false, error: error.message };
  }
}

// Function to start phone number-based authentication
async function startPhoneAuth(sessionId, phoneNumber) {
  try {
    const connection = await connectWithPhoneNumber(sessionId, phoneNumber, (code) => {
      console.log('Pairing code for session:', sessionId);
      // Here you can send the code to frontend or store it to be retrieved
      console.log('Pairing code for', phoneNumber, ':', code);
    });

    activeConnections[sessionId] = connection.sock;
    return { success: true, sessionId, message: 'Phone authentication started' };
  } catch (error) {
    console.error('Error in phone authentication:', error);
    return { success: false, error: error.message };
  }
}

// API Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'WhatsApp Gateway API is running!',
    status: sock ? 'connected' : 'disconnected'
  });
});

// Send message API
app.post('/api/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    if (!sock) {
      return res.status(500).json({ error: 'WhatsApp connection not established' });
    }
    
    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }
    
    const response = await sock.sendMessage(phone + '@s.whatsapp.net', { text: message });
    res.json({ success: true, response, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get connection status
app.get('/api/status', (req, res) => {
  res.json({ 
    status: sock ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Get contacts
app.get('/api/contacts', (req, res) => {
  if (!sock) {
    return res.status(500).json({ error: 'WhatsApp connection not established' });
  }
  
  const contacts = sock.contacts || {};
  res.json({ success: true, contacts });
});

// Get message history (if stored)
app.get('/api/messages', (req, res) => {
  // This would typically return message history from a database
  // For now, we'll return an empty array
  res.json({ success: true, messages: [] });
});

// API Routes
app.get('/', (req, res) => {
  res.json({
    message: 'WhatsApp Gateway API is running!',
    status: Object.keys(activeConnections).length > 0 ? 'connected' : 'no active connections'
  });
});

// Start QR authentication
app.post('/api/auth/qr', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const result = await startQRAuth(sessionId);
    res.json(result);
  } catch (error) {
    console.error('Error starting QR auth:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start phone authentication
app.post('/api/auth/phone', async (req, res) => {
  try {
    const { sessionId, phoneNumber } = req.body;

    if (!sessionId || !phoneNumber) {
      return res.status(400).json({ error: 'Session ID and phone number are required' });
    }

    const result = await startPhoneAuth(sessionId, phoneNumber);
    res.json(result);
  } catch (error) {
    console.error('Error starting phone auth:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send message API
app.post('/api/send-message', async (req, res) => {
  try {
    const { phone, message, sessionId = 'default' } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    const sock = activeConnections[sessionId];
    if (!sock) {
      return res.status(500).json({ error: 'WhatsApp connection not established for this session' });
    }

    const response = await sock.sendMessage(phone + '@s.whatsapp.net', { text: message });
    res.json({ success: true, response, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get connection status
app.get('/api/status', (req, res) => {
  const sessions = Object.keys(activeConnections);
  res.json({
    activeSessions: sessions.length,
    sessions: sessions,
    timestamp: new Date().toISOString()
  });
});

// Get contacts
app.get('/api/contacts', (req, res) => {
  // This would get contacts from the active connection
  // For now, returning empty array
  res.json({ success: true, contacts: [] });
});

// Get message history (if stored)
app.get('/api/messages', (req, res) => {
  // This would typically return message history from a database
  // For now, we'll return an empty array
  res.json({ success: true, messages: [] });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;