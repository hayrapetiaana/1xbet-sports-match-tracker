import { loadEvents, getCoverageUntil } from "@/lib/sources/query";
import { mergeEvents } from "@/lib/sources/merge";
import { ensureFreshSync, getSyncStatus } from "@/lib/sources/sync";
import { SOURCE_IDS, SOURCE_LABELS, type SourceId } from "@/lib/sources/model";

export const dynamic = "force-dynamic";

const MAX_PRESET_HOURS = 12;
const MAX_CUSTOM_RANGE_MS = 31 * 24 * 3600_000;
const MAX_ENTRIES = 5000;
const DEFAULT_GRACE_MINUTES = 10;
const MAX_GRACE_MINUTES = 60;

type Tab = "upcoming" | "started";

function parseSportKeys(raw: string | null): string[] {
  if (!raw) return [];
  const keys = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => /^[a-z0-9-]{1,40}$/.test(part));
  return [...new Set(keys)];
}

function parseBookmakers(raw: string | null): SourceId[] {
  if (!raw) return [];
  const requested = raw.split(",").map((part) => part.trim().toLowerCase());
  return SOURCE_IDS.filter((id) => requested.includes(id));
}

function parseGrace(params: URLSearchParams): number {
  const raw = params.get("grace");
  if (raw === null) return DEFAULT_GRACE_MINUTES;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return DEFAULT_GRACE_MINUTES;
  return Math.min(MAX_GRACE_MINUTES, Math.max(0, value));
}

function parseRange(params: URLSearchParams, tab: Tab): { from: Date; to: Date } | { error: string } {
  // Started tab: matches that began within the grace period, up to now.
  if (tab === "started") {
    const now = Date.now();
    const grace = parseGrace(params);
    return { from: new Date(now - grace * 60_000), to: new Date(now) };
  }

  // Upcoming tab: from now, for a preset number of hours or a custom period.
  const fromParam = params.get("from");
  const toParam = params.get("to");

  if (fromParam || toParam) {
    if (!fromParam || !toParam) return { error: "Both 'from' and 'to' are required for a custom period." };
    const from = new Date(fromParam);
    const to = new Date(toParam);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { error: "'from' and 'to' must be valid dates." };
    }
    if (to.getTime() <= from.getTime()) return { error: "'to' must be later than 'from'." };
    if (to.getTime() - from.getTime() > MAX_CUSTOM_RANGE_MS) {
      return { error: "Custom periods can be at most 31 days." };
    }
    return { from, to };
  }

  const hours = Number.parseInt(params.get("hours") ?? "2", 10);
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_PRESET_HOURS) {
    return { error: `'hours' must be an integer between 1 and ${MAX_PRESET_HOURS}.` };
  }
  const from = new Date();
  return { from, to: new Date(from.getTime() + hours * 3600_000) };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const tab: Tab = params.get("tab") === "started" ? "started" : "upcoming";
  const range = parseRange(params, tab);
  if ("error" in range) {
    return Response.json({ error: range.error }, { status: 400 });
  }

  const sportKeys = parseSportKeys(params.get("sports"));
  const selectedBookmakers = parseBookmakers(params.get("bookmakers"));
  const bookmakers: SourceId[] = selectedBookmakers.length > 0 ? selectedBookmakers : [...SOURCE_IDS];

  // Refresh bookmaker feeds in the background when stale; the response uses what is stored now.
  ensureFreshSync();

  const [events, coverageUntil, sync] = await Promise.all([
    loadEvents(range.from, range.to),
    getCoverageUntil(),
    getSyncStatus(),
  ]);

  const rawCounts: Record<string, number> = {};
  for (const event of events) rawCounts[event.source] = (rawCounts[event.source] ?? 0) + 1;

  // Merge only the selected bookmakers, so labels and partial flags reflect what the user chose.
  const scoped = events.filter((event) => bookmakers.includes(event.source));
  const merged = mergeEvents(scoped);

  const sportMap = new Map<string, { key: string; name: { en: string; ru: string }; count: number }>();
  for (const entry of merged) {
    const existing = sportMap.get(entry.sportKey);
    if (existing) existing.count += 1;
    else sportMap.set(entry.sportKey, { key: entry.sportKey, name: entry.sportName, count: 1 });
  }
  const sportFacets = [...sportMap.values()].sort((a, b) => b.count - a.count);

  const filtered = sportKeys.length > 0 ? merged.filter((entry) => sportKeys.includes(entry.sportKey)) : merged;
  // Upcoming: soonest first. Started: most recently started first.
  const ordered = tab === "started" ? [...filtered].reverse() : filtered;

  const bookmakerFacets = SOURCE_IDS.map((id) => {
    const status = sync.sources.find((source) => source.id === id);
    return {
      id,
      label: SOURCE_LABELS[id],
      count: rawCounts[id] ?? 0,
      selected: bookmakers.includes(id),
      lastStatus: status?.lastRun?.status ?? null,
      lastError: status?.lastRun?.error ?? null,
    };
  });

  return Response.json(
    {
      tab,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      total: ordered.length,
      truncated: ordered.length > MAX_ENTRIES,
      entries: ordered.slice(0, MAX_ENTRIES),
      facets: { sports: sportFacets, bookmakers: bookmakerFacets },
      coverageUntil,
      sync,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
