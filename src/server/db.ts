import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const g = globalThis as unknown as { pgPool?: Pool };
const pool =
  g.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 3_000,
  });
if (!g.pgPool) {
  // Idle clients can disconnect during failover. pg recycles them automatically.
  pool.on("error", () => console.error("[postgres] idle connection lost"));
  g.pgPool = pool;
}

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
