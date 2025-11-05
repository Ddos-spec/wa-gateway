import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// GET /api/notifications - Fetch notifications
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                sl.id,
                sl.action,
                sl.details,
                sl.timestamp,
                s.session_name,
                s.status
            FROM session_logs sl
            LEFT JOIN sessions s ON sl.session_id = s.id
            ORDER BY sl.timestamp DESC
            LIMIT 50
        `);
        
        res.json({
            success: true,
            notifications: result.rows
        });
    } catch (error) {
        console.error('Notifications error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch notifications' 
        });
    }
});

export default router;
