const express = require('express');

// Import routes
const authRoutes = require('./routes/auth.routes');
const sessionRoutes = require('./routes/session.routes');
const messageRoutes = require('./routes/message.routes');

// Initialize Express app
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS Configuration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Health check route
app.get('/', (req, res) => {
  res.json({
    message: 'WhatsApp Gateway API is running!',
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/message', messageRoutes);

// Legacy routes for backward compatibility
app.get('/api/status', (req, res) => {
  res.redirect('/api/session/status');
});

app.get('/api/contacts', (req, res) => {
  res.redirect('/api/session/contacts');
});

app.get('/api/messages', (req, res) => {
  res.redirect('/api/message/history');
});

app.post('/api/send-message', (req, res) => {
  // Redirect to new endpoint
  req.url = '/api/message/send';
  messageRoutes.handle(req, res);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(port, () => {
  console.log('='.repeat(50));
  console.log('WhatsApp Gateway Server');
  console.log('='.repeat(50));
  console.log(`✓ Server running on port ${port}`);
  console.log(`✓ API Base URL: http://localhost:${port}`);
  console.log(`✓ Health Check: http://localhost:${port}/`);
  console.log('='.repeat(50));
});

module.exports = app;
