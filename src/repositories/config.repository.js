import { query } from "../lib/postgres";
export const findConfigByUsername = async (username) => {
    const result = await query(`SELECT id, username, password, created_at FROM config WHERE username = $1 LIMIT 1`, [username]);
    if (result.rowCount === 0) {
        return null;
    }
    return result.rows[0] ?? null;
};
