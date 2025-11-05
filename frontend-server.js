import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.FRONTEND_PORT || 5000;

// ✅ FIX: Use environment variables for proxy targets
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const GATEWAY_URL = process.env.WA_GATEWAY_URL || 'http://localhost:5001';

// Proxy API requests to the backend dashboard server
app.use('/api', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Backend proxy error:', err);
    res.status(503).json({ error: 'Backend service unavailable' });
  }
}));

// Proxy WA Gateway API requests to the main server
app.use(['/session', '/message', '/profile', '/auth', '/notifications'], createProxyMiddleware({
  target: GATEWAY_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket proxying
  onError: (err, req, res) => {
    console.error('Gateway proxy error:', err);
    res.status(503).json({ error: 'Gateway service unavailable' });
  }
}));

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, 'frontend')));

// Serve index.html for all other routes (SPA behavior)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Frontend server running on port ${PORT}`);
  console.log(`📡 Backend API: ${BACKEND_URL}`);
  console.log(`📡 Gateway API: ${GATEWAY_URL}`);
});