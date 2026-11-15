"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dictionaries, type Dict, type Lang } from "@/lib/i18n";
import MatchChecker from "./match-checker";

type LocalizedText = { en: string; ru: string };
type Relation = "primary" | "full" | "partial";
type Theme = "light" | "dark";
type Tab = "upcoming" | "started";

type Entry = {
  id: string;
  startsAt: string;
  sportKey: string;
  sportName: LocalizedText;
  leagueName: LocalizedText;
  home: LocalizedText;
  away: LocalizedText;
  matchType: "single" | "full" | "partial";
  sources: {
    source: string;
    externalId: string;
    home: LocalizedText;
    away: LocalizedText;
    league: LocalizedText;
    relation: Relation;
    sourceHost: string | null;
  }[];
};

type SportFacet = { key: string; name: LocalizedText; count: number };
type BookmakerFacet = {
  id: string;
  label: string;
  count: number;
  selected: boolean;
  lastStatus: string | null;
  lastError: string | null;
};

type SyncSource = {
  id: string;
  label: string;
  lastRun: {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    matchesCount: number;
    error: string | null;
    sourceDomain: string | null;
  } | null;
};

type SyncStatus = {
  running: boolean;
  progress: {
    source: string | null;
    phase: string;
    tasksTotal: number;
    tasksDone: number;
    tasksFailed: number;
    eventsSaved: number;
    error: string | null;
  };
  sources: SyncSource[];
  feedHealth: {
    lastGoodDomain: string | null;
    domains: { domain: string; ok: boolean | null; error: string | null }[];
  };
};

type ApiResponse = {
  tab: Tab;
  range: { from: string; to: string };
  total: number;
  truncated: boolean;
  entries: Entry[];
  facets: { sports: SportFacet[]; bookmakers: BookmakerFacet[] };
  coverageUntil: string | null;
  sync: SyncStatus;
  generatedAt: string;
};

const PRESET_HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PAGE_SIZE = 80;
const DAY_MS = 24 * 3600_000;
const MAX_CUSTOM_DAYS = 31;
const DEFAULT_GRACE = 10;
const MAX_GRACE = 60;
const LANG_STORAGE_KEY = "matches-lang";
const THEME_STORAGE_KEY = "matches-theme";
const GRACE_STORAGE_KEY = "matches-grace";

const SOURCE_NAMES: Record<string, string> = {
  "1xbet": "1xBet",
  fonbet: "Fonbet",
  bet365: "bet365",
  marathon: "Marathonbet",
  vbet: "Vbet",
  bwin: "bwin",
};
const SOURCE_SITES: Record<string, string> = {
  "1xbet": "https://1xbet.com",
  fonbet: "https://fonbet.by",
  bet365: "https://www.bet365.com",
  marathon: "https://www.marathonbet.com",
  vbet: "https://sport.vbet.am",
  bwin: "https://www.bwin.com",
};
const SOURCE_STYLES: Record<string, string> = {
  "1xbet": "bg-sky-100 text-sky-800 ring-sky-200",
  fonbet: "bg-violet-100 text-violet-800 ring-violet-200",
  bet365: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  marathon: "bg-lime-100 text-lime-800 ring-lime-200",
  vbet: "bg-orange-100 text-orange-800 ring-orange-200",
  bwin: "bg-slate-200 text-slate-800 ring-slate-300",
};

const SPORT_ICONS: Record<string, string> = {
  football: "⚽",
  futsal: "⚽",
  "e-football": "🎮",
  "ice-hockey": "🏒",
  bandy: "🏒",
  tennis: "🎾",
  squash: "🎾",
  basketball: "🏀",
  "e-basketball": "🎮",
  volleyball: "🏐",
  "table-tennis": "🏓",
  cricket: "🏏",
  "american-football": "🏈",
  esports: "🎮",
  handball: "🤾",
  baseball: "⚾",
  rugby: "🏉",
  "rugby-union": "🏉",
  "rugby-league": "🏉",
  boxing: "🥊",
  mma: "🥋",
  badminton: "🏸",
  darts: "🎯",
  snooker: "🎱",
  billiards: "🎱",
  pool: "🎱",
  golf: "⛳",
  chess: "♟️",
  "formula-1": "🏎️",
  "horse-racing": "🏇",
  floorball: "🏑",
  biathlon: "🎿",
  "alpine-skiing": "⛷️",
  sumo: "🤼",
  "water-polo": "🤽",
};

