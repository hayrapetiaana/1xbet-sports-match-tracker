import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function getPool(): Pool {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required to execute database operations");
  }
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: databaseUrl,
    });
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

export const pool: Pool = databaseUrl
  ? (globalForDb.__arenaNextJsPostgresqlPool ??
     new Pool({
       connectionString: databaseUrl,
     }))
  : (new Proxy({} as Pool, {
      get(_target, prop) {
        return (getPool() as any)[prop];
      },
    }));

if (databaseUrl && process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = databaseUrl
  ? drizzle(pool)
  : (new Proxy({} as ReturnType<typeof drizzle>, {
      get(_target, prop) {
        const activePool = getPool();
        const activeDb = drizzle(activePool);
        return (activeDb as any)[prop];
      },
    }));

