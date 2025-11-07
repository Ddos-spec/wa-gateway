import { query } from "../lib/postgres.js";

export type UserRow = {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export const findUserByUsernameOrEmail = async (
  identifier: string
): Promise<UserRow | null> => {
  const result = await query<UserRow>(
    `SELECT id, username, email, password_hash, full_name, phone, role, status, created_at, updated_at FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
    [identifier]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0] ?? null;
};
