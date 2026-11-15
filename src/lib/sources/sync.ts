import { db } from "@/db";
import { syncRuns, upcomingEvents } from "@/db/schema";
import { getFeedHealth } from "@/lib/onexbet/feed";
import { and, desc, eq, gt, lt, ne, sql } from "drizzle-orm";
import { bet365Adapter } from "./bet365";
import { marathonAdapter } from "./marathon";
import { vbetAdapter } from "./vbet";
import { bwinAdapter } from "./bwin";
import { fonbetAdapter } from "./fonbet";
import { onexbetAdapter } from "./onexbet";
import {
  describeError,
  mapWithConcurrency,
  SOURCE_IDS,
  SOURCE_LABELS,
  type NormalizedEvent,
  type SourceAdapter,
  type SourceId,
} from "./model";

/** Re-sync a bookmaker at most this often (triggered lazily by incoming requests). */
const FRESH_MS = 5 * 60_000;
/** Keep events that started up to this long ago, then drop them. */
const PAST_RETENTION_MS = 2 * 3600_000;
const INSERT_CHUNK = 500;

const ADAPTERS: SourceAdapter[] = [
  onexbetAdapter,
  fonbetAdapter,
  vbetAdapter,
  bet365Adapter,
  marathonAdapter,
  bwinAdapter,
];

export type SyncProgress = {
  source: SourceId | null;
  phase: "idle" | "loading" | "fetching" | "finishing" | "done" | "failed";
  startedAt: string | null;
  tasksTotal: number;
  tasksDone: number;
  tasksFailed: number;
  eventsSaved: number;
  error: string | null;
};

type SyncGlobal = { running: Promise<void> | null; progress: SyncProgress };

const globalForSync = globalThis as typeof globalThis & { __bookmakerSync?: SyncGlobal };

function idleProgress(): SyncProgress {
  return {
    source: null,
    phase: "idle",
    startedAt: null,
    tasksTotal: 0,
    tasksDone: 0,
    tasksFailed: 0,
    eventsSaved: 0,
    error: null,
  };
}

const syncState: SyncGlobal = globalForSync.__bookmakerSync ?? { running: null, progress: idleProgress() };
globalForSync.__bookmakerSync = syncState;

type UpcomingRow = typeof upcomingEvents.$inferInsert;

function toRow(event: NormalizedEvent, seenAt: Date): UpcomingRow {
  return {
    source: event.source,
    externalId: event.externalId,
    sportKey: event.sportKey,
    sportNameEn: event.sportName.en,
    sportNameRu: event.sportName.ru,
    leagueNameEn: event.leagueName.en,
    leagueNameRu: event.leagueName.ru,
    homeEn: event.home.en,
    awayEn: event.away.en,
    homeRu: event.home.ru || event.home.en,
    awayRu: event.away.ru || event.away.en,
    startsAt: event.startsAt,
    sourceHost: event.sourceHost,
    lastSeenAt: seenAt,
  };
}

async function saveEvents(events: NormalizedEvent[], seenAt: Date): Promise<number> {
  if (events.length === 0) return 0;
  // Postgres rejects duplicate keys inside one upsert, so de-duplicate first.
  const unique = new Map<string, UpcomingRow>();
  for (const event of events) unique.set(`${event.source}:${event.externalId}`, toRow(event, seenAt));
  const rows = [...unique.values()];

  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    await db
      .insert(upcomingEvents)
      .values(rows.slice(index, index + INSERT_CHUNK))
      .onConflictDoUpdate({
        target: [upcomingEvents.source, upcomingEvents.externalId],
        set: {
          sportKey: sql`excluded.sport_key`,
          sportNameEn: sql`excluded.sport_name_en`,
          sportNameRu: sql`excluded.sport_name_ru`,
          leagueNameEn: sql`excluded.league_name_en`,
          leagueNameRu: sql`excluded.league_name_ru`,
          homeEn: sql`excluded.home_en`,
          awayEn: sql`excluded.away_en`,
          homeRu: sql`excluded.home_ru`,
          awayRu: sql`excluded.away_ru`,
          startsAt: sql`excluded.starts_at`,
          sourceHost: sql`excluded.source_host`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      });
  }
  return rows.length;
}

