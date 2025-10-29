const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.FRONTEND_PORT || 5000;

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve index.html for all routes (SPA behavior)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`\ud83c\udf10 Frontend server running on port ${PORT}`);
});
