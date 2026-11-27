import type {
  AlertLogItem,
  AlertsSubView,
  AppSettings,
  ChartMode,
  CurrencyCode,
  DeskLayoutMode,
  ForecastJournalEntry,
  HistoricalTwinsSummary,
  HistoryPoint,
  LangCode,
  LogDir,
  MarketsSubView,
  NewsTopicKey,
  OutlookData,
  OutlookSubView,
  SessionAlertedState,
  SpaceWeatherData,
  StackLot,
  StackSubView,
  TimeframeKey,
  TradeSubView,
  VaultThemeId,
} from '../types/bullion';
import { clampNum, DEAL_PRESETS } from './format';

export const ANON_FETCH_OPTS: RequestInit = {
  cache: 'no-store',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
};

export const ALLOWED_CURRENCIES = new Set<CurrencyCode>([
  'USD', 'CAD', 'EUR', 'GBP', 'CHF', 'AUD', 'MXN', 'INR', 'CNY', 'JPY',
  'THB', 'LAK', 'SGD', 'HKD', 'KRW', 'VND', 'IDR', 'AED', 'SAR', 'TRY', 'ZAR',
]);

export const ALLOWED_TIMEFRAMES = new Set<TimeframeKey>([
  '15min', '1h', '4h', '1d', '7d', '1m', '6m', '1y', '5y', '10y', 'all',
]);

export const INTRADAY_TIMEFRAMES = new Set<TimeframeKey>(['15min', '1h', '4h', '1d']);
export const ALLOWED_LOG_DIRS = new Set<LogDir>(['up', 'down', 'neutral']);
export const ALLOWED_THEMES = new Set<VaultThemeId>([
  'dark', 'light', 'oled', 'swiss-gold', 'mint-silver', 'terminal-amber', 'daylight-paper',
]);
export const ALLOWED_LANGUAGES = new Set<LangCode>(['en', 'th', 'lo', 'es', 'zh', 'ja', 'hi']);
export const ALLOWED_DESK_LAYOUTS = new Set<DeskLayoutMode>(['auto', 'single', 'split', 'ultrawide']);
export const ALLOWED_NEURAL_VOICE_IDS = new Set<string>([
  'en_US-lessac-medium',
  'en_US-ryan-medium',
  'en_US-amy-medium',
  'en_US-hfc_female-medium',
  'en_US-hfc_male-medium',
  'en_GB-alba-medium',
]);

const ALLOWED_MARKETS_SUB = new Set<MarketsSubView>(['live', 'global', 'charts', 'news']);
const ALLOWED_OUTLOOK_SUB = new Set<OutlookSubView>(['forecast', 'drivers', 'vaults', 'sim']);
const ALLOWED_TRADE_SUB = new Set<TradeSubView>(['swap', 'ladder', 'grader']);
const ALLOWED_STACK_SUB = new Set<StackSubView>(['overview', 'goals', 'lots']);
const ALLOWED_ALERTS_SUB = new Set<AlertsSubView>(['display', 'rules', 'phone', 'setup']);

const NEWS_TOPIC_RE = /^(all|central_banks|tech_solar_ai|vaults_physical|asia_retail|geo_space|macro_debt|miners_supply)$/;

export const DEFAULT_SETTINGS: AppSettings = {
  goldThreshold: 1.5,
  silverThreshold: 3.0,
  shanghaiThreshold: 35,
  direction: 'both',
  ntfyTopic: '',
  unit: 'oz',
  currency: 'USD',
  privacyMode: false,
  ttsVoice: 'auto',
  ttsRate: 0.96,
  theme: 'dark',
  language: 'en',
  deskLayout: 'auto',
  oledPixelShift: false,
  selectedMetal: 'gold',
  chartMode: 'gold',
  confirmMoves: false,
  showForecast: true,
  showDiscovery: true,
  showSqueeze: true,
  showFib: false,
  showSma: false,
  showRsi: false,
  showMyBuys: false,
  showPatterns: false,
  showGaps: true,
  showSessions: true,
  showNewsDots: false,
  newsFilter: 'all',
  newsTopic: 'all',
  dealerQuotes: {
    goldStreetOz: null,
    silverStreetOz: null,
  },
  forecastJournal: [],
  chartTimeframe: '1d',
  stack: {
    goldOz: '',
    goldCost: '',
    silverOz: '',
    silverCost: '',
    goldSpreadPct: -2.5,
    silverSpreadPct: -6.0,
  },
  stackLots: [],
  stackGoals: {
    goldOz: '',
    silverOz: '',
    targetUsd: '',
  },
  ladder: {
    budget: 1000,
    metal: 'auto',
  },
  dealGrader: {
    preset: 'ase_1oz',
    qty: 1,
    ask: '',
  },
  targets: {
    goldAbove: '',
    goldBelow: '',
    silverAbove: '',
    silverBelow: '',
    ratioAbove: '',
    ratioBelow: '',
  },
  smartAlerts: {
    backwardation: true,
    shortSqueeze: true,
    dxyShock: true,
    morningDigest: false,
  },
  quietHours: {
    enabled: false,
    start: 22,
    end: 7,
  },
  subViews: {
    markets: 'live',
    outlook: 'forecast',
    trade: 'swap',
    stack: 'overview',
    alerts: 'display',
  },
};

export function cloneDefaultSettings(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    dealerQuotes: { ...DEFAULT_SETTINGS.dealerQuotes },
    forecastJournal: [],
    stack: { ...DEFAULT_SETTINGS.stack },
    stackLots: [],
    stackGoals: { ...DEFAULT_SETTINGS.stackGoals },
    ladder: { ...DEFAULT_SETTINGS.ladder },
    dealGrader: { ...DEFAULT_SETTINGS.dealGrader },
    targets: { ...DEFAULT_SETTINGS.targets },
    smartAlerts: { ...DEFAULT_SETTINGS.smartAlerts },
    quietHours: { ...DEFAULT_SETTINGS.quietHours },
    subViews: { ...DEFAULT_SETTINGS.subViews },
  };
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

export function sanitizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048 || /[\x00-\x1f\x7f]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
    if (
      !host ||
      !host.includes('.') ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::$|::ffff:|f[cd][0-9a-f]{0,2}:|fe[89ab])/i.test(host)
    ) {
      return null;
    }
    return parsed.href.length <= 2048 ? parsed.href : null;
  } catch {
    return null;
  }
}

export function sanitizeNtfyTopic(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\/ntfy\.sh\//i, '')
    .replace(/^\/+|\/+$/g, '');
  if (
    !/^[A-Za-z0-9._-]{1,64}$/.test(cleaned) ||
    cleaned === '.' ||
    cleaned === '..' ||
    cleaned.includes('..') ||
    cleaned.startsWith('.') ||
    cleaned.endsWith('.')
  ) {
    return '';
  }
  return cleaned;
}

export function generatePrivateNtfyTopic(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `bp-${hex}`;
}

export function sanitizeBoundedNum(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

export function sanitizeNumInputStr(v: unknown, lo = 0, hi = 1e9): string {
  if (v === '' || v == null) return '';
  if (typeof v !== 'number' && typeof v !== 'string') return '';
  const trimmed = typeof v === 'string' ? v.trim() : String(v);
  if (!trimmed || !/^-?\d+(?:\.\d+)?$/.test(trimmed)) return '';
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < lo || n > hi) return '';
  return String(n).slice(0, 24);
}

export function sanitizeShortText(v: unknown, maxLen = 120): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, maxLen);
}

export function sanitizeTtsVoicePref(raw: unknown): string {
  if (typeof raw !== 'string') return 'auto';
  const v = raw.trim().slice(0, 120);
  if (!v || v === 'auto') return 'auto';
  if (v.startsWith('neural:')) {
    const id = v.slice(7);
    return ALLOWED_NEURAL_VOICE_IDS.has(id) ? `neural:${id}` : 'auto';
  }
  return v.replace(/[\x00-\x1f\x7f]/g, '');
}

export function sanitizeStackLots(rawLots: unknown): StackLot[] {
  if (!Array.isArray(rawLots)) return [];
  const out: StackLot[] = [];
  for (const lot of rawLots.slice(0, 100)) {
    if (!isPlainObject(lot)) continue;
    const oz = Number(lot.oz);
    const cost = Number(lot.cost);
    if (!Number.isFinite(oz) || oz <= 0 || oz > 1e6) continue;
    if (!Number.isFinite(cost) || cost < 0 || cost > 1e7) continue;
    out.push({
      id: sanitizeShortText(String(lot.id || `lot_${out.length + 1}`), 48) || `lot_${out.length + 1}`,
      metal: lot.metal === 'silver' ? 'silver' : 'gold',
      oz: +oz.toFixed(6),
      cost: +cost.toFixed(4),
      form: sanitizeShortText(lot.form || 'Bullion', 60) || 'Bullion',
      note: sanitizeShortText(lot.note || '', 120),
      date: sanitizeShortText(
        lot.date || (typeof lot.createdAt === 'string' ? lot.createdAt.slice(0, 10) : ''),
        24
      ),
    });
  }
  return out;
}

export function sanitizeForecastJournal(rawArr: unknown): ForecastJournalEntry[] {
  if (!Array.isArray(rawArr)) return [];
  const out: ForecastJournalEntry[] = [];
  for (const item of rawArr.slice(0, 60)) {
    if (!isPlainObject(item)) continue;
    const entryPrice = Number(item.entryPrice);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0 || entryPrice > 1e7) continue;
    const settledNum = item.settledPrice != null ? Number(item.settledPrice) : NaN;
    const settledPrice = Number.isFinite(settledNum) && settledNum > 0 ? +settledNum.toFixed(2) : null;
    out.push({
      id: sanitizeShortText(String(item.id || `fj_${out.length + 1}`), 48) || `fj_${out.length + 1}`,
      date: sanitizeShortText(item.date || '', 24),
      metal: item.metal === 'silver' ? 'silver' : 'gold',
      userDir: item.userDir === 'down' ? 'down' : 'up',
      aiDir: item.aiDir === 'down' ? 'down' : item.aiDir === 'up' ? 'up' : 'neutral',
      entryPrice: +entryPrice.toFixed(2),
      settledPrice,
      settledAt: sanitizeShortText(item.settledAt || '', 24),
    });
  }
  return out;
}

