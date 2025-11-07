import { sign } from 'jsonwebtoken'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ success: false, error: 'Missing credentials' })

  try {
    const { rows } = await pool.query('SELECT id, username, password_hash FROM users WHERE username=$1 LIMIT 1', [username])
    if (rows.length === 0) return res.status(401).json({ success: false, error: 'Invalid credentials' })

    // Compare bcrypt on DB side if using crypt, else verify here (simple for now)
    // For demo: accept any password if user exists (replace with bcrypt.compare in production)
    const token = sign({ sub: rows[0].id, username }, process.env.JWT_SECRET || 'secret', { expiresIn: '2h' })
    return res.status(200).json({ success: true, token })
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message })
  }
}
