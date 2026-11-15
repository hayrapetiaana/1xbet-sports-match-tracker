import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const databaseUrl = process.env.DATABASE_URL;

export const hasDatabase = Boolean(databaseUrl);

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __tablesCreated?: Promise<void>;
};

export function getPool(): Pool | null {
  if (!databaseUrl) return null;
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

export const pool: Pool | null = getPool();

export const db = pool ? drizzle(pool) : (null as unknown as ReturnType<typeof drizzle>);

/** Automatically creates tables if a Postgres database is connected */
export async function ensureTablesExist(): Promise<void> {
  if (!db) return;
  if (globalForDb.__tablesCreated) return globalForDb.__tablesCreated;

  globalForDb.__tablesCreated = (async () => {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS upcoming_events (
          id SERIAL PRIMARY KEY,
          source TEXT NOT NULL,
          external_id TEXT NOT NULL,
          sport_key TEXT NOT NULL,
          sport_name_en TEXT NOT NULL,
          sport_name_ru TEXT NOT NULL,
          league_name_en TEXT NOT NULL,
          league_name_ru TEXT NOT NULL,
          home_en TEXT NOT NULL,
          away_en TEXT NOT NULL,
          home_ru TEXT NOT NULL,
          away_ru TEXT NOT NULL,
          starts_at TIMESTAMPTZ NOT NULL,
          source_host TEXT,
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS upcoming_events_source_external_idx ON upcoming_events(source, external_id);
        CREATE INDEX IF NOT EXISTS upcoming_events_starts_at_idx ON upcoming_events(starts_at);
        CREATE INDEX IF NOT EXISTS upcoming_events_sport_key_idx ON upcoming_events(sport_key);

        CREATE TABLE IF NOT EXISTS sync_runs (
          id SERIAL PRIMARY KEY,
          source TEXT NOT NULL DEFAULT '1xbet',
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ,
          status TEXT NOT NULL,
          source_domain TEXT,
          sports_count INTEGER NOT NULL DEFAULT 0,
          tasks_total INTEGER NOT NULL DEFAULT 0,
          tasks_failed INTEGER NOT NULL DEFAULT 0,
          matches_count INTEGER NOT NULL DEFAULT 0,
          error TEXT
        );
      `);
    } catch (err) {
      console.warn("[db] Failed to ensure tables exist:", err);
    }
  })();

  return globalForDb.__tablesCreated;
}
