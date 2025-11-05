// backend/server.js
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import 'dotenv/config';

import authRoutes from './routes/auth.js';
import sessionsRouter from './routes/sessions.js';
import webhooksRouter from './routes/webhooks.js';
import notificationsRouter from './routes/notifications.js'; // ✅ NEW

const app = express();
const server = createServer(app); // ✅ HTTP server untuk Socket.io
const PORT = process.env.BACKEND_PORT || 3001;

// ✅ CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
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
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
    
    // Join notification room
    socket.join('notifications');
});

// ✅ Make io available globally for other routes
app.set('io', io);

app.use(express.json());

// ✅ Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ✅ API routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/notifications', notificationsRouter); // ✅ NEW

// ✅ Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ✅ 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: `Route not found: ${req.method} ${req.path}`
    });
});

// ✅ Use server.listen instead of app.listen
server.listen(PORT, () => {
    console.log(`🚀 Backend API running on port ${PORT}`);
    console.log(`📡 WA Gateway URL: ${process.env.WA_GATEWAY_URL}`);
    console.log(`🌐 Allowed Origins: ${allowedOrigins.join(', ')}`);
    console.log(`🔌 Socket.io server ready`);
});

// ✅ Export untuk digunakan di routes lain
export { io };
