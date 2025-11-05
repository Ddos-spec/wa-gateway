import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import 'dotenv/config';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.FRONTEND_PORT || 5000;

const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.BACKEND_PORT || 3001}`;
const GATEWAY_URL = process.env.WA_GATEWAY_URL || `http://localhost:${process.env.PORT || 5001}`;

const apiProxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Backend proxy error:', err);
    res.status(503).json({ error: 'Backend service unavailable' });
  }
});

const gatewayProxy = createProxyMiddleware({
  target: GATEWAY_URL,
  changeOrigin: true,
  ws: true, // Enable WebSocket proxying
  onError: (err, req, res) => {
    console.error('Gateway proxy error:', err);
    res.status(503).json({ error: 'Gateway service unavailable' });
  }
});

app.use('/api', apiProxy);
app.use(['/session', '/message', '/profile', '/auth', '/notifications'], gatewayProxy);

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, 'frontend')));

// Serve index.html for all other routes (SPA behavior)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

server.on('upgrade', (req, socket, head) => {
  // Manually proxy WebSocket upgrade requests
  if (req.url.startsWith('/socket.io/')) {
    gatewayProxy.upgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Frontend server running on port ${PORT}`);
  console.log(`📡 Backend API proxied to: ${BACKEND_URL}`);
  console.log(`📡 Gateway API (and WebSockets) proxied to: ${GATEWAY_URL}`);
});
