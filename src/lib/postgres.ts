import { Pool, QueryResultRow } from "pg";
import { env } from "../env.js";

type GlobalWithPg = typeof globalThis & {
  __pgPool?: Pool;
};

const globalForPg = globalThis as GlobalWithPg;

const pool =
  globalForPg.__pgPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
  });

if (env.NODE_ENV !== "PRODUCTION") {
  globalForPg.__pgPool = pool;
}

export const getPool = () => pool;

export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: (string | number | boolean | null | Date)[]
) => {
  const result = await pool.query<T>(text, params);
  return result;
};
