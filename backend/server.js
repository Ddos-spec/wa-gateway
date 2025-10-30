import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import webhookRoutes from './routes/webhooks.js';

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'WA Gateway Dashboard API is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/webhooks', webhookRoutes);

// Log all registered routes
app._router.stack.forEach(function(r){
  if (r.route && r.route.path){
    console.log(r.route.stack[0].method.toUpperCase(), r.route.path)
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.BACKEND_PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 WA Gateway Dashboard API running on port ${PORT}`);
  console.log(`📡 WA Gateway URL: ${process.env.WA_GATEWAY_URL}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
});
