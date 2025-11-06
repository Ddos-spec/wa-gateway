import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_MAX || 5),
})

export default async function handler(req, res) {
  const { name } = req.query
  if (!name) return res.status(400).json({ success: false, error: 'Missing session name' })

  try {
    const { rows } = await pool.query('SELECT * FROM sessions WHERE name = $1 LIMIT 1', [name])
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' })
    res.status(200).json({ success: true, session: rows[0] })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
