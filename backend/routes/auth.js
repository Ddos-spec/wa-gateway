import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const router = express.Router();

// Login endpoint - supports both config (admin) and users (customer)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // First, try to find user in config table (admin)
    let result = await pool.query(
      'SELECT id, username, password_hash, updated_at as created_at FROM config WHERE username = $1',
      [username]
    );

    let user = null;
    let userType = 'admin';

    if (result.rows.length > 0) {
      user = result.rows[0];
    } else {
      // If not found in config, try users table (customer)
      result = await pool.query(
        `SELECT id, username, email, password_hash, full_name, phone, role, status, created_at 
         FROM users WHERE username = $1 OR email = $1`,
        [username]
      );

      if (result.rows.length > 0) {
        user = result.rows[0];
        userType = 'customer';
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user account is active (for customer users)
    if (userType === 'customer' && user.status === 'inactive') {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role || 'admin', userType: userType },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Prepare user data to send (excluding password)
    const userData = {
      id: user.id,
      username: user.username,
      role: user.role || 'admin',
      userType: userType
    };

    // Add additional fields for customer users
    if (userType === 'customer') {
      userData.email = user.email;
      userData.full_name = user.full_name;
      userData.phone = user.phone;
      userData.status = user.status;
    }

    res.json({
      success: true,
      token,
      user: userData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ success: true, user: decoded });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Register endpoint for new customers
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, full_name, phone } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Check if username or email already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, full_name, phone, role, status) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, username, email, full_name, phone, role, status, created_at`,
      [username, email, password_hash, full_name, phone, 'customer', 'active']
    );

    const user = result.rows[0];

    // Generate JWT token for the new user
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, userType: 'customer' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