async function runSource(adapter: SourceAdapter): Promise<void> {
  const startedAt = new Date();
  const progress = syncState.progress;
  Object.assign(progress, {
    source: adapter.id,
    phase: "loading",
    startedAt: startedAt.toISOString(),
    tasksTotal: 0,
    tasksDone: 0,
    tasksFailed: 0,
    eventsSaved: 0,
    error: null,
  });

  const [run] = await db
    .insert(syncRuns)
    .values({ source: adapter.id, status: "running", startedAt })
    .returning({ id: syncRuns.id });

  let host: string | null = null;
  let firstError: string | null = null;

  try {
    const tasks = await adapter.createTasks();
    progress.phase = "fetching";
    progress.tasksTotal = tasks.length;

    await mapWithConcurrency(tasks, adapter.concurrency, async (task) => {
      try {
        const events = await task.run();
        const saved = await saveEvents(events, startedAt);
        progress.eventsSaved += saved;
        if (events[0]?.sourceHost) host = events[0].sourceHost;
      } catch (error) {
        progress.tasksFailed += 1;
        firstError ??= describeError(error);
      } finally {
        progress.tasksDone += 1;
      }
    });

    // Housekeeping: drop finished events, and drop events this bookmaker no longer lists
    // (only when every request succeeded, so a partial outage never wipes good data).
    progress.phase = "finishing";
    const now = new Date();
    await db
      .delete(upcomingEvents)
      .where(
        and(
          eq(upcomingEvents.source, adapter.id),
          lt(upcomingEvents.startsAt, new Date(now.getTime() - PAST_RETENTION_MS)),
        ),
      );
    if (progress.tasksFailed === 0) {
      await db
        .delete(upcomingEvents)
        // Only drop events that were cancelled or moved before kickoff. Started events stay so the
        // Started tab can show them during the grace period.
        .where(
          and(
            eq(upcomingEvents.source, adapter.id),
            lt(upcomingEvents.lastSeenAt, startedAt),
            gt(upcomingEvents.startsAt, now),
          ),
        );
    }

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(upcomingEvents)
      .where(and(eq(upcomingEvents.source, adapter.id), gt(upcomingEvents.startsAt, now)));

    const status = progress.tasksFailed === 0 ? "success" : total > 0 ? "partial" : "failed";
    const sourceDomain = host ?? (adapter.id === "1xbet" ? getFeedHealth().lastGoodDomain : null);

    await db
      .update(syncRuns)
      .set({
        status,
        finishedAt: new Date(),
        sourceDomain,
        tasksTotal: progress.tasksTotal,
        tasksFailed: progress.tasksFailed,
        matchesCount: total,
        error: firstError,
      })
      .where(eq(syncRuns.id, run.id));

    progress.phase = status === "failed" ? "failed" : "done";
    progress.error = status === "failed" ? firstError : null;
  } catch (error) {
    // The bookmaker is unavailable (e.g. blocked). Existing stored events stay untouched.
    const message = describeError(error);
    progress.phase = "failed";
    progress.error = message;
    await db
      .update(syncRuns)
      .set({ status: "failed", finishedAt: new Date(), error: message })
      .where(eq(syncRuns.id, run.id));
  }
}

async function getLastFinishedRun(source: SourceId) {
  const [row] = await db
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.source, source), ne(syncRuns.status, "running")))
    .orderBy(desc(syncRuns.id))
    .limit(1);
  return row ?? null;
}

/**
 * Start a background sync over all bookmakers when none is running. Bookmakers synced within
 * FRESH_MS are skipped unless `force` is set. Returns immediately; use getSyncStatus() for progress.
 */
export function ensureFreshSync(options: { force?: boolean } = {}): void {
  if (syncState.running) return;

  const force = options.force ?? false;
  syncState.running = (async () => {
    for (const adapter of ADAPTERS) {
      if (!force) {
        const last = await getLastFinishedRun(adapter.id);
        if (last?.finishedAt && Date.now() - last.finishedAt.getTime() < FRESH_MS) continue;
      }
      await runSource(adapter);
    }
  })()
    .catch((error) => {
      console.error("[bookmaker-sync] sync failed", error);
    })
    .finally(() => {
      syncState.running = null;
      syncState.progress.source = null;
      if (syncState.progress.phase !== "failed") syncState.progress.phase = "idle";
    });
}

export async function getSyncStatus() {
  const sources = await Promise.all(
    SOURCE_IDS.map(async (id) => {
      const [lastRun] = await db
        .select()
        .from(syncRuns)
        .where(and(eq(syncRuns.source, id), ne(syncRuns.status, "running")))
        .orderBy(desc(syncRuns.id))
        .limit(1);
      return { id, label: SOURCE_LABELS[id], lastRun: lastRun ?? null };
    }),
  );

  return {
    running: syncState.running !== null,
    progress: syncState.progress,
    sources,
    feedHealth: getFeedHealth(),
  };
}