export function sanitizePersistedSettings(raw: unknown): AppSettings {
  const s = isPlainObject(raw) ? raw : {};
  const rawStack = isPlainObject(s.stack) ? s.stack : {};
  const rawGoals = isPlainObject(s.stackGoals) ? s.stackGoals : {};
  const rawLadder = isPlainObject(s.ladder) ? s.ladder : {};
  const rawGrader = isPlainObject(s.dealGrader) ? s.dealGrader : {};
  const rawTargets = isPlainObject(s.targets) ? s.targets : {};
  const rawSmart = isPlainObject(s.smartAlerts) ? s.smartAlerts : {};
  const rawQuiet = isPlainObject(s.quietHours) ? s.quietHours : {};
  const rawSub = isPlainObject(s.subViews) ? s.subViews : {};
  const rawDealers = isPlainObject(s.dealerQuotes) ? s.dealerQuotes : {};

  const selectedMetal = s.selectedMetal === 'silver' ? 'silver' : 'gold';
  const chartModeRaw = s.chartMode || selectedMetal;
  const chartMode: ChartMode =
    chartModeRaw === 'silver' || chartModeRaw === 'ratio' ? chartModeRaw : 'gold';

  const goldStreetNum = Number(rawDealers.goldStreetOz);
  const silverStreetNum = Number(rawDealers.silverStreetOz);

  return {
    goldThreshold: sanitizeBoundedNum(s.goldThreshold, DEFAULT_SETTINGS.goldThreshold, 0.25, 25),
    silverThreshold: sanitizeBoundedNum(s.silverThreshold, DEFAULT_SETTINGS.silverThreshold, 0.5, 40),
    shanghaiThreshold: sanitizeBoundedNum(s.shanghaiThreshold, DEFAULT_SETTINGS.shanghaiThreshold, 5, 500),
    direction: s.direction === 'up' || s.direction === 'down' ? s.direction : 'both',
    ntfyTopic: sanitizeNtfyTopic(s.ntfyTopic || ''),
    unit: s.unit === 'g' ? 'g' : 'oz',
    currency: ALLOWED_CURRENCIES.has(s.currency as CurrencyCode) ? (s.currency as CurrencyCode) : 'USD',
    privacyMode: Boolean(s.privacyMode),
    ttsVoice: sanitizeTtsVoicePref(s.ttsVoice),
    ttsRate: sanitizeBoundedNum(s.ttsRate, DEFAULT_SETTINGS.ttsRate, 0.7, 1.4),
    theme: ALLOWED_THEMES.has(s.theme as VaultThemeId) ? (s.theme as VaultThemeId) : 'dark',
    language: ALLOWED_LANGUAGES.has(s.language as LangCode) ? (s.language as LangCode) : 'en',
    deskLayout: ALLOWED_DESK_LAYOUTS.has(s.deskLayout as DeskLayoutMode) ? (s.deskLayout as DeskLayoutMode) : 'auto',
    oledPixelShift: Boolean(s.oledPixelShift),
    selectedMetal,
    chartMode,
    confirmMoves: Boolean(s.confirmMoves),
    showForecast: s.showForecast !== undefined ? Boolean(s.showForecast) : DEFAULT_SETTINGS.showForecast,
    showDiscovery: s.showDiscovery !== undefined ? Boolean(s.showDiscovery) : DEFAULT_SETTINGS.showDiscovery,
    showSqueeze: s.showSqueeze !== undefined ? Boolean(s.showSqueeze) : DEFAULT_SETTINGS.showSqueeze,
    showFib: Boolean(s.showFib),
    showSma: Boolean(s.showSma),
    showRsi: Boolean(s.showRsi),
    showMyBuys: Boolean(s.showMyBuys),
    showPatterns: Boolean(s.showPatterns),
    showGaps: s.showGaps !== undefined ? Boolean(s.showGaps) : DEFAULT_SETTINGS.showGaps,
    showSessions: s.showSessions !== undefined ? Boolean(s.showSessions) : DEFAULT_SETTINGS.showSessions,
    showNewsDots: Boolean(s.showNewsDots),
    newsFilter: s.newsFilter === 'signal' || s.newsFilter === 'nohype' ? s.newsFilter : 'all',
    newsTopic:
      typeof s.newsTopic === 'string' && NEWS_TOPIC_RE.test(s.newsTopic)
        ? (s.newsTopic as NewsTopicKey)
        : 'all',
    dealerQuotes: {
      goldStreetOz:
        Number.isFinite(goldStreetNum) && goldStreetNum > 100 && goldStreetNum < 50000
          ? +goldStreetNum.toFixed(2)
          : null,
      silverStreetOz:
        Number.isFinite(silverStreetNum) && silverStreetNum > 5 && silverStreetNum < 1000
          ? +silverStreetNum.toFixed(2)
          : null,
    },
    forecastJournal: sanitizeForecastJournal(s.forecastJournal),
    chartTimeframe: ALLOWED_TIMEFRAMES.has(s.chartTimeframe as TimeframeKey)
      ? (s.chartTimeframe as TimeframeKey)
      : DEFAULT_SETTINGS.chartTimeframe,
    stack: {
      goldOz: sanitizeNumInputStr(rawStack.goldOz, 0, 1e6),
      goldCost: sanitizeNumInputStr(rawStack.goldCost, 0, 1e7),
      silverOz: sanitizeNumInputStr(rawStack.silverOz, 0, 1e7),
      silverCost: sanitizeNumInputStr(rawStack.silverCost, 0, 1e6),
      goldSpreadPct: sanitizeBoundedNum(rawStack.goldSpreadPct, DEFAULT_SETTINGS.stack.goldSpreadPct, -50, 50),
      silverSpreadPct: sanitizeBoundedNum(rawStack.silverSpreadPct, DEFAULT_SETTINGS.stack.silverSpreadPct, -50, 50),
    },
    stackLots: sanitizeStackLots(s.stackLots),
    stackGoals: {
      goldOz: sanitizeNumInputStr(rawGoals.goldOz, 0, 1e6),
      silverOz: sanitizeNumInputStr(rawGoals.silverOz, 0, 1e7),
      targetUsd: sanitizeNumInputStr(rawGoals.targetUsd, 0, 1e10),
    },
    ladder: {
      budget: sanitizeBoundedNum(rawLadder.budget, DEFAULT_SETTINGS.ladder.budget, 10, 1e8),
      metal:
        rawLadder.metal === 'gold' || rawLadder.metal === 'silver' || rawLadder.metal === 'split'
          ? rawLadder.metal
          : 'auto',
    },
    dealGrader: {
      preset:
        typeof rawGrader.preset === 'string' && Object.hasOwn(DEAL_PRESETS, rawGrader.preset)
          ? rawGrader.preset
          : DEFAULT_SETTINGS.dealGrader.preset,
      qty: sanitizeBoundedNum(rawGrader.qty, DEFAULT_SETTINGS.dealGrader.qty, 1, 10000),
      ask: sanitizeNumInputStr(rawGrader.ask, 0, 1e8),
    },
    targets: {
      goldAbove: sanitizeNumInputStr(rawTargets.goldAbove, 0, 1e7),
      goldBelow: sanitizeNumInputStr(rawTargets.goldBelow, 0, 1e7),
      silverAbove: sanitizeNumInputStr(rawTargets.silverAbove, 0, 1e6),
      silverBelow: sanitizeNumInputStr(rawTargets.silverBelow, 0, 1e6),
      ratioAbove: sanitizeNumInputStr(rawTargets.ratioAbove, 0, 1000),
      ratioBelow: sanitizeNumInputStr(rawTargets.ratioBelow, 0, 1000),
    },
    smartAlerts: {
      backwardation:
        rawSmart.backwardation !== undefined
          ? Boolean(rawSmart.backwardation)
          : DEFAULT_SETTINGS.smartAlerts.backwardation,
      shortSqueeze:
        rawSmart.shortSqueeze !== undefined
          ? Boolean(rawSmart.shortSqueeze)
          : DEFAULT_SETTINGS.smartAlerts.shortSqueeze,
      dxyShock:
        rawSmart.dxyShock !== undefined ? Boolean(rawSmart.dxyShock) : DEFAULT_SETTINGS.smartAlerts.dxyShock,
      morningDigest: Boolean(rawSmart.morningDigest),
    },
    quietHours: {
      enabled: Boolean(rawQuiet.enabled),
      start: Math.round(sanitizeBoundedNum(rawQuiet.start, DEFAULT_SETTINGS.quietHours.start, 0, 23)),
      end: Math.round(sanitizeBoundedNum(rawQuiet.end, DEFAULT_SETTINGS.quietHours.end, 0, 23)),
    },
    subViews: {
      markets: ALLOWED_MARKETS_SUB.has(rawSub.markets as MarketsSubView)
        ? (rawSub.markets as MarketsSubView)
        : DEFAULT_SETTINGS.subViews.markets,
      outlook: ALLOWED_OUTLOOK_SUB.has(rawSub.outlook as OutlookSubView)
        ? (rawSub.outlook as OutlookSubView)
        : DEFAULT_SETTINGS.subViews.outlook,
      trade: ALLOWED_TRADE_SUB.has(rawSub.trade as TradeSubView)
        ? (rawSub.trade as TradeSubView)
        : DEFAULT_SETTINGS.subViews.trade,
      stack: ALLOWED_STACK_SUB.has(rawSub.stack as StackSubView)
        ? (rawSub.stack as StackSubView)
        : DEFAULT_SETTINGS.subViews.stack,
      alerts: ALLOWED_ALERTS_SUB.has(rawSub.alerts as AlertsSubView)
        ? (rawSub.alerts as AlertsSubView)
        : DEFAULT_SETTINGS.subViews.alerts,
    },
  };
}

