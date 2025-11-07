import { sign } from 'jsonwebtoken';
import { createRequire } from 'module';

// Create a require function to import CommonJS modules
const require = createRequire(import.meta.url);

// Use require for CJS modules
const pg = require('pg');
const bcrypt = require('bcrypt');

// Destructure after requiring
const { Pool } = pg;
const { compare } = bcrypt;

// Use export default for the handler in an ES Module
export default async (req, res) => {
  // Diagnostic Log: Print the environment variable Vercel is using.
  console.log('DATABASE_URL received by Vercel function:', process.env.DATABASE_URL.replace(/:([^:]+)@/, ':<password>@'));

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Missing credentials' });
  }

  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const { rows } = await pool.query('SELECT id, username, password_hash FROM config WHERE username=$1 LIMIT 1', [username]);

    if (rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = rows[0];
    const isPasswordValid = await compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = sign({ sub: user.id, username }, process.env.JWT_SECRET || 'secret', { expiresIn: '2h' });
    return res.status(200).json({ success: true, token });

  } catch (e) {
    console.error('!!! Database Connection/Query Error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
};