const express = require('express');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET all webhooks for a session
router.get('/:sessionName', authMiddleware, async (req, res) => {
  try {
    const { sessionName } = req.params;
    
    // Get session id first
    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE session_name = $1',
      [sessionName]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    const sessionId = sessionResult.rows[0].id;
    
    // Get all webhooks for this session
    const webhooksResult = await pool.query(
      'SELECT * FROM webhooks WHERE session_id = $1 ORDER BY created_at DESC',
      [sessionId]
    );
    
    res.json({ success: true, webhooks: webhooksResult.rows });
  } catch (error) {
    console.error('Get webhooks error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch webhooks' });
  }
});

// ADD a new webhook to a session
router.post('/:sessionName', authMiddleware, async (req, res) => {
  try {
    const { sessionName } = req.params;
    const { webhook_url, webhook_events, is_active } = req.body;
    
    if (!webhook_url) {
      return res.status(400).json({ success: false, error: 'Webhook URL is required' });
    }
    
    // Get session id
    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE session_name = $1',
      [sessionName]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    const sessionId = sessionResult.rows[0].id;
    
    // Insert new webhook
    const result = await pool.query(
      `INSERT INTO webhooks (session_id, webhook_url, webhook_events, is_active) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [sessionId, webhook_url, JSON.stringify(webhook_events || {}), is_active !== undefined ? is_active : true]
    );
    
    res.status(201).json({ success: true, webhook: result.rows[0] });
  } catch (error) {
    console.error('Add webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to add webhook' });
  }
});

// UPDATE a webhook
router.put('/:sessionName/:webhookId', authMiddleware, async (req, res) => {
  try {
    const { sessionName, webhookId } = req.params;
    const { webhook_url, webhook_events, is_active } = req.body;
    
    // Get session id
    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE session_name = $1',
      [sessionName]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    const sessionId = sessionResult.rows[0].id;
    
    // Update webhook
    const result = await pool.query(
      `UPDATE webhooks 
       SET webhook_url = COALESCE($1, webhook_url), 
           webhook_events = COALESCE($2, webhook_events), 
           is_active = COALESCE($3, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND session_id = $5
       RETURNING *`,
      [webhook_url, webhook_events ? JSON.stringify(webhook_events) : null, is_active, webhookId, sessionId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }
    
    res.json({ success: true, webhook: result.rows[0] });
  } catch (error) {
    console.error('Update webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to update webhook' });
  }
});

// TOGGLE webhook on/off
router.patch('/:sessionName/:webhookId/toggle', authMiddleware, async (req, res) => {
  try {
    const { sessionName, webhookId } = req.params;
    
    // Get session id
    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE session_name = $1',
      [sessionName]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    const sessionId = sessionResult.rows[0].id;
    
    // Toggle is_active
    const result = await pool.query(
      `UPDATE webhooks 
       SET is_active = NOT is_active,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND session_id = $2
       RETURNING *`,
      [webhookId, sessionId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }
    
    res.json({ success: true, webhook: result.rows[0] });
  } catch (error) {
    console.error('Toggle webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle webhook' });
  }
});

// DELETE a webhook
router.delete('/:sessionName/:webhookId', authMiddleware, async (req, res) => {
  try {
    const { sessionName, webhookId } = req.params;
    
    // Get session id
    const sessionResult = await pool.query(
      'SELECT id FROM sessions WHERE session_name = $1',
      [sessionName]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    const sessionId = sessionResult.rows[0].id;
    
    // Delete webhook
    const result = await pool.query(
      'DELETE FROM webhooks WHERE id = $1 AND session_id = $2',
      [webhookId, sessionId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Webhook not found' });
    }
    
    res.json({ success: true, message: 'Webhook deleted successfully' });
  } catch (error) {
    console.error('Delete webhook error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete webhook' });
  }
});

module.exports = router;