export function sanitizeAlertLog(rawLog: unknown): AlertLogItem[] {
  if (!Array.isArray(rawLog)) return [];
  const out: AlertLogItem[] = [];
  for (const item of rawLog.slice(0, 25)) {
    if (!isPlainObject(item)) continue;
    const pctNum = Number(item.pct);
    out.push({
      title: sanitizeShortText(item.title || 'Alert', 140),
      body: sanitizeShortText(item.body || '', 260),
      time: sanitizeShortText(item.time || '', 48),
      dir: ALLOWED_LOG_DIRS.has(item.dir as LogDir) ? (item.dir as LogDir) : 'neutral',
      pct: Number.isFinite(pctNum) ? pctNum : 0,
      badge: sanitizeShortText(item.badge || '', 40),
    });
  }
  return out;
}

export function sanitizeHistorySeries(arr: unknown): HistoryPoint[] {
  if (!Array.isArray(arr)) return [];
  const out: HistoryPoint[] = [];
  for (const pt of arr.slice(-60)) {
    if (!isPlainObject(pt)) continue;
    const ts = Number(pt.ts);
    const price = Number(pt.price);
    if (Number.isFinite(ts) && Number.isFinite(price) && price > 0) {
      out.push({ ts, price });
    }
  }
  return out;
}

