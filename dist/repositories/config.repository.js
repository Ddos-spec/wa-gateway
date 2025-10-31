import { query } from "../lib/postgres.js";
export const findConfigByUsername = async (username) => {
    const result = await query(`SELECT id, username, password_hash, updated_at FROM config WHERE username = $1 LIMIT 1`, [username]);
    if (result.rowCount === 0) {
        return null;
    }
    return result.rows[0] ?? null;
};
