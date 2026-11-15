export type Lang = "en" | "ru";

/** Russian plural form: 1 матч, 2 матча, 5 матчей. */
function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

const en = {
  eyebrow: "Prematch schedule",
  title: "Upcoming matches",
  subtitle:
    "Matches that have not started yet, collected from 1xBet, Fonbet and bet365. A match listed by several bookmakers is shown once, with a label for each.",
  languageLabel: "Language",
  darkTheme: "Dark theme",
  tabUpcoming: "Upcoming",
  tabStarted: "Started",
  settings: "Settings",
  settingsTitle: "Settings",
  graceLabel: "Keep started matches visible for",
  graceUnit: "minutes",
  graceHint: "Matches stay in the Started tab for this long after their start time (0–60 minutes).",
  close: "Close",
  startedAgo: (time: string) => `started ${time} ago`,
  justStarted: "just started",
  showElapsed: "Show time since start",
  startedEmpty:
    "No matches started within the grace period. Increase the time in Settings to keep them visible longer.",
  startedRange: (minutes: number) =>
    `Matches that started in the last ${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
  lightTheme: "Light theme",
  timePeriod: "Time period",
  customPeriod: "Custom period",
  from: "From",
  to: "To",
  shortcut24h: "Next 24 h",
  shortcut3d: "Next 3 days",
  shortcut7d: "Next 7 days",
  customMissing: "Choose both a start and an end time.",
  customInvalid: "Enter valid dates.",
  customOrder: "The end time must be after the start time.",
  customTooLong: "Custom periods can be at most 31 days.",
  fixCustom: "Fix the custom period to see matches.",
  bookmakers: "Bookmakers",
  allBookmakers: "All bookmakers",
  sports: "Sports",
  allSports: "All sports",
  clearSelection: "Clear selection",
  search: "Search team, league or sport…",
  showCountdown: "Show countdown",
  startsIn: "starts in",
  startingNow: "starting now",
  partialBadge: "Partial match",
  partialHint: "Only one team name matches between the bookmakers. Check the names listed below.",
  listedOnOne: "Only on",
  listedOnMany: (n: number) => `Listed by ${n} bookmakers`,
  sourcesTitle: "Bookmaker feeds",
  statusOnline: "Online",
  statusPartial: "Partial",
  statusFailed: "Unavailable",
  statusNever: "Not synced yet",
  domainOnline: "online",
  domainOffline: "unavailable",
  inUse: "in use",
  refresh: "Refresh now",
  syncing: "Syncing…",
  syncFetching: (done: number, total: number, saved: number) =>
    `Loading ${done} of ${total} feeds · ${saved.toLocaleString("en-US")} events saved`,
  syncStarting: "Loading the schedule from the bookmakers…",
  syncFinishing: "Finishing the sync…",
  syncFirstRun: "Loading the first matches. The first sync takes about a minute.",
  lastSync: "Last sync",
  timeAgo: (minutes: number) =>
    minutes < 1
      ? "just now"
      : minutes < 60
        ? `${minutes} min ago`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)} h ago`
          : `${Math.floor(minutes / 1440)} d ago`,
  matchesStored: (n: number) => `${n.toLocaleString("en-US")} upcoming events stored`,
  latestMatch: "Latest scheduled match",
  count: (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "match" : "matches"}`,
  found: "found",
  nextHours: (n: number) => `the next ${n} ${n === 1 ? "hour" : "hours"}`,
  selectedPeriod: "the selected period",
  showingAll: "Showing all sports",
  showingSports: (names: string) => `Showing ${names}`,
  noMatches:
    "No upcoming matches for this period and filters. Try a longer period or other sports or bookmakers.",
  loadingMatches: "Loading matches…",
  truncated: (max: number) => `Showing the first ${max} matches. Narrow the period or filters to see the rest.`,
  showMore: (left: number) => `Show more (${left} left)`,
  loadError: "Could not load matches",
  retry: "Try again",
  serverUnreachable: "The server did not answer. It may be restarting; the page will retry automatically.",
  today: "Today",
  tomorrow: "Tomorrow",
  footer:
    "Prematch fixtures only (no live games). Times are shown in your local timezone. Open a match on the bookmaker's site to see odds and place bets.",
};

export type Dict = typeof en;

const ru: Dict = {
  eyebrow: "Предматчевая линия",
  title: "Ближайшие матчи",
  subtitle:
    "Матчи, которые ещё не начались: данные 1xBet, Fonbet и bet365. Матч, который есть у нескольких букмекеров, показан один раз с пометкой каждого.",
  languageLabel: "Язык",
  darkTheme: "Тёмная тема",
  tabUpcoming: "Предстоящие",
  tabStarted: "Начались",
  settings: "Настройки",
  settingsTitle: "Настройки",
  graceLabel: "Показывать начавшиеся матчи",
  graceUnit: "мин",
  graceHint: "Матчи остаются во вкладке «Начались» столько времени после начала (0–60 минут).",
  close: "Закрыть",
  startedAgo: (time: string) => `начался ${time} назад`,
  justStarted: "только что начался",
  showElapsed: "Время с начала матча",
  startedEmpty:
    "За время ожидания ничего не началось. Увеличьте время в настройках, чтобы показывать матчи дольше.",
  startedRange: (minutes: number) => `Матчи, которые начались за последние ${minutes} мин`,
  lightTheme: "Светлая тема",
  timePeriod: "Период",
  customPeriod: "Свой период",
  from: "С",
  to: "По",
  shortcut24h: "Ближайшие 24 ч",
  shortcut3d: "Ближайшие 3 дня",
  shortcut7d: "Ближайшие 7 дней",
  customMissing: "Укажите начало и конец периода.",
  customInvalid: "Введите корректные даты.",
  customOrder: "Конец периода должен быть позже начала.",
  customTooLong: "Свой период может быть не длиннее 31 дня.",
  fixCustom: "Исправьте период, чтобы увидеть матчи.",
  bookmakers: "Букмекеры",
  allBookmakers: "Все букмекеры",
  sports: "Виды спорта",
  allSports: "Все виды спорта",
  clearSelection: "Сбросить выбор",
  search: "Поиск по команде, лиге или виду спорта…",
  showCountdown: "Обратный отсчёт",
  startsIn: "начало через",
  startingNow: "начинается",
  partialBadge: "Частичное совпадение",
  partialHint: "У букмекеров совпадает только одна команда. Проверьте названия ниже.",
  listedOnOne: "Только у",
  listedOnMany: (n: number) => `Есть у ${n} букмекеров`,
  sourcesTitle: "Источники линии",
  statusOnline: "Работает",
  statusPartial: "Частично",
  statusFailed: "Недоступен",
  statusNever: "Ещё не загружен",
  domainOnline: "работает",
  domainOffline: "недоступен",
  inUse: "используется",
  refresh: "Обновить",
  syncing: "Обновление…",
  syncFetching: (done: number, total: number, saved: number) =>
    `Загружено ${done} из ${total} источников · сохранено ${saved.toLocaleString("ru-RU")} событий`,
  syncStarting: "Загрузка линии у букмекеров…",
  syncFinishing: "Завершаем обновление…",
  syncFirstRun: "Загружаем первые матчи. Первое обновление занимает около минуты.",
  lastSync: "Последнее обновление",
  timeAgo: (minutes: number) =>
    minutes < 1
      ? "только что"
      : minutes < 60
        ? `${minutes} мин назад`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)} ч назад`
          : `${Math.floor(minutes / 1440)} дн назад`,
  matchesStored: (n: number) => `Сохранено событий: ${n.toLocaleString("ru-RU")}`,
  latestMatch: "Последний матч в расписании",
  count: (n: number) => `${n.toLocaleString("ru-RU")} ${plural(n, ["матч", "матча", "матчей"])}`,
  found: "найдено",
  nextHours: (n: number) => `ближайшие ${n} ${plural(n, ["час", "часа", "часов"])}`,
  selectedPeriod: "выбранный период",
  showingAll: "Показаны все виды спорта",
  showingSports: (names: string) => `Показаны: ${names}`,
  noMatches:
    "Нет предстоящих матчей для этого периода и фильтров. Попробуйте период подлиннее или другие виды спорта и букмекеров.",
  loadingMatches: "Загрузка матчей…",
  truncated: (max: number) => `Показаны первые ${max} матчей. Сузьте период или фильтры, чтобы увидеть остальные.`,
  showMore: (left: number) => `Показать ещё (осталось ${left})`,
  loadError: "Не удалось загрузить матчи",
  retry: "Повторить",
  serverUnreachable: "Сервер не отвечает. Возможно, он перезапускается; страница повторит запрос автоматически.",
  today: "Сегодня",
  tomorrow: "Завтра",
  footer:
    "Только предматчевые события (без лайва). Время показано в вашем часовом поясе. Откройте матч на сайте букмекера, чтобы увидеть коэффициенты и сделать ставку.",
};

export const dictionaries: Record<Lang, Dict> = { en, ru };