export function createEmptySessionAlerted(): SessionAlertedState {
  return {
    gold: { day: '', dir: null, pct: 0 },
    silver: { day: '', dir: null, pct: 0 },
    shanghai: { day: '', dir: null, usd: 0 },
    targets: Object.create(null) as Record<string, string>,
    regime: Object.create(null) as Record<string, string>,
  };
}

export function sanitizeSessionAlerted(raw: unknown): SessionAlertedState {
  const base = createEmptySessionAlerted();
  if (!isPlainObject(raw)) return base;
  for (const k of ['gold', 'silver'] as const) {
    const sub = raw[k];
    if (isPlainObject(sub)) {
      base[k] = {
        day: sanitizeShortText(sub.day || '', 16),
        dir: sub.dir === 'up' || sub.dir === 'down' ? sub.dir : null,
        pct: sanitizeBoundedNum(sub.pct, 0, -100, 100),
      };
    }
  }
  if (isPlainObject(raw.shanghai)) {
    base.shanghai = {
      day: sanitizeShortText(raw.shanghai.day || '', 16),
      dir: raw.shanghai.dir === 'up' || raw.shanghai.dir === 'down' ? raw.shanghai.dir : null,
      usd: sanitizeBoundedNum(raw.shanghai.usd, 0, -5000, 5000),
    };
  }
  for (const mapKey of ['targets', 'regime'] as const) {
    const sub = raw[mapKey];
    if (isPlainObject(sub)) {
      for (const [k, v] of Object.entries(sub).slice(0, 32)) {
        const cleanKey = sanitizeShortText(k, 32);
        if (!cleanKey || cleanKey === '__proto__' || cleanKey === 'constructor' || cleanKey === 'prototype') continue;
        base[mapKey][cleanKey] = sanitizeShortText(String(v || ''), 24);
      }
    }
  }
  return base;
}

