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
  const { name } = req.query
  if (!name) return res.status(400).json({ success: false, error: 'Missing session name' })

  if (req.method === 'GET') {
    try {
      const { rows } = await pool.query('SELECT * FROM sessions WHERE name=$1 LIMIT 1', [name])
      if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' })
      return res.status(200).json({ success: true, session: rows[0] })
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (req.method === 'DELETE') {
    const user = requireAuth(req)
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' })
    try {
      await pool.query('DELETE FROM sessions WHERE name=$1', [name])
      return res.status(200).json({ success: true })
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  return res.status(405).end()
}
