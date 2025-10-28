import { query } from "../lib/postgres.js";

export type ConfigRow = {
  id: number;
  username: string;
  password_hash: string;
  updated_at: Date | string;
};

export const findConfigByUsername = async (
  username: string
): Promise<ConfigRow | null> => {
  const result = await query<ConfigRow>(
    `SELECT id, username, password_hash, updated_at FROM config WHERE username = $1 LIMIT 1`,
    [username]
  );

  if (result.rowCount === 0) {
    return null;
  }

    return result.rows[0] ?? null;
};
