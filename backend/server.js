// Updated Backend Server - Location: /backend/server.js
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import 'dotenv/config';

// Import routes
import authRoutes from './routes/auth.js';
import sessionsRouter from './routes/sessions.js';
import webhooksRouter from './routes/webhooks.js';
import notificationsRouter from './routes/notifications.js'; // ✅ NEW

const app = express();
const server = createServer(app);
const PORT = process.env.BACKEND_PORT || 3001;

// ✅ CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',')
    .map(o => o.trim())
    .filter(Boolean);

console.log('🌐 Allowed Origins:', allowedOrigins);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`❌ Origin ${origin} not allowed by CORS`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// ✅ Socket.io setup
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// ✅ Socket.io connection handling
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    
    // Join notification room automatically
    socket.join('notifications');
    console.log('📢 Client joined notifications room');
    
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
    });
    
    // Handle custom events
    socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`🏠 Client joined room: ${room}`);
    });
});

// ✅ Make io available globally for other routes
app.set('io', io);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

// ✅ Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// ✅ API routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/notifications', notificationsRouter); // ✅ NEW

// ✅ Test endpoint for WebSocket
app.post('/api/test-notification', (req, res) => {
    const testNotification = {
        id: Date.now(),
        action: 'test',
        details: 'Test notification from API',
        timestamp: new Date().toISOString()
    };

    // Emit to all connected clients
    io.to('notifications').emit('new_notification', testNotification);
    
    res.json({
        success: true,
        message: 'Test notification sent',
        notification: testNotification
    });
});

// ✅ Error handling middleware
app.use((err, req, res, next) => {
    console.error('🚨 Server Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error',
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ✅ 404 handler
app.use((req, res) => {
    console.log(`❌ 404 Not Found: ${req.method} ${req.path}`);
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.path}`,
        availableRoutes: [
            'GET /health',
            'POST /api/auth/login',
            'GET /api/notifications',
            'POST /api/test-notification'
        ]
    });
});

// ✅ Start server
server.listen(PORT, () => {
    console.log(`🚀 Backend API running on port ${PORT}`);
    console.log(`📡 WA Gateway URL: ${process.env.WA_GATEWAY_URL}`);
    console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
    console.log(`🔌 Socket.io server ready`);
    console.log(`🗄️  Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
});

// ✅ Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// ✅ Export server and io for testing
export { app, server, io };