// backend/routes/sessions.js - UPDATED
import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/db.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();
const GATEWAY_URL = process.env.WA_GATEWAY_URL || 'http://localhost:5001';

// ✅ GET ALL SESSIONS (unchanged)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows }); // ✅ Changed to match expected format
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sessions' });
  }
});

// ✅ START SESSION (proxy to gateway)
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const { session } = req.body;
    
    if (!session) {
      return res.status(400).json({ success: false, error: 'Session name required' });
    }

    // 1. Create/update in DB first
    const apiKey = uuidv4().replace(/-/g, '');
    await pool.query(
      `INSERT INTO sessions (session_name, api_key, status) 
       VALUES ($1, $2, 'connecting') 
       ON CONFLICT (session_name) 
       DO UPDATE SET status = 'connecting', updated_at = CURRENT_TIMESTAMP`,
      [session, apiKey]
    );

    // 2. Forward to gateway for QR/pairing
    const gatewayResponse = await axios.post(
      `${GATEWAY_URL}/session/start`,
      { session },
      { 
        timeout: 30000,
        headers: { 'key': process.env.KEY } // Gateway authentication
      }
    );

    // 3. Return gateway response (QR code atau connected status)
    res.json({
      success: true,
      ...gatewayResponse.data
    });

  } catch (error) {
    console.error('Start session error:', error.response?.data || error.message);
    
    // Cleanup on error
    if (req.body.session) {
      await pool.query(
        'UPDATE sessions SET status = $1 WHERE session_name = $2',
        ['offline', req.body.session]
      );
    }
    
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || 'Failed to start session'
    });
  }
});

// ✅ GET SESSION STATUS (proxy to gateway)
router.get('/:name/status', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    
    // Get from DB (cached status)
    const dbResult = await pool.query(
      'SELECT status FROM sessions WHERE session_name = $1',
      [name]
    );
    
    if (dbResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    // Optionally verify with gateway real-time status
    try {
      const gatewayStatus = await axios.get(
        `${GATEWAY_URL}/session/${name}`,
        { 
          timeout: 5000,
          headers: { 'key': process.env.KEY }
        }
      );
      
      // Update DB if status changed
      if (gatewayStatus.data.status !== dbResult.rows[0].status) {
        await pool.query(
          'UPDATE sessions SET status = $1 WHERE session_name = $2',
          [gatewayStatus.data.status, name]
        );
      }
      
      res.json({ 
        success: true, 
        status: gatewayStatus.data.status 
      });
    } catch {
      // Fallback to DB status if gateway unavailable
      res.json({ 
        success: true, 
        status: dbResult.rows[0].status 
      });
    }
    
  } catch (error) {
    console.error('Get session status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

// ✅ DELETE SESSION (updated with gateway cleanup)
router.delete('/:name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.params;
    
    // 1. Delete from gateway first
    try {
      await axios.delete(`${GATEWAY_URL}/session/${name}`, {
        headers: { 'key': process.env.KEY }
      });
    } catch (error) {
      console.error('Gateway delete failed:', error.message);
      // Continue even if gateway fails
    }
    
    // 2. Delete from DB (CASCADE will delete related webhooks)
    const result = await pool.query(
      'DELETE FROM sessions WHERE session_name = $1 RETURNING id',
      [name]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete session' });
  }
});

export default router;