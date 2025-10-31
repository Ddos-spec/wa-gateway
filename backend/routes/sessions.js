import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/db.js';
import authMiddleware from '../middleware/auth.js';

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
    
    // FIX: Panggil gateway menggunakan POST /session/start
    const response = await axios.post(`${process.env.WA_GATEWAY_URL}/session/start`, 
      { session: name }
    );
    
    // Kirim QR jika ada, atau status jika sudah terhubung
    if (response.data.qr) {
      res.json({ success: true, qr: response.data.qr });
    } else {
      res.json({ success: true, qr: null, message: response.data.message || 'Already connected' });
    }
  } catch (error) {
    console.error('Get QR code error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.response?.data?.message || 'Failed to fetch QR code' });
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
    
    const response = await axios.post(`${process.env.WA_GATEWAY_URL}/session/pair-phone`, {
      session: name,
      phone_number: phone_number
    });

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
    // FIX: Default status harusnya 'connecting' atau 'offline'
    const result = await pool.query(
      'INSERT INTO sessions (session_name, api_key, status) VALUES ($1, $2, $3) RETURNING *', 
      [session_name, apiKey, 'offline']
    );
    
    // FIX: Hapus trigger gateway dari sini.
    // Frontend (dashboard.js) akan memanggil /:name/qr setelah ini,
    // yang akan memicu /session/start di gateway.
    
    res.status(201).json({ success: true, session: result.rows[0] });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ success: false, error: 'Failed to create session' });
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
    
    // Dapatkan API Key dari session
    const sessionResult = await pool.query('SELECT api_key FROM sessions WHERE session_name = $1', [name]);
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    const apiKey = sessionResult.rows[0].api_key;

    // Panggil gateway untuk mengirim pesan
    // Gateway Hono menggunakan 'key' sebagai query param atau header, bukan auth bearer
    await axios.post(`${process.env.WA_GATEWAY_URL}/message/send-text?key=${apiKey}`, {
      session: name,
      to: phone_number,
      text: message
    });

    res.json({ success: true, message: 'Test message sent successfully' });
  } catch (error) {
    console.error('Send test message error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.response?.data?.message || 'Failed to send test message' });
  }
});

// DELETE SESSION BY NAME
router.delete('/:name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    
    // FIX: Panggil endpoint DELETE di gateway, bukan /logout
    // Ini akan memicu logika delete yang sudah diupdate di gateway (termasuk delete webhooks)
    try {
      await axios.delete(`${process.env.WA_GATEWAY_URL}/session/${name}`);
    } catch (error) {
      // Abaikan error jika session sudah tidak ada di gateway, tapi log
      console.error('Failed to logout session on wa-gateway (might be already offline):', error.message);
    }
    
    // Hapus dari database backend
    // Relasi CASCADE di DB akan otomatis menghapus webhooks dan logs
    const result = await pool.query('DELETE FROM sessions WHERE session_name = $1', [name]);
    
    if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Session not found in DB' });
    }
    res.json({ success: true, message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete session' });
  }
});

export default router;
