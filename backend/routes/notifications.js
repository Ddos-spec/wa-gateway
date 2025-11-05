import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

// Middleware to verify JWT token (optional, bisa skip untuk testing)
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.log('⚠️ No token provided, proceeding without authentication');
        return next(); // Skip authentication for now
    }

    // Add JWT verification here if needed
    next();
}

// GET /api/notifications - Fetch all notifications
router.get('/', authenticateToken, async (req, res) => {
    try {
        console.log('📥 Fetching notifications...');

        const result = await pool.query(`
            SELECT 
                sl.id,
                sl.action,
                sl.details,
                sl.timestamp,
                s.session_name,
                s.status,
                s.wa_number
            FROM session_logs sl
            LEFT JOIN sessions s ON sl.session_id = s.id
            ORDER BY sl.timestamp DESC
            LIMIT 50
        `);
        
        console.log(`📊 Found ${result.rows.length} notifications`);

        res.json({
            success: true,
            notifications: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('❌ Error fetching notifications:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch notifications',
            message: error.message 
        });
    }
});

// GET /api/notifications/recent - Get recent notifications (last 24 hours)
router.get('/recent', authenticateToken, async (req, res) => {
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
            WHERE sl.timestamp >= NOW() - INTERVAL '24 hours'
            ORDER BY sl.timestamp DESC
            LIMIT 20
        `);

        res.json({
            success: true,
            notifications: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('❌ Error fetching recent notifications:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch recent notifications' 
        });
    }
});

// PATCH /api/notifications/:id/read - Mark notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
    try {
        const notificationId = req.params.id;
        
        // For now, just return success (you can implement actual read status later)
        console.log(`📖 Marking notification ${notificationId} as read`);
        
        res.json({
            success: true,
            message: 'Notification marked as read'
        });

    } catch (error) {
        console.error('❌ Error marking notification as read:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to mark notification as read' 
        });
    }
});

// POST /api/notifications - Create new notification (for testing)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { action, details, session_id } = req.body;

        const result = await pool.query(`
            INSERT INTO session_logs (action, details, session_id, timestamp)
            VALUES ($1, $2, $3, NOW())
            RETURNING *
        `, [action, details, session_id || null]);

        console.log('📝 Created new notification:', result.rows[0]);

        // Emit to WebSocket if available
        const io = req.app.get('io');
        if (io) {
            io.to('notifications').emit('new_notification', result.rows[0]);
        }

        res.json({
            success: true,
            notification: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Error creating notification:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to create notification' 
        });
    }
});

export default router;


