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

  if (req.method === 'GET') {
    try {
      const { rows } = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50')
      return res.status(200).json({ success: true, notifications: rows, count: rows.length })
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (req.method === 'PATCH') {
    const { id } = req.query
    if (!id) return res.status(400).json({ success: false, error: 'Missing id' })
    try {
      await pool.query('UPDATE notifications SET read_at = NOW() WHERE id = $1', [id])
      return res.status(200).json({ success: true })
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  return res.status(405).end()
}
