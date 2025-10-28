import { Pool, QueryResultRow } from "pg";
export declare const getPool: () => Pool;
export declare const query: <T extends QueryResultRow = any>(text: string, params?: (string | number | boolean | null | Date)[]) => Promise<import("pg").QueryResult<T>>;
//# sourceMappingURL=postgres.d.ts.map