// backend/server.js
import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import authRoutes from './routes/auth.js';
import sessionsRouter from './routes/sessions.js';
import webhooksRouter from './routes/webhooks.js';

const app = express();
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

app.use(express.json());

// ✅ Health check (no /api prefix needed)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ✅ API routes - Backend handles /api/ prefix here
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionsRouter);
app.use('/api/webhooks', webhooksRouter);

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

app.listen(PORT, () => {
  console.log(`🚀 Backend API running on port ${PORT}`);
  console.log(`📡 WA Gateway URL: ${process.env.WA_GATEWAY_URL}`);
  console.log(`🌐 Allowed Origins: ${allowedOrigins.join(', ')}`);
});