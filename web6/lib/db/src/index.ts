import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Lazy initialization
//
// DATABASE_URL is validated on first query, NOT at module load time.
// This keeps routes that don't use the database (e.g. GET /v1/challenge-plans)
// available even when DATABASE_URL has not been configured yet, rather than
// crashing the entire server on startup.
// ---------------------------------------------------------------------------

type DbInstance = {
  pool: pg.Pool;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

let _instance: DbInstance | null = null;

function getInstance(): DbInstance {
  if (_instance) return _instance;

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  _instance = { pool, db };
  return _instance;
}

export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_, prop: string | symbol) {
    return (getInstance().pool as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const db: ReturnType<typeof drizzle<typeof schema>> = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_, prop: string | symbol) {
      return (getInstance().db as unknown as Record<string | symbol, unknown>)[prop];
    },
  },
);

export * from "./schema";
