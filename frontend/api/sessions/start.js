import { verify } from 'jsonwebtoken'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function requireAuth(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  try { return verify(token, process.env.JWT_SECRET || 'secret') } catch { return null }
}

export default async function handler(req, res) {
  const user = requireAuth(req)
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' })

  if (req.method === 'POST') {
    const { name } = req.body || {}
    if (!name) return res.status(400).json({ success: false, error: 'Missing session name' })

    try {
      // Create session record and generate QR placeholder (actual WA start handled by worker elsewhere)
      const { rows } = await pool.query(
        'INSERT INTO sessions (name, status, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (name) DO UPDATE SET updated_at = NOW() RETURNING id',
        [name, 'connecting']
      )
      // In a real worker, trigger WA session start and store QR; here return a temp QR link placeholder
      return res.status(200).json({ success: true, id: rows[0].id, qr: null })
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  return res.status(405).end()
}