function sportIcon(key: string): string {
  return SPORT_ICONS[key] ?? "🏅";
}

function pick(text: LocalizedText, lang: Lang): string {
  return text[lang] || text.en;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalInput(date: Date): string {
  return `${dayKeyOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function sourceUrl(source: { source: string; sourceHost: string | null }): string {
  if (source.source === "1xbet" && source.sourceHost) return `https://${source.sourceHost}`;
  return SOURCE_SITES[source.source] ?? "#";
}

function statusOf(lastStatus: string | null): "ok" | "partial" | "failed" | "never" {
  if (lastStatus === "success") return "ok";
  if (lastStatus === "partial") return "partial";
  if (lastStatus === "failed") return "failed";
  return "never";
}

const STATUS_DOT: Record<string, string> = {
  ok: "bg-emerald-500",
  partial: "bg-amber-500",
  failed: "bg-rose-500",
  never: "bg-slate-400",
};

/** Accent colours alternate between time slots so each slot reads as its own block. */
const SLOT_ACCENT = ["border-l-emerald-500", "border-l-sky-500"];

function Countdown({ startsAt, t }: { startsAt: number; t: Dict }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = startsAt - now;
  if (remaining <= 0) {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
        {t.startingNow}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold tabular-nums text-white">
      <span className="opacity-70">{t.startsIn}</span>
      <span>{formatCountdown(remaining)}</span>
    </span>
  );
}

/** Time since kickoff, for matches in the Started tab. */
function Elapsed({ startedAt, t }: { startedAt: number; t: Dict }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = Math.max(0, now - startedAt);
  const label = elapsed < 60_000 ? t.justStarted : t.startedAgo(formatElapsed(elapsed));
  return (
    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold tabular-nums text-amber-900 ring-1 ring-inset ring-amber-300">
      {label}
    </span>
  );
}

function SyncCard({
  sync,
  t,
  now,
  refreshing,
  onRefresh,
}: {
  sync: SyncStatus;
  t: Dict;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { progress } = sync;
  const percent =
    progress.tasksTotal > 0 ? Math.min(100, Math.round((progress.tasksDone / progress.tasksTotal) * 100)) : 0;
  const activeLabel = sync.sources.find((source) => source.id === progress.source)?.label ?? progress.source;

  let progressText = t.syncStarting;
  if (progress.phase === "fetching") {
    progressText = `${activeLabel ? `${activeLabel} · ` : ""}${t.syncFetching(
      progress.tasksDone,
      progress.tasksTotal,
      progress.eventsSaved,
    )}`;
  } else if (progress.phase === "finishing") {
    progressText = t.syncFinishing;
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.sourcesTitle}</p>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sync.sources.map((source) => {
              const status = statusOf(source.lastRun?.status ?? null);
              const label =
                status === "ok"
                  ? t.statusOnline
                  : status === "partial"
                    ? t.statusPartial
                    : status === "failed"
                      ? t.statusFailed
                      : t.statusNever;
              const finished = source.lastRun?.finishedAt ?? source.lastRun?.startedAt;
              const minutesAgo = finished && now ? Math.round((now - Date.parse(finished)) / 60_000) : null;
              return (
                <div key={source.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{source.label}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                      {label}
                    </span>
                  </div>
                  {source.lastRun ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {t.matchesStored(source.lastRun.matchesCount)}
                      {minutesAgo !== null ? ` · ${t.timeAgo(Math.max(0, minutesAgo))}` : ""}
                    </p>
                  ) : null}
                  {status === "failed" && source.lastRun?.error ? (
                    <p className="mt-1 line-clamp-2 text-xs text-rose-700" title={source.lastRun.error}>
                      {source.lastRun.error}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {sync.feedHealth.domains.map((domain) => {
              const tone =
                domain.ok === true
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                  : domain.ok === false
                    ? "bg-rose-50 text-rose-800 ring-rose-200"
                    : "bg-slate-100 text-slate-600 ring-slate-200";
              return (
                <span
                  key={domain.domain}
                  title={domain.error ?? undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${tone}`}
                >
                  1xBet · {domain.domain} · {domain.ok === false ? t.domainOffline : domain.ok ? t.domainOnline : "—"}
                  {sync.feedHealth.lastGoodDomain === domain.domain ? ` · ${t.inUse}` : ""}
                </span>
              );
            })}
          </div>

          {sync.running ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-800">{progressText}</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                {progress.tasksTotal > 0 ? (
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
                ) : (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-400" />
                )}
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || sync.running}
          className="shrink-0 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {refreshing || sync.running ? t.syncing : t.refresh}
        </button>
      </div>
    </section>
  );
}

function EntryCard({ entry, lang, t }: { entry: Entry; lang: Lang; t: Dict }) {
  const partial = entry.matchType === "partial";

  return (
    <li className={`px-4 py-3 sm:px-5 ${partial ? "bg-amber-50/70" : ""}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">
            {pick(entry.home, lang)} <span className="font-normal text-slate-400">vs</span> {pick(entry.away, lang)}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            <span className="mr-1" aria-hidden>
              {sportIcon(entry.sportKey)}
            </span>
            {pick(entry.sportName, lang)} · {pick(entry.leagueName, lang)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {partial ? (
            <span
              title={t.partialHint}
              className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-300"
            >
              ⚠ {t.partialBadge}
            </span>
          ) : null}
          {entry.sources.map((source) => (
            <a
              key={`${source.source}-${source.externalId}`}
              href={sourceUrl(source)}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition hover:opacity-80 ${
                SOURCE_STYLES[source.source] ?? "bg-slate-100 text-slate-700 ring-slate-200"
              }`}
            >
              {SOURCE_NAMES[source.source] ?? source.source} ↗
            </a>
          ))}
          <span className="text-xs text-slate-500">
            {entry.sources.length > 1
              ? t.listedOnMany(entry.sources.length)
              : `${t.listedOnOne} ${SOURCE_NAMES[entry.sources[0]?.source] ?? ""}`}
          </span>
        </div>
      </div>

      {partial ? (
        <ul className="mt-2 space-y-1 rounded-lg bg-white p-2 text-xs ring-1 ring-inset ring-amber-200">
          {entry.sources.map((source) => {
            const mismatch = source.relation === "partial";
            return (
              <li
                key={`detail-${source.source}-${source.externalId}`}
                className={mismatch ? "font-medium text-amber-900" : "text-slate-600"}
              >
                <span className="font-semibold">{SOURCE_NAMES[source.source] ?? source.source}:</span>{" "}
                {pick(source.home, lang)} – {pick(source.away, lang)} {mismatch ? "⚠" : "✓"}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function IconButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100"
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}

function SettingsPanel({
  grace,
  t,
  onChange,
  onClose,
}: {
  grace: number;
  t: Dict;
  onChange: (value: number) => void;
  onClose: () => void;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">{t.settingsTitle}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          {t.close}
        </button>
      </div>

      <label className="mt-4 block text-sm">
        <span className="font-medium text-slate-800">{t.graceLabel}</span>
        <div className="mt-2 flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={MAX_GRACE}
            step={1}
            value={grace}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              onChange(Number.isNaN(parsed) ? 0 : Math.min(MAX_GRACE, Math.max(0, parsed)));
            }}
            className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <span className="text-sm text-slate-600">{t.graceUnit}</span>
        </div>
      </label>
      <p className="mt-2 text-xs text-slate-500">{t.graceHint}</p>
    </section>
  );
}

export default function MatchFinder() {
  const [lang, setLang] = useState<Lang>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [tab, setTab] = useState<Tab>("upcoming");
  const [grace, setGrace] = useState(DEFAULT_GRACE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [hours, setHours] = useState(2);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sportKeys, setSportKeys] = useState<string[]>([]);
  const [bookmakerIds, setBookmakerIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showCountdown, setShowCountdown] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);

  const t = dictionaries[lang];
  const locale = lang === "ru" ? "ru-RU" : "en-US";

  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }),
    [locale],
  );
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric" }),
    [locale],
  );
  const stampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );

  useEffect(() => {
    const savedLang = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (savedLang === "en" || savedLang === "ru") setLang(savedLang);
    const savedGrace = Number.parseInt(window.localStorage.getItem(GRACE_STORAGE_KEY) ?? "", 10);
    if (!Number.isNaN(savedGrace)) setGrace(Math.min(MAX_GRACE, Math.max(0, savedGrace)));
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const changeLang = (next: Lang) => {
    setLang(next);
    window.localStorage.setItem(LANG_STORAGE_KEY, next);
  };

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  };

  const changeGrace = (value: number) => {
    setGrace(value);
    window.localStorage.setItem(GRACE_STORAGE_KEY, String(value));
  };

  const switchTab = (next: Tab) => {
    setVisibleCount(PAGE_SIZE);
    setTab(next);
  };

  const customError: string | null = (() => {
    if (tab !== "upcoming" || mode !== "custom") return null;
    if (!customFrom || !customTo) return t.customMissing;
    const from = new Date(customFrom).getTime();
    const to = new Date(customTo).getTime();
    if (Number.isNaN(from) || Number.isNaN(to)) return t.customInvalid;
    if (to <= from) return t.customOrder;
    if (to - from > MAX_CUSTOM_DAYS * DAY_MS) return t.customTooLong;
    return null;
  })();

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (tab === "started") {
      params.set("grace", String(grace));
    } else if (mode === "preset") {
      params.set("hours", String(hours));
    } else if (customFrom && customTo) {
      params.set("from", new Date(customFrom).toISOString());
      params.set("to", new Date(customTo).toISOString());
    }
    if (sportKeys.length > 0) params.set("sports", sportKeys.join(","));
    if (bookmakerIds.length > 0) params.set("bookmakers", bookmakerIds.join(","));
    return params.toString();
  }, [tab, grace, mode, hours, customFrom, customTo, sportKeys, bookmakerIds]);

  const load = useCallback(async () => {
    if (customError) {
      setLoading(false);
      return;
    }
    try {
      // A timeout stops a request that never answers from leaving the page in a loading state.
      const response = await fetch(`/api/matches?${queryString}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? `Request failed (${response.status})`);
      setData(json as ApiResponse);
      setError(null);
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setLoading(false);
    }
  }, [queryString, customError]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncing = data?.sync.running ?? false;

  // Poll faster while a sync runs; the Started tab refreshes often so matches leave when their grace ends.
  useEffect(() => {
    const interval = syncing ? 3000 : tab === "started" ? 15000 : 30000;
    const id = window.setInterval(() => void load(), interval);
    return () => window.clearInterval(id);
  }, [load, syncing, tab]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const applyQuickRange = (days: number) => {
    const start = new Date();
    const end = new Date(start.getTime() + days * DAY_MS);
    setCustomFrom(toLocalInput(start));
    setCustomTo(toLocalInput(end));
    setVisibleCount(PAGE_SIZE);
  };

  const switchToCustom = () => {
    if (!customFrom || !customTo) applyQuickRange(1);
    setVisibleCount(PAGE_SIZE);
    setMode("custom");
  };

  const switchToPreset = (value: number) => {
    setVisibleCount(PAGE_SIZE);
    setMode("preset");
    setHours(value);
  };

  const toggleSport = (key: string) => {
    setVisibleCount(PAGE_SIZE);
    setSportKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const toggleBookmaker = (id: string) => {
    setVisibleCount(PAGE_SIZE);
    setBookmakerIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const entries = data?.entries ?? [];
  const searched = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((entry) =>
      [
        entry.home.en,
        entry.home.ru,
        entry.away.en,
        entry.away.ru,
        entry.leagueName.en,
        entry.leagueName.ru,
        entry.sportName.en,
        entry.sportName.ru,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [entries, search]);

  const visible = searched.slice(0, visibleCount);

  // Day -> time slot (exact kickoff minute) -> matches.
  type Slot = { minute: number; startsAt: number; time: string; entries: Entry[] };
  type Day = { key: string; label: string; count: number; slots: Slot[] };
  const referenceNow = now || Date.now();
  const todayKey = dayKeyOf(new Date(referenceNow));
  const tomorrowKey = dayKeyOf(new Date(referenceNow + DAY_MS));

  const days: Day[] = [];
  for (const entry of visible) {
    const date = new Date(entry.startsAt);
    const key = dayKeyOf(date);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      const base = dayFormatter.format(date);
      const label = key === todayKey ? `${t.today} · ${base}` : key === tomorrowKey ? `${t.tomorrow} · ${base}` : base;
      day = { key, label, count: 0, slots: [] };
      days.push(day);
    }
    const minute = Math.floor(date.getTime() / 60_000);
    let slot = day.slots[day.slots.length - 1];
    if (!slot || slot.minute !== minute) {
      slot = { minute, startsAt: date.getTime(), time: timeFormatter.format(date), entries: [] };
      day.slots.push(slot);
    }
    slot.entries.push(entry);
    day.count += 1;
  }

  const sportFacets = data?.facets.sports ?? [];
  const bookmakerFacets = data?.facets.bookmakers ?? [];
  const selectedSportNames = sportFacets
    .filter((facet) => sportKeys.includes(facet.key))
    .map((facet) => pick(facet.name, lang))
    .join(", ");

  const periodText =
    tab === "started" ? t.startedRange(grace) : mode === "preset" ? t.nextHours(hours) : t.selectedPeriod;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
            {t.eyebrow}
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-950 sm:text-4xl">{t.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{t.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200" aria-label={t.languageLabel}>
            {(["en", "ru"] as Lang[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => changeLang(code)}
                aria-pressed={lang === code}
                className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                  lang === code ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <IconButton label={t.settings} pressed={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>
            ⚙️
          </IconButton>
          <IconButton label={theme === "dark" ? t.lightTheme : t.darkTheme} onClick={toggleTheme}>
            {theme === "dark" ? "☀️" : "🌙"}
          </IconButton>
        </div>
      </header>

      <div className="mt-6 space-y-4">
        {settingsOpen ? (
          <SettingsPanel grace={grace} t={t} onChange={changeGrace} onClose={() => setSettingsOpen(false)} />
        ) : null}

        <MatchChecker lang={lang} />

        {data ? (
          <SyncCard sync={data.sync} t={t} now={now} refreshing={refreshing} onRefresh={refresh} />
        ) : null}

        <div className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200" role="tablist">
          {(["upcoming", "started"] as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => switchTab(value)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                tab === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {value === "upcoming" ? t.tabUpcoming : t.tabStarted}
            </button>
          ))}
        </div>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="space-y-5">
            {tab === "upcoming" ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.timePeriod}</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_HOURS.map((value) => {
                    const active = mode === "preset" && hours === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => switchToPreset(value)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                          active ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {lang === "ru" ? `${value} ч` : `${value}h`}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={switchToCustom}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                      mode === "custom"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100"
                    }`}
                  >
                    {t.customPeriod}
                  </button>
                </div>

                {mode === "custom" ? (
                  <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">{t.from}</span>
                      <input
                        type="datetime-local"
                        value={customFrom}
                        onChange={(event) => {
                          setCustomFrom(event.target.value);
                          setVisibleCount(PAGE_SIZE);
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-slate-700">{t.to}</span>
                      <input
                        type="datetime-local"
                        value={customTo}
                        onChange={(event) => {
                          setCustomTo(event.target.value);
                          setVisibleCount(PAGE_SIZE);
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: t.shortcut24h, days: 1 },
                        { label: t.shortcut3d, days: 3 },
                        { label: t.shortcut7d, days: 7 },
                      ].map((shortcut) => (
                        <button
                          key={shortcut.days}
                          type="button"
                          onClick={() => applyQuickRange(shortcut.days)}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-100"
                        >
                          {shortcut.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {customError ? <p className="mt-2 text-sm text-rose-700">{customError}</p> : null}
              </div>
            ) : (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.tabStarted}</p>
                <p className="text-sm text-slate-600">{t.startedRange(grace)}</p>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.bookmakers}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBookmakerIds([]);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    bookmakerIds.length === 0 ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {t.allBookmakers}
                </button>
                {bookmakerFacets.map((facet) => {
                  const active = bookmakerIds.includes(facet.id);
                  const status = statusOf(facet.lastStatus);
                  return (
                    <button
                      key={facet.id}
                      type="button"
                      onClick={() => toggleBookmaker(facet.id)}
                      aria-pressed={active}
                      title={facet.lastError ?? undefined}
                      className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                        active ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
                      {facet.label}
                      <span className="opacity-70">({facet.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.sports}</p>
                {sportKeys.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSportKeys([]);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {t.clearSelection}
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSportKeys([]);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    sportKeys.length === 0 ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {t.allSports} <span className="opacity-70">({data?.total ?? 0})</span>
                </button>
                {sportFacets.map((facet) => {
                  const active = sportKeys.includes(facet.key);
                  return (
                    <button
                      key={facet.key}
                      type="button"
                      onClick={() => toggleSport(facet.key)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                        active ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      <span aria-hidden>{sportIcon(facet.key)}</span>
                      {pick(facet.name, lang)}
                      <span className="opacity-70">({facet.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t.search}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 sm:w-72"
                />
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showCountdown}
                    onChange={(event) => setShowCountdown(event.target.checked)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  {tab === "started" ? t.showElapsed : t.showCountdown}
                </label>
              </div>
              <p className="text-sm text-slate-600">
                {selectedSportNames ? t.showingSports(selectedSportNames) : t.showingAll} · {periodText}
              </p>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
            {t.loadError}: {error}
          </div>
        ) : null}

        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
            <p className="text-sm font-semibold text-slate-900">
              {!data ? (error ? t.loadError : t.loadingMatches) : t.count(searched.length)}
            </p>
            {data?.coverageUntil && tab === "upcoming" ? (
              <p className="text-xs text-slate-500">
                {t.latestMatch}: {stampFormatter.format(new Date(data.coverageUntil))}
              </p>
            ) : null}
          </div>

          {data?.truncated ? (
            <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">
              {t.truncated(data.entries.length)}
            </p>
          ) : null}

          {customError ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">{t.fixCustom}</p>
          ) : days.length === 0 ? (
            !data && error ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium text-rose-700">{t.serverUnreachable}</p>
                <p className="mt-1 break-words text-xs text-slate-500">{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    void load();
                  }}
                  className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  {t.retry}
                </button>
              </div>
            ) : (
              <p className="px-5 py-12 text-center text-sm text-slate-500">
                {!data
                  ? t.loadingMatches
                  : tab === "started"
                    ? t.startedEmpty
                    : syncing && entries.length === 0
                      ? t.syncFirstRun
                      : t.noMatches}
              </p>
            )
          ) : (
            <div className="pb-2">
              {days.map((day) => (
                <div key={day.key} className="mt-2 first:mt-0">
                  <div className="sticky top-0 z-20 flex items-center gap-3 border-y border-slate-200 bg-white/95 px-5 py-2.5 backdrop-blur">
                    <span className="text-sm font-bold uppercase tracking-wide text-slate-900">{day.label}</span>
                    <span className="h-px flex-1 bg-slate-200" aria-hidden />
                    <span className="text-xs font-medium text-slate-500">{t.count(day.count)}</span>
                  </div>

                  <div className="space-y-3 p-3">
                    {day.slots.map((slot, slotIndex) => (
                      <section
                        key={slot.minute}
                        className={`overflow-hidden rounded-xl border border-slate-200 border-l-4 bg-white shadow-sm ${
                          SLOT_ACCENT[slotIndex % SLOT_ACCENT.length]
                        }`}
                      >
                        <header className="flex flex-wrap items-center gap-3 bg-slate-50 px-4 py-2.5">
                          <span className="text-2xl font-bold tabular-nums text-slate-950">{slot.time}</span>
                          {showCountdown ? (
                            tab === "started" ? (
                              <Elapsed startedAt={slot.startsAt} t={t} />
                            ) : (
                              <Countdown startsAt={slot.startsAt} t={t} />
                            )
                          ) : null}
                          <span className="ml-auto rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                            {t.count(slot.entries.length)}
                          </span>
                        </header>
                        <ul className="divide-y divide-slate-100">
                          {slot.entries.map((entry) => (
                            <EntryCard key={entry.id} entry={entry} lang={lang} t={t} />
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {searched.length > visibleCount ? (
            <div className="border-t border-slate-200 px-5 py-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                {t.showMore(searched.length - visibleCount)}
              </button>
            </div>
          ) : null}
        </section>

        <p className="text-center text-xs text-slate-500">{t.footer}</p>
      </div>
    </main>
  );
}
