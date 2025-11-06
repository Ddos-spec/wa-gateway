import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_MAX || 5),
})

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const { rows } = await pool.query('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 100')
    res.status(200).json({ success: true, sessions: rows })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
