/**
 * Shared types and helpers for all bookmaker sources:
 * a normalized event shape, sport canonicalization and team-name similarity.
 */

export type SourceId = "1xbet" | "fonbet" | "bet365" | "marathon" | "vbet" | "bwin";

export const SOURCE_IDS: readonly SourceId[] = ["1xbet", "fonbet", "bet365", "marathon", "vbet", "bwin"];

export const SOURCE_LABELS: Record<SourceId, string> = {
  "1xbet": "1xBet",
  fonbet: "Fonbet",
  bet365: "bet365",
  marathon: "Marathonbet",
  vbet: "Vbet",
  bwin: "bwin",
};

export type LocalizedText = { en: string; ru: string };

export type NormalizedEvent = {
  source: SourceId;
  externalId: string;
  sportKey: string;
  sportName: LocalizedText;
  leagueName: LocalizedText;
  home: LocalizedText;
  away: LocalizedText;
  startsAt: Date;
  sourceHost: string | null;
};

export type SourceTask = {
  label: string;
  run: () => Promise<NormalizedEvent[]>;
};

export type SourceAdapter = {
  id: SourceId;
  /** How many tasks may run at the same time. */
  concurrency: number;
  /** Lists the work to do (leagues, listings). Throws when the source is unavailable. */
  createTasks: () => Promise<SourceTask[]>;
};

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

export function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  return Promise.all(runners).then(() => undefined);
}

/** Canonical sport labels (used for display and for matching sports across bookmakers). */
const SPORT_LABELS: Record<string, LocalizedText> = {
  football: { en: "Football", ru: "Футбол" },
  "ice-hockey": { en: "Ice Hockey", ru: "Хоккей" },
  tennis: { en: "Tennis", ru: "Теннис" },
  basketball: { en: "Basketball", ru: "Баскетбол" },
  volleyball: { en: "Volleyball", ru: "Волейбол" },
  "table-tennis": { en: "Table Tennis", ru: "Настольный теннис" },
  cricket: { en: "Cricket", ru: "Крикет" },
  "american-football": { en: "American Football", ru: "Американский футбол" },
  esports: { en: "Esports", ru: "Киберспорт" },
  handball: { en: "Handball", ru: "Гандбол" },
  futsal: { en: "Futsal", ru: "Футзал" },
  baseball: { en: "Baseball", ru: "Бейсбол" },
  rugby: { en: "Rugby", ru: "Регби" },
  boxing: { en: "Boxing", ru: "Бокс" },
  mma: { en: "MMA / UFC", ru: "ММА / UFC" },
  badminton: { en: "Badminton", ru: "Бадминтон" },
  darts: { en: "Darts", ru: "Дартс" },
  snooker: { en: "Snooker", ru: "Снукер" },
  billiards: { en: "Billiards", ru: "Бильярд" },
  "water-polo": { en: "Water Polo", ru: "Водное поло" },
  golf: { en: "Golf", ru: "Гольф" },
  chess: { en: "Chess", ru: "Шахматы" },
  "formula-1": { en: "Formula 1", ru: "Формула 1" },
  "horse-racing": { en: "Horse Racing", ru: "Конный спорт" },
  floorball: { en: "Floorball", ru: "Флорбол" },
  bandy: { en: "Bandy", ru: "Бенди" },
  biathlon: { en: "Biathlon", ru: "Биатлон" },
  "alpine-skiing": { en: "Alpine Skiing", ru: "Горные лыжи" },
  sumo: { en: "Sumo", ru: "Сумо" },
};

/** Source sport names that map to a different canonical key. */
const SPORT_ALIASES: Record<string, string> = {
  hockey: "ice-hockey",
  "mix. fights": "mma",
  mma: "mma",
  ufc: "mma",
  billiard: "billiards",
  "alpine ski": "alpine-skiing",
  soccer: "football",
};

/** Maps a sport name as written in pasted text (English or Russian) to a canonical key. */
export function sportKeyFromText(text: string): string | null {
  const needle = text.trim().toLowerCase().replace(/ё/g, "е");
  if (!needle) return null;
  for (const [key, labels] of Object.entries(SPORT_LABELS)) {
    if (labels.en.toLowerCase() === needle || labels.ru.toLowerCase().replace(/ё/g, "е") === needle) {
      return key;
    }
  }
  if (needle === "мма") return "mma";
  return SPORT_ALIASES[needle] ?? null;
}

export function resolveSport(sourceEn: string, sourceRu?: string | null): { key: string; name: LocalizedText } {
  const trimmed = sourceEn.trim();
  const lower = trimmed.toLowerCase();
  const key = SPORT_ALIASES[lower] ?? (lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "other");
  const name = SPORT_LABELS[key] ?? { en: trimmed, ru: (sourceRu ?? "").trim() || trimmed };
  return { key, name };
}

/** Lowercase, strip accents and punctuation, and drop bracketed nicknames and club prefixes. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(fc|cf|sc|ac|afc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** 1 = identical, 0 = completely different (based on normalized Levenshtein distance). */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}
