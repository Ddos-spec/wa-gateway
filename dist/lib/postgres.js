import { Pool } from "pg";
import { env } from "../env.js";
const globalForPg = globalThis;
const pool = globalForPg.__pgPool ??
    new Pool({
        connectionString: env.DATABASE_URL,
    });
if (env.NODE_ENV !== "PRODUCTION") {
    globalForPg.__pgPool = pool;
}
export const getPool = () => pool;
export const query = async (text, params) => {
    const result = await pool.query(text, params);
    return result;
};
