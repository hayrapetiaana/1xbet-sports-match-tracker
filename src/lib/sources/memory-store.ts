import { type NormalizedEvent, type SourceId } from "./model";

export type StoredEvent = NormalizedEvent & { lastSeenAt: Date };

export type StoredRun = {
  id: number;
  source: SourceId;
  startedAt: Date;
  finishedAt: Date | null;
  status: "running" | "success" | "partial" | "failed";
  sourceDomain: string | null;
  sportsCount: number;
  tasksTotal: number;
  tasksFailed: number;
  matchesCount: number;
  error: string | null;
};

type GlobalMemoryState = {
  events: Map<string, StoredEvent>;
  runs: Map<SourceId, StoredRun>;
  runIdCounter: number;
};

const globalForMemory = globalThis as typeof globalThis & {
  __matchMemoryStore?: GlobalMemoryState;
};

export const memoryStore: GlobalMemoryState =
  globalForMemory.__matchMemoryStore ?? {
    events: new Map(),
    runs: new Map(),
    runIdCounter: 1,
  };

globalForMemory.__matchMemoryStore = memoryStore;

export function getMemoryEventCount(): number {
  return memoryStore.events.size;
}

export function saveMemoryEvents(events: NormalizedEvent[], seenAt: Date): number {
  for (const event of events) {
    const key = `${event.source}:${event.externalId}`;
    memoryStore.events.set(key, { ...event, lastSeenAt: seenAt });
  }
  return events.length;
}

export function loadMemoryEvents(from: Date, to: Date): NormalizedEvent[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const matched: NormalizedEvent[] = [];

  for (const event of memoryStore.events.values()) {
    const time = event.startsAt.getTime();
    if (time >= fromMs && time <= toMs) {
      matched.push(event);
    }
  }

  return matched.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function loadMemoryUpcomingEvents(): NormalizedEvent[] {
  const nowMs = Date.now();
  const matched: NormalizedEvent[] = [];

  for (const event of memoryStore.events.values()) {
    if (event.startsAt.getTime() > nowMs) {
      matched.push(event);
    }
  }

  return matched.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function getMemoryCoverageUntil(): string | null {
  const nowMs = Date.now();
  let latestMs = 0;

  for (const event of memoryStore.events.values()) {
    const time = event.startsAt.getTime();
    if (time > nowMs && time > latestMs) {
      latestMs = time;
    }
  }

  return latestMs > 0 ? new Date(latestMs).toISOString() : null;
}

export function cleanOldMemoryEvents(olderThan: Date): void {
  const cutoff = olderThan.getTime();
  for (const [key, event] of memoryStore.events.entries()) {
    if (event.startsAt.getTime() < cutoff) {
      memoryStore.events.delete(key);
    }
  }
}

export function startMemoryRun(source: SourceId, startedAt: Date): StoredRun {
  const run: StoredRun = {
    id: memoryStore.runIdCounter++,
    source,
    startedAt,
    finishedAt: null,
    status: "running",
    sourceDomain: null,
    sportsCount: 0,
    tasksTotal: 0,
    tasksFailed: 0,
    matchesCount: 0,
    error: null,
  };
  memoryStore.runs.set(source, run);
  return run;
}

export function updateMemoryRun(source: SourceId, updates: Partial<StoredRun>): void {
  const existing = memoryStore.runs.get(source);
  if (existing) {
    Object.assign(existing, updates);
  } else {
    memoryStore.runs.set(source, {
      id: memoryStore.runIdCounter++,
      source,
      startedAt: new Date(),
      finishedAt: null,
      status: "running",
      sourceDomain: null,
      sportsCount: 0,
      tasksTotal: 0,
      tasksFailed: 0,
      matchesCount: 0,
      error: null,
      ...updates,
    });
  }
}

export function getMemoryLastRun(source: SourceId): StoredRun | null {
  return memoryStore.runs.get(source) ?? null;
}
