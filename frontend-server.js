import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.FRONTEND_PORT || 5000;

// Proxy API requests to the backend dashboard server
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:3001', // The backend dashboard server
  changeOrigin: true,
}));

// Proxy WA Gateway API requests to the main server
app.use(['/session', '/message', '/profile', '/auth'], createProxyMiddleware({
  target: 'http://localhost:5001', // The main WA Gateway server
  changeOrigin: true,
}));

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, 'frontend')));

// Serve index.html for all other routes (SPA behavior)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Frontend server with API proxy running on port ${PORT}`);
});