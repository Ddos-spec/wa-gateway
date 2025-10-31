import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const router = express.Router();

// Proxy requests to the gateway's profile endpoint
router.use('/', createProxyMiddleware({
  target: 'http://localhost:5001', // Target the gateway service
  changeOrigin: true,
  pathRewrite: (path, req) => {
    // The backend route is /api/profile/:name, but the gateway is /profile/:name
    // We just need to forward the request to the correct path on the gateway.
    return `/profile${path}`;
  },
  onError: (err, req, res) => {
    console.error('Profile proxy error:', err);
    res.status(503).json({ success: false, error: 'Gateway service unavailable' });
  }
}));

export default router;
