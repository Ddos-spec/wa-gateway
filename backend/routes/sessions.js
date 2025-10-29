const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function generateApiKey() {
  return uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
}

// GET ALL SESSIONS
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions ORDER BY created_at DESC');
    res.json({ success: true, sessions: result.rows });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sessions' });
  }
});

// GET SINGLE SESSION BY NAME
router.get('/:name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    console.log('Received session name for GET /:name:', name);
    const result = await pool.query('SELECT * FROM sessions WHERE session_name = $1', [name]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, session: result.rows[0] });
  } catch (error) {
    console.error('Get session by name error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch session' });
  }
});

// GET SESSION STATUS BY NAME
router.get('/:name/status', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const result = await pool.query('SELECT status FROM sessions WHERE session_name = $1', [name]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, status: result.rows[0].status });
  } catch (error) {
    console.error('Get session status error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch session status' });
  }
});

// GET QR CODE FOR SESSION BY NAME
router.get('/:name/qr', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    // Just trigger the gateway, the frontend will handle the QR code display via polling
    const response = await axios.get(`${process.env.WA_GATEWAY_URL}/session/start?session=${name}`);
    res.json({ success: true, qr: response.data.qr || null });
  } catch (error) {
    console.error('Get QR code error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch QR code' });
  }
});

// PAIR WITH PHONE NUMBER
router.post('/:name/pair-phone', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }
    
    // Format phone number (remove dashes and spaces, ensure starts with country code)
    let formattedPhone = phone_number.replace(/[-\s]/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '62' + formattedPhone.substring(1);
    }
    
    // Call WA Gateway to pair with phone number
    const response = await axios.post(`${process.env.WA_GATEWAY_URL}/session/pair-phone`, {
      session: name,
      phone: formattedPhone
    });
    
    // Update database with pairing method
    await pool.query(
      'UPDATE sessions SET pairing_method = $1, paired_phone = $2 WHERE session_name = $3',
      ['phone', formattedPhone, name]
    );
    
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Pair phone error:', error);
    res.status(500).json({ success: false, error: error.response?.data?.message || 'Failed to pair with phone number' });
  }
});

// CREATE NEW SESSION
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { session_name } = req.body;
    if (!session_name) {
      return res.status(400).json({ success: false, error: 'Session name is required' });
    }
    const existingSession = await pool.query('SELECT id FROM sessions WHERE session_name = $1', [session_name]);
    if (existingSession.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Session name already exists' });
    }
    const apiKey = generateApiKey();
    const result = await pool.query('INSERT INTO sessions (session_name, api_key, status) VALUES ($1, $2, $3) RETURNING *', [session_name, apiKey, 'connecting']);
    
    // Trigger gateway in background
    axios.get(`${process.env.WA_GATEWAY_URL}/session/start?session=${session_name}`).catch(err => console.error('Gateway trigger failed:', err.message));
    
    res.status(201).json({ success: true, session: result.rows[0] });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ success: false, error: 'Failed to create session' });
  }
});

// UPDATE WEBHOOK BY NAME
router.put('/:name/webhook', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const { webhook_url, webhook_events } = req.body;
    const result = await pool.query('UPDATE sessions SET webhook_url = $1, webhook_events = $2, updated_at = CURRENT_TIMESTAMP WHERE session_name = $3 RETURNING *', [webhook_url, JSON.stringify(webhook_events), name]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, session: result.rows[0] });
  } catch (error) {
    console.error('Update webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to update webhook' });
  }
});

// REGENERATE API KEY BY NAME
router.post('/:name/regenerate-key', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const newApiKey = generateApiKey();
    const result = await pool.query('UPDATE sessions SET api_key = $1, updated_at = CURRENT_TIMESTAMP WHERE session_name = $2 RETURNING *', [newApiKey, name]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, api_key: newApiKey });
  } catch (error) {
    console.error('Regenerate key error:', error);
    res.status(500).json({ success: false, error: 'Failed to regenerate API key' });
  }
});

router.post('/:name/test-message', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    const { phone_number, message } = req.body;

    if (!phone_number || !message) {
      return res.status(400).json({ success: false, error: 'Phone number and message are required' });
    }

    // Panggil gateway untuk mengirim pesan
    await axios.post(`${process.env.WA_GATEWAY_URL}/message/send-text`, {
      session: name,
      to: phone_number,
      text: message
    });

    res.json({ success: true, message: 'Test message sent successfully' });
  } catch (error) {
    console.error('Send test message error:', error);
    res.status(500).json({ success: false, error: 'Failed to send test message' });
  }
});

// DELETE SESSION BY NAME
router.delete('/:name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    try {
      await axios.get(`${process.env.WA_GATEWAY_URL}/session/logout?session=${name}`);
    } catch (error) {
      console.error('Failed to logout session on wa-gateway:', error.message);
    }
    const result = await pool.query('DELETE FROM sessions WHERE session_name = $1', [name]);
    if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete session' });
  }
});

module.exports = router;
