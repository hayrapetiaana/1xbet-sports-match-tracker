import { db, hasDatabase, ensureTablesExist } from "@/db";
import { upcomingEvents } from "@/db/schema";
import { and, asc, gt, gte, lte, max } from "drizzle-orm";
import { type NormalizedEvent, type SourceId } from "./model";
import {
  loadMemoryEvents,
  loadMemoryUpcomingEvents,
  getMemoryCoverageUntil,
} from "./memory-store";

type UpcomingRow = typeof upcomingEvents.$inferSelect;

function toEvent(row: UpcomingRow): NormalizedEvent {
  return {
    source: row.source as SourceId,
    externalId: row.externalId,
    sportKey: row.sportKey,
    sportName: { en: row.sportNameEn, ru: row.sportNameRu },
    leagueName: { en: row.leagueNameEn, ru: row.leagueNameRu },
    home: { en: row.homeEn, ru: row.homeRu },
    away: { en: row.awayEn, ru: row.awayRu },
    startsAt: row.startsAt,
    sourceHost: row.sourceHost,
  };
}

/** All stored upcoming events that start inside the range, across every bookmaker. */
export async function loadEvents(from: Date, to: Date): Promise<NormalizedEvent[]> {
  if (hasDatabase && db) {
    try {
      await ensureTablesExist();
      const rows = await db
        .select()
        .from(upcomingEvents)
        .where(and(gte(upcomingEvents.startsAt, from), lte(upcomingEvents.startsAt, to)))
        .orderBy(asc(upcomingEvents.startsAt));
      if (rows.length > 0) {
        return rows.map(toEvent);
      }
    } catch (err) {
      console.warn("[query] DB loadEvents failed, using in-memory store:", err);
    }
  }
  return loadMemoryEvents(from, to);
}

/** Every stored event that has not started yet (used by the match checker). */
export async function loadUpcomingEvents(): Promise<NormalizedEvent[]> {
  if (hasDatabase && db) {
    try {
      await ensureTablesExist();
      const rows = await db
        .select()
        .from(upcomingEvents)
        .where(gt(upcomingEvents.startsAt, new Date()))
        .orderBy(asc(upcomingEvents.startsAt));
      if (rows.length > 0) {
        return rows.map(toEvent);
      }
    } catch (err) {
      console.warn("[query] DB loadUpcomingEvents failed, using in-memory store:", err);
    }
  }
  return loadMemoryUpcomingEvents();
}

/** Latest upcoming start time currently stored (how far the schedule goes). */
export async function getCoverageUntil(): Promise<string | null> {
  if (hasDatabase && db) {
    try {
      await ensureTablesExist();
      const [row] = await db
        .select({ latest: max(upcomingEvents.startsAt) })
        .from(upcomingEvents)
        .where(gt(upcomingEvents.startsAt, new Date()));
      if (row?.latest) return row.latest.toISOString();
    } catch (err) {
      console.warn("[query] DB getCoverageUntil failed, using in-memory store:", err);
    }
  }
  return getMemoryCoverageUntil();
}
