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
    const { to, message } = req.body || {}
    if (!to || !message) return res.status(400).json({ success: false, error: 'Missing to/message' })

    try {
      // Save outbound message queue record; actual send handled by worker/bot (optional)
      const { rows } = await pool.query(
        'INSERT INTO outbound_messages (recipient, message, status) VALUES ($1,$2,$3) RETURNING id',
        [to, message, 'queued']
      )
      return res.status(200).json({ success: true, id: rows[0].id })
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  return res.status(405).end()
}
