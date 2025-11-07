import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.DB_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export default async function handler(req, res) {
  try {
    const result = await pool.query('SELECT NOW() as now')
    res.status(200).json({ success: true, now: result.rows[0].now })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
}