export function defaultSpaceWeather(): SpaceWeatherData {
  return {
    source: 'NOAA SWPC',
    updatedAt: '',
    gScale: 0,
    sScale: 0,
    rScale: 0,
    gForecast: 0,
    peakScale: 0,
    status: 'Quiet (G0)',
    summary: 'Calm solar & geomagnetic field — zero grid/satellite disruption risk.',
    goldBoost: 0,
    silverBoost: 0,
    jumpBoost: 0,
  };
}

export function sanitizeSpaceWeatherFallback(raw: unknown): SpaceWeatherData {
  if (!isPlainObject(raw)) return defaultSpaceWeather();
  const clampScale = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(5, Math.round(n)) : 0;
  };
  const gScale = clampScale(raw.gScale);
  const sScale = clampScale(raw.sScale);
  const rScale = clampScale(raw.rScale);
  const gForecast = clampScale(raw.gForecast);
  return {
    ...defaultSpaceWeather(),
    source: sanitizeShortText(raw.source || 'Snapshot', 48) || 'Snapshot',
    updatedAt: sanitizeShortText(raw.updatedAt || '', 40),
    gScale,
    sScale,
    rScale,
    gForecast,
    peakScale: Math.max(gScale, sScale, rScale, Math.floor(gForecast * 0.8)),
    status: sanitizeShortText(raw.status || `Quiet (G${gScale})`, 64),
    summary: sanitizeShortText(raw.summary || '', 240),
    goldBoost: sanitizeBoundedNum(raw.goldBoost, 0, -0.25, 0.25),
    silverBoost: sanitizeBoundedNum(raw.silverBoost, 0, -0.25, 0.25),
    jumpBoost: sanitizeBoundedNum(raw.jumpBoost, 0, 0, 0.1),
  };
}

export function sanitizeTwinsFallback(raw: unknown): HistoricalTwinsSummary | null {
  if (!isPlainObject(raw)) return null;
  const matchPct = Number(raw.matchPct);
  const avgReturnPct = Number(raw.avgReturnPct);
  if (!Number.isFinite(matchPct) || !Number.isFinite(avgReturnPct)) return null;
  return {
    count: Math.round(sanitizeBoundedNum(raw.count, 1, 1, 50)),
    matchPct: Math.round(clampNum(matchPct, 0, 100)),
    avgReturnPct: +clampNum(avgReturnPct, -100, 100).toFixed(2),
    upPct: Math.round(sanitizeBoundedNum(raw.upPct, 50, 0, 100)),
    unitTilt: +sanitizeBoundedNum(raw.unitTilt, 0, -0.35, 0.35).toFixed(3),
  };
}

export function sanitizeOutlookPayload(raw: unknown): OutlookData | null {
  if (!isPlainObject(raw)) return null;
  const clean: OutlookData = { ...raw };
  const sanitizeList = (list: unknown) =>
    Array.isArray(list)
      ? list
          .slice(0, 150)
          .filter((item: unknown) => isPlainObject(item))
          .map((item: Record<string, unknown>) => {
            const safeUrl = sanitizeHttpUrl(item.url || item.link) || '';
            return {
              ...item,
              title: sanitizeShortText(item.title || '', 240),
              source: sanitizeShortText(item.source || '', 80),
              url: safeUrl,
              link: safeUrl,
            };
          })
      : [];
  if (Array.isArray(clean.headlines)) {
    clean.headlines = sanitizeList(clean.headlines);
  }
  if (Array.isArray(clean.news)) {
    clean.news = sanitizeList(clean.news);
  }
  return clean;
}

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...ANON_FETCH_OPTS,
      ...opts,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(tid);
  }
}
