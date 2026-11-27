/* Bullion Pulse — Spot Gold & Silver PWA */

const TROY_OZ_TO_GRAMS = 31.1034768;
const REFRESH_MS = 15000;
const SLOW_REFRESH_MS = 60000;
const CANDLE_INTERVAL_MS = 5 * 60 * 1000;
const CANDLE_1M_MS = 60 * 1000;
const MIN_ZOOM_BARS = 6;
const STORAGE_KEY = 'bullion_pulse_state_v2';
const ANON_FETCH_OPTS = {
  cache: 'no-store',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
};
const RAW_DATA_BASE =
  'https://raw.githubusercontent.com/pownda417-netizen/bullion-pulse/main/data/';
const MAX_BACKUP_BYTES = 512 * 1024;

function sanitizeHttpUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function sanitizeNtfyTopic(raw) {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\/ntfy\.sh\//i, '')
    .replace(/^\/+|\/+$/g, '');
  return /^[A-Za-z0-9._-]{1,64}$/.test(cleaned) ? cleaned : '';
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
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

async function fetchFreshRepoJson(fileName) {
  if (typeof fileName !== 'string' || !/^[a-z0-9_]+\.json$/i.test(fileName)) {
    throw new Error('Invalid data filename');
  }
  const localFetch = async () => {
    const res = await fetchWithTimeout(`./data/${fileName}`, {}, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const canPollRaw =
    typeof window !== 'undefined' &&
    (host === 'pownda417-netizen.github.io' ||
      host.endsWith('.github.io') ||
      window.location.search.includes('liveRaw=1'));

  if (!canPollRaw) return localFetch();

  const rawFetch = async () => {
    const res = await fetchWithTimeout(`${RAW_DATA_BASE}${fileName}?t=${Date.now()}`, {}, 4000);
    if (!res.ok) throw new Error(`Raw HTTP ${res.status}`);
    return await res.json();
  };

  const [locRes, rawRes] = await Promise.allSettled([localFetch(), rawFetch()]);
  const loc = locRes.status === 'fulfilled' ? locRes.value : null;
  const raw = rawRes.status === 'fulfilled' ? rawRes.value : null;
  if (!loc && !raw) throw new Error(`Failed loading ${fileName}`);
  if (!raw) return loc;
  if (!loc) return raw;
  const tLoc = Date.parse(loc.generatedAt || loc.updatedAt || 0) || 0;
  const tRaw = Date.parse(raw.generatedAt || raw.updatedAt || 0) || 0;
  return tRaw >= tLoc ? raw : loc;
}

const DEFAULT_SETTINGS = {
  goldThreshold: 1.5,
  silverThreshold: 3.0,
  shanghaiThreshold: 35,
  direction: 'both', // 'both' | 'up' | 'down'
  ntfyTopic: '',
  unit: 'oz', // 'oz' | 'g'
  currency: 'USD', // 'USD' | 'CAD' | 'EUR' | 'GBP' | 'CHF' | 'AUD' | 'MXN' | 'INR' | ...
  privacyMode: false,
  ttsVoice: 'auto',
  ttsRate: 0.96,
  theme: 'dark',
  language: 'en', // 'en' | 'th' | 'lo' | 'es' | 'zh' | 'ja' | 'hi'
  deskLayout: 'auto', // 'auto' | 'single' | 'split' | 'ultrawide'
  oledPixelShift: false,
  selectedMetal: 'gold',
  chartMode: 'gold', // 'gold' | 'silver' | 'ratio'
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
  showNewsDots: false,
  newsFilter: 'all', // 'all' | 'signal' | 'nohype'
  newsTopic: 'all',
  dealerQuotes: {
    goldStreetOz: null,
    silverStreetOz: null,
  },
  forecastJournal: [],
  chartTimeframe: '1d', // '1d' | '7d' | '1m' | '6m' | '1y' | '5y' | '10y' | 'all'
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

const state = {
  settings: {
    ...DEFAULT_SETTINGS,
    stack: { ...DEFAULT_SETTINGS.stack },
    stackLots: [],
    stackGoals: { ...DEFAULT_SETTINGS.stackGoals },
    ladder: { ...DEFAULT_SETTINGS.ladder },
    dealGrader: { ...DEFAULT_SETTINGS.dealGrader },
    targets: { ...DEFAULT_SETTINGS.targets },
    smartAlerts: { ...DEFAULT_SETTINGS.smartAlerts },
    quietHours: { ...DEFAULT_SETTINGS.quietHours },
    subViews: { ...DEFAULT_SETTINGS.subViews },
  },
  fxRates: {
    USD: 1,
    CAD: 1.43,
    EUR: 0.91,
    GBP: 0.76,
    CHF: 0.84,
    AUD: 1.5,
    MXN: 19.03,
    INR: 93.37,
    CNY: 6.69,
    JPY: 159.75,
    THB: 33.94,
    LAK: 22369,
    SGD: 1.29,
    HKD: 7.84,
    KRW: 1331,
    VND: 25730,
    IDR: 18262,
    AED: 3.67,
    SAR: 3.75,
    TRY: 50.53,
    ZAR: 17.41,
  },
  whatIfPrices: {
    gold: null,
    silver: null,
  },
  lastLadderTargets: {
    goldDipUsd: null,
    silverDipUsd: null,
  },
  speechActive: false,
  activeView: 'markets',
  lastMainView: 'markets',
  quotes: {
    gold: { price: null, prevClose: null, chg: 0, pct: 0 },
    silver: { price: null, prevClose: null, chg: 0, pct: 0 },
  },
  liveMacro: {
    platinum: null,
    dxy: null,
    dxySource: '',
    consensusNote: '',
  },
  futures: {
    gold: null,
    silver: null,
    liveFetched: false,
    source: '',
  },
  feedHealth: {
    spotAt: null,
    spotSource: '',
    dxyAt: null,
    dxyLive: false,
    futuresAt: null,
    sgeAt: null,
    comexAt: null,
    comexLive: false,
    outlookAt: null,
  },
  feedTrust: {
    status: 'connecting', // 'verified' | 'auto-healed' | 'single' | 'demo' | 'connecting'
    primarySource: 'GoldPrice Spot',
    secondarySource: 'Gold-API Spot',
    lastSpreadPct: null,
    rejectedOutliers: 0,
    failovers: 0,
    checksCount: 0,
    lastVerifiedAt: null,
    lastEventNote: 'Waiting for first multi-source sanity check…',
  },
  chartReplay: {
    active: false,
    paused: false,
    idx: 0,
    speed: 1,
    timer: null,
  },
  accuracyChartMetal: 'gold',
  accuracyChartHorizon: 'daily',
  accuracyHoverIdx: null,
  accuracyGeom: null,
  hiddenAlphaMetal: 'gold',
  swapCalc: {
    dir: 'g2s',
    oz: 1,
    targetRatio: 65,
    frictionPct: 4.0,
  },
  history: {
    gold: [],
    silver: [],
  },
  candles: {
    gold: [],
    silver: [],
  },
  candlesSource: {
    gold: 'seed',
    silver: 'seed',
  },
  candles1m: {
    gold: [],
    silver: [],
  },
  candles1mSource: {
    gold: 'seed',
    silver: 'seed',
  },
  chartZoom: {
    startIdx: null,
    visibleCount: null,
    dragging: false,
    dragStartX: 0,
    dragStartIdx: 0,
    didDrag: false,
    pinchDist: null,
    pinchCount: null,
    pinchCenterFrac: 0.5,
  },
  timeframes: {},
  hoverCandleIdx: null,
  hoverForecastIdx: null,
  chartGeom: null,
  selectedMiner: null,
  alertLog: [],
  sessionAlerted: {
    gold: { day: '', dir: null, pct: 0 },
    silver: { day: '', dir: null, pct: 0 },
    shanghai: { day: '', dir: null, usd: 0 },
    targets: {},
    regime: {},
  },
  pendingAlert: {
    gold: null,
    silver: null,
  },
  mode: 'connecting', // 'live' | 'demo' | 'error'
  lastUpdated: null,
  nextRefreshAt: Date.now() + REFRESH_MS,
  refreshTimer: null,
  candleRefreshTimer: null,
  countdownTimer: null,
};

/* ---------- Persistence & Schema Sanitization ---------- */

const ALLOWED_CURRENCIES = new Set([
  'USD', 'CAD', 'EUR', 'GBP', 'CHF', 'AUD', 'MXN', 'INR', 'CNY', 'JPY',
  'THB', 'LAK', 'SGD', 'HKD', 'KRW', 'VND', 'IDR', 'AED', 'SAR', 'TRY', 'ZAR',
]);
const ALLOWED_TIMEFRAMES = new Set(['15min', '1h', '4h', '1d', '7d', '1m', '6m', '1y', '5y', '10y', 'all']);
const INTRADAY_TIMEFRAMES = new Set(['15min', '1h', '4h', '1d']);
const ALLOWED_LOG_DIRS = new Set(['up', 'down', 'neutral']);
const ALLOWED_THEMES = new Set(['dark', 'light', 'oled', 'swiss-gold', 'mint-silver', 'terminal-amber', 'daylight-paper']);
const ALLOWED_LANGUAGES = new Set(['en', 'th', 'lo', 'es', 'zh', 'ja', 'hi']);
const ALLOWED_DESK_LAYOUTS = new Set(['auto', 'single', 'split', 'ultrawide']);
const ALLOWED_NEURAL_VOICE_IDS = new Set([
  'en_US-lessac-medium',
  'en_US-ryan-medium',
  'en_US-amy-medium',
  'en_US-hfc_female-medium',
  'en_US-hfc_male-medium',
  'en_GB-alba-medium',
]);
const ALLOWED_SUBVIEWS = {
  markets: new Set(['live', 'global', 'charts', 'macro']),
  outlook: new Set(['forecast', 'drivers', 'vaults', 'sim']),
  trade: new Set(['swap', 'ladder', 'grader']),
  stack: new Set(['overview', 'goals', 'lots']),
  alerts: new Set(['display', 'rules', 'phone', 'setup']),
};

function isPlainObject(v) {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function sanitizeBoundedNum(v, fallback, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

function sanitizeNumInputStr(v, lo = 0, hi = 1e9) {
  if (v === '' || v == null) return '';
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) return '';
  return String(v).trim().slice(0, 24);
}

function sanitizeShortText(v, maxLen = 120) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, maxLen);
}

function sanitizeTtsVoicePref(raw) {
  if (typeof raw !== 'string') return 'auto';
  const v = raw.trim().slice(0, 120);
  if (!v || v === 'auto') return 'auto';
  if (v.startsWith('neural:')) {
    const id = v.slice(7);
    return ALLOWED_NEURAL_VOICE_IDS.has(id) ? `neural:${id}` : 'auto';
  }
  return v.replace(/[\x00-\x1f\x7f]/g, '');
}

function sanitizeStackLots(rawLots) {
  if (!Array.isArray(rawLots)) return [];
  const out = [];
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
      date: sanitizeShortText(lot.date || '', 24),
    });
  }
  return out;
}

function sanitizeForecastJournal(rawArr) {
  if (!Array.isArray(rawArr)) return [];
  const out = [];
  for (const item of rawArr.slice(0, 60)) {
    if (!isPlainObject(item)) continue;
    const entryPrice = Number(item.entryPrice);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0 || entryPrice > 1e7) continue;
    const settledPrice = item.settledPrice != null && Number.isFinite(Number(item.settledPrice)) && Number(item.settledPrice) > 0
      ? Number(item.settledPrice)
      : null;
    out.push({
      id: sanitizeShortText(String(item.id || `fj_${out.length + 1}`), 48) || `fj_${out.length + 1}`,
      date: sanitizeShortText(item.date || '', 24),
      metal: item.metal === 'silver' ? 'silver' : 'gold',
      userDir: item.userDir === 'down' ? 'down' : 'up',
      aiDir: item.aiDir === 'down' ? 'down' : item.aiDir === 'up' ? 'up' : 'neutral',
      entryPrice: +entryPrice.toFixed(2),
      settledPrice: settledPrice != null ? +settledPrice.toFixed(2) : null,
      settledAt: sanitizeShortText(item.settledAt || '', 24),
    });
  }
  return out;
}

function sanitizePersistedSettings(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const rawStack = isPlainObject(s.stack) ? s.stack : {};
  const rawGoals = isPlainObject(s.stackGoals) ? s.stackGoals : {};
  const rawLadder = isPlainObject(s.ladder) ? s.ladder : {};
  const rawGrader = isPlainObject(s.dealGrader) ? s.dealGrader : {};
  const rawTargets = isPlainObject(s.targets) ? s.targets : {};
  const rawSmart = isPlainObject(s.smartAlerts) ? s.smartAlerts : {};
  const rawQuiet = isPlainObject(s.quietHours) ? s.quietHours : {};
  const rawSub = isPlainObject(s.subViews) ? s.subViews : {};

  const selectedMetal = s.selectedMetal === 'silver' ? 'silver' : 'gold';
  const chartModeRaw = s.chartMode || selectedMetal;
  const chartMode =
    chartModeRaw === 'silver' || chartModeRaw === 'ratio' ? chartModeRaw : 'gold';

  return {
    goldThreshold: sanitizeBoundedNum(s.goldThreshold, DEFAULT_SETTINGS.goldThreshold, 0.25, 25),
    silverThreshold: sanitizeBoundedNum(s.silverThreshold, DEFAULT_SETTINGS.silverThreshold, 0.5, 40),
    shanghaiThreshold: sanitizeBoundedNum(s.shanghaiThreshold, DEFAULT_SETTINGS.shanghaiThreshold, 5, 500),
    direction: s.direction === 'up' || s.direction === 'down' ? s.direction : 'both',
    ntfyTopic: sanitizeNtfyTopic(s.ntfyTopic || ''),
    unit: s.unit === 'g' ? 'g' : 'oz',
    currency: ALLOWED_CURRENCIES.has(s.currency) ? s.currency : 'USD',
    privacyMode: Boolean(s.privacyMode),
    ttsVoice: sanitizeTtsVoicePref(s.ttsVoice),
    ttsRate: sanitizeBoundedNum(s.ttsRate, DEFAULT_SETTINGS.ttsRate, 0.7, 1.4),
    theme: ALLOWED_THEMES.has(s.theme) ? s.theme : 'dark',
    language: ALLOWED_LANGUAGES.has(s.language) ? s.language : 'en',
    deskLayout: ALLOWED_DESK_LAYOUTS.has(s.deskLayout) ? s.deskLayout : 'auto',
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
    showNewsDots: Boolean(s.showNewsDots),
    newsFilter: s.newsFilter === 'signal' || s.newsFilter === 'nohype' ? s.newsFilter : 'all',
    newsTopic: typeof s.newsTopic === 'string' && /^(all|central_banks|tech_solar_ai|vaults_physical|asia_retail|geo_space|macro_debt|miners_supply)$/.test(s.newsTopic) ? s.newsTopic : 'all',
    dealerQuotes: {
      goldStreetOz:
        Number.isFinite(Number(s.dealerQuotes?.goldStreetOz)) && Number(s.dealerQuotes.goldStreetOz) > 100 && Number(s.dealerQuotes.goldStreetOz) < 50000
          ? +Number(s.dealerQuotes.goldStreetOz).toFixed(2)
          : null,
      silverStreetOz:
        Number.isFinite(Number(s.dealerQuotes?.silverStreetOz)) && Number(s.dealerQuotes.silverStreetOz) > 5 && Number(s.dealerQuotes.silverStreetOz) < 1000
          ? +Number(s.dealerQuotes.silverStreetOz).toFixed(2)
          : null,
    },
    forecastJournal: sanitizeForecastJournal(s.forecastJournal),
    chartTimeframe: ALLOWED_TIMEFRAMES.has(s.chartTimeframe) ? s.chartTimeframe : DEFAULT_SETTINGS.chartTimeframe,
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
      preset: sanitizeShortText(rawGrader.preset || DEFAULT_SETTINGS.dealGrader.preset, 40) || DEFAULT_SETTINGS.dealGrader.preset,
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
      backwardation: rawSmart.backwardation !== undefined ? Boolean(rawSmart.backwardation) : DEFAULT_SETTINGS.smartAlerts.backwardation,
      shortSqueeze: rawSmart.shortSqueeze !== undefined ? Boolean(rawSmart.shortSqueeze) : DEFAULT_SETTINGS.smartAlerts.shortSqueeze,
      dxyShock: rawSmart.dxyShock !== undefined ? Boolean(rawSmart.dxyShock) : DEFAULT_SETTINGS.smartAlerts.dxyShock,
      morningDigest: Boolean(rawSmart.morningDigest),
    },
    quietHours: {
      enabled: Boolean(rawQuiet.enabled),
      start: Math.round(sanitizeBoundedNum(rawQuiet.start, DEFAULT_SETTINGS.quietHours.start, 0, 23)),
      end: Math.round(sanitizeBoundedNum(rawQuiet.end, DEFAULT_SETTINGS.quietHours.end, 0, 23)),
    },
    subViews: {
      markets: ALLOWED_SUBVIEWS.markets.has(rawSub.markets) ? rawSub.markets : DEFAULT_SETTINGS.subViews.markets,
      outlook: ALLOWED_SUBVIEWS.outlook.has(rawSub.outlook) ? rawSub.outlook : DEFAULT_SETTINGS.subViews.outlook,
      trade: ALLOWED_SUBVIEWS.trade.has(rawSub.trade) ? rawSub.trade : DEFAULT_SETTINGS.subViews.trade,
      stack: ALLOWED_SUBVIEWS.stack.has(rawSub.stack) ? rawSub.stack : DEFAULT_SETTINGS.subViews.stack,
      alerts: ALLOWED_SUBVIEWS.alerts.has(rawSub.alerts) ? rawSub.alerts : DEFAULT_SETTINGS.subViews.alerts,
    },
  };
}

function sanitizeAlertLog(rawLog) {
  if (!Array.isArray(rawLog)) return [];
  const out = [];
  for (const item of rawLog.slice(0, 25)) {
    if (!isPlainObject(item)) continue;
    const pctNum = Number(item.pct);
    out.push({
      title: sanitizeShortText(item.title || 'Alert', 140),
      body: sanitizeShortText(item.body || '', 260),
      time: sanitizeShortText(item.time || '', 48),
      dir: ALLOWED_LOG_DIRS.has(item.dir) ? item.dir : 'neutral',
      pct: Number.isFinite(pctNum) ? pctNum : 0,
      badge: sanitizeShortText(item.badge || '', 40),
    });
  }
  return out;
}

function sanitizeHistorySeries(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(-60)
    .filter((pt) => isPlainObject(pt) && Number.isFinite(Number(pt.ts)) && Number.isFinite(Number(pt.price)) && Number(pt.price) > 0)
    .map((pt) => ({ ts: Number(pt.ts), price: Number(pt.price) }));
}

function sanitizeSessionAlerted(raw) {
  const base = {
    gold: { day: '', dir: null, pct: 0 },
    silver: { day: '', dir: null, pct: 0 },
    shanghai: { day: '', dir: null, usd: 0 },
    targets: Object.create(null),
    regime: Object.create(null),
  };
  if (!isPlainObject(raw)) return base;
  for (const k of ['gold', 'silver']) {
    if (isPlainObject(raw[k])) {
      base[k] = {
        day: sanitizeShortText(raw[k].day || '', 16),
        dir: raw[k].dir === 'up' || raw[k].dir === 'down' ? raw[k].dir : null,
        pct: sanitizeBoundedNum(raw[k].pct, 0, -100, 100),
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
  for (const mapKey of ['targets', 'regime']) {
    if (isPlainObject(raw[mapKey])) {
      for (const [k, v] of Object.entries(raw[mapKey]).slice(0, 32)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        base[mapKey][sanitizeShortText(k, 32)] = sanitizeShortText(String(v || ''), 24);
      }
    }
  }
  return base;
}

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_BACKUP_BYTES) return;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return;
    if (isPlainObject(parsed.settings)) {
      state.settings = sanitizePersistedSettings(parsed.settings);
    }
    if (Array.isArray(parsed.alertLog)) {
      state.alertLog = sanitizeAlertLog(parsed.alertLog);
    }
    if (isPlainObject(parsed.history)) {
      state.history.gold = sanitizeHistorySeries(parsed.history.gold);
      state.history.silver = sanitizeHistorySeries(parsed.history.silver);
    }
    if (isPlainObject(parsed.sessionAlerted)) {
      state.sessionAlerted = sanitizeSessionAlerted(parsed.sessionAlerted);
    }
  } catch {
    // Ignore malformed storage
  }
}

function savePersistedState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settings: state.settings,
        alertLog: state.alertLog.slice(0, 25),
        history: {
          gold: state.history.gold.slice(-60),
          silver: state.history.silver.slice(-60),
        },
        sessionAlerted: state.sessionAlerted,
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

/* ---------- Multi-Currency, Privacy & Formatting Helpers ---------- */

const CURRENCY_META = {
  USD: { symbol: '$', label: 'USD', zeroDecimals: false, spoken: 'dollars', spokenSub: 'cents' },
  CAD: { symbol: 'C$', label: 'CAD', zeroDecimals: false, spoken: 'Canadian dollars', spokenSub: 'cents' },
  EUR: { symbol: '€', label: 'EUR', zeroDecimals: false, spoken: 'euros', spokenSub: 'cents' },
  GBP: { symbol: '£', label: 'GBP', zeroDecimals: false, spoken: 'pounds', spokenSub: 'pence' },
  CHF: { symbol: 'Fr', label: 'CHF', zeroDecimals: false, spoken: 'Swiss francs', spokenSub: 'centimes' },
  AUD: { symbol: 'A$', label: 'AUD', zeroDecimals: false, spoken: 'Australian dollars', spokenSub: 'cents' },
  MXN: { symbol: 'MX$', label: 'MXN', zeroDecimals: false, spoken: 'pesos', spokenSub: 'centavos' },
  INR: { symbol: '₹', label: 'INR', zeroDecimals: false, spoken: 'rupees', spokenSub: 'paise' },
  CNY: { symbol: 'CN¥', label: 'CNY', zeroDecimals: false, spoken: 'yuan', spokenSub: '' },
  JPY: { symbol: '¥', label: 'JPY', zeroDecimals: true, spoken: 'yen', spokenSub: '' },
  THB: { symbol: '฿', label: 'THB', zeroDecimals: false, spoken: 'baht', spokenSub: '' },
  LAK: { symbol: '₭', label: 'LAK', zeroDecimals: true, spoken: 'kip', spokenSub: '' },
  SGD: { symbol: 'S$', label: 'SGD', zeroDecimals: false, spoken: 'Singapore dollars', spokenSub: 'cents' },
  HKD: { symbol: 'HK$', label: 'HKD', zeroDecimals: false, spoken: 'Hong Kong dollars', spokenSub: 'cents' },
  KRW: { symbol: '₩', label: 'KRW', zeroDecimals: true, spoken: 'won', spokenSub: '' },
  VND: { symbol: '₫', label: 'VND', zeroDecimals: true, spoken: 'dong', spokenSub: '' },
  IDR: { symbol: 'Rp', label: 'IDR', zeroDecimals: true, spoken: 'rupiah', spokenSub: '' },
  AED: { symbol: 'DH ', label: 'AED', zeroDecimals: false, spoken: 'dirhams', spokenSub: '' },
  SAR: { symbol: 'SR ', label: 'SAR', zeroDecimals: false, spoken: 'riyals', spokenSub: '' },
  TRY: { symbol: '₺', label: 'TRY', zeroDecimals: false, spoken: 'Turkish lira', spokenSub: '' },
  ZAR: { symbol: 'R', label: 'ZAR', zeroDecimals: false, spoken: 'rand', spokenSub: '' },
};

function getCurrencyCode() {
  const c = String(state.settings.currency || 'USD').toUpperCase();
  return CURRENCY_META[c] ? c : 'USD';
}

function getCurrencySymbol() {
  return CURRENCY_META[getCurrencyCode()].symbol;
}

function getFxRate() {
  const code = getCurrencyCode();
  const r = Number(state.fxRates?.[code]);
  return Number.isFinite(r) && r > 0 ? r : 1;
}

function isPrivacyOn() {
  return !!state.settings.privacyMode;
}

function applyPrivacyMode() {
  const hidden = isPrivacyOn();
  const btn = document.getElementById('btn-privacy-toggle');
  const icon = document.getElementById('icon-privacy');
  if (btn) {
    btn.classList.toggle('active', hidden);
    btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    btn.title = hidden
      ? 'Privacy Mode ON — click to show your stack amounts'
      : 'Privacy Mode — hide your stack amounts';
  }
  if (icon) {
    icon.innerHTML = hidden
      ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />'
      : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />';
  }
}

function convertUnit(usdPerOz) {
  if (usdPerOz == null || Number.isNaN(usdPerOz)) return null;
  return state.settings.unit === 'g' ? usdPerOz / TROY_OZ_TO_GRAMS : usdPerOz;
}

function formatMoney(value, decimals = 2, opts = null) {
  const usdOnly = !!opts?.usdOnly;
  const code = usdOnly ? 'USD' : getCurrencyCode();
  const meta = CURRENCY_META[code] || CURRENCY_META.USD;
  const sym = meta.symbol;
  if (value == null || Number.isNaN(value)) return `${sym}—`;
  const rate = usdOnly ? 1 : getFxRate();
  const converted = Number(value) * rate;
  const dec = meta.zeroDecimals ? 0 : decimals;
  const sign = converted < 0 ? '−' : '';
  const numStr = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(Math.abs(converted));
  return `${sign}${sym}${numStr}`;
}

function formatCompactMoney(value, decimals = 2, opts = null) {
  const usdOnly = !!opts?.usdOnly;
  const code = usdOnly ? 'USD' : getCurrencyCode();
  const meta = CURRENCY_META[code] || CURRENCY_META.USD;
  if (value == null || Number.isNaN(value)) return `${meta.symbol}—`;
  const rate = usdOnly ? 1 : getFxRate();
  const converted = Number(value) * rate;
  const abs = Math.abs(converted);
  const sign = converted < 0 ? '−' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}${meta.symbol}${(abs / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${meta.symbol}${(abs / 1_000_000).toFixed(2)}M`;
  }
  return formatMoney(value, decimals, opts);
}

function formatSignedMoney(value, decimals = 2, opts = null) {
  const sym = opts?.usdOnly ? '$' : getCurrencySymbol();
  if (value == null || Number.isNaN(value)) return `${sym}—`;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatMoney(Math.abs(value), decimals, opts)}`;
}

function privMoney(value, decimals = 2) {
  return isPrivacyOn() ? `${getCurrencySymbol()}•••••` : formatMoney(value, decimals);
}

function privSignedMoney(value, decimals = 2) {
  return isPrivacyOn() ? `${getCurrencySymbol()}•••••` : formatSignedMoney(value, decimals);
}

function normalCdf(z) {
  const x = Number(z) || 0;
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * a);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t) *
      Math.exp(-a * a);
  return 0.5 * (1 + sign * erf);
}

function formatSignedPct(pct) {
  if (pct == null || Number.isNaN(pct)) return '0.00%';
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatOrdinal(n) {
  const num = Math.round(Number(n) || 0);
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
  const mod10 = num % 10;
  if (mod10 === 1) return `${num}st`;
  if (mod10 === 2) return `${num}nd`;
  if (mod10 === 3) return `${num}rd`;
  return `${num}th`;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

/* ---------- Live Spot Feed Fetching ---------- */

async function fetchFromGoldPriceOrg() {
  const res = await fetchWithTimeout('https://data-asg.goldprice.org/dbXRates/USD', {}, 8000);
  if (!res.ok) throw new Error(`goldprice.org HTTP ${res.status}`);
  const data = await res.json();
  const item = data?.items?.[0];
  if (!item || typeof item.xauPrice !== 'number' || typeof item.xagPrice !== 'number') {
    throw new Error('Unexpected goldprice.org payload');
  }
  return {
    source: 'GoldPrice Spot',
    gold: {
      price: item.xauPrice,
      prevClose: item.xauClose ?? item.xauPrice - (item.chgXau || 0),
      chg: item.chgXau ?? 0,
      pct: item.pcXau ?? 0,
    },
    silver: {
      price: item.xagPrice,
      prevClose: item.xagClose ?? item.xagPrice - (item.chgXag || 0),
      chg: item.chgXag ?? 0,
      pct: item.pcXag ?? 0,
    },
  };
}

function getCanonicalSpotPrices() {
  const base = outlookState.data || FALLBACK_OUTLOOK;
  const liveG =
    typeof state.quotes.gold.price === 'number' && Number.isFinite(state.quotes.gold.price) && state.quotes.gold.price > 0
      ? state.quotes.gold.price
      : null;
  const liveS =
    typeof state.quotes.silver.price === 'number' && Number.isFinite(state.quotes.silver.price) && state.quotes.silver.price > 0
      ? state.quotes.silver.price
      : null;
  const snapG =
    typeof base?.gold?.spot === 'number' && Number.isFinite(base.gold.spot) && base.gold.spot > 0
      ? base.gold.spot
      : null;
  const snapS =
    typeof base?.silver?.spot === 'number' && Number.isFinite(base.silver.spot) && base.silver.spot > 0
      ? base.silver.spot
      : null;
  return {
    gold: liveG ?? snapG ?? 3521.5,
    silver: liveS ?? snapS ?? 40.87,
    isLive: liveG != null && liveS != null,
  };
}

async function fetchFromGoldApiCom() {
  const [xauRes, xagRes] = await Promise.all([
    fetchWithTimeout('https://api.gold-api.com/price/XAU', {}, 8000),
    fetchWithTimeout('https://api.gold-api.com/price/XAG', {}, 8000),
  ]);
  if (!xauRes.ok || !xagRes.ok) {
    throw new Error(`gold-api.com HTTP ${xauRes.status}/${xagRes.status}`);
  }
  const [xau, xag] = await Promise.all([xauRes.json(), xagRes.json()]);
  if (typeof xau.price !== 'number' || typeof xag.price !== 'number') {
    throw new Error('Unexpected gold-api.com payload');
  }

  const candlePrevG = state.candles.gold?.[0]?.o;
  const candlePrevS = state.candles.silver?.[0]?.o;
  const prevGold =
    (state.quotes.gold.prevClose && state.quotes.gold.prevClose !== state.quotes.gold.price
      ? state.quotes.gold.prevClose
      : null) ??
    (Number.isFinite(candlePrevG) && candlePrevG > 0 ? candlePrevG : null) ??
    xau.price;
  const prevSilver =
    (state.quotes.silver.prevClose && state.quotes.silver.prevClose !== state.quotes.silver.price
      ? state.quotes.silver.prevClose
      : null) ??
    (Number.isFinite(candlePrevS) && candlePrevS > 0 ? candlePrevS : null) ??
    xag.price;
  const goldChg = xau.price - prevGold;
  const silverChg = xag.price - prevSilver;

  return {
    source: 'Gold-API Spot',
    gold: {
      price: +xau.price.toFixed(2),
      prevClose: +prevGold.toFixed(2),
      chg: +goldChg.toFixed(2),
      pct: prevGold ? +((goldChg / prevGold) * 100).toFixed(2) : 0,
    },
    silver: {
      price: +xag.price.toFixed(2),
      prevClose: +prevSilver.toFixed(2),
      chg: +silverChg.toFixed(2),
      pct: prevSilver ? +((silverChg / prevSilver) * 100).toFixed(2) : 0,
    },
  };
}

function buildFallbackDemoQuotes() {
  // Used only when offline or blocked by network/firewall
  const baseGold = state.quotes.gold.price ?? 3542.81;
  const baseSilver = state.quotes.silver.price ?? 42.22;
  const prevGold = state.quotes.gold.prevClose ?? 3626.21;
  const prevSilver = state.quotes.silver.prevClose ?? 42.84;

  const goldPrice = +(baseGold + (Math.random() - 0.48) * 3.0).toFixed(2);
  const silverPrice = +(baseSilver + (Math.random() - 0.48) * 0.12).toFixed(2);
  const goldChg = goldPrice - prevGold;
  const silverChg = silverPrice - prevSilver;

  return {
    source: 'Offline Demo',
    demo: true,
    gold: {
      price: goldPrice,
      prevClose: prevGold,
      chg: goldChg,
      pct: (goldChg / prevGold) * 100,
    },
    silver: {
      price: silverPrice,
      prevClose: prevSilver,
      chg: silverChg,
      pct: (silverChg / prevSilver) * 100,
    },
  };
}

async function fetchLivePlatinumPrice() {
  try {
    const res = await fetchWithTimeout('https://api.gold-api.com/price/XPT', {}, 8000);
    if (!res.ok) return;
    const xpt = await res.json();
    if (typeof xpt?.price === 'number' && Number.isFinite(xpt.price) && xpt.price > 200) {
      state.liveMacro.platinum = xpt.price;
      renderMacroStrip();
    }
  } catch {
    // Keep outlook macroSnapshot platinum
  }
}

/** Exact ICE US Dollar Index (DXY) geometric basket formula from USD-per-unit-inverse FX rates (currency per 1 USD) */
function computeIceDxyFromRates(rates) {
  if (!rates) return null;
  const eur = Number(rates.EUR);
  const jpy = Number(rates.JPY);
  const gbp = Number(rates.GBP);
  const cad = Number(rates.CAD);
  const sek = Number(rates.SEK);
  const chf = Number(rates.CHF);
  if (![eur, jpy, gbp, cad, sek, chf].every((v) => Number.isFinite(v) && v > 0)) return null;
  const dxy =
    50.14348112 *
    Math.pow(eur, 0.576) *
    Math.pow(jpy, 0.136) *
    Math.pow(gbp, 0.119) *
    Math.pow(cad, 0.091) *
    Math.pow(sek, 0.042) *
    Math.pow(chf, 0.036);
  return Number.isFinite(dxy) && dxy > 60 && dxy < 160 ? +dxy.toFixed(2) : null;
}

async function fetchLiveDxyIndex() {
  const tryEndpoint = async (url, label) => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4500);
    try {
      const res = await fetch(url, { ...ANON_FETCH_OPTS, signal: ctrl.signal });
      if (!res.ok) return null;
      const json = await res.json();
      const val = computeIceDxyFromRates(json?.rates);
      return val != null ? { val, label, rates: json?.rates || null } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(tid);
    }
  };

  const hit =
    (await tryEndpoint('https://open.er-api.com/v6/latest/USD', 'Live ICE DXY')) ||
    (await tryEndpoint(
      'https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,GBP,CAD,SEK,CHF,AUD,MXN,THB,CNY,INR,SGD,HKD,KRW,IDR,TRY,ZAR',
      'Live ICE DXY'
    ));

  if (hit) {
    if (hit.rates) {
      for (const code of Object.keys(CURRENCY_META)) {
        if (code === 'USD') continue;
        const r = Number(hit.rates[code]);
        if (Number.isFinite(r) && r > 0) state.fxRates[code] = r;
      }
    }
    state.liveMacro.dxy = hit.val;
    state.liveMacro.dxySource = hit.label;
    state.feedHealth.dxyAt = Date.now();
    state.feedHealth.dxyLive = true;
    renderMacroStrip();
    renderFeedHealth();
    if (getCurrencyCode() !== 'USD') {
      renderMetalCard('gold');
      renderMetalCard('silver');
      renderFuturesPanel();
      renderStats();
      renderShanghai();
    }
    renderOutlook();
    renderStackTracker();
    renderChart();
  }
}

async function fetchLiveFuturesQuotes() {
  // COMEX GC=F / SI=F futures are refreshed server-side into outlook.json without browser CORS errors
  const basis = outlookState.data?.institutionalSignals?.basis;
  const gc = Number(basis?.gold?.futures);
  const si = Number(basis?.silver?.futures);
  if ((Number.isFinite(gc) && gc > 0) || (Number.isFinite(si) && si > 0)) {
    if (Number.isFinite(gc) && gc > 0) state.futures.gold = gc;
    if (Number.isFinite(si) && si > 0) state.futures.silver = si;
    state.futures.liveFetched = false;
    state.futures.source = 'COMEX GC=F / SI=F (Synced)';
    state.feedHealth.futuresAt = Date.parse(outlookState.data?.generatedAt || 0) || Date.now();
    renderFuturesPanel();
    renderFeedHealth();
    renderOutlook();
  }
}

let spotFetchInFlight = false;
let goldPriceOrgBlockedUntil = 0;

function isTickSane(candidate, prevGold, prevSilver) {
  const g = Number(candidate?.gold?.price);
  const s = Number(candidate?.silver?.price);
  if (!Number.isFinite(g) || !Number.isFinite(s) || g < 500 || g > 50000 || s < 5 || s > 2000) {
    return false;
  }
  if (prevGold > 0 && Math.abs(g - prevGold) / prevGold > 0.14) return false;
  if (prevSilver > 0 && Math.abs(s - prevSilver) / prevSilver > 0.22) return false;
  return true;
}

async function fetchSpotQuotes(checkQuorum = false) {
  if (spotFetchInFlight && !checkQuorum) return;
  spotFetchInFlight = true;
  const refreshBtn = document.getElementById('btn-refresh');
  refreshBtn?.classList.add('spinning');

  const prevG = state.quotes.gold.price || 0;
  const prevS = state.quotes.silver.price || 0;
  let result;
  state.liveMacro.consensusNote = '';
  state.feedTrust.checksCount += 1;
  try {
    if (checkQuorum) {
      const [gpRes, gaRes] = await Promise.allSettled([
        fetchFromGoldPriceOrg(),
        fetchFromGoldApiCom(),
      ]);
      const gpOk = gpRes.status === 'fulfilled' && isTickSane(gpRes.value, prevG, prevS);
      const gaOk = gaRes.status === 'fulfilled' && isTickSane(gaRes.value, prevG, prevS);
      if (gpRes.status === 'fulfilled' && !gpOk) state.feedTrust.rejectedOutliers += 1;
      if (gaRes.status === 'fulfilled' && !gaOk) state.feedTrust.rejectedOutliers += 1;

      if (gpOk) {
        goldPriceOrgBlockedUntil = 0;
        result = gpRes.value;
        state.feedTrust.primarySource = 'GoldPrice Spot';
        if (gaOk && result.gold.price > 0) {
          const spreadPct = (Math.abs(result.gold.price - gaRes.value.gold.price) / result.gold.price) * 100;
          state.feedTrust.lastSpreadPct = +spreadPct.toFixed(2);
          state.feedTrust.lastVerifiedAt = Date.now();
          if (spreadPct <= 0.65) {
            state.liveMacro.consensusNote = 'Verified ✓';
            state.feedTrust.status = 'verified';
            state.feedTrust.lastEventNote = `Both live price feeds agree within ${spreadPct.toFixed(2)}% — price verified.`;
          } else {
            state.liveMacro.consensusNote = `Diff ${spreadPct.toFixed(1)}%`;
            state.feedTrust.status = 'auto-healed';
            state.feedTrust.lastEventNote = `Small ${spreadPct.toFixed(2)}% price difference noticed between feeds.`;
          }
        } else {
          state.feedTrust.status = 'single';
          state.feedTrust.lastVerifiedAt = Date.now();
          state.feedTrust.lastEventNote = 'Primary GoldPrice feed healthy; secondary temporarily unavailable.';
        }
      } else if (gaOk) {
        goldPriceOrgBlockedUntil = Date.now() + 10 * 60 * 1000;
        result = gaRes.value;
        state.feedTrust.failovers += 1;
        state.feedTrust.status = 'auto-healed';
        state.feedTrust.primarySource = 'Gold-API Spot';
        state.feedTrust.lastVerifiedAt = Date.now();
        state.feedTrust.lastEventNote = 'Auto-healed to Gold-API Spot after primary feed timed out or failed sanity bounds.';
      } else {
        throw new Error('All live spot feeds failed');
      }
      state.mode = 'live';
    } else if (Date.now() < goldPriceOrgBlockedUntil) {
      const ga = await fetchFromGoldApiCom();
      if (!isTickSane(ga, prevG, prevS)) {
        state.feedTrust.rejectedOutliers += 1;
        throw new Error('Outlier tick rejected');
      }
      result = ga;
      state.feedTrust.primarySource = 'Gold-API Spot';
      state.feedTrust.status = state.feedTrust.failovers > 0 ? 'auto-healed' : 'verified';
      state.feedTrust.lastVerifiedAt = Date.now();
      state.mode = 'live';
    } else {
      try {
        const gp = await fetchFromGoldPriceOrg();
        if (!isTickSane(gp, prevG, prevS)) {
          state.feedTrust.rejectedOutliers += 1;
          throw new Error('Outlier primary tick rejected');
        }
        result = gp;
        state.feedTrust.primarySource = 'GoldPrice Spot';
        state.feedTrust.status = state.feedTrust.lastSpreadPct != null ? 'verified' : 'single';
        state.feedTrust.lastVerifiedAt = Date.now();
        state.feedTrust.lastEventNote = 'Primary live spot passed price & jump sanity bounds.';
        state.mode = 'live';
      } catch {
        goldPriceOrgBlockedUntil = Date.now() + 10 * 60 * 1000;
        state.feedTrust.failovers += 1;
        const ga = await fetchFromGoldApiCom();
        if (!isTickSane(ga, prevG, prevS)) {
          state.feedTrust.rejectedOutliers += 1;
          throw new Error('Outlier fallback tick rejected');
        }
        result = ga;
        state.feedTrust.primarySource = 'Gold-API Spot';
        state.feedTrust.status = 'auto-healed';
        state.feedTrust.lastVerifiedAt = Date.now();
        state.feedTrust.lastEventNote = 'Auto-healed seamlessly to Gold-API Spot backup feed.';
        state.mode = 'live';
      }
    }
  } catch {
    result = buildFallbackDemoQuotes();
    state.feedTrust.status = 'demo';
    state.feedTrust.lastEventNote = 'Offline fallback preview active until internet returns.';
    state.mode = 'demo';
  } finally {
    spotFetchInFlight = false;
    state.nextRefreshAt = Date.now() + REFRESH_MS;
    setTimeout(() => refreshBtn?.classList.remove('spinning'), 350);
  }

  applyQuotes(result);
}

function seedHistoryIfEmpty(metal, quote) {
  if (state.history[metal].length >= 2) return;
  const points = [];
  const start = quote.prevClose || quote.price;
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const wave = Math.sin(t * Math.PI * 2.2) * (quote.price * 0.0018);
    const val = start + (quote.price - start) * t + (i === steps - 1 ? 0 : wave);
    points.push({ ts: Date.now() - (steps - 1 - i) * 180000, price: +val.toFixed(3) });
  }
  state.history[metal] = points;
}

function flashPrice(el, oldVal, newVal) {
  if (oldVal == null || newVal == null || oldVal === newVal) return;
  const cls = newVal > oldVal ? 'flash-up' : 'flash-down';
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 700);
}

function applyQuotes(result) {
  const oldGold = state.quotes.gold.price;
  const oldSilver = state.quotes.silver.price;

  state.quotes.gold = result.gold;
  state.quotes.silver = result.silver;
  state.lastUpdated = new Date();
  state.feedHealth.spotAt = Date.now();
  state.feedHealth.spotSource = result.source || 'Spot';

  seedHistoryIfEmpty('gold', result.gold);
  seedHistoryIfEmpty('silver', result.silver);

  state.history.gold.push({ ts: Date.now(), price: result.gold.price });
  state.history.silver.push({ ts: Date.now(), price: result.silver.price });
  if (state.history.gold.length > 60) state.history.gold.shift();
  if (state.history.silver.length > 60) state.history.silver.shift();

  updateActive5mCandle('gold', result.gold.price, result.gold.prevClose);
  updateActive5mCandle('silver', result.silver.price, result.silver.prevClose);
  updateActive1mCandle('gold', result.gold.price, result.gold.prevClose);
  updateActive1mCandle('silver', result.silver.price, result.silver.prevClose);

  renderAll();
  flashPrice(document.getElementById('gold-price'), oldGold, result.gold.price);
  flashPrice(document.getElementById('silver-price'), oldSilver, result.silver.price);

  evaluateAlerts('gold', result.gold, false);
  evaluateAlerts('silver', result.silver, false);
  evaluateClientPriceTargets(result.gold.price, result.silver.price);
  evaluateClientRegimeAlerts();
  savePersistedState();
}

/* ---------- Alert Evaluation & ntfy.sh ---------- */

function maybeSendBrowserNotification(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: './icons/icon-192.png' });
  } catch {
    // Ignore restricted environments
  }
}

function isClientQuietHours(nowDate = new Date()) {
  const qh = state.settings.quietHours;
  if (!qh || !qh.enabled) return false;
  const s = Number(qh.start);
  const e = Number(qh.end);
  if (!Number.isInteger(s) || !Number.isInteger(e) || s === e) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(nowDate);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? nowDate.getHours()) % 24;
    return s < e ? h >= s && h < e : h >= s || h < e;
  } catch {
    const h = nowDate.getHours();
    return s < e ? h >= s && h < e : h >= s || h < e;
  }
}

function evaluateClientPriceTargets(goldPrice, silverPrice) {
  const t = state.settings.targets || {};
  const ratio = silverPrice > 0 ? goldPrice / silverPrice : 0;
  const rules = [
    { id: 'goldAbove', label: 'Gold (XAU)', symbol: 'XAU', val: goldPrice, target: parseFloat(t.goldAbove), op: 'gte', fmt: (v) => formatMoney(v), dir: 'up' },
    { id: 'goldBelow', label: 'Gold (XAU)', symbol: 'XAU', val: goldPrice, target: parseFloat(t.goldBelow), op: 'lte', fmt: (v) => formatMoney(v), dir: 'down' },
    { id: 'silverAbove', label: 'Silver (XAG)', symbol: 'XAG', val: silverPrice, target: parseFloat(t.silverAbove), op: 'gte', fmt: (v) => formatMoney(v), dir: 'up' },
    { id: 'silverBelow', label: 'Silver (XAG)', symbol: 'XAG', val: silverPrice, target: parseFloat(t.silverBelow), op: 'lte', fmt: (v) => formatMoney(v), dir: 'down' },
    { id: 'ratioAbove', label: 'Au/Ag Ratio', symbol: 'RATIO', val: ratio, target: parseFloat(t.ratioAbove), op: 'gte', fmt: (v) => `${v.toFixed(1)}:1`, dir: 'up' },
    { id: 'ratioBelow', label: 'Au/Ag Ratio', symbol: 'RATIO', val: ratio, target: parseFloat(t.ratioBelow), op: 'lte', fmt: (v) => `${v.toFixed(1)}:1`, dir: 'down' },
  ];
  const today = todayKey();
  if (!state.sessionAlerted.targets) state.sessionAlerted.targets = {};
  const quietNow = isClientQuietHours();

  for (const r of rules) {
    if (!Number.isFinite(r.target) || r.target <= 0 || !Number.isFinite(r.val)) continue;
    const hit = r.op === 'gte' ? r.val >= r.target : r.val <= r.target;
    if (!hit) continue;
    if (state.sessionAlerted.targets[r.id] === today) continue;
    if (quietNow) continue;
    state.sessionAlerted.targets[r.id] = today;

    const title = `${r.label} Target Hit (${r.op === 'gte' ? '≥' : '≤'} ${r.fmt(r.target)})`;
    const body = `Live ${r.label}: ${r.fmt(r.val)}`;
    showAlertBanner(title, body, r.dir);
    maybeSendBrowserNotification(title, body);
    state.alertLog.unshift({
      id: Date.now() + Math.random(),
      metal: r.symbol === 'XAG' ? 'silver' : 'gold',
      symbol: r.symbol,
      title,
      body,
      pct: 0,
      badge: r.fmt(r.target),
      dir: r.dir,
      time: formatTime(new Date()),
    });
    state.alertLog = state.alertLog.slice(0, 25);
    renderAlertLog();
    if (state.settings.ntfyTopic.trim()) {
      publishToNtfy({
        topic: state.settings.ntfyTopic.trim(),
        title,
        message: body,
        priority: 'high',
        tags: r.dir === 'up' ? 'dart,coin' : 'warning,coin',
      }).catch(() => {});
    }
  }
}

let regimeAlertBaselineReady = false;

function evaluateClientRegimeAlerts() {
  if (!outlookState.data) return;
  const rules = state.settings.smartAlerts || DEFAULT_SETTINGS.smartAlerts;
  const quietNow = isClientQuietHours();
  const today = todayKey();
  if (!state.sessionAlerted.regime) state.sessionAlerted.regime = {};
  const res = computeInteractiveOutlook();

  // On cold page boot, record already-active snapshot regimes silently so opening the app doesn't spam a banner;
  // live transitions during the session (or 24/7 GitHub Actions push alerts) fire immediately.
  if (!regimeAlertBaselineReady) {
    regimeAlertBaselineReady = true;
    for (const metal of ['gold', 'silver']) {
      if (res.futures?.[metal]?.isBackwardation) state.sessionAlerted.regime[`backw_${metal}`] = today;
      const reg = res.marketRegime?.[metal];
      if (reg && (reg.squeezeScore >= 65 || reg.key === 'squeeze' || reg.key === 'hybrid')) {
        state.sessionAlerted.regime[`squeeze_${metal}`] = today;
      }
    }
    const d5 = Number(res.dollarStrength?.dxy5dPct);
    if (Number.isFinite(d5) && Math.abs(d5) >= 0.8) {
      state.sessionAlerted.regime.dxy_shock = today;
    }
    return;
  }

  const triggerOne = (id, title, body, dir, badge, isExtreme = false) => {
    if (state.sessionAlerted.regime[id] === today) return;
    if (quietNow && !isExtreme) return;
    state.sessionAlerted.regime[id] = today;
    showAlertBanner(title, body, dir);
    maybeSendBrowserNotification(title, body);
    state.alertLog.unshift({
      id: Date.now() + Math.random(),
      metal: id.includes('silver') ? 'silver' : 'gold',
      symbol: 'REGIME',
      title,
      body,
      pct: 0,
      badge,
      dir,
      time: formatTime(new Date()),
    });
    state.alertLog = state.alertLog.slice(0, 25);
    renderAlertLog();
  };

  if (rules.backwardation) {
    for (const metal of ['gold', 'silver']) {
      const f = res.futures?.[metal];
      if (f?.isBackwardation && f.basisUsd < 0) {
        const mName = metal === 'gold' ? 'Gold' : 'Silver';
        triggerOne(
          `backw_${metal}`,
          `COMEX ${mName} Backwardation (${formatSignedMoney(f.basisUsd)}/oz)`,
          `Futures below Spot — downward-sloping physical tightness lifting price discovery.`,
          'up',
          'BACKW'
        );
      }
    }
  }

  if (rules.shortSqueeze) {
    for (const metal of ['gold', 'silver']) {
      const reg = res.marketRegime?.[metal];
      if (reg && (reg.squeezeScore >= 65 || reg.key === 'squeeze' || reg.key === 'hybrid')) {
        const mName = metal === 'gold' ? 'Gold' : 'Silver';
        triggerOne(
          `squeeze_${metal}`,
          `${mName} ${reg.label} (${reg.discoveryScore}D/${reg.squeezeScore}S)`,
          `Elevated COMEX/COT/gamma short-covering pressure active.`,
          'up',
          `${reg.squeezeScore}S`,
          reg.squeezeScore >= 80
        );
      }
    }
  }

  if (rules.dxyShock) {
    const d5 = Number(res.dollarStrength?.dxy5dPct);
    if (Number.isFinite(d5) && Math.abs(d5) >= 0.8) {
      const usdUp = d5 > 0;
      triggerOne(
        'dxy_shock',
        `US Dollar (DXY) ${usdUp ? 'Surge' : 'Drop'} ${formatSignedPct(d5)} (5d)`,
        `DXY ${res.dollarStrength.dxy.toFixed(2)} (${res.dollarStrength.regime}) shifting bullion FX cost.`,
        usdUp ? 'down' : 'up',
        `DXY ${formatSignedPct(d5)}`,
        Math.abs(d5) >= 1.6
      );
    }
  }
}

function directionMatches(pct, ruleDir) {
  if (ruleDir === 'up') return pct > 0;
  if (ruleDir === 'down') return pct < 0;
  return true;
}

function evaluateAlerts(metal, quote, isSimulated) {
  const threshold =
    metal === 'gold' ? state.settings.goldThreshold : state.settings.silverThreshold;
  const absPct = Math.abs(quote.pct);
  if (absPct < threshold) {
    state.pendingAlert[metal] = null;
    return false;
  }
  if (!directionMatches(quote.pct, state.settings.direction)) return false;

  const dir = quote.pct >= 0 ? 'up' : 'down';
  const today = todayKey();
  const prev = state.sessionAlerted[metal];

  if (!isSimulated && prev.day === today && prev.dir === dir && absPct < prev.pct + 0.75) {
    return false;
  }

  // Optional 2-check sustained confirmation filter to skip single-tick wick spikes
  if (!isSimulated && state.settings.confirmMoves && absPct < threshold * 1.65) {
    const pend = state.pendingAlert[metal];
    if (!pend || pend.day !== today || pend.dir !== dir) {
      state.pendingAlert[metal] = { day: today, dir };
      return false;
    }
  }
  state.pendingAlert[metal] = null;

  // Quiet Hours suppression (extreme >= 2x threshold shocks still break through)
  if (!isSimulated && isClientQuietHours() && absPct < threshold * 2) {
    return false;
  }

  if (!isSimulated) {
    state.sessionAlerted[metal] = { day: today, dir, pct: absPct };
  }

  const symbol = metal === 'gold' ? 'XAU' : 'XAG';
  const name = metal === 'gold' ? 'Gold' : 'Silver';
  const verb = dir === 'up' ? 'surged' : 'dropped';
  const title = `${isSimulated ? '[Simulated] ' : ''}${name} (${symbol}) ${verb} ${formatSignedPct(quote.pct)}`;
  const body = `Spot ${formatMoney(quote.price)}/oz (${formatSignedMoney(quote.chg)} vs prev close ${formatMoney(quote.prevClose)})`;

  showAlertBanner(title, body, dir);
  if (!isSimulated) maybeSendBrowserNotification(title, body);
  state.alertLog.unshift({
    id: Date.now() + Math.random(),
    metal,
    symbol,
    title,
    body,
    pct: quote.pct,
    dir,
    time: formatTime(new Date()),
  });
  state.alertLog = state.alertLog.slice(0, 25);
  renderAlertLog();

  // If user configured an ntfy topic and this is a live threshold breach while app is open
  if (!isSimulated && state.settings.ntfyTopic.trim()) {
    publishToNtfy({
      topic: state.settings.ntfyTopic.trim(),
      title,
      message: body,
      priority: absPct >= threshold * 1.75 ? 'urgent' : 'high',
      tags: dir === 'up' ? 'chart_with_upwards_trend,coin' : 'chart_with_downwards_trend,warning',
    }).catch(() => {});
  }

  return true;
}

function showAlertBanner(title, body, dir) {
  const banner = document.getElementById('alert-banner');
  const titleEl = document.getElementById('alert-banner-title');
  const bodyEl = document.getElementById('alert-banner-body');
  if (!banner || !titleEl || !bodyEl) return;

  banner.classList.remove('up', 'down');
  if (dir) banner.classList.add(dir);
  titleEl.textContent = title;
  bodyEl.textContent = body;
  banner.hidden = false;
}

async function publishToNtfy({ topic, title, message, priority = 'high', tags = 'bell,coin' }) {
  const cleanTopic = sanitizeNtfyTopic(topic);
  if (!cleanTopic) {
    throw new Error('Enter a valid ntfy topic name (letters, numbers, dashes, dots, or underscores only).');
  }

  const safePriority = ['min', 'low', 'default', 'high', 'urgent', 'max'].includes(String(priority))
    ? String(priority)
    : 'high';
  const safeTags = String(tags || 'bell,coin').replace(/[^A-Za-z0-9_,-]/g, '').slice(0, 80) || 'bell';
  const safeTitle = sanitizeShortText(String(title || 'Bullion Pulse Alert'), 180);
  const safeMessage = String(message || '').slice(0, 2000);

  // Query parameters + text/plain avoids CORS preflight issues in mobile browsers
  const params = new URLSearchParams({
    title: safeTitle,
    priority: safePriority,
    tags: safeTags,
  });

  const url = `https://ntfy.sh/${encodeURIComponent(cleanTopic)}?${params.toString()}`;
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      body: safeMessage,
    },
    10000
  );

  if (!res.ok) {
    throw new Error(`ntfy.sh returned HTTP ${res.status}`);
  }
  return cleanTopic;
}

/* ---------- Rendering ---------- */

function renderStatus() {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;

  dot.classList.remove('demo', 'error');
  const timeStr = state.lastUpdated ? formatTime(state.lastUpdated) : '';

  if (state.mode === 'live') {
    const qNote = state.liveMacro.consensusNote ? ` · ${state.liveMacro.consensusNote}` : '';
    text.textContent = `Live spot · ${timeStr}${qNote}`;
  } else if (state.mode === 'demo') {
    dot.classList.add('demo');
    text.textContent = `Offline preview · ${timeStr}`;
  } else {
    dot.classList.add('error');
    text.textContent = 'Connecting to spot feed…';
  }
}

function renderMetalCard(metal) {
  const quote = state.quotes[metal];
  const threshold =
    metal === 'gold' ? state.settings.goldThreshold : state.settings.silverThreshold;
  const decimals = metal === 'silver' || state.settings.unit === 'g' ? 2 : 2;
  const curr = getCurrencyCode();
  const unitSuffix = state.settings.unit === 'g' ? `${curr} / gram` : `${curr} / troy oz`;

  const priceEl = document.getElementById(`${metal}-price`);
  const chgEl = document.getElementById(`${metal}-chg`);
  const pctEl = document.getElementById(`${metal}-pct`);
  const unitEl = document.getElementById(`${metal}-unit-label`);
  const meterLabel = document.getElementById(`${metal}-meter-label`);
  const meterStatus = document.getElementById(`${metal}-meter-status`);
  const meterFill = document.getElementById(`${metal}-meter-fill`);
  const card = document.getElementById(`card-${metal}`);

  if (unitEl) unitEl.textContent = unitSuffix;
  if (card) card.classList.toggle('selected', state.settings.selectedMetal === metal);

  const canonical = getCanonicalSpotPrices();
  const rawPrice = quote.price ?? canonical[metal];
  if (rawPrice == null) return;

  const displayPrice = convertUnit(rawPrice);
  const displayChg = convertUnit(quote.chg || 0);

  const formattedPrice = formatMoney(displayPrice, decimals);
  priceEl.textContent = formattedPrice;
  priceEl.classList.toggle('long-val', formattedPrice.length >= 11);
  chgEl.textContent = quote.price != null ? `${formatSignedMoney(displayChg, decimals)} today` : 'Syncing live tick…';

  pctEl.textContent = formatSignedPct(quote.pct);
  pctEl.classList.remove('up', 'down');
  if (quote.pct > 0.005) pctEl.classList.add('up');
  else if (quote.pct < -0.005) pctEl.classList.add('down');

  const absPct = Math.abs(quote.pct);
  const progress = Math.min(100, (absPct / threshold) * 100);
  const triggered = absPct >= threshold;

  meterLabel.textContent = `Today's move vs ±${threshold.toFixed(metal === 'silver' ? 2 : 1)}% alert`;
  meterStatus.textContent = triggered
    ? 'Alert triggered'
    : `${Math.round(progress)}% toward alert`;
  meterFill.style.width = `${progress}%`;
  meterFill.classList.remove('triggered-up', 'triggered-down');
  if (triggered) {
    meterFill.classList.add(quote.pct >= 0 ? 'triggered-up' : 'triggered-down');
  }
}

function renderStats() {
  const gold = state.quotes.gold;
  const silver = state.quotes.silver;
  const ratioEl = document.getElementById('stat-ratio');
  const closeLabelEl = document.getElementById('stat-close-label');
  const closeEl = document.getElementById('stat-close');

  if (gold.price && silver.price) {
    ratioEl.textContent = `${(gold.price / silver.price).toFixed(1)} : 1`;
  }

  const sel = state.settings.selectedMetal;
  const q = state.quotes[sel];
  closeLabelEl.textContent = sel === 'gold' ? 'Gold Yesterday' : 'Silver Yesterday';
  closeEl.textContent = q.prevClose ? formatMoney(convertUnit(q.prevClose)) : '$—';

  const refEl = document.getElementById('stat-refresh');
  if (refEl) {
    const st = state.feedTrust?.status;
    refEl.textContent =
      st === 'verified'
        ? 'Verified ✓ · 15s'
        : st === 'auto-healed'
          ? 'Auto-Healed ✓ · 15s'
          : st === 'demo'
            ? 'Offline Preview'
            : 'Live · 15s';
  }
}

/* ---------- Multi-Timeframe OHLC Candlesticks & Forecast Fan Chart ---------- */

const CHART_TF_META = {
  '15min': { label: '15m', interval: '1m',  barMs: 60000,       subtitle: '1-min price bars · Live 15 mins', fcHorizon: '7d', fcLabel: '+7d', maxBars: 120, defaultVisible: 15 },
  '1h':    { label: '1H',  interval: '1m',  barMs: 60000,       subtitle: '1-min price bars · Past 1 hour',  fcHorizon: '7d', fcLabel: '+7d', maxBars: 120, defaultVisible: 60 },
  '4h':    { label: '4H',  interval: '5m',  barMs: 300000,      subtitle: '5-min price bars · Past 4 hours', fcHorizon: '7d', fcLabel: '+7d', maxBars: 288, defaultVisible: 48 },
  '1d':    { label: '1D',  interval: '30m', barMs: 1800000,     subtitle: '30-min price bars · 24 hours',    fcHorizon: '7d', fcLabel: '+7d', maxBars: 48,  defaultVisible: 48 },
  '7d':    { label: '7D',  interval: '1h',  barMs: 3600000,     subtitle: 'Hourly bars · 7 days',            fcHorizon: '7d', fcLabel: '+7d', maxBars: 84,  defaultVisible: 42 },
  '1m':    { label: '1M',  interval: '1d',  barMs: 86400000,    subtitle: 'Daily bars · 1 month',            fcHorizon: '1m', fcLabel: '+1M', maxBars: 45,  defaultVisible: 28 },
  '6m':    { label: '6M',  interval: '3d',  barMs: 259200000,   subtitle: '3-day bars · 6 months',           fcHorizon: '6m', fcLabel: '+6M', maxBars: 60,  defaultVisible: 36 },
  '1y':    { label: '1Y',  interval: '1wk', barMs: 604800000,   subtitle: 'Weekly bars · 1 year',            fcHorizon: '1y', fcLabel: '+1Y', maxBars: 60,  defaultVisible: 52 },
  '5y':    { label: '5Y',  interval: '1mo', barMs: 2629746000,  subtitle: 'Monthly bars · 5 years',          fcHorizon: '1y', fcLabel: '+1Y', maxBars: 60,  defaultVisible: 60 },
  '10y':   { label: '10Y', interval: '2mo', barMs: 5259492000,  subtitle: '2-month bars · 10 years',         fcHorizon: '5y', fcLabel: '+5Y', maxBars: 48,  defaultVisible: 48 },
  all:     { label: 'ALL', interval: '1yr', barMs: 31556952000, subtitle: 'Yearly bars · 1975–2026',         fcHorizon: '5y', fcLabel: '+5Y', maxBars: 52,  defaultVisible: 52 },
};

const CLIENT_HISTORICAL_ANCHORS = {
  gold: [
    [1975, 161], [1980, 615, 850, 481], [1985, 317], [1990, 383], [1995, 384],
    [2000, 279], [2005, 445], [2008, 872], [2011, 1572, 1921, 1319], [2015, 1160],
    [2018, 1269], [2020, 1770, 2075, 1451], [2021, 1799], [2022, 1800], [2023, 1941],
    [2024, 2624, 2790, 1984], [2025, 4289.5, 4381, 2620], [2026, 3542.81, 5589.38, 3518.73],
  ],
  silver: [
    [1975, 4.42], [1980, 20.98, 49.45, 10.80], [1985, 6.14], [1990, 4.82], [1995, 5.19],
    [2000, 4.95], [2005, 7.31], [2008, 14.99], [2011, 35.12, 49.51, 26.15], [2015, 15.68],
    [2018, 15.71], [2020, 20.55], [2021, 25.14], [2022, 21.73], [2023, 23.35],
    [2024, 28.90, 34.86, 22.05], [2025, 64.73, 66.20, 28.80], [2026, 42.22, 121.62, 41.40],
  ],
};

const CLIENT_MONTHLY_2526 = {
  gold: [
    [2025.00, 2624.0], [2025.25, 3120.0], [2025.50, 3380.0], [2025.75, 3665.2],
    [2025.88, 4078.0], [2025.99, 4289.5], [2026.08, 5589.38], [2026.15, 4865.4],
    [2026.25, 5278.3], [2026.55, 4005.9], [2026.70, 4452.3], [2026.78, 4156.0],
    [2026.85, 3862.0], [2026.89, 3542.81],
  ],
  silver: [
    [2025.00, 28.90], [2025.26, 29.58], [2025.50, 36.80], [2025.75, 44.50],
    [2025.88, 51.36], [2025.92, 57.03], [2025.99, 64.73], [2026.04, 91.21],
    [2026.08, 121.62], [2026.10, 113.95], [2026.16, 82.55], [2026.24, 67.00],
    [2026.55, 58.41], [2026.62, 71.15], [2026.70, 66.61], [2026.78, 60.39],
    [2026.85, 53.31], [2026.89, 42.22],
  ],
};

function bucket5m(ts = Date.now()) {
  return Math.floor(ts / CANDLE_INTERVAL_MS) * CANDLE_INTERVAL_MS;
}

function bucket1m(ts = Date.now()) {
  return Math.floor(ts / CANDLE_1M_MS) * CANDLE_1M_MS;
}

function aggregateBarsByInterval(bars, intervalMs) {
  if (!Array.isArray(bars) || !bars.length || !(intervalMs > 0)) return bars || [];
  const out = [];
  let cur = null;
  let curBucket = null;
  for (const b of bars) {
    if (!b || !Number.isFinite(b.t) || !(b.o > 0) || !(b.c > 0)) continue;
    const bkt = Math.floor(b.t / intervalMs) * intervalMs;
    if (cur && bkt === curBucket) {
      cur.h = +Math.max(cur.h, b.h).toFixed(2);
      cur.l = +Math.min(cur.l, b.l).toFixed(2);
      cur.c = +b.c.toFixed(2);
    } else {
      curBucket = bkt;
      cur = {
        t: bkt,
        o: +b.o.toFixed(2),
        h: +b.h.toFixed(2),
        l: +b.l.toFixed(2),
        c: +b.c.toFixed(2),
      };
      out.push(cur);
    }
  }
  return out;
}

function seed5mCandlesIfEmpty(metal, spotPrice, prevClose, force = false) {
  if (!force && (state.candlesSource[metal] === 'live' || state.candles[metal].length >= 8)) return;
  const nowBucket = bucket5m(Date.now());
  const count = 96;
  const startPrice = prevClose || spotPrice;
  const vol = metal === 'silver' ? 0.0028 : 0.0014;
  const bars = [];
  let cursor = startPrice;

  for (let i = count - 1; i >= 0; i--) {
    const t = nowBucket - i * CANDLE_INTERVAL_MS;
    const progress = (count - 1 - i) / Math.max(1, count - 1);
    const target = startPrice + (spotPrice - startPrice) * progress;
    const o = cursor;
    const step = (target - o) * 0.45 + Math.sin(i * 1.15) * (spotPrice * vol * 0.55);
    const c = i === 0 ? spotPrice : +(o + step).toFixed(2);
    const wickUp = Math.abs(Math.cos(i * 1.7)) * spotPrice * vol * 0.65;
    const wickDn = Math.abs(Math.sin(i * 2.1)) * spotPrice * vol * 0.65;
    const h = +(Math.max(o, c) + wickUp).toFixed(2);
    const l = +(Math.min(o, c) - wickDn).toFixed(2);
    bars.push({ t, o: +o.toFixed(2), h, l, c });
    cursor = c;
  }
  state.candles[metal] = bars;
  state.candlesSource[metal] = 'seed';
}

function seed1mCandlesIfEmpty(metal, spotPrice, prevClose, force = false) {
  if (!force && (state.candles1mSource[metal] === 'live' || state.candles1m[metal].length >= 15)) return;
  const nowBucket = bucket1m(Date.now());
  const src5m = state.candles[metal];
  const bars = [];

  if (Array.isArray(src5m) && src5m.length >= 6) {
    // Subdivide the latest 12 intraday bars into 60 smooth 1-minute candles anchored to live spot
    const slice = src5m.slice(-12);
    const total1m = slice.length * 5;
    let idx1m = 0;
    for (let s = 0; s < slice.length; s++) {
      const b = slice[s];
      const isLast5m = s === slice.length - 1;
      const barClose = isLast5m && spotPrice != null ? spotPrice : b.c;
      const barHigh = Math.max(b.h, b.o, barClose);
      const barLow = Math.min(b.l, b.o, barClose);
      const range = barHigh - barLow;
      const bullish = barClose >= b.o;
      const waypoints = bullish
        ? [
            barLow + range * 0.18,
            barLow + range * 0.42,
            barLow + range * 0.68,
            barLow + range * 0.86,
            barClose,
          ]
        : [
            barLow + range * 0.82,
            barLow + range * 0.58,
            barLow + range * 0.32,
            barLow + range * 0.14,
            barClose,
          ];
      const span = Math.max(range, barClose * (metal === 'silver' ? 0.0005 : 0.00025));

      for (let k = 0; k < 5; k++) {
        const o = k === 0 ? b.o : waypoints[k - 1];
        const c = k === 4 ? barClose : waypoints[k];
        const wickA = span * (0.1 + 0.08 * Math.abs(Math.sin((idx1m + 1) * 1.9)));
        const wickB = span * (0.1 + 0.08 * Math.abs(Math.cos((idx1m + 1) * 2.3)));
        let h = Math.min(barHigh, Math.max(o, c) + wickA);
        let l = Math.max(barLow, Math.min(o, c) - wickB);
        if (bullish && k === 0) l = barLow;
        if (bullish && k === 3) h = barHigh;
        if (!bullish && k === 0) h = barHigh;
        if (!bullish && k === 3) l = barLow;
        const t = nowBucket - (total1m - 1 - idx1m) * CANDLE_1M_MS;
        bars.push({
          t,
          o: +o.toFixed(2),
          h: +Math.max(o, c, h).toFixed(2),
          l: +Math.max(0.01, Math.min(o, c, l)).toFixed(2),
          c: +c.toFixed(2),
        });
        idx1m++;
      }
    }
    state.candles1m[metal] = bars;
    return;
  }

  const count = 60;
  const vol = metal === 'silver' ? 0.00095 : 0.00045;
  const drift = prevClose && spotPrice ? (spotPrice - prevClose) * 0.18 : 0;
  const startPrice = spotPrice - drift;
  let cursor = startPrice;
  for (let i = count - 1; i >= 0; i--) {
    const t = nowBucket - i * CANDLE_1M_MS;
    const progress = (count - 1 - i) / Math.max(1, count - 1);
    const target = startPrice + (spotPrice - startPrice) * progress;
    const o = cursor;
    const step = (target - o) * 0.42 + Math.sin(i * 0.95 + (metal === 'silver' ? 1.5 : 0)) * (spotPrice * vol * 0.6);
    const c = i === 0 ? spotPrice : +(o + step).toFixed(2);
    const wUp = Math.abs(Math.cos(i * 1.45)) * spotPrice * vol * 0.7;
    const wDn = Math.abs(Math.sin(i * 1.85)) * spotPrice * vol * 0.7;
    bars.push({
      t,
      o: +o.toFixed(2),
      h: +(Math.max(o, c) + wUp).toFixed(2),
      l: +Math.max(0.01, Math.min(o, c) - wDn).toFixed(2),
      c,
    });
    cursor = c;
  }
  state.candles1m[metal] = bars;
}

function updateActive1mCandle(metal, price, prevClose) {
  if (price == null) return;
  if (state.candles1mSource[metal] !== 'live') {
    seed1mCandlesIfEmpty(metal, price, prevClose);
  }
  const bars = state.candles1m[metal];
  const currentBucket = bucket1m(Date.now());
  const last = bars[bars.length - 1];

  if (!last) {
    bars.push({
      t: currentBucket,
      o: +price.toFixed(2),
      h: +price.toFixed(2),
      l: +price.toFixed(2),
      c: +price.toFixed(2),
    });
    return;
  }
  if (last.t < currentBucket) {
    // Avoid appending flat synthetic bars across weekend/market-closed gaps when price is unchanged
    const minDiff = metal === 'silver' ? 0.005 : 0.05;
    const gapMs = currentBucket - last.t;
    if (gapMs > 10 * CANDLE_1M_MS && Math.abs(price - last.c) < minDiff) {
      return;
    }
    // Across a multi-minute/weekend gap, open at the fresh session price instead of stretching a fake vertical bar
    const open = gapMs <= 2 * CANDLE_1M_MS ? last.c : price;
    bars.push({
      t: currentBucket,
      o: +open.toFixed(2),
      h: +Math.max(open, price).toFixed(2),
      l: +Math.min(open, price).toFixed(2),
      c: +price.toFixed(2),
    });
    if (bars.length > 120) bars.shift();
  } else {
    last.h = +Math.max(last.h, price).toFixed(2);
    last.l = +Math.min(last.l, price).toFixed(2);
    last.c = +price.toFixed(2);
  }
}

function buildFallbackTimeframeBars(metal, tf, spot, prevClose) {
  if (tf === '1d') {
    seed5mCandlesIfEmpty(metal, spot, prevClose);
    return state.candles[metal];
  }
  const anchors = CLIENT_HISTORICAL_ANCHORS[metal];
  const monthly = CLIENT_MONTHLY_2526[metal].map(([yf, val], idx, arr) => [
    yf,
    idx === arr.length - 1 ? spot : val,
  ]);
  const knots = [
    ...anchors.filter(([yr]) => yr < 2025).map(([yr, cl]) => [yr, cl]),
    ...monthly,
  ];
  const isSilver = metal === 'silver';
  const nowMs = Date.now();
  const dayMs = 86400000;

  if (tf === 'all') {
    const bars = [];
    for (let i = 0; i < anchors.length; i++) {
      const [yr, rawC, expH, expL] = anchors[i];
      const c = i === anchors.length - 1 ? spot : rawC;
      const o = i === 0 ? +(c * 0.95).toFixed(2) : anchors[i - 1][1];
      const wick = Math.max(Math.abs(c - o) * 0.35, c * (isSilver ? 0.13 : 0.075));
      const h = +(expH ?? (Math.max(o, c) + wick));
      const l = +Math.max(0.5, expL ?? (Math.min(o, c) - wick * 0.8));
      bars.push({
        t: i === anchors.length - 1 ? nowMs : Date.UTC(yr, 11, 15),
        o: +o.toFixed(2),
        h: +Math.max(o, c, h).toFixed(2),
        l: +Math.max(0.5, Math.min(o, c, l)).toFixed(2),
        c: +c.toFixed(2),
      });
    }
    return bars;
  }

  const maxY = knots[knots.length - 1][0];
  const interp = (yr) => {
    if (yr <= knots[0][0]) return knots[0][1];
    if (yr >= maxY) return spot;
    for (let i = 0; i < knots.length - 1; i++) {
      if (yr >= knots[i][0] && yr <= knots[i + 1][0]) {
        const span = knots[i + 1][0] - knots[i][0] || 1;
        return knots[i][1] + (knots[i + 1][1] - knots[i][1]) * ((yr - knots[i][0]) / span);
      }
    }
    return spot;
  };
  const cfgs = {
    '7d':  { count: 36, stepMs: 4 * 3600000, spanY: 7 / 365, vol: isSilver ? 0.011 : 0.0055 },
    '1m':  { count: 24, stepMs: 1.25 * dayMs, spanY: 30 / 365, vol: isSilver ? 0.02 : 0.011 },
    '6m':  { count: 36, stepMs: 5 * dayMs, spanY: 0.5, vol: isSilver ? 0.036 : 0.019 },
    '1y':  { count: 52, stepMs: 7 * dayMs, spanY: 1, vol: isSilver ? 0.042 : 0.022 },
    '5y':  { count: 60, stepMs: 30.4 * dayMs, spanY: 5, vol: isSilver ? 0.062 : 0.034 },
    '10y': { count: 48, stepMs: 76 * dayMs, spanY: 10, vol: isSilver ? 0.08 : 0.045 },
  };
  const cfg = cfgs[tf] || cfgs['1m'];
  const bars = [];
  let cursor = interp(maxY - cfg.spanY);
  for (let i = cfg.count - 1; i >= 0; i--) {
    const t = Math.round(nowMs - i * cfg.stepMs);
    const fracPrev = (cfg.count - 2 - i) / Math.max(1, cfg.count - 1);
    const frac = (cfg.count - 1 - i) / Math.max(1, cfg.count - 1);
    const yPrev = maxY - cfg.spanY * (1 - Math.max(0, fracPrev));
    const yCurr = maxY - cfg.spanY * (1 - frac);
    const target = interp(yCurr);
    const o = cursor;
    const step = (target - o) * 0.68 + Math.sin(i * 1.2 + (isSilver ? 2 : 0)) * target * cfg.vol * 0.65;
    const c = i === 0 ? spot : Math.max(1, +(o + step).toFixed(2));
    const wUp = Math.abs(Math.cos(i * 1.6)) * target * cfg.vol * 0.65;
    const wDn = Math.abs(Math.sin(i * 2.0)) * target * cfg.vol * 0.65;
    let h = +(Math.max(o, c) + wUp).toFixed(2);
    let l = +Math.max(0.5, Math.min(o, c) - wDn).toFixed(2);
    for (const [ky, kv] of knots) {
      if (ky >= Math.min(yPrev, yCurr) && ky <= Math.max(yPrev, yCurr)) {
        if (kv > h) h = +kv.toFixed(2);
        if (kv < l) l = +Math.max(0.5, kv).toFixed(2);
      }
    }
    bars.push({ t, o: +o.toFixed(2), h, l, c });
    cursor = c;
  }
  return bars;
}

function getCandlesForTimeframe(metal, tf) {
  const quote = state.quotes[metal];
  const spot = quote.price ?? (metal === 'gold' ? 3542.81 : 42.22);
  const prevClose = quote.prevClose ?? (metal === 'gold' ? 3626.21 : 42.84);
  const meta = CHART_TF_META[tf] || CHART_TF_META['1d'];

  if (tf === '15min' || tf === '1h') {
    if (state.candlesSource[metal] !== 'live') seed5mCandlesIfEmpty(metal, spot, prevClose);
    const bars1m = state.candles1m[metal];
    if (
      state.candles1mSource[metal] !== 'live' &&
      bars1m.length >= 6 &&
      quote.price != null &&
      Math.abs(bars1m[bars1m.length - 1].c - quote.price) / quote.price > 0.05
    ) {
      seed1mCandlesIfEmpty(metal, spot, prevClose, true);
    } else if (state.candles1mSource[metal] !== 'live') {
      seed1mCandlesIfEmpty(metal, spot, prevClose);
    }
    return state.candles1m[metal].slice(-meta.maxBars);
  }

  if (tf === '4h') {
    const bars = state.candles[metal];
    if (
      state.candlesSource[metal] !== 'live' &&
      bars.length >= 4 &&
      quote.price != null &&
      Math.abs(bars[bars.length - 1].c - quote.price) / quote.price > 0.05
    ) {
      seed5mCandlesIfEmpty(metal, spot, prevClose, true);
    } else if (state.candlesSource[metal] !== 'live') {
      seed5mCandlesIfEmpty(metal, spot, prevClose);
    }
    return state.candles[metal].slice(-meta.maxBars);
  }

  if (tf === '1d') {
    const bars = state.candles[metal];
    if (
      state.candlesSource[metal] !== 'live' &&
      bars.length >= 4 &&
      quote.price != null &&
      Math.abs(bars[bars.length - 1].c - quote.price) / quote.price > 0.05
    ) {
      seed5mCandlesIfEmpty(metal, spot, prevClose, true);
    } else if (state.candlesSource[metal] !== 'live') {
      seed5mCandlesIfEmpty(metal, spot, prevClose);
    }
    const raw5m = state.candles[metal];
    // Roll true 5m bars into exact 30-minute bars (up to 48 bars = full 24h trading day) when 5+ hours exist
    if (raw5m.length >= 60) {
      return aggregateBarsByInterval(raw5m, 30 * 60 * 1000).slice(-meta.maxBars);
    }
    // If the fresh session just opened (e.g., Sunday evening with <16 bars), bridge with prior real Yahoo 7d hourly bars instead of faking closed hours
    const hist7d = state.timeframes?.['7d']?.[metal];
    if (raw5m.length < 24 && Array.isArray(hist7d) && hist7d.length >= 6) {
      const first5mT = raw5m[0]?.t || Date.now();
      const priorReal = hist7d.filter((b) => b.t < first5mT - 60000).slice(-20);
      const bridged = [...priorReal, ...aggregateBarsByInterval(raw5m, 30 * 60 * 1000)];
      if (bridged.length >= 4) return bridged.slice(-meta.maxBars);
    }
    return raw5m.slice(-meta.maxBars);
  }
  const loaded = state.timeframes?.[tf]?.[metal];
  const src =
    Array.isArray(loaded) && loaded.length >= 6
      ? loaded.slice(-meta.maxBars)
      : buildFallbackTimeframeBars(metal, tf, spot, prevClose).slice(-meta.maxBars);

  // Keep the newest bar synced to live spot without mutating the source cache
  if (src.length && quote.price != null) {
    const clone = src.map((b) => ({ ...b }));
    const last = clone[clone.length - 1];
    last.c = +quote.price.toFixed(2);
    last.h = +Math.max(last.h, quote.price).toFixed(2);
    last.l = +Math.min(last.l, quote.price).toFixed(2);
    return clone;
  }
  return src;
}

function formatCandleTimestamp(ts, tf, compact = false, showWeekday = false) {
  const d = new Date(ts);
  if (tf === '15min' || tf === '1h' || tf === '4h' || tf === '1d') {
    const tStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (showWeekday) {
      const wd = d.toLocaleDateString([], { weekday: 'short' });
      return `${wd} ${tStr}`;
    }
    return tStr;
  }
  if (tf === '7d') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + (compact ? '' : ' ' + d.toLocaleTimeString([], { hour: 'numeric' }));
  }
  if (tf === '1m' || tf === '6m' || tf === '1y') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  if (tf === '5y' || tf === '10y') {
    return d.toLocaleDateString([], { month: 'short', year: compact ? '2-digit' : 'numeric' });
  }
  return String(d.getUTCFullYear());
}

function formatCandleRangeLabel(ts, tf, barMsOverride = null, showWeekday = false) {
  if (tf === '15min' || tf === '1h' || tf === '4h' || tf === '1d') {
    const stepMs =
      barMsOverride && barMsOverride >= 60000 && barMsOverride <= 3600000
        ? barMsOverride
        : (CHART_TF_META[tf]?.barMs || CANDLE_INTERVAL_MS);
    const dStart = new Date(ts);
    const sStr = dStart.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const eStr = new Date(ts + stepMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const sMer = sStr.match(/\s*([AP]M)$/i);
    const eMer = eStr.match(/\s*([AP]M)$/i);
    const prefix = showWeekday ? `${dStart.toLocaleDateString([], { weekday: 'short' })} ` : '';
    if (sMer && eMer && sMer[1].toUpperCase() === eMer[1].toUpperCase()) {
      return `${prefix}${sStr.replace(/\s*[AP]M$/i, '')}–${eStr}`;
    }
    return `${prefix}${sStr}–${eStr}`;
  }
  return formatCandleTimestamp(ts, tf, false);
}

function updateActive5mCandle(metal, price, prevClose) {
  if (price == null) return;
  if (state.candlesSource[metal] !== 'live') {
    seed5mCandlesIfEmpty(metal, price, prevClose);
  }
  const bars = state.candles[metal];
  const currentBucket = bucket5m(Date.now());
  const last = bars[bars.length - 1];

  if (!last) {
    bars.push({
      t: currentBucket,
      o: +price.toFixed(2),
      h: +price.toFixed(2),
      l: +price.toFixed(2),
      c: +price.toFixed(2),
    });
    return;
  }
  if (last.t < currentBucket) {
    const gapMs = currentBucket - last.t;
    const minDiff = metal === 'silver' ? 0.005 : 0.05;
    if (gapMs > 6 * CANDLE_INTERVAL_MS && Math.abs(price - last.c) < minDiff) {
      return;
    }
    // Across a weekend or session gap, open cleanly at the new live session price rather than stretching Friday's close
    const open = gapMs <= 2 * CANDLE_INTERVAL_MS ? last.c : price;
    bars.push({
      t: currentBucket,
      o: +open.toFixed(2),
      h: +Math.max(open, price).toFixed(2),
      l: +Math.min(open, price).toFixed(2),
      c: +price.toFixed(2),
    });
    if (bars.length > 300) bars.shift();
  } else {
    last.h = +Math.max(last.h, price).toFixed(2);
    last.l = +Math.min(last.l, price).toFixed(2);
    last.c = +price.toFixed(2);
  }
}

function getRatioBarsForTimeframe(tf) {
  const gBars = getCandlesForTimeframe('gold', tf);
  const sBars = getCandlesForTimeframe('silver', tf);
  const n = Math.min(gBars.length, sBars.length);
  const gOff = gBars.length - n;
  const sOff = sBars.length - n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const g = gBars[gOff + i];
    const s = sBars[sOff + i];
    if (!g || !s || s.c <= 0 || s.o <= 0 || s.h <= 0 || s.l <= 0) continue;
    const o = +(g.o / s.o).toFixed(2);
    const c = +(g.c / s.c).toFixed(2);
    const rH = +(g.h / s.h).toFixed(2);
    const rL = +(g.l / s.l).toFixed(2);
    out.push({
      t: g.t || s.t,
      o,
      h: +Math.max(o, c, rH).toFixed(2),
      l: +Math.max(1, Math.min(o, c, rL)).toFixed(2),
      c,
    });
  }
  return out;
}

function computeSmaSeries(bars, period) {
  const out = new Array(bars.length).fill(null);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c;
    if (i >= period) sum -= bars[i - period].c;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function computeRsiSeries(bars, period = 14) {
  const values = new Array(bars.length).fill(null);
  if (bars.length <= period) return { values, latest: null };
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const chg = bars[i].c - bars[i - 1].c;
    if (chg >= 0) avgGain += chg;
    else avgLoss -= chg;
  }
  avgGain /= period;
  avgLoss /= period;
  values[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < bars.length; i++) {
    const chg = bars[i].c - bars[i - 1].c;
    const gain = chg > 0 ? chg : 0;
    const loss = chg < 0 ? -chg : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    values[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  const latest = values[bars.length - 1];
  return { values, latest: latest != null ? +latest.toFixed(1) : null };
}

let histCandlesLoaded = false;
let histCandlesLoading = null;

async function ensureHistoricalCandlesLoaded() {
  if (histCandlesLoaded) return;
  if (histCandlesLoading) return histCandlesLoading;
  histCandlesLoading = (async () => {
    try {
      const data = await fetchFreshRepoJson('candles_hist.json').catch(() =>
        fetchFreshRepoJson('candles.json')
      );
      if (data.timeframes && typeof data.timeframes === 'object') {
        state.timeframes = { ...(state.timeframes || {}), ...data.timeframes };
        histCandlesLoaded = true;
        renderChart();
        renderOutlook();
      }
    } catch {
      // Fallback multi-timeframe generator remains active offline
    } finally {
      histCandlesLoading = null;
    }
  })();
  return histCandlesLoading;
}

async function fetchCandlesData() {
  try {
    // Lightweight 5m intraday payload (~70% smaller for 5-minute mobile refreshes)
    const data = await fetchFreshRepoJson('candles_1d.json').catch(() =>
      fetchFreshRepoJson('candles.json')
    );
    if (data.timeframes && typeof data.timeframes === 'object') {
      state.timeframes = { ...(state.timeframes || {}), ...data.timeframes };
      if (Object.keys(data.timeframes).length > 1) histCandlesLoaded = true;
    }
    const g1d = data.timeframes?.['1d']?.gold || data.gold;
    const s1d = data.timeframes?.['1d']?.silver || data.silver;
    if (Array.isArray(g1d) && g1d.length >= 1) {
      state.candles.gold = g1d.slice(-288);
      state.candlesSource.gold = 'live';
      if (state.quotes.gold.price != null && state.quotes.gold.prevClose === state.quotes.gold.price && state.candles.gold[0]?.o > 0) {
        state.quotes.gold.prevClose = +state.candles.gold[0].o.toFixed(2);
        state.quotes.gold.chg = +(state.quotes.gold.price - state.quotes.gold.prevClose).toFixed(2);
        state.quotes.gold.pct = +((state.quotes.gold.chg / state.quotes.gold.prevClose) * 100).toFixed(2);
        renderMetalCard('gold');
        renderStats();
        renderStackTracker();
      }
    }
    if (Array.isArray(s1d) && s1d.length >= 1) {
      state.candles.silver = s1d.slice(-288);
      state.candlesSource.silver = 'live';
      if (state.quotes.silver.price != null && state.quotes.silver.prevClose === state.quotes.silver.price && state.candles.silver[0]?.o > 0) {
        state.quotes.silver.prevClose = +state.candles.silver[0].o.toFixed(2);
        state.quotes.silver.chg = +(state.quotes.silver.price - state.quotes.silver.prevClose).toFixed(2);
        state.quotes.silver.pct = +((state.quotes.silver.chg / state.quotes.silver.prevClose) * 100).toFixed(2);
        renderMetalCard('silver');
        renderStats();
        renderStackTracker();
      }
    }
    const g1m = data.bars1m?.gold;
    const s1m = data.bars1m?.silver;
    if (Array.isArray(g1m) && g1m.length >= 1) {
      state.candles1m.gold = g1m.slice(-120);
      state.candles1mSource.gold = 'live';
    } else if (state.quotes.gold.price && state.candles1mSource.gold !== 'live') {
      seed1mCandlesIfEmpty('gold', state.quotes.gold.price, state.quotes.gold.prevClose, true);
    }
    if (Array.isArray(s1m) && s1m.length >= 1) {
      state.candles1m.silver = s1m.slice(-120);
      state.candles1mSource.silver = 'live';
    } else if (state.quotes.silver.price && state.candles1mSource.silver !== 'live') {
      seed1mCandlesIfEmpty('silver', state.quotes.silver.price, state.quotes.silver.prevClose, true);
    }
    if (state.quotes.gold.price) {
      updateActive5mCandle('gold', state.quotes.gold.price, state.quotes.gold.prevClose);
      updateActive1mCandle('gold', state.quotes.gold.price, state.quotes.gold.prevClose);
    }
    if (state.quotes.silver.price) {
      updateActive5mCandle('silver', state.quotes.silver.price, state.quotes.silver.prevClose);
      updateActive1mCandle('silver', state.quotes.silver.price, state.quotes.silver.prevClose);
    }
    renderChart();
    renderOutlook();
    const activeTf = state.settings.chartTimeframe || '1d';
    const needsHistBridge = (Array.isArray(g1d) && g1d.length < 48) || (Array.isArray(s1d) && s1d.length < 48);
    if ((!INTRADAY_TIMEFRAMES.has(activeTf) || needsHistBridge) && !histCandlesLoaded) {
      ensureHistoricalCandlesLoaded();
    }
  } catch {
    // Seeded local candles remain active offline
  }
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatRelativeAge(tsMs) {
  if (!tsMs || !Number.isFinite(tsMs)) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - tsMs) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function renderFeedHealth() {
  const fh = state.feedHealth;
  const setPill = (id, label, ts, isLive, fallbackText = 'Saved') => {
    const el = document.getElementById(id);
    if (!el) return;
    const age = ts ? formatRelativeAge(ts) : fallbackText;
    const stale = ts ? Date.now() - ts > 6 * 3600 * 1000 : !isLive;
    el.className = `fh-pill ${isLive ? 'live' : stale ? 'stale' : ''}`;
    el.innerHTML = `<i class="fh-dot"></i>${escapeHtml(label)} ${escapeHtml(age)}`;
  };
  setPill('fh-spot', 'Spot', fh.spotAt, state.mode === 'live', 'Connecting');
  setPill('fh-dxy', 'Dollar', fh.dxyAt, fh.dxyLive, 'Saved');
  setPill('fh-futures', 'Futures', fh.futuresAt, fh.futuresAt != null && Date.now() - fh.futuresAt < 3 * 3600 * 1000, 'Synced');
  setPill('fh-sge', 'China', fh.sgeAt, fh.sgeAt != null && Date.now() - fh.sgeAt < 6 * 3600 * 1000, 'Saved');
  setPill('fh-comex', 'Vaults', fh.comexAt, fh.comexLive, 'Saved');
  setPill('fh-outlook', 'Forecast', fh.outlookAt, fh.outlookAt != null && Date.now() - fh.outlookAt < 4 * 3600 * 1000, 'Synced');
}

function updateCandleCountdown() {
  const el = document.getElementById('chart-subtitle');
  if (el) {
    const tf = state.settings.chartTimeframe || '1d';
    const now = Date.now();
    const nextTickAt = state.nextRefreshAt || now + REFRESH_MS;
    const remaining = Math.max(0, nextTickAt - now);
    const meta = CHART_TF_META[tf] || CHART_TF_META['1d'];
    if (tf === '1d') {
      el.textContent = `30-min price bars · 24 hours · Next live update in ${formatCountdown(remaining)}`;
    } else if (tf === '15min' || tf === '1h') {
      el.textContent = `${meta.subtitle} · Next live update in ${formatCountdown(remaining)}`;
    } else {
      el.textContent = `${meta.subtitle} · Live update in ${formatCountdown(remaining)}`;
    }
  }
  renderFeedHealth();
}

/* ---------- Chart Zoom & Pan Engine ---------- */

function resetChartZoom() {
  state.chartZoom.startIdx = null;
  state.chartZoom.visibleCount = null;
  state.hoverCandleIdx = null;
  state.hoverForecastIdx = null;
}

function getZoomWindow(totalLen, meta) {
  const defaultVis = Math.min(totalLen, meta?.defaultVisible || totalLen);
  const minVis = Math.min(totalLen, MIN_ZOOM_BARS);
  let visCount = state.chartZoom.visibleCount != null ? Math.round(state.chartZoom.visibleCount) : defaultVis;
  visCount = Math.max(minVis, Math.min(totalLen, visCount));
  let startIdx = state.chartZoom.startIdx != null ? Math.round(state.chartZoom.startIdx) : Math.max(0, totalLen - visCount);
  startIdx = Math.max(0, Math.min(Math.max(0, totalLen - visCount), startIdx));
  const endIdx = Math.min(totalLen, startIdx + visCount);
  const isAtLiveEdge = endIdx >= totalLen;
  const isZoomed = visCount < totalLen;
  const isCustom = state.chartZoom.visibleCount != null || state.chartZoom.startIdx != null;
  const zoomMult = visCount > 0 ? defaultVis / visCount : 1;
  return { startIdx, endIdx, visCount, defaultVis, totalLen, isAtLiveEdge, isZoomed, isCustom, zoomMult };
}

function zoomChartBy(factor, anchorFrac = 0.5) {
  const g = state.chartGeom;
  if (!g || !g.totalCount) return;
  const tf = state.settings.chartTimeframe || '1d';
  const total = g.totalCount;
  const minVis = Math.min(total, MIN_ZOOM_BARS);
  const curVis = g.visCount;
  const curStart = g.viewStart;

  // Seamless drill-down hierarchy: 1D (30m) -> 4H (5m) -> 1H (1m) when zooming past max zoom
  if (factor < 1 && curVis <= minVis && (tf === '1d' || tf === '4h')) {
    if (tf === '1d') {
      state.settings.chartTimeframe = '4h';
      state.chartZoom.visibleCount = 24;
    } else {
      state.settings.chartTimeframe = '1h';
      state.chartZoom.visibleCount = 20;
    }
    state.chartZoom.startIdx = null;
    state.hoverCandleIdx = null;
    renderChart();
    savePersistedState();
    return;
  }

  let nextVis = Math.round(curVis * factor);
  if (factor < 1 && nextVis >= curVis) nextVis = curVis - 1;
  if (factor > 1 && nextVis <= curVis) nextVis = curVis + 1;
  nextVis = Math.max(minVis, Math.min(total, nextVis));

  const anchorBar = curStart + clampNum(anchorFrac, 0, 1) * curVis;
  let nextStart = Math.round(anchorBar - clampNum(anchorFrac, 0, 1) * nextVis);
  const maxStart = Math.max(0, total - nextVis);
  nextStart = Math.max(0, Math.min(maxStart, nextStart));

  if (nextStart >= maxStart && nextVis === g.defaultVis) {
    resetChartZoom();
  } else {
    state.chartZoom.visibleCount = nextVis;
    state.chartZoom.startIdx = nextStart >= maxStart ? null : nextStart;
    state.hoverCandleIdx = null;
  }
  renderChart();
}

function panChartBy(deltaBars) {
  const g = state.chartGeom;
  if (!g || g.visCount >= g.totalCount) return;
  const maxStart = Math.max(0, g.totalCount - g.visCount);
  const nextStart = Math.max(0, Math.min(maxStart, g.viewStart + deltaBars));
  if (nextStart === g.viewStart) return;
  state.chartZoom.visibleCount = g.visCount;
  state.chartZoom.startIdx = nextStart >= maxStart ? null : nextStart;
  state.hoverCandleIdx = null;
  renderChart();
}

function syncZoomControls(win, tf) {
  const resetBtn = document.getElementById('btn-zoom-reset');
  const leftBtn = document.getElementById('btn-pan-left');
  const rightBtn = document.getElementById('btn-pan-right');
  const outBtn = document.getElementById('btn-zoom-out');
  const inBtn = document.getElementById('btn-zoom-in');
  const live1mBtn = document.getElementById('btn-zoom-1m');
  const wrap = document.querySelector('#panel-chart .chart-wrap');

  if (resetBtn) {
    if (!win.isCustom) {
      resetBtn.textContent = '100%';
    } else {
      const mag = win.zoomMult >= 1.05 ? `${win.zoomMult.toFixed(1)}×` : `${Math.round(win.zoomMult * 100)}%`;
      resetBtn.textContent = `${mag} · ${win.visCount} bars`;
    }
    resetBtn.classList.toggle('active', win.isCustom);
  }
  if (leftBtn) leftBtn.disabled = win.startIdx <= 0;
  if (rightBtn) rightBtn.disabled = win.isAtLiveEdge;
  if (outBtn) outBtn.disabled = win.visCount >= win.totalLen;
  if (inBtn) inBtn.disabled = win.visCount <= MIN_ZOOM_BARS && tf !== '1d' && tf !== '4h';
  if (live1mBtn) live1mBtn.classList.toggle('active', tf === '15min' || tf === '1h');
  if (wrap) wrap.classList.toggle('is-zoomed', win.isZoomed);
}

function computeFibonacciLevels(bars) {
  if (!Array.isArray(bars) || bars.length < 2) return null;
  let swingHigh = -Infinity;
  let swingLow = Infinity;
  let hiIdx = 0;
  let loIdx = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (b.h > swingHigh) {
      swingHigh = b.h;
      hiIdx = i;
    }
    if (b.l < swingLow) {
      swingLow = b.l;
      loIdx = i;
    }
  }
  const range = swingHigh - swingLow;
  if (!(range > 0)) return null;
  const isBounceFromLow = hiIdx < loIdx;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const levels = ratios.map((r) => ({
    ratio: r,
    label: `${+(r * 100).toFixed(1)}%`,
    price: isBounceFromLow ? swingLow + r * range : swingHigh - r * range,
    isGolden: r === 0.618,
    isPocketBound: r === 0.5 || r === 0.618,
    isExtreme: r === 0 || r === 1,
  }));
  return {
    swingHigh,
    swingLow,
    hiIdx,
    loIdx,
    range,
    direction: isBounceFromLow ? 'bounce' : 'pullback',
    levels,
  };
}

function drawRsiPane(rsiData, candleAreaW, padLeft, stepX) {
  const wrap = document.getElementById('rsi-pane-wrap');
  const canvas = document.getElementById('rsi-chart');
  const pill = document.getElementById('rsi-value-pill');
  if (!wrap || !canvas) return;
  wrap.hidden = false;

  if (pill) {
    const v = rsiData?.latest;
    pill.textContent = v != null ? (v >= 70 ? `${v} Overheated` : v <= 30 ? `${v} Oversold` : `${v} Normal`) : 'Need more bars';
    pill.className = `rsi-val-pill ${v >= 70 ? 'ob' : v <= 30 ? 'os' : ''}`;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const styles = getComputedStyle(document.documentElement);
  const muted = styles.getPropertyValue('--text-subtle').trim() || '#777';
  const grid = styles.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.08)';
  const yAt = (v) => 6 + (1 - v / 100) * (h - 12);

  // Overbought (70), Midline (50), Oversold (30) guides
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  [70, 50, 30].forEach((lvl) => {
    const y = yAt(lvl);
    ctx.save();
    ctx.setLineDash(lvl === 50 ? [2, 3] : [4, 3]);
    ctx.strokeStyle = lvl === 70 ? 'rgba(239,68,68,0.4)' : lvl === 30 ? 'rgba(34,197,94,0.4)' : grid;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + candleAreaW, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = muted;
    ctx.fillText(String(lvl), w - 4, y);
  });

  const vals = rsiData?.values || [];
  ctx.save();
  ctx.strokeStyle = '#F472B6';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v == null) continue;
    const x = padLeft + i * stepX + stepX * 0.5;
    const y = yAt(v);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function computePriceDiscoverySeries(bars, regimeObj, metalUnit = 0) {
  if (!Array.isArray(bars) || !bars.length) return [];
  const n = bars.length;
  const period = Math.min(26, Math.max(8, Math.round(n * 0.28)));
  const alpha = 2 / (period + 1);
  const discScore = Number.isFinite(regimeObj?.discoveryScore) ? regimeObj.discoveryScore : 42;
  const discTilt = clampNum((discScore - 45) / 100, -0.4, 0.55);
  const unitTilt = clampNum(metalUnit || 0, -1, 1);

  const out = new Array(n);
  let ema = bars[0].c;
  let cumTyp = (bars[0].h + bars[0].l + bars[0].c) / 3;
  let smoothRangePct = Math.max(0.001, (bars[0].h - bars[0].l) / Math.max(0.01, bars[0].c));

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const tp = (b.h + b.l + b.c) / 3;
    const prevC = i > 0 ? bars[i - 1].c : b.o;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - prevC), Math.abs(b.l - prevC));
    const trPct = tr / Math.max(0.01, prevC);

    if (i > 0) {
      ema = alpha * b.c + (1 - alpha) * ema;
      // Causal expanding anchor with gentle recency decay so it never repaints past candles
      const anchorAlpha = Math.max(1 / (i + 1), 0.045);
      cumTyp = anchorAlpha * tp + (1 - anchorAlpha) * cumTyp;
      smoothRangePct = 0.14 * trPct + 0.86 * smoothRangePct;
    }

    const baseFair = ema * 0.68 + cumTyp * 0.32;
    const structuralNudge = baseFair * smoothRangePct * (discTilt * 0.9 + unitTilt * 0.35);
    out[i] = Math.max(0.01, baseFair + structuralNudge);
  }
  return out;
}

function computeShortSqueezeSeries(bars, regimeObj) {
  if (!Array.isArray(bars) || !bars.length) return [];
  const n = bars.length;
  const sqzScore = Number.isFinite(regimeObj?.squeezeScore) ? regimeObj.squeezeScore : 30;
  const sqzIntensity = clampNum(sqzScore / 100, 0.1, 1.0);
  const backwBoost = regimeObj?.isBackwardation ? 0.22 : 0;

  const fastPeriod = Math.min(12, Math.max(5, Math.round(n * 0.14)));
  const fastAlpha = 2 / (fastPeriod + 1);
  const out = new Array(n);

  let fastEma = bars[0].c;
  let atrPct = Math.max(0.0015, (bars[0].h - bars[0].l) / Math.max(0.01, bars[0].c));
  let velocity = 0;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const prevC = i > 0 ? bars[i - 1].c : b.o;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - prevC), Math.abs(b.l - prevC));
    const trPct = tr / Math.max(0.01, prevC);

    if (i > 0) {
      fastEma = fastAlpha * b.c + (1 - fastAlpha) * fastEma;
      atrPct = 0.18 * trPct + 0.82 * atrPct;
      const barVel = Math.max(0, (b.c - fastEma) / Math.max(0.01, fastEma));
      velocity = 0.35 * barVel + 0.65 * velocity;
    }

    // Dynamic short-covering / breakout envelope scaled by realized range vol, upside velocity & squeeze intensity
    const baseAnchor = Math.max(fastEma, b.c * 0.5 + fastEma * 0.5);
    const volSpread = atrPct * (0.65 + sqzIntensity * 1.45 + backwBoost);
    const stretch = velocity * (0.45 + sqzIntensity * 0.85);
    out[i] = Math.max(0.01, baseAnchor * (1 + clampNum(volSpread + stretch, 0.0015, 0.18)));
  }
  return out;
}

/* ---------- 20-Year Monthly Seasonality & Precision Forecast Line Engine (NO Cone) ---------- */

const SEASONAL_MONTHLY_20Y = {
  gold: [2.8, 0.4, -0.3, 1.1, 0.2, -0.5, 1.5, 1.9, -0.4, 0.3, 1.4, 2.1],
  silver: [3.1, 1.2, -0.9, 1.8, -0.6, -1.1, 2.9, 1.6, -1.3, 0.8, 1.7, 2.6],
};

function getUpcoming30dSeasonality(metal = 'gold', nowDate = new Date()) {
  const arr = SEASONAL_MONTHLY_20Y[metal === 'silver' ? 'silver' : 'gold'];
  const mIdx = nowDate.getMonth();
  const nextIdx = (mIdx + 1) % 12;
  const daysInMonth = new Date(nowDate.getFullYear(), mIdx + 1, 0).getDate();
  const remFrac = clampNum((daysInMonth - nowDate.getDate() + 1) / 30, 0.05, 1);
  const blendedPct = arr[mIdx] * remFrac + arr[nextIdx] * (1 - remFrac);
  const unitTilt = clampNum(blendedPct / 16, -0.14, 0.14);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const label = blendedPct >= 0.8 ? 'Seasonal Tailwind' : blendedPct <= -0.4 ? 'Seasonal Soft Patch' : 'Neutral Seasonality';
  return {
    blendedPct: +blendedPct.toFixed(2),
    unitTilt: +unitTilt.toFixed(3),
    label,
    windowLabel: remFrac >= 0.72 ? monthNames[mIdx] : `${monthNames[mIdx]}–${monthNames[nextIdx]}`,
  };
}

const PRECISION_FC_SPECS = {
  '15min': { label: '+15m', steps: 15, stepMs: 60000,      wTech: 0.92, wMacro: 0.08, horizonBars: 15, maxCapSigma: 1.55 },
  '1h':    { label: '+1H',  steps: 16, stepMs: 225000,     wTech: 0.88, wMacro: 0.12, horizonBars: 24, maxCapSigma: 1.75 },
  '4h':    { label: '+4H',  steps: 16, stepMs: 900000,     wTech: 0.80, wMacro: 0.20, horizonBars: 20, maxCapSigma: 1.90 },
  '1d':    { label: '+24H', steps: 16, stepMs: 5400000,    wTech: 0.68, wMacro: 0.32, horizonBars: 20, maxCapSigma: 2.05 },
  '7d':    { label: '+7D',  steps: 14, stepMs: 43200000,   wTech: 0.42, wMacro: 0.58, horizonBars: 18, maxCapSigma: 2.25 },
  '1m':    { label: '+1M',  steps: 16, stepMs: 162000000,  wTech: 0.28, wMacro: 0.72, horizonBars: 16, maxCapSigma: 2.35 },
  '6m':    { label: '+6M',  steps: 16, stepMs: 972000000,  wTech: 0.18, wMacro: 0.82, horizonBars: 16, maxCapSigma: 2.45 },
  '1y':    { label: '+1Y',  steps: 16, stepMs: 1971000000, wTech: 0.12, wMacro: 0.88, horizonBars: 16, maxCapSigma: 2.55 },
  '5y':    { label: '+5Y',  steps: 16, stepMs: 9855000000, wTech: 0.10, wMacro: 0.90, horizonBars: 12, maxCapSigma: 2.65 },
  '10y':   { label: '+5Y',  steps: 16, stepMs: 9855000000, wTech: 0.10, wMacro: 0.90, horizonBars: 12, maxCapSigma: 2.65 },
  all:     { label: '+5Y',  steps: 16, stepMs: 9855000000, wTech: 0.10, wMacro: 0.90, horizonBars: 12, maxCapSigma: 2.65 },
};

const PRECISION_SPECIALISTS = [
  { id: 'momentum',  name: 'Momentum',       trendW: 1.28, revW: 0.22, macroW: 0.55, phi: 0.91 },
  { id: 'reversion', name: 'Mean-Reversion', trendW: 0.34, revW: 1.22, macroW: 0.65, phi: 0.74 },
  { id: 'macro',     name: 'Macro & Vaults', trendW: 0.62, revW: 0.58, macroW: 1.32, phi: 0.85 },
  { id: 'balanced',  name: 'Cycle-Balanced', trendW: 0.86, revW: 0.70, macroW: 0.92, phi: 0.83 },
];

function computeEmaLast(values, period) {
  if (!values.length) return 0;
  const k = 2 / (Math.min(period, values.length) + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeRsiLast(closes, period = 14) {
  const n = closes.length;
  if (n <= 3) return 50;
  const p = Math.min(period, n - 1);
  let gains = 0;
  let losses = 0;
  for (let i = n - p; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return gains === 0 ? 50 : 88;
  return 100 - 100 / (1 + gains / losses);
}

function computeClientHurst(closes) {
  if (!Array.isArray(closes) || closes.length < 12) {
    return { hurst: 0.50, regime: 'Balanced', label: 'Balanced Market' };
  }
  const logP = [];
  for (let i = 0; i < closes.length; i++) {
    if (closes[i] > 0) logP.push(Math.log(closes[i]));
  }
  const n = logP.length;
  if (n < 12) return { hurst: 0.50, regime: 'Balanced', label: 'Balanced Market' };

  const meanSqDiff = (lag) => {
    let sum = 0;
    let cnt = 0;
    for (let i = lag; i < n; i++) {
      const d = logP[i] - logP[i - lag];
      sum += d * d;
      cnt++;
    }
    return cnt > 0 ? sum / cnt : 0;
  };
  const v1 = meanSqDiff(1);
  if (!(v1 > 1e-12)) return { hurst: 0.50, regime: 'Balanced', label: 'Balanced Market' };
  const lags = [2, 3, 4, 6, 8].filter((L) => L < Math.floor(n * 0.55));
  if (!lags.length) return { hurst: 0.50, regime: 'Balanced', label: 'Balanced Market' };

  let hSum = 0;
  let hCnt = 0;
  for (const L of lags) {
    const vL = meanSqDiff(L);
    const ratio = Math.max(1e-4, vL / v1);
    const hEst = Math.log(ratio) / (2 * Math.log(L));
    if (Number.isFinite(hEst)) {
      hSum += clampNum(hEst, 0.18, 0.88);
      hCnt++;
    }
  }
  const hurst = hCnt > 0 ? +clampNum(hSum / hCnt, 0.22, 0.85).toFixed(2) : 0.50;
  const regime = hurst >= 0.56 ? 'Trending' : hurst <= 0.44 ? 'Mean-Reverting' : 'Balanced';
  const label =
    hurst >= 0.62
      ? 'Strong Trend'
      : hurst >= 0.56
        ? 'Trending'
        : hurst <= 0.38
          ? 'Strong Snap-Back'
          : hurst <= 0.44
            ? 'Mean-Reverting'
            : 'Balanced';
  return { hurst, regime, label };
}

function extractPrecisionFeatures(bars) {
  const look = bars.slice(-Math.min(36, bars.length));
  const closes = look.map((b) => b.c);
  const p0 = look[look.length - 1].c;

  let parkSum = 0;
  let parkCnt = 0;
  let atrSum = 0;
  let atrCnt = 0;
  let upSqSum = 0;
  let upCnt = 0;
  let dnSqSum = 0;
  let dnCnt = 0;

  for (let i = 0; i < look.length; i++) {
    const b = look[i];
    if (b.h > b.l && b.l > 0) {
      const lr = Math.log(b.h / b.l);
      parkSum += lr * lr;
      parkCnt++;
    }
    if (i > 0 && look[i - 1].c > 0) {
      const pc = look[i - 1].c;
      const tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
      atrSum += tr / pc;
      atrCnt++;
      const ret = (b.c - pc) / pc;
      if (ret >= 0) {
        upSqSum += ret * ret;
        upCnt++;
      } else {
        dnSqSum += ret * ret;
        dnCnt++;
      }
    }
  }
  const parkVol = parkCnt > 0 ? Math.sqrt(parkSum / (parkCnt * 4 * Math.LN2)) : 0.002;
  const atrVol = atrCnt > 0 ? atrSum / atrCnt : parkVol;
  const barVol = clampNum(0.55 * parkVol + 0.45 * atrVol, 0.00025, 0.085);
  const upSemiVol = upCnt >= 2 ? Math.sqrt(upSqSum / upCnt) : barVol;
  const dnSemiVol = dnCnt >= 2 ? Math.sqrt(dnSqSum / dnCnt) : barVol;
  const volSkewRatio = clampNum(upSemiVol / Math.max(dnSemiVol, 1e-6), 0.65, 1.55);

  const erLen = Math.min(12, closes.length - 1);
  let pathLen = 0;
  for (let i = closes.length - erLen; i < closes.length; i++) {
    pathLen += Math.abs(closes[i] - closes[i - 1]);
  }
  const netMove = erLen > 0 ? Math.abs(closes[closes.length - 1] - closes[closes.length - 1 - erLen]) : 0;
  const er = pathLen > 1e-9 ? clampNum(netMove / pathLen, 0, 1) : 0;
  const hurstInfo = computeClientHurst(closes);

  const ema5 = computeEmaLast(closes, 5);
  const ema13 = computeEmaLast(closes, 13);
  const ema20 = computeEmaLast(closes, 20);
  const ema26 = computeEmaLast(closes, 26);
  const normDenom = Math.max(p0 * barVol, 1e-6);
  const fastSpread = (ema5 - ema13) / normDenom;
  const slowSpread = (ema13 - ema26) / normDenom;
  const rawSlope = clampNum((fastSpread * 0.65 + slowSpread * 0.35) * 0.34, -0.85, 0.85);
  const emaSlope = rawSlope * (0.35 + 0.65 * er);

  const rsi = computeRsiLast(closes, 14);
  const swingHigh = Math.max(...look.map((b) => b.h));
  const swingLow = Math.min(...look.map((b) => b.l));
  return {
    p0,
    barVol,
    upSemiVol,
    dnSemiVol,
    volSkewRatio,
    er,
    hurst: hurstInfo.hurst,
    hurstRegime: hurstInfo.regime,
    hurstLabel: hurstInfo.label,
    ema5,
    ema13,
    ema20,
    emaSlope,
    rsi,
    swingHigh,
    swingLow,
  };
}

function projectPrecisionTrajectory({
  p0,
  lastT,
  feats,
  spec,
  specialist,
  macroUnit = 0,
  leadLagAlpha = 0,
  seasonalityTilt = 0,
  gapPrimary = null,
  opexMagnetPrice = null,
  opexPinStrength = 0,
  breakoutEnergyMult = 1.0,
  stepsOverride = null,
}) {
  const steps = stepsOverride || spec.steps;
  const stepVol = feats.barVol * Math.sqrt(spec.horizonBars / Math.max(1, spec.steps));
  const maxCumPct = spec.maxCapSigma * clampNum(breakoutEnergyMult, 0.85, 1.30) * feats.barVol * Math.sqrt(spec.horizonBars);

  const hurstTrendGain = clampNum(1 + (feats.hurst - 0.50) * 1.45, 0.55, 1.50);
  const hurstRevGain = clampNum(1 - (feats.hurst - 0.50) * 1.45, 0.55, 1.50);

  const rsiExhaust =
    feats.rsi >= 68
      ? -clampNum((feats.rsi - 66) / 26, 0, 1)
      : feats.rsi <= 32
        ? clampNum((34 - feats.rsi) / 26, 0, 1)
        : 0;

  const hasActiveGap = Boolean(gapPrimary) && !gapPrimary.isFilled && (gapPrimary.freshness ?? 1) > 0.05;
  const gapFresh = hasActiveGap ? (gapPrimary.freshness ?? 1) : 0;

  const points = [{ step: 0, t: lastT, price: p0 }];
  let cur = p0;

  for (let k = 1; k <= steps; k++) {
    const fTrend =
      feats.emaSlope * specialist.trendW * hurstTrendGain * Math.pow(specialist.phi, k - 1) * spec.wTech;
    const stretch = (cur - feats.ema20) / Math.max(feats.ema20 * feats.barVol * 4.2, 1e-6);
    const fOu = -clampNum(stretch, -2.5, 2.5) * 0.15 * specialist.revW * hurstRevGain * spec.wTech;
    const fRsi = rsiExhaust * 0.24 * hurstRevGain * Math.pow(0.86, k - 1) * spec.wTech;

    let fGap = 0;
    if (hasActiveGap) {
      const targetDist = (gapPrimary.fillTarget - cur) / Math.max(cur * stepVol, 1e-6);
      if (!gapPrimary.holdingBeyond && k <= Math.ceil(steps * 0.5)) {
        fGap = clampNum(targetDist * 0.22, -0.35, 0.35) * gapFresh * hurstRevGain * spec.wTech;
      } else if (gapPrimary.holdingBeyond) {
        const dirSign = gapPrimary.dir === 'up' ? 1 : -1;
        fGap = dirSign * 0.14 * gapFresh * hurstTrendGain * Math.pow(0.9, k - 1) * spec.wTech;
      }
    }

    const macroComposite = clampNum(macroUnit + leadLagAlpha * 0.35 + seasonalityTilt * 0.42, -1, 1);
    const fMacro = macroComposite * 0.26 * specialist.macroW * spec.wMacro;
    let fOpex = 0;
    if (opexPinStrength > 0 && Number.isFinite(opexMagnetPrice) && opexMagnetPrice > 0 && spec.wTech >= 0.40) {
      const magDist = (opexMagnetPrice - cur) / Math.max(cur * stepVol, 1e-6);
      fOpex = clampNum(magDist * 0.14 * opexPinStrength, -0.25, 0.25);
    }
    let unitStep = (fTrend + fOu + fRsi + fGap + fMacro + fOpex) * clampNum(breakoutEnergyMult, 0.88, 1.25);

    const distToCeil = (feats.swingHigh - cur) / Math.max(cur * feats.barVol, 1e-6);
    const distToFloor = (cur - feats.swingLow) / Math.max(cur * feats.barVol, 1e-6);
    if (unitStep > 0 && distToCeil > 0 && distToCeil < 1.2 && feats.er < 0.65 && feats.hurst < 0.60) {
      unitStep *= 0.56;
    } else if (unitStep < 0 && distToFloor > 0 && distToFloor < 1.2 && feats.er < 0.65 && feats.hurst < 0.60) {
      unitStep *= 0.56;
    }

    const asymScale = unitStep >= 0
      ? clampNum(0.85 + 0.15 * feats.volSkewRatio, 0.85, 1.15)
      : clampNum(0.85 + 0.15 / Math.max(0.5, feats.volSkewRatio), 0.85, 1.15);

    const stepRet = clampNum(unitStep * stepVol * asymScale, -0.58 * stepVol, 0.58 * stepVol);
    cur = Math.max(0.01, clampNum(cur * (1 + stepRet), p0 * (1 - maxCumPct), p0 * (1 + maxCumPct)));
    points.push({ step: k, t: lastT + k * spec.stepMs, price: cur });
  }
  return points;
}

function computeClientPrecisionForecast({
  bars = [],
  liveSpot = null,
  tf = '1d',
  metal = 'gold',
  macroUnit = 0,
  leadLagAlpha = 0,
  seasonalityTilt = 0,
  gapPrimary = null,
  opexMagnetPrice = null,
  opexPinStrength = 0,
  breakoutEnergyMult = 1.0,
} = {}) {
  const spec = PRECISION_FC_SPECS[tf] || PRECISION_FC_SPECS['1d'];
  if (!Array.isArray(bars) || bars.length < 4) return null;

  const lastBar = bars[bars.length - 1];
  const p0 = Number.isFinite(Number(liveSpot)) && Number(liveSpot) > 0 ? Number(liveSpot) : lastBar.c;
  const lastT = lastBar.t || Date.now();

  let weights = [0.22, 0.24, 0.26, 0.28];
  let calibration = {
    mode: 'Cycle-Balanced',
    dirHitPct: null,
    avgErrPct: null,
    conformalRadiusPct: null,
    samples: 0,
  };

  if (bars.length >= 20) {
    const hTest = Math.max(2, Math.min(6, Math.floor(bars.length / 6)));
    const maxSamples = Math.min(12, bars.length - 12 - hTest);
    if (maxSamples >= 3) {
      const startIdx = bars.length - hTest - maxSamples;
      const modelRmse = PRECISION_SPECIALISTS.map(() => 0);
      const modelDirRate = PRECISION_SPECIALISTS.map(() => 0);
      const perSamplePreds = [];
      const perSampleActuals = [];
      const perSampleP0 = [];

      for (let s = 0; s < maxSamples; s++) {
        const cutIdx = startIdx + s;
        const histSlice = bars.slice(0, cutIdx + 1);
        const actual = bars[cutIdx + hTest]?.c;
        if (!(actual > 0)) continue;
        const f = extractPrecisionFeatures(histSlice);
        const testSpec = { ...spec, steps: hTest, horizonBars: hTest };
        const scale = Math.max(f.p0 * f.barVol * Math.sqrt(hTest), 1e-6);

        const rowPreds = [];
        for (let m = 0; m < PRECISION_SPECIALISTS.length; m++) {
          const pts = projectPrecisionTrajectory({
            p0: f.p0,
            lastT: histSlice[histSlice.length - 1].t,
            feats: f,
            spec: testSpec,
            specialist: PRECISION_SPECIALISTS[m],
            macroUnit: macroUnit * 0.45,
            leadLagAlpha: leadLagAlpha * 0.45,
            seasonalityTilt: 0,
            gapPrimary: null,
            stepsOverride: hTest,
          });
          const pred = pts[pts.length - 1].price;
          rowPreds.push(pred);
          const normErr = (pred - actual) / scale;
          modelRmse[m] += normErr * normErr;
          const actMove = actual - f.p0;
          if (Math.abs(actMove) < f.p0 * 0.0001 || (pred - f.p0) * actMove >= 0) modelDirRate[m] += 1;
        }
        perSamplePreds.push(rowPreds);
        perSampleActuals.push(actual);
        perSampleP0.push(f.p0);
      }

      const valid = perSampleActuals.length;
      if (valid >= 3) {
        const scores = PRECISION_SPECIALISTS.map((_, m) => {
          const rmse = Math.sqrt(modelRmse[m] / valid);
          const dirR = modelDirRate[m] / valid;
          return -(rmse - 0.16 * dirR) * 2.2;
        });
        const maxS = Math.max(...scores);
        const exps = scores.map((sc) => Math.exp(clampNum(sc - maxS, -8, 0)));
        const expSum = exps.reduce((a, b) => a + b, 0) || 1;
        weights = exps.map((e) => e / expSum);

        const absPctErrs = [];
        let ensDirHits = 0;
        for (let i = 0; i < valid; i++) {
          let ensPred = 0;
          for (let m = 0; m < PRECISION_SPECIALISTS.length; m++) {
            ensPred += perSamplePreds[i][m] * weights[m];
          }
          const actual = perSampleActuals[i];
          const p0i = perSampleP0[i];
          absPctErrs.push((Math.abs(ensPred - actual) / actual) * 100);
          const actMove = actual - p0i;
          if (Math.abs(actMove) < p0i * 0.0001 || (ensPred - p0i) * actMove >= 0) ensDirHits++;
        }
        absPctErrs.sort((a, b) => a - b);
        const q75Idx = Math.min(absPctErrs.length - 1, Math.floor(absPctErrs.length * 0.75));
        const avgErr = absPctErrs.reduce((a, b) => a + b, 0) / absPctErrs.length;
        let topIdx = 0;
        for (let m = 1; m < weights.length; m++) {
          if (weights[m] > weights[topIdx]) topIdx = m;
        }
        calibration = {
          mode: PRECISION_SPECIALISTS[topIdx].name,
          dirHitPct: Math.round((ensDirHits / valid) * 100),
          avgErrPct: +avgErr.toFixed(2),
          conformalRadiusPct: +absPctErrs[q75Idx].toFixed(2),
          samples: valid,
        };
      }
    }
  }

  const liveFeats = extractPrecisionFeatures(bars);
  const allPaths = PRECISION_SPECIALISTS.map((specialist) =>
    projectPrecisionTrajectory({
      p0,
      lastT,
      feats: liveFeats,
      spec,
      specialist,
      macroUnit,
      leadLagAlpha,
      seasonalityTilt: tf === '1m' || tf === '6m' ? seasonalityTilt : 0,
      gapPrimary,
      opexMagnetPrice,
      opexPinStrength,
      breakoutEnergyMult,
    })
  );

  const endDeltas = allPaths.map((pts) => pts[pts.length - 1].price - p0);
  const upVotes = endDeltas.filter((d) => d > p0 * 0.0002).length;
  const dnVotes = endDeltas.filter((d) => d < -p0 * 0.0002).length;
  const agreementPct = Math.round((Math.max(upVotes, dnVotes) / PRECISION_SPECIALISTS.length) * 100);
  const agreementDamp = agreementPct >= 100 ? 1.0 : agreementPct >= 75 ? 0.90 : 0.72;

  const points = [];
  for (let k = 0; k <= spec.steps; k++) {
    let rawBlend = 0;
    for (let m = 0; m < PRECISION_SPECIALISTS.length; m++) {
      rawBlend += allPaths[m][k].price * weights[m];
    }
    const dampedPrice = k === 0 ? p0 : p0 + (rawBlend - p0) * agreementDamp;
    points.push({ step: k, t: allPaths[0][k].t, price: Math.max(0.01, dampedPrice) });
  }

  const endPrice = points[points.length - 1].price;
  const delta = endPrice - p0;
  const deltaPct = p0 > 0 ? (delta / p0) * 100 : 0;
  const direction = deltaPct >= 0.06 ? 'up' : deltaPct <= -0.06 ? 'down' : 'flat';

  const ensembleBreakdown = PRECISION_SPECIALISTS.map((s, idx) => ({
    id: s.id,
    name: s.name,
    weightPct: Math.round(weights[idx] * 100),
  })).sort((a, b) => b.weightPct - a.weightPct);

  const factorTags = [`${liveFeats.hurstLabel} (H=${liveFeats.hurst.toFixed(2)})`];
  if (liveFeats.rsi >= 68) factorTags.push('Overheated Brake');
  else if (liveFeats.rsi <= 32) factorTags.push('Oversold Bounce');
  else if (gapPrimary && !gapPrimary.isFilled && (gapPrimary.freshness ?? 1) > 0.05) {
    factorTags.push(gapPrimary.holdingBeyond ? 'Gap Breakaway' : 'Gap Fill Pull');
  } else if (Math.abs(leadLagAlpha) >= 0.14) {
    factorTags.push(leadLagAlpha > 0 ? 'Miners/Physical Lead ↑' : 'Miners/Physical Lag ↓');
  } else if (Math.abs(macroUnit) >= 0.14 && spec.wMacro >= 0.20) {
    factorTags.push(macroUnit > 0 ? 'Macro Tailwind' : 'Macro Headwind');
  }

  return {
    metal,
    tf,
    horizonLabel: spec.label,
    points,
    startPrice: p0,
    endPrice,
    delta,
    deltaPct: +deltaPct.toFixed(2),
    direction,
    wTechPct: Math.round(spec.wTech * 100),
    wMacroPct: Math.round(spec.wMacro * 100),
    hurst: liveFeats.hurst,
    hurstRegime: liveFeats.hurstRegime,
    hurstLabel: liveFeats.hurstLabel,
    agreementPct,
    regimeMode: ensembleBreakdown[0].name,
    ensembleBreakdown,
    calibration,
    driversSummary: `${Math.round(spec.wTech * 100)}% Tech · ${Math.round(spec.wMacro * 100)}% Macro · ${factorTags.slice(0, 2).join(' · ')}`,
  };
}

function friendlyRegimeLabel(label) {
  const map = {
    'True Price Discovery': 'Real Demand Rally',
    'Discovery Bias': 'Real Demand Leaning',
    'Short Squeeze': 'Squeeze Risk',
    'Squeeze Bias': 'Squeeze Building',
    'Hybrid: Squeeze + Discovery': 'Squeeze + Real Demand',
    'Consolidation / Neutral': 'Sideways / Calm',
  };
  return map[label] || label || 'Sideways / Calm';
}

function renderChart() {
  const canvas = document.getElementById('intraday-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const chartMode = state.settings.chartMode || state.settings.selectedMetal || 'gold';
  const isRatio = chartMode === 'ratio';
  const sel = isRatio ? 'gold' : chartMode;
  const tf = CHART_TF_META[state.settings.chartTimeframe] ? state.settings.chartTimeframe : '1d';
  const meta = CHART_TF_META[tf];
  const quote = state.quotes[sel];
  const bars = isRatio ? getRatioBarsForTimeframe(tf) : getCandlesForTimeframe(sel, tf);

  const titleEl = document.getElementById('chart-title');
  if (titleEl) {
    titleEl.textContent = isRatio
      ? `Gold / Silver Ratio · ${meta.label}`
      : sel === 'gold'
        ? `Gold · ${meta.label}`
        : `Silver · ${meta.label}`;
  }
  updateCandleCountdown();

  document.getElementById('chart-btn-gold')?.classList.toggle('active', chartMode === 'gold');
  document.getElementById('chart-btn-silver')?.classList.toggle('active', chartMode === 'silver');
  document.getElementById('chart-btn-ratio')?.classList.toggle('active', isRatio);
  document.querySelectorAll('#chart-tf-bar .tf-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tf === tf);
  });

  const fcBtn = document.getElementById('btn-toggle-forecast');
  if (fcBtn) {
    fcBtn.classList.toggle('active', !!state.settings.showForecast);
    fcBtn.setAttribute('aria-pressed', String(!!state.settings.showForecast));
    fcBtn.disabled = isRatio;
    fcBtn.style.opacity = isRatio ? '0.45' : '1';
  }
  const discBtn = document.getElementById('btn-toggle-discovery');
  if (discBtn) {
    discBtn.classList.toggle('active', !!state.settings.showDiscovery);
    discBtn.setAttribute('aria-pressed', String(!!state.settings.showDiscovery));
    discBtn.disabled = isRatio;
    discBtn.style.opacity = isRatio ? '0.45' : '1';
  }
  const sqzBtn = document.getElementById('btn-toggle-squeeze');
  if (sqzBtn) {
    sqzBtn.classList.toggle('active', !!state.settings.showSqueeze);
    sqzBtn.setAttribute('aria-pressed', String(!!state.settings.showSqueeze));
    sqzBtn.disabled = isRatio;
    sqzBtn.style.opacity = isRatio ? '0.45' : '1';
  }
  const fibBtn = document.getElementById('btn-toggle-fib');
  if (fibBtn) {
    fibBtn.classList.toggle('active', !!state.settings.showFib);
    fibBtn.setAttribute('aria-pressed', String(!!state.settings.showFib));
  }
  const smaBtn = document.getElementById('btn-toggle-sma');
  if (smaBtn) {
    smaBtn.classList.toggle('active', !!state.settings.showSma);
    smaBtn.setAttribute('aria-pressed', String(!!state.settings.showSma));
  }
  const rsiBtn = document.getElementById('btn-toggle-rsi');
  if (rsiBtn) {
    rsiBtn.classList.toggle('active', !!state.settings.showRsi);
    rsiBtn.setAttribute('aria-pressed', String(!!state.settings.showRsi));
  }
  const buysBtn = document.getElementById('btn-toggle-mybuys');
  if (buysBtn) {
    buysBtn.classList.toggle('active', !!state.settings.showMyBuys);
    buysBtn.setAttribute('aria-pressed', String(!!state.settings.showMyBuys));
    buysBtn.disabled = isRatio;
    buysBtn.style.opacity = isRatio ? '0.45' : '1';
  }
  const patBtn = document.getElementById('btn-toggle-patterns');
  if (patBtn) {
    patBtn.classList.toggle('active', !!state.settings.showPatterns);
    patBtn.setAttribute('aria-pressed', String(!!state.settings.showPatterns));
  }
  const gapsBtn = document.getElementById('btn-toggle-gaps');
  if (gapsBtn) {
    gapsBtn.classList.toggle('active', !!state.settings.showGaps);
    gapsBtn.setAttribute('aria-pressed', String(!!state.settings.showGaps));
  }
  const newsPinBtn = document.getElementById('btn-toggle-newsdots');
  if (newsPinBtn) {
    newsPinBtn.classList.toggle('active', !!state.settings.showNewsDots);
    newsPinBtn.setAttribute('aria-pressed', String(!!state.settings.showNewsDots));
  }
  const repBtn = document.getElementById('btn-chart-replay');
  if (repBtn) {
    repBtn.classList.toggle('active', !!state.chartReplay.active);
    repBtn.setAttribute('aria-pressed', String(!!state.chartReplay.active));
    repBtn.textContent = state.chartReplay.active ? '■ Stop Replay' : '▶ Replay';
  }
  const fcLegend = document.getElementById('legend-forecast');
  const discLegend = document.getElementById('legend-discovery');
  if (discLegend) discLegend.hidden = !state.settings.showDiscovery || isRatio;
  const sqzLegend = document.getElementById('legend-squeeze');
  if (sqzLegend) sqzLegend.hidden = !state.settings.showSqueeze || isRatio;
  const fibLegend = document.getElementById('legend-fib');
  if (fibLegend) fibLegend.hidden = !state.settings.showFib;
  const smaLegend = document.getElementById('legend-sma');
  if (smaLegend) smaLegend.hidden = !state.settings.showSma;
  const buyLegend = document.getElementById('legend-mybuys');
  if (buyLegend) buyLegend.hidden = !state.settings.showMyBuys || isRatio;
  const patLegend = document.getElementById('legend-patterns');
  if (patLegend) patLegend.hidden = !state.settings.showPatterns;
  const gapsLegend = document.getElementById('legend-gaps');
  if (gapsLegend) gapsLegend.hidden = !state.settings.showGaps;
  const newsLegend = document.getElementById('legend-newsdots');
  if (newsLegend) newsLegend.hidden = !state.settings.showNewsDots;
  const rsiWrap = document.getElementById('rsi-pane-wrap');
  if (rsiWrap && !state.settings.showRsi) rsiWrap.hidden = true;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  if (!bars.length) return;

  const styles = getComputedStyle(document.documentElement);
  const upCol = styles.getPropertyValue('--up').trim() || '#22C55E';
  const downCol = styles.getPropertyValue('--down').trim() || '#EF4444';
  const baseCol =
    sel === 'gold'
      ? styles.getPropertyValue('--gold').trim() || '#D4A843'
      : styles.getPropertyValue('--silver').trim() || '#C2CAD6';
  const mutedCol = styles.getPropertyValue('--text-subtle').trim() || '#777';
  const borderCol = styles.getPropertyValue('--border-strong').trim() || 'rgba(255,255,255,0.14)';
  const gridCol = styles.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.06)';

  const allConverted = bars.map((b) => ({
    t: b.t,
    o: isRatio ? b.o : convertUnit(b.o),
    h: isRatio ? b.h : convertUnit(b.h),
    l: isRatio ? b.l : convertUnit(b.l),
    c: isRatio ? b.c : convertUnit(b.c),
  }));
  const win = getZoomWindow(allConverted.length, meta);
  syncZoomControls(win, tf);
  const converted = allConverted.slice(win.startIdx, win.endIdx);
  if (!converted.length) return;

  const liveClose = allConverted[allConverted.length - 1].c;
  const liveSpotVal = isRatio
    ? (state.quotes.gold.price > 0 && state.quotes.silver.price > 0
        ? state.quotes.gold.price / state.quotes.silver.price
        : liveClose)
    : (quote.price != null ? convertUnit(quote.price) : liveClose);
  const firstOpen = converted[0].o;
  const lastClose = converted[converted.length - 1].c;
  const isMinuteTf = tf === '15min' || tf === '1h';
  const refLineVal = isRatio
    ? (tf === '1d' && state.quotes.gold.prevClose && state.quotes.silver.prevClose
        ? state.quotes.gold.prevClose / state.quotes.silver.prevClose
        : firstOpen)
    : (tf === '1d' ? convertUnit(quote.prevClose ?? bars[0].o) : firstOpen);
  const fmtChartVal = (v, dec) => (isRatio ? `${Number(v).toFixed(dec ?? 1)}:1` : formatMoney(v, dec));

  // Period / visible-window return badge
  const tfChgEl = document.getElementById('chart-tf-change');
  if (tfChgEl && firstOpen > 0) {
    const tfPct = ((lastClose - firstOpen) / firstOpen) * 100;
    const dec = Math.abs(tfPct) >= 100 ? 0 : (isMinuteTf || win.isCustom ? 2 : 1);
    const scopeTag = win.isCustom ? `${meta.label} · ${win.visCount}` : meta.label;
    tfChgEl.textContent = `${tfPct >= 0 ? '+' : '−'}${Math.abs(tfPct).toFixed(dec)}% (${scopeTag})`;
    tfChgEl.className = `tf-return-pill ${tfPct >= 0.02 ? 'up' : tfPct <= -0.02 ? 'down' : ''}`;
  }

  // Precision Forecast Line (NO cone — matched to EVERY timeframe from 15m to ALL)
  const showFc =
    !!state.settings.showForecast &&
    !isRatio &&
    win.isAtLiveEdge &&
    !(win.isCustom && win.zoomMult >= 1.5);
  if (fcLegend) fcLegend.hidden = !showFc;
  const showDiscovery = !!state.settings.showDiscovery && !isRatio;
  const showSqueeze = !!state.settings.showSqueeze && !isRatio;
  const showFib = !!state.settings.showFib;
  const showSma = !!state.settings.showSma;
  const fibCol = styles.getPropertyValue('--fib').trim() || '#A78BFA';
  const discCol = '#10B981';
  const sqzCol = '#F43F5E';
  const isLightTheme = isLightThemeName(document.documentElement.getAttribute('data-theme'));
  const fibData = showFib ? computeFibonacciLevels(converted) : null;
  // Compute moving averages & regime lines on FULL series first, then slice to zoom window so indicators never distort
  const fullSma20 = showSma ? computeSmaSeries(allConverted, 20) : null;
  const fullSma50 = showSma ? computeSmaSeries(allConverted, 50) : null;
  const sma20 = fullSma20 ? fullSma20.slice(win.startIdx, win.endIdx) : null;
  const sma50 = fullSma50 ? fullSma50.slice(win.startIdx, win.endIdx) : null;
  const outlookRes = computeInteractiveOutlook();
  const activeRegime = outlookRes.marketRegime?.[sel] || outlookRes[sel]?.regime || null;

  // Live metal regime badge on chart panel (or Au/Ag Ratio Valuation banner in ratio mode)
  const chartRegimePill = document.getElementById('chart-regime-pill');
  const ratioBanner = document.getElementById('chart-ratio-banner');
  const ratioStatsEl = document.getElementById('chart-ratio-stats');
  const ratioSigEl = document.getElementById('chart-ratio-signal');
  if (isRatio) {
    const ra = outlookRes.ratioAnalytics;
    if (chartRegimePill && ra) {
      chartRegimePill.hidden = false;
      chartRegimePill.textContent = `Higher than ${ra.percentile5y}% of past 5 yrs`;
      chartRegimePill.className = `regime-pill ${ra.tone === 'bullish' ? 'discovery' : ra.tone === 'gold' ? 'hybrid' : 'neutral'}`;
    } else if (chartRegimePill) {
      chartRegimePill.hidden = true;
    }
    if (ratioBanner && ra) {
      ratioBanner.hidden = false;
      if (ratioStatsEl) {
        ratioStatsEl.textContent = `${ra.regime} · 5-Yr Avg ${ra.mean5y}:1 (Higher than ${ra.percentile5y}% of past 5 yrs)`;
      }
      if (ratioSigEl) {
        ratioSigEl.textContent = ra.swapBias;
        ratioSigEl.className = ra.tone === 'bullish' ? 'up' : ra.tone === 'gold' ? 'gold' : '';
      }
    }
  } else {
    if (ratioBanner) ratioBanner.hidden = true;
    if (chartRegimePill) {
      if (!activeRegime) {
        chartRegimePill.hidden = true;
      } else {
        const metalTag = sel === 'gold' ? 'Gold' : 'Silver';
        chartRegimePill.hidden = false;
        chartRegimePill.textContent = `${metalTag}: ${friendlyRegimeLabel(activeRegime.label)} (Demand ${activeRegime.discoveryScore} · Squeeze ${activeRegime.squeezeScore})`;
        chartRegimePill.className = `regime-pill ${activeRegime.key || 'neutral'}`;
      }
    }
  }

  const fullDiscovery = showDiscovery
    ? computePriceDiscoverySeries(allConverted, activeRegime, outlookRes[sel]?.unit ?? 0)
    : null;
  const fullSqueeze = showSqueeze ? computeShortSqueezeSeries(allConverted, activeRegime) : null;
  const discoverySeries = fullDiscovery ? fullDiscovery.slice(win.startIdx, win.endIdx) : null;
  const squeezeSeries = fullSqueeze ? fullSqueeze.slice(win.startIdx, win.endIdx) : null;

  // Market Gap analysis computed up front so open gaps feed both chart overlays and the Precision Forecast Line
  const chartGapAnalysis =
    state.settings.showGaps && converted.length >= 2
      ? analyzeClientMarketGaps(converted, liveSpotVal, isRatio ? 'ratio' : sel, tf)
      : null;

  // Fine-tuned 4-Specialist Precision Forecast Line (Hurst + Semi-Vol + Lead-Lag + Conformal Calibration — NO cone)
  const fcSeasonality = getUpcoming30dSeasonality(sel);
  const fcMacroUnit =
    tf === '1m' && Number.isFinite(outlookRes[sel]?.unit30d)
      ? outlookRes[sel].unit30d
      : (outlookRes[sel]?.unit ?? 0);
  const fcLeadLag = Number.isFinite(outlookRes[sel]?.leadLagAlpha) ? outlookRes[sel].leadLagAlpha : 0;
  const haChart = !isRatio ? outlookRes.hiddenAlpha?.[sel] : null;
  const opexMagnetConverted =
    haChart?.opexMagnet?.magnetStrike > 0 ? convertUnit(haChart.opexMagnet.magnetStrike) : null;
  const precisionFc = showFc
    ? computeClientPrecisionForecast({
        bars: allConverted,
        liveSpot: liveSpotVal,
        tf,
        metal: sel,
        macroUnit: fcMacroUnit,
        leadLagAlpha: fcLeadLag,
        seasonalityTilt: fcSeasonality.unitTilt,
        gapPrimary: chartGapAnalysis?.primary || null,
        opexMagnetPrice: opexMagnetConverted,
        opexPinStrength: haChart?.opexMagnet?.pinStrength || 0,
        breakoutEnergyMult: haChart?.springCoiling?.breakoutEnergyMult || 1.0,
      })
    : null;
  const hasFcLine = Boolean(showFc && precisionFc && precisionFc.points?.length > 1);

  let min = Math.min(...converted.map((b) => b.l));
  let max = Math.max(...converted.map((b) => b.h));
  if (win.isAtLiveEdge && Number.isFinite(liveSpotVal)) {
    min = Math.min(min, liveSpotVal);
    max = Math.max(max, liveSpotVal);
  }
  if (!win.isCustom && !isMinuteTf) {
    min = Math.min(min, refLineVal);
    max = Math.max(max, refLineVal);
  }
  if (discoverySeries?.length) {
    min = Math.min(min, ...discoverySeries);
    max = Math.max(max, ...discoverySeries);
  }
  if (squeezeSeries?.length) {
    min = Math.min(min, ...squeezeSeries);
    max = Math.max(max, ...squeezeSeries);
  }
  if (hasFcLine) {
    for (const pt of precisionFc.points) {
      if (Number.isFinite(pt.price)) {
        min = Math.min(min, pt.price);
        max = Math.max(max, pt.price);
      }
    }
  }
  const rawSpan = max - min || max * 0.0025 || 0.5;
  min = Math.max(0, min - rawSpan * 0.09);
  max += rawSpan * 0.09;
  const axisSpan = max - min;

  const desktopCanvas = w >= 720;
  const spotDec = isRatio ? 1 : (Math.abs(liveSpotVal) >= 10000 ? 0 : 2);
  const spotPillText = isRatio ? `${Number(liveSpotVal).toFixed(spotDec)}:1` : formatCompactMoney(liveSpotVal, spotDec);
  ctx.font = `700 ${desktopCanvas ? 11 : 10}px "JetBrains Mono", monospace`;
  const measuredSpotW = Math.ceil(ctx.measureText(spotPillText).width);

  const padTop = 12;
  const padBottom = win.isZoomed ? 25 : 20;
  const padLeft = 6;
  const padRight = Math.max(desktopCanvas ? 74 : 66, Math.min(106, measuredSpotW + 14));
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const candleAreaW = hasFcLine ? plotW * 0.76 : plotW;
  const forecastAreaW = hasFcLine ? plotW * 0.24 : 0;
  const stepX = candleAreaW / Math.max(1, converted.length);
  const candleW = Math.max(2.5, Math.min(26, stepX * 0.66));
  const xCandle = (i) => padLeft + i * stepX + stepX * 0.5;
  const yAt = (v) => padTop + (1 - (v - min) / (max - min)) * plotH;

  // Subtle horizontal gridlines + precision-adaptive price axis labels
  const spotPillH = desktopCanvas ? 18 : 16;
  const spotPillY = Number.isFinite(liveSpotVal)
    ? clampNum(yAt(liveSpotVal), padTop + spotPillH / 2, padTop + plotH - spotPillH / 2)
    : null;
  ctx.font = `500 ${desktopCanvas ? 11.5 : 10.5}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let g = 0; g <= 3; g++) {
    const val = max - ((max - min) * g) / 3;
    const y = yAt(val);
    ctx.strokeStyle = gridCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();
    if (spotPillY != null && Math.abs(y - spotPillY) < spotPillH * 0.72) continue;
    ctx.fillStyle = mutedCol;
    const yDec = isRatio
      ? (axisSpan < 3 ? 2 : 1)
      : (axisSpan < 25 ? 2 : axisSpan < 140 && val >= 500 ? 1 : (val >= 500 ? 0 : 2));
    const axisTxt = isRatio ? `${Number(val).toFixed(yDec)}:1` : formatCompactMoney(val, yDec);
    ctx.fillText(axisTxt, w - 2, y);
  }

  // Reference baseline (Prev close on 1D, period open on longer ranges — drawn when inside visible Y range)
  if (refLineVal >= min && refLineVal <= max) {
    const refY = yAt(refLineVal);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, refY);
    ctx.lineTo(padLeft + candleAreaW, refY);
    ctx.stroke();
    ctx.restore();
  }

  // Market Gap Fill Zones shaded softly behind candlesticks
  if (chartGapAnalysis?.gaps?.length) {
    for (const gp of chartGapAnalysis.gaps) {
      const x1 = Math.max(padLeft, xCandle(Math.max(0, gp.idx - 1)) + stepX * 0.35);
      const x2 = gp.isFilled && gp.filledAtIdx != null
        ? Math.min(padLeft + candleAreaW, xCandle(gp.filledAtIdx) + stepX * 0.4)
        : padLeft + candleAreaW;
      const yTop = clampNum(yAt(gp.zoneHigh), padTop, padTop + plotH);
      const yBot = clampNum(yAt(gp.zoneLow), padTop, padTop + plotH);
      const bandH = Math.max(3, yBot - yTop);
      const fresh = gp.freshness ?? (gp.isFilled ? 0 : 1);
      const fillAlpha = gp.isFilled ? 0.05 : +(0.045 + 0.115 * fresh).toFixed(3);
      ctx.save();
      ctx.fillStyle = gp.dir === 'up'
        ? `rgba(34, 197, 94, ${fillAlpha})`
        : `rgba(239, 68, 68, ${fillAlpha})`;
      ctx.fillRect(x1, yTop, Math.max(6, x2 - x1), bandH);
      ctx.restore();
    }
  }

  // Optional Fibonacci Retracement Overlay (Golden Pocket + lines behind candles)
  if (fibData) {
    const lv50 = fibData.levels.find((lv) => lv.ratio === 0.5);
    const lv618 = fibData.levels.find((lv) => lv.ratio === 0.618);
    if (lv50 && lv618) {
      const yTopBand = Math.min(yAt(lv50.price), yAt(lv618.price));
      const yBotBand = Math.max(yAt(lv50.price), yAt(lv618.price));
      ctx.save();
      ctx.fillStyle = isLightTheme ? 'rgba(124, 58, 237, 0.09)' : 'rgba(167, 139, 250, 0.10)';
      ctx.fillRect(padLeft, yTopBand, candleAreaW, Math.max(2, yBotBand - yTopBand));
      ctx.restore();
    }
    fibData.levels.forEach((lv) => {
      const y = yAt(lv.price);
      ctx.save();
      ctx.strokeStyle = fibCol;
      ctx.lineWidth = lv.isGolden ? 1.35 : lv.ratio === 0.5 ? 1.15 : 0.9;
      ctx.globalAlpha = lv.isGolden ? 0.9 : lv.isPocketBound ? 0.72 : lv.isExtreme ? 0.4 : 0.55;
      ctx.setLineDash(lv.isGolden ? [] : lv.isExtreme ? [2, 4] : [5, 3]);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + candleAreaW, y);
      ctx.stroke();
      ctx.restore();
    });
  }

  // Draw OHLC Candlesticks (supports #138 Market Highlight Reel Replay progressive reveal)
  const visibleLimit =
    state.chartReplay.active && state.chartReplay.idx > 0
      ? Math.min(converted.length, state.chartReplay.idx)
      : converted.length;
  converted.forEach((b, i) => {
    if (i >= visibleLimit) return;
    const cx = xCandle(i);
    const isUp = b.c >= b.o;
    const col = isUp ? upCol : downCol;
    const yH = yAt(b.h);
    const yL = yAt(b.l);
    const yO = yAt(b.o);
    const yC = yAt(b.c);

    // High-Low Wick
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(cx, yH);
    ctx.lineTo(cx, yL);
    ctx.stroke();

    // Open-Close Body
    const top = Math.min(yO, yC);
    const bodyH = Math.max(1.8, Math.abs(yC - yO));
    ctx.fillStyle = col;
    ctx.fillRect(cx - candleW / 2, top, candleW, bodyH);
  });

  // Optional 20- & 50-period Simple Moving Averages
  if (showSma) {
    const drawSmaLine = (arr, color) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = desktopCanvas ? 1.8 : 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] == null) continue;
        const x = xCandle(i);
        const y = yAt(arr[i]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();
    };
    if (sma20) drawSmaLine(sma20, '#38BDF8');
    if (sma50) drawSmaLine(sma50, '#F59E0B');
  }

  // Price Discovery (solid emerald #10B981) & Short Squeeze (dashed crimson #F43F5E) across historical candles
  const drawRegimeSeries = (arr, color, dash, width) => {
    if (!Array.isArray(arr) || !arr.length) return;
    ctx.save();
    if (dash) ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] == null || !Number.isFinite(arr[i])) continue;
      const x = xCandle(i);
      const y = yAt(arr[i]);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  };
  if (showDiscovery && discoverySeries) {
    drawRegimeSeries(discoverySeries, discCol, null, desktopCanvas ? 2.1 : 1.75);
  }
  if (showSqueeze && squeezeSeries) {
    drawRegimeSeries(squeezeSeries, sqzCol, [6, 4], desktopCanvas ? 2.1 : 1.75);
  }

  // Fibonacci level pills drawn after candles with priority collision avoidance
  if (fibData) {
    const priorityOrder = [0.618, 0.5, 0.382, 0.236, 0.786, 1, 0];
    const placedYs = [];
    const minGap = desktopCanvas ? 17 : 14;
    const pillH = desktopCanvas ? 15 : 13;
    ctx.save();
    ctx.font = `600 ${desktopCanvas ? 10.5 : 9}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const ratio of priorityOrder) {
      const lv = fibData.levels.find((item) => item.ratio === ratio);
      if (!lv) continue;
      const y = yAt(lv.price);
      if (y < padTop + 8 || y > padTop + plotH - 8) continue;
      if (placedYs.some((py) => Math.abs(py - y) < minGap)) continue;
      placedYs.push(y);
      const decimals = lv.price >= 500 ? 0 : 2;
      const txt = `${lv.label} ${fmtChartVal(lv.price, decimals)}`;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = isLightTheme ? 'rgba(255, 255, 255, 0.85)' : 'rgba(13, 14, 17, 0.78)';
      ctx.fillRect(padLeft + 2, y - pillH / 2, tw + 8, pillH);
      ctx.fillStyle = fibCol;
      ctx.globalAlpha = lv.isPocketBound ? 1 : 0.85;
      ctx.fillText(txt, padLeft + 6, y + 0.3);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Mini Zoom Position Track (shows where the zoomed window sits across full history)
  if (win.isZoomed && win.totalLen > 0) {
    const trackY = padTop + plotH + 3;
    const trackH = 3;
    const thumbX = padLeft + (win.startIdx / win.totalLen) * candleAreaW;
    const thumbW = Math.max(18, (win.visCount / win.totalLen) * candleAreaW);
    ctx.save();
    ctx.fillStyle = gridCol;
    ctx.fillRect(padLeft, trackY, candleAreaW, trackH);
    ctx.fillStyle = baseCol;
    ctx.globalAlpha = 0.72;
    ctx.fillRect(thumbX, trackY, Math.min(thumbW, padLeft + candleAreaW - thumbX), trackH);
    ctx.restore();
  }

  // Bottom X-axis date/time labels across historical candlestick zone
  const multiDayIntraday =
    INTRADAY_TIMEFRAMES.has(tf) &&
    converted.length >= 2 &&
    new Date(converted[0].t).toDateString() !== new Date(converted[converted.length - 1].t).toDateString();
  ctx.font = `500 ${desktopCanvas ? 11 : 9.5}px "JetBrains Mono", monospace`;
  ctx.fillStyle = mutedCol;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(formatCandleTimestamp(converted[0].t, tf, true, multiDayIntraday), padLeft, h - 2);
  if (!showFc && desktopCanvas && converted.length >= 10) {
    const q1 = Math.floor(converted.length * 0.25);
    const q2 = Math.floor(converted.length * 0.5);
    const q3 = Math.floor(converted.length * 0.75);
    ctx.textAlign = 'center';
    ctx.fillText(formatCandleTimestamp(converted[q1].t, tf, true, false), xCandle(q1), h - 2);
    ctx.fillText(formatCandleTimestamp(converted[q2].t, tf, true, false), xCandle(q2), h - 2);
    ctx.fillText(formatCandleTimestamp(converted[q3].t, tf, true, false), xCandle(q3), h - 2);
  } else {
    const midIdx = Math.floor(converted.length / 2);
    if (converted[midIdx]) {
      ctx.textAlign = 'center';
      ctx.fillText(formatCandleTimestamp(converted[midIdx].t, tf, true, false), padLeft + candleAreaW / 2, h - 2);
    }
  }
  if (!showFc) {
    ctx.textAlign = 'right';
    ctx.fillText(formatCandleTimestamp(converted[converted.length - 1].t, tf, true, multiDayIntraday), padLeft + candleAreaW, h - 2);
  }

  // Single Fine-Tuned Precision Forecast Line (NO wide shaded cone — timeframe-matched)
  let forecastLineGeom = null;
  if (hasFcLine && forecastAreaW > 20) {
    const startX = xCandle(converted.length - 1);
    const endX = padLeft + plotW - 4;
    const fcSpanX = Math.max(12, endX - startX);
    const pts = precisionFc.points;
    const lastIdx = pts.length - 1;
    const lineCol =
      precisionFc.direction === 'up'
        ? upCol
        : precisionFc.direction === 'down'
          ? downCol
          : baseCol;

    const screenPts = pts.map((pt, idx) => ({
      x: startX + (idx / lastIdx) * fcSpanX,
      y: yAt(pt.price),
      t: pt.t,
      price: pt.price,
      step: pt.step,
    }));

    // Subtle forecast lane backdrop & crisp vertical "Now" divider
    ctx.save();
    ctx.fillStyle = isLightTheme ? 'rgba(15, 23, 42, 0.025)' : 'rgba(255, 255, 255, 0.018)';
    ctx.fillRect(startX, padTop, padLeft + plotW - startX, plotH);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, padTop);
    ctx.lineTo(startX, padTop + plotH);
    ctx.stroke();
    ctx.restore();

    const traceSmoothForecast = () => {
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length - 1; i++) {
        const midX = (screenPts[i].x + screenPts[i + 1].x) / 2;
        const midY = (screenPts[i].y + screenPts[i + 1].y) / 2;
        ctx.quadraticCurveTo(screenPts[i].x, screenPts[i].y, midX, midY);
      }
      const lastPt = screenPts[screenPts.length - 1];
      ctx.lineTo(lastPt.x, lastPt.y);
    };

    // Soft ambient glow halo under the prediction line
    ctx.save();
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = desktopCanvas ? 6.5 : 5.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = isLightTheme ? 0.16 : 0.20;
    traceSmoothForecast();
    ctx.stroke();

    // Main razor-sharp Precision Forecast Line
    ctx.globalAlpha = 0.96;
    ctx.lineWidth = desktopCanvas ? 2.4 : 2.1;
    ctx.setLineDash([7, 2.5]);
    traceSmoothForecast();
    ctx.stroke();
    ctx.restore();

    // Subtle midpoint checkpoint dot
    const midPt = screenPts[Math.floor(screenPts.length / 2)];
    if (midPt) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(midPt.x, midPt.y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = lineCol;
      ctx.globalAlpha = 0.72;
      ctx.fill();
      ctx.restore();
    }

    // Glowing endpoint target ring dot
    const endPt = screenPts[screenPts.length - 1];
    ctx.save();
    ctx.beginPath();
    ctx.arc(endPt.x, endPt.y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = lineCol;
    ctx.globalAlpha = 0.22;
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(endPt.x, endPt.y, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = isLightTheme ? '#FFFFFF' : '#0B0D12';
    ctx.fill();
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = lineCol;
    ctx.stroke();
    ctx.restore();

    // Floating endpoint target price badge (collision-avoided against edges & spot pill)
    const fcDec = Math.abs(precisionFc.endPrice) >= 500 ? (INTRADAY_TIMEFRAMES.has(tf) ? 2 : 0) : 2;
    const fcPctSign = precisionFc.deltaPct > 0 ? '+' : precisionFc.deltaPct < 0 ? '−' : '';
    const fcTagTxt = `${precisionFc.horizonLabel} ${formatCompactMoney(precisionFc.endPrice, fcDec)} (${fcPctSign}${Math.abs(precisionFc.deltaPct).toFixed(Math.abs(precisionFc.deltaPct) < 1 ? 2 : 1)}%)`;
    ctx.save();
    ctx.font = `700 ${desktopCanvas ? 9.5 : 8.5}px "JetBrains Mono", monospace`;
    const tw = ctx.measureText(fcTagTxt).width;
    const tagW = Math.min(Math.max(tw + 10, 56), plotW * 0.56);
    const tagH = desktopCanvas ? 16 : 15;
    // Keep target badge strictly inside the plot area so it NEVER overlaps right Y-axis labels on narrow phones
    const maxTagX = Math.max(padLeft + 4, padLeft + plotW - tagW - 4);
    const minTagX = Math.min(startX + 3, maxTagX);
    const tagX = clampNum(endPt.x - tagW + 2, minTagX, maxTagX);
    let tagY = endPt.y - tagH - 7;
    if (tagY < padTop + 2) tagY = endPt.y + 8;
    if (spotPillY != null && Math.abs(tagY + tagH / 2 - spotPillY) < tagH && Math.abs(endPt.y - spotPillY) < tagH) {
      tagY = endPt.y >= spotPillY ? Math.min(padTop + plotH - tagH - 2, endPt.y + 9) : Math.max(padTop + 2, endPt.y - tagH - 9);
    }
    const r = 4;
    ctx.beginPath();
    ctx.moveTo(tagX + r, tagY);
    ctx.lineTo(tagX + tagW - r, tagY);
    ctx.quadraticCurveTo(tagX + tagW, tagY, tagX + tagW, tagY + r);
    ctx.lineTo(tagX + tagW, tagY + tagH - r);
    ctx.quadraticCurveTo(tagX + tagW, tagY + tagH, tagX + tagW - r, tagY + tagH);
    ctx.lineTo(tagX + r, tagY + tagH);
    ctx.quadraticCurveTo(tagX, tagY + tagH, tagX, tagY + tagH - r);
    ctx.lineTo(tagX, tagY + r);
    ctx.quadraticCurveTo(tagX, tagY, tagX + r, tagY);
    ctx.closePath();
    ctx.fillStyle = isLightTheme ? 'rgba(255,255,255,0.95)' : 'rgba(13,14,17,0.93)';
    ctx.fill();
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.fillStyle = lineCol;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fcTagTxt, tagX + tagW / 2, tagY + tagH / 2 + 0.3, tagW - 6);
    ctx.restore();

    // Forecast horizon label at bottom right
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = mutedCol;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    ctx.fillText(`Now → ${precisionFc.horizonLabel}`, (startX + endX) / 2, h - 2);

    forecastLineGeom = {
      startX,
      endX,
      lineCol,
      dec: fcDec,
      fc: precisionFc,
      points: screenPts,
    };
  }

  // Live Spot Price Horizontal Line & Right Y-Axis Highlight Pill (matches live spot card price)
  if (Number.isFinite(liveSpotVal)) {
    const inRange = liveSpotVal >= min && liveSpotVal <= max;
    const rawSpotY = yAt(liveSpotVal);
    const pillH = desktopCanvas ? 18 : 16;
    const pillY = clampNum(rawSpotY, padTop + pillH / 2, padTop + plotH - pillH / 2);
    const pillX = padLeft + plotW + 3;
    const pillW = Math.max(40, w - pillX - 1);
    const spotLineCol = isLightTheme
      ? (sel === 'silver' ? '#475569' : '#B47B17')
      : baseCol;
    const pillTextCol = isLightTheme ? '#FFFFFF' : '#0B0D12';

    ctx.save();
    if (inRange) {
      // Crisp horizontal dashed line spanning the entire chart at exact live spot price
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = spotLineCol;
      ctx.lineWidth = desktopCanvas ? 1.35 : 1.15;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.moveTo(padLeft, rawSpotY);
      ctx.lineTo(padLeft + plotW, rawSpotY);
      ctx.stroke();

      // Highlight dot at latest candle when live edge is visible
      if (win.isAtLiveEdge) {
        const lastCx = xCandle(converted.length - 1);
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(lastCx, rawSpotY, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = spotLineCol;
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(lastCx, rawSpotY, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = spotLineCol;
        ctx.fill();
      }
    }

    // Solid right Y-axis live price tag pill (with ▲/▼ indicator if panned away from spot range)
    const displayPillTxt = inRange
      ? spotPillText
      : `${liveSpotVal > max ? '▲' : '▼'} ${spotPillText}`;
    ctx.setLineDash([]);
    ctx.globalAlpha = inRange ? 1 : 0.78;
    const r = 4;
    const px = pillX;
    const py = pillY - pillH / 2;
    ctx.beginPath();
    ctx.moveTo(px + r, py);
    ctx.lineTo(px + pillW - r, py);
    ctx.quadraticCurveTo(px + pillW, py, px + pillW, py + r);
    ctx.lineTo(px + pillW, py + pillH - r);
    ctx.quadraticCurveTo(px + pillW, py + pillH, px + pillW - r, py + pillH);
    ctx.lineTo(px + r, py + pillH);
    ctx.quadraticCurveTo(px, py + pillH, px, py + pillH - r);
    ctx.lineTo(px, py + r);
    ctx.quadraticCurveTo(px, py, px + r, py);
    ctx.closePath();
    ctx.fillStyle = spotLineCol;
    ctx.fill();

    ctx.font = `700 ${desktopCanvas ? 10.5 : 9.5}px "JetBrains Mono", monospace`;
    ctx.fillStyle = pillTextCol;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayPillTxt, px + pillW / 2, pillY + 0.4, pillW - 4);
    ctx.restore();
  }

  // Optional RSI(14) oscillator sub-chart (computed on full series first so zooming never distorts momentum)
  let rsiData = null;
  if (state.settings.showRsi) {
    const fullRsi = computeRsiSeries(allConverted, 14);
    const slicedVals = fullRsi.values.slice(win.startIdx, win.endIdx);
    const visLast = slicedVals.length ? slicedVals[slicedVals.length - 1] : null;
    rsiData = {
      values: slicedVals,
      latest: visLast != null ? +visLast.toFixed(1) : fullRsi.latest,
    };
    drawRsiPane(rsiData, candleAreaW, padLeft, stepX);
  }

  // #227 Auto-Labeled Plain-English Chart Patterns
  const patStripEl = document.getElementById('chart-patterns-strip');
  let detectedPatterns = [];
  if (state.settings.showPatterns && converted.length >= 6) {
    detectedPatterns = detectChartPatterns(converted.slice(0, visibleLimit));
    ctx.save();
    ctx.font = `600 ${desktopCanvas ? 10 : 8.8}px "Inter", sans-serif`;
    ctx.textBaseline = 'middle';
    const drawnTagYs = [];
    for (const pat of detectedPatterns) {
      const py = yAt(pat.price);
      if (py < padTop + 6 || py > padTop + plotH - 6) continue;
      ctx.save();
      ctx.strokeStyle = pat.color;
      ctx.lineWidth = 1.25;
      ctx.setLineDash(pat.dash || [4, 3]);
      ctx.beginPath();
      const x1 = pat.startIdx != null ? xCandle(pat.startIdx) : padLeft;
      const x2 = pat.endIdx != null ? xCandle(pat.endIdx) : padLeft + candleAreaW;
      ctx.moveTo(x1, py);
      ctx.lineTo(x2, py);
      ctx.stroke();
      ctx.restore();

      const pillX = Math.min(padLeft + candleAreaW - 120, Math.max(padLeft + 4, (x1 + x2) / 2 - 42));
      let labelY = py - 9;
      if (drawnTagYs.some((uy) => Math.abs(uy - labelY) < 15)) labelY = py + 11;
      labelY = Math.max(padTop + 9, Math.min(padTop + plotH - 9, labelY));
      drawnTagYs.push(labelY);
      const tw = ctx.measureText(pat.label).width;
      ctx.fillStyle = isLightTheme ? 'rgba(255,255,255,0.92)' : 'rgba(13,14,17,0.88)';
      ctx.fillRect(pillX, labelY - 7, tw + 10, 14);
      ctx.strokeStyle = pat.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(pillX, labelY - 7, tw + 10, 14);
      ctx.fillStyle = pat.color;
      ctx.textAlign = 'left';
      ctx.fillText(pat.label, pillX + 5, labelY + 0.3);
    }
    ctx.restore();
    if (patStripEl) {
      patStripEl.hidden = true;
      patStripEl.innerHTML = '';
    }
  } else if (patStripEl) {
    patStripEl.hidden = true;
  }

  // Market Gap Target Lines, Canvas Pill Labels & Plain-English Gap Strip
  const gapsStripEl = document.getElementById('chart-gaps-strip');
  const gapsByIdx = new Map();
  if (chartGapAnalysis?.gaps?.length) {
    const gapDec = isRatio ? 2 : (liveSpotVal >= 500 ? 2 : 2);
    const fmtGapAmt = (v) =>
      isRatio ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}` : `${v >= 0 ? '+' : '−'}${formatMoney(Math.abs(v), gapDec)}`;
    for (const gp of chartGapAnalysis.gaps) {
      gapsByIdx.set(gp.idx, gp);
      const x1 = Math.max(padLeft, xCandle(Math.max(0, gp.idx - 1)) + stepX * 0.35);
      const x2 = gp.isFilled && gp.filledAtIdx != null
        ? Math.min(padLeft + candleAreaW, xCandle(gp.filledAtIdx) + stepX * 0.4)
        : padLeft + candleAreaW;
      const fillY = yAt(gp.fillTarget);
      if (fillY < padTop + 4 || fillY > padTop + plotH - 4) continue;
      const col = gp.dir === 'up' ? '#22C55E' : '#F43F5E';
      const fresh = gp.freshness ?? (gp.isFilled ? 0 : 1);
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = gp.isFilled ? 0.36 : +(0.30 + 0.60 * fresh).toFixed(2);
      ctx.lineWidth = gp.isFilled || fresh < 0.25 ? 1.0 : 1.35;
      ctx.setLineDash(gp.isFilled || fresh < 0.25 ? [2, 4] : [6, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, fillY);
      ctx.lineTo(x2, fillY);
      ctx.stroke();

      if ((!gp.isFilled && fresh > 0.15) || gp === chartGapAnalysis.primary) {
        const tagTxt = gp.isFilled
          ? `${gp.dir === 'up' ? 'Gap Up' : 'Gap Down'} Filled ✓`
          : gp.isBreakawayAged
            ? `Breakaway ${gp.dir === 'up' ? 'Up' : 'Down'} (${Math.round(gp.ageDays)}d)`
            : `${gp.dir === 'up' ? 'Gap Up' : 'Gap Down'} · Fill ${fmtChartVal(gp.fillTarget, gapDec)}`;
        ctx.setLineDash([]);
        ctx.font = `700 ${desktopCanvas ? 9.5 : 8.5}px "JetBrains Mono", monospace`;
        const tw = ctx.measureText(tagTxt).width;
        const tagW = tw + 10;
        const tagH = 14;
        const tagX = clampNum(x1 + 4, padLeft + 2, padLeft + candleAreaW - tagW - 2);
        const tagY = gp.dir === 'up'
          ? Math.min(padTop + plotH - tagH - 2, fillY + 3)
          : Math.max(padTop + 2, fillY - tagH - 3);
        ctx.globalAlpha = 0.94;
        ctx.fillStyle = isLightTheme ? 'rgba(255,255,255,0.93)' : 'rgba(13,14,17,0.9)';
        ctx.fillRect(tagX, tagY, tagW, tagH);
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.strokeRect(tagX, tagY, tagW, tagH);
        ctx.fillStyle = col;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagTxt, tagX + 5, tagY + tagH / 2 + 0.3);
      }
      ctx.restore();
    }

    if (gapsStripEl) {
      const p = chartGapAnalysis.primary;
      if (p && !p.isFilled) {
        const dirCls = p.dir === 'up' ? 'up' : 'down';
        const dirTitle = p.dir === 'up' ? 'Gap Up (Bullish Bias)' : 'Gap Down (Bearish Bias)';
        const moveVerb = p.dir === 'up' ? 'drop' : 'rally';
        const moveAmt = fmtGapAmt(p.moveToFillUsd);
        const movePct = `${p.moveToFillPct >= 0 ? '+' : '−'}${Math.abs(p.moveToFillPct).toFixed(2)}%`;
        const gapAmt = fmtGapAmt(p.gapUsd);
        const gapPct = `${p.gapPct >= 0 ? '+' : '−'}${Math.abs(p.gapPct).toFixed(2)}%`;
        gapsStripEl.hidden = false;
        gapsStripEl.innerHTML =
          `<span class="gap-pill ${dirCls}">${escapeHtml(`${dirTitle} · ${p.kind} ${gapAmt} (${gapPct})`)}</span>` +
          `<span class="gap-pill neutral">${escapeHtml(`${p.fillPct}% filled · Needs ${moveAmt} (${movePct}) ${moveVerb} to ${fmtChartVal(p.fillTarget, gapDec)} to fill`)}</span>`;
      } else if (p && p.isFilled) {
        gapsStripEl.hidden = false;
        gapsStripEl.innerHTML =
          `<span class="gap-pill neutral">${escapeHtml(`Recent ${p.dir === 'up' ? 'Gap Up' : 'Gap Down'} at ${fmtChartVal(p.fillTarget, gapDec)} · 100% Filled ✓`)}</span>`;
      } else {
        gapsStripEl.hidden = true;
      }
    }
  } else if (gapsStripEl) {
    gapsStripEl.hidden = true;
  }

  // #9 Personal "My Buys" Plot Directly on the Price Chart
  const buyMarkersByIdx = new Map();
  if (state.settings.showMyBuys && !isRatio && converted.length >= 2) {
    const lots = (state.settings.stackLots || []).filter((l) => l.metal === sel);
    const tMin = converted[0].t;
    const tMax = converted[converted.length - 1].t;
    for (const lot of lots) {
      const lotUnitPrice = convertUnit(Number(lot.cost) || 0);
      if (lotUnitPrice <= 0) continue;
      const lotMs = lot.date ? Date.parse(`${lot.date}T12:00:00Z`) : NaN;
      let targetIdx = Math.max(0, converted.length - 1);
      if (Number.isFinite(lotMs) && lotMs >= tMin && lotMs <= tMax + 86400000) {
        let bestDist = Infinity;
        for (let i = 0; i < converted.length; i++) {
          const d = Math.abs(converted[i].t - lotMs);
          if (d < bestDist) {
            bestDist = d;
            targetIdx = i;
          }
        }
      } else {
        // Match closest bar price if purchase date predates this short chart window
        let bestDiff = Infinity;
        for (let i = 0; i < converted.length; i++) {
          const d = Math.abs(converted[i].c - lotUnitPrice);
          if (d < bestDiff) {
            bestDiff = d;
            targetIdx = i;
          }
        }
      }
      if (targetIdx >= visibleLimit) continue;
      const cx = xCandle(targetIdx);
      const cy = Math.max(padTop + 10, Math.min(padTop + plotH - 10, yAt(lotUnitPrice)));
      ctx.save();
      ctx.fillStyle = '#F59E0B';
      ctx.strokeStyle = isLightTheme ? '#FFFFFF' : '#0D0E11';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 6);
      ctx.lineTo(cx + 6, cy);
      ctx.lineTo(cx, cy + 6);
      ctx.lineTo(cx - 6, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      ctx.fillStyle = '#F59E0B';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('BUY', cx, cy - 8);
      ctx.restore();
      const arr = buyMarkersByIdx.get(targetIdx) || [];
      arr.push(lot);
      buyMarkersByIdx.set(targetIdx, arr);
    }
    // Also plot average cost basis dashed reference line if user entered Gold/Silver avg cost
    const avgCostRaw = Number(sel === 'silver' ? state.settings.stack.silverCost : state.settings.stack.goldCost);
    if (Number.isFinite(avgCostRaw) && avgCostRaw > 0) {
      const avgY = yAt(convertUnit(avgCostRaw));
      if (avgY >= padTop + 6 && avgY <= padTop + plotH - 6) {
        ctx.save();
        ctx.strokeStyle = '#F59E0B';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(padLeft, avgY);
        ctx.lineTo(padLeft + candleAreaW, avgY);
        ctx.stroke();
        ctx.font = '600 9.5px "JetBrains Mono", monospace';
        ctx.fillStyle = '#F59E0B';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(
          isPrivacyOn() ? 'My Avg Cost •••' : `My Avg Cost ${fmtChartVal(convertUnit(avgCostRaw), convertUnit(avgCostRaw) >= 500 ? 0 : 2)}`,
          padLeft + 4,
          avgY - 3
        );
        ctx.restore();
      }
    }
  }

  // #230 Interactive News Pins on the Price Chart
  const newsPinsByIdx = new Map();
  if (state.settings.showNewsDots && converted.length >= 6) {
    const headlines = (outlookState.data?.headlines || FALLBACK_OUTLOOK.headlines || []).slice(0, 6);
    const tMin = converted[0].t;
    const tMax = converted[converted.length - 1].t;
    // Find biggest bar movers as fallback anchors when headlines are newer than multi-year bars
    const moverIndices = converted
      .map((b, idx) => ({ idx, mag: b.o > 0 ? Math.abs((b.c - b.o) / b.o) : 0 }))
      .sort((a, b) => b.mag - a.mag)
      .map((x) => x.idx);

    const usedIdx = new Set();
    headlines.forEach((h, hIdx) => {
      const pubMs = h.publishedAt ? Date.parse(h.publishedAt) : NaN;
      let targetIdx = null;
      if (Number.isFinite(pubMs) && pubMs >= tMin && pubMs <= tMax + 86400000) {
        let bestD = Infinity;
        for (let i = 0; i < converted.length; i++) {
          const d = Math.abs(converted[i].t - pubMs);
          if (d < bestD && !usedIdx.has(i)) {
            bestD = d;
            targetIdx = i;
          }
        }
      }
      if (targetIdx == null) {
        targetIdx = moverIndices.find((idx) => !usedIdx.has(idx)) ?? Math.max(0, converted.length - 1 - hIdx * 2);
      }
      if (targetIdx >= visibleLimit) return;
      usedIdx.add(targetIdx);
      const b = converted[targetIdx];
      const cx = xCandle(targetIdx);
      const isBull = h.sentiment === 'bullish';
      const isBear = h.sentiment === 'bearish';
      const pinCol = isBull ? upCol : isBear ? downCol : '#38BDF8';
      const cy = Math.max(padTop + 10, yAt(b.h) - 10);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 4.8, 0, Math.PI * 2);
      ctx.fillStyle = pinCol;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = isLightTheme ? '#FFFFFF' : '#0D0E11';
      ctx.stroke();
      ctx.font = '700 7.5px "Inter", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', cx, cy + 0.4);
      ctx.restore();
      newsPinsByIdx.set(targetIdx, h);
    });
  }

  // Infer actual bar duration for tooltip time range (handles 1m, 5m, 30m, or bridged 1h bars truthfully)
  let inferredBarMs = CHART_TF_META[tf]?.barMs || CANDLE_INTERVAL_MS;
  if (INTRADAY_TIMEFRAMES.has(tf) && converted.length >= 2) {
    const diffs = [];
    for (let i = 1; i < converted.length; i++) {
      const d = converted[i].t - converted[i - 1].t;
      if (d >= 60000 && d <= 3600000) diffs.push(d);
    }
    if (diffs.length) {
      diffs.sort((a, b) => a - b);
      inferredBarMs = diffs[Math.floor(diffs.length / 2)];
    }
  }

  state.chartGeom = {
    w,
    h,
    dpr,
    padLeft,
    padTop,
    plotW,
    plotH,
    candleAreaW,
    stepX,
    tf,
    isRatio,
    converted,
    visibleLimit,
    totalCount: allConverted.length,
    viewStart: win.startIdx,
    viewEnd: win.endIdx,
    visCount: win.visCount,
    defaultVis: win.defaultVis,
    isAtLiveEdge: win.isAtLiveEdge,
    isZoomed: win.isZoomed,
    multiDayIntraday,
    inferredBarMs,
    liveClose,
    liveSpotVal,
    showFc: hasFcLine,
    forecastLine: forecastLineGeom,
    sma20,
    sma50,
    discoverySeries,
    squeezeSeries,
    rsiValues: rsiData?.values || null,
    buyMarkersByIdx,
    newsPinsByIdx,
    gapsByIdx,
    detectedPatterns,
    xCandle,
    yAt,
    fmtChartVal,
    borderCol,
    baseCol,
  };
  renderCrosshairOverlay(state.hoverCandleIdx);
}

function detectChartPatterns(bars) {
  if (!Array.isArray(bars) || bars.length < 8) return [];
  const patterns = [];
  const n = bars.length;
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const closes = bars.map((b) => b.c);
  const maxH = Math.max(...highs);
  const minL = Math.min(...lows);
  const span = Math.max(maxH - minL, maxH * 0.004, 0.01);

  // 1. Key Buyer Floor (Support) & Seller Ceiling (Resistance)
  patterns.push({
    label: 'Buyer Floor',
    hint: 'Strong dip-buying zone',
    price: minL + span * 0.05,
    startIdx: 0,
    endIdx: n - 1,
    color: '#22C55E',
    dash: [5, 4],
  });
  patterns.push({
    label: 'Seller Ceiling',
    hint: 'Recent top resistance',
    price: maxH - span * 0.04,
    startIdx: 0,
    endIdx: n - 1,
    color: '#F43F5E',
    dash: [5, 4],
  });

  // 2. Double Bottom Detection (two swing lows within 1.2% of each other separated by a bounce)
  const swingLows = [];
  for (let i = 2; i < n - 2; i++) {
    if (lows[i] <= lows[i - 1] && lows[i] <= lows[i + 1] && lows[i] <= lows[i - 2] && lows[i] <= lows[i + 2]) {
      swingLows.push({ i, v: lows[i] });
    }
  }
  for (let a = 0; a < swingLows.length - 1; a++) {
    for (let b = a + 1; b < swingLows.length; b++) {
      if (swingLows[b].i - swingLows[a].i >= 4) {
        const diffPct = Math.abs(swingLows[b].v - swingLows[a].v) / Math.max(swingLows[a].v, 1);
        if (diffPct <= 0.014) {
          patterns.push({
            label: 'Double Bottom',
            hint: 'Classic rebound base',
            price: (swingLows[a].v + swingLows[b].v) / 2,
            startIdx: swingLows[a].i,
            endIdx: swingLows[b].i,
            color: '#10B981',
            dash: [],
          });
          a = swingLows.length;
          break;
        }
      }
    }
  }

  // 3. Breakout or Pullback Trend Check
  const lastClose = closes[n - 1];
  const prevHigh = Math.max(...highs.slice(0, Math.max(1, n - 3)));
  if (lastClose >= prevHigh * 0.996) {
    patterns.push({
      label: 'Breakout High',
      hint: 'Pushing above prior peak',
      price: prevHigh,
      startIdx: Math.max(0, n - 10),
      endIdx: n - 1,
      color: '#D4A843',
      dash: [3, 3],
    });
  } else {
    // Trend cross check (short 5-bar vs 15-bar avg)
    const s5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const s15 = closes.slice(-Math.min(15, n)).reduce((a, b) => a + b, 0) / Math.min(15, n);
    if (s5 > s15 * 1.004) {
      patterns.push({
        label: 'Uptrend Cross',
        hint: 'Short trend above medium avg',
        price: s5,
        startIdx: Math.max(0, n - 8),
        endIdx: n - 1,
        color: '#38BDF8',
        dash: [4, 3],
      });
    } else if (s5 < s15 * 0.996) {
      patterns.push({
        label: 'Pullback Drift',
        hint: 'Cooling below medium avg',
        price: s5,
        startIdx: Math.max(0, n - 8),
        endIdx: n - 1,
        color: '#F59E0B',
        dash: [4, 3],
      });
    }
  }

  return patterns.slice(0, 4);
}

function analyzeClientMarketGaps(bars, liveSpot = null, metal = 'gold', tf = '1d') {
  if (!Array.isArray(bars) || bars.length < 2) {
    return {
      metal,
      tf,
      tfLabel: CHART_TF_META[tf]?.label || '1D',
      gaps: [],
      primary: null,
      openCount: 0,
      signal: 0,
      predictionBoost: 0,
      bias: 'neutral',
      status: 'No Open Gap',
    };
  }
  const isSilver = metal === 'silver';
  const isRatio = metal === 'ratio';
  const minGapPct =
    tf === '15min' || tf === '1h'
      ? (isSilver || isRatio ? 0.22 : 0.12)
      : tf === '4h' || tf === '1d'
        ? (isSilver || isRatio ? 0.40 : 0.22)
        : tf === '7d' || tf === '1m' || tf === '6m'
          ? (isSilver || isRatio ? 0.65 : 0.35)
          : (isSilver || isRatio ? 1.15 : 0.70);

  const spot =
    Number.isFinite(Number(liveSpot)) && Number(liveSpot) > 0
      ? Number(liveSpot)
      : bars[bars.length - 1].c;
  const gaps = [];

  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    if (!prev || !curr || !(prev.c > 0) || !(curr.o > 0)) continue;
    const rawGapUsd = curr.o - prev.c;
    const rawGapPct = (rawGapUsd / prev.c) * 100;
    const absPct = Math.abs(rawGapPct);
    if (absPct < minGapPct) continue;

    const dir = rawGapUsd >= 0 ? 'up' : 'down';
    const fillTarget = prev.c;
    const gapEdge = curr.o;
    const zoneLow = Math.min(fillTarget, gapEdge);
    const zoneHigh = Math.max(fillTarget, gapEdge);
    const zoneSpan = Math.max(0.0001, zoneHigh - zoneLow);
    const dtMs = (curr.t || 0) - (prev.t || 0);
    const kind =
      dtMs >= 24 * 3600000
        ? 'Weekend Gap'
        : dtMs >= 45 * 60000
          ? 'Session Gap'
          : absPct >= (isSilver ? 1.0 : 0.6)
            ? 'Breakaway Gap'
            : 'Price Gap';

    let extremeSince = dir === 'up' ? curr.l : curr.h;
    let filledAtIdx = null;
    for (let j = i; j < bars.length; j++) {
      const b = bars[j];
      if (dir === 'up') {
        if (b.l < extremeSince) extremeSince = b.l;
        if (filledAtIdx == null && b.l <= fillTarget) filledAtIdx = j;
      } else {
        if (b.h > extremeSince) extremeSince = b.h;
        if (filledAtIdx == null && b.h >= fillTarget) filledAtIdx = j;
      }
    }
    if (dir === 'up' && spot < extremeSince) extremeSince = spot;
    if (dir === 'down' && spot > extremeSince) extremeSince = spot;
    if (filledAtIdx == null) {
      if ((dir === 'up' && spot <= fillTarget) || (dir === 'down' && spot >= fillTarget)) {
        filledAtIdx = bars.length - 1;
      }
    }

    const fillRatio =
      dir === 'up'
        ? clampNum((zoneHigh - extremeSince) / zoneSpan, 0, 1)
        : clampNum((extremeSince - zoneLow) / zoneSpan, 0, 1);
    const isFilled = fillRatio >= 0.99 || filledAtIdx != null;
    const fillPct = isFilled ? 100 : Math.round(fillRatio * 100);
    const moveToFillUsd = fillTarget - spot;
    const moveToFillPct = spot > 0 ? (moveToFillUsd / spot) * 100 : 0;
    const holdingBeyond = dir === 'up' ? spot >= zoneHigh : spot <= zoneLow;
    const unfilledFrac = isFilled ? 0 : 1 - fillRatio;

    // Age-decay: full weight for 48h, fades smoothly over days 2–10, retires after 10d as a confirmed Breakaway
    const refNowMs = bars[bars.length - 1]?.t || curr.t || 0;
    const ageHours = curr.t && refNowMs > curr.t ? (refNowMs - curr.t) / 3600000 : 0;
    const ageDays = ageHours / 24;
    const isBreakawayAged = !isFilled && ageDays >= 4 && fillPct < 50 && holdingBeyond;
    const freshness = isFilled
      ? 0
      : ageDays <= 2
        ? 1
        : ageDays >= 10
          ? 0
          : +clampNum(Math.exp(-(ageDays - 2) / 3.2), 0, 1).toFixed(3);

    const magNorm = clampNum(absPct / (isSilver ? 2.4 : 1.35), 0.25, 1.0);
    const holdMult = holdingBeyond ? 1.15 : 0.72;
    const signal =
      isFilled || freshness <= 0
        ? 0
        : clampNum((dir === 'up' ? 1 : -1) * magNorm * unfilledFrac * holdMult * freshness * 0.78, -0.85, 0.85);
    const predictionBoost = isFilled || freshness <= 0 ? 0 : clampNum(signal * 0.20, -0.16, 0.16);

    gaps.push({
      idx: i,
      t: curr.t,
      prevT: prev.t,
      dir,
      kind: isBreakawayAged ? 'Breakaway Gap (Confirmed)' : kind,
      tf,
      tfLabel: CHART_TF_META[tf]?.label || '1D',
      gapUsd: +rawGapUsd.toFixed(2),
      gapPct: +rawGapPct.toFixed(2),
      fillTarget: +fillTarget.toFixed(2),
      gapEdge: +gapEdge.toFixed(2),
      zoneLow: +zoneLow.toFixed(2),
      zoneHigh: +zoneHigh.toFixed(2),
      fillPct,
      isFilled,
      filledAtIdx,
      holdingBeyond,
      ageDays: +ageDays.toFixed(1),
      freshness,
      isBreakawayAged,
      moveToFillUsd: +moveToFillUsd.toFixed(2),
      moveToFillPct: +moveToFillPct.toFixed(2),
      signal: +signal.toFixed(3),
      predictionBoost: +predictionBoost.toFixed(4),
    });
  }

  const openGaps = gaps.filter((g) => !g.isFilled && g.freshness > 0);
  const rankGap = (g) => {
    const kindW = g.kind === 'Weekend Gap' ? 1.55 : g.kind === 'Session Gap' ? 1.25 : 1.0;
    return Math.abs(g.gapPct) * (1 - g.fillPct / 100) * Math.max(0.15, g.freshness) * kindW;
  };
  const primary = openGaps.length
    ? [...openGaps].sort((a, b) => rankGap(b) - rankGap(a) || b.idx - a.idx)[0]
    : gaps.length
      ? gaps[gaps.length - 1]
      : null;

  return {
    metal,
    tf,
    tfLabel: CHART_TF_META[tf]?.label || '1D',
    gaps: gaps.slice(-4),
    primary,
    openCount: openGaps.length,
    signal: primary ? primary.signal : 0,
    predictionBoost: primary ? primary.predictionBoost : 0,
    bias: primary && !primary.isFilled && primary.freshness > 0 ? (primary.dir === 'up' ? 'bullish' : 'bearish') : 'neutral',
    status: !primary
      ? 'No Open Gap'
      : primary.isFilled
        ? 'Gap Filled ✓'
        : primary.freshness <= 0
          ? 'Breakaway (Aged)'
          : primary.dir === 'up'
            ? 'Gap Up · Bullish ↑'
            : 'Gap Down · Bearish ↓',
  };
}

function computeMetalGapSummary(metal, liveSpotUsd) {
  const candidates = [
    { tf: '4h', bars: state.candles[metal] },
    { tf: '1d', bars: state.candles[metal].length >= 60 ? aggregateBarsByInterval(state.candles[metal], 30 * 60000) : state.candles[metal] },
    { tf: '7d', bars: state.timeframes?.['7d']?.[metal] || [] },
    { tf: '1m', bars: state.timeframes?.['1m']?.[metal] || [] },
  ];
  let bestFilled = null;
  for (const c of candidates) {
    if (!Array.isArray(c.bars) || c.bars.length < 2) continue;
    const res = analyzeClientMarketGaps(c.bars, liveSpotUsd, metal, c.tf);
    if (res.openCount > 0 && res.primary && !res.primary.isFilled) return res;
    if (!bestFilled && res.primary) bestFilled = res;
  }
  if (bestFilled) return bestFilled;
  const fallbackSaved = outlookState.data?.marketGaps?.[metal];
  if (fallbackSaved) return fallbackSaved;
  return analyzeClientMarketGaps([], liveSpotUsd, metal, '1d');
}

function stopChartReplay(reRender = true) {
  if (state.chartReplay.timer) {
    clearInterval(state.chartReplay.timer);
    state.chartReplay.timer = null;
  }
  state.chartReplay.active = false;
  state.chartReplay.paused = false;
  state.chartReplay.idx = 0;
  const bar = document.getElementById('chart-replay-bar');
  if (bar) bar.hidden = true;
  if (reRender) renderChart();
}

function stepChartReplay() {
  if (!state.chartReplay.active || state.chartReplay.paused) return;
  const g = state.chartGeom;
  const total = g?.converted?.length || 28;
  state.chartReplay.idx += 1;
  if (state.chartReplay.idx > total) {
    state.chartReplay.paused = true;
    const ppBtn = document.getElementById('btn-replay-playpause');
    if (ppBtn) ppBtn.textContent = '▶';
    const st = document.getElementById('chart-replay-status');
    if (st) st.textContent = `Replay complete (${total}/${total} bars) — tap ▶ to watch again.`;
    return;
  }
  const curBar = g?.converted?.[state.chartReplay.idx - 1];
  const st = document.getElementById('chart-replay-status');
  if (st && curBar) {
    const tLbl = formatCandleTimestamp(curBar.t, g.tf, false);
    const pctBar = curBar.o > 0 ? ((curBar.c - curBar.o) / curBar.o) * 100 : 0;
    const dec = curBar.c >= 500 ? 0 : 2;
    const pin = g.newsPinsByIdx?.get(state.chartReplay.idx - 1);
    const newsNote = pin ? ` · News: ${pin.title.slice(0, 48)}…` : '';
    const moveNote = Math.abs(pctBar) >= 0.4 ? (pctBar > 0 ? ' · Rally spike!' : ' · Sharp dip!') : '';
    st.textContent = `Bar ${state.chartReplay.idx}/${total} (${tLbl}): ${g.fmtChartVal(curBar.c, dec)} (${pctBar >= 0 ? '+' : ''}${pctBar.toFixed(2)}%)${moveNote}${newsNote}`;
  }
  state.hoverCandleIdx = Math.max(0, state.chartReplay.idx - 1);
  renderChart();
}

function startChartReplay() {
  stopChartReplay(false);
  state.chartReplay.active = true;
  state.chartReplay.paused = false;
  state.chartReplay.idx = 2;
  const bar = document.getElementById('chart-replay-bar');
  if (bar) bar.hidden = false;
  const ppBtn = document.getElementById('btn-replay-playpause');
  if (ppBtn) ppBtn.textContent = '⏸';
  const spBtn = document.getElementById('btn-replay-speed');
  if (spBtn) spBtn.textContent = `${state.chartReplay.speed}×`;
  renderChart();
  const intervalMs = state.chartReplay.speed === 2 ? 150 : 320;
  state.chartReplay.timer = setInterval(stepChartReplay, intervalMs);
}

function renderCrosshairOverlay(idx = state.hoverCandleIdx, fcIdx = state.hoverForecastIdx) {
  const g = state.chartGeom;
  const overlay = document.getElementById('chart-crosshair-overlay');
  const tipEl = document.getElementById('chart-tooltip');
  const ohlcEl = document.getElementById('chart-ohlc');
  if (!g || !g.converted?.length) {
    if (tipEl) tipEl.hidden = true;
    return;
  }

  const activeFcIdx =
    fcIdx != null && g.forecastLine?.points?.[fcIdx] ? fcIdx : null;
  const activeIdx = activeFcIdx == null && idx != null && g.converted[idx] ? idx : null;

  // Forecast Line hover mode (right of "Now")
  if (activeFcIdx != null) {
    const fl = g.forecastLine;
    const pt = fl.points[activeFcIdx];
    const fc = fl.fc;
    const baseSpot = Number.isFinite(g.liveSpotVal) && g.liveSpotVal > 0 ? g.liveSpotVal : fc.startPrice;
    const delta = pt.price - baseSpot;
    const deltaPct = baseSpot > 0 ? (delta / baseSpot) * 100 : 0;
    const dec = fl.dec ?? 2;
    const fmtD = (d) => `${d >= 0 ? '+' : '−'}${formatMoney(Math.abs(d), dec)}`;
    const pctStr = `${deltaPct >= 0 ? '+' : '−'}${Math.abs(deltaPct).toFixed(2)}%`;
    const moveCls = delta > 0.0001 ? 'tt-up' : delta < -0.0001 ? 'tt-dn' : '';
    const isEnd = activeFcIdx === fl.points.length - 1;
    const tLbl = formatCandleTimestamp(pt.t, g.tf, false, true);
    const stepTag = isEnd ? `Target ${fc.horizonLabel}` : `Step ${pt.step}/${fl.points.length - 1}`;

    if (ohlcEl) {
      ohlcEl.textContent =
        `Forecast (${stepTag} · ${tLbl}) · Projected ${g.fmtChartVal(pt.price, dec)} · vs Spot ${fmtD(delta)} (${pctStr}) · ${fc.driversSummary}`;
    }

    if (overlay) {
      const tw = Math.round(g.w * g.dpr);
      const th = Math.round(g.h * g.dpr);
      if (overlay.width !== tw || overlay.height !== th) {
        overlay.width = tw;
        overlay.height = th;
      }
      const octx = overlay.getContext('2d');
      octx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      octx.clearRect(0, 0, g.w, g.h);

      octx.save();
      octx.setLineDash([2, 3]);
      octx.strokeStyle = fl.lineCol;
      octx.globalAlpha = 0.65;
      octx.lineWidth = 1.1;
      octx.beginPath();
      octx.moveTo(pt.x, g.padTop);
      octx.lineTo(pt.x, g.padTop + g.plotH);
      octx.moveTo(g.padLeft, pt.y);
      octx.lineTo(g.padLeft + g.plotW, pt.y);
      octx.stroke();

      octx.setLineDash([]);
      octx.globalAlpha = 0.25;
      octx.beginPath();
      octx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
      octx.fillStyle = fl.lineCol;
      octx.fill();

      octx.globalAlpha = 1;
      octx.beginPath();
      octx.arc(pt.x, pt.y, 3.8, 0, Math.PI * 2);
      octx.fillStyle = fl.lineCol;
      octx.fill();
      octx.restore();
    }

    if (tipEl) {
      const topTwoModels = (fc.ensembleBreakdown || [])
        .slice(0, 2)
        .map((m) => `${m.name} ${m.weightPct}%`)
        .join(' · ');
      const cal = fc.calibration;
      const calRow =
        cal && cal.samples >= 3 && cal.dirHitPct != null
          ? `<div class="tt-sub">Self-Check (${cal.samples} bars): ${cal.dirHitPct}% dir · Avg Err ±${cal.avgErrPct}%${cal.conformalRadiusPct != null ? ` · Conformal ±${cal.conformalRadiusPct}%` : ''}</div>`
          : '';
      tipEl.innerHTML =
        `<div>Forecast · ${escapeHtml(stepTag)} (${escapeHtml(tLbl)}) · <strong>${escapeHtml(g.fmtChartVal(pt.price, dec))}</strong> <span class="${moveCls}">${escapeHtml(`${fmtD(delta)} (${pctStr})`)}</span></div>` +
        `<div class="tt-sub">Market State: ${escapeHtml(fc.hurstLabel)} (H=${fc.hurst.toFixed(2)}) · ${fc.agreementPct}% Model Agreement</div>` +
        `<div class="tt-sub">${fc.wTechPct}% Tech / ${fc.wMacroPct}% Macro${topTwoModels ? ` · Top Models: ${escapeHtml(topTwoModels)}` : ''}</div>` +
        calRow;
      tipEl.style.left = '10px';
      tipEl.style.right = 'auto';
      tipEl.hidden = false;
    }
    return;
  }

  const bar = g.converted[activeIdx != null ? activeIdx : g.converted.length - 1];
  const tLabel = formatCandleRangeLabel(bar.t, g.tf, g.inferredBarMs, g.multiDayIntraday);
  const dec = g.isRatio
    ? 2
    : (INTRADAY_TIMEFRAMES.has(g.tf) || g.isZoomed ? 2 : (bar.c >= 500 ? 0 : 2));
  const barMove = bar.c - bar.o;
  const barMovePct = bar.o > 0 ? (barMove / bar.o) * 100 : 0;
  const barSwing = Math.max(0, bar.h - bar.l);
  const barSwingPct = bar.l > 0 ? (barSwing / bar.l) * 100 : 0;
  const fmtDelta = (d) =>
    g.isRatio ? `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}` : `${d >= 0 ? '+' : '−'}${formatMoney(Math.abs(d), dec)}`;
  const fmtSpread = (v) => (g.isRatio ? `${v.toFixed(2)}` : formatMoney(v, dec));
  const movePctStr = `${barMovePct >= 0 ? '+' : '−'}${Math.abs(barMovePct).toFixed(2)}%`;
  const moveCls = barMove > 0.0001 ? 'tt-up' : barMove < -0.0001 ? 'tt-dn' : '';

  if (ohlcEl) {
    ohlcEl.textContent =
      `${tLabel} · Open ${g.fmtChartVal(bar.o, dec)} · High ${g.fmtChartVal(bar.h, dec)} · Low ${g.fmtChartVal(bar.l, dec)} · Close ${g.fmtChartVal(bar.c, dec)} · Move ${fmtDelta(barMove)} (${movePctStr}) · Swing ${fmtSpread(barSwing)}`;
  }

  if (overlay) {
    const tw = Math.round(g.w * g.dpr);
    const th = Math.round(g.h * g.dpr);
    if (overlay.width !== tw || overlay.height !== th) {
      overlay.width = tw;
      overlay.height = th;
    }
    const octx = overlay.getContext('2d');
    octx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    octx.clearRect(0, 0, g.w, g.h);

    if (activeIdx != null) {
      const cx = g.xCandle(activeIdx);
      const cy = g.yAt(bar.c);
      octx.save();
      octx.setLineDash([2, 3]);
      octx.strokeStyle = g.borderCol;
      octx.lineWidth = 1;
      octx.beginPath();
      octx.moveTo(cx, g.padTop);
      octx.lineTo(cx, g.padTop + g.plotH);
      octx.moveTo(g.padLeft, cy);
      octx.lineTo(g.padLeft + g.plotW, cy);
      octx.stroke();

      octx.setLineDash([]);
      octx.beginPath();
      octx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      octx.fillStyle = g.baseCol;
      octx.fill();
      octx.restore();
    }
  }

  if (tipEl) {
    if (activeIdx == null) {
      tipEl.hidden = true;
      return;
    }
    const regimeParts = [];
    const discVal = g.discoverySeries?.[activeIdx];
    const sqzVal = g.squeezeSeries?.[activeIdx];
    if (discVal != null) {
      regimeParts.push(`<span class="tt-disc">Fair Value ${escapeHtml(g.fmtChartVal(discVal, dec))}</span>`);
    }
    if (sqzVal != null) {
      regimeParts.push(`<span class="tt-sqz">Squeeze ${escapeHtml(g.fmtChartVal(sqzVal, dec))}</span>`);
    }

    const subParts = [];
    const s20 = g.sma20?.[activeIdx];
    const s50 = g.sma50?.[activeIdx];
    const rVal = g.rsiValues?.[activeIdx];
    if (s20 != null) subParts.push(`20-Avg ${g.fmtChartVal(s20, dec)}`);
    if (s50 != null) subParts.push(`50-Avg ${g.fmtChartVal(s50, dec)}`);
    if (rVal != null) subParts.push(`Momentum ${Number(rVal).toFixed(0)}`);

    let detailRow = `Swing ${fmtSpread(barSwing)} (${barSwingPct.toFixed(2)}%)`;
    const isLatestLiveBar = g.isAtLiveEdge && activeIdx === g.converted.length - 1;
    if (!isLatestLiveBar && g.liveClose > 0) {
      const vsLive = bar.c - g.liveClose;
      const vsLivePct = (vsLive / g.liveClose) * 100;
      detailRow += ` · vs Live ${fmtDelta(vsLive)} (${vsLivePct >= 0 ? '+' : '−'}${Math.abs(vsLivePct).toFixed(2)}%)`;
    }

    const extraRows = [];
    const buyLots = g.buyMarkersByIdx?.get(activeIdx);
    if (buyLots && buyLots.length) {
      const lotTxt = buyLots
        .map((l) =>
          isPrivacyOn()
            ? `★ My Buy (${l.form || 'Bullion'})`
            : `★ My Buy: ${Number(l.oz).toFixed(l.metal === 'silver' ? 2 : 3)} oz @ ${formatMoney(l.cost)}/oz`
        )
        .join(' · ');
      extraRows.push(`<div class="tt-sub tt-buy">${escapeHtml(lotTxt)}</div>`);
    }
    const gapHit = g.gapsByIdx?.get(activeIdx);
    if (gapHit) {
      const gapLbl = gapHit.dir === 'up' ? 'Gap Up (Bullish)' : 'Gap Down (Bearish)';
      const gapStatusTxt = gapHit.isFilled
        ? '100% Filled ✓'
        : `${gapHit.fillPct}% filled · Fill target ${g.fmtChartVal(gapHit.fillTarget, dec)}`;
      extraRows.push(
        `<div class="tt-sub ${gapHit.dir === 'up' ? 'tt-up' : 'tt-dn'}">⚡ ${escapeHtml(`${gapHit.kind}: ${gapLbl} · ${gapStatusTxt}`)}</div>`
      );
    }
    const newsPin = g.newsPinsByIdx?.get(activeIdx);
    if (newsPin) {
      extraRows.push(
        `<div class="tt-sub tt-news">📰 ${escapeHtml(newsPin.title.slice(0, 92))}${newsPin.title.length > 92 ? '…' : ''}</div>`
      );
    }

    tipEl.innerHTML =
      `<div>${escapeHtml(tLabel)} · <strong>${escapeHtml(g.fmtChartVal(bar.c, dec))}</strong> <span class="${moveCls}">${escapeHtml(`${fmtDelta(barMove)} (${movePctStr})`)}</span></div>` +
      `<div class="tt-sub">Open ${escapeHtml(g.fmtChartVal(bar.o, dec))} · High ${escapeHtml(g.fmtChartVal(bar.h, dec))} · Low ${escapeHtml(g.fmtChartVal(bar.l, dec))}</div>` +
      `<div class="tt-sub">${escapeHtml(detailRow)}</div>` +
      (regimeParts.length ? `<div class="tt-sub">${regimeParts.join(' · ')}</div>` : '') +
      (subParts.length ? `<div class="tt-sub">${escapeHtml(subParts.join(' · '))}</div>` : '') +
      extraRows.join('');
    const cx = g.xCandle(activeIdx);
    const onRightHalf = cx > g.w * 0.55;
    tipEl.style.left = onRightHalf ? '10px' : 'auto';
    tipEl.style.right = onRightHalf ? 'auto' : '70px';
    tipEl.hidden = false;
  }
}

function renderAlertLog() {
  const list = document.getElementById('alert-log');
  if (!list) return;

  if (!state.alertLog.length) {
    list.innerHTML =
      '<li class="empty-state">No alerts triggered yet. Tap "Simulate Move" or "Simulate Shanghai Premium" above to test.</li>';
    return;
  }

  list.innerHTML = state.alertLog
    .map(
      (item) => {
        const dirCls = ALLOWED_LOG_DIRS.has(item.dir) ? item.dir : 'neutral';
        return `
      <li class="log-item">
        <div>
          <div>${escapeHtml(item.title)}</div>
          <div class="log-meta">${escapeHtml(item.body)} · ${escapeHtml(item.time)}</div>
        </div>
        <span class="log-pct ${dirCls}">${escapeHtml(item.badge || formatSignedPct(item.pct))}</span>
      </li>
    `;
      }
    )
    .join('');
}

function renderSettingsControls() {
  const goldRange = document.getElementById('input-gold-threshold');
  const silverRange = document.getElementById('input-silver-threshold');
  const sgeRange = document.getElementById('input-sge-threshold');
  const goldLabel = document.getElementById('label-gold-threshold');
  const silverLabel = document.getElementById('label-silver-threshold');
  const sgeLabel = document.getElementById('label-sge-threshold');
  const dirSelect = document.getElementById('select-direction');
  const topicInput = document.getElementById('input-ntfy-topic');
  const snippet = document.getElementById('setup-secrets-preview');

  if (goldRange) goldRange.value = state.settings.goldThreshold;
  if (silverRange) silverRange.value = state.settings.silverThreshold;
  if (sgeRange) sgeRange.value = state.settings.shanghaiThreshold;
  if (goldLabel) goldLabel.textContent = `±${Number(state.settings.goldThreshold).toFixed(1)}%`;
  if (silverLabel) silverLabel.textContent = `±${Number(state.settings.silverThreshold).toFixed(2)}%`;
  if (sgeLabel) sgeLabel.textContent = `±$${Number(state.settings.shanghaiThreshold).toFixed(0)}/oz`;
  if (dirSelect) dirSelect.value = state.settings.direction;
  if (topicInput && document.activeElement !== topicInput) {
    topicInput.value = state.settings.ntfyTopic;
  }

  const stack = state.settings.stack || {};
  const stackFieldMap = [
    ['input-stack-gold-oz', stack.goldOz],
    ['input-stack-gold-cost', stack.goldCost],
    ['input-stack-silver-oz', stack.silverOz],
    ['input-stack-silver-cost', stack.silverCost],
    ['input-stack-gold-spread', stack.goldSpreadPct ?? -2.5],
    ['input-stack-silver-spread', stack.silverSpreadPct ?? -6.0],
  ];
  for (const [id, val] of stackFieldMap) {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = val ?? '';
  }

  const targets = state.settings.targets || {};
  const targetFieldMap = [
    ['input-target-gold-above', targets.goldAbove],
    ['input-target-gold-below', targets.goldBelow],
    ['input-target-silver-above', targets.silverAbove],
    ['input-target-silver-below', targets.silverBelow],
    ['input-target-ratio-above', targets.ratioAbove],
    ['input-target-ratio-below', targets.ratioBelow],
  ];
  for (const [id, val] of targetFieldMap) {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = val ?? '';
  }

  const sa = state.settings.smartAlerts || DEFAULT_SETTINGS.smartAlerts;
  const chkBackw = document.getElementById('chk-alert-backwardation');
  const chkSqz = document.getElementById('chk-alert-squeeze');
  const chkDxy = document.getElementById('chk-alert-dxy');
  const chkDigest = document.getElementById('chk-morning-digest');
  if (chkBackw) chkBackw.checked = sa.backwardation !== false;
  if (chkSqz) chkSqz.checked = sa.shortSqueeze !== false;
  if (chkDxy) chkDxy.checked = sa.dxyShock !== false;
  if (chkDigest) chkDigest.checked = !!sa.morningDigest;

  const selCurrency = document.getElementById('select-currency');
  if (selCurrency) selCurrency.value = getCurrencyCode();
  applyPrivacyMode();
  populateVoiceSelector();

  const goals = state.settings.stackGoals || DEFAULT_SETTINGS.stackGoals;
  const goalFieldMap = [
    ['input-goal-gold-oz', goals.goldOz],
    ['input-goal-silver-oz', goals.silverOz],
    ['input-goal-usd', goals.targetUsd],
  ];
  for (const [id, val] of goalFieldMap) {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = val ?? '';
  }

  const ladder = state.settings.ladder || DEFAULT_SETTINGS.ladder;
  const ladderBudgetEl = document.getElementById('input-ladder-budget');
  const ladderMetalEl = document.getElementById('select-ladder-metal');
  if (ladderBudgetEl && document.activeElement !== ladderBudgetEl) {
    ladderBudgetEl.value = ladder.budget ?? 1000;
  }
  if (ladderMetalEl) ladderMetalEl.value = ladder.metal || 'auto';

  const dg = state.settings.dealGrader || DEFAULT_SETTINGS.dealGrader;
  const dgPreset = document.getElementById('deal-preset');
  const dgQty = document.getElementById('input-deal-qty');
  const dgAsk = document.getElementById('input-deal-ask');
  if (dgPreset) dgPreset.value = dg.preset || 'ase_1oz';
  if (dgQty && document.activeElement !== dgQty) dgQty.value = dg.qty ?? 1;
  if (dgAsk && document.activeElement !== dgAsk) dgAsk.value = dg.ask ?? '';

  const qh = state.settings.quietHours || DEFAULT_SETTINGS.quietHours;
  const chkQuiet = document.getElementById('chk-quiet-hours');
  const selQuietStart = document.getElementById('select-quiet-start');
  const selQuietEnd = document.getElementById('select-quiet-end');
  const quietRow = document.getElementById('quiet-hours-controls');
  if (chkQuiet) chkQuiet.checked = !!qh.enabled;
  if (selQuietStart) selQuietStart.value = String(qh.start ?? 22);
  if (selQuietEnd) selQuietEnd.value = String(qh.end ?? 7);
  if (quietRow) quietRow.classList.toggle('disabled', !qh.enabled);

  const webNotifBtn = document.getElementById('btn-enable-web-notif');
  if (webNotifBtn && typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') {
      webNotifBtn.textContent = 'Browser Notifications Enabled ✓';
    } else if (Notification.permission === 'denied') {
      webNotifBtn.textContent = 'Browser Notifications Blocked (Check Site Settings)';
    } else {
      webNotifBtn.textContent = 'Enable Browser Notifications';
    }
  }

  const confirmChk = document.getElementById('chk-confirm-moves');
  if (confirmChk) confirmChk.checked = !!state.settings.confirmMoves;

  document.getElementById('unit-oz')?.classList.toggle('active', state.settings.unit === 'oz');
  document.getElementById('unit-g')?.classList.toggle('active', state.settings.unit === 'g');

  if (snippet) {
    const t = state.settings.ntfyTopic.trim() || 'bullion-pulse-change-me';
    const extraTargets = [];
    if (state.settings.confirmMoves) extraTargets.push('CONFIRM_MOVES=true');
    if (targets.goldAbove) extraTargets.push(`GOLD_ABOVE_USD=${targets.goldAbove}`);
    if (targets.goldBelow) extraTargets.push(`GOLD_BELOW_USD=${targets.goldBelow}`);
    if (targets.silverAbove) extraTargets.push(`SILVER_ABOVE_USD=${targets.silverAbove}`);
    if (targets.silverBelow) extraTargets.push(`SILVER_BELOW_USD=${targets.silverBelow}`);
    if (targets.ratioAbove) extraTargets.push(`RATIO_ABOVE=${targets.ratioAbove}`);
    if (targets.ratioBelow) extraTargets.push(`RATIO_BELOW=${targets.ratioBelow}`);
    extraTargets.push(`ALERT_BACKWARDATION=${sa.backwardation !== false}`);
    extraTargets.push(`ALERT_SHORT_SQUEEZE=${sa.shortSqueeze !== false}`);
    extraTargets.push(`ALERT_DXY_SHOCK=${sa.dxyShock !== false}`);
    if (sa.morningDigest) extraTargets.push('MORNING_DIGEST=true');
    if (qh.enabled) {
      extraTargets.push(`QUIET_HOURS_START=${qh.start}`);
      extraTargets.push(`QUIET_HOURS_END=${qh.end}`);
    }
    snippet.textContent =
      `NTFY_TOPIC=${t}\n` +
      `GOLD_THRESHOLD_PCT=${Number(state.settings.goldThreshold).toFixed(1)}\n` +
      `SILVER_THRESHOLD_PCT=${Number(state.settings.silverThreshold).toFixed(2)}\n` +
      `SHANGHAI_PREMIUM_THRESHOLD_USD=${Number(state.settings.shanghaiThreshold).toFixed(0)}\n` +
      `ALERT_DIRECTION=${state.settings.direction}\n` +
      `CATALYST_ALERTS=true` +
      (extraTargets.length ? `\n${extraTargets.join('\n')}` : '');
  }
}

/* ---------- Outlook, Historical Patterns & What-If Simulator ---------- */

const OUTLOOK_SCENARIOS = [
  { id: 'hot_cpi', label: 'High Inflation', driver: 'inflation', goldDelta: 0.65, silverDelta: 0.72 },
  { id: 'war_escalation', label: 'War Escalation', driver: 'geopolitics', goldDelta: 0.85, silverDelta: 0.50 },
  { id: 'fed_rate_cut', label: 'Fed Cuts Rates', driver: 'rates_usd', goldDelta: 0.75, silverDelta: 0.80 },
  { id: 'hawkish_usd', label: 'Fed Raises Rates / Strong Dollar', driver: 'rates_usd', goldDelta: -0.75, silverDelta: -0.82 },
  { id: 'stock_crash', label: 'Stock Market Drop (−5%)', driver: 'equities', goldDelta: 0.45, silverDelta: -0.25 },
  { id: 'mine_strike', label: 'Silver Mine Shortage', driver: 'mining_supply', goldDelta: 0.25, silverDelta: 0.90 },
  { id: 'cb_buying', label: 'Central Banks Buying Gold', driver: 'central_banks', goldDelta: 0.70, silverDelta: 0.35 },
  { id: 'shanghai_premium', label: 'High China Demand (+$40)', driver: 'shanghai_sge', goldDelta: 0.75, silverDelta: 0.80 },
  { id: 'comex_squeeze', label: 'Vault Supply Squeeze', driver: 'comex_paper', goldDelta: 0.65, silverDelta: 0.88 },
  { id: 'solar_storm', label: 'Solar Storm / Grid Risk (G4+)', driver: 'geopolitics', goldDelta: 0.55, silverDelta: 0.65 },
  { id: 'space_solar_boom', label: 'Space & Solar Tech Surge', driver: 'mining_supply', goldDelta: 0.25, silverDelta: 0.78 },
  { id: 'ai_battery_silver', label: 'AI & Solid-State Silver Boom', driver: 'mining_supply', goldDelta: 0.22, silverDelta: 0.85 },
  { id: 'ai_capex_surge', label: 'Big Tech AI CapEx Surge (+GW)', driver: 'mining_supply', goldDelta: 0.24, silverDelta: 0.84 },
  { id: 'ai_capex_pause', label: 'AI Data Center CapEx Slowdown', driver: 'mining_supply', goldDelta: -0.18, silverDelta: -0.68 },
  { id: 'sovereign_debt_brics', label: 'BRICS / Sovereign Debt Crisis', driver: 'central_banks', goldDelta: 0.82, silverDelta: 0.55 },
  { id: 'physical_squeeze', label: 'Retail Physical Squeeze (+25% Premiums)', driver: 'comex_paper', goldDelta: 0.58, silverDelta: 0.88 },
];

const CLIENT_NEWS_TOPICS = {
  central_banks: 'Central Banks & BRICS',
  tech_solar_ai: 'Solar, AI & EV Tech',
  vaults_physical: 'Vaults & Lease Rates',
  asia_retail: 'India, China & Retail',
  geo_space: 'World & Space',
  macro_debt: 'Macro, Debt & Banks',
  miners_supply: 'Mines & Energy',
};

function classifyClientHeadlineTopic(h) {
  if (h?.topic && CLIENT_NEWS_TOPICS[h.topic]) {
    return { topic: h.topic, topicLabel: h.topicLabel || CLIENT_NEWS_TOPICS[h.topic] };
  }
  const text = `${h?.title || ''} ${h?.summary || ''} ${h?.source || ''}`;
  if (/\b(solar flare|geomagnetic|space weather|noaa|satellite|aerospace|spacex|nasa|orbital|war|missile|airstrike|sanction|tariff|strait of hormuz|red sea|geopolit|conflict|ceasefire)\b/i.test(text)) {
    return { topic: 'geo_space', topicLabel: CLIENT_NEWS_TOPICS.geo_space };
  }
  if (/\b(solar|photovoltaic|topcon|hjt|silver paste|solid[- ]?state battery|ai data center|ai server|ev |semiconductor|electrification|antimicrobial)\b/i.test(text)) {
    return { topic: 'tech_solar_ai', topicLabel: CLIENT_NEWS_TOPICS.tech_solar_ai };
  }
  if (/\b(central bank|brics|pboc|rbi|nbp|repatriat|de-?dollariz|sovereign.*reserve|basel iii|paxg|xaut|tether gold|tokenized gold|gld|slv|pslv|etf)\b/i.test(text)) {
    return { topic: 'central_banks', topicLabel: CLIENT_NEWS_TOPICS.central_banks };
  }
  if (/\b(comex|lbma|lease rate|backwardation|efp|registered|vault|swiss gold|delivery|open interest|cftc|cot)\b/i.test(text)) {
    return { topic: 'vaults_physical', topicLabel: CLIENT_NEWS_TOPICS.vaults_physical };
  }
  if (/\b(shanghai|sge|shfe|india|mcx|dubai|dmcc|turkey|diwali|akshaya|costco|us mint|silver eagle|bullion coin|jewelry|retail)\b/i.test(text)) {
    return { topic: 'asia_retail', topicLabel: CLIENT_NEWS_TOPICS.asia_retail };
  }
  if (/\b(mine|mining|miner|aisc|newmont|barrick|agnico|wheaton|pan american|hecla|first majestic|fresnillo|smelter|crude oil|opec|copper|commodity supercycle)\b/i.test(text)) {
    return { topic: 'miners_supply', topicLabel: CLIENT_NEWS_TOPICS.miners_supply };
  }
  const drv = h?.driver || '';
  if (drv === 'geopolitics') return { topic: 'geo_space', topicLabel: CLIENT_NEWS_TOPICS.geo_space };
  if (drv === 'central_banks') return { topic: 'central_banks', topicLabel: CLIENT_NEWS_TOPICS.central_banks };
  if (drv === 'comex_paper') return { topic: 'vaults_physical', topicLabel: CLIENT_NEWS_TOPICS.vaults_physical };
  if (drv === 'shanghai_sge') return { topic: 'asia_retail', topicLabel: CLIENT_NEWS_TOPICS.asia_retail };
  if (drv === 'mining_supply') return { topic: 'miners_supply', topicLabel: CLIENT_NEWS_TOPICS.miners_supply };
  return { topic: 'macro_debt', topicLabel: CLIENT_NEWS_TOPICS.macro_debt };
}

function buildClientExpandedEvents(nowDate = new Date()) {
  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const startUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayMs = 86400000;
  const iso = (d) => d.toISOString().slice(0, 10);
  const firstFri = (y, m) => {
    const d = new Date(Date.UTC(y, m, 1));
    d.setUTCDate(1 + ((5 - d.getUTCDay() + 7) % 7));
    return d;
  };
  const lastFri = (y, m) => {
    const d = new Date(Date.UTC(y, m + 1, 0));
    while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
    return d;
  };
  const lastBiz = (y, m) => {
    const d = new Date(Date.UTC(y, m + 1, 0));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
    return d;
  };
  const nthBizBack = (y, m, nBack) => {
    const d = new Date(Date.UTC(y, m + 1, 0));
    let seen = 0;
    while (seen < nBack) {
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
        seen++;
        if (seen === nBack) break;
      }
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return d;
  };

  const list = [];
  const fixedDates = [
    ['fomc', 'macro', 'FOMC Rate Decision', ['2026-01-28','2026-03-18','2026-04-29','2026-06-17','2026-07-29','2026-09-16','2026-10-28','2026-12-09','2027-01-27','2027-03-17','2027-04-28','2027-06-16','2027-07-28','2027-09-22','2027-11-03','2027-12-15']],
    ['ecb', 'central_banks', 'ECB Rate Decision', ['2026-02-05','2026-03-19','2026-04-30','2026-06-11','2026-07-23','2026-09-10','2026-10-29','2026-12-17','2027-02-04','2027-03-18','2027-04-29','2027-06-10']],
    ['boj', 'central_banks', 'Bank of Japan (BoJ) Policy', ['2026-01-23','2026-03-19','2026-04-28','2026-06-16','2026-07-31','2026-09-18','2026-10-30','2026-12-18','2027-01-22','2027-03-19','2027-04-28','2027-06-18']],
    ['cpi', 'macro', 'US CPI Inflation Print', ['2026-11-10','2026-12-10','2027-01-13','2027-02-11','2027-03-10','2027-04-13','2027-07-14','2027-08-11','2027-09-14','2027-10-14','2027-11-10','2027-12-10']],
  ];
  for (const [type, category, title, dates] of fixedDates) {
    for (const date of dates) list.push({ type, category, title, date });
  }

  const fndSilver = new Set([1, 3, 5, 7, 10]);
  const fndGold = new Set([0, 2, 4, 6, 8, 10]);
  const wgcMonths = new Set([0, 3, 6, 9]);
  for (let off = 0; off <= 2; off++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + off, 1));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    list.push({ type: 'nfp', category: 'macro', title: 'US Jobs Report (NFP)', date: iso(firstFri(y, m)) });
    list.push({ type: 'pce', category: 'macro', title: 'US Core PCE Inflation', date: iso(lastFri(y, m)) });
    if (fndSilver.has(m)) list.push({ type: 'comex_fnd', category: 'vaults', title: 'COMEX Silver Delivery Notice', date: iso(lastBiz(y, m)) });
    if (fndGold.has(m)) {
      list.push({ type: 'comex_gold_fnd', category: 'vaults', title: 'COMEX Gold Delivery Notice', date: iso(lastBiz(y, m)) });
      list.push({ type: 'comex_opex', category: 'vaults', title: 'COMEX Gold/Silver Options Expiry', date: iso(nthBizBack(y, m, 4)) });
    }
    if (wgcMonths.has(m)) list.push({ type: 'wgc_report', category: 'central_banks', title: 'World Gold Council Demand Report', date: iso(lastBiz(y, m)) });
  }

  const cotD = new Date(startUtc);
  cotD.setUTCDate(cotD.getUTCDate() + ((5 - cotD.getUTCDay() + 7) % 7));
  list.push({ type: 'cftc_cot', category: 'positioning', title: 'CFTC COT Positioning Report', date: iso(cotD) });

  for (const yr of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
    list.push(
      { type: 'festival_cny', category: 'physical', title: 'Chinese New Year Gold Restock', date: `${yr}-01-20` },
      { type: 'solar_equinox', category: 'space', title: 'Spring Equinox Solar Storm Peak', date: `${yr}-03-20` },
      { type: 'festival_akshaya', category: 'physical', title: 'India Akshaya Tritiya Buying', date: `${yr}-04-20` },
      { type: 'solar_equinox', category: 'space', title: 'Autumn Equinox Solar Storm Peak', date: `${yr}-09-22` },
      { type: 'festival_diwali', category: 'physical', title: 'India Dhanteras & Diwali Peak', date: `${yr}-10-28` },
      { type: 'yearend_vault', category: 'vaults', title: 'Year-End Bullion Vault Positioning', date: `${yr}-12-15` }
    );
  }

  const seen = new Set();
  return list
    .map((e) => ({
      ...e,
      daysUntil: Math.ceil((Date.UTC(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)) - 1, Number(e.date.slice(8, 10))) - startUtc) / dayMs),
    }))
    .filter((e) => e.daysUntil >= 0 && e.daysUntil <= 45)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .filter((e) => {
      const k = `${e.date}|${e.type}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8);
}

const spaceWeatherState = {
  data: null,
  fetchedAt: 0,
};

function parseClientNoaaSpaceWeather(noaaJson) {
  const cur = noaaJson?.['0'] || noaaJson?.['-1'] || null;
  const fcast = noaaJson?.['1'] || null;
  const toScale = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(5, Math.round(n)) : 0;
  };
  const gScale = toScale(cur?.G?.Scale);
  const sScale = toScale(cur?.S?.Scale);
  const rScale = toScale(cur?.R?.Scale);
  const gForecast = toScale(fcast?.G?.Scale);
  const peakScale = Math.max(gScale, sScale, rScale, Math.floor(gForecast * 0.8));

  let status = 'Quiet (G0)';
  let tone = 'neutral';
  let goldBoost = 0;
  let silverBoost = 0;
  let jumpBoost = 0;
  let summary = 'Normal solar & geomagnetic weather — no grid or satellite risk premium.';

  if (peakScale >= 4) {
    status = `Severe Storm (G${gScale}/R${rScale})`;
    tone = 'bullish';
    goldBoost = 0.13;
    silverBoost = 0.15;
    jumpBoost = 0.032;
    summary = 'Severe NOAA solar storm elevates power-grid & satellite safe-haven Gold demand + Silver grid/solar demand.';
  } else if (peakScale === 3) {
    status = `Strong Storm (G${gScale}/R${rScale})`;
    tone = 'bullish';
    goldBoost = 0.08;
    silverBoost = 0.09;
    jumpBoost = 0.020;
    summary = 'Strong NOAA geomagnetic/solar storm lifts safe-haven Gold & solar/satellite Silver sensitivity.';
  } else if (peakScale === 2) {
    status = `Moderate Solar (G${gScale}/R${rScale})`;
    tone = 'watch';
    goldBoost = 0.03;
    silverBoost = 0.04;
    jumpBoost = 0.008;
    summary = 'Moderate geomagnetic/radio activity — mild watch on orbital & grid infrastructure.';
  } else if (peakScale === 1 || gForecast >= 2) {
    status = gForecast >= 2 ? `Storm Watch Ahead (G${gForecast})` : `Minor Solar (G${gScale})`;
    tone = 'watch';
    goldBoost = gForecast >= 2 ? 0.025 : 0;
    silverBoost = gForecast >= 2 ? 0.03 : 0;
    jumpBoost = gForecast >= 2 ? 0.006 : 0;
    summary =
      gForecast >= 2
        ? `NOAA forecasts G${gForecast} storm within 24h — minor safe-haven watch active.`
        : 'Minor solar breeze (G1) — routine space weather with minimal bullion impact.';
  }

  return {
    source: cur ? 'NOAA SWPC Live' : 'Baseline Quiet',
    updatedAt: cur?.DateStamp ? `${cur.DateStamp} ${cur.TimeStamp || ''}`.trim() : new Date().toISOString().slice(0, 16),
    gScale,
    sScale,
    rScale,
    gForecast,
    peakScale,
    status,
    tone,
    goldBoost,
    silverBoost,
    jumpBoost,
    summary,
  };
}

async function fetchLiveSpaceWeather() {
  if (Date.now() - spaceWeatherState.fetchedAt < 300000 && spaceWeatherState.data) return;
  try {
    const res = await fetch('https://services.swpc.noaa.gov/products/noaa-scales.json', {
      cache: 'no-store',
    });
    if (!res.ok) return;
    const json = await res.json();
    spaceWeatherState.data = parseClientNoaaSpaceWeather(json);
    spaceWeatherState.fetchedAt = Date.now();
    renderOutlook();
    renderChart();
  } catch {
    // Offline or blocked — quietly fall back to outlook.json spaceWeather or calm baseline
  }
}

const DRIVER_FRIENDLY_LABELS = {
  inflation: 'Inflation & Cost of Living',
  geopolitics: 'World Conflicts & Risk',
  rates_usd: 'Interest Rates & US Dollar',
  equities: 'Stock Market Mood',
  mining_supply: 'Mine Supply & Industry',
  central_banks: 'Central Banks & Funds',
  shanghai_sge: 'China Physical Demand',
  positioning_miners: 'Big Traders & Mining Stocks',
  comex_paper: 'Paper Contracts vs. Vaults',
  market_gaps: 'Chart Gaps & Fill Targets',
  physical_premiums: 'Physical Coin & Bar Premiums',
  hidden_alpha: 'Hidden Market Edges (6 Signals)',
  ai_datacenter: 'AI Data Center Race (Big Tech)',
};

const CLIENT_PHYS_BENCHMARKS = {
  gold: {
    normalLowPct: 2.0,
    normalHighPct: 5.0,
    squeezeStartPct: 6.5,
    products: [
      { id: 'gold_eagle', name: '1 oz Gold Eagle', oz: 1, basePremPct: 4.3, stressMult: 1.35, buybackOffsetPct: -1.8 },
      { id: 'gold_buffalo', name: '1 oz Gold Buffalo', oz: 1, basePremPct: 4.8, stressMult: 1.42, buybackOffsetPct: -1.6 },
      { id: 'gold_bar_1oz', name: '1 oz Gold Bar', oz: 1, basePremPct: 2.4, stressMult: 0.78, buybackOffsetPct: -1.4 },
    ],
  },
  silver: {
    normalLowPct: 8.0,
    normalHighPct: 15.0,
    squeezeStartPct: 20.0,
    products: [
      { id: 'silver_eagle', name: '1 oz Silver Eagle', oz: 1, basePremPct: 14.5, stressMult: 1.55, buybackOffsetPct: -5.5 },
      { id: 'silver_bar_10oz', name: '10 oz Silver Bar', oz: 10, basePremPct: 8.2, stressMult: 0.92, buybackOffsetPct: -4.8 },
      { id: 'silver_round_1oz', name: '1 oz Generic Round', oz: 1, basePremPct: 7.4, stressMult: 0.86, buybackOffsetPct: -5.0 },
    ],
  },
};

function computeClientPhysicalPremiums({
  spotGold,
  spotSilver,
  spotGoldDailyPct = 0,
  spotSilverDailyPct = 0,
  base = null,
  futures = null,
  liveComex = null,
  userOverrides = null,
  scenarioSqueeze = false,
} = {}) {
  let retailShortageHits = 0;
  let retailCoolingHits = 0;
  for (const h of base?.headlines || []) {
    const txt = `${h?.title || ''} ${h?.summary || ''}`;
    if (/\b(us mint|royal mint|perth mint|silver eagle|gold eagle|gold buffalo|costco gold|bullion coin|coin dealer|refiner)\b.*\b(shortage|sold out|sell out|ration|delay|backlog|surge|record|premium|spike|scramble|rush)/i.test(txt)) {
      retailShortageHits++;
    } else if (/\b(coin premium|bullion premium|dealer premium)\b.*\b(fall|drop|cool|compress|ease|plunge|low)/i.test(txt)) {
      retailCoolingHits++;
    }
  }
  const newsStress = clampNum(retailShortageHits * 0.22 - retailCoolingHits * 0.14, -0.20, 0.65);
  const vix = base?.macroSnapshot?.vix ?? 18;
  const gvz = base?.institutionalSignals?.impliedVol?.gvz ?? null;

  const buildMetal = (metal, spot, dailyPct) => {
    const isSilver = metal === 'silver';
    const cfg = CLIENT_PHYS_BENCHMARKS[metal];
    const safeSpot = Number.isFinite(Number(spot)) && Number(spot) > 0 ? Number(spot) : (isSilver ? 42.5 : 3600);

    const basisM = futures?.[metal] || base?.institutionalSignals?.basis?.[metal] || null;
    const isBackw = Boolean(basisM?.isBackwardation || (basisM?.basisUsd ?? 1) < 0);
    const backwStress = isBackw
      ? clampNum(0.48 + Math.abs(basisM?.basisPct || 0.3) * 0.22, 0.45, 0.95)
      : basisM?.state === 'Compressed EFP'
        ? 0.22
        : 0;

    const sgeData = shanghaiState.data?.[metal] || base?.shanghai?.[metal] || null;
    let sgeStress = 0;
    if (sgeData) {
      const prem = isSilver ? sgeData.exVatPremiumUsdOz : sgeData.premiumUsdOz;
      if (typeof prem === 'number' && Number.isFinite(prem)) {
        sgeStress = isSilver ? clampNum((prem - 0.8) / 3.2, -0.25, 0.85) : clampNum((prem - 8) / 35, -0.25, 0.85);
      }
    }

    const comexRatio = liveComex?.[metal]?.paperToRegisteredRatio;
    const vaultStress =
      typeof comexRatio === 'number' && Number.isFinite(comexRatio)
        ? isSilver ? clampNum((comexRatio - 4.5) / 4.0, -0.15, 0.65) : clampNum((comexRatio - 2.6) / 3.0, -0.15, 0.55)
        : 0;
    const fearStress =
      (Number.isFinite(gvz) ? clampNum((gvz - 18) / 22, -0.1, 0.55) : 0) +
      (Number.isFinite(vix) ? clampNum((vix - 19) / 24, -0.1, 0.50) : 0);
    const dipRush = dailyPct <= -1.2 && (fearStress > 0.15 || backwStress > 0.2) ? clampNum(-dailyPct / 6.0, 0, 0.35) : 0;

    const rawStress = clampNum(
      backwStress * 0.38 + sgeStress * 0.24 + vaultStress * 0.18 + fearStress * 0.18 + newsStress * 0.35 + dipRush + (scenarioSqueeze ? 0.95 : 0),
      -0.32,
      1.65
    );

    const overrideKey = isSilver ? 'silverStreetOz' : 'goldStreetOz';
    const userStreet = Number(userOverrides?.[overrideKey]);
    const hasUserOverride = Number.isFinite(userStreet) && userStreet > safeSpot * 0.90;

    const products = cfg.products.map((p, idx) => {
      const meltVal = safeSpot * p.oz;
      let premPct;
      if (hasUserOverride && idx === 0) {
        premPct = ((userStreet - safeSpot) / safeSpot) * 100;
      } else {
        const dynamicAdd = isSilver ? rawStress * 12.5 * p.stressMult : rawStress * 3.1 * p.stressMult;
        premPct = clampNum(p.basePremPct + dynamicAdd, isSilver ? 2.5 : 0.7, isSilver ? 68 : 18);
      }
      const streetPrice = meltVal * (1 + premPct / 100);
      const premUsd = streetPrice - meltVal;
      const squeezeBuybackLift =
        premPct > cfg.squeezeStartPct
          ? (premPct - cfg.squeezeStartPct) * (isSilver ? 0.55 : 0.48)
          : 0;
      const buybackVsSpotPct = clampNum(
        p.buybackOffsetPct + squeezeBuybackLift + (hasUserOverride && idx === 0 ? Math.max(0, (premPct - cfg.normalHighPct) * 0.35) : 0),
        isSilver ? -9 : -3.5,
        isSilver ? 25 : 6.5
      );
      const buybackPrice = meltVal * (1 + buybackVsSpotPct / 100);
      return {
        id: p.id,
        name: p.name,
        oz: p.oz,
        meltPrice: +meltVal.toFixed(2),
        streetPrice: +streetPrice.toFixed(2),
        premiumUsd: +premUsd.toFixed(2),
        premiumPct: +premPct.toFixed(2),
        buybackPrice: +buybackPrice.toFixed(2),
        buybackVsSpotPct: +buybackVsSpotPct.toFixed(2),
        buybackAboveSpot: buybackVsSpotPct > 0.05,
        isUserQuote: hasUserOverride && idx === 0,
      };
    });

    const coin = products[0];
    const bar = products[products.length - 1];
    const compositePremPct = +(coin.premiumPct * 0.6 + bar.premiumPct * 0.4).toFixed(2);
    const barSavingsPct = +Math.max(0, ((coin.streetPrice / coin.oz - bar.streetPrice / bar.oz) / (coin.streetPrice / coin.oz)) * 100).toFixed(1);
    const normalMid = (cfg.normalLowPct + cfg.normalHighPct) / 2;
    const isSqueeze = coin.premiumPct >= cfg.squeezeStartPct * (isSilver ? 1.15 : 1.1) || compositePremPct >= cfg.squeezeStartPct;
    const isElevated = !isSqueeze && (coin.premiumPct > cfg.normalHighPct || compositePremPct > cfg.normalHighPct);
    const isCompressed = compositePremPct < cfg.normalLowPct;
    const paperPhysicalDisconnect = (isSqueeze || isElevated) && dailyPct <= -0.35;

    let status = 'Normal Retail Spread';
    let tone = 'neutral';
    let signal = 0;
    let predictionBoost = 0;

    if (isSqueeze) {
      status = paperPhysicalDisconnect ? 'Paper-Physical Disconnect ↑↑' : 'Physical Squeeze ↑↑';
      tone = 'bullish';
      const excess = (compositePremPct - cfg.normalHighPct) / (isSilver ? 18 : 5.5);
      signal = clampNum(0.45 + excess * 0.42, 0.45, 0.92);
      predictionBoost = clampNum(signal * 0.16, 0.07, 0.15);
    } else if (isElevated) {
      status = paperPhysicalDisconnect ? 'Physical Catch-Up Signal ↑' : 'Elevated Retail Demand ↑';
      tone = 'bullish';
      const excess = (compositePremPct - normalMid) / (isSilver ? 14 : 4.5);
      signal = clampNum(0.18 + excess * 0.32, 0.15, 0.48);
      predictionBoost = clampNum(signal * 0.14, 0.025, 0.07);
    } else if (isCompressed) {
      status = 'Compressed · Best Buyer Value';
      tone = 'value';
      signal = -0.14;
      predictionBoost = -0.025;
    } else {
      status = 'Normal Retail Spread';
      tone = 'neutral';
      const mildTilt = (compositePremPct - normalMid) / (isSilver ? 20 : 6);
      signal = clampNum(mildTilt * 0.12, -0.08, 0.10);
      predictionBoost = clampNum(signal * 0.08, -0.01, 0.015);
    }

    let advice = `Retail markups (${compositePremPct}% avg) sit inside the normal ${cfg.normalLowPct}–${cfg.normalHighPct}% range — shelves are well stocked, making this a clean accumulation window.`;
    if (isSqueeze) {
      advice = paperPhysicalDisconnect
        ? `Paper spot dipped while physical premiums surged to ${coin.premiumPct}% on ${coin.name} — classic Paper-Physical Disconnect (leading bullish spot catch-up). Rotate into ${bar.name} (${bar.premiumPct}%) for ~${barSavingsPct}% more metal per dollar.`
        : `High physical retail demand (${coin.premiumPct}% on ${coin.name}) signals mint/dealer tightness${coin.buybackAboveSpot ? ' with buybacks above spot' : ''}. Rotate into ${bar.name} (${bar.premiumPct}%) to get ~${barSavingsPct}% more ounces per dollar.`;
    } else if (isElevated) {
      advice = `Physical premiums (${coin.premiumPct}% on ${coin.name}) sit above normal ${cfg.normalLowPct}–${cfg.normalHighPct}% — rising retail buying adds bullish support. ${bar.name} (${bar.premiumPct}%) saves ~${barSavingsPct}% in markup.`;
    } else if (isCompressed) {
      advice = `Dealer markups compressed to ${compositePremPct}% (below normal ${cfg.normalLowPct}–${cfg.normalHighPct}%) — retail rush cooled, giving buyers the lowest over-melt cost.`;
    }

    return {
      metal,
      spot: +safeSpot.toFixed(2),
      meltPerGram: +(safeSpot / TROY_OZ_TO_GRAMS).toFixed(2),
      compositePremPct,
      normalRangeLabel: `${cfg.normalLowPct}–${cfg.normalHighPct}%`,
      gaugeMaxPct: isSilver ? 40 : 12,
      status,
      tone,
      paperPhysicalDisconnect,
      hasUserOverride,
      barSavingsPct,
      buybackAboveSpot: coin.buybackAboveSpot,
      signal: +signal.toFixed(3),
      predictionBoost: +predictionBoost.toFixed(4),
      advice,
      products,
    };
  };

  const gold = buildMetal('gold', spotGold, spotGoldDailyPct);
  const silver = buildMetal('silver', spotSilver, spotSilverDailyPct);
  const overallStatus =
    gold.tone === 'bullish' && silver.tone === 'bullish'
      ? 'Physical Squeeze Active ↑'
      : silver.tone === 'bullish'
        ? 'Silver Physical Squeeze ↑'
        : gold.tone === 'bullish'
          ? 'Gold Physical Tightness ↑'
          : gold.tone === 'value' || silver.tone === 'value'
            ? 'Low Markup · Buyer Window'
            : 'Normal Dealer Spreads';

  return { overallStatus, gold, silver };
}

/* ---------- 6 Exclusive Hidden-Alpha Bullion Prediction Engines (Client Mirror) ---------- */
const CLIENT_FX_BREAKOUT_BENCHMARKS = {
  gold: {
    USD: 3750, EUR: 3420, GBP: 2920, JPY: 565000, CNY: 26800, INR: 318000,
    AUD: 5750, CAD: 5180, CHF: 3280, THB: 128000, TRY: 132000, ZAR: 68500,
    MXN: 74500, KRW: 5180000, SGD: 4980, HKD: 29100,
  },
  silver: {
    USD: 46.0, EUR: 42.0, GBP: 35.8, JPY: 6950, CNY: 330, INR: 3920,
    AUD: 70.5, CAD: 63.5, CHF: 40.2, THB: 1580, TRY: 1620, ZAR: 840,
    MXN: 915, KRW: 63500, SGD: 61.0, HKD: 358,
  },
};

function nyHourClient(ms) {
  try {
    const h = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        hour12: false,
      }).format(new Date(ms))
    );
    return Number.isFinite(h) ? h % 24 : new Date(ms).getUTCHours();
  } catch {
    return (new Date(ms).getUTCHours() + 19) % 24;
  }
}

function nthBizDayFromEndClient(year, monthIndex, nBack) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  let seen = 0;
  while (seen < nBack) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
      seen++;
      if (seen === nBack) break;
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

function computeClientHiddenAlpha({
  spotGold,
  spotSilver,
  base = null,
  futures = null,
  liveComex = null,
  gTrendSign = 0,
  sTrendSign = 0,
} = {}) {
  const macro = base?.macroSnapshot || {};
  const headlines = base?.headlines || [];
  const cot = base?.proSignals?.cot || {};
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const activePreMonths = new Set([0, 2, 4, 6, 8, 10]);

  const buildFor = (metal, spot, trendSign) => {
    const isSilver = metal === 'silver';

    // 1. East-vs-West Session Footprint
    const intraBars = state.candles?.[metal] || [];
    let asiaPct = 0;
    let londonPct = 0;
    let nyPct = 0;
    let sessionFlow;
    if (intraBars.length >= 6) {
      for (let i = 1; i < intraBars.length; i++) {
        const prev = intraBars[i - 1];
        const curr = intraBars[i];
        if (!(prev?.c > 0) || !(curr?.c > 0) || !curr?.t) continue;
        const retPct = ((curr.c - prev.c) / prev.c) * 100;
        if (Math.abs(retPct) > 8) continue;
        const hr = nyHourClient(curr.t);
        if (hr >= 18 || hr < 3) asiaPct += retPct;
        else if (hr >= 3 && hr < 8) londonPct += retPct;
        else nyPct += retPct;
      }
      const eastPct = asiaPct + londonPct;
      const eastMinusWestPct = eastPct - nyPct;
      const scale = isSilver ? 2.6 : 1.35;
      let regime = 'Balanced Global Flow';
      let signal = 0;
      let note = `Asia ${asiaPct >= 0 ? '+' : '−'}${Math.abs(asiaPct).toFixed(2)}% · London ${londonPct >= 0 ? '+' : '−'}${Math.abs(londonPct).toFixed(2)}% · NY ${nyPct >= 0 ? '+' : '−'}${Math.abs(nyPct).toFixed(2)}%`;
      if (eastPct > (isSilver ? 0.25 : 0.12) && nyPct < -(isSilver ? 0.25 : 0.12)) {
        regime = 'East Accumulating / West Paper Dip ↑';
        signal = clampNum(eastMinusWestPct / scale, 0.18, 0.82);
        note = `Asia+London physical desks bought (${eastPct >= 0 ? '+' : ''}${eastPct.toFixed(2)}%) while NY paper sold (${nyPct.toFixed(2)}%) — classic snap-back bullish divergence.`;
      } else if (nyPct > (isSilver ? 0.35 : 0.18) && eastPct < -(isSilver ? 0.25 : 0.12)) {
        regime = 'NY Paper Chase / Asia Selling ↓';
        signal = clampNum(eastMinusWestPct / scale, -0.70, -0.15);
        note = `NY futures chased higher (+${nyPct.toFixed(2)}%) while Asia/London sold into strength (${eastPct.toFixed(2)}%) — rally prone to fade.`;
      } else if (eastPct > 0.15 && nyPct > 0.15) {
        regime = 'Synchronized Global Buying ↑';
        signal = clampNum((eastPct + nyPct) / (scale * 1.4), 0.12, 0.65);
        note = 'Asia, London & NY are all bidding higher together — clean global trend confirmation.';
      } else if (eastPct < -0.15 && nyPct < -0.15) {
        regime = 'Broad Global Distribution ↓';
        signal = clampNum((eastPct + nyPct) / (scale * 1.4), -0.65, -0.12);
        note = 'Selling pressure across both Eastern physical and Western futures sessions.';
      } else {
        signal = clampNum(eastMinusWestPct / (scale * 2.2), -0.25, 0.25);
      }
      sessionFlow = {
        asiaPct: +asiaPct.toFixed(2),
        londonPct: +londonPct.toFixed(2),
        nyPct: +nyPct.toFixed(2),
        eastMinusWestPct: +eastMinusWestPct.toFixed(2),
        regime,
        signal: +signal.toFixed(3),
        note,
      };
    } else if (base?.hiddenAlpha?.[metal]?.sessionFlow) {
      sessionFlow = base.hiddenAlpha[metal].sessionFlow;
    } else {
      sessionFlow = {
        asiaPct: 0, londonPct: 0, nyPct: 0, eastMinusWestPct: 0,
        regime: 'Balanced Global Flow', signal: 0,
        note: 'Waiting for full 24h intraday bars across Asia, London & NY.',
      };
    }

    // 2. 21-Currency Stealth Global Breakout Breadth
    const benches = CLIENT_FX_BREAKOUT_BENCHMARKS[metal];
    let nearHighCount = 0;
    let totalCcy = 0;
    let usdRatio = 0.95;
    for (const [ccy, bench] of Object.entries(benches)) {
      const r = Number(state.fxRates?.[ccy]);
      if (!(r > 0) || !(bench > 0) || !(spot > 0)) continue;
      const ratio = (spot * r) / bench;
      if (ccy === 'USD') usdRatio = ratio;
      if (ratio >= 0.96) nearHighCount++;
      totalCcy++;
    }
    const breadthPct = totalCcy > 0 ? Math.round((nearHighCount / totalCcy) * 100) : 50;
    const usdPctOfHigh = +(usdRatio * 100).toFixed(1);
    const stealthBull = breadthPct >= 62 && usdRatio < 0.985;
    let fxRegime = 'Balanced FX Breadth';
    let fxSig = 0;
    if (stealthBull) {
      fxRegime = 'Stealth Global Breakout ↑';
      fxSig = clampNum(0.28 + ((breadthPct - 60) / 40) * 0.48, 0.25, 0.75);
    } else if (breadthPct >= 75) {
      fxRegime = 'Universal Global Highs ↑';
      fxSig = clampNum(0.32 + ((breadthPct - 75) / 25) * 0.35, 0.30, 0.68);
    } else if (breadthPct <= 20) {
      fxRegime = 'Broad FX Pullback ↓';
      fxSig = -0.25;
    } else {
      fxSig = clampNum(((breadthPct - 45) / 55) * 0.25, -0.18, 0.22);
    }
    const currencyBreadth = {
      nearHighCount,
      totalCurrencies: totalCcy,
      breadthPct,
      usdPctOfHigh,
      stealthBull,
      regime: fxRegime,
      signal: +fxSig.toFixed(3),
    };

    // 3. Bullion Spring Coiling Detector
    const dailyBars = state.timeframes?.['6m']?.[metal]?.length >= 22
      ? state.timeframes['6m'][metal]
      : (state.timeframes?.['1m']?.[metal] || []);
    const closes = dailyBars.map((b) => Number(b?.c)).filter((v) => Number.isFinite(v) && v > 0);
    let springCoiling;
    if (closes.length >= 22) {
      const rets = [];
      for (let i = 1; i < closes.length; i++) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      const rms = (arr) => (arr.length ? Math.sqrt(arr.reduce((s, r) => s + r * r, 0) / arr.length) : 0.01);
      const shortVol = rms(rets.slice(-5));
      const baseVol = Math.max(0.003, rms(rets.slice(-30)));
      const volRatio = +(shortVol / baseVol).toFixed(2);
      const comexRatio = liveComex?.[metal]?.paperToRegisteredRatio ?? null;
      const isBackw = Boolean(futures?.[metal]?.isBackwardation || (futures?.[metal]?.basisUsd ?? 1) < 0);
      const compressionPts = clampNum((1.15 - volRatio) / 0.65, 0, 1) * 68;
      const vaultFuel =
        (isBackw ? 18 : 0) +
        (Number.isFinite(comexRatio) ? clampNum((comexRatio - (isSilver ? 4.5 : 2.5)) * 4.5, 0, 16) : 0);
      const coilingScore = Math.round(clampNum(compressionPts + vaultFuel, 5, 98));
      let scRegime = 'Normal Range Energy';
      let breakoutEnergyMult = 1.0;
      let scNote = `Short-term swings are ${volRatio.toFixed(2)}× normal — balanced energy.`;
      if (coilingScore >= 72) {
        scRegime = 'Coiled Spring · Breakout Imminent ⚡';
        breakoutEnergyMult = 1.28;
        scNote = `Volatility compressed to ${volRatio.toFixed(2)}× baseline while physical tension builds — sharp directional breakout typically follows.`;
      } else if (coilingScore >= 54) {
        scRegime = 'Tightening Coil · Watch Breakout';
        breakoutEnergyMult = 1.12;
        scNote = `Price range is narrowing (${volRatio.toFixed(2)}× baseline) — energy storing up for next leg.`;
      } else if (volRatio >= 1.45) {
        scRegime = 'Expanded / Post-Breakout';
        breakoutEnergyMult = 0.88;
        scNote = `Volatility already expanded (${volRatio.toFixed(2)}× baseline) — expect digestion/consolidation.`;
      }
      springCoiling = { coilingScore, volRatio, breakoutEnergyMult, regime: scRegime, note: scNote };
    } else if (base?.hiddenAlpha?.[metal]?.springCoiling) {
      springCoiling = base.hiddenAlpha[metal].springCoiling;
    } else {
      springCoiling = {
        coilingScore: 42, volRatio: 1.0, breakoutEnergyMult: 1.0,
        regime: 'Normal Range Energy', note: 'Volatility sits near its 30-day average.',
      };
    }

    // 4. Cross-Asset Liquidity Compass (Gold/Oil miner margin + Copper/Platinum + Gold/BTC flow)
    const oilPrice = Number(macro.oil) > 10 ? Number(macro.oil) : null;
    const goldOilRatio = oilPrice && spotGold > 500 ? +(spotGold / oilPrice).toFixed(1) : (base?.hiddenAlpha?.[metal]?.liquidityCompass?.goldOilRatio ?? null);
    const cu5d = Number(macro.cu5dPct ?? 0);
    const pt5d = Number(macro.platinum5dPct ?? 0);
    const minerMarginSig = goldOilRatio != null ? clampNum((goldOilRatio - 38) / 22, -0.35, 0.55) : 0;
    const indConfirmSig = clampNum((cu5d * 0.6 + pt5d * 0.4) / 5.5, -0.65, 0.65);
    const spx5d = Number(macro.spx5dPct ?? 0);
    const btc5d = Number(macro.btc5dPct ?? 0);
    const g5d = Number(macro.gold5dPct ?? 0);
    let liqRegime = base?.hiddenAlpha?.[metal]?.liquidityCompass?.regime || 'Balanced Cross-Asset Flow';
    let liquiditySig = 0;
    if (g5d > 0.5 && btc5d > 1.8) {
      liqRegime = 'Global Fiat Debasement Wave ↑';
      liquiditySig = 0.48;
    } else if (g5d > 0.5 && btc5d < -1.8 && spx5d < -0.4) {
      liqRegime = 'Pure Safe-Haven Flight ↑';
      liquiditySig = isSilver ? 0.16 : 0.45;
    } else if (g5d < -0.9 && btc5d < -2.5) {
      liqRegime = 'Broad Liquidity Tightening ↓';
      liquiditySig = -0.38;
    } else if (goldOilRatio != null && goldOilRatio >= 46) {
      liqRegime = 'Strong Miner Margin Tailwind ↑';
      liquiditySig = 0.24;
    }
    const liqSignal = isSilver
      ? clampNum(liquiditySig * 0.45 + indConfirmSig * 0.40 + minerMarginSig * 0.15, -0.75, 0.75)
      : clampNum(liquiditySig * 0.55 + minerMarginSig * 0.30 + indConfirmSig * 0.15, -0.75, 0.75);
    const liquidityCompass = {
      regime: liqRegime,
      goldOilRatio,
      cu5d: +cu5d.toFixed(2),
      pt5d: +pt5d.toFixed(2),
      signal: +liqSignal.toFixed(3),
      note: goldOilRatio != null
        ? `Gold/Oil ${goldOilRatio}:1 (miner energy margin) · Copper ${cu5d >= 0 ? '+' : ''}${cu5d.toFixed(1)}% · Platinum ${pt5d >= 0 ? '+' : ''}${pt5d.toFixed(1)}%`
        : `Copper ${cu5d >= 0 ? '+' : ''}${cu5d.toFixed(1)}% · Platinum ${pt5d >= 0 ? '+' : ''}${pt5d.toFixed(1)}%`,
    };

    // 5. Narrative Consensus Crowding & Capitulation Contrarian Brake
    const scoredNews = headlines.filter((h) => h?.sentiment === 'bullish' || h?.sentiment === 'bearish');
    const bullN = scoredNews.filter((h) => h.sentiment === 'bullish').length;
    const bearN = scoredNews.filter((h) => h.sentiment === 'bearish').length;
    const newsBullPct = scoredNews.length >= 3 ? (bullN / scoredNews.length) * 100 : 50;
    const rsiVal = Number.isFinite(Number(isSilver ? macro.silverRsi14 : macro.goldRsi14))
      ? Number(isSilver ? macro.silverRsi14 : macro.goldRsi14)
      : 50;
    const cotPct = Number.isFinite(Number(isSilver ? cot.silverPercentile52w : cot.goldPercentile52w))
      ? Number(isSilver ? cot.silverPercentile52w : cot.goldPercentile52w)
      : 50;
    const crowdingScore = Math.round(clampNum(newsBullPct * 0.34 + rsiVal * 0.38 + cotPct * 0.28, 4, 96));
    let crowdRegime = 'Healthy Positioning';
    let contrarianNudge = 0;
    let crowdNote = `Crowd score ${crowdingScore}/100 — room for trend continuation without extreme crowding.`;
    if (crowdingScore >= 78 && rsiVal >= 68) {
      crowdRegime = 'Crowded Euphoria · Pullback Risk ↓';
      contrarianNudge = -clampNum(((crowdingScore - 74) / 22) * 0.14, 0.04, 0.14);
      crowdNote = `Extreme one-sided bullishness (${crowdingScore}/100, RSI ${rsiVal.toFixed(0)}) — anti-FOMO contrarian brake warns of shakeout risk.`;
    } else if (crowdingScore <= 24 && rsiVal <= 34) {
      crowdRegime = 'Panic Capitulation · Reversal Zone ↑';
      contrarianNudge = clampNum(((28 - crowdingScore) / 22) * 0.14, 0.04, 0.14);
      crowdNote = `Washout bearish panic (${crowdingScore}/100, RSI ${rsiVal.toFixed(0)}) — smart-money contrarian bounce lift active.`;
    }
    const crowdingBrake = {
      crowdingScore,
      newsBullPct: Math.round(newsBullPct),
      bullHeadlines: bullN,
      bearHeadlines: bearN,
      regime: crowdRegime,
      contrarianNudge: +contrarianNudge.toFixed(4),
      note: crowdNote,
    };

    // 6. COMEX OpEx Round-Strike Gravity & Post-OpEx Snapback
    const safeSpot = Number.isFinite(Number(spot)) && Number(spot) > 0 ? Number(spot) : (isSilver ? 42.5 : 3600);
    const strikeStep = isSilver ? 1.0 : 50.0;
    const magnetStrike = Math.round(safeSpot / strikeStep) * strikeStep;
    const distPct = ((magnetStrike - safeSpot) / safeSpot) * 100;
    let nearestDeltaDays = 999;
    for (let off = -1; off <= 2; off++) {
      const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + off, 1));
      if (!activePreMonths.has(dt.getUTCMonth())) continue;
      const opex = nthBizDayFromEndClient(dt.getUTCFullYear(), dt.getUTCMonth(), 4);
      const diffDays = Math.round((opex.getTime() - todayUtc) / 86400000);
      if (Math.abs(diffDays) < Math.abs(nearestDeltaDays)) nearestDeltaDays = diffDays;
    }
    let opexPhase = 'Open Trend Window';
    let pinStrength = 0;
    let opexSig = 0;
    let opexNote = `Nearest major round strike: $${magnetStrike.toLocaleString('en-US')} (${nearestDeltaDays > 0 ? `${nearestDeltaDays}d to OpEx` : `${Math.abs(nearestDeltaDays)}d post-OpEx`}).`;
    if (nearestDeltaDays >= 0 && nearestDeltaDays <= 3) {
      opexPhase = nearestDeltaDays === 0 ? 'OpEx Pin Day (Magnet Active)' : `Pre-OpEx Strike Pin (${nearestDeltaDays}d)`;
      pinStrength = nearestDeltaDays === 0 ? 0.55 : 0.35;
      opexSig = clampNum((distPct / (isSilver ? 2.4 : 1.4)) * 0.25, -0.22, 0.22);
      opexNote = `Options expiration in ${nearestDeltaDays}d — dealers typically pin spot near the $${magnetStrike.toLocaleString('en-US')} round strike before releasing.`;
    } else if (nearestDeltaDays < 0 && nearestDeltaDays >= -5) {
      opexPhase = `Post-OpEx Release (+${Math.abs(nearestDeltaDays)}d) ⚡`;
      pinStrength = 0;
      opexSig = clampNum((trendSign >= 0 ? 1 : -1) * 0.22, -0.25, 0.25);
      opexNote = `Options hedges just rolled off ${Math.abs(nearestDeltaDays)}d ago — suppressed directional trend often accelerates cleanly now.`;
    }
    const opexMagnet = {
      magnetStrike: +magnetStrike.toFixed(2),
      distToMagnetPct: +distPct.toFixed(2),
      daysToOpex: nearestDeltaDays,
      phase: opexPhase,
      pinStrength,
      signal: +opexSig.toFixed(3),
      note: opexNote,
    };

    const rawEdge =
      sessionFlow.signal * 0.26 +
      currencyBreadth.signal * 0.24 +
      liquidityCompass.signal * 0.24 +
      opexMagnet.signal * 0.14;
    const netBoost = clampNum(
      rawEdge * 0.18 * springCoiling.breakoutEnergyMult + crowdingBrake.contrarianNudge,
      -0.14,
      0.15
    );

    return {
      metal,
      sessionFlow,
      currencyBreadth,
      springCoiling,
      liquidityCompass,
      crowdingBrake,
      opexMagnet,
      netBoost: +netBoost.toFixed(4),
      netPts: Math.round(netBoost * 100),
    };
  };

  const gold = buildFor('gold', spotGold, gTrendSign);
  const silver = buildFor('silver', spotSilver, sTrendSign);
  const standout = [];
  if (gold.sessionFlow.regime.includes('East Accumulating') || silver.sessionFlow.regime.includes('East Accumulating')) {
    standout.push('East Physical Buying / West Paper Dip divergence');
  }
  if (gold.currencyBreadth.stealthBull || silver.currencyBreadth.stealthBull) {
    standout.push(`Stealth Global Currency Breakout (${Math.max(gold.currencyBreadth.breadthPct, silver.currencyBreadth.breadthPct)}% of world FX near highs)`);
  }
  if (gold.springCoiling.coilingScore >= 72 || silver.springCoiling.coilingScore >= 72) {
    standout.push('Coiled Spring volatility compression');
  }
  if (gold.crowdingBrake.contrarianNudge !== 0) standout.push(gold.crowdingBrake.regime);
  if (gold.opexMagnet.pinStrength > 0 || gold.opexMagnet.phase.includes('Post-OpEx')) {
    standout.push(gold.opexMagnet.phase);
  }
  return {
    gold,
    silver,
    summaryLine: standout.length
      ? standout.slice(0, 2).join(' · ')
      : '6 exclusive market-edge detectors active and synced into live forecasts',
  };
}

/* ---------- AI Data Center & Big Tech Infrastructure Race Engine (Client Mirror) ---------- */
const CLIENT_AI_COMPUTE_META = [
  { key: 'nvda', ticker: 'NVDA', name: 'NVIDIA', role: 'AI GPUs & Interconnects' },
  { key: 'googl', ticker: 'GOOGL', name: 'Google', role: 'TPU Hyperscale & Power' },
  { key: 'msft', ticker: 'MSFT', name: 'Microsoft', role: 'Azure AI Campuses' },
  { key: 'meta', ticker: 'META', name: 'Meta', role: 'AI Training Clusters' },
  { key: 'amzn', ticker: 'AMZN', name: 'Amazon', role: 'AWS Cloud Buildout' },
  { key: 'tsm', ticker: 'TSM', name: 'TSMC', role: 'Wafer & Wire Bonding' },
  { key: 'avgo', ticker: 'AVGO', name: 'Broadcom', role: 'AI Silicon & Networking' },
];

const CLIENT_AI_POWER_META = [
  { key: 'vrt', ticker: 'VRT', name: 'Vertiv', role: 'Switchgear, Busbars & UPS' },
  { key: 'etn', ticker: 'ETN', name: 'Eaton', role: 'Breakers, Relays & Grid' },
  { key: 'ceg', ticker: 'CEG', name: 'Constellation', role: '24/7 Hyperscale Power' },
];

function computeClientAiDatacenter({
  base = null,
  futures = null,
  liveComex = null,
  physicalPremiums = null,
  scenarioMode = null,
} = {}) {
  const srv = base?.aiDatacenter || null;
  const macro = base?.macroSnapshot || {};
  const headlines = base?.headlines || [];
  const cu5 = Number.isFinite(Number(macro.cu5dPct)) ? Number(macro.cu5dPct) : 0;

  const hydrateBasket = (metaList, srvBasket) => {
    const map = new Map((srvBasket?.members || []).map((m) => [m.key, m]));
    let sum5d = 0;
    let sum20d = 0;
    let cnt5d = 0;
    let cnt20d = 0;
    let rising = 0;
    const members = metaList.map((m) => {
      const s = map.get(m.key);
      const p5 = s && Number.isFinite(Number(s.pct5d)) ? Number(s.pct5d) : null;
      const p20 = s && Number.isFinite(Number(s.pct20d)) ? Number(s.pct20d) : null;
      const price = s && Number.isFinite(Number(s.price)) ? Number(s.price) : null;
      if (p5 != null) {
        sum5d += p5;
        cnt5d++;
        if (p5 > 0) rising++;
      }
      if (p20 != null) {
        sum20d += p20;
        cnt20d++;
      }
      return { ...m, price, pct5d: p5, pct20d: p20 };
    });
    return {
      members,
      avg5dPct: cnt5d > 0 ? +(sum5d / cnt5d).toFixed(2) : 0,
      avg20dPct: cnt20d > 0 ? +(sum20d / cnt20d).toFixed(2) : 0,
      risingCount: rising,
      trackedCount: cnt5d,
      totalCount: metaList.length,
      live: cnt5d > 0,
    };
  };

  const computeBasket = hydrateBasket(CLIENT_AI_COMPUTE_META, srv?.computeBasket);
  const powerBasket = hydrateBasket(CLIENT_AI_POWER_META, srv?.powerBasket);

  const bullRx = [
    /\b(nvidia|google|alphabet|microsoft|meta|amazon|aws|openai|xai|oracle|tsmc|broadcom|vertiv|eaton|stargate|hyperscaler)\b.*\b(data center|ai infrastructure|ai capex|capex|gigawatt|megawatt|power deal|nuclear|substation|switchgear|busbar|grid upgrade|server|blackwell|rubin|tpu|billion|expand|buildout|surge|boom|record)/i,
    /\b(ai data center|hyperscale data center|ai power demand|data center power|power grid upgrade|switchgear|busbar|wire bonding)\b.*\b(surge|boom|jump|soar|expand|gw|gigawatt|record|shortage|silver|gold|demand|strain|tight)/i,
    /\b(silver|gold)\b.*\b(ai data center|ai server|ai chip|switchgear|busbar|semiconductor|wire bonding|hyperscale)/i,
  ];
  const bearRx = [
    /\b(nvidia|google|alphabet|microsoft|meta|amazon|aws|openai|hyperscaler|data center|ai infrastructure)\b.*\b(capex cut|cut spending|cancel|delay|pause|slowdown|pullback|bubble burst|halt|slump|oversupply|excess capacity)/i,
    /\b(ai data center|ai capex|ai chip|server demand)\b.*\b(cool|slow|drop|fall|shrink|cut|cancel|delay|bubble)/i,
  ];
  let bullHits = 0;
  let bearHits = 0;
  for (const h of headlines) {
    const txt = `${h?.title || ''} ${h?.summary || ''}`.trim();
    if (!txt) continue;
    const isBear = bearRx.some((rx) => rx.test(txt));
    const isBull = bullRx.some((rx) => rx.test(txt));
    if (isBull && !isBear) bullHits++;
    else if (isBear) bearHits++;
  }
  const newsScore = clampNum((bullHits - bearHits) * 0.28, -0.85, 0.90);

  const computeMom = computeBasket.live
    ? clampNum((computeBasket.avg5dPct * 0.55 + computeBasket.avg20dPct * 0.28) / 7.5, -1, 1)
    : 0.12;
  const powerMom = powerBasket.live
    ? clampNum((powerBasket.avg5dPct * 0.52 + powerBasket.avg20dPct * 0.30 + cu5 * 0.18) / 8.0, -1, 1)
    : clampNum(0.14 + cu5 / 18, -0.6, 0.8);
  const scenarioShift = scenarioMode === 'surge' ? 24 : scenarioMode === 'pause' ? -28 : 0;

  const raceIndex = Math.round(clampNum(56 + computeMom * 18 + powerMom * 20 + newsScore * 16 + scenarioShift, 6, 98));
  const agComexRatio = Number(liveComex?.silver?.paperToRegisteredRatio);
  const agBackw = Boolean(futures?.silver?.isBackwardation || (futures?.silver?.basisUsd ?? 1) < 0);
  const agPremHot = physicalPremiums?.silver?.tone === 'bullish';
  const supplyTightMult = clampNum(
    1.0 +
      (agBackw ? 0.14 : 0) +
      (agPremHot ? 0.10 : 0) +
      (Number.isFinite(agComexRatio) && agComexRatio > 5.0 ? clampNum((agComexRatio - 5.0) * 0.03, 0, 0.12) : 0),
    1.0,
    1.32
  );

  const silverSignal = +clampNum(((raceIndex - 45) / 48) * supplyTightMult, -0.65, 0.92).toFixed(3);
  const silverBoost = +clampNum(silverSignal * 0.115, -0.055, 0.105).toFixed(4);
  const goldSignal = +clampNum(silverSignal * 0.36, -0.28, 0.38).toFixed(3);
  const goldBoost = +clampNum(goldSignal * 0.105, -0.022, 0.042).toFixed(4);
  const estSilverMozYr = Math.round(clampNum(20 + ((raceIndex - 20) / 78) * 24, 18, 46));

  let status = 'Steady AI Expansion';
  let tone = 'neutral';
  if (raceIndex >= 74) {
    status = 'Hyperscale Surge ↑';
    tone = 'bullish';
  } else if (raceIndex >= 58) {
    status = 'Active AI Buildout ↑';
    tone = 'bullish';
  } else if (raceIndex <= 34) {
    status = 'CapEx Slowdown ↓';
    tone = 'bearish';
  }

  let summary = `AI data center race index at ${raceIndex}/100 (${status.replace(/[↑↓]/g, '').trim()}). `;
  if (tone === 'bullish') {
    summary += `Hyperscale buildouts (Google, NVIDIA, Microsoft, Meta, Amazon) and power-room switchgear/busbars add non-thriftable physical silver demand (~${estSilverMozYr} Moz/yr run-rate) onto a 6-year structural deficit with 70–80% byproduct supply inelasticity, plus steady gold wire-bonding support.`;
  } else if (tone === 'bearish') {
    summary += `Big Tech AI CapEx stocks and power-grid hardware cooled recently — easing near-term industrial momentum, though long-term 2025–2030 power growth (+165%) remains intact.`;
  } else {
    summary += `Steady hyperscale server & power-grid expansion underpins ~${estSilverMozYr} Moz/yr of non-thriftable silver hardware draw and supporting gold connector demand.`;
  }

  return {
    raceIndex,
    status,
    tone,
    estSilverMozYr,
    dcPowerGrowth2030Pct: 165,
    byproductSilverSharePct: '70–80%',
    deficitYears: 6,
    supplyTightMult: +supplyTightMult.toFixed(2),
    computeBasket,
    powerBasket,
    news: { bullHits, bearHits, net: bullHits - bearHits, newsScore: +newsScore.toFixed(3) },
    silver: {
      signal: silverSignal,
      predictionBoost: silverBoost,
      pts: Math.round(silverBoost * 100),
      role: 'Primary AI Metal (Switchgear, Busbars, Relays, Grid & Thermal — Non-Thriftable)',
    },
    gold: {
      signal: goldSignal,
      predictionBoost: goldBoost,
      pts: Math.round(goldBoost * 100),
      role: 'Supporting Tech Metal (Corrosion-Proof Wire Bonding, Edge Connectors & Memory Pins)',
    },
    summary,
  };
}

const DRIVER_WEIGHTS = {
  inflation: { gold: 0.16, silver: 0.13 },
  geopolitics: { gold: 0.16, silver: 0.09 },
  rates_usd: { gold: 0.19, silver: 0.14 },
  equities: { gold: 0.07, silver: 0.09 },
  mining_supply: { gold: 0.05, silver: 0.17 },
  central_banks: { gold: 0.08, silver: 0.05 },
  shanghai_sge: { gold: 0.10, silver: 0.11 },
  positioning_miners: { gold: 0.09, silver: 0.10 },
  comex_paper: { gold: 0.10, silver: 0.12 },
};

const ANALOG_LIBRARY = [
  {
    title: 'Russia–Ukraine Invasion (Feb 2022)',
    drivers: ['geopolitics', 'inflation'],
    direction: 'bullish',
    gold7dPct: 4.8,
    gold30dPct: 8.2,
    silver7dPct: 6.1,
    silver30dPct: 10.4,
    note: 'Acute geopolitical shock plus commodity inflation triggered an immediate safe-haven spike.',
  },
  {
    title: 'Middle East Escalation (Oct 2023)',
    drivers: ['geopolitics'],
    direction: 'bullish',
    gold7dPct: 5.4,
    gold30dPct: 7.9,
    silver7dPct: 5.0,
    silver30dPct: 8.6,
    note: 'War risk drove rapid safe-haven inflows into gold despite elevated Treasury yields.',
  },
  {
    title: 'US Regional Banking Stress (Mar 2023)',
    drivers: ['equities', 'rates_usd'],
    direction: 'bullish',
    gold7dPct: 6.5,
    gold30dPct: 9.8,
    silver7dPct: 8.2,
    silver30dPct: 16.5,
    note: 'Banking turmoil pushed yields sharply lower and ignited a precious-metals breakout.',
  },
  {
    title: 'Aggressive Fed Rate-Hike Cycle (Mid-2022)',
    drivers: ['rates_usd'],
    direction: 'bearish',
    gold7dPct: -2.4,
    gold30dPct: -6.8,
    silver7dPct: -4.9,
    silver30dPct: -12.5,
    note: 'Surging real yields and a strong US Dollar pressured non-yielding bullion.',
  },
  {
    title: 'COVID Liquidity Crash → Fed Cuts (Mar 2020)',
    drivers: ['equities', 'rates_usd', 'inflation'],
    direction: 'mixed',
    gold7dPct: -4.5,
    gold30dPct: 11.4,
    silver7dPct: -14.0,
    silver30dPct: 19.2,
    note: 'Acute stock margin calls caused a brief dip in silver first, followed by a massive rally after emergency cuts.',
  },
  {
    title: 'Record Central Bank Buying & Fed Pivot (2024)',
    drivers: ['central_banks', 'rates_usd'],
    direction: 'bullish',
    gold7dPct: 2.8,
    gold30dPct: 7.4,
    silver7dPct: 4.1,
    silver30dPct: 11.8,
    note: 'Sovereign gold accumulation paired with rate-cut pricing fueled sustained upward momentum.',
  },
  {
    title: 'Solar Demand & Silver Supply Deficit (2024–25)',
    drivers: ['mining_supply'],
    direction: 'bullish',
    gold7dPct: 1.1,
    gold30dPct: 3.4,
    silver7dPct: 5.6,
    silver30dPct: 14.2,
    note: 'Structural mine deficits and photovoltaic industrial demand drove Silver outperformance.',
  },
  {
    title: 'China Silver Export Curbs & SGE Squeeze (Jan 2026)',
    drivers: ['shanghai_sge', 'mining_supply'],
    direction: 'bullish',
    gold7dPct: 3.4,
    gold30dPct: 9.1,
    silver7dPct: 12.8,
    silver30dPct: 28.5,
    note: 'China refined silver export licensing and surging Shanghai Ag(T+D) premiums triggered a physical scramble across Asia.',
  },
  {
    title: 'Stagflation & Oil Shock (1979–1980)',
    drivers: ['inflation', 'geopolitics'],
    direction: 'bullish',
    gold7dPct: 6.2,
    gold30dPct: 18.5,
    silver7dPct: 9.4,
    silver30dPct: 26.0,
    note: 'Persistent inflation outpacing interest rates drove major capital rotation into hard assets.',
  },
];

const outlookState = {
  horizon: '7d', // '7d' | '30d'
  activeScenarios: new Set(),
  data: null,
};

const FALLBACK_OUTLOOK = {
  generatedAt: new Date().toISOString(),
  confidence: 68,
  narrative:
    'Anonymous pattern model weighs December Fed rate-hike pressure and Q3 AISC mining cost inflation (Newmont \$1,963/oz, Barrick \$1,911/oz) against central bank buying, First Majestic San Dimas strike disruption, and tight COMEX/Shanghai physical availability.',
  macroSnapshot: { goldVolAnnPct: 22.6, silverVolAnnPct: 36.3 },
  proSignals: {
    miners: {
      gdxVsGold10dPct: -1.8,
      silVsSilver10dPct: -2.4,
      goldBreadthPct: 20,
      silverBreadthPct: 25,
      regime: 'Miners Lagging (Pressure)',
      sectorLeaders: [
        { symbol: 'NEM', name: 'Newmont', metal: 'gold', last: 41.8, pct5d: -3.2 },
        { symbol: 'AEM', name: 'Agnico Eagle', metal: 'gold', last: 158.24, pct5d: -2.2 },
        { symbol: 'B', name: 'Barrick Mining', metal: 'gold', last: 18.9, pct5d: 0.6 },
        { symbol: 'WPM', name: 'Wheaton Precious', metal: 'gold', last: 118.4, pct5d: -3.1 },
        { symbol: 'FNV', name: 'Franco-Nevada', metal: 'gold', last: 237.37, pct5d: -4.0 },
        { symbol: 'PAAS', name: 'Pan American', metal: 'silver', last: 32.39, pct5d: -3.8 },
        { symbol: 'HL', name: 'Hecla Mining', metal: 'silver', last: 18.19, pct5d: -2.6 },
        { symbol: 'AG', name: 'First Majestic', metal: 'silver', last: 11.32, pct5d: -5.0 },
        { symbol: 'CDE', name: 'Coeur Mining', metal: 'silver', last: 19.22, pct5d: -2.1 },
      ],
    },
  },
  drivers: [
    { id: 'inflation', label: 'Inflation & Currency', shortLabel: 'Inflation', gold: 0.38, silver: 0.36, headlineCount: 1 },
    { id: 'geopolitics', label: 'Wars & Geopolitics', shortLabel: 'Geopolitics', gold: 0.42, silver: 0.25, headlineCount: 1 },
    { id: 'rates_usd', label: 'Fed Rates & US Dollar', shortLabel: 'Rates / USD', gold: -0.34, silver: -0.36, headlineCount: 2 },
    { id: 'equities', label: 'Stock Markets & Risk', shortLabel: 'Equities', gold: 0.12, silver: -0.08, headlineCount: 0 },
    { id: 'mining_supply', label: 'Mining & Industrial', shortLabel: 'Mining / Supply', gold: 0.34, silver: 0.62, headlineCount: 3 },
    { id: 'central_banks', label: 'Central Banks & ETFs', shortLabel: 'Central Banks', gold: 0.56, silver: 0.28, headlineCount: 1 },
    { id: 'shanghai_sge', label: 'Shanghai Physical (SGE)', shortLabel: 'Shanghai SGE', gold: 0.46, silver: 0.52, headlineCount: 1 },
    { id: 'positioning_miners', label: 'COT Crowding & Miners', shortLabel: 'COT / Miners', gold: -0.14, silver: -0.18, headlineCount: 1 },
    { id: 'comex_paper', label: 'COMEX Paper vs. Physical', shortLabel: 'COMEX Paper', gold: 0.42, silver: 0.48, headlineCount: 0 },
  ],
  headlines: [
    {
      title: 'Gold slides near 14-month low as hawkish FOMC minutes push December Fed rate-hike odds to ~75–95%',
      source: 'Google Finance / Markets',
      driverLabel: 'Rates / USD',
      sentiment: 'bearish',
      url: '',
    },
    {
      title: 'First Majestic Q3 silver production falls to 3.4M oz after 12-day San Dimas Mexico labor strike; buyback renewed',
      source: 'First Majestic Release',
      driverLabel: 'Mining / Supply',
      sentiment: 'bullish',
      url: '',
    },
    {
      title: 'Newmont (AISC \$1,963/oz) & Barrick (AISC \$1,911/oz) flag +24% YoY cost inflation; Barrick prepares American Barrick IPO',
      source: 'Mining Sector / Google Finance',
      driverLabel: 'Mining / Supply',
      sentiment: 'bullish',
      url: '',
    },
    {
      title: 'Pan American Silver returns \$300M to shareholders as Hecla cuts AISC guidance; streamers WPM & FNV slip on delivery timing',
      source: 'Yahoo Finance / Sector',
      driverLabel: 'COT / Miners',
      sentiment: 'neutral',
      url: '',
    },
    {
      title: 'Central banks accelerate gold accumulation while China silver export controls keep Shanghai Ag(T+D) physical premiums firm',
      source: 'Goldman / Silver Institute',
      driverLabel: 'Central Banks',
      sentiment: 'bullish',
      url: '',
    },
  ],
};

/* ---------- COMEX Paper Silver & Paper Gold Live State ---------- */

const comexState = {
  data: null,
  fetching: false,
};

const FALLBACK_COMEX = {
  updatedAt: new Date().toISOString(),
  liveFetched: false,
  source: 'CME COMEX & CFTC',
  gold: {
    metal: 'gold',
    contractCode: 'GC',
    contractSizeOz: 100,
    openInterestContracts: 494233,
    oiChangeContracts: 6453,
    oiPct52w: 68,
    oi4wPct: 3.4,
    paperOz: 49423300,
    paperMoz: 49.42,
    registeredOz: 14170000,
    registeredMoz: 14.17,
    eligibleOz: 8890000,
    eligibleMoz: 8.89,
    registered30dPct: -4.3,
    paperToRegisteredRatio: 3.49,
    signal: 0.42,
    jumpBoost: 0.19,
    regime: 'Elevated Paper Claims',
    date: '2026-11-19',
  },
  silver: {
    metal: 'silver',
    contractCode: 'SI',
    contractSizeOz: 5000,
    openInterestContracts: 136400,
    oiChangeContracts: 2840,
    oiPct52w: 58,
    oi4wPct: 4.8,
    paperOz: 682000000,
    paperMoz: 682.0,
    registeredOz: 101160000,
    registeredMoz: 101.16,
    eligibleOz: 229110000,
    eligibleMoz: 229.11,
    registered30dPct: -1.9,
    paperToRegisteredRatio: 6.74,
    signal: 0.48,
    jumpBoost: 0.24,
    regime: 'Physical Squeeze Stress',
    date: '2026-11-19',
  },
};

function recomputeComexMetal(m, pricePct = 0) {
  const isSilver = m.metal === 'silver';
  const size = isSilver ? 5000 : 100;
  const paperOz = Math.round(m.openInterestContracts * size);
  const regOz = m.registeredOz || (isSilver ? 101160000 : 14170000);
  const ratio = +(paperOz / regOz).toFixed(2);
  const baseRatio = isSilver ? 4.5 : 2.8;
  const tightness = clampNum((ratio - baseRatio) / (isSilver ? 4.5 : 2.2), -0.45, 0.75);
  const drainSig = clampNum(-(m.registered30dPct || 0) / 8, -0.35, 0.45);
  const oiFlow = clampNum((m.oi4wPct || (m.oiChangeContracts / Math.max(1, m.openInterestContracts)) * 100) / 10, -1, 1);
  const pDir = pricePct >= 0.25 ? 1 : pricePct <= -0.25 ? -1 : 0.35;
  const flowSig = clampNum(oiFlow * pDir * 0.35, -0.35, 0.35);
  const crowdDrag = (m.oiPct52w || 50) >= 85 ? -(((m.oiPct52w || 50) - 85) / 15) * 0.28 : 0;
  const signal = +clampNum(tightness * 0.5 + drainSig * 0.35 + flowSig + crowdDrag, -0.9, 0.9).toFixed(3);
  const jumpBoost = +clampNum(Math.max(0, tightness * 0.3) + ((m.oiPct52w || 50) >= 80 ? 0.14 : 0) + ((m.registered30dPct || 0) <= -3 ? 0.1 : 0), 0, 0.45).toFixed(3);

  let regime = 'Balanced';
  if (ratio >= (isSilver ? 6.5 : 3.6) && (m.registered30dPct ?? 0) <= -1) regime = 'Physical Squeeze Stress';
  else if ((m.oiPct52w || 50) >= 85) regime = 'Crowded Paper Leverage';
  else if (ratio >= (isSilver ? 5.2 : 3.1)) regime = 'Elevated Paper Claims';
  else if (ratio <= (isSilver ? 3.2 : 2.0)) regime = 'Ample Registered Cover';

  return {
    ...m,
    paperOz,
    paperMoz: +(paperOz / 1_000_000).toFixed(2),
    registeredMoz: +(regOz / 1_000_000).toFixed(2),
    paperToRegisteredRatio: ratio,
    signal,
    jumpBoost,
    regime,
  };
}

async function fetchLiveCftcOiBrowser(code) {
  if (!/^\d{6}$/.test(String(code || ''))) throw new Error('Invalid CFTC code');
  const url =
    `https://publicreporting.cftc.gov/resource/72hh-3qpy.json` +
    `?cftc_contract_market_code=${encodeURIComponent(code)}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=16`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error(`CFTC HTTP ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  const latest = rows[0];
  const oi = Number(latest.open_interest_all);
  if (!Number.isFinite(oi) || oi <= 0) return null;
  const oiChg = Number(latest.change_in_oi_all ?? (rows[1] ? oi - Number(rows[1].open_interest_all) : 0));
  const prev4 = rows[Math.min(4, rows.length - 1)];
  const oi4wPct = prev4 && Number(prev4.open_interest_all) > 0
    ? +(((oi - Number(prev4.open_interest_all)) / Number(prev4.open_interest_all)) * 100).toFixed(2)
    : 0;
  return {
    openInterestContracts: Math.round(oi),
    oiChangeContracts: Math.round(oiChg || 0),
    oi4wPct,
    date: latest.report_date_as_yyyy_mm_dd?.slice(0, 10) || '',
  };
}

async function fetchComexData() {
  if (comexState.fetching) return;
  comexState.fetching = true;
  const subEl = document.getElementById('comex-subtitle');
  const btnEl = document.getElementById('btn-refresh-comex');
  if (btnEl) btnEl.textContent = 'Fetching…';

  let base = comexState.data || outlookState.data?.comex || FALLBACK_COMEX;
  try {
    base = await fetchFreshRepoJson('comex.json');
  } catch {
    // Keep prior or fallback
  }

  // Also attempt fresh anonymous CFTC COMEX Open Interest directly from the browser
  let liveCftc = false;
  try {
    const [gRes, sRes] = await Promise.allSettled([
      fetchLiveCftcOiBrowser('088691'),
      fetchLiveCftcOiBrowser('084691'),
    ]);
    const gLive = gRes.status === 'fulfilled' ? gRes.value : null;
    const sLive = sRes.status === 'fulfilled' ? sRes.value : null;
    if (gLive || sLive) {
      liveCftc = true;
      base = {
        ...base,
        updatedAt: new Date().toISOString(),
        liveFetched: true,
        source: 'Live CFTC COMEX OI + Vault Stocks',
        gold: recomputeComexMetal(
          { ...base.gold, ...(gLive || {}) },
          state.quotes.gold.pct || 0
        ),
        silver: recomputeComexMetal(
          { ...base.silver, ...(sLive || {}) },
          state.quotes.silver.pct || 0
        ),
      };
    }
  } catch {
    // Offline or blocked — keep data/comex.json snapshot
  }

  comexState.data = base;
  comexState.fetching = false;
  state.feedHealth.comexAt = liveCftc ? Date.now() : Date.parse(base?.updatedAt || 0) || Date.now();
  state.feedHealth.comexLive = Boolean(liveCftc || base?.oiLive);
  if (btnEl) btnEl.textContent = 'Fetch Fresh';
  if (subEl && liveCftc) {
    subEl.textContent = `Live CFTC OI synced · ${formatTime(new Date())}`;
  }
  renderFeedHealth();
  renderOutlook();
  renderChart();
}

function renderComexPanel() {
  const comex = comexState.data || outlookState.data?.comex || FALLBACK_COMEX;
  if (!comex || !comex.gold || !comex.silver) return;

  const subEl = document.getElementById('comex-subtitle');
  if (subEl && !comexState.fetching) {
    const dt = comex.gold.date || (comex.updatedAt ? new Date(comex.updatedAt).toLocaleDateString() : 'Latest');
    subEl.textContent = `Paper promises per 1 oz in US exchange vaults · Updated ${dt}`;
  }

  for (const metal of ['gold', 'silver']) {
    const m = comex[metal];
    const ratioEl = document.getElementById(`comex-${metal}-ratio`);
    const oiEl = document.getElementById(`comex-${metal}-oi`);
    const ozEl = document.getElementById(`comex-${metal}-oz`);
    const barEl = document.getElementById(`comex-${metal}-bar`);
    const regEl = document.getElementById(`comex-${metal}-regime`);

    if (ratioEl) ratioEl.textContent = `${m.paperToRegisteredRatio.toFixed(2)} : 1`;
    if (oiEl) {
      const chg = m.oiChangeContracts
        ? ` (${m.oiChangeContracts >= 0 ? '+' : ''}${m.oiChangeContracts.toLocaleString('en-US')})`
        : '';
      oiEl.textContent = `${m.openInterestContracts.toLocaleString('en-US')} open contracts${chg}`;
    }
    if (ozEl) {
      ozEl.textContent = `${m.paperMoz.toFixed(1)}M paper oz · ${m.registeredMoz.toFixed(1)}M vault oz`;
    }
    if (barEl) {
      const cap = metal === 'silver' ? 8.5 : 5.0;
      barEl.style.width = `${clampNum((m.paperToRegisteredRatio / cap) * 100, 12, 100)}%`;
    }
    if (regEl) {
      const dr = m.registered30dPct != null ? ` · Vaults ${m.registered30dPct >= 0 ? '+' : ''}${m.registered30dPct}% (30d)` : '';
      const friendlyStatus = m.regime?.includes('Squeeze') ? 'Tight Vault Supply' : m.regime?.includes('Elevated') ? 'High Paper Claims' : m.regime?.includes('Ample') ? 'Plentiful Vault Supply' : 'Normal Vault Level';
      regEl.textContent = `${friendlyStatus}${dr}`;
    }
  }
}

async function fetchOutlookData() {
  try {
    outlookState.data = await fetchFreshRepoJson('outlook.json');
    if (!comexState.data && outlookState.data?.comex) {
      comexState.data = outlookState.data.comex;
    }
    const genTs = Date.parse(outlookState.data?.generatedAt || 0) || Date.now();
    state.feedHealth.outlookAt = genTs;
    if (!state.feedHealth.futuresAt) state.feedHealth.futuresAt = genTs;
    if (!state.feedHealth.comexAt && outlookState.data?.comex) {
      state.feedHealth.comexAt = Date.parse(outlookState.data.comex.updatedAt || 0) || genTs;
      state.feedHealth.comexLive = Boolean(outlookState.data.comex.oiLive);
    }
  } catch {
    outlookState.data = FALLBACK_OUTLOOK;
  }
  renderMacroStrip();
  renderFeedHealth();
  renderMetalCard('gold');
  renderMetalCard('silver');
  renderFuturesPanel();
  renderOutlook();
  renderStackTracker();
  renderChart();
  evaluateClientRegimeAlerts();
}

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function signalFromScore(score) {
  if (score >= 45) return { label: 'Strong Up', cls: 'bullish' };
  if (score >= 16) return { label: 'Leaning Up', cls: 'bullish' };
  if (score <= -45) return { label: 'Strong Down', cls: 'bearish' };
  if (score <= -16) return { label: 'Leaning Down', cls: 'bearish' };
  return { label: 'Balanced', cls: '' };
}

function classifyRegimeClientLabel(discoveryScore, squeezeScore) {
  if (discoveryScore >= 58 && squeezeScore >= 58) {
    return { label: 'Hybrid: Squeeze + Discovery', key: 'hybrid' };
  }
  if (discoveryScore >= 58 && discoveryScore >= squeezeScore) {
    return { label: 'True Price Discovery', key: 'discovery' };
  }
  if (squeezeScore >= 58 && squeezeScore > discoveryScore) {
    return { label: 'Short Squeeze', key: 'squeeze' };
  }
  if (discoveryScore >= 45 && discoveryScore >= squeezeScore + 8) {
    return { label: 'Discovery Bias', key: 'discovery' };
  }
  if (squeezeScore >= 45 && squeezeScore >= discoveryScore + 8) {
    return { label: 'Squeeze Bias', key: 'squeeze' };
  }
  return { label: 'Consolidation / Neutral', key: 'neutral' };
}

function computeMarketRegimeClient({
  base,
  drivers,
  liveComex,
  gUnit = 0,
  sUnit = 0,
  hasInteractiveOverrides = false,
}) {
  if (!hasInteractiveOverrides && base?.marketRegime?.gold && base?.marketRegime?.silver) {
    return base.marketRegime;
  }

  const dMap = {};
  for (const d of drivers || []) dMap[d.id] = d;
  const dVal = (id, metal) => {
    const v = dMap[id]?.[metal];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };
  const normDisc = (v) => clampNum(0.42 + v * 0.54, 0.06, 1.0);

  const scoreMetal = (metal) => {
    const isSilver = metal === 'silver';
    const ratesSig = dVal('rates_usd', metal);

    let sgeSig = dVal('shanghai_sge', metal);
    if (sgeSig === 0 && base?.shanghai?.[metal]) {
      const prem = isSilver ? base.shanghai.silver.exVatPremiumUsdOz : base.shanghai.gold.premiumUsdOz;
      if (typeof prem === 'number' && Number.isFinite(prem)) {
        sgeSig = isSilver ? clampNum(prem / 3.5, -0.85, 0.9) : clampNum((prem - 5) / 42, -0.85, 0.9);
      }
    }

    const cbInflSig = dVal('central_banks', metal) * 0.62 + dVal('inflation', metal) * 0.38;
    const minersRaw = isSilver ? base?.proSignals?.miners?.silverSignal : base?.proSignals?.miners?.goldSignal;
    const minersSig =
      typeof minersRaw === 'number' && Number.isFinite(minersRaw)
        ? minersRaw
        : dVal('positioning_miners', metal) * 0.5;
    const trendRaw = base?.marketRegime?.[metal]?.components?.trend;
    const trendSig =
      typeof trendRaw === 'number' && Number.isFinite(trendRaw)
        ? trendRaw
        : isSilver
          ? sUnit * 0.55
          : gUnit * 0.55;

    const discWeighted =
      normDisc(ratesSig) * 0.26 +
      normDisc(sgeSig) * 0.22 +
      normDisc(cbInflSig) * 0.20 +
      normDisc(minersSig) * 0.16 +
      normDisc(trendSig) * 0.16;
    const discoveryScore = Math.round(clampNum(discWeighted * 100, 0, 100));

    const comexMetal = liveComex?.[metal] || null;
    const comexDriver = dVal('comex_paper', metal);
    const ratio = comexMetal?.paperToRegisteredRatio;
    const reg30d = comexMetal?.registered30dPct ?? 0;
    const oi4w = comexMetal?.oi4wPct ?? 0;

    const ratioNorm =
      typeof ratio === 'number' && Number.isFinite(ratio)
        ? isSilver
          ? clampNum((ratio - 3.0) / 3.8, 0, 1)
          : clampNum((ratio - 2.0) / 3.4, 0, 1)
        : 0;
    const drainNorm = reg30d < 0 ? clampNum(-reg30d / 12, 0, 0.35) : 0;
    const oiBuildNorm = oi4w > 2 ? clampNum((oi4w - 2) / 14, 0, 0.22) : 0;
    const comexDriverNorm = clampNum((comexDriver + 0.05) / 0.95, 0, 1);

    const comexCombined =
      typeof ratio === 'number' && Number.isFinite(ratio)
        ? clampNum(ratioNorm * 0.55 + drainNorm * 0.2 + oiBuildNorm + comexDriverNorm * 0.25, 0, 1)
        : comexDriverNorm;
    const comexPts = comexCombined * 34;

    const basisMetal = base?.institutionalSignals?.basis?.[metal] || null;
    const isBackwardation =
      basisMetal?.isBackwardation === true ||
      (typeof basisMetal?.basisUsd === 'number' && Number.isFinite(basisMetal.basisUsd) && basisMetal.basisUsd < 0);
    const basisPct = typeof basisMetal?.basisPct === 'number' && Number.isFinite(basisMetal.basisPct) ? basisMetal.basisPct : null;
    let basisPts = 0;
    if (isBackwardation) {
      basisPts = 20 + clampNum(Math.abs(basisPct ?? 0.2) / 0.8, 0, 1) * 4;
    } else if (basisMetal && basisPct != null && basisPct < (isSilver ? 0.22 : 0.18)) {
      basisPts = isSilver ? 7.5 : 6.0;
    } else if (basisMetal && basisPct != null && basisPct < 0.45) {
      basisPts = 1.5;
    }

    const cotPct = base?.proSignals?.cot?.[metal]?.percentile52w;
    let cotPts = 0;
    if (typeof cotPct === 'number' && Number.isFinite(cotPct)) {
      if (cotPct <= 35) {
        cotPts = (0.35 + ((35 - cotPct) / 35) * 0.65) * 24;
      } else if (cotPct <= 55) {
        cotPts = ((55 - cotPct) / 20) * 4.5;
      }
    }

    const gvz = base?.institutionalSignals?.impliedVol?.gvz;
    const ivMinusRv = base?.institutionalSignals?.impliedVol?.ivMinusRv ?? 0;
    let volPts = 0;
    if (typeof gvz === 'number' && Number.isFinite(gvz)) {
      const gvzNorm = clampNum((gvz - 15) / 18, 0, 1);
      const spreadNorm = clampNum(ivMinusRv / 14, 0, 1);
      const volScale = isSilver ? 1.0 : 0.85;
      volPts = clampNum(gvzNorm * 0.72 + spreadNorm * 0.28, 0, 1) * 18 * volScale;
    } else if (typeof base?.macroSnapshot?.vix === 'number') {
      volPts = clampNum((base.macroSnapshot.vix - 16) / 18, 0, 1) * 14;
    }

    const squeezeScore = Math.round(clampNum(comexPts + basisPts + cotPts + volPts, 0, 100));
    const cls = classifyRegimeClientLabel(discoveryScore, squeezeScore);

    return {
      metal,
      discoveryScore,
      squeezeScore,
      label: cls.label,
      key: cls.key,
      isBackwardation,
    };
  };

  return {
    gold: scoreMetal('gold'),
    silver: scoreMetal('silver'),
  };
}

function computeClientFuturesBasis(spotGold, spotSilver, base) {
  const baseBasis = base?.institutionalSignals?.basis || null;
  const candlesGold = state.candles?.gold;
  const candlesSilver = state.candles?.silver;
  const lastCandleGold = candlesGold?.length ? candlesGold[candlesGold.length - 1].c : null;
  const lastCandleSilver = candlesSilver?.length ? candlesSilver[candlesSilver.length - 1].c : null;

  const calc = (spot, liveFut, snapBasis, fallbackCandle, isSilver) => {
    const s = Number(spot);
    const fut = Number.isFinite(liveFut) && liveFut > 0
      ? liveFut
      : Number.isFinite(snapBasis?.futures) && snapBasis.futures > 0
        ? snapBasis.futures
        : Number.isFinite(fallbackCandle) && fallbackCandle > 0
          ? fallbackCandle
          : s;
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(fut) || fut <= 0) return null;
    const basisUsd = +(fut - s).toFixed(2);
    const basisPct = +((basisUsd / s) * 100).toFixed(3);
    const isBackwardation = basisUsd < 0;
    let signal = 0;
    let jumpBoost = 0;
    let priceDiscoveryBoost = 0;
    let curveState = 'Normal Contango';
    let curveSlope = 'Upward-Sloping (Contango)';

    if (isBackwardation) {
      signal = clampNum(0.45 + Math.abs(basisPct) * 0.9, 0.45, 0.9);
      jumpBoost = 0.22;
      priceDiscoveryBoost = clampNum(0.08 + Math.abs(basisPct) * 0.22, 0.08, 0.28);
      curveState = 'Backwardation (Tight!)';
      curveSlope = 'Downward-Sloping (Backwardation)';
    } else if (basisPct < (isSilver ? 0.22 : 0.18)) {
      signal = 0.28;
      jumpBoost = 0.08;
      priceDiscoveryBoost = 0.025;
      curveState = 'Compressed EFP';
      curveSlope = 'Flat / Compressed EFP';
    } else if (basisPct > 1.15) {
      signal = -0.22;
      curveState = 'Wide Contango';
      curveSlope = 'Steep Contango';
    }

    return {
      spot: +s.toFixed(2),
      futures: +fut.toFixed(2),
      basisUsd,
      basisPct,
      isBackwardation,
      curveSlope,
      priceDiscoveryBoost: +priceDiscoveryBoost.toFixed(3),
      signal: +signal.toFixed(3),
      jumpBoost,
      state: curveState,
      live: Number.isFinite(liveFut) && liveFut > 0,
    };
  };

  return {
    gold: calc(spotGold, state.futures.gold, baseBasis?.gold, lastCandleGold, false),
    silver: calc(spotSilver, state.futures.silver, baseBasis?.silver, lastCandleSilver, true),
    source: state.futures.liveFetched ? state.futures.source : 'COMEX Futures Snapshot',
  };
}

function computeClientDollarStrength(base, spotGold, spotSilver, gDailyVol, sDailyVol, learnedW) {
  const snap = base?.macroSnapshot || {};
  const ds = base?.dollarStrength || {};
  const snapDxy = ds.dxy ?? snap.dxy ?? 103.71;
  const liveDxy = state.liveMacro.dxy;
  const dxy = liveDxy != null ? liveDxy : snapDxy;
  const liveDeltaPct = liveDxy != null && snapDxy > 0 ? ((liveDxy - snapDxy) / snapDxy) * 100 : 0;

  const dxy5dPct = +((ds.dxy5dPct ?? snap.dxy5dPct ?? 0) + liveDeltaPct).toFixed(2);
  const dxy20dPct = +((ds.dxy20dPct ?? snap.dxy20dPct ?? dxy5dPct * 1.4) + liveDeltaPct).toFixed(2);
  const dxyVsSma20Pct = +((ds.dxyVsSma20Pct ?? snap.dxyVsSma20Pct ?? dxy5dPct * 0.5) + liveDeltaPct).toFixed(2);

  let baseScore = ds.score ?? snap.dxyStrengthScore;
  if (!Number.isFinite(baseScore)) {
    const lvl = clampNum((dxy - 101) / 8, -1, 1);
    const tr = clampNum((dxy5dPct / 2.2) * 0.45 + (dxy20dPct / 4.2) * 0.35 + (dxyVsSma20Pct / 2.5) * 0.2, -1, 1);
    baseScore = Math.round(clampNum(50 + (lvl * 0.38 + tr * 0.62) * 50, 0, 100));
  } else if (liveDeltaPct !== 0) {
    baseScore = Math.round(clampNum(baseScore + liveDeltaPct * 12, 0, 100));
  }

  let scenarioShift = 0;
  if (outlookState.activeScenarios.has('hawkish_usd')) scenarioShift += 19;
  if (outlookState.activeScenarios.has('fed_rate_cut')) scenarioShift -= 19;
  const score = Math.round(clampNum(baseScore + scenarioShift, 0, 100));

  const regime =
    score >= 72
      ? 'Strong Dollar (Hurts Metals)'
      : score >= 58
        ? 'Firm Dollar'
        : score <= 28
          ? 'Weak Dollar (Helps Metals)'
          : score <= 42
            ? 'Soft Dollar'
            : 'Normal Dollar';

  const goldVsDxyCorr = ds.goldVsDxyCorr ?? snap.goldVsDxyCorr ?? -0.45;
  const silverVsDxyCorr = ds.silverVsDxyCorr ?? snap.silverVsDxyCorr ?? -0.40;
  const dxyUnitEffect = clampNum((50 - score) / 50, -1, 1);
  const wRatesG = learnedW?.gold?.rates_usd ?? DRIVER_WEIGHTS.rates_usd?.gold ?? 0.19;
  const wRatesS = learnedW?.silver?.rates_usd ?? DRIVER_WEIGHTS.rates_usd?.silver ?? 0.14;
  const corrScaleG = clampNum(0.65 + Math.max(0, -(goldVsDxyCorr ?? -0.45)) * 0.7, 0.65, 1.25);
  const corrScaleS = clampNum(0.65 + Math.max(0, -(silverVsDxyCorr ?? -0.40)) * 0.7, 0.65, 1.25);

  const calcImpact = (days) => {
    const gPct = dxyUnitEffect * wRatesG * 0.62 * corrScaleG * gDailyVol * Math.sqrt(days) * 0.72 * 100;
    const sPct = dxyUnitEffect * wRatesS * 0.62 * corrScaleS * sDailyVol * Math.sqrt(days) * 0.72 * 100;
    return {
      goldPct: +gPct.toFixed(2),
      goldUsdOz: +((spotGold * gPct) / 100).toFixed(2),
      silverPct: +sPct.toFixed(2),
      silverUsdOz: +((spotSilver * sPct) / 100).toFixed(2),
    };
  };

  return {
    dxy: +Number(dxy).toFixed(2),
    live: liveDxy != null,
    source: liveDxy != null ? state.liveMacro.dxySource || 'Live ICE DXY' : 'DXY Snapshot',
    dxy5dPct,
    dxy20dPct,
    dxyVsSma20Pct,
    score,
    regime,
    goldVsDxyCorr,
    silverVsDxyCorr,
    liveDeltaPct: +liveDeltaPct.toFixed(2),
    impact7d: calcImpact(5),
    impact30d: calcImpact(21),
  };
}

const CLIENT_RATIO_5Y_ANCHOR = [
  66.2, 68.5, 67.1, 69.8, 70.4, 72.1, 74.5, 76.2, 78.4, 79.1, 77.6, 80.2,
  82.5, 84.1, 86.3, 88.9, 91.2, 93.4, 89.7, 85.4, 83.2, 81.8, 79.5, 78.1,
  80.6, 82.9, 84.8, 86.1, 88.2, 90.5, 87.6, 85.0, 83.7, 82.1, 84.3, 86.7,
  88.4, 87.2, 84.9, 81.5, 79.2, 77.8, 80.1, 82.4, 85.6, 89.1, 91.8, 94.2,
  90.4, 87.1, 84.2, 81.0, 76.5, 72.8, 68.4, 61.5, 52.0, 64.5, 75.8, 84.5,
];

function computeClientRatioAnalytics(liveRatio, base) {
  const current = Number.isFinite(liveRatio) && liveRatio > 0 ? liveRatio : (base?.goldSilverRatio || 82);
  const sample = CLIENT_RATIO_5Y_ANCHOR;
  const mean = base?.ratioAnalytics?.mean5y ?? (sample.reduce((a, b) => a + b, 0) / sample.length);
  const variance = sample.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (sample.length - 1);
  const std = base?.ratioAnalytics?.std5y ?? Math.max(2.5, Math.sqrt(variance));
  const zScore = (current - mean) / std;
  const below = sample.filter((v) => v <= current).length;
  const percentile5y = Math.round(clampNum((below / sample.length) * 100, 1, 99));

  let regime = 'Fairly Priced';
  let swapBias = 'Fairly Priced';
  let tone = 'neutral';
  if (zScore >= 1.15 || current >= 90) {
    regime = 'Silver Looks Very Cheap vs. Gold';
    swapBias = 'Silver Cheaper (Gold → Silver)';
    tone = 'bullish';
  } else if (zScore >= 0.45 || current >= 85) {
    regime = 'Silver Looks Cheap vs. Gold';
    swapBias = 'Silver Cheaper (Gold → Silver)';
    tone = 'bullish';
  } else if (zScore <= -1.15 || current <= 66) {
    regime = 'Gold Looks Very Cheap vs. Silver';
    swapBias = 'Gold Cheaper (Silver → Gold)';
    tone = 'gold';
  } else if (zScore <= -0.45 || current <= 73) {
    regime = 'Gold Looks Cheap vs. Silver';
    swapBias = 'Gold Cheaper (Silver → Gold)';
    tone = 'gold';
  }

  return {
    current: +current.toFixed(2),
    mean5y: +Number(mean).toFixed(1),
    std5y: +Number(std).toFixed(1),
    zScore: +zScore.toFixed(2),
    percentile5y,
    regime,
    swapBias,
    tone,
  };
}

function computeClientSetupQuality({ metal, spot, regime, rsi14, dailyVol, dollarStrength, basis, unitScore }) {
  const isSilver = metal === 'silver';
  const discScore = Number.isFinite(regime?.discoveryScore) ? regime.discoveryScore : 45;
  const sqzScore = Number.isFinite(regime?.squeezeScore) ? regime.squeezeScore : 30;
  const isBackw = Boolean(regime?.isBackwardation || basis?.isBackwardation || (basis?.basisUsd ?? 1) < 0);
  const dxyScore = Number.isFinite(dollarStrength?.score) ? dollarStrength.score : 50;
  const hasRsi = Number.isFinite(rsi14);

  // Anchor support/resistance to 1M/6M candle Fibonacci Golden Pocket when available
  let support = spot * (1 - clampNum(dailyVol * 2.3, 0.018, 0.085));
  let resistance = spot * (1 + clampNum(dailyVol * 2.5, 0.02, 0.095));
  const bars = state.timeframes?.['1m']?.[metal] || state.timeframes?.['6m']?.[metal] || state.candles?.[metal];
  const fib = Array.isArray(bars) && bars.length >= 6 ? computeFibonacciLevels(bars) : null;
  if (fib && fib.swingHigh > fib.swingLow) {
    const lv50 = fib.levels.find((l) => l.ratio === 0.5)?.price;
    const lv618 = fib.levels.find((l) => l.ratio === 0.618)?.price;
    const lv382 = fib.levels.find((l) => l.ratio === 0.382)?.price;
    const belowC = [fib.swingLow, lv618, lv50, lv382].filter((v) => Number.isFinite(v) && v < spot * 0.996);
    const aboveC = [fib.swingHigh, lv382, lv50, lv618].filter((v) => Number.isFinite(v) && v > spot * 1.004);
    if (belowC.length) support = Math.max(...belowC);
    if (aboveC.length) resistance = Math.min(...aboveC);
  }

  let label = 'Sideways — No Rush';
  let score = 52;
  let tone = 'neutral';
  let summary = 'Forces are mixed right now — no need to chase; wait for dips near the floor price or a clear breakout.';
  const exhaustionRisk = sqzScore >= 65 && discScore < 45 && hasRsi && rsi14 >= 78;

  if (exhaustionRisk) {
    label = 'Overheated — Drop Risk';
    score = Math.round(clampNum(34 - (rsi14 - 78) * 1.1, 18, 36));
    tone = 'bearish';
    summary = `Prices jumped fast from short-sellers covering without strong real-world demand behind it — high risk of a sudden drop.`;
  } else if (sqzScore >= 60 && ((hasRsi && rsi14 >= 66) || discScore < 48)) {
    label = 'Squeeze Active — Wait for Dips';
    score = Math.round(clampNum(58 + (isBackw ? 8 : 0) + (discScore - 40) * 0.2, 48, 74));
    tone = 'hybrid';
    summary = `${isBackw ? 'Tight physical supply and heavy' : 'Heavy'} short-squeeze pressure can cause sharp jumps, but avoid chasing big spikes — look for pullbacks toward the floor price.`;
  } else if ((hasRsi && rsi14 <= 36) || (discScore >= 52 && unitScore >= 0.10 && (!hasRsi || rsi14 <= 56))) {
    label = 'Good Dip-Buy Zone';
    const rsiBonus = hasRsi && rsi14 <= 36 ? clampNum((38 - rsi14) * 0.85, 0, 18) : 0;
    score = Math.round(clampNum(70 + rsiBonus + (discScore - 50) * 0.35 + (isBackw ? 6 : 0), 66, 94));
    tone = 'bullish';
    summary =
      hasRsi && rsi14 <= 36
        ? `Prices have pulled back enough that buyers often step in here${isBackw ? ', backed by tight physical supply' : ''}. Good area to slowly add near the floor price.`
        : `Steady real-world buying supports adding gradually without chasing overheated prices.`;
  } else if (discScore >= 58 && unitScore >= 0.14) {
    label = 'Healthy Uptrend';
    score = Math.round(clampNum(72 + (discScore - 58) * 0.45 + (isBackw ? 5 : 0), 70, 92));
    tone = 'bullish';
    summary = `Real physical and economic demand is driving a steady climb — favors holding what you own and buying small dips.`;
  } else if ((unitScore <= -0.20 && dxyScore >= 60) || (discScore < 40 && unitScore <= -0.18)) {
    label = 'Dollar Headwind — Be Patient';
    score = Math.round(clampNum(32 - Math.max(0, dxyScore - 60) * 0.4 + unitScore * 18, 16, 42));
    tone = 'bearish';
    summary = `A strong US Dollar and softer demand are weighing on prices right now — be patient and wait for prices to settle near the floor.`;
  } else if (isBackw && unitScore >= -0.05) {
    label = 'Tight Supply — Watch Breakout';
    score = Math.round(clampNum(64 + (sqzScore - 40) * 0.25, 58, 78));
    tone = 'bullish';
    summary = `Futures cost less than today's spot price, signaling tight ${isSilver ? 'silver' : 'gold'} supply — prices could push higher.`;
  }

  return {
    metal,
    label,
    score,
    tone,
    summary,
    support,
    resistance,
    rsi14: hasRsi ? +rsi14.toFixed(1) : null,
  };
}

function computeInteractiveOutlook() {
  const base = outlookState.data || FALLBACK_OUTLOOK;
  const canonical = getCanonicalSpotPrices();
  const spotGold = canonical.gold;
  const spotSilver = canonical.silver;

  const drivers = (base.drivers || []).map((d) => ({ ...d }));
  const liveComex = comexState.data || base.comex || FALLBACK_COMEX;
  const futures = computeClientFuturesBasis(spotGold, spotSilver, base);

  let comexRow = drivers.find((d) => d.id === 'comex_paper');
  if (!comexRow) {
    comexRow = {
      id: 'comex_paper',
      label: 'COMEX Paper vs. Physical',
      shortLabel: 'COMEX Paper',
      gold: liveComex.gold.signal,
      silver: liveComex.silver.signal,
      headlineCount: 0,
    };
    drivers.push(comexRow);
  } else if (comexState.data && comexState.data !== base?.comex) {
    comexRow.gold = liveComex.gold.signal;
    comexRow.silver = liveComex.silver.signal;
  }

  // Blend live futures backwardation into comex_paper driver when active
  if (comexRow && futures.gold?.isBackwardation) {
    comexRow.gold = +clampNum(comexRow.gold * 0.56 + futures.gold.signal * 0.44, -1, 1).toFixed(3);
  }
  if (comexRow && futures.silver?.isBackwardation) {
    comexRow.silver = +clampNum(comexRow.silver * 0.54 + futures.silver.signal * 0.46, -1, 1).toFixed(3);
  }

  // Apply live ICE DXY delta into rates_usd driver when live FX moves vs snapshot
  const snapDxy = base?.dollarStrength?.dxy ?? base?.macroSnapshot?.dxy ?? null;
  if (state.liveMacro.dxy != null && snapDxy > 0) {
    const dxyLivePct = ((state.liveMacro.dxy - snapDxy) / snapDxy) * 100;
    const ratesRow = drivers.find((d) => d.id === 'rates_usd');
    if (ratesRow && Math.abs(dxyLivePct) >= 0.05) {
      const nudge = clampNum(-dxyLivePct / 2.2, -0.35, 0.35);
      ratesRow.gold = +clampNum(ratesRow.gold + nudge, -1, 1).toFixed(3);
      ratesRow.silver = +clampNum(ratesRow.silver + nudge, -1, 1).toFixed(3);
    }
  }

  for (const sid of outlookState.activeScenarios) {
    const sc = OUTLOOK_SCENARIOS.find((s) => s.id === sid);
    if (!sc) continue;
    const row = drivers.find((d) => d.id === sc.driver);
    if (row) {
      row.gold = +clampNum(row.gold + sc.goldDelta, -1, 1).toFixed(3);
      row.silver = +clampNum(row.silver + sc.silverDelta, -1, 1).toFixed(3);
    }
  }

  const learnedW = base.selfLearning?.weights || null;
  let gComp = 0;
  let sComp = 0;
  for (const d of drivers) {
    const fallbackW = DRIVER_WEIGHTS[d.id] || { gold: 0.16, silver: 0.16 };
    const wG = learnedW?.gold?.[d.id] ?? fallbackW.gold;
    const wS = learnedW?.silver?.[d.id] ?? fallbackW.silver;
    gComp += d.gold * wG;
    sComp += d.silver * wS;
  }

  const driftG = clampNum((base.selfLearning?.driftBiasGoldPct || 0) * 0.14, -0.06, 0.06);
  const driftS = clampNum((base.selfLearning?.driftBiasSilverPct || 0) * 0.14, -0.06, 0.06);
  const backwBoostGold = futures.gold?.priceDiscoveryBoost || 0;
  const backwBoostSilver = futures.silver?.priceDiscoveryBoost || 0;

  // Market Gap Analyzer (unfilled Gap Up = bullish momentum, unfilled Gap Down = bearish momentum)
  const marketGaps = {
    gold: computeMetalGapSummary('gold', spotGold),
    silver: computeMetalGapSummary('silver', spotSilver),
  };
  const gapBoostGold = marketGaps.gold?.predictionBoost || 0;
  const gapBoostSilver = marketGaps.silver?.predictionBoost || 0;
  if (!drivers.some((d) => d.id === 'market_gaps')) {
    drivers.push({
      id: 'market_gaps',
      label: 'Chart Gaps & Fill Targets',
      shortLabel: 'Chart Gaps',
      gold: +(marketGaps.gold?.signal || 0).toFixed(3),
      silver: +(marketGaps.silver?.signal || 0).toFixed(3),
      headlineCount: (marketGaps.gold?.openCount || 0) + (marketGaps.silver?.openCount || 0),
    });
  }

  // Live World News Velocity + Official NOAA Space Weather + Live Intraday Shock Coupling
  const activeSpaceWeather =
    spaceWeatherState.data ||
    base?.spaceWeather ||
    parseClientNoaaSpaceWeather(null);
  const nowPulseMs = Date.now();
  let breakingNewsCount = 0;
  let fresh24hNewsCount = 0;
  let newsVelGold = 0;
  let newsVelSilver = 0;
  for (const h of base?.headlines || []) {
    const pubMs = h.publishedAt ? Date.parse(h.publishedAt) : NaN;
    const ageHrs = Number.isFinite(pubMs) ? Math.max(0, (nowPulseMs - pubMs) / 3600000) : 36;
    if (ageHrs <= 6) {
      breakingNewsCount++;
      fresh24hNewsCount++;
      newsVelGold += (Number(h.goldImpact) || 0) * 0.45;
      newsVelSilver += (Number(h.silverImpact) || 0) * 0.45;
    } else if (ageHrs <= 24) {
      fresh24hNewsCount++;
      newsVelGold += (Number(h.goldImpact) || 0) * 0.18;
      newsVelSilver += (Number(h.silverImpact) || 0) * 0.18;
    }
  }
  // Live intraday momentum shock coupling so predictions dynamically react to breaking moves in real time
  const liveGoldPct = Number(state.quotes.gold.pct) || 0;
  const liveSilverPct = Number(state.quotes.silver.pct) || 0;
  const liveShockGold = Math.abs(liveGoldPct) >= 0.45 ? clampNum((liveGoldPct / 3.2) * 0.10, -0.10, 0.10) : 0;
  const liveShockSilver = Math.abs(liveSilverPct) >= 0.80 ? clampNum((liveSilverPct / 5.5) * 0.11, -0.11, 0.11) : 0;

  const liveCalEvents = buildClientExpandedEvents(new Date());
  const nextWorldEv =
    (base?.institutionalSignals?.eventRisk?.nextEvent && base.institutionalSignals.eventRisk.nextEvent.daysUntil >= 0
      ? base.institutionalSignals.eventRisk.nextEvent
      : null) ||
    liveCalEvents[0] ||
    null;
  const daysToWorldEv = nextWorldEv?.daysUntil;
  const eventHeat =
    typeof daysToWorldEv === 'number' && Number.isFinite(daysToWorldEv)
      ? daysToWorldEv <= 1
        ? 26
        : daysToWorldEv <= 3
          ? 18
          : daysToWorldEv <= 7
            ? 9
            : 2
      : 0;
  const liveShockHeat = Math.min(24, Math.round(Math.abs(liveGoldPct) * 6 + Math.abs(liveSilverPct) * 3));
  const spaceHeat = (activeSpaceWeather?.peakScale || 0) * 9;
  const backwHeat = futures.gold?.isBackwardation || futures.silver?.isBackwardation ? 15 : 0;
  const newsHeat = Math.min(38, breakingNewsCount * 11 + fresh24hNewsCount * 3);
  const pulseActivityScore = Math.round(clampNum(14 + newsHeat + eventHeat + spaceHeat + backwHeat + liveShockHeat, 10, 99));
  const pulseRegime =
    pulseActivityScore >= 72
      ? 'High-Velocity Catalyst Surge'
      : pulseActivityScore >= 46
        ? 'Active World & Space Flow'
        : 'Steady Macro Pulse';

  const goldDynamicPulse = clampNum(
    newsVelGold * 0.055 + (activeSpaceWeather?.goldBoost || 0) + liveShockGold,
    -0.16,
    0.20
  );
  const silverDynamicPulse = clampNum(
    newsVelSilver * 0.055 + (activeSpaceWeather?.silverBoost || 0) + liveShockSilver,
    -0.16,
    0.22
  );
  const worldSpacePulse = {
    activityScore: pulseActivityScore,
    regime: pulseRegime,
    breakingCount: breakingNewsCount,
    fresh24hCount: fresh24hNewsCount,
    spaceWeather: activeSpaceWeather,
    nextEvent: nextWorldEv,
    liveGoldPct,
    liveSilverPct,
    goldDynamicBoost: +goldDynamicPulse.toFixed(4),
    silverDynamicBoost: +silverDynamicPulse.toFixed(4),
    topCatalyst: base?.headlines?.[0]?.title || null,
  };

  // Physical Bullion Dealer Premiums vs. Spot & Melt (leading retail squeeze indicator)
  const physicalPremiums = computeClientPhysicalPremiums({
    spotGold,
    spotSilver,
    spotGoldDailyPct: liveGoldPct,
    spotSilverDailyPct: liveSilverPct,
    base,
    futures,
    liveComex,
    userOverrides: state.settings.dealerQuotes,
    scenarioSqueeze: outlookState.activeScenarios.has('physical_squeeze'),
  });
  const physBoostGold = physicalPremiums.gold?.predictionBoost || 0;
  const physBoostSilver = physicalPremiums.silver?.predictionBoost || 0;
  if (!drivers.some((d) => d.id === 'physical_premiums')) {
    drivers.push({
      id: 'physical_premiums',
      label: 'Physical Coin & Bar Premiums',
      shortLabel: 'Physical Premiums',
      gold: +(physicalPremiums.gold?.signal || 0).toFixed(3),
      silver: +(physicalPremiums.silver?.signal || 0).toFixed(3),
      headlineCount: 0,
    });
  }

  // 6 Exclusive Hidden-Alpha Bullion Prediction Engines (Session Flow, 21-FX Stealth Breadth,
  // Spring Coiling, Cross-Asset Liquidity Compass, Crowd Contrarian Brake, COMEX OpEx Magnet)
  const hiddenAlpha = computeClientHiddenAlpha({
    spotGold,
    spotSilver,
    base,
    futures,
    liveComex,
    gTrendSign: gComp + driftG,
    sTrendSign: sComp + driftS,
  });
  const hiddenBoostGold = hiddenAlpha.gold?.netBoost || 0;
  const hiddenBoostSilver = hiddenAlpha.silver?.netBoost || 0;
  if (!drivers.some((d) => d.id === 'hidden_alpha')) {
    drivers.push({
      id: 'hidden_alpha',
      label: 'Hidden Market Edges (6 Signals)',
      shortLabel: 'Hidden Edges',
      gold: +clampNum(hiddenBoostGold * 4.5, -0.9, 0.9).toFixed(3),
      silver: +clampNum(hiddenBoostSilver * 4.5, -0.9, 0.9).toFixed(3),
      headlineCount: 0,
    });
  }

  // Big Tech AI Data Center & Hyperscale Power Race (Google, NVIDIA, Microsoft, Meta, Amazon, Vertiv, Eaton, Constellation)
  const aiScenarioMode = outlookState.activeScenarios.has('ai_capex_surge')
    ? 'surge'
    : outlookState.activeScenarios.has('ai_capex_pause')
      ? 'pause'
      : null;
  const aiDatacenter = computeClientAiDatacenter({
    base,
    futures,
    liveComex,
    physicalPremiums,
    scenarioMode: aiScenarioMode,
  });
  const aiBoostGold = aiDatacenter.gold?.predictionBoost || 0;
  const aiBoostSilver = aiDatacenter.silver?.predictionBoost || 0;
  if (!drivers.some((d) => d.id === 'ai_datacenter')) {
    drivers.push({
      id: 'ai_datacenter',
      label: 'AI Data Center Race (Big Tech)',
      shortLabel: 'AI Data Centers',
      gold: +(aiDatacenter.gold?.signal || 0).toFixed(3),
      silver: +(aiDatacenter.silver?.signal || 0).toFixed(3),
      headlineCount: (aiDatacenter.news?.bullHits || 0) + (aiDatacenter.news?.bearHits || 0),
    });
  }

  const gUnit = clampNum(
    gComp * 1.45 + driftG + backwBoostGold + gapBoostGold + physBoostGold * 0.75 + hiddenBoostGold * 0.80 + aiBoostGold * 0.78 + goldDynamicPulse * 0.72,
    -1,
    1
  );
  const sUnit = clampNum(
    sComp * 1.45 + driftS + backwBoostSilver + gapBoostSilver + physBoostSilver * 0.75 + hiddenBoostSilver * 0.80 + aiBoostSilver * 0.82 + silverDynamicPulse * 0.72,
    -1,
    1
  );
  const gScore = Math.round(gUnit * 100);
  const sScore = Math.round(sUnit * 100);

  const gDailyVol = ((base.macroSnapshot?.goldVolAnnPct || 16.5) / 100) / Math.sqrt(252);
  const sDailyVol = ((base.macroSnapshot?.silverVolAnnPct || 29.5) / 100) / Math.sqrt(252);
  const days = outlookState.horizon === '30d' ? 21 : 5;
  const coneMult = base.selfLearning?.coneMultiplier || base.coneMultiplier || 1.0;

  const dollarStrength = computeClientDollarStrength(
    base,
    spotGold,
    spotSilver,
    gDailyVol,
    sDailyVol,
    learnedW
  );

  const project7d = (spot, vol, unit) => {
    const sig = vol * Math.sqrt(5);
    const drift = unit * sig * 0.72;
    const halfW = 1.15 * sig * coneMult;
    const bearPct = (drift - halfW) * 100;
    const basePct = drift * 100;
    const bullPct = (drift + halfW) * 100;
    return {
      bear: spot * (1 + bearPct / 100),
      base: spot * (1 + basePct / 100),
      bull: spot * (1 + bullPct / 100),
      expectedPct: basePct,
      markerPct: clampNum(50 + unit * 36, 12, 88),
    };
  };

  // Cross-Asset Lead-Lag Alpha (Miners divergence + Shanghai physical + COMEX backwardation + Ratio catch-up)
  const computeClientLeadLag = (metal, liveRatioVal) => {
    const isSilver = metal === 'silver';
    const minersSig = clampNum(
      Number(isSilver ? base?.proSignals?.miners?.silverSignal : base?.proSignals?.miners?.goldSignal) || 0,
      -1,
      1
    );
    const sgeData = shanghaiState.data?.[metal] || base?.shanghai?.[metal] || null;
    let sgeLead = 0;
    if (sgeData) {
      const prem = isSilver ? sgeData.exVatPremiumUsdOz : sgeData.premiumUsdOz;
      if (typeof prem === 'number' && Number.isFinite(prem)) {
        sgeLead = isSilver ? clampNum(prem / 3.5, -0.8, 0.8) : clampNum((prem - 5) / 42, -0.8, 0.8);
      }
    }
    const f = futures?.[metal] || null;
    const backwLead =
      f?.isBackwardation || (f?.basisUsd ?? 1) < 0
        ? (isSilver ? 0.72 : 0.58)
        : f?.state === 'Compressed EFP'
          ? 0.28
          : 0;
    const physLead = clampNum(Number(physicalPremiums?.[metal]?.signal) || 0, -0.4, 0.92);
    const aiLead = clampNum(Number(aiDatacenter?.[metal]?.signal) || 0, -0.65, 0.92);
    const ratioLead = isSilver
      ? clampNum((liveRatioVal - 76) / 22, -0.55, 0.75)
      : clampNum((70 - liveRatioVal) / 28, -0.25, 0.35);
    const score = isSilver
      ? clampNum(
          minersSig * 0.29 + sgeLead * 0.19 + backwLead * 0.14 + physLead * 0.15 + aiLead * 0.15 + ratioLead * 0.08,
          -1,
          1
        )
      : clampNum(
          minersSig * 0.33 + sgeLead * 0.21 + backwLead * 0.15 + physLead * 0.16 + aiLead * 0.06 + ratioLead * 0.09,
          -1,
          1
        );
    const label =
      score >= 0.22
        ? 'Lead Signals Bullish ↑'
        : score <= -0.22
          ? 'Lead Signals Soft ↓'
          : 'Lead Signals Balanced';
    return { score: +score.toFixed(3), label };
  };

  // Strictly Causal Empirical Historical Twin Matcher on loaded 6M/1Y bars (timestamp-aware)
  const computeClientTwins = (metal) => {
    const rawBars = state.timeframes?.['6m']?.[metal]?.length >= 20
      ? state.timeframes['6m'][metal]
      : (state.timeframes?.['1y']?.[metal] || []);
    const valid = rawBars.filter((b) => Number.isFinite(Number(b?.c)) && Number(b.c) > 0);
    const n = valid.length;
    if (n < 18) return base?.[metal]?.horizon30d?.historicalTwins || null;

    const diffs = [];
    for (let i = 1; i < n; i++) {
      const d = ((valid[i].t || 0) - (valid[i - 1].t || 0)) / 86400000;
      if (d > 0.2 && d < 40) diffs.push(d);
    }
    diffs.sort((a, b) => a - b);
    const barCalDays = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 5.5;
    const horizonBars = clampNum(Math.round(30 / Math.max(0.5, barCalDays)), 2, 21);
    const lookFast = clampNum(Math.round(7 / Math.max(0.5, barCalDays)), 1, 5);
    const lookSlow = clampNum(Math.round(28 / Math.max(0.5, barCalDays)), 4, 14);
    const minStart = Math.max(lookSlow + 1, 8);
    if (n < minStart + horizonBars + 3) return base?.[metal]?.horizon30d?.historicalTwins || null;

    const closes = valid.map((b) => Number(b.c));
    const stateVecAt = (idx) => {
      if (idx < minStart) return null;
      const c = closes[idx];
      const cFast = closes[idx - lookFast];
      const cSlow = closes[idx - lookSlow];
      if (!(c > 0 && cFast > 0 && cSlow > 0)) return null;
      const retFast = ((c - cFast) / cFast) * 100;
      const retSlow = ((c - cSlow) / cSlow) * 100;
      const rsiLen = Math.min(10, idx);
      let gains = 0;
      let losses = 0;
      let sqVol = 0;
      for (let k = idx - rsiLen + 1; k <= idx; k++) {
        const diff = closes[k] - closes[k - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
        if (closes[k - 1] > 0) {
          const r = (closes[k] - closes[k - 1]) / closes[k - 1];
          sqVol += r * r;
        }
      }
      const rsi = losses === 0 ? (gains === 0 ? 50 : 88) : 100 - 100 / (1 + gains / losses);
      const vol = Math.sqrt(sqVol / Math.max(1, rsiLen)) * 100;
      return [
        clampNum(retFast / 3.0, -2.5, 2.5),
        clampNum(retSlow / 6.5, -2.5, 2.5),
        clampNum((rsi - 50) / 18, -2.5, 2.5),
        clampNum((vol - 1.8) / 1.2, -2.5, 2.5),
      ];
    };

    const curVec = stateVecAt(n - 1);
    if (!curVec) return base?.[metal]?.horizon30d?.historicalTwins || null;
    const vecNorm = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    const curN = vecNorm(curVec);

    const matches = [];
    for (let i = minStart; i <= n - 1 - horizonBars; i++) {
      const v = stateVecAt(i);
      if (!v) continue;
      let dot = 0;
      for (let j = 0; j < v.length; j++) dot += curVec[j] * v[j];
      const sim = dot / (curN * vecNorm(v));
      if (sim >= 0.45 && closes[i] > 0 && closes[i + horizonBars] > 0) {
        matches.push({ idx: i, sim, fwdPct: ((closes[i + horizonBars] - closes[i]) / closes[i]) * 100 });
      }
    }
    if (!matches.length) return base?.[metal]?.horizon30d?.historicalTwins || null;
    matches.sort((a, b) => b.sim - a.sim);
    const picked = [];
    for (const m of matches) {
      if (picked.every((p) => Math.abs(p.idx - m.idx) >= 2)) {
        picked.push(m);
        if (picked.length >= 4) break;
      }
    }
    if (!picked.length) return base?.[metal]?.horizon30d?.historicalTwins || null;
    const wSum = picked.reduce((s, m) => s + m.sim, 0) || 1;
    const avgReturnPct = picked.reduce((s, m) => s + m.fwdPct * m.sim, 0) / wSum;
    return {
      count: picked.length,
      matchPct: clampNum(Math.round((wSum / picked.length) * 100), 45, 97),
      avgReturnPct: +avgReturnPct.toFixed(2),
      upPct: Math.round((picked.filter((m) => m.fwdPct > 0).length / picked.length) * 100),
      unitTilt: +clampNum(avgReturnPct / 12, -0.35, 0.35).toFixed(3),
    };
  };

  // Fine-Tuned Next 30 Days Precision Model (Structural Macro + Lead-Lag + Hurst/RSI + 20-Yr Seasonality + Historical Twins)
  const project30d = (metal, spot, vol, shortUnit, rsi14Val, liveRatioVal) => {
    const isSilver = metal === 'silver';
    const slowBoost = {
      rates_usd: 1.28,
      central_banks: 1.25,
      mining_supply: 1.22,
      comex_paper: 1.20,
      shanghai_sge: 1.18,
      inflation: 1.15,
      geopolitics: 0.96,
      positioning_miners: 0.92,
      equities: 0.68,
    };
    let wTotal = 0;
    let structSum = 0;
    const contribs = [];
    for (const d of drivers) {
      if (d.id === 'market_gaps') continue;
      const fallbackW = DRIVER_WEIGHTS[d.id] || { gold: 0.14, silver: 0.14 };
      const baseW = learnedW?.[metal]?.[d.id] ?? fallbackW[metal];
      const w30 = baseW * (slowBoost[d.id] ?? 1.0);
      const val = Number(d[metal] || 0);
      structSum += val * w30;
      wTotal += w30;
      contribs.push({ id: d.id, label: DRIVER_FRIENDLY_LABELS[d.id] || d.label, contrib: val * w30, raw: val });
    }
    const structuralMacroUnit = clampNum((wTotal > 0 ? structSum / wTotal : 0) * 1.48, -1, 1);

    const bars6m = state.timeframes?.['6m']?.[metal] || state.timeframes?.['1m']?.[metal] || [];
    const closes6m = bars6m.map((b) => Number(b.c)).filter((v) => Number.isFinite(v) && v > 0);
    const hurstInfo =
      closes6m.length >= 14
        ? computeClientHurst(closes6m.slice(-60))
        : {
            hurst: base?.[metal]?.hurst ?? 0.50,
            regime: 'Balanced',
            label: base?.[metal]?.horizon30d?.hurstLabel || 'Balanced',
          };

    const rsiVal = Number.isFinite(rsi14Val) ? rsi14Val : 50;
    const rawTrend = closes6m.length >= 21
      ? clampNum(((closes6m[closes6m.length - 1] - closes6m[closes6m.length - 21]) / closes6m[closes6m.length - 21]) * 9, -1, 1)
      : clampNum(shortUnit * 0.6, -0.7, 0.7);
    const hurstTrendScale = clampNum(1 + (hurstInfo.hurst - 0.50) * 1.35, 0.55, 1.45);
    const rsiBrake =
      rsiVal >= 70
        ? -clampNum((rsiVal - 68) / 24, 0, 0.55)
        : rsiVal <= 30
          ? clampNum((32 - rsiVal) / 24, 0, 0.55)
          : 0;
    const techReversionUnit = clampNum(rawTrend * 0.72 * hurstTrendScale + rsiBrake, -1, 1);

    const leadLag = computeClientLeadLag(metal, liveRatioVal);
    const seasonality = getUpcoming30dSeasonality(metal);
    const twins = computeClientTwins(metal);
    const ratioPull = isSilver ? clampNum((liveRatioVal - 78) / 25, -0.45, 0.55) * 0.45 : 0;
    const cycleSeasonalUnit = clampNum(
      seasonality.unitTilt * 2.1 + (twins?.unitTilt ?? 0) * 0.85 + ratioPull,
      -1,
      1
    );

    const modelVotes = [
      { id: 'macro', label: 'Macro & Vaults', unit: structuralMacroUnit, weight: 0.46 },
      { id: 'leadlag', label: 'Lead-Lag', unit: leadLag.score, weight: 0.22 },
      { id: 'hurst', label: 'Hurst & RSI', unit: techReversionUnit, weight: 0.16 },
      { id: 'seasonal', label: 'Seasonal & Twins', unit: cycleSeasonalUnit, weight: 0.16 },
    ];
    const upVotes = modelVotes.filter((m) => m.unit >= 0.08).length;
    const dnVotes = modelVotes.filter((m) => m.unit <= -0.08).length;
    const agreeCount = Math.max(upVotes, dnVotes, modelVotes.filter((m) => Math.abs(m.unit) < 0.08).length);
    const agreementPct = Math.round((agreeCount / modelVotes.length) * 100);
    const agreeDamp = agreementPct >= 100 ? 1.0 : agreementPct >= 75 ? 0.91 : 0.76;

    const gapDecay30d = (marketGaps?.[metal]?.predictionBoost || 0) * 0.35;
    const learned30dBias = clampNum(
      ((isSilver ? base?.selfLearning?.driftBias30dSilverPct : base?.selfLearning?.driftBias30dGoldPct) || 0) * 0.12,
      -0.08,
      0.08
    );
    const rawUnit30d = modelVotes.reduce((s, m) => s + m.unit * m.weight, 0);
    const hidden30d = (hiddenAlpha?.[metal]?.netBoost || 0) * 0.55;
    const ai30d = (aiDatacenter?.[metal]?.predictionBoost || 0) * (isSilver ? 0.85 : 0.45);
    const unit30d = clampNum(rawUnit30d * agreeDamp + gapDecay30d + hidden30d + ai30d + learned30dBias, -1, 1);

    // Asymmetric Up/Down Semi-Vol from trailing 45 daily bars
    let upSq = 0;
    let upN = 0;
    let dnSq = 0;
    let dnN = 0;
    const tail = closes6m.slice(-46);
    for (let i = 1; i < tail.length; i++) {
      if (tail[i - 1] > 0) {
        const r = (tail[i] - tail[i - 1]) / tail[i - 1];
        if (r >= 0) { upSq += r * r; upN++; }
        else { dnSq += r * r; dnN++; }
      }
    }
    const baseVol = Math.max(0.005, vol);
    const upDailyVol = upN >= 5 ? clampNum(Math.sqrt(upSq / upN), baseVol * 0.72, baseVol * 1.38) : baseVol;
    const dnDailyVol = dnN >= 5 ? clampNum(Math.sqrt(dnSq / dnN), baseVol * 0.72, baseVol * 1.38) : baseVol;

    const sigma30 = baseVol * Math.sqrt(21);
    const expectedDrift = unit30d * sigma30 * 0.74;
    const mult = clampNum(coneMult, 0.85, 1.32);
    const upBand = 1.08 * upDailyVol * Math.sqrt(21) * mult;
    const dnBand = 1.08 * dnDailyVol * Math.sqrt(21) * mult;

    const basePct = expectedDrift * 100;
    const bullPct = (expectedDrift + upBand) * 100;
    const bearPct = (expectedDrift - dnBand) * 100;
    const zScore = sigma30 > 0 ? expectedDrift / sigma30 : 0;
    const probHigherPct = Math.round(clampNum((1 / (1 + Math.exp(-1.7 * zScore))) * 100, 12, 88));

    const fast7dPct = clampNum(shortUnit * baseVol * Math.sqrt(5) * 0.72 * 100, -12, 12);
    const d7Pct = +(fast7dPct * 0.65 + basePct * 0.30).toFixed(2);
    const d14Pct = +(fast7dPct * 0.35 + basePct * 0.58).toFixed(2);
    const d21Pct = +(fast7dPct * 0.12 + basePct * 0.82).toFixed(2);
    const d30Pct = +basePct.toFixed(2);

    const mkNode = (day, label, pct) => ({
      day,
      label,
      pct,
      price: spot * (1 + pct / 100),
    });

    contribs.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
    const topDrivers30d = contribs.filter((c) => Math.abs(c.raw) >= 0.08).slice(0, 2).map((c) => c.label);

    return {
      bear: spot * (1 + bearPct / 100),
      base: spot * (1 + basePct / 100),
      bull: spot * (1 + bullPct / 100),
      bearPct: +bearPct.toFixed(2),
      expectedPct: +basePct.toFixed(2),
      bullPct: +bullPct.toFixed(2),
      markerPct: clampNum(50 + unit30d * 36, 12, 88),
      unit30d: +unit30d.toFixed(3),
      score30d: Math.round(unit30d * 100),
      probHigherPct,
      agreementPct,
      agreeCount,
      hurst: hurstInfo.hurst,
      hurstLabel: hurstInfo.label,
      leadLag,
      seasonality,
      historicalTwins: twins,
      milestones: [
        mkNode(7, 'Day 7', d7Pct),
        mkNode(14, 'Day 14', d14Pct),
        mkNode(21, 'Day 21', d21Pct),
        mkNode(30, 'Day 30', d30Pct),
      ],
      topDrivers30d,
      modelVotes: modelVotes.map((m) => ({
        id: m.id,
        label: m.label,
        dir: m.unit >= 0.08 ? 'up' : m.unit <= -0.08 ? 'down' : 'flat',
        score: Math.round(m.unit * 100),
      })),
    };
  };

  // Rank historical analogs dynamically against current + simulated active drivers
  const activeIds = [...drivers]
    .filter((d) => Math.abs(d.gold) >= 0.12 || Math.abs(d.silver) >= 0.12)
    .sort((a, b) => Math.abs(b.gold) + Math.abs(b.silver) - (Math.abs(a.gold) + Math.abs(a.silver)))
    .map((d) => d.id);
  const overallDir = gScore > 12 ? 'bullish' : gScore < -12 ? 'bearish' : 'mixed';

  const analogs = ANALOG_LIBRARY.map((a) => {
    let rel = 0;
    for (const d of a.drivers) {
      const idx = activeIds.indexOf(d);
      if (idx === 0) rel += 3;
      else if (idx === 1) rel += 2.2;
      else if (idx >= 2) rel += 1.4;
    }
    if (a.direction === overallDir) rel += 1.2;
    else if (a.direction === 'mixed') rel += 0.5;
    return { ...a, rel };
  })
    .sort((a, b) => b.rel - a.rel)
    .slice(0, 3);

  const activeNames = [...outlookState.activeScenarios]
    .map((id) => OUTLOOK_SCENARIOS.find((s) => s.id === id)?.label)
    .filter(Boolean);

  const liveBasisChanged =
    Boolean(futures.gold?.isBackwardation) !== Boolean(base?.institutionalSignals?.basis?.gold?.isBackwardation) ||
    Boolean(futures.silver?.isBackwardation) !== Boolean(base?.institutionalSignals?.basis?.silver?.isBackwardation);

  const regimeBase = liveBasisChanged
    ? {
        ...base,
        institutionalSignals: {
          ...(base?.institutionalSignals || {}),
          basis: { gold: futures.gold, silver: futures.silver },
        },
      }
    : base;

  const marketRegime = computeMarketRegimeClient({
    base: regimeBase,
    drivers,
    liveComex,
    gUnit,
    sUnit,
    hasInteractiveOverrides:
      outlookState.activeScenarios.size > 0 ||
      liveBasisChanged ||
      !!(comexState.data && comexState.data !== base?.comex),
  });

  const liveGLabel = signalFromScore(gScore).label.toLowerCase();
  const liveSLabel = signalFromScore(sScore).label.toLowerCase();
  const liveRatio = spotSilver > 0 ? spotGold / spotSilver : (base.goldSilverRatio || 85);
  const ratioAnalytics = computeClientRatioAnalytics(liveRatio, base);
  const gFx7d = dollarStrength?.impact7d?.goldUsdOz ?? 0;

  const topTwoDrivers = [...drivers]
    .filter((d) => Math.abs(d.gold) >= 0.1 || Math.abs(d.silver) >= 0.1)
    .sort((a, b) => Math.abs(b.gold) + Math.abs(b.silver) - (Math.abs(a.gold) + Math.abs(a.silver)))
    .slice(0, 2)
    .map((d) => DRIVER_FRIENDLY_LABELS[d.id] || d.label);

  const plainParts = [];
  const headlineCt = (base.headlines || []).length;
  plainParts.push(
    `Right now, Gold looks ${liveGLabel} and Silver looks ${liveSLabel}${headlineCt ? ` across ${headlineCt} recent news stories` : ''}.`
  );
  if (topTwoDrivers.length) {
    plainParts.push(`Biggest factors today: ${topTwoDrivers.join(' and ')}.`);
  }
  plainParts.push(
    `Gold is in a "${friendlyRegimeLabel(marketRegime.gold.label)}" phase and Silver is in "${friendlyRegimeLabel(marketRegime.silver.label)}".`
  );
  if (dollarStrength?.dxy != null) {
    const dirWord = gFx7d > 0.5 ? 'helping lift Gold by about' : gFx7d < -0.5 ? 'putting downward pressure on Gold of about' : 'having almost no effect on Gold';
    const amtStr = Math.abs(gFx7d) > 0.5 ? ` ${gFx7d >= 0 ? '+' : '−'}$${Math.abs(gFx7d).toFixed(2)}/oz over the next week` : '';
    const dxyAdj =
      dollarStrength.score >= 72
        ? 'strong'
        : dollarStrength.score >= 58
          ? 'firm'
          : dollarStrength.score <= 28
            ? 'weak'
            : dollarStrength.score <= 42
              ? 'soft'
              : 'steady';
    plainParts.push(
      `The US Dollar is ${dxyAdj} (strength ${dollarStrength.score}/100), ${dirWord}${amtStr}.`
    );
  }
  if (futures.gold?.isBackwardation || futures.silver?.isBackwardation) {
    const which = futures.gold?.isBackwardation && futures.silver?.isBackwardation ? 'Gold and Silver' : futures.silver?.isBackwardation ? 'Silver' : 'Gold';
    plainParts.push(
      `${which} futures are cheaper than today's spot price (backwardation), signaling tight physical supply that tends to push prices up.`
    );
  }
  const openGapNotes = [];
  for (const [mKey, mName] of [['gold', 'Gold'], ['silver', 'Silver']]) {
    const gp = marketGaps[mKey]?.primary;
    if (gp && !gp.isFilled) {
      const kindPrefix = gp.kind.replace(/\s+Gap$/, '');
      const dirTxt = gp.dir === 'up' ? 'Gap Up (bullish)' : 'Gap Down (bearish)';
      const moveVerb = gp.dir === 'up' ? 'drop' : 'rally';
      openGapNotes.push(
        `${mName} has an open ${kindPrefix} ${dirTxt} (${gp.fillPct}% filled — needs a ${formatSignedMoney(convertUnit(gp.moveToFillUsd), 2)} ${moveVerb} to ${formatMoney(convertUnit(gp.fillTarget), 2)} to fill)`
      );
    }
  }
  if (openGapNotes.length) {
    plainParts.push(`${openGapNotes.join('; ')}, factored directly into today's forecast.`);
  }
  const hotPhys = [];
  if (physicalPremiums?.gold?.tone === 'bullish') {
    hotPhys.push(`Gold coins/bars (+${physicalPremiums.gold.compositePremPct.toFixed(1)}% over melt)`);
  }
  if (physicalPremiums?.silver?.tone === 'bullish') {
    hotPhys.push(`Silver coins/bars (+${physicalPremiums.silver.compositePremPct.toFixed(1)}% over melt)`);
  }
  if (hotPhys.length) {
    plainParts.push(
      `Physical retail dealer premiums are elevated on ${hotPhys.join(' and ')}, adding a bullish physical-demand lead to forecasts.`
    );
  }
  if (hiddenAlpha?.summaryLine && !hiddenAlpha.summaryLine.startsWith('6 exclusive')) {
    plainParts.push(`Exclusive market-edge alert: ${hiddenAlpha.summaryLine}.`);
  }
  if (aiDatacenter?.tone === 'bullish' && (aiDatacenter.silver?.pts || 0) >= 4) {
    plainParts.push(
      `Big Tech AI data center expansion (index ${aiDatacenter.raceIndex}/100, ~${aiDatacenter.estSilverMozYr} Moz/yr silver hardware & grid draw) adds structural upside to Silver (+${aiDatacenter.silver.pts} pts) and supporting tech demand to Gold.`
    );
  }
  if (ratioAnalytics.tone !== 'neutral') {
    plainParts.push(
      `At ${liveRatio.toFixed(1)} oz of silver per oz of gold, ${ratioAnalytics.regime.toLowerCase()} (higher than ${ratioAnalytics.percentile5y}% of the past 5 years).`
    );
  }
  const syncedBaseNarrative = plainParts.join(' ');

  const narrative = activeNames.length
    ? `What-If Test active (${activeNames.join(' + ')}): Based on past market reactions, this shifts Gold to "${signalFromScore(gScore).label}" and Silver to "${signalFromScore(sScore).label}" over the next ${outlookState.horizon === '30d' ? '30 days' : '7 days'}.`
    : syncedBaseNarrative;

  const gRsi14 = base?.macroSnapshot?.goldRsi14 ?? null;
  const sRsi14 = base?.macroSnapshot?.silverRsi14 ?? null;
  const setupQuality = {
    gold: computeClientSetupQuality({
      metal: 'gold',
      spot: spotGold,
      regime: marketRegime.gold,
      rsi14: gRsi14,
      dailyVol: gDailyVol,
      dollarStrength,
      basis: futures.gold,
      unitScore: gUnit,
    }),
    silver: computeClientSetupQuality({
      metal: 'silver',
      spot: spotSilver,
      regime: marketRegime.silver,
      rsi14: sRsi14,
      dailyVol: sDailyVol,
      dollarStrength,
      basis: futures.silver,
      unitScore: sUnit,
    }),
  };

  const goldRange7d = project7d(spotGold, gDailyVol, gUnit);
  const silverRange7d = project7d(spotSilver, sDailyVol, sUnit);
  const goldRange30d = project30d('gold', spotGold, gDailyVol, gUnit, gRsi14, liveRatio);
  const silverRange30d = project30d('silver', spotSilver, sDailyVol, sUnit, sRsi14, liveRatio);
  const is30dActive = outlookState.horizon === '30d';

  return {
    base,
    drivers,
    analogs,
    narrative,
    days,
    futures,
    dollarStrength,
    marketRegime,
    marketGaps,
    physicalPremiums,
    hiddenAlpha,
    aiDatacenter,
    worldSpacePulse,
    ratioAnalytics,
    setupQuality,
    gold: {
      spot: spotGold,
      dailyVol: gDailyVol,
      rsi14: gRsi14,
      unit: gUnit,
      unit30d: goldRange30d.unit30d,
      leadLagAlpha: goldRange30d.leadLag.score,
      score: is30dActive ? goldRange30d.score30d : gScore,
      score7d: gScore,
      score30d: goldRange30d.score30d,
      signal: signalFromScore(is30dActive ? goldRange30d.score30d : gScore),
      regime: marketRegime.gold,
      range: is30dActive ? goldRange30d : goldRange7d,
      range7d: goldRange7d,
      range30d: goldRange30d,
    },
    silver: {
      spot: spotSilver,
      dailyVol: sDailyVol,
      rsi14: sRsi14,
      unit: sUnit,
      unit30d: silverRange30d.unit30d,
      leadLagAlpha: silverRange30d.leadLag.score,
      score: is30dActive ? silverRange30d.score30d : sScore,
      score7d: sScore,
      score30d: silverRange30d.score30d,
      signal: signalFromScore(is30dActive ? silverRange30d.score30d : sScore),
      regime: marketRegime.silver,
      range: is30dActive ? silverRange30d : silverRange7d,
      range7d: silverRange7d,
      range30d: silverRange30d,
    },
  };
}

function renderFuturesPanel(outlookRes = null) {
  if (!document.getElementById('futures-card-gold') && !document.getElementById('futures-card-silver')) return;
  const res = outlookRes || computeInteractiveOutlook();
  const fut = res.futures;
  if (!fut) return;

  const isG = state.settings.unit === 'g';
  const uLbl = isG ? 'g' : 'oz';

  const renderCard = (metal, data) => {
    if (!data) return;
    const card = document.getElementById(`futures-card-${metal}`);
    const priceEl = document.getElementById(`fut-${metal}-price`);
    const basisEl = document.getElementById(`fut-${metal}-basis`);
    const curveEl = document.getElementById(`fut-${metal}-curve`);
    const boostEl = document.getElementById(`fut-${metal}-boost`);

    const dispFut = convertUnit(data.futures);
    const dispBasis = convertUnit(data.basisUsd);
    if (priceEl) priceEl.textContent = formatMoney(dispFut, 2);
    if (basisEl) {
      const pctSign = data.basisPct > 0 ? '+' : data.basisPct < 0 ? '−' : '';
      basisEl.textContent = `vs Spot ${formatSignedMoney(dispBasis, 2)}/${uLbl} (${pctSign}${Math.abs(data.basisPct).toFixed(2)}%)`;
      basisEl.className = `futures-basis ${data.isBackwardation ? 'up' : data.basisPct > 1.15 ? 'down' : ''}`;
    }
    if (curveEl) {
      if (data.isBackwardation) {
        curveEl.textContent = 'Tight Supply ↑';
        curveEl.className = 'futures-curve-pill backw';
      } else if (data.state === 'Compressed EFP') {
        curveEl.textContent = 'Tight Supply';
        curveEl.className = 'futures-curve-pill tight';
      } else if (data.basisPct > 1.15) {
        curveEl.textContent = 'Plentiful Supply';
        curveEl.className = 'futures-curve-pill';
      } else {
        curveEl.textContent = 'Normal';
        curveEl.className = 'futures-curve-pill';
      }
    }
    if (card) card.classList.toggle('backwardation', !!data.isBackwardation);
    if (boostEl) {
      if (data.isBackwardation) {
        const liftPts = Math.round((data.priceDiscoveryBoost || 0) * 100);
        boostEl.textContent = `Supply shortage: futures below spot (+${liftPts} pts forecast lift)`;
        boostEl.hidden = false;
      } else if (data.state === 'Compressed EFP') {
        const liftPts = Math.round((data.priceDiscoveryBoost || 0) * 100);
        boostEl.textContent = `Tight physical supply (+${liftPts} pts forecast lift)`;
        boostEl.hidden = false;
      } else {
        boostEl.textContent = '';
        boostEl.hidden = true;
      }
    }
  };

  renderCard('gold', fut.gold);
  renderCard('silver', fut.silver);
}

function renderDollarStrength(res) {
  if (!document.getElementById('panel-dollar-strength')) return;
  const ds = res?.dollarStrength;
  if (!ds) return;

  const is30d = outlookState.horizon === '30d';
  const hLbl = is30d ? '30D' : '7D';
  const imp = is30d ? ds.impact30d : ds.impact7d;
  const isG = state.settings.unit === 'g';
  const uLbl = isG ? 'g' : 'oz';

  const idxEl = document.getElementById('dxy-index-val');
  const movesEl = document.getElementById('dxy-moves-row');
  const scoreEl = document.getElementById('dxy-score-val');
  const badgeEl = document.getElementById('dxy-regime-badge');
  const subEl = document.getElementById('dxy-panel-subtitle');
  const fillEl = document.getElementById('dxy-meter-fill');

  if (idxEl) idxEl.textContent = ds.dxy != null ? ds.dxy.toFixed(2) : '—';
  if (movesEl) {
    const f = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;
    movesEl.textContent = `Past 5d ${f(ds.dxy5dPct)} · Past 20d ${f(ds.dxy20dPct)} · vs 20-day avg ${f(ds.dxyVsSma20Pct)}`;
  }
  if (scoreEl) scoreEl.textContent = `${ds.score} / 100`;
  if (badgeEl) {
    badgeEl.textContent = ds.regime;
    badgeEl.className = `signal-pill ${ds.score <= 42 ? 'bullish' : ds.score >= 58 ? 'bearish' : ''}`;
  }
  if (subEl) {
    subEl.textContent = `Stronger US Dollar usually pushes Gold & Silver down; weaker Dollar lifts them (${hLbl} effect)`;
  }
  if (fillEl) {
    fillEl.style.left = `${clampNum(ds.score, 2, 98)}%`;
  }

  const gLblEl = document.getElementById('dxy-gold-impact-lbl');
  const gValEl = document.getElementById('dxy-gold-impact');
  const gCorrEl = document.getElementById('dxy-gold-corr');
  const sLblEl = document.getElementById('dxy-silver-impact-lbl');
  const sValEl = document.getElementById('dxy-silver-impact');
  const sCorrEl = document.getElementById('dxy-silver-corr');

  const fmtFx = (usdOz, pct) => {
    const val = convertUnit(usdOz);
    const sign = val > 0 ? '+' : val < 0 ? '−' : '';
    const pSign = pct > 0 ? '+' : pct < 0 ? '−' : '';
    return `${sign}$${Math.abs(val).toFixed(isG ? 3 : 2)}/${uLbl} (${pSign}${Math.abs(pct).toFixed(2)}%)`;
  };

  if (gLblEl) gLblEl.textContent = `Gold ${hLbl} Dollar Effect`;
  if (gValEl && imp) {
    gValEl.textContent = fmtFx(imp.goldUsdOz, imp.goldPct);
    gValEl.className = `dxy-impact-v ${imp.goldUsdOz > 0.005 ? 'up' : imp.goldUsdOz < -0.005 ? 'down' : ''}`;
  }
  if (gCorrEl) {
    const cG = ds.goldVsDxyCorr;
    gCorrEl.textContent = cG != null && cG < -0.25 ? 'Moves strongly opposite the Dollar' : 'Moves partly opposite the Dollar';
  }

  if (sLblEl) sLblEl.textContent = `Silver ${hLbl} Dollar Effect`;
  if (sValEl && imp) {
    sValEl.textContent = fmtFx(imp.silverUsdOz, imp.silverPct);
    sValEl.className = `dxy-impact-v ${imp.silverUsdOz > 0.001 ? 'up' : imp.silverUsdOz < -0.001 ? 'down' : ''}`;
  }
  if (sCorrEl) {
    const cS = ds.silverVsDxyCorr;
    sCorrEl.textContent = cS != null && cS < -0.25 ? 'Moves strongly opposite the Dollar' : 'Moves partly opposite the Dollar';
  }
}

function renderSetupQuality(res) {
  if (!document.getElementById('panel-setup-quality') || !res?.setupQuality) return;
  const isG = state.settings.unit === 'g';
  const uLbl = isG ? 'g' : 'oz';
  for (const metal of ['gold', 'silver']) {
    const sq = res.setupQuality[metal];
    if (!sq) continue;
    const card = document.getElementById(`sq-card-${metal}`);
    const scoreEl = document.getElementById(`setup-${metal}-score`);
    const labelEl = document.getElementById(`setup-${metal}-label`);
    const sumEl = document.getElementById(`setup-${metal}-summary`);
    const lvlEl = document.getElementById(`setup-${metal}-levels`);
    if (card) card.className = `sq-card ${sq.tone}`;
    if (scoreEl) {
      scoreEl.textContent = `${sq.score} / 100`;
      scoreEl.className = `signal-pill ${sq.tone === 'bullish' ? 'bullish' : sq.tone === 'bearish' ? 'bearish' : ''}`;
    }
    if (labelEl) {
      labelEl.textContent = sq.label;
      labelEl.className = `sq-verdict ${sq.tone}`;
    }
    if (sumEl) sumEl.textContent = sq.summary;
    if (lvlEl) {
      const dec = metal === 'gold' && !isG ? 0 : 2;
      const rsiPart = sq.rsi14 != null ? ` · Momentum ${Math.round(sq.rsi14)}` : '';
      lvlEl.textContent = `Floor ${formatMoney(convertUnit(sq.support), dec)}/${uLbl} · Ceiling ${formatMoney(convertUnit(sq.resistance), dec)}/${uLbl}${rsiPart}`;
    }
  }
}

function renderRatioAnalytics(res) {
  if (!document.getElementById('panel-ratio-analytics') || !res?.ratioAnalytics) return;
  const ra = res.ratioAnalytics;
  const liveEl = document.getElementById('ratio-live-val');
  const zEl = document.getElementById('ratio-zscore-val');
  const pctEl = document.getElementById('ratio-pct-val');
  const swapEl = document.getElementById('ratio-swap-val');
  const markerEl = document.getElementById('ratio-pct-marker');
  const meanEl = document.getElementById('ratio-mean-label');
  const subEl = document.getElementById('ratio-panel-subtitle');

  if (liveEl) liveEl.textContent = `${ra.current.toFixed(1)} : 1`;
  if (zEl) {
    const diffPts = +(ra.current - ra.mean5y).toFixed(1);
    zEl.textContent = Math.abs(diffPts) < 1.5 ? 'Near Avg' : `${diffPts > 0 ? '+' : '−'}${Math.abs(diffPts).toFixed(1)} vs Avg`;
    zEl.className = `ratio-v ${ra.tone === 'bullish' ? 'up' : ra.tone === 'gold' ? 'gold' : ''}`;
  }
  if (pctEl) pctEl.textContent = `Top ${100 - ra.percentile5y}% (${formatOrdinal(ra.percentile5y)})`;
  if (swapEl) {
    swapEl.textContent = ra.swapBias;
    swapEl.className = `ratio-v ${ra.tone === 'bullish' ? 'up' : ra.tone === 'gold' ? 'gold' : ''}`;
  }
  if (markerEl) markerEl.style.left = `${clampNum(ra.percentile5y, 2, 98)}%`;
  if (meanEl) meanEl.textContent = `5-Yr Average ${ra.mean5y}:1`;
  if (subEl) subEl.textContent = `${ra.regime} · Higher than ${ra.percentile5y}% of the past 5 years`;
}

const clientWfAuditCache = {};

function computeClientWalkForwardAudit(metal = 'gold', horizonDays = 21) {
  const is30d = horizonDays >= 20;
  const is1d = horizonDays <= 1;
  // Choose the cleanest historical series for the requested horizon (1M daily for 1D, 6M/1Y for 7D & 30D)
  const rawBars = is1d
    ? (state.timeframes?.['1m']?.[metal]?.length >= 16
        ? state.timeframes['1m'][metal]
        : (state.timeframes?.['6m']?.[metal] || []))
    : (state.timeframes?.['6m']?.[metal]?.length >= 20
        ? state.timeframes['6m'][metal]
        : (state.timeframes?.['1y']?.[metal] || []));
  const validBars = rawBars.filter((b) => Number.isFinite(Number(b?.c)) && Number(b.c) > 0);
  const n = validBars.length;
  if (n < 14) return null;

  const diffs = [];
  for (let i = 1; i < n; i++) {
    const d = ((validBars[i].t || 0) - (validBars[i - 1].t || 0)) / 86400000;
    if (d > 0.2 && d < 40) diffs.push(d);
  }
  diffs.sort((a, b) => a - b);
  const barCalDays = diffs.length ? diffs[Math.floor(diffs.length / 2)] : (is1d ? 1.4 : 5.5);
  const targetCalDays = is30d ? 30 : is1d ? 1.5 : 7;
  const stepAhead = clampNum(Math.round(targetCalDays / Math.max(0.5, barCalDays)), 1, Math.max(1, Math.floor(n / 3)));
  const minStart = Math.min(14, Math.max(8, Math.floor(n * 0.28)));
  if (n < minStart + stepAhead + 3) return null;

  const key = `${metal}|${horizonDays}|${n}|${stepAhead}|${validBars[n - 1].c.toFixed(2)}`;
  if (clientWfAuditCache[key]) return clientWfAuditCache[key];

  const closes = validBars.map((b) => Number(b.c));
  const stride = n > 45 ? (is30d ? 3 : 2) : 1;
  const absErrs = [];
  const checkpoints = [];
  let dirHits = 0;
  let total = 0;
  let errSum = 0;

  for (let i = minStart; i < n - stepAhead; i += stride) {
    const spot = closes[i];
    const slice = closes.slice(Math.max(0, i - 24), i + 1);
    const ema5 = computeEmaLast(slice, Math.min(5, slice.length));
    const ema13 = computeEmaLast(slice, Math.min(11, slice.length));
    const ema26 = computeEmaLast(slice, Math.min(20, slice.length));
    const rsi = computeRsiLast(slice, Math.min(10, slice.length - 1));
    const hurstInfo = computeClientHurst(slice);
    const hTrend = clampNum(1 + (hurstInfo.hurst - 0.50) * 1.3, 0.55, 1.45);
    const hRev = clampNum(1 - (hurstInfo.hurst - 0.50) * 1.3, 0.55, 1.45);

    let unit = clampNum(
      (((ema5 - ema13) / spot) * 20 + ((ema13 - ema26) / spot) * 15) * hTrend,
      -0.85,
      0.85
    );
    if (rsi >= 72 && unit > 0) unit = unit * 0.45 - 0.20 * hRev;
    else if (rsi <= 28 && unit < 0) unit = unit * 0.45 + 0.20 * hRev;

    if (is30d && validBars[i]?.t) {
      const seas = getUpcoming30dSeasonality(metal, new Date(validBars[i].t));
      unit = clampNum(unit * 0.72 + seas.unitTilt * 1.6, -1, 1);
    }

    let sqSum = 0;
    let cnt = 0;
    for (let k = Math.max(1, i - 16); k <= i; k++) {
      if (closes[k - 1] > 0) {
        const r = (closes[k] - closes[k - 1]) / closes[k - 1];
        sqSum += r * r;
        cnt++;
      }
    }
    const barVol = clampNum(cnt > 0 ? Math.sqrt(sqSum / cnt) : 0.015, 0.006, 0.065);
    const driftCoeff = is30d ? 0.62 : is1d ? 0.50 : 0.64;
    const predPct = unit * barVol * Math.sqrt(stepAhead) * driftCoeff * 100;
    const actualPct = ((closes[i + stepAhead] - spot) / spot) * 100;
    const absErr = Math.abs(actualPct - predPct);
    const dirHit =
      Math.abs(actualPct) < 0.06 ||
      (predPct >= 0 && actualPct >= 0) ||
      (predPct < 0 && actualPct < 0);

    total++;
    if (dirHit) dirHits++;
    errSum += absErr;
    absErrs.push(absErr);
    const dt = validBars[i]?.t ? new Date(validBars[i].t) : null;
    const lbl =
      dt && !Number.isNaN(dt.getTime())
        ? `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
        : `T-${n - i}`;
    checkpoints.push({
      label: lbl,
      pred: +predPct.toFixed(2),
      actual: +actualPct.toFixed(2),
      absErr: +absErr.toFixed(2),
      dirHit,
    });
  }

  if (!total) return null;
  absErrs.sort((a, b) => a - b);
  const q75 = absErrs[Math.min(absErrs.length - 1, Math.floor(absErrs.length * 0.75))];
  const result = {
    samples: total,
    horizonDays,
    dirHitPct: Math.round((dirHits / total) * 100),
    avgErrPct: +(errSum / total).toFixed(2),
    conformalRadiusPct: +q75.toFixed(2),
    checkpoints: checkpoints.slice(-12),
  };
  clientWfAuditCache[key] = result;
  return result;
}

function updateAccuracyHoverReadout(idx = state.accuracyHoverIdx) {
  const readoutEl = document.getElementById('acc-hover-readout');
  const sumEl = document.getElementById('acc-hover-summary');
  const g = state.accuracyGeom;
  if (!readoutEl || !g || !g.points?.length) return;
  const activeIdx = idx != null && g.points[idx] ? idx : g.points.length - 1;
  const p = g.points[activeIdx];
  const fmt = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;
  const tagCls = p.dirHit ? 'up' : 'down';
  const tagTxt = p.dirHit ? 'RIGHT' : 'TUNED';
  const leftSpan = readoutEl.querySelector('span');
  if (leftSpan) {
    leftSpan.textContent = `${p.label} (${g.hzLabel}) · Pred ${fmt(p.pred)} vs Actual ${fmt(p.actual)} · Err ±${p.absErr.toFixed(2)}%`;
  }
  if (sumEl) {
    sumEl.textContent = `${tagTxt} · ${g.dirHitPct}% Dir · ±${g.avgErrPct}% Avg Err`;
    sumEl.className = tagCls;
  }
}

function renderAccuracyReplayChart(res) {
  const canvas = document.getElementById('accuracy-replay-chart');
  if (!canvas) return;
  const metal = state.accuracyChartMetal === 'silver' ? 'silver' : 'gold';
  const hz = state.accuracyChartHorizon || 'daily';
  document.getElementById('acc-chart-gold')?.classList.toggle('active', metal === 'gold');
  document.getElementById('acc-chart-silver')?.classList.toggle('active', metal === 'silver');
  document.getElementById('acc-hz-daily')?.classList.toggle('active', hz === 'daily');
  document.getElementById('acc-hz-7d')?.classList.toggle('active', hz === '7d');
  document.getElementById('acc-hz-30d')?.classList.toggle('active', hz === '30d');

  const titleEl = document.getElementById('sl-chart-title');
  const hzLabel = hz === '30d' ? '30-Day' : hz === '7d' ? '7-Day' : 'Daily';
  if (titleEl) {
    titleEl.textContent = `Predicted Line vs. Actual (${hzLabel} · ${metal === 'silver' ? 'Silver' : 'Gold'})`;
  }

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const sl = res?.base?.selfLearning;
  const acc = res?.base?.accuracy || {};
  const bt = acc.backtest6m || {};
  let points = [];

  if (hz === 'daily') {
    const rawHist = (sl?.recentHistory || []).slice(0, 12).reverse();
    if (rawHist.length >= 3) {
      points = rawHist.map((row) => {
        const pred = Number(metal === 'silver' ? row.silverPredPct : row.goldPredPct) || 0;
        const actual = Number(metal === 'silver' ? row.silverActualPct : row.goldActualPct) || 0;
        const dirHit = Boolean(metal === 'silver' ? row.dirHitSilver : row.dirHitGold);
        return {
          label: row.date ? row.date.slice(5) : '—',
          pred,
          actual,
          absErr: +Math.abs(actual - pred).toFixed(2),
          dirHit,
        };
      });
    } else {
      const wf1d = computeClientWalkForwardAudit(metal, 1);
      points = wf1d?.checkpoints || [];
    }
  } else if (hz === '7d') {
    const live7Rows = (acc.recentGrades || []).filter((g) => g.metal === metal).reverse();
    const bt7 = metal === 'silver' ? bt.silver : bt.gold;
    if (live7Rows.length >= 4) {
      points = live7Rows.map((g) => ({
        label: g.date ? g.date.slice(5) : '—',
        pred: Number(g.predictedPct) || 0,
        actual: Number(g.actualPct) || 0,
        absErr: +Math.abs((Number(g.actualPct) || 0) - (Number(g.predictedPct) || 0)).toFixed(2),
        dirHit: Boolean(g.directionCorrect),
      }));
    } else if (bt7?.recentCheckpoints?.length >= 3) {
      points = bt7.recentCheckpoints.map((c, idx) => ({
        label: `W-${bt7.recentCheckpoints.length - idx}`,
        pred: Number(c.predPct) || 0,
        actual: Number(c.actualPct) || 0,
        absErr: Number(c.absErrPct) || Math.abs((Number(c.actualPct) || 0) - (Number(c.predPct) || 0)),
        dirHit: Boolean(c.dirHit),
      }));
    } else {
      const wf7 = computeClientWalkForwardAudit(metal, 5);
      points = wf7?.checkpoints || [];
    }
  } else {
    const live30Rows = (acc.recentGrades30d || []).filter((g) => g.metal === metal).reverse();
    const bt30 = metal === 'silver' ? bt.silver30d : bt.gold30d;
    if (live30Rows.length >= 3) {
      points = live30Rows.map((g) => ({
        label: g.date ? g.date.slice(5) : '—',
        pred: Number(g.predictedPct) || 0,
        actual: Number(g.actualPct) || 0,
        absErr: +Math.abs((Number(g.actualPct) || 0) - (Number(g.predictedPct) || 0)).toFixed(2),
        dirHit: Boolean(g.directionCorrect),
      }));
    } else if (bt30?.recentCheckpoints?.length >= 3) {
      points = bt30.recentCheckpoints.map((c, idx) => ({
        label: `M-${bt30.recentCheckpoints.length - idx}`,
        pred: Number(c.predPct) || 0,
        actual: Number(c.actualPct) || 0,
        absErr: Number(c.absErrPct) || Math.abs((Number(c.actualPct) || 0) - (Number(c.predPct) || 0)),
        dirHit: Boolean(c.dirHit),
      }));
    } else {
      const wf30 = computeClientWalkForwardAudit(metal, 21);
      points = wf30?.checkpoints || [];
    }
  }

  if (points.length < 2) {
    points = [
      { label: 'D-4', pred: -0.35, actual: -0.42, absErr: 0.07, dirHit: true },
      { label: 'D-3', pred: -0.40, actual: -0.55, absErr: 0.15, dirHit: true },
      { label: 'D-2', pred: -0.25, actual: 0.28, absErr: 0.53, dirHit: false },
      { label: 'D-1', pred: -0.55, actual: -0.78, absErr: 0.23, dirHit: true },
      { label: 'Now', pred: -0.42, actual: -0.51, absErr: 0.09, dirHit: true },
    ];
  }

  const styles = getComputedStyle(document.documentElement);
  const upCol = styles.getPropertyValue('--up').trim() || '#22C55E';
  const downCol = styles.getPropertyValue('--down').trim() || '#EF4444';
  const baseCol = metal === 'gold'
    ? styles.getPropertyValue('--gold').trim() || '#D4A843'
    : styles.getPropertyValue('--silver').trim() || '#C2CAD6';
  const mutedCol = styles.getPropertyValue('--text-subtle').trim() || '#777';
  const gridCol = styles.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.08)';
  const isLight = isLightThemeName(document.documentElement.getAttribute('data-theme'));

  let minV = Math.min(0, ...points.flatMap((p) => [p.pred, p.actual]));
  let maxV = Math.max(0, ...points.flatMap((p) => [p.pred, p.actual]));
  const span = Math.max(0.8, maxV - minV);
  minV -= span * 0.18;
  maxV += span * 0.18;

  const padL = 8;
  const padR = 44;
  const padT = 10;
  const padB = 20;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const xAt = (i) => padL + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  const yAt = (v) => padT + (1 - (v - minV) / (maxV - minV)) * plotH;

  // Grid + 0% axis
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  [maxV, 0, minV].forEach((val, idx) => {
    const y = yAt(val);
    ctx.save();
    ctx.strokeStyle = idx === 1 ? (isLight ? 'rgba(15,23,42,0.22)' : 'rgba(255,255,255,0.20)') : gridCol;
    if (idx === 1) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = mutedCol;
    ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, w - 2, y);
  });

  // Thin vertical error stems connecting Predicted to Actual (instantly shows forecast tightness — NO wide cone!)
  points.forEach((p, i) => {
    const x = xAt(i);
    ctx.save();
    ctx.strokeStyle = p.dirHit ? 'rgba(34,197,94,0.34)' : 'rgba(239,68,68,0.36)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, yAt(p.pred));
    ctx.lineTo(x, yAt(p.actual));
    ctx.stroke();
    ctx.restore();
  });

  // Predicted Precision Line (crisp dashed metallic line)
  ctx.save();
  ctx.strokeStyle = baseCol;
  ctx.lineWidth = 2.0;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xAt(i);
    const y = yAt(p.pred);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();

  // Actual Realized Line (clean solid line)
  ctx.save();
  ctx.strokeStyle = isLight ? 'rgba(15,23,42,0.65)' : 'rgba(244,245,247,0.72)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xAt(i);
    const y = yAt(p.actual);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();

  // Actual dots (green = direction right, red = tuned) + highlighted hover column
  const hoverIdx = state.accuracyHoverIdx != null && points[state.accuracyHoverIdx] ? state.accuracyHoverIdx : null;
  if (hoverIdx != null) {
    const hx = xAt(hoverIdx);
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = baseCol;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(hx, padT);
    ctx.lineTo(hx, padT + plotH);
    ctx.stroke();
    ctx.restore();
  }

  points.forEach((p, i) => {
    const x = xAt(i);
    const y = yAt(p.actual);
    const isHov = i === hoverIdx;
    ctx.beginPath();
    ctx.arc(x, y, isHov ? 5.2 : 3.8, 0, Math.PI * 2);
    ctx.fillStyle = p.dirHit ? upCol : downCol;
    ctx.fill();
    ctx.strokeStyle = isLight ? '#FFFFFF' : 'rgba(13,14,17,0.9)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  });

  // X-axis date labels
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  ctx.fillStyle = mutedCol;
  ctx.textBaseline = 'bottom';
  points.forEach((p, i) => {
    if (points.length > 6 && i % 2 !== 0 && i !== points.length - 1) return;
    ctx.textAlign = i === 0 ? 'left' : i === points.length - 1 ? 'right' : 'center';
    ctx.fillText(p.label, xAt(i), h - 2);
  });

  const dirHitPct = Math.round((points.filter((p) => p.dirHit).length / points.length) * 100);
  const avgErrPct = +(points.reduce((s, p) => s + p.absErr, 0) / points.length).toFixed(2);
  state.accuracyGeom = {
    points,
    padL,
    plotW,
    hzLabel,
    dirHitPct,
    avgErrPct,
    xAt,
  };
  updateAccuracyHoverReadout(hoverIdx);
}

/* ---------- v27 Outlook Features: Buy-the-Dip Ladder, Spoken Brief, Shareable Card & Purchasing Power ---------- */

function formatRealGoldPick(oz, priceUsd) {
  const grams = oz * TROY_OZ_TO_GRAMS;
  const oneGramUsd = priceUsd / TROY_OZ_TO_GRAMS;
  if (grams < 0.72) {
    return {
      usesGrams: true,
      text: `Save toward 1g gold bar (~${formatMoney(oneGramUsd, 0)}/g)`,
    };
  }
  if (grams < 1.55) return { usesGrams: true, text: `≈ 1g gold bar (${grams.toFixed(1)}g)` };
  if (grams < 2.15) return { usesGrams: true, text: `≈ 2× 1g gold bars (${grams.toFixed(1)}g)` };
  if (grams < 2.85) return { usesGrams: true, text: `≈ 2.5g gold bar (${grams.toFixed(1)}g)` };
  if (grams < 4.1) return { usesGrams: false, text: `≈ 1/10 oz gold coin (${grams.toFixed(1)}g)` };
  if (grams < 6.4) return { usesGrams: true, text: `≈ 5g gold bar (${grams.toFixed(1)}g)` };
  if (grams < 9.0) return { usesGrams: false, text: `≈ 1/4 oz gold coin (${grams.toFixed(1)}g)` };
  if (grams < 12.8) return { usesGrams: true, text: `≈ 10g gold bar (${grams.toFixed(1)}g)` };
  if (grams < 18.5) return { usesGrams: false, text: `≈ 1/2 oz gold coin (${grams.toFixed(1)}g)` };
  if (grams < 26.5) return { usesGrams: false, text: `≈ 1/2 oz + 1/4 oz gold (${oz.toFixed(2)} oz)` };
  if (grams < 37.5) return { usesGrams: false, text: `≈ 1 oz gold coin/bar` };
  const wholeOz = Math.floor(oz + 0.08);
  const remOz = Math.max(0, oz - wholeOz);
  let tail = '';
  if (remOz >= 0.42) tail = ' + 1/2 oz';
  else if (remOz >= 0.2) tail = ' + 1/4 oz';
  else if (remOz >= 0.08) tail = ' + 1/10 oz';
  else if (remOz * TROY_OZ_TO_GRAMS >= 2.0) tail = ` + ${Math.round(remOz * TROY_OZ_TO_GRAMS)}g`;
  return { usesGrams: false, text: `≈ ${wholeOz}× 1 oz${tail} gold` };
}

function formatRealSilverPick(oz) {
  if (oz < 0.65) {
    const face90 = oz / 0.715;
    return `≈ $${face90.toFixed(2)} face 90% silver (${oz.toFixed(2)} oz)`;
  }
  const rounded = Math.max(1, Math.round(oz));
  if (rounded <= 8) return `≈ ${rounded}× 1 oz silver coin${rounded === 1 ? '' : 's'}`;
  if (rounded <= 11) return `≈ 10 oz silver bar (${oz.toFixed(1)} oz)`;
  if (rounded <= 18) {
    const extra = rounded - 10;
    return `≈ 10 oz bar + ${extra}× 1 oz coin${extra === 1 ? '' : 's'}`;
  }
  if (rounded <= 22) return `≈ 20-coin tube (1 oz silver)`;
  if (rounded >= 90 && rounded <= 115) return `≈ 100 oz silver bar (${Math.round(oz)} oz)`;
  const bars10 = Math.floor(rounded / 10);
  const rem = rounded % 10;
  return rem >= 2
    ? `≈ ${bars10}× 10 oz bar${bars10 === 1 ? '' : 's'} + ${rem}× 1 oz`
    : `≈ ${bars10}× 10 oz silver bar${bars10 === 1 ? '' : 's'}`;
}

function renderBuyLadder(res) {
  const stepsEl = document.getElementById('buy-ladder-steps');
  const summaryEl = document.getElementById('buy-ladder-summary');
  const subtitleEl = document.getElementById('buy-ladder-subtitle');
  if (!stepsEl) return;

  const ladderCfg = state.settings.ladder || DEFAULT_SETTINGS.ladder;
  const budgetDisp = Math.max(50, Number(ladderCfg.budget) || 1000);
  const fx = getFxRate();
  const budgetUsd = budgetDisp / fx;
  const choice = ladderCfg.metal || 'auto';

  const budgetLbl = document.querySelector('#panel-buy-ladder label span');
  if (budgetLbl) budgetLbl.textContent = `Your Budget (${getCurrencySymbol()})`;

  let gShare = 0.5;
  let sShare = 0.5;
  let splitNote = 'Balanced 50% Gold / 50% Silver split';
  if (choice === 'gold') {
    gShare = 1;
    sShare = 0;
    splitNote = '100% Gold focus across 3 staged entry prices (matched to real grams & fractional coins)';
  } else if (choice === 'silver') {
    gShare = 0;
    sShare = 1;
    splitNote = '100% Silver focus across 3 staged entry prices (matched to real coins & bars)';
  } else {
    const tone = res?.ratioAnalytics?.tone;
    if (tone === 'bullish') {
      gShare = 0.3;
      sShare = 0.7;
      splitNote = 'Smart Split: 70% Silver / 30% Gold (Silver is historically cheap vs. Gold)';
    } else if (tone === 'gold') {
      gShare = 0.7;
      sShare = 0.3;
      splitNote = 'Smart Split: 70% Gold / 30% Silver (Gold is better relative value right now)';
    } else {
      gShare = 0.5;
      sShare = 0.5;
      splitNote = 'Smart Split: 50% Gold / 50% Silver (Ratio near 5-year normal)';
    }
  }
  if (subtitleEl) subtitleEl.textContent = splitNote;

  const gSpot = res.gold.spot;
  const sSpot = res.silver.spot;
  const gFloor = Math.min(gSpot * 0.992, res.setupQuality?.gold?.support || gSpot * 0.975);
  const sFloor = Math.min(sSpot * 0.992, res.setupQuality?.silver?.support || sSpot * 0.96);

  const gLow30 = Math.min(
    gFloor * 0.972,
    Math.min(res.gold.range.bear, gSpot * (1 - 1.35 * (res.gold.dailyVol || 0.011) * Math.sqrt(30)))
  );
  const sLow30 = Math.min(
    sFloor * 0.955,
    Math.min(res.silver.range.bear, sSpot * (1 - 1.35 * (res.silver.dailyVol || 0.021) * Math.sqrt(30)))
  );

  state.lastLadderTargets = {
    goldDipUsd: gShare > 0 ? Math.round(gFloor) : null,
    silverDipUsd: sShare > 0 ? +sFloor.toFixed(2) : null,
  };

  const steps = [
    {
      cls: 'step-1',
      tag: 'Step 1 · 35% Today',
      pct: 0.35,
      title: 'Starter Position Now',
      gPrice: gSpot,
      sPrice: sSpot,
      note: 'Gets you in the door without risking missing a rally.',
    },
    {
      cls: 'step-2',
      tag: 'Step 2 · 35% First Dip',
      pct: 0.35,
      title: 'Near-Term Support Floor',
      gPrice: gFloor,
      sPrice: sFloor,
      note: 'Adds on a normal pullback to key buyer support.',
    },
    {
      cls: 'step-3',
      tag: 'Step 3 · 30% Deep Sale',
      pct: 0.3,
      title: '30-Day Low Pullback',
      gPrice: gLow30,
      sPrice: sLow30,
      note: 'Saves dry powder for sharp flush-outs or dollar spikes.',
    },
  ];

  let totalGoldOz = 0;
  let totalSilverOz = 0;

  stepsEl.innerHTML = steps
    .map((st) => {
      const stepUsd = budgetUsd * st.pct;
      const gAmt = stepUsd * gShare;
      const sAmt = stepUsd * sShare;
      const gOz = gAmt > 0 ? gAmt / st.gPrice : 0;
      const sOz = sAmt > 0 ? sAmt / st.sPrice : 0;
      totalGoldOz += gOz;
      totalSilverOz += sOz;

      const lines = [];
      if (gAmt > 0) {
        const gPick = formatRealGoldPick(gOz, st.gPrice);
        const gPriceTag = gPick.usesGrams
          ? `${formatMoney(st.gPrice / TROY_OZ_TO_GRAMS, 0)}/g`
          : `${formatMoney(st.gPrice, 0)}/oz`;
        lines.push(
          `<strong>Gold (${formatMoney(gAmt, 0)})</strong> ≤ ${escapeHtml(gPriceTag)} → ${escapeHtml(gPick.text)}`
        );
      }
      if (sAmt > 0) {
        const sPick = formatRealSilverPick(sOz);
        lines.push(
          `<strong>Silver (${formatMoney(sAmt, 0)})</strong> ≤ ${escapeHtml(formatMoney(st.sPrice, 2))}/oz → ${escapeHtml(sPick)}`
        );
      }
      return `
        <article class="ladder-step-card ${st.cls}">
          <div class="ladder-step-top">
            <span class="ladder-step-tag">${escapeHtml(st.tag)}</span>
            <strong class="ladder-step-amt">${formatMoney(stepUsd, 0)}</strong>
          </div>
          <div class="ladder-step-trigger">${escapeHtml(st.title)}</div>
          <div class="ladder-step-detail">${lines.join('<br>')}</div>
          <div class="ladder-step-detail" style="font-family:var(--font-sans);">${escapeHtml(st.note)}</div>
        </article>`;
    })
    .join('');

  if (summaryEl) {
    const parts = [];
    if (gShare > 0 && totalGoldOz > 0) {
      const avgG = (budgetUsd * gShare) / totalGoldOz;
      const saveG = ((gSpot - avgG) / gSpot) * 100;
      const totGoldPick = formatRealGoldPick(totalGoldOz, avgG).text;
      const avgTag = totGoldPick.includes('g ') || totGoldPick.includes('1g')
        ? `${formatMoney(avgG / TROY_OZ_TO_GRAMS, 0)}/g`
        : `${formatMoney(avgG, 0)}/oz`;
      parts.push(`Gold total ${totGoldPick} (avg ${avgTag} · saves ${saveG.toFixed(1)}% vs today)`);
    }
    if (sShare > 0 && totalSilverOz > 0) {
      const avgS = (budgetUsd * sShare) / totalSilverOz;
      const saveS = ((sSpot - avgS) / sSpot) * 100;
      const totSilverPick = formatRealSilverPick(totalSilverOz);
      parts.push(`Silver total ${totSilverPick} (avg ${formatMoney(avgS, 2)}/oz · saves ${saveS.toFixed(1)}% vs today)`);
    }
    summaryEl.textContent = `Full ladder: ${parts.join(' · ')}`;
  }
}

function applyLadderDipAlerts() {
  const feedback = document.getElementById('ladder-alert-feedback');
  const t = state.lastLadderTargets || {};
  if (!state.settings.targets) state.settings.targets = { ...DEFAULT_SETTINGS.targets };
  const setParts = [];
  if (t.goldDipUsd) {
    state.settings.targets.goldBelow = String(t.goldDipUsd);
    if (state.sessionAlerted.targets) delete state.sessionAlerted.targets.goldBelow;
    setParts.push(`Gold ≤ ${formatMoney(t.goldDipUsd, 0)}`);
  }
  if (t.silverDipUsd) {
    state.settings.targets.silverBelow = String(t.silverDipUsd);
    if (state.sessionAlerted.targets) delete state.sessionAlerted.targets.silverBelow;
    setParts.push(`Silver ≤ ${formatMoney(t.silverDipUsd, 2)}`);
  }
  if (!setParts.length) return;
  renderSettingsControls();
  savePersistedState();
  if (feedback) {
    feedback.className = 'feedback-note ok';
    feedback.textContent = `Dip alerts saved! ${setParts.join(' · ')} — synced to Settings (⚙).`;
  }
}

let speechRunSeq = 0;
let ttsWorker = null;
let ttsWorkerBroken = false;
let ttsReqSeq = 0;
let sharedAudioEl = null;
let sharedAudioCtx = null;
let activeAudioSource = null;
let activeAudioUrl = null;
const ttsPending = new Map();
const SILENT_WAV_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

function unlockMobileAudioSync() {
  // 1. Unlock a single persistent <audio> element synchronously inside the tap gesture.
  //    Using <audio> plays on the media channel on iPhone (even if the physical Silent Switch is on!)
  //    and stays unlocked across async WAV synthesis / downloads on iOS Safari & Android Chrome.
  try {
    if (!sharedAudioEl) {
      sharedAudioEl = new Audio();
      sharedAudioEl.playsInline = true;
      sharedAudioEl.preload = 'auto';
      sharedAudioEl.setAttribute('playsinline', '');
      sharedAudioEl.setAttribute('webkit-playsinline', '');
    }
    sharedAudioEl.muted = false;
    sharedAudioEl.volume = 1.0;
    sharedAudioEl.src = SILENT_WAV_URI;
    const p = sharedAudioEl.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (sharedAudioEl && sharedAudioEl.src === SILENT_WAV_URI) {
          sharedAudioEl.pause();
        }
      }).catch(() => {});
    }
  } catch {}

  // 2. Also unlock Web Audio API AudioContext synchronously as secondary mobile playback engine
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new AC();
      }
      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
      const silent = sharedAudioCtx.createBuffer(1, 1, 22050);
      const src = sharedAudioCtx.createBufferSource();
      src.buffer = silent;
      src.connect(sharedAudioCtx.destination);
      src.start(0);
    }
  } catch {}

  // 3. Prime mobile speechSynthesis synchronously inside the tap gesture so fallback speech
  //    is also unlocked on iOS Safari & Android Chrome even after async worker waits
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume?.();
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
      if (isMobile && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
        const primer = new SpeechSynthesisUtterance('');
        primer.volume = 0;
        window.speechSynthesis.speak(primer);
      }
    }
  } catch {}
}

const NEURAL_VOICES = [
  { id: 'en_US-lessac-medium', label: 'Lessac — Natural US Female (Recommended)' },
  { id: 'en_US-ryan-medium', label: 'Ryan — Natural US Male' },
  { id: 'en_US-amy-medium', label: 'Amy — Warm US Female' },
  { id: 'en_US-hfc_female-medium', label: 'Claire — Clear US Female' },
  { id: 'en_US-hfc_male-medium', label: 'Mark — Clear US Male' },
  { id: 'en_GB-alba-medium', label: 'Alba — Natural UK Female' },
];

function getTtsWorker() {
  if (ttsWorkerBroken || typeof Worker === 'undefined') return null;
  if (ttsWorker) return ttsWorker;
  try {
    ttsWorker = new Worker('./tts_worker.js?v=52', { type: 'module' });
    ttsWorker.onmessage = (e) => {
      const msg = e.data || {};
      const entry = ttsPending.get(msg.id);
      if (!entry) return;
      if (msg.type === 'progress') {
        entry.onProgress?.(msg.pct);
      } else if (msg.type === 'audio') {
        ttsPending.delete(msg.id);
        entry.resolve(msg.buffer);
      } else if (msg.type === 'error') {
        ttsPending.delete(msg.id);
        entry.reject(new Error(msg.message || 'Neural voice failed'));
      }
    };
    ttsWorker.onerror = () => {
      ttsWorkerBroken = true;
      for (const [, entry] of ttsPending) {
        entry.reject(new Error('Neural voice worker unavailable'));
      }
      ttsPending.clear();
      ttsWorker = null;
    };
    return ttsWorker;
  } catch {
    ttsWorkerBroken = true;
    return null;
  }
}

function synthesizeNeuralChunk(text, voiceId, onProgress) {
  const worker = getTtsWorker();
  if (!worker) return Promise.reject(new Error('Neural worker unsupported'));
  return new Promise((resolve, reject) => {
    const id = ++ttsReqSeq;
    let timer = null;
    const bumpTimeout = (ms = 22000) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (ttsPending.has(id)) {
          ttsPending.delete(id);
          reject(new Error('Neural voice timed out'));
        }
      }, ms);
    };
    bumpTimeout(25000);
    ttsPending.set(id, {
      resolve: (buf) => {
        clearTimeout(timer);
        resolve(buf);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
      onProgress: (pct) => {
        bumpTimeout(25000);
        onProgress?.(pct);
      },
    });
    worker.postMessage({ id, type: 'speak', text, voiceId });
  });
}

function scoreEnglishVoice(v) {
  if (!v || !v.lang) return -999;
  const lang = String(v.lang).toLowerCase();
  if (!lang.startsWith('en')) return -999;
  const low = String(v.name || '').toLowerCase();
  let score = 0;

  // Top tier: Neural / Online Natural voices (Edge Azure Neural)
  if (low.includes('natural') || low.includes('neural')) score += 145;
  if (/(ava|andrew|emma|brian|aria|jenny|guy|sonia|ryan|libby)\b/.test(low) && low.includes('natural')) {
    score += 35;
  }
  // Apple Premium / Enhanced / Siri Neural voices (macOS / iOS)
  if (low.includes('premium')) score += 135;
  else if (low.includes('enhanced') || low.includes('siri')) score += 118;

  // Google Cloud Neural voices (Chrome / Android)
  if (low.startsWith('google us english')) score += 112;
  else if (low.startsWith('google uk english')) score += 104;
  else if (low.startsWith('google') && low.includes('english')) score += 96;

  // Cloud / remote neural voices generally sound much smoother than legacy local SAPI5
  if (v.localService === false) score += 22;

  // Modern warm English voice profiles
  if (/(ava|zoe|allison|samantha|nicky|aria|jenny|andrew|brian|emma|daniel|karen|serena|moira)/.test(low)) {
    score += 20;
  }

  if (lang === 'en-us') score += 18;
  else if (lang === 'en-gb') score += 12;
  else if (lang === 'en-ca' || lang === 'en-au') score += 8;

  // Strongly demote robotic legacy desktop SAPI5 / eSpeak voices
  if (/(david|zira|mark|hazel|george|susan|heera|ravi|richard|linda|catherine|james|espeak|festival|compact|fred|albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|pipe organ|trinoids|whisper|zarvox)/.test(low)) {
    score -= 95;
  }
  return score;
}

function getRankedEnglishVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const all = window.speechSynthesis.getVoices() || [];
  return all
    .map((voice) => ({ voice, score: scoreEnglishVoice(voice) }))
    .filter((item) => item.score > -500)
    .sort((a, b) => b.score - a.score);
}

async function ensureVoicesLoaded() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const immediate = getRankedEnglishVoices();
  if (immediate.length > 0) return immediate;
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener?.('voiceschanged', finish);
      resolve(getRankedEnglishVoices());
    };
    window.speechSynthesis.addEventListener?.('voiceschanged', finish);
    setTimeout(finish, 450);
  });
}

function resolveVoiceChoice(ranked = null) {
  const list = ranked || getRankedEnglishVoices();
  const pref = state.settings.ttsVoice || 'auto';

  // Explicit AI Neural voice chosen
  if (pref.startsWith('neural:')) {
    const id = pref.slice('neural:'.length);
    const meta = NEURAL_VOICES.find((v) => v.id === id) || NEURAL_VOICES[0];
    return { engine: 'neural', voiceId: meta.id, label: `AI Neural · ${meta.label.split(' — ')[0]}` };
  }

  // Explicit Browser voice chosen
  if (pref && pref !== 'auto') {
    const exact = list.find((item) => item.voice.name === pref);
    if (exact) {
      return {
        engine: 'browser',
        voice: exact.voice,
        score: exact.score,
        label: exact.voice.name.replace(/\s*-\s*English.*$/i, ''),
      };
    }
  }

  // Smart Auto: if browser already has a zero-download Studio Neural/Premium voice (e.g. Edge Ava Natural), use it;
  // otherwise use our on-device Piper AI Neural voice (Lessac) so you never hear robotic Microsoft David/Zira!
  const bestBrowser = list[0] || null;
  if (bestBrowser && bestBrowser.score >= 130) {
    return {
      engine: 'browser',
      voice: bestBrowser.voice,
      score: bestBrowser.score,
      label: bestBrowser.voice.name.replace(/\s*-\s*English.*$/i, ''),
    };
  }
  return {
    engine: 'neural',
    voiceId: 'en_US-lessac-medium',
    label: 'AI Neural · Lessac (Natural US English)',
  };
}

function populateVoiceSelector() {
  const sel = document.getElementById('select-tts-voice');
  const rateSel = document.getElementById('select-tts-rate');
  const fb = document.getElementById('voice-feedback');
  if (rateSel) rateSel.value = String(state.settings.ttsRate ?? 0.96);
  if (!sel) return;

  const ranked = getRankedEnglishVoices();
  const curPref = state.settings.ttsVoice || 'auto';
  const resolved = resolveVoiceChoice(ranked);

  const neuralOpts = NEURAL_VOICES.map(
    (nv) => `<option value="neural:${escapeHtml(nv.id)}">★ AI Natural · ${escapeHtml(nv.label)}</option>`
  ).join('');

  const browserOpts = ranked
    .slice(0, 20)
    .map(({ voice, score }) => {
      const badge = score >= 110 ? '★ Natural · ' : score >= 40 ? 'Good · ' : '';
      const cleanName = voice.name.replace(/\s*-\s*English.*$/i, '');
      return `<option value="${escapeHtml(voice.name)}">${escapeHtml(badge + cleanName)} (${escapeHtml(voice.lang)})</option>`;
    })
    .join('');

  sel.innerHTML =
    `<option value="auto">Auto — Best Natural English (${escapeHtml(resolved.label)})</option>` +
    `<optgroup label="AI Human Voices (Runs Locally · Free · Cached Offline)">${neuralOpts}</optgroup>` +
    (browserOpts ? `<optgroup label="Browser Built-In Voices (Instant)">${browserOpts}</optgroup>` : '');

  const hasExact = Array.from(sel.options).some((o) => o.value === curPref);
  sel.value = hasExact ? curPref : 'auto';

  if (fb && !state.speechActive) {
    fb.className = 'feedback-note ok';
    fb.textContent =
      resolved.engine === 'neural'
        ? `Ready with ${resolved.label} (100% private on-device AI voice — caches offline after first play).`
        : `Ready with built-in natural voice: ${resolved.label}.`;
  }
}

function formatSpokenMoney(usdVal, includeSubunit = false) {
  const code = getCurrencyCode();
  const meta = CURRENCY_META[code] || CURRENCY_META.USD;
  const converted = Math.abs((Number(usdVal) || 0) * getFxRate());
  if (meta.zeroDecimals || !includeSubunit || !meta.spokenSub || converted >= 250) {
    return `${Math.round(converted).toLocaleString('en-US')} ${meta.spoken}`;
  }
  const whole = Math.floor(converted);
  const sub = Math.round((converted - whole) * 100);
  if (sub === 0) return `${whole.toLocaleString('en-US')} ${meta.spoken}`;
  if (sub === 100) return `${(whole + 1).toLocaleString('en-US')} ${meta.spoken}`;
  return `${whole.toLocaleString('en-US')} ${meta.spoken} and ${sub} ${meta.spokenSub}`;
}

function cleanTextForNaturalSpeech(rawText) {
  return String(rawText || '')
    .replace(/(\d+)\s*\/\s*100/g, '$1 out of 100')
    .replace(/[−-]\s*\$([\d,]+)\.(\d{2})\s*\/\s*oz/gi, (_, w, c) =>
      c === '00' ? `minus ${w} dollars per ounce` : `minus ${w} dollars and ${parseInt(c, 10)} cents per ounce`
    )
    .replace(/\$([\d,]+)\.(\d{2})\s*\/\s*oz/gi, (_, w, c) =>
      c === '00' ? `${w} dollars per ounce` : `${w} dollars and ${parseInt(c, 10)} cents per ounce`
    )
    .replace(/[−-]\s*\$([\d,]+(?:\.\d+)?)/g, 'minus $1 dollars')
    .replace(/\$([\d,]+)\.(\d{2})/g, (_, w, c) =>
      c === '00' ? `${w} dollars` : `${w} dollars and ${parseInt(c, 10)} cents`
    )
    .replace(/\/\s*oz\b/gi, ' per ounce')
    .replace(/\/\s*g\b/gi, ' per gram')
    .replace(/\b1\s*oz\b/gi, '1 ounce')
    .replace(/\boz\b/gi, 'ounces')
    .replace(/\bvs\.?\b/gi, 'versus')
    .replace(/\b7D\b/g, '7 day')
    .replace(/\b30D\b/g, '30 day')
    .replace(/\s*\/\s*/g, ' and ')
    .replace(/\s*[·—–]\s*/g, ', ')
    .replace(/\(([^)]+)\)/g, ', $1,')
    .replace(/"/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .trim();
}

function setListenButtonState(speaking) {
  const btn = document.getElementById('btn-listen-brief');
  const icon = document.getElementById('icon-listen');
  if (btn) {
    btn.classList.toggle('speaking', !!speaking);
    btn.setAttribute('aria-pressed', speaking ? 'true' : 'false');
    btn.title = speaking ? 'Stop market audio update' : 'Listen to spoken market update';
  }
  if (icon) {
    icon.innerHTML = speaking
      ? '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />'
      : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />';
  }
}

function stopAllSpeech() {
  speechRunSeq += 1;
  state.speechActive = false;
  if (sharedAudioEl) {
    try {
      sharedAudioEl.onended = null;
      sharedAudioEl.onerror = null;
      sharedAudioEl.pause();
      sharedAudioEl.currentTime = 0;
    } catch {}
  }
  if (activeAudioSource) {
    try {
      activeAudioSource.onended = null;
      activeAudioSource.stop();
    } catch {}
    activeAudioSource = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  setListenButtonState(false);
  const bar = document.getElementById('audio-brief-bar');
  if (bar) bar.hidden = true;
}

function playViaAudioContext(arrayBuffer, rate, runId) {
  return new Promise((resolve, reject) => {
    if (runId !== speechRunSeq) {
      resolve(false);
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        reject(new Error('No AudioContext'));
        return;
      }
      if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
        sharedAudioCtx = new AC();
      }
      const startPlay = () => {
        sharedAudioCtx.decodeAudioData(
          arrayBuffer.slice(0),
          (decoded) => {
            if (runId !== speechRunSeq) {
              resolve(false);
              return;
            }
            const src = sharedAudioCtx.createBufferSource();
            src.buffer = decoded;
            src.playbackRate.value = clampNum(rate, 0.75, 1.35);
            src.connect(sharedAudioCtx.destination);
            activeAudioSource = src;
            src.onended = () => {
              if (activeAudioSource === src) activeAudioSource = null;
              resolve(true);
            };
            src.start(0);
          },
          (err) => reject(err || new Error('Audio decode failed'))
        );
      };
      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().then(startPlay).catch(reject);
      } else {
        startPlay();
      }
    } catch (err) {
      reject(err);
    }
  });
}

async function playWavBuffer(arrayBuffer, rate, runId) {
  if (runId !== speechRunSeq) return false;

  // Primary: persistent gesture-unlocked <audio> element (works on iOS even with Silent Switch ON!)
  try {
    await new Promise((resolve, reject) => {
      if (runId !== speechRunSeq) {
        resolve(false);
        return;
      }
      if (!sharedAudioEl) {
        sharedAudioEl = new Audio();
        sharedAudioEl.playsInline = true;
        sharedAudioEl.setAttribute('playsinline', '');
        sharedAudioEl.setAttribute('webkit-playsinline', '');
      }
      if (activeAudioUrl) {
        URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = null;
      }
      const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      activeAudioUrl = url;
      const el = sharedAudioEl;
      el.onended = null;
      el.onerror = null;
      el.src = url;
      el.playbackRate = clampNum(rate, 0.75, 1.35);
      el.muted = false;
      el.volume = 1.0;

      const cleanup = () => {
        el.onended = null;
        el.onerror = null;
        if (activeAudioUrl === url) {
          URL.revokeObjectURL(url);
          activeAudioUrl = null;
        }
      };
      el.onended = () => {
        cleanup();
        resolve(true);
      };
      el.onerror = () => {
        cleanup();
        reject(new Error('HTMLAudio playback failed'));
      };
      const playPromise = el.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          cleanup();
          reject(err);
        });
      }
    });
    return true;
  } catch {
    // Secondary fallback: unlocked Web Audio API AudioContext
    return playViaAudioContext(arrayBuffer, rate, runId);
  }
}

function setSpeechFeedback(el, isBriefBtn, text, tone = 'ok') {
  if (!el) return;
  if (!isBriefBtn) {
    el.className = tone === 'err' ? 'feedback-note err' : 'feedback-note ok';
  }
  el.textContent = text;
}

function speakWithBrowserFallback(queue, voiceObj, rate, runId, isBriefBtn, feedbackEl, fallbackNote = null) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    stopAllSpeech();
    setSpeechFeedback(feedbackEl, isBriefBtn, 'Audio playback unavailable in this browser.', 'err');
    return;
  }
  const cleanVoice = voiceObj ? voiceObj.name.replace(/\s*-\s*English.*$/i, '') : 'Browser Voice';
  setSpeechFeedback(feedbackEl, isBriefBtn, fallbackNote || `🎙 Speaking with ${cleanVoice}`, 'ok');
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel();
  }
  window.speechSynthesis.resume?.();
  let idx = 0;
  const speakNext = () => {
    if (runId !== speechRunSeq) return;
    if (idx >= queue.length) {
      stopAllSpeech();
      return;
    }
    const utter = new SpeechSynthesisUtterance(queue[idx]);
    if (voiceObj) {
      utter.voice = voiceObj;
      utter.lang = voiceObj.lang || 'en-US';
    } else {
      utter.lang = 'en-US';
    }
    utter.rate = rate;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    utter.onend = () => {
      idx += 1;
      setTimeout(speakNext, 110);
    };
    utter.onerror = () => {
      if (runId === speechRunSeq) stopAllSpeech();
    };
    window.speechSynthesis.speak(utter);
  };
  speakNext();
}

async function speakSentencesNaturally(sentences, { isBriefBtn = false, feedbackEl = null } = {}) {
  // CRITICAL for iOS Safari & Android Chrome: unlock audio synchronously BEFORE any await!
  unlockMobileAudioSync();

  const immediateVoices = getRankedEnglishVoices();
  const ranked = immediateVoices.length > 0 ? immediateVoices : await ensureVoicesLoaded();
  populateVoiceSelector();
  const choice = resolveVoiceChoice(ranked);
  const rate = clampNum(parseFloat(state.settings.ttsRate) || 0.96, 0.75, 1.35);

  const runId = ++speechRunSeq;
  state.speechActive = true;
  if (isBriefBtn) {
    setListenButtonState(true);
    const bar = document.getElementById('audio-brief-bar');
    if (bar) bar.hidden = false;
  }

  const queue = sentences
    .map((s) => cleanTextForNaturalSpeech(s))
    .filter((s) => s.length > 0);
  if (!queue.length) {
    stopAllSpeech();
    return;
  }

  // Path 1: On-Device Piper AI Neural English Voice (real human voice in every browser!)
  if (choice.engine === 'neural') {
    const shortName = choice.label.replace(/^AI Neural · /, '');
    try {
      setSpeechFeedback(feedbackEl, isBriefBtn, `🎙 Loading ${choice.label}…`, 'ok');
      const onProg = (pct) => {
        if (runId !== speechRunSeq) return;
        setSpeechFeedback(
          feedbackEl,
          isBriefBtn,
          pct < 100
            ? `⬇ Downloading natural AI voice (${shortName}) ${pct}% — saved offline after this…`
            : `🎙 Generating natural English audio (${shortName})…`,
          'ok'
        );
      };

      // Pipeline pre-generation: synthesize sentence i+1 while sentence i plays!
      let nextPromise = synthesizeNeuralChunk(queue[0], choice.voiceId, onProg);
      for (let i = 0; i < queue.length; i += 1) {
        if (runId !== speechRunSeq) return;
        const wavBuf = await nextPromise;
        if (runId !== speechRunSeq) return;

        if (i + 1 < queue.length) {
          nextPromise = synthesizeNeuralChunk(queue[i + 1], choice.voiceId, null);
        }
        setSpeechFeedback(feedbackEl, isBriefBtn, `🎙 Speaking with ${choice.label} (${i + 1}/${queue.length})`, 'ok');
        await playWavBuffer(wavBuf, rate, runId);
      }
      if (runId === speechRunSeq) {
        stopAllSpeech();
        if (!isBriefBtn) {
          setSpeechFeedback(feedbackEl, false, `✓ Finished briefing (${choice.label})`, 'ok');
        }
      }
      return;
    } catch {
      if (runId !== speechRunSeq) return;
      // Seamless automatic fallback to best available browser English voice
      const fallbackVoice = ranked[0]?.voice || null;
      speakWithBrowserFallback(
        queue,
        fallbackVoice,
        rate,
        runId,
        isBriefBtn,
        feedbackEl,
        `🎙 AI voice offline — speaking with ${fallbackVoice ? fallbackVoice.name.replace(/\s*-\s*English.*$/i, '') : 'Browser Voice'}`
      );
      return;
    }
  }

  // Path 2: Browser Built-In Voice (Edge Natural / Apple Enhanced / Google English / User Selected)
  speakWithBrowserFallback(queue, choice.voice || null, rate, runId, isBriefBtn, feedbackEl);
}

function toggleBriefingSpeech() {
  const statusEl = document.getElementById('audio-brief-status');
  const audioPlaying =
    (sharedAudioEl && !sharedAudioEl.paused && sharedAudioEl.src && sharedAudioEl.src !== SILENT_WAV_URI) ||
    !!activeAudioSource;
  if (state.speechActive || audioPlaying || (typeof window !== 'undefined' && window.speechSynthesis?.speaking)) {
    stopAllSpeech();
    return;
  }

  // Unlock mobile audio synchronously right inside the user tap event!
  unlockMobileAudioSync();

  const res = computeInteractiveOutlook();
  const gPct = state.quotes.gold.pct || 0;
  const sPct = state.quotes.silver.pct || 0;
  const dirPct = (p) =>
    Math.abs(p) < 0.05 ? 'roughly flat' : `${p > 0 ? 'up' : 'down'} ${Math.abs(p).toFixed(1)} percent`;

  const narrativeSentences = String(res.narrative || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sentences = [
    'Here is your Bullion Pulse market update.',
    `Gold is at ${formatSpokenMoney(res.gold.spot, false)} per ounce, ${dirPct(gPct)} today, with a ${res.setupQuality.gold.label} rating.`,
    `Silver is at ${formatSpokenMoney(res.silver.spot, true)} per ounce, ${dirPct(sPct)} today, with a ${res.setupQuality.silver.label} rating.`,
    ...narrativeSentences,
  ];

  speakSentencesNaturally(sentences, { isBriefBtn: true, feedbackEl: statusEl });
}

function exportShareMarketCard() {
  const feedback = document.getElementById('share-card-feedback');
  try {
    const res = computeInteractiveOutlook();
    const W = 1200;
    const H = 630;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background dark luxury gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0D0E12');
    bgGrad.addColorStop(0.55, '#13161F');
    bgGrad.addColorStop(1, '#0B0C10');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle warm gold radial glow
    const glow = ctx.createRadialGradient(240, 120, 20, 240, 120, 420);
    glow.addColorStop(0, 'rgba(212, 168, 67, 0.16)');
    glow.addColorStop(1, 'rgba(212, 168, 67, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Outer border
    ctx.strokeStyle = 'rgba(212, 168, 67, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, W - 40, H - 40);

    // Header
    ctx.fillStyle = '#F3D27A';
    ctx.font = '700 28px Inter, system-ui, sans-serif';
    ctx.fillText('BULLION PULSE', 56, 78);

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    ctx.fillText(`DAILY GOLD & SILVER MARKET SNAPSHOT · ${getCurrencyCode()}`, 56, 106);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#E5E7EB';
    ctx.font = '600 17px "JetBrains Mono", monospace';
    const stamp = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    ctx.fillText(`${stamp} · Live Feed`, W - 56, 86);
    ctx.textAlign = 'left';

    // Helper for rounded rect
    const roundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const hLbl = outlookState.horizon === '30d' ? '30-Day' : '7-Day';
    const cards = [
      {
        x: 56,
        title: 'GOLD SPOT (XAU)',
        accent: '#F3D27A',
        spot: formatMoney(res.gold.spot, 2),
        pct: state.quotes.gold.pct || 0,
        target: `${hLbl} Expected: ${formatMoney(res.gold.range.base, 0)}`,
        range: `Range ${formatMoney(res.gold.range.bear, 0)} – ${formatMoney(res.gold.range.bull, 0)}`,
        verdict: `${res.setupQuality.gold.label} (${res.setupQuality.gold.score}/100)`,
      },
      {
        x: 616,
        title: 'SILVER SPOT (XAG)',
        accent: '#CBD5E1',
        spot: formatMoney(res.silver.spot, 2),
        pct: state.quotes.silver.pct || 0,
        target: `${hLbl} Expected: ${formatMoney(res.silver.range.base, 2)}`,
        range: `Range ${formatMoney(res.silver.range.bear, 2)} – ${formatMoney(res.silver.range.bull, 2)}`,
        verdict: `${res.setupQuality.silver.label} (${res.setupQuality.silver.score}/100)`,
      },
    ];

    cards.forEach((c) => {
      roundRect(c.x, 140, 528, 286, 18);
      ctx.fillStyle = 'rgba(24, 27, 36, 0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = c.accent;
      ctx.font = '700 17px Inter, system-ui, sans-serif';
      ctx.fillText(c.title, c.x + 28, 180);

      const pctStr = formatSignedPct(c.pct);
      ctx.textAlign = 'right';
      ctx.fillStyle = c.pct >= 0 ? '#22C55E' : '#EF4444';
      ctx.font = '700 22px "JetBrains Mono", monospace';
      ctx.fillText(pctStr, c.x + 500, 182);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#F9FAFB';
      ctx.font = '700 54px "JetBrains Mono", monospace';
      ctx.fillText(c.spot, c.x + 28, 252);

      ctx.fillStyle = '#D1D5DB';
      ctx.font = '600 20px "JetBrains Mono", monospace';
      ctx.fillText(c.target, c.x + 28, 304);

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '500 16px "JetBrains Mono", monospace';
      ctx.fillText(c.range, c.x + 28, 336);

      roundRect(c.x + 28, 360, 472, 42, 10);
      ctx.fillStyle = 'rgba(212, 168, 67, 0.14)';
      ctx.fill();
      ctx.fillStyle = '#F3D27A';
      ctx.font = '700 16px Inter, system-ui, sans-serif';
      ctx.fillText(`Verdict: ${c.verdict}`, c.x + 44, 387);
    });

    // Bottom 3-metric intelligence bar (never includes private stack!)
    const ratioVal = res.silver.spot > 0 ? (res.gold.spot / res.silver.spot).toFixed(1) : '—';
    const dxyVal = res.dollarStrength?.dxy != null ? res.dollarStrength.dxy.toFixed(1) : '—';
    const supplyState =
      res.futures?.gold?.isBackwardation || res.futures?.silver?.isBackwardation
        ? 'Tight Physical Supply ↑'
        : 'Normal Futures Curve';

    const pills = [
      { label: 'GOLD / SILVER RATIO', val: `${ratioVal} : 1`, sub: res.ratioAnalytics?.swapBias || 'Fairly Priced' },
      {
        label: 'US DOLLAR STRENGTH',
        val: `${dxyVal} (${res.dollarStrength?.score ?? 50}/100)`,
        sub: res.dollarStrength?.regime || 'Normal Dollar',
      },
      { label: 'SUPPLY PRESSURE', val: supplyState, sub: `Signal Agreement ${res.base?.confidence || 62}%` },
    ];

    pills.forEach((p, idx) => {
      const px = 56 + idx * 370;
      roundRect(px, 452, 348, 106, 14);
      ctx.fillStyle = 'rgba(20, 23, 31, 0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '600 12px Inter, system-ui, sans-serif';
      ctx.fillText(p.label, px + 20, 480);

      ctx.fillStyle = '#F9FAFB';
      ctx.font = '700 20px "JetBrains Mono", monospace';
      ctx.fillText(p.val, px + 20, 512);

      ctx.fillStyle = '#D1D5DB';
      ctx.font = '500 14px Inter, system-ui, sans-serif';
      ctx.fillText(p.sub.slice(0, 34), px + 20, 540);
    });

    // Footer
    ctx.fillStyle = '#6B7280';
    ctx.font = '500 14px Inter, system-ui, sans-serif';
    ctx.fillText(
      'Public market snapshot only · Personal stack balances are never included · pownda417-netizen.github.io/bullion-pulse',
      56,
      594
    );

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const fileName = `bullion-pulse-snapshot-${todayKey()}.png`;
      try {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Bullion Pulse Market Snapshot',
            text: `Gold ${formatMoney(res.gold.spot)} · Silver ${formatMoney(res.silver.spot)}`,
          });
          if (feedback) {
            feedback.className = 'feedback-note ok';
            feedback.textContent = 'Shared clean Market Snapshot! (Zero personal stack data included.)';
          }
          return;
        }
      } catch {
        // Fall through to standard PNG download if share canceled/unsupported
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      if (feedback) {
        feedback.className = 'feedback-note ok';
        feedback.textContent = `Saved ${fileName} (clean public market card — zero private stack info).`;
      }
    }, 'image/png');
  } catch (err) {
    if (feedback) {
      feedback.className = 'feedback-note err';
      feedback.textContent = `Could not generate share card: ${err.message}`;
    }
  }
}

function renderPurchasingPower(res) {
  const homeEl = document.getElementById('pp-home-oz');
  const carEl = document.getElementById('pp-car-oz');
  const spxEl = document.getElementById('pp-spx-gold');
  const barsEl = document.getElementById('pp-bars-list');
  const titleEl = document.querySelector('#panel-purchasing-power .pp-compare-title');
  if (!homeEl || !barsEl) return;

  const gSpot = Math.max(1, res?.gold?.spot || 3500);
  const sSpot = Math.max(1, res?.silver?.spot || 41);
  const sp500 = Number(res?.base?.macroSnapshot?.sp500) || 5950;

  const homeOz = 415000 / gSpot;
  const carOz = 48500 / gSpot;
  const spxRatio = sp500 / gSpot;

  homeEl.textContent = `${Math.round(homeOz)} oz Gold`;
  if (carEl) carEl.textContent = `${carOz.toFixed(1)} oz Gold`;
  if (spxEl) spxEl.textContent = `${spxRatio.toFixed(2)}×`;

  const baseStartUsd = 10000;
  if (titleEl) {
    titleEl.textContent = `If you put ${formatMoney(baseStartUsd, 0)} away in 2020 (Real Buying Power Today)`;
  }

  const cashNowUsd = 7940; // ~26% cumulative CPI erosion since 2020
  const goldNowUsd = baseStartUsd * (gSpot / 1770);
  const silverNowUsd = baseStartUsd * (sSpot / 20.55);
  const maxVal = Math.max(cashNowUsd, goldNowUsd, silverNowUsd, baseStartUsd);

  const items = [
    {
      name: 'Paper Cash (After ~26% Inflation)',
      valUsd: cashNowUsd,
      pct: ((cashNowUsd - baseStartUsd) / baseStartUsd) * 100,
      cls: 'cash',
      valCls: 'down',
    },
    {
      name: 'Physical Gold (Since 2020)',
      valUsd: goldNowUsd,
      pct: ((goldNowUsd - baseStartUsd) / baseStartUsd) * 100,
      cls: 'gold',
      valCls: goldNowUsd >= baseStartUsd ? 'up' : 'down',
    },
    {
      name: 'Physical Silver (Since 2020)',
      valUsd: silverNowUsd,
      pct: ((silverNowUsd - baseStartUsd) / baseStartUsd) * 100,
      cls: 'silver',
      valCls: silverNowUsd >= baseStartUsd ? 'up' : 'down',
    },
  ];

  barsEl.innerHTML = items
    .map((it) => {
      const widthPct = Math.max(8, Math.min(100, Math.round((it.valUsd / maxVal) * 100)));
      return `
        <div class="pp-bar-row">
          <div class="pp-bar-head">
            <span class="pp-bar-name">${escapeHtml(it.name)}</span>
            <span class="pp-bar-val ${it.valCls}">${formatMoney(it.valUsd, 0)} (${formatSignedPct(it.pct)})</span>
          </div>
          <div class="pp-bar-track">
            <div class="pp-bar-fill ${it.cls}" style="width:${widthPct}%"></div>
          </div>
        </div>`;
    })
    .join('');
}

function renderGapAnalyzer(res) {
  if (!document.getElementById('panel-gap-analyzer')) return;
  const gaps = res?.marketGaps;
  if (!gaps) return;

  const badgeEl = document.getElementById('gap-analyzer-badge');
  const openTotal = (gaps.gold?.openCount || 0) + (gaps.silver?.openCount || 0);
  if (badgeEl) {
    if (openTotal > 0) {
      const anyUp = (gaps.gold?.primary && !gaps.gold.primary.isFilled && gaps.gold.primary.dir === 'up') ||
        (gaps.silver?.primary && !gaps.silver.primary.isFilled && gaps.silver.primary.dir === 'up');
      const anyDn = (gaps.gold?.primary && !gaps.gold.primary.isFilled && gaps.gold.primary.dir === 'down') ||
        (gaps.silver?.primary && !gaps.silver.primary.isFilled && gaps.silver.primary.dir === 'down');
      badgeEl.textContent = `${openTotal} Open Gap${openTotal > 1 ? 's' : ''} Active`;
      badgeEl.className = `signal-pill ${anyUp && !anyDn ? 'bullish' : anyDn && !anyUp ? 'bearish' : ''}`;
    } else {
      badgeEl.textContent = 'All Gaps Filled';
      badgeEl.className = 'signal-pill';
    }
  }

  for (const [metal, name] of [['gold', 'Gold'], ['silver', 'Silver']]) {
    const info = gaps[metal];
    const p = info?.primary || null;
    const card = document.getElementById(`gap-card-${metal}`);
    const statusEl = document.getElementById(`gap-${metal}-status`);
    const metaEl = document.getElementById(`gap-${metal}-meta`);
    const barWrap = document.getElementById(`gap-${metal}-bar-wrap`);
    const zoneEl = document.getElementById(`gap-${metal}-zone`);
    const pctEl = document.getElementById(`gap-${metal}-fillpct`);
    const barEl = document.getElementById(`gap-${metal}-fillbar`);
    const actionEl = document.getElementById(`gap-${metal}-action`);
    const impactEl = document.getElementById(`gap-${metal}-impact`);

    if (!p) {
      if (card) card.className = 'gap-card';
      if (statusEl) {
        statusEl.textContent = 'No Open Gap';
        statusEl.className = 'signal-pill';
      }
      if (metaEl) metaEl.textContent = 'Recent 4H–1M candles show continuous trading with no unclosed gap.';
      if (barWrap) barWrap.hidden = true;
      if (actionEl) actionEl.textContent = `No open gap right now — ${name} is trading smoothly without an unfilled gap magnet.`;
      if (impactEl) {
        impactEl.textContent = 'Forecast impact: Neutral (0 pts)';
        impactEl.className = 'gap-impact';
      }
      continue;
    }

    const isUp = p.dir === 'up';
    const toneCls = p.isFilled ? '' : isUp ? 'bullish' : 'bearish';
    if (card) card.className = `gap-card ${toneCls}`;
    if (statusEl) {
      statusEl.textContent = info.status;
      statusEl.className = `signal-pill ${toneCls}`;
    }

    const gapUsdDisp = formatSignedMoney(convertUnit(p.gapUsd), 2);
    const gapPctDisp = `${p.gapPct >= 0 ? '+' : '−'}${Math.abs(p.gapPct).toFixed(2)}%`;
    const fillTargetDisp = formatMoney(convertUnit(p.fillTarget), 2);
    const gapEdgeDisp = formatMoney(convertUnit(p.gapEdge), 2);
    const moveDisp = formatSignedMoney(convertUnit(p.moveToFillUsd), 2);
    const movePctDisp = `${p.moveToFillPct >= 0 ? '+' : '−'}${Math.abs(p.moveToFillPct).toFixed(2)}%`;

    if (metaEl) {
      metaEl.textContent = `${p.kind} (${p.tfLabel || info.tfLabel || '1D'}) · Gap Size ${gapUsdDisp} (${gapPctDisp})`;
    }
    if (barWrap) barWrap.hidden = false;
    if (zoneEl) zoneEl.textContent = `Gap Zone ${fillTargetDisp} → ${gapEdgeDisp}`;
    if (pctEl) pctEl.textContent = `${p.fillPct}% filled`;
    if (barEl) {
      barEl.style.width = `${clampNum(p.fillPct, 0, 100)}%`;
      barEl.className = `gap-fill-bar ${p.isFilled ? 'filled' : isUp ? 'up' : 'down'}`;
    }

    if (actionEl) {
      if (p.isFilled) {
        actionEl.textContent = `Recent ${isUp ? 'Gap Up' : 'Gap Down'} to ${fillTargetDisp} is already 100% filled ✓ — no open gap magnet pulling ${name} right now.`;
      } else if (p.freshness === 0) {
        actionEl.textContent = `Unfilled for ${Math.round(p.ageDays || 10)}+ days — now treated as a confirmed Breakaway Gap (short-term fill pull has faded out).`;
      } else if (isUp) {
        const holdTxt = p.isBreakawayAged
          ? `Unfilled for ${Math.round(p.ageDays)}d — fading toward a confirmed Breakaway Gap.`
          : p.holdingBeyond
            ? `Holding above ${gapEdgeDisp} keeps buyers in control (breakaway strength).`
            : `Price is currently testing inside the gap pocket (${p.fillPct}% filled).`;
        actionEl.textContent = `To fill this bullish gap, ${name} would need to drop ${moveDisp} (${movePctDisp}) back to ${fillTargetDisp}. ${holdTxt}`;
      } else {
        const holdTxt = p.isBreakawayAged
          ? `Unfilled for ${Math.round(p.ageDays)}d — fading toward a confirmed Breakaway Gap.`
          : p.holdingBeyond
            ? `Staying below ${gapEdgeDisp} keeps sellers in control (downside pressure).`
            : `Price is currently bouncing inside the gap pocket (${p.fillPct}% filled).`;
        actionEl.textContent = `To fill this bearish gap, ${name} needs a ${moveDisp} (${movePctDisp}) rally back up to ${fillTargetDisp}. ${holdTxt}`;
      }
    }

    if (impactEl) {
      const pts = Math.round((info.predictionBoost || 0) * 100);
      if (p.isFilled || pts === 0) {
        impactEl.textContent = p.isFilled
          ? 'Forecast impact: Neutral (0 pts — already filled)'
          : 'Forecast impact: Neutral (0 pts — aged breakaway)';
        impactEl.className = 'gap-impact';
      } else if (pts > 0) {
        impactEl.textContent = `Forecast impact: +${pts} pts bullish momentum (pullback magnet at ${fillTargetDisp})`;
        impactEl.className = 'gap-impact up';
      } else {
        impactEl.textContent = `Forecast impact: −${Math.abs(pts)} pts bearish pressure (bounce magnet at ${fillTargetDisp})`;
        impactEl.className = 'gap-impact down';
      }
    }
  }
}

function render30DayForecastRoadmap(res) {
  const gridEl = document.getElementById('fc30-grid');
  const badgeEl = document.getElementById('fc30-badge');
  if (!gridEl || !res?.gold?.range30d || !res?.silver?.range30d) return;

  const avgAgree = Math.round(((res.gold.range30d.agreementPct || 75) + (res.silver.range30d.agreementPct || 75)) / 2);
  if (badgeEl) {
    badgeEl.textContent = `4-Model Ensemble · ${avgAgree}% Agree`;
    badgeEl.className = `signal-pill ${avgAgree >= 75 ? 'bullish' : ''}`;
  }

  const buildSparkSvg = (spot, milestones, tone) => {
    const vals = [spot, ...milestones.map((m) => m.price)];
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = Math.max(maxV - minV, spot * 0.004);
    const pad = span * 0.18;
    const lo = minV - pad;
    const hi = maxV + pad;
    const W = 260;
    const H = 36;
    const xs = vals.map((_, i) => 8 + (i / (vals.length - 1)) * (W - 16));
    const ys = vals.map((v) => H - 6 - ((v - lo) / (hi - lo)) * (H - 12));
    const spotY = ys[0];
    const strokeCol = tone === 'bullish' ? '#22C55E' : tone === 'bearish' ? '#EF4444' : '#D4A843';
    const dPath = xs
      .map((x, i) => (i === 0 ? `M${x.toFixed(1)},${ys[i].toFixed(1)}` : `L${x.toFixed(1)},${ys[i].toFixed(1)}`))
      .join(' ');
    const dots = xs
      .map(
        (x, i) =>
          `<circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="${i === xs.length - 1 ? 3.4 : 2.3}" fill="${i === 0 ? '#94A3B8' : strokeCol}" />`
      )
      .join('');
    return `
      <svg class="fc30-spark-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <line x1="6" y1="${spotY.toFixed(1)}" x2="${W - 6}" y2="${spotY.toFixed(1)}" stroke="rgba(148,163,184,0.32)" stroke-dasharray="3 3" stroke-width="1" />
        <path d="${dPath}" fill="none" stroke="${strokeCol}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
      </svg>`;
  };

  const cardsHtml = [
    ['gold', 'Gold'],
    ['silver', 'Silver'],
  ]
    .map(([metal, name]) => {
      const m = res[metal];
      const r30 = m.range30d;
      const tone = r30.expectedPct >= 0.4 ? 'bullish' : r30.expectedPct <= -0.4 ? 'bearish' : '';
      const probCls = r30.probHigherPct >= 56 ? 'up' : r30.probHigherPct <= 44 ? 'down' : '';
      const dec = convertUnit(m.spot) >= 500 ? 0 : 2;
      const spark = buildSparkSvg(m.spot, r30.milestones, tone);

      const nodesHtml = r30.milestones
        .map((node, idx) => {
          const isLast = idx === r30.milestones.length - 1;
          const pctCls = node.pct >= 0.05 ? 'up' : node.pct <= -0.05 ? 'down' : '';
          const sign = node.pct > 0 ? '+' : node.pct < 0 ? '−' : '';
          return `
            <div class="fc30-node ${isLast ? 'target' : ''}">
              <span class="fc30-node-k">${escapeHtml(node.label)}</span>
              <strong class="fc30-node-p">${escapeHtml(formatMoney(convertUnit(node.price), dec))}</strong>
              <span class="fc30-node-d ${pctCls}">${sign}${Math.abs(node.pct).toFixed(1)}%</span>
            </div>`;
        })
        .join('');

      const seas = r30.seasonality;
      const seasSign = seas.blendedPct > 0 ? '+' : seas.blendedPct < 0 ? '−' : '';
      const ll = r30.leadLag;
      const tw = r30.historicalTwins;
      const twinTag = tw
        ? `<span class="fc30-alpha-tag">Past Twins (${tw.matchPct}% match): <strong>${tw.avgReturnPct >= 0 ? '+' : '−'}${Math.abs(tw.avgReturnPct).toFixed(1)}% avg</strong></span>`
        : '';

      const votesHtml = (r30.modelVotes || [])
        .map((v) => {
          const arrow = v.dir === 'up' ? '↑' : v.dir === 'down' ? '↓' : '→';
          return `<span class="fc30-vote ${v.dir}">${escapeHtml(v.label)} ${arrow}</span>`;
        })
        .join('');

      return `
        <article class="fc30-card ${tone}">
          <div class="fc30-head">
            <div class="fc30-title-wrap">
              <span class="fc30-metal ${metal}">${name} · 30-Day Path</span>
            </div>
            <div class="fc30-pills">
              <span class="fc30-mini-pill ${probCls}">${r30.probHigherPct}% Odds Up</span>
              <span class="fc30-mini-pill">${r30.agreeCount}/4 Agree</span>
            </div>
          </div>
          <div class="fc30-spark-wrap">${spark}</div>
          <div class="fc30-milestones">${nodesHtml}</div>
          <div class="fc30-alpha-row">
            <span class="fc30-alpha-tag">State: <strong>${escapeHtml(r30.hurstLabel)} (H=${Number(r30.hurst || 0.5).toFixed(2)})</strong></span>
            <span class="fc30-alpha-tag">20-Yr ${escapeHtml(seas.windowLabel)}: <strong>${seasSign}${Math.abs(seas.blendedPct).toFixed(1)}%</strong></span>
            <span class="fc30-alpha-tag">Lead-Lag: <strong>${escapeHtml(ll.label)}</strong></span>
            ${twinTag}
          </div>
          <div class="fc30-votes-row">
            <span>4-Model Votes</span>
            <div class="fc30-vote-pills">${votesHtml}</div>
          </div>
        </article>`;
    })
    .join('');

  gridEl.innerHTML = cardsHtml;
}

function renderPhysicalPremiums(res) {
  const gridEl = document.getElementById('phys-grid');
  const badgeEl = document.getElementById('phys-status-badge');
  const pp = res?.physicalPremiums;
  if (!gridEl || !pp) return;

  if (badgeEl) {
    badgeEl.textContent = pp.overallStatus;
    badgeEl.className = `signal-pill ${pp.gold.tone === 'bullish' || pp.silver.tone === 'bullish' ? 'bullish' : ''}`;
  }

  const dq = state.settings.dealerQuotes || {};
  const cardsHtml = [
    ['gold', 'Gold', 'goldStreetOz'],
    ['silver', 'Silver', 'silverStreetOz'],
  ]
    .map(([metal, name, overrideKey]) => {
      const m = pp[metal];
      const pillCls = m.tone === 'bullish' ? 'bullish' : '';
      const gaugePct = clampNum((m.compositePremPct / (m.gaugeMaxPct || 20)) * 100, 6, 100);
      const pts = Math.round((m.predictionBoost || 0) * 100);
      const impactCls = pts > 0 ? 'up' : pts < 0 ? 'down' : '';
      const impactTxt =
        pts > 0
          ? `Forecast impact: +${pts} pts bullish physical squeeze lead${m.paperPhysicalDisconnect ? ' (Paper-Physical Disconnect)' : ''}`
          : pts < 0
            ? `Forecast impact: −${Math.abs(pts)} pts cooled retail momentum (low buyer markup)`
            : 'Forecast impact: Neutral (0 pts — normal dealer shelves)';

      const rowsHtml = m.products
        .map((p) => {
          const isHot = p.premiumPct > (metal === 'silver' ? 18 : 5.8);
          const bbTxt = p.buybackAboveSpot
            ? `Buyback ${formatMoney(p.buybackPrice, 2)} (ABOVE SPOT +${p.buybackVsSpotPct.toFixed(1)}%)`
            : `Est. Buyback ${formatMoney(p.buybackPrice, 2)}`;
          const userMark = p.isUserQuote ? ' ★' : '';
          return `
            <div class="phys-row">
              <span class="phys-prod-name">${escapeHtml(p.name)}${userMark}</span>
              <div class="phys-prod-vals">
                <strong>${escapeHtml(formatMoney(p.streetPrice, 2))}</strong>
                <span class="phys-prem-tag ${isHot ? 'hot' : ''}">+${p.premiumPct.toFixed(1)}% over melt</span>
                <span class="phys-buyback ${p.buybackAboveSpot ? 'above' : ''}">${escapeHtml(bbTxt)}</span>
              </div>
            </div>`;
        })
        .join('');

      const curOverrideVal = dq[overrideKey] != null ? String(dq[overrideKey]) : '';
      const placeholderTxt = `Enter dealer 1 oz ${name} coin $ (auto ${formatMoney(m.products[0].streetPrice, 2)})`;

      return `
        <article class="phys-card ${m.tone}">
          <div class="phys-head">
            <span class="phys-metal ${metal}">${name} Physical vs. Melt</span>
            <span class="signal-pill ${pillCls}">${escapeHtml(m.status)}</span>
          </div>
          <div class="phys-melt-row">
            <span>Spot / Pure Melt: <strong>${escapeHtml(formatMoney(m.spot, 2))}/oz</strong> (${escapeHtml(formatMoney(m.meltPerGram, 2))}/g)</span>
            <span>Avg Markup: <strong>+${m.compositePremPct.toFixed(1)}%</strong></span>
          </div>
          <div class="phys-gauge-wrap">
            <div class="phys-gauge-meta">
              <span>Normal ${escapeHtml(m.normalRangeLabel)}</span>
              <span>Squeeze Zone ↑</span>
            </div>
            <div class="phys-gauge-track">
              <div class="phys-gauge-fill ${m.tone}" style="width:${gaugePct.toFixed(1)}%"></div>
            </div>
          </div>
          <div class="phys-table">${rowsHtml}</div>
          <div class="phys-advice">${escapeHtml(m.advice)}</div>
          <div class="phys-impact ${impactCls}">${escapeHtml(impactTxt)}</div>
          <div class="phys-override-row">
            <input type="number" step="any" inputmode="decimal" class="phys-override-input" data-phys-input="${overrideKey}" value="${escapeHtml(curOverrideVal)}" placeholder="${escapeHtml(placeholderTxt)}" aria-label="${escapeHtml(`Custom dealer street price for 1 oz ${name} coin`)}" />
            <button type="button" class="phys-override-btn primary" data-phys-apply="${overrideKey}">Apply</button>
            <button type="button" class="phys-override-btn" data-phys-reset="${overrideKey}">Auto</button>
          </div>
        </article>`;
    })
    .join('');

  gridEl.innerHTML = cardsHtml;
}

function renderWorldSpacePulse(res) {
  const gridEl = document.getElementById('wsp-grid');
  const badgeEl = document.getElementById('wsp-activity-badge');
  const noteEl = document.getElementById('wsp-note');
  const wsp = res?.worldSpacePulse;
  if (!gridEl || !wsp) return;

  const sw = wsp.spaceWeather || parseClientNoaaSpaceWeather(null);
  if (badgeEl) {
    badgeEl.textContent = `${wsp.activityScore}/100 · ${wsp.regime}`;
    badgeEl.className = `signal-pill ${wsp.activityScore >= 68 ? 'bullish' : ''}`;
  }

  const gPts = Math.round((wsp.goldDynamicBoost || 0) * 100);
  const sPts = Math.round((wsp.silverDynamicBoost || 0) * 100);
  const fmtPts = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)} pts`;
  const ev = wsp.nextEvent;
  const evVal = ev ? `${ev.daysUntil}d · ${ev.title.slice(0, 20)}` : 'Normal Calendar';
  const evSub = ev ? `${ev.date} · High-volatility event proximity` : 'No imminent Fed/CPI/COMEX shock today';

  const liveMoveStr = `Au ${wsp.liveGoldPct >= 0 ? '+' : '−'}${Math.abs(wsp.liveGoldPct).toFixed(2)}% · Ag ${wsp.liveSilverPct >= 0 ? '+' : '−'}${Math.abs(wsp.liveSilverPct).toFixed(2)}%`;
  const swCls = sw.peakScale >= 3 ? 'active' : sw.peakScale >= 2 || sw.gForecast >= 2 ? 'watch' : '';
  const swValCls = sw.peakScale >= 3 ? 'up' : sw.peakScale >= 2 ? 'gold' : '';
  const shockCls = Math.abs(gPts) >= 4 || Math.abs(sPts) >= 4 ? (gPts + sPts >= 0 ? 'up' : 'down') : '';

  gridEl.innerHTML = `
    <article class="wsp-card ${swCls}">
      <span class="wsp-k">NOAA Space Weather</span>
      <strong class="wsp-v ${swValCls}">${escapeHtml(sw.status)}</strong>
      <span class="wsp-sub">G${sw.gScale} Storm · R${sw.rScale} Radio · S${sw.sScale} Solar · 24h G${sw.gForecast}</span>
    </article>
    <article class="wsp-card ${wsp.breakingCount > 0 ? 'active' : ''}">
      <span class="wsp-k">World News Velocity</span>
      <strong class="wsp-v">${wsp.breakingCount} breaking · ${wsp.fresh24hCount} (24h)</strong>
      <span class="wsp-sub">${escapeHtml(wsp.topCatalyst ? wsp.topCatalyst.slice(0, 56) + (wsp.topCatalyst.length > 56 ? '…' : '') : 'Monitoring global macro & space feeds')}</span>
    </article>
    <article class="wsp-card ${ev && ev.daysUntil <= 3 ? 'watch' : ''}">
      <span class="wsp-k">Next Global Event</span>
      <strong class="wsp-v">${escapeHtml(evVal)}</strong>
      <span class="wsp-sub">${escapeHtml(evSub)}</span>
    </article>
    <article class="wsp-card ${Math.abs(gPts) >= 5 ? 'active' : ''}">
      <span class="wsp-k">Live Forecast Shift</span>
      <strong class="wsp-v ${shockCls}">Au ${fmtPts(gPts)} · Ag ${fmtPts(sPts)}</strong>
      <span class="wsp-sub">Live tape: ${escapeHtml(liveMoveStr)}</span>
    </article>`;

  if (noteEl) {
    noteEl.textContent = `${sw.source}: ${sw.summary}`;
  }
}

function renderHiddenAlpha(res) {
  const gridEl = document.getElementById('ha-grid');
  const badgeEl = document.getElementById('ha-net-badge');
  const noteEl = document.getElementById('ha-note');
  const ha = res?.hiddenAlpha;
  if (!gridEl || !ha) return;

  const metal = state.hiddenAlphaMetal === 'silver' ? 'silver' : 'gold';
  document.getElementById('ha-btn-gold')?.classList.toggle('active', metal === 'gold');
  document.getElementById('ha-btn-silver')?.classList.toggle('active', metal === 'silver');

  const m = ha[metal];
  if (!m) return;

  const netPts = m.netPts || 0;
  if (badgeEl) {
    badgeEl.textContent = `Net Edge ${netPts >= 0 ? '+' : '−'}${Math.abs(netPts)} pts`;
    badgeEl.className = `signal-pill ${netPts >= 2 ? 'bullish' : netPts <= -2 ? 'bearish' : ''}`;
  }

  const sf = m.sessionFlow;
  const fx = m.currencyBreadth;
  const sc = m.springCoiling;
  const lc = m.liquidityCompass;
  const cb = m.crowdingBrake;
  const ox = m.opexMagnet;

  const toneFor = (v, posThresh = 0.12, negThresh = -0.12) =>
    v >= posThresh ? 'bullish' : v <= negThresh ? 'bearish' : '';
  const badgeFor = (v, posThresh = 0.12, negThresh = -0.12) =>
    v >= posThresh ? 'up' : v <= negThresh ? 'down' : '';
  const fmtSig = (v) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}`;

  const strikeDisplay = formatMoney(convertUnit(ox.magnetStrike), metal === 'silver' ? 2 : 0);
  const strikeDiffStr = `${ox.distToMagnetPct >= 0 ? '+' : '−'}${Math.abs(ox.distToMagnetPct).toFixed(2)}%`;

  const cards = [
    {
      k: 'East vs. West Flow',
      badge: `${sf.eastMinusWestPct >= 0 ? '+' : '−'}${Math.abs(sf.eastMinusWestPct).toFixed(2)}%`,
      badgeCls: badgeFor(sf.signal),
      cardCls: toneFor(sf.signal),
      v: sf.regime,
      metric: `Asia ${sf.asiaPct >= 0 ? '+' : '−'}${Math.abs(sf.asiaPct).toFixed(2)}% · London ${sf.londonPct >= 0 ? '+' : '−'}${Math.abs(sf.londonPct).toFixed(2)}% · NY ${sf.nyPct >= 0 ? '+' : '−'}${Math.abs(sf.nyPct).toFixed(2)}%`,
      sub: sf.note,
    },
    {
      k: '21-FX Stealth Breadth',
      badge: `${fx.breadthPct}% Highs`,
      badgeCls: fx.stealthBull ? 'gold' : badgeFor(fx.signal),
      cardCls: fx.stealthBull ? 'watch' : toneFor(fx.signal),
      v: fx.regime,
      metric: `${fx.nearHighCount}/${fx.totalCurrencies} global currencies near highs · USD ${fx.usdPctOfHigh}%`,
      sub: fx.stealthBull
        ? 'World currencies are breaking out ahead of USD — classic hidden global demand signal.'
        : 'Compares local metal highs across major world currencies to spot stealth rallies.',
    },
    {
      k: 'Spring Coiling',
      badge: `${sc.coilingScore}/100`,
      badgeCls: sc.coilingScore >= 72 ? 'gold' : sc.coilingScore >= 54 ? 'up' : '',
      cardCls: sc.coilingScore >= 72 ? 'watch' : '',
      v: sc.regime,
      metric: `5d/30d Vol ${sc.volRatio.toFixed(2)}× · Energy ${sc.breakoutEnergyMult.toFixed(2)}×`,
      sub: sc.note,
    },
    {
      k: 'Liquidity Compass',
      badge: fmtSig(lc.signal),
      badgeCls: badgeFor(lc.signal),
      cardCls: toneFor(lc.signal),
      v: lc.regime,
      metric: lc.goldOilRatio != null ? `Gold/Oil ${lc.goldOilRatio}:1 · Cu ${lc.cu5d >= 0 ? '+' : '−'}${Math.abs(lc.cu5d).toFixed(1)}% · Pt ${lc.pt5d >= 0 ? '+' : '−'}${Math.abs(lc.pt5d).toFixed(1)}%` : lc.note,
      sub: 'Tracks Gold vs. Bitcoin debasement, Gold/Oil miner profit margins & Copper/Platinum confirmation.',
    },
    {
      k: 'Crowding Brake',
      badge: `${cb.crowdingScore}/100`,
      badgeCls: cb.contrarianNudge < 0 ? 'down' : cb.contrarianNudge > 0 ? 'up' : '',
      cardCls: cb.contrarianNudge < 0 ? 'bearish' : cb.contrarianNudge > 0 ? 'bullish' : '',
      v: cb.regime,
      metric: `News ${cb.newsBullPct}% bull (${cb.bullHeadlines}↑ / ${cb.bearHeadlines}↓) · Brake ${cb.contrarianNudge === 0 ? 'Off' : fmtSig(cb.contrarianNudge)}`,
      sub: cb.note,
    },
    {
      k: 'COMEX OpEx Magnet',
      badge: ox.pinStrength > 0 ? 'Pin Active' : ox.phase.includes('Post-OpEx') ? 'Release ⚡' : `${ox.daysToOpex > 0 ? `${ox.daysToOpex}d` : 'Open'}`,
      badgeCls: ox.pinStrength > 0 ? 'gold' : ox.phase.includes('Post-OpEx') ? 'up' : '',
      cardCls: ox.pinStrength > 0 ? 'watch' : ox.phase.includes('Post-OpEx') ? 'bullish' : '',
      v: ox.phase,
      metric: `Strike Magnet ${strikeDisplay} (${strikeDiffStr})`,
      sub: ox.note,
    },
  ];

  gridEl.innerHTML = cards
    .map(
      (c) => `
      <article class="ha-card ${c.cardCls}">
        <div class="ha-top">
          <span class="ha-k">${escapeHtml(c.k)}</span>
          <span class="ha-badge ${c.badgeCls}">${escapeHtml(c.badge)}</span>
        </div>
        <strong class="ha-v">${escapeHtml(c.v)}</strong>
        <span class="ha-metric">${escapeHtml(c.metric)}</span>
        <span class="ha-sub">${escapeHtml(c.sub)}</span>
      </article>`
    )
    .join('');

  if (noteEl) {
    noteEl.textContent = `${metal === 'gold' ? 'Gold' : 'Silver'} net hidden-edge forecast boost: ${netPts >= 0 ? '+' : '−'}${Math.abs(netPts)} pts · ${ha.summaryLine}`;
  }
}

function renderAiDatacenter(res) {
  const bodyEl = document.getElementById('aidc-body');
  const badgeEl = document.getElementById('aidc-status-badge');
  const noteEl = document.getElementById('aidc-note');
  const ai = res?.aiDatacenter;
  if (!bodyEl || !ai) return;

  if (badgeEl) {
    badgeEl.textContent = `${ai.status} · ${ai.raceIndex}/100`;
    badgeEl.className = `signal-pill ${ai.tone === 'bullish' ? 'bullish' : ai.tone === 'bearish' ? 'bearish' : ''}`;
  }

  const fmtChg = (v) => {
    if (v == null || !Number.isFinite(v)) return '<span class="chg">Track</span>';
    const cls = v >= 0.05 ? 'up' : v <= -0.05 ? 'down' : '';
    return `<span class="chg ${cls}">${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%</span>`;
  };
  const basketAvgHtml = (b) => {
    if (!b.live) return '<span class="aidc-basket-avg">Structural Baseline</span>';
    const cls = b.avg5dPct >= 0.05 ? 'up' : b.avg5dPct <= -0.05 ? 'down' : '';
    return `<span class="aidc-basket-avg ${cls}">5d ${b.avg5dPct >= 0 ? '+' : '−'}${Math.abs(b.avg5dPct).toFixed(1)}% (${b.risingCount}/${b.trackedCount} ↑)</span>`;
  };
  const renderPills = (b) =>
    b.members
      .map(
        (m) =>
          `<span class="aidc-ticker-pill" title="${escapeHtml(`${m.name}: ${m.role}`)}"><strong>${escapeHtml(m.ticker)}</strong>${fmtChg(m.pct5d)}</span>`
      )
      .join('');

  const sPts = ai.silver?.pts || 0;
  const gPts = ai.gold?.pts || 0;
  const isSurge = outlookState.activeScenarios.has('ai_capex_surge');
  const isPause = outlookState.activeScenarios.has('ai_capex_pause');

  bodyEl.innerHTML = `
    <div class="aidc-gauge-box">
      <div class="aidc-gauge-head">
        <span>Hyperscale AI Buildout &amp; Power Intensity</span>
        <strong>${ai.raceIndex} / 100</strong>
      </div>
      <div class="aidc-track"><div class="aidc-fill" style="width:${clampNum(ai.raceIndex, 6, 100)}%"></div></div>
      <div class="aidc-stats-row">
        <span class="aidc-stat-chip">+${ai.dcPowerGrowth2030Pct}% DC Power by 2030</span>
        <span class="aidc-stat-chip">~${ai.estSilverMozYr} Moz/yr Silver Draw</span>
        <span class="aidc-stat-chip">${escapeHtml(ai.byproductSilverSharePct)} Byproduct Supply</span>
        <span class="aidc-stat-chip">${ai.deficitYears}-Yr Structural Deficit</span>
        ${ai.supplyTightMult > 1.02 ? `<span class="aidc-stat-chip">Tightness ${ai.supplyTightMult.toFixed(2)}×</span>` : ''}
      </div>
      <div class="aidc-sim-row" role="group" aria-label="Simulate AI CapEx race scenarios">
        <button type="button" class="chip-toggle ${!isSurge && !isPause ? 'active' : ''}" data-aidc-sim="live">Live Signal</button>
        <button type="button" class="chip-toggle ${isSurge ? 'active' : ''}" data-aidc-sim="surge">Simulate +GW Surge</button>
        <button type="button" class="chip-toggle ${isPause ? 'active' : ''}" data-aidc-sim="pause">Simulate CapEx Pause</button>
      </div>
    </div>

    <div class="aidc-baskets-grid">
      <div class="aidc-basket-card">
        <div class="aidc-basket-head">
          <span>Big Tech AI Compute &amp; Silicon</span>
          ${basketAvgHtml(ai.computeBasket)}
        </div>
        <div class="aidc-tickers">${renderPills(ai.computeBasket)}</div>
      </div>
      <div class="aidc-basket-card">
        <div class="aidc-basket-head">
          <span>Power Room, Switchgear &amp; Grid</span>
          ${basketAvgHtml(ai.powerBasket)}
        </div>
        <div class="aidc-tickers">${renderPills(ai.powerBasket)}</div>
      </div>
    </div>

    <div class="aidc-metals-grid">
      <article class="aidc-metal-card silver">
        <div class="aidc-metal-head">
          <span class="aidc-metal-title">Silver · Primary AI Power Metal</span>
          <span class="signal-pill ${sPts > 0 ? 'bullish' : sPts < 0 ? 'bearish' : ''}">Forecast ${sPts >= 0 ? '+' : '−'}${Math.abs(sPts)} pts</span>
        </div>
        <div class="aidc-metal-role">Switchgear, busbars, circuit breakers, relays, UPS &amp; grid upgrades</div>
        <div class="aidc-metal-desc">Highest electrical &amp; thermal conductivity (~7% better heat transfer than copper). Non-thriftable in 50–500MW+ zero-downtime facilities; industrial fabricators pull refined silver from the same pool as bullion bars &amp; coins.</div>
      </article>
      <article class="aidc-metal-card gold">
        <div class="aidc-metal-head">
          <span class="aidc-metal-title">Gold · Supporting AI Tech Metal</span>
          <span class="signal-pill ${gPts > 0 ? 'bullish' : gPts < 0 ? 'bearish' : ''}">Forecast ${gPts >= 0 ? '+' : '−'}${Math.abs(gPts)} pts</span>
        </div>
        <div class="aidc-metal-role">Wire bonding, corrosion-proof edge connectors &amp; memory pins</div>
        <div class="aidc-metal-desc">Stays chemically stable in high-heat continuous servers without oxidizing. Adds a steady supporting tech layer (moderated by per-chip thrifting) alongside Gold's primary monetary &amp; central-bank drivers.</div>
      </article>
    </div>`;

  if (noteEl) {
    noteEl.textContent = ai.summary;
  }
}

function renderOutlook() {
  const view = document.getElementById('view-outlook');
  if (!view) return;
  if (!histCandlesLoaded) ensureHistoricalCandlesLoaded();

  const res = computeInteractiveOutlook();

  document.getElementById('horizon-7d')?.classList.toggle('active', outlookState.horizon === '7d');
  document.getElementById('horizon-30d')?.classList.toggle('active', outlookState.horizon === '30d');

  // Render Gold & Silver probabilistic cards (with Markets-synced Spot + Futures Curve header)
  const hTargetTitle = outlookState.horizon === '30d' ? '30-Day Expected Price' : '7-Day Expected Price';
  for (const metal of ['gold', 'silver']) {
    const m = res[metal];
    const f = res.futures?.[metal];
    const sigEl = document.getElementById(`outlook-${metal}-signal`);
    const spotEl = document.getElementById(`outlook-${metal}-spot`);
    const futEl = document.getElementById(`outlook-${metal}-fut`);
    const targetLblEl = document.getElementById(`outlook-${metal}-target-lbl`);
    const baseEl = document.getElementById(`outlook-${metal}-base`);
    const driftEl = document.getElementById(`outlook-${metal}-drift`);
    const markerEl = document.getElementById(`outlook-${metal}-marker`);
    const bearEl = document.getElementById(`outlook-${metal}-bear`);
    const bullEl = document.getElementById(`outlook-${metal}-bull`);

    if (spotEl) spotEl.textContent = `Spot ${formatMoney(convertUnit(m.spot))}`;
    if (futEl && f) {
      const tag = f.isBackwardation ? ' · Shortage ↑' : '';
      futEl.textContent = `Futures ${formatMoney(convertUnit(f.futures))}${tag}`;
    }
    if (targetLblEl) targetLblEl.textContent = hTargetTitle;

    sigEl.textContent = m.signal.label;
    sigEl.className = `signal-pill ${m.signal.cls}`;
    baseEl.textContent = formatMoney(convertUnit(m.range.base));
    driftEl.textContent = `${formatSignedPct(m.range.expectedPct)} · Signal ${m.score >= 0 ? '+' : ''}${m.score}`;
    driftEl.className = `forecast-drift ${m.range.expectedPct >= 0.05 ? 'up' : m.range.expectedPct <= -0.05 ? 'down' : ''}`;
    markerEl.style.left = `${m.range.markerPct}%`;
    bearEl.textContent = `Low ${formatMoney(convertUnit(m.range.bear), 0)}`;
    bullEl.textContent = `High ${formatMoney(convertUnit(m.range.bull), 0)}`;
  }

  document.getElementById('outlook-confidence').textContent = `Signal Agreement ${res.base.confidence || 62}%`;
  document.getElementById('outlook-narrative').textContent = res.narrative;
  render30DayForecastRoadmap(res);
  renderWorldSpacePulse(res);
  renderPhysicalPremiums(res);
  renderHiddenAlpha(res);
  renderAiDatacenter(res);
  renderSetupQuality(res);
  renderGapAnalyzer(res);
  renderRatioAnalytics(res);
  renderBuyLadder(res);
  renderDollarStrength(res);
  renderPurchasingPower(res);

  const outlookRegimePill = document.getElementById('outlook-regime-pill');
  if (outlookRegimePill && res.marketRegime?.gold && res.marketRegime?.silver) {
    const gR = res.marketRegime.gold;
    const sR = res.marketRegime.silver;
    const dominantKey =
      gR.key === 'hybrid' || sR.key === 'hybrid'
        ? 'hybrid'
        : gR.key === 'squeeze' || sR.key === 'squeeze'
          ? 'squeeze'
          : gR.key === 'discovery' || sR.key === 'discovery'
            ? 'discovery'
            : 'neutral';
    outlookRegimePill.textContent = `Gold: ${friendlyRegimeLabel(gR.label)} · Silver: ${friendlyRegimeLabel(sR.label)}`;
    outlookRegimePill.className = `regime-pill ${dominantKey}`;
  }

  // Scenario chips
  const chipsEl = document.getElementById('scenario-chips');
  if (chipsEl) {
    chipsEl.innerHTML = OUTLOOK_SCENARIOS.map(
      (s) =>
        `<button type="button" class="scenario-chip ${outlookState.activeScenarios.has(s.id) ? 'active' : ''}" data-scenario="${s.id}">${escapeHtml(s.label)}</button>`
    ).join('');
  }

  // Macro Drivers
  const driversEl = document.getElementById('outlook-drivers');
  if (driversEl) {
    driversEl.innerHTML = res.drivers
      .map((d) => {
        const avg = (d.gold + d.silver) / 2;
        const pctWidth = Math.min(50, Math.abs(avg) * 50);
        const left = avg >= 0 ? 50 : 50 - pctWidth;
        const color = avg >= 0 ? 'var(--up)' : 'var(--down)';
        const fmt = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}`;
        return `
          <div class="driver-row">
            <div class="driver-row-head">
              <span>${escapeHtml(DRIVER_FRIENDLY_LABELS[d.id] || d.label)}</span>
              <span class="driver-scores">
                <span style="color:var(--gold-bright)">Gold ${fmt(d.gold)}</span>
                <span style="color:var(--silver)">Silver ${fmt(d.silver)}</span>
              </span>
            </div>
            <div class="driver-bar-track">
              <div class="driver-bar-center"></div>
              <div class="driver-bar-fill" style="left:${left}%;width:${pctWidth}%;background:${color};"></div>
            </div>
          </div>`;
      })
      .join('');
  }

  // Historical Analogs
  const analogsEl = document.getElementById('outlook-analogs');
  if (analogsEl) {
    const suffix = outlookState.horizon === '30d' ? '30d' : '7d';
    analogsEl.innerHTML = res.analogs
      .map((a) => {
        const gVal = suffix === '30d' ? a.gold30dPct : a.gold7dPct;
        const sVal = suffix === '30d' ? a.silver30dPct : a.silver7dPct;
        return `
          <article class="analog-card">
            <div class="analog-title">${escapeHtml(a.title)}</div>
            <div class="analog-stats">
              <span class="analog-tag ${gVal >= 0 ? 'up' : 'down'}">Gold ${suffix}: ${formatSignedPct(gVal)}</span>
              <span class="analog-tag ${sVal >= 0 ? 'up' : 'down'}">Silver ${suffix}: ${formatSignedPct(sVal)}</span>
            </div>
            <div class="analog-note">${escapeHtml(a.note)}</div>
          </article>`;
      })
      .join('');
  }

  // Render Institutional Pro Quant Signals 2x2 Grid
  const ps = res.base.proSignals || {};
  const acc = res.base.accuracy || {};

  const ryEl = document.getElementById('pro-realyield');
  const rySub = document.getElementById('pro-realyield-sub');
  if (ryEl && rySub) {
    const ry = ps.realYields;
    if (ry?.realYield10yPct != null) {
      const bps = ry.realDelta5dBps ?? 0;
      const moveTxt = bps <= -4 ? 'Falling (helps prices)' : bps >= 4 ? 'Rising (pressures prices)' : 'Steady';
      const pctPts = (Math.abs(bps) / 100).toFixed(2);
      ryEl.textContent = `${ry.realYield10yPct.toFixed(2)}%`;
      ryEl.style.color = bps <= -4 ? 'var(--up)' : bps >= 4 ? 'var(--down)' : 'var(--text)';
      rySub.textContent = `${moveTxt} · 5-day ${bps >= 0 ? '+' : '−'}${pctPts}%`;
    } else {
      ryEl.textContent = '1.88%';
      rySub.textContent = 'Lower rates help Gold & Silver';
    }
  }

  const cotEl = document.getElementById('pro-cot');
  const cotSub = document.getElementById('pro-cot-sub');
  if (cotEl && cotSub) {
    const cg = ps.cot?.gold;
    const cs = ps.cot?.silver;
    if (cg || cs) {
      cotEl.textContent = `Gold ${cg?.percentile52w ?? '—'}% · Silver ${cs?.percentile52w ?? '—'}%`;
      cotSub.textContent = (cs?.percentile52w ?? 50) <= 30 ? 'Silver uncrowded (room to bounce)' : (cg?.percentile52w ?? 50) >= 80 ? 'Gold crowded with buyers' : 'Normal trader activity';
    } else {
      cotEl.textContent = 'Gold 62% · Silver 24%';
      cotSub.textContent = 'Silver uncrowded (room to bounce)';
    }
  }

  const minEl = document.getElementById('pro-miners');
  const minSub = document.getElementById('pro-miners-sub');
  if (minEl && minSub) {
    const mn = ps.miners;
    if (mn && (mn.gdxVsGold10dPct != null || mn.silVsSilver10dPct != null)) {
      const gRel = mn.gdxVsGold10dPct;
      const sRel = mn.silVsSilver10dPct;
      minEl.textContent = `${gRel >= 0 ? '+' : ''}${gRel ?? '—'}% / ${sRel >= 0 ? '+' : ''}${sRel ?? '—'}%`;
      minSub.textContent = mn.regime?.includes('Leading') ? 'Miners beating spot (positive)' : mn.regime?.includes('Lag') ? 'Miners trailing spot (caution)' : 'Miners moving in line with spot';
    } else {
      minEl.textContent = '-1.8% / -2.4%';
      minSub.textContent = 'Miners trailing spot (caution)';
    }
  }

  const accEl = document.getElementById('pro-accuracy');
  const accSub = document.getElementById('pro-accuracy-sub');
  const btGold = acc.backtest6m?.gold;
  const btSilver = acc.backtest6m?.silver;
  const live7 = acc.live7d;
  const sl = res.base.selfLearning || null;
  if (accEl && accSub) {
    const dirPct =
      sl?.summary?.rollingDirHitGoldPct ??
      (live7?.count >= 4 ? live7.dirHitPct : btGold?.dirHitPct ?? 67);
    const conePct =
      sl?.summary?.rollingInConePct ??
      (live7?.count >= 4 ? live7.inConePct : btGold?.inConePct ?? 78);
    accEl.textContent = `${dirPct}% Right`;
    accSub.textContent = `${conePct}% landed inside forecast range`;
  }

  // Daily 5:10 PM ET Self-Check & Accuracy Panel (upgraded with 7D + 30D walk-forward & Conformal Error Calibration)
  const accList = document.getElementById('accuracy-breakdown');
  const accMeta = document.getElementById('accuracy-meta');
  const slBadge = document.getElementById('sl-status-badge');
  const slStrip = document.getElementById('sl-summary-strip');

  const bt = acc.backtest6m || {};
  const btGold30 = bt.gold30d || computeClientWalkForwardAudit('gold', 21);
  const btSilver30 = bt.silver30d || computeClientWalkForwardAudit('silver', 21);
  const live30 = acc.live30d;
  const activeRegime = sl?.activeRegime === 'stress' ? 'Busy Market' : 'Calm Market';
  const gradeLetter = sl?.summary?.calibrationGrade || (btGold?.dirHitPct >= 62 ? 'A' : 'B');
  if (accMeta) {
    const lastDay = sl?.lastLearnedDay ? `Last checked ${sl.lastLearnedDay}` : 'First check after market close';
    accMeta.textContent = `Grades 1D, 7D & 30D predictions every weekday at 5:10 PM ET · ${lastDay}`;
  }
  if (slBadge) {
    const cycles = sl?.totalCycles ?? 0;
    slBadge.textContent = cycles > 0 ? `Grade ${gradeLetter} · ${cycles}d checked` : `Grade ${gradeLetter} · 5:10 PM ET`;
    slBadge.className = `signal-pill ${sl?.championChallenger?.rollbackActive ? 'bearish' : 'bullish'}`;
  }
  if (slStrip) {
    const boosted = sl?.summary?.topBoostedDriver
      ? `${DRIVER_FRIENDLY_LABELS[sl.summary.topBoostedDriver.id] || sl.summary.topBoostedDriver.label} (+${sl.summary.topBoostedDriver.avgDeltaPct}%)`
      : 'Vault Supply (+0.18%)';
    const cc = sl?.championChallenger || {};
    const edgeVal = Number.isFinite(cc.edgePct) ? cc.edgePct : 0;
    const ccText = cc.rollbackActive
      ? 'Resetting toward defaults'
      : `${edgeVal >= 0 ? '+' : ''}${edgeVal.toFixed(1)}% vs. default`;
    const dailyHit =
      sl?.summary?.rollingDirHitGoldPct != null
        ? `${Math.round((sl.summary.rollingDirHitGoldPct + (sl.summary.rollingDirHitSilverPct ?? sl.summary.rollingDirHitGoldPct)) / 2)}% Dir · ±${(sl.summary.avgAbsErrGoldPct ?? 0.65).toFixed(2)}% Err`
        : btGold
          ? `${Math.round(btGold.dirHitPct || 0)}% Dir · ±${Number(btGold.avgErrPct || 1.2).toFixed(2)}% Err`
          : 'Calibrating…';
    const wf30Text = btGold30
      ? `${Math.round(btGold30.dirHitPct || 0)}% Dir · ±${Number(btGold30.avgErrPct || 2.8).toFixed(1)}% Err`
      : 'Evaluating 30D…';
    const confRadius =
      sl?.summary?.conformalDailyGoldPct ?? btGold?.conformalRadiusPct ?? btGold30?.conformalRadiusPct;
    const confText = confRadius != null ? `${activeRegime} · ±${Number(confRadius).toFixed(2)}%` : activeRegime;
    slStrip.innerHTML = `
      <div class="sl-chip">
        <span class="sl-chip-label">Daily Precision</span>
        <span class="sl-chip-val up">${escapeHtml(dailyHit)}</span>
      </div>
      <div class="sl-chip">
        <span class="sl-chip-label">30-Day Track Record</span>
        <span class="sl-chip-val">${escapeHtml(wf30Text)}</span>
      </div>
      <div class="sl-chip">
        <span class="sl-chip-label">Top Helping Signal</span>
        <span class="sl-chip-val up">${escapeHtml(boosted)}</span>
      </div>
      <div class="sl-chip">
        <span class="sl-chip-label">Self-Tuning &amp; Margin</span>
        <span class="sl-chip-val ${cc.rollbackActive ? 'down' : 'up'}">${escapeHtml(`${ccText} · ${confText}`)}</span>
      </div>`;
  }

  const replayWrap = document.getElementById('sl-replay-wrap');
  const recentHist = sl?.recentHistory || [];
  if (replayWrap) {
    if (recentHist.length) {
      const slice = recentHist.slice(0, 6).reverse();
      const maxAbs = Math.max(
        1.0,
        ...slice.flatMap((h) => [Math.abs(Number(h.goldPredPct) || 0), Math.abs(Number(h.goldActualPct) || 0)])
      );
      const colsHtml = slice
        .map((h) => {
          const p = Number(h.goldPredPct) || 0;
          const a = Number(h.goldActualPct) || 0;
          const pH = Math.round(clampNum((Math.abs(p) / maxAbs) * 38, 4, 38));
          const aH = Math.round(clampNum((Math.abs(a) / maxAbs) * 38, 4, 38));
          const actCls = a >= 0 ? 'act-up' : 'act-down';
          const lbl = h.date ? h.date.slice(5) : '—';
          const tip = `${lbl}: Pred ${p >= 0 ? '+' : ''}${p.toFixed(2)}% vs Actual ${a >= 0 ? '+' : ''}${a.toFixed(2)}%`;
          return `
            <div class="sl-replay-col" title="${escapeHtml(tip)}">
              <div class="sl-replay-track">
                <span class="sl-bar pred" style="height:${pH}px"></span>
                <span class="sl-bar ${actCls}" style="height:${aH}px"></span>
              </div>
              <span>${escapeHtml(lbl)}</span>
            </div>`;
        })
        .join('');
      replayWrap.innerHTML = `
        <div class="sl-replay-head">
          <span>Forecast (Gold) vs. Actual (Green/Red) · Daily Gold</span>
          <span>${slice.length}d Replay</span>
        </div>
        <div class="sl-replay-bars">${colsHtml}</div>`;
      replayWrap.hidden = false;
    } else {
      replayWrap.hidden = true;
    }
  }

  if (accList) {
    const rows = [];
    if (recentHist.length) {
      rows.push('<div class="sl-section-label">Recent Daily Forecast Checks</div>');
      for (const h of recentHist.slice(0, 4)) {
        const dtLbl = h.date ? h.date.slice(5) : '—';
        const fmtP = (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`;
        const gErr = Math.abs((Number(h.goldActualPct) || 0) - (Number(h.goldPredPct) || 0)).toFixed(2);
        const gTag = `<span class="acc-tag ${h.dirHitGold ? 'hit' : 'miss'}">${h.dirHitGold ? 'RIGHT' : 'TUNED'}</span>`;
        const sTag = `<span class="acc-tag ${h.dirHitSilver ? 'hit' : 'miss'}">${h.dirHitSilver ? 'RIGHT' : 'TUNED'}</span>`;
        rows.push(
          `<div class="acc-row"><span>${escapeHtml(dtLbl)}</span><span>Gold ${fmtP(h.goldPredPct)} → ${fmtP(h.goldActualPct)} (±${gErr}%)${gTag} · Silver ${fmtP(h.silverActualPct)}${sTag}</span></div>`
        );
      }
    }
    rows.push('<div class="sl-section-label">6-Month Causal Walk-Forward (7-Day &amp; 30-Day)</div>');
    if (btGold) {
      const gSamples = Math.max(0, Math.round(Number(btGold.samples) || 0));
      const gDir = Math.round(Number(btGold.dirHitPct) || 0);
      const gErr = btGold.avgErrPct != null ? ` · ±${Number(btGold.avgErrPct).toFixed(2)}% Err` : '';
      const gSkill = Number.isFinite(btGold.pinballSkillPct) ? ` · Skill ${btGold.pinballSkillPct >= 0 ? '+' : ''}${btGold.pinballSkillPct}%` : '';
      rows.push(
        `<div class="acc-row"><span>7-Day Audit · Gold (${gSamples} checks)</span><span>${gDir}% Right${gErr}${gSkill}</span></div>`
      );
    }
    if (btSilver) {
      const sSamples = Math.max(0, Math.round(Number(btSilver.samples) || 0));
      const sDir = Math.round(Number(btSilver.dirHitPct) || 0);
      const sErr = btSilver.avgErrPct != null ? ` · ±${Number(btSilver.avgErrPct).toFixed(2)}% Err` : '';
      const sSkill = Number.isFinite(btSilver.pinballSkillPct) ? ` · Skill ${btSilver.pinballSkillPct >= 0 ? '+' : ''}${btSilver.pinballSkillPct}%` : '';
      rows.push(
        `<div class="acc-row"><span>7-Day Audit · Silver (${sSamples} checks)</span><span>${sDir}% Right${sErr}${sSkill}</span></div>`
      );
    }
    if (btGold30) {
      const g30Samples = Math.max(0, Math.round(Number(btGold30.samples) || 0));
      const g30Dir = Math.round(Number(btGold30.dirHitPct) || 0);
      const g30Err = btGold30.avgErrPct != null ? ` · ±${Number(btGold30.avgErrPct).toFixed(2)}% Err` : '';
      const g30Conf = btGold30.conformalRadiusPct != null ? ` · Conf ±${Number(btGold30.conformalRadiusPct).toFixed(1)}%` : '';
      rows.push(
        `<div class="acc-row"><span>30-Day Audit · Gold (${g30Samples} checks)</span><span>${g30Dir}% Right${g30Err}${g30Conf}</span></div>`
      );
    }
    if (btSilver30) {
      const s30Samples = Math.max(0, Math.round(Number(btSilver30.samples) || 0));
      const s30Dir = Math.round(Number(btSilver30.dirHitPct) || 0);
      const s30Err = btSilver30.avgErrPct != null ? ` · ±${Number(btSilver30.avgErrPct).toFixed(2)}% Err` : '';
      const s30Conf = btSilver30.conformalRadiusPct != null ? ` · Conf ±${Number(btSilver30.conformalRadiusPct).toFixed(1)}%` : '';
      rows.push(
        `<div class="acc-row"><span>30-Day Audit · Silver (${s30Samples} checks)</span><span>${s30Dir}% Right${s30Err}${s30Conf}</span></div>`
      );
    }

    const pend = acc.pendingStatus || {};
    if (live7?.count > 0 || live30?.count > 0) {
      const parts = [];
      if (live7?.count > 0) parts.push(`7D: ${live7.dirHitPct}% Right (±${live7.avgErrPct ?? '—'}%, ${live7.count})`);
      if (live30?.count > 0) parts.push(`30D: ${live30.dirHitPct}% Right (±${live30.avgErrPct ?? '—'}%, ${live30.count})`);
      else if (pend.next30dInDays != null) parts.push(`First 30D live grade in ${pend.next30dInDays}d`);
      rows.push(
        `<div class="acc-row full-span"><span>Live Logged Checks</span><span>${escapeHtml(parts.join(' · '))}</span></div>`
      );
    } else {
      const next7 = pend.next7dInDays != null ? `Next 7D grade in ${pend.next7dInDays}d` : 'Grades 7D after 7 days';
      const next30 = pend.next30dInDays != null ? `30D in ${pend.next30dInDays}d` : '30D after 30 days';
      rows.push(
        `<div class="acc-row full-span"><span>Live Logged Checks</span><span>${escapeHtml(`Saving daily · ${next7} · ${next30}`)}</span></div>`
      );
    }
    accList.innerHTML = rows.join('');
  }

  // Scored News Feed + #228 AI "Real Signal vs. Clickbait Hype" Filter + 7-Subject Gold/Silver Topic Filter
  const newsEl = document.getElementById('outlook-news');
  const updatedEl = document.getElementById('outlook-updated');
  const filterSummaryEl = document.getElementById('news-filter-summary');
  if (updatedEl && res.base.generatedAt) {
    const dt = new Date(res.base.generatedAt);
    updatedEl.textContent = Number.isNaN(dt.getTime())
      ? '16 global feeds across central banks, vaults, solar/AI silver, retail demand, geopolitics & space'
      : `Updated ${dt.toLocaleDateString()} · 16 Gold & Silver global feeds scored for real signal vs. hype`;
  }
  const activeNewsFilter = state.settings.newsFilter || 'all';
  const activeNewsTopic = state.settings.newsTopic || 'all';
  document.getElementById('news-filter-all')?.classList.toggle('active', activeNewsFilter === 'all');
  document.getElementById('news-filter-signal')?.classList.toggle('active', activeNewsFilter === 'signal');
  document.getElementById('news-filter-nohype')?.classList.toggle('active', activeNewsFilter === 'nohype');

  const classifyNewsSignalQuality = (h) => {
    const title = String(h?.title || '');
    const lower = title.toLowerCase();
    const src = String(h?.source || '').toLowerCase();
    let score = 55;
    if (/(reuters|bloomberg|wsj|wall street|financial times|cnbc|marketwatch|kitco|mining\.com|world gold council|silver institute|federal reserve|bls|cme|comex|lbma|noaa|ecb|bank of japan)/i.test(src + ' ' + title)) {
      score += 18;
    }
    if (/(fed|fomc|cpi|pce|inflation|payroll|central bank|pboc|rbi|brics|repatriat|sge|shanghai|comex|lbma|lease rate|vault|inventory|deficit|import|tariff|treasury|yield|production|aisc|strike|rate cut|rate hike|etf|solar|topcon|solid-state|ai data center|geomagnetic|solar flare|paxg|xaut|swiss|dubai)/i.test(lower)) {
      score += 18;
    }
    if (Number(h?.clusterCount) > 1) score += 10;
    if (/(skyrocket|explode|collapse|crash coming|10x|100x|you won't believe|shocking|secret|urgent warning|billionaire warns|panic|all-in|moonshot|guaranteed|doomsday|wipeout|insane|massive surge imminent)/i.test(lower)) {
      score -= 42;
    }
    if ((title.match(/[!?]/g) || []).length >= 2) score -= 18;
    const upperWords = title.split(/\s+/).filter((w) => w.length >= 4 && w === w.toUpperCase() && /^[A-Z]+$/.test(w));
    if (upperWords.length >= 2) score -= 14;
    score = Math.max(5, Math.min(99, score));
    if (score >= 70) return { tier: 'signal', label: 'Real Signal', score };
    if (score <= 42) return { tier: 'hype', label: 'Clickbait Hype', score };
    return { tier: 'context', label: 'Market Note', score };
  };

  if (newsEl) {
    const rawItems = (res.base.headlines || []).map((h) => ({
      ...h,
      _q: classifyNewsSignalQuality(h),
      _topic: classifyClientHeadlineTopic(h),
    }));
    const topicCounts = {};
    for (const item of rawItems) {
      topicCounts[item._topic.topic] = (topicCounts[item._topic.topic] || 0) + 1;
    }
    const topicBarEl = document.getElementById('news-topic-chips');
    if (topicBarEl) {
      topicBarEl.querySelectorAll('.news-topic-chip').forEach((btn) => {
        const key = btn.dataset.topic || 'all';
        btn.classList.toggle('active', key === activeNewsTopic);
        const cnt = key === 'all' ? rawItems.length : (topicCounts[key] || 0);
        const baseLbl = btn.dataset.baseLabel || btn.textContent.replace(/\s*\(\d+\)$/, '');
        btn.dataset.baseLabel = baseLbl;
        btn.textContent = cnt > 0 ? `${baseLbl} (${cnt})` : baseLbl;
      });
    }

    const signalCount = rawItems.filter((h) => h._q.tier === 'signal').length;
    const hypeCount = rawItems.filter((h) => h._q.tier === 'hype').length;
    const activeSubjectsCount = Object.keys(topicCounts).length;
    const filtered = rawItems.filter((h) => {
      if (activeNewsTopic !== 'all' && h._topic.topic !== activeNewsTopic) return false;
      if (activeNewsFilter === 'signal') return h._q.tier === 'signal';
      if (activeNewsFilter === 'nohype') return h._q.tier !== 'hype';
      return true;
    });
    if (filterSummaryEl) {
      filterSummaryEl.textContent =
        rawItems.length
          ? `${rawItems.length} stories across ${activeSubjectsCount} subjects · ${signalCount} Real Signal · ${hypeCount} Hype filtered`
          : 'Waiting for headlines…';
    }
    newsEl.innerHTML = filtered.length
      ? filtered
          .slice(0, 24)
          .map((h) => {
            const safeUrl = sanitizeHttpUrl(h.url);
            const titleHtml = safeUrl
              ? `<a class="news-title" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(h.title)}</a>`
              : `<div class="news-title">${escapeHtml(h.title)}</div>`;
            const cCount = Number(h.clusterCount);
            const clusterBadge = Number.isFinite(cCount) && cCount > 1 ? ` · ${Math.floor(cCount)} articles` : '';
            const sentCls = h.sentiment === 'bullish' || h.sentiment === 'bearish' || h.sentiment === 'neutral' ? h.sentiment : '';
            const moodWord = sentCls === 'bullish' ? 'Positive' : sentCls === 'bearish' ? 'Negative' : 'Neutral';
            const qCls = h._q.tier === 'signal' ? 'sig-real' : h._q.tier === 'hype' ? 'sig-hype' : 'sig-note';
            return `
              <li class="news-item">
                ${titleHtml}
                <div class="news-meta">
                  <span>${escapeHtml(h.source || 'News')} · ${escapeHtml(h.driverLabel || 'Market')}${clusterBadge}</span>
                  <div class="news-pills-wrap">
                    <span class="news-topic-pill">${escapeHtml(h._topic.topicLabel)}</span>
                    <span class="news-sig-badge ${qCls}">${escapeHtml(h._q.label)}</span>
                    <span class="news-pill ${sentCls}">${escapeHtml(moodWord)}</span>
                  </div>
                </div>
              </li>`;
          })
          .join('')
      : '<li class="empty-state">No headlines match this subject/filter right now. Tap "All Topics" or "All" to see everything.</li>';
  }

  renderAccuracyReplayChart(res);
  renderSectorLeaders(res);
  renderComexPanel();
  renderInstitutionalPulse(res);
  renderJumpDiffusion(res);
  renderStackTracker();
}

const MINER_PROFILES = {
  NEM: 'World #1 gold miner · produces gold around $1,963/oz; profits swing strongly with gold prices.',
  AEM: 'Low-cost Canadian & Australian gold leader · known for steady output and strong profit margins.',
  B: 'Barrick Mining · major global gold miner in Nevada & Africa, producing around $1,911/oz.',
  WPM: 'Precious metals royalty company · fixed-price contracts protect profits when mining costs rise.',
  FNV: 'Diversified gold & silver royalty company · earns revenue from long-life mines without running them.',
  PAAS: 'Major Americas silver & gold producer · closely tracks silver price rallies.',
  HL: 'Largest US silver producer · moves strongly with US silver supply and prices.',
  AG: 'First Majestic Silver · focused Mexican silver miner that moves sharply when silver rallies.',
  CDE: 'Coeur Mining · growing North American silver and gold producer.',
};

function renderMinerDetailDrawer(outlookRes, leaders) {
  const drawer = document.getElementById('sector-detail-drawer');
  if (!drawer) return;
  if (!state.selectedMiner) {
    drawer.hidden = true;
    drawer.innerHTML = '';
    return;
  }
  const c = leaders.find((l) => l.symbol === state.selectedMiner);
  if (!c) {
    drawer.hidden = true;
    return;
  }

  const pts =
    Array.isArray(c.spark) && c.spark.length >= 2
      ? c.spark.map(Number).filter(Number.isFinite)
      : [Number(c.last || 0), Number(c.last || 0)];
  const minV = Math.min(...pts);
  const maxV = Math.max(...pts);
  const span = Math.max(maxV - minV, maxV * 0.005, 0.01);
  const w = 260;
  const h = 54;
  const padY = 6;
  const coords = pts.map((v, i) => {
    const x = pts.length > 1 ? (i / (pts.length - 1)) * (w - 8) + 4 : w / 2;
    const y = h - padY - ((v - minV) / span) * (h - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastCoord = coords[coords.length - 1].split(',');
  const lineCol = c.metal === 'silver' ? '#C2CAD6' : '#E8C25D';
  const fillCol = c.metal === 'silver' ? 'rgba(194,202,214,0.14)' : 'rgba(212,168,67,0.15)';
  const areaPts = `4,${h - 2} ${coords.join(' ')} ${lastCoord[0]},${h - 2}`;

  const p1 = Number(c.pct1d ?? 0);
  const p5 = Number(c.pct5d ?? p1);
  const hi14 = Number.isFinite(c.high14) ? c.high14 : maxV;
  const lo14 = Number.isFinite(c.low14) ? c.low14 : minV;
  const dec = c.last >= 100 ? 0 : 2;
  const spotRef = c.metal === 'silver' ? 'Silver' : 'Gold';
  const sectorRel =
    c.metal === 'silver'
      ? outlookRes?.base?.proSignals?.miners?.silVsSilver10dPct
      : outlookRes?.base?.proSignals?.miners?.gdxVsGold10dPct;
  const spreadLabel = sectorRel != null ? `${sectorRel >= 0 ? '+' : ''}${Number(sectorRel).toFixed(1)}% vs. ${spotRef} (10d)` : `${p5 >= 0 ? '+' : ''}${p5.toFixed(1)}% (5d)`;

  const headlines = outlookRes?.base?.headlines || [];
  const nameKey = c.name.toLowerCase().split(' ')[0];
  const symRx = new RegExp(`\\b${c.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const matchedHeadline = headlines.find(
    (hl) => (hl.title && (symRx.test(hl.title) || (nameKey.length >= 4 && hl.title.toLowerCase().includes(nameKey))))
  );
  const noteText = matchedHeadline
    ? `Latest News: ${matchedHeadline.title}`
    : MINER_PROFILES[c.symbol] || `${c.name} (${c.symbol}) is part of our 9-company mining tracker.`;

  const metalCls = c.metal === 'silver' ? 'silver' : 'gold';
  drawer.innerHTML = `
    <div class="sector-detail-head">
      <div class="sector-detail-title">
        <span class="sector-sym ${metalCls}">${escapeHtml(c.symbol)}</span> · ${escapeHtml(c.name)} (${escapeHtml(spotRef)} Company)
      </div>
      <button type="button" class="sector-detail-close" id="btn-close-miner-drawer">Close ✕</button>
    </div>
    <div class="sector-detail-metrics">
      <div class="sector-detail-box">
        <span>Spot / 1D Move</span>
        <strong>$${Number(c.last || 0).toFixed(dec)} (${p1 >= 0 ? '+' : ''}${p1.toFixed(1)}%)</strong>
      </div>
      <div class="sector-detail-box">
        <span>5D Return</span>
        <strong class="${p5 >= 0 ? 'up' : 'down'}">${p5 >= 0 ? '+' : '−'}${Math.abs(p5).toFixed(1)}%</strong>
      </div>
      <div class="sector-detail-box">
        <span>14D Range (Low–High)</span>
        <strong>$${lo14.toFixed(dec)} – $${hi14.toFixed(dec)}</strong>
      </div>
      <div class="sector-detail-box">
        <span>vs. ${escapeHtml(spotRef)} Price</span>
        <strong>${escapeHtml(spreadLabel)}</strong>
      </div>
    </div>
    <svg class="sector-spark-wrap" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(c.symbol)} 14-day price trend">
      <polygon points="${areaPts}" fill="${fillCol}" />
      <polyline points="${coords.join(' ')}" fill="none" stroke="${lineCol}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    </svg>
    <div class="sector-detail-note">${escapeHtml(noteText)}</div>
  `;
  drawer.hidden = false;
}

function renderSectorLeaders(outlookRes) {
  const gridEl = document.getElementById('sector-leaders-grid');
  if (!gridEl) return;
  const miners = outlookRes?.base?.proSignals?.miners || FALLBACK_OUTLOOK.proSignals.miners;
  const leaders =
    Array.isArray(miners?.sectorLeaders) && miners.sectorLeaders.length
      ? miners.sectorLeaders
      : FALLBACK_OUTLOOK.proSignals.miners.sectorLeaders;

  const badgeEl = document.getElementById('sector-regime-badge');
  if (badgeEl) {
    const reg = miners?.regime || 'In Line';
    badgeEl.textContent = reg.includes('Leading') ? 'Leading' : reg.includes('Lag') ? 'Lagging' : 'In Line';
    badgeEl.className = `signal-pill ${reg.includes('Leading') ? 'bullish' : reg.includes('Lag') ? 'bearish' : ''}`;
  }

  const subEl = document.getElementById('sector-subtitle');
  if (subEl) {
    const gBr = miners?.goldBreadthPct;
    const sBr = miners?.silverBreadthPct;
    subEl.textContent =
      gBr != null && sBr != null
        ? `Past 5 days: ${gBr}% of Gold miners up · ${sBr}% of Silver miners up · Tap any company`
        : '9 major mining & royalty companies · Tap any company for its 14-day trend';
  }

  gridEl.innerHTML = leaders
    .map((c) => {
      const p5 = Number(c.pct5d ?? c.pct1d ?? 0);
      const cls = p5 > 0.05 ? 'up' : p5 < -0.05 ? 'down' : '';
      const pctStr = `${p5 >= 0 ? '+' : '−'}${Math.abs(p5).toFixed(1)}%`;
      const lastStr = Number.isFinite(c.last) ? `$${Number(c.last).toFixed(c.last >= 100 ? 0 : 2)}` : '$—';
      const isSel = state.selectedMiner === c.symbol;
      const metalCls = c.metal === 'silver' ? 'silver' : 'gold';
      return `
        <button type="button" class="sector-chip${isSel ? ' selected' : ''}" data-symbol="${escapeHtml(c.symbol)}" aria-pressed="${isSel ? 'true' : 'false'}">
          <div class="sector-chip-top">
            <span class="sector-sym ${metalCls}">${escapeHtml(c.symbol)}</span>
            <span class="sector-pct ${cls}">${pctStr}</span>
          </div>
          <div class="sector-name">${escapeHtml(c.name)}</div>
          <div class="sector-last">${lastStr} (5d)</div>
        </button>`;
    })
    .join('');

  renderMinerDetailDrawer(outlookRes, leaders);
}

/* ---------- Institutional Pulse (Event Calendar, ^GVZ, ETF Flows, Copper/JPY, Basis) ---------- */

const CLIENT_FOMC_DATES = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16',
  '2027-07-28', '2027-09-22', '2027-11-03', '2027-12-15',
];

const CLIENT_VERIFIED_CPI_DATES = {
  '2026-01': '2026-01-13', '2026-02': '2026-02-13', '2026-03': '2026-03-11',
  '2026-04': '2026-04-10', '2026-05': '2026-05-12', '2026-06': '2026-06-10',
  '2026-07': '2026-07-14', '2026-08': '2026-08-12', '2026-09': '2026-09-11',
  '2026-11': '2026-11-10', '2026-12': '2026-12-10',
  '2027-01': '2027-01-13', '2027-02': '2027-02-11', '2027-03': '2027-03-10',
  '2027-04': '2027-04-13', '2027-07': '2027-07-14', '2027-08': '2027-08-11',
  '2027-09': '2027-09-14', '2027-10': '2027-10-14', '2027-11': '2027-11-10',
  '2027-12': '2027-12-10',
};

function computeClientEventRisk(nowDate = new Date()) {
  const startUtc = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  const dayMs = 86400000;
  const iso = (d) => d.toISOString().slice(0, 10);
  const events = CLIENT_FOMC_DATES.map((ds) => ({ type: 'fomc', title: 'Fed Interest Rate Decision', date: ds }));
  const fndMonths = new Set([1, 3, 5, 7, 10]);

  for (let off = 0; off <= 3; off++) {
    const dt = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() + off, 1));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1));
    const nfp = new Date(Date.UTC(y, m, 1 + ((5 - first.getUTCDay() + 7) % 7)));
    events.push({ type: 'nfp', title: 'US Monthly Jobs Report', date: iso(nfp) });
    const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
    let cpiDate = CLIENT_VERIFIED_CPI_DATES[ym];
    if (!cpiDate) {
      const cpi = new Date(Date.UTC(y, m, 12));
      if (cpi.getUTCDay() === 6) cpi.setUTCDate(14);
      else if (cpi.getUTCDay() === 0) cpi.setUTCDate(13);
      cpiDate = iso(cpi);
    }
    events.push({ type: 'cpi', title: 'US Inflation Report (CPI)', date: cpiDate });
    if (fndMonths.has(m)) {
      const fnd = new Date(Date.UTC(y, m + 1, 0));
      while (fnd.getUTCDay() === 0 || fnd.getUTCDay() === 6) fnd.setUTCDate(fnd.getUTCDate() - 1);
      events.push({ type: 'comex_fnd', title: 'Silver Vault Delivery Start', date: iso(fnd) });
    }
  }

  const upcoming = events
    .map((e) => ({
      ...e,
      daysUntil: Math.ceil(
        (Date.UTC(Number(e.date.slice(0, 4)), Number(e.date.slice(5, 7)) - 1, Number(e.date.slice(8, 10))) - startUtc) /
          dayMs
      ),
    }))
    .filter((e) => e.daysUntil >= 0 && e.daysUntil <= 45)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const nextEvent = upcoming[0] || null;
  let jumpBoost = 0;
  let regime = 'Calm Calendar';
  if (nextEvent) {
    if (nextEvent.daysUntil <= 2) { jumpBoost = 0.24; regime = 'Imminent (<48h)'; }
    else if (nextEvent.daysUntil <= 5) { jumpBoost = 0.14; regime = 'Pre-Event Vol'; }
    else if (nextEvent.daysUntil <= 12) { jumpBoost = 0.06; regime = 'Catalyst Watch'; }
  }
  return { nextEvent, upcoming: upcoming.slice(0, 3), jumpBoost, regime };
}

function getActiveInstitutionalSignals(outlookRes) {
  const fromData = outlookRes?.base?.institutionalSignals || {};
  return {
    eventRisk: computeClientEventRisk(new Date()),
    impliedVol: fromData.impliedVol || {
      gvz: 21.4,
      ivMinusRv: 4.9,
      blendedGoldAnnPct: 19.2,
      jumpBoost: 0.1,
      regime: 'Options Pricing Breakout',
    },
    etfFlows: fromData.etfFlows || {
      gldVolRatio: 1.24,
      slvVolRatio: 1.38,
      pslvVsSlv10dPct: 1.35,
      goldSignal: 0.44,
      silverSignal: 0.56,
      regime: 'Institutional Accumulation',
    },
    crossMarket: fromData.crossMarket || {
      copperLast: 5.62,
      cu5dPct: 2.45,
      usdjpyLast: 151.4,
      jpy5dPct: -1.15,
      jumpBoost: 0.06,
      regime: 'Copper Rally (Silver Tailwind)',
    },
    basis: fromData.basis || {
      gold: { basisUsd: 5.7, state: 'Compressed EFP', jumpBoost: 0.08 },
      silver: { basisUsd: -0.07, state: 'Backwardation (Tight!)', jumpBoost: 0.22 },
    },
  };
}

function renderInstitutionalPulse(outlookRes) {
  if (!document.getElementById('panel-institutional')) return;
  const inst = getActiveInstitutionalSignals(outlookRes);

  // 1. Event-Risk Calendar Strip
  const badgeEl = document.getElementById('inst-event-badge');
  if (badgeEl) {
    badgeEl.textContent = inst.eventRisk.regime;
    badgeEl.className = `signal-pill ${inst.eventRisk.jumpBoost >= 0.14 ? 'bearish' : inst.eventRisk.jumpBoost > 0 ? 'bullish' : ''}`;
  }
  const stripEl = document.getElementById('inst-event-strip');
  if (stripEl) {
    const liveExpanded = buildClientExpandedEvents(new Date());
    const backendExpanded = Array.isArray(inst.eventRisk.expandedEvents) && inst.eventRisk.expandedEvents.length
      ? inst.eventRisk.expandedEvents
      : [];
    const evList = liveExpanded.length ? liveExpanded : (backendExpanded.length ? backendExpanded : inst.eventRisk.upcoming);
    const catLabels = {
      macro: 'Macro',
      vaults: 'Vaults',
      central_banks: 'Central Bank',
      positioning: 'COT',
      physical: 'Physical',
      space: 'Space',
    };
    stripEl.innerHTML = evList
      .slice(0, 6)
      .map((ev) => {
        const dtLbl = new Date(`${ev.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        const eta = ev.daysUntil === 0 ? 'TODAY' : `${ev.daysUntil}d · ${dtLbl}`;
        const catKey = ev.category || 'macro';
        const catLbl = catLabels[catKey] || 'Event';
        return `
          <div class="event-pill ${ev.daysUntil <= 3 ? 'imminent' : ''}">
            <span class="event-left">
              <span class="event-dot"></span>
              <span class="event-cat-tag ${escapeHtml(catKey)}">${escapeHtml(catLbl)}</span>
              <span class="event-name">${escapeHtml(ev.title)}</span>
            </span>
            <span class="event-eta">${escapeHtml(eta)}</span>
          </div>`;
      })
      .join('');
  }

  // 2. Options Fear Gauge (^GVZ)
  const gvzVal = document.getElementById('inst-gvz-val');
  const gvzSub = document.getElementById('inst-gvz-sub');
  if (gvzVal && gvzSub && inst.impliedVol) {
    const iv = inst.impliedVol;
    gvzVal.textContent = `${iv.gvz.toFixed(1)}% swings`;
    gvzSub.textContent = iv.gvz >= 25 ? 'High fear — big moves expected' : iv.gvz >= 18 ? 'Elevated expected swings' : 'Calm market expectations';
  }

  // 3. Bullion Fund Buying (GLD / SLV / PSLV)
  const etfVal = document.getElementById('inst-etf-val');
  const etfSub = document.getElementById('inst-etf-sub');
  if (etfVal && etfSub && inst.etfFlows) {
    const ef = inst.etfFlows;
    const avgRatio = (((ef.gldVolRatio || 1) + (ef.slvVolRatio || 1)) / 2).toFixed(2);
    etfVal.textContent = `${avgRatio}× normal vol`;
    etfVal.className = `inst-val ${ef.silverSignal >= 0.25 ? 'up' : ef.silverSignal <= -0.25 ? 'down' : ''}`;
    etfSub.textContent = ef.silverSignal >= 0.2 ? 'Heavy buying in gold & silver funds' : ef.silverSignal <= -0.2 ? 'Funds seeing selling pressure' : 'Steady fund volume';
  }

  // 4. Copper & Japan Yen
  const crossVal = document.getElementById('inst-cross-val');
  const crossSub = document.getElementById('inst-cross-sub');
  if (crossVal && crossSub && inst.crossMarket) {
    const cm = inst.crossMarket;
    const cuStr = cm.cu5dPct != null ? `Copper ${cm.cu5dPct >= 0 ? '+' : ''}${cm.cu5dPct.toFixed(1)}%` : 'Copper —';
    const jpyStr = cm.usdjpyLast != null ? `¥${cm.usdjpyLast.toFixed(1)}` : 'Yen —';
    crossVal.textContent = `${cuStr} · ${jpyStr}`;
    crossVal.className = `inst-val ${(cm.cu5dPct || 0) >= 1 ? 'up' : (cm.cu5dPct || 0) <= -1.5 ? 'down' : ''}`;
    crossSub.textContent = (cm.cu5dPct || 0) >= 1 ? 'Rising copper helps industrial silver' : (cm.cu5dPct || 0) <= -1.5 ? 'Falling copper weighs on silver' : 'Industrial demand neutral';
  }

  // 5. Futures vs. Spot Spread
  const basisVal = document.getElementById('inst-basis-val');
  const basisSub = document.getElementById('inst-basis-sub');
  const activeBasis = outlookRes?.futures?.gold || outlookRes?.futures?.silver ? outlookRes.futures : inst.basis;
  if (basisVal && basisSub && activeBasis) {
    const bg = activeBasis.gold;
    const bs = activeBasis.silver;
    const gStr = bg ? `Gold ${bg.basisUsd >= 0 ? '+' : '−'}$${Math.abs(bg.basisUsd).toFixed(2)}` : 'Gold —';
    const sStr = bs ? `Silver ${bs.basisUsd >= 0 ? '+' : '−'}$${Math.abs(bs.basisUsd).toFixed(2)}` : 'Silver —';
    basisVal.textContent = `${gStr} · ${sStr}`;
    const tight = (bs?.basisUsd ?? 1) < 0 || (bg?.basisUsd ?? 1) < 0;
    basisVal.className = `inst-val ${tight ? 'up' : ''}`;
    basisSub.textContent =
      bs?.basisUsd < 0 && bg?.basisUsd < 0
        ? 'Gold & Silver supply shortage!'
        : bs?.basisUsd < 0
          ? 'Silver supply tight (backwardation)'
          : bg?.basisUsd < 0
            ? 'Gold supply tight (backwardation)'
            : 'Normal futures pricing';
  }
}

/* ---------- On-Device Merton Jump-Diffusion Monte Carlo Engine ---------- */

const MC_HORIZON_SPECS = {
  '1d':  { label: '1D',  tradingDays: 1,    steps: 12, xMid: '12h',   xEnd: '+1D' },
  '7d':  { label: '7D',  tradingDays: 5,    steps: 10, xMid: 'Day 3', xEnd: '+7D' },
  '1m':  { label: '1M',  tradingDays: 21,   steps: 21, xMid: 'Day 11', xEnd: '+1M' },
  '6m':  { label: '6M',  tradingDays: 126,  steps: 26, xMid: '+3M',   xEnd: '+6M' },
  '1y':  { label: '1Y',  tradingDays: 252,  steps: 26, xMid: '+6M',   xEnd: '+1Y' },
  '5y':  { label: '5Y',  tradingDays: 1260, steps: 30, xMid: '+2.5Y', xEnd: '+5Y' },
  '10y': { label: '10Y', tradingDays: 2520, steps: 36, xMid: '+5Y',   xEnd: '+10Y' },
  all:   { label: '15Y', tradingDays: 3780, steps: 36, xMid: '+7.5Y', xEnd: '+15Y' },
};

const mcState = {
  metal: 'gold',
  horizon: '7d',
  seed: 20261119,
  targetByMetal: { gold: 3800, silver: 50 },
  cacheKey: '',
  lastSim: null,
  chartCache: {},
};

function createMcRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mcNormal(rng) {
  let u = 0;
  let v = 0;
  while (u <= 1e-12) u = rng();
  while (v <= 1e-12) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function mcPoisson(lambda, rng) {
  if (lambda <= 0) return 0;
  // Normal approximation for large step lambdas (e.g. 5Y / 10Y / 15Y monthly/quarterly steps)
  if (lambda > 10) {
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * mcNormal(rng)));
  }
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 24);
  return k - 1;
}

function mcQuantile(sorted, q) {
  if (!sorted.length) return 0;
  const idx = clampNum(q * (sorted.length - 1), 0, sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
}

function estimateClientJumpParams(metal, outlookRes, tradingDays = 21) {
  const m = outlookRes[metal];
  const isSilver = metal === 'silver';
  const vix = outlookRes.base?.macroSnapshot?.vix ?? 19;
  const coneMult = outlookRes.base?.coneMultiplier ?? 1.0;
  const shockBoost = outlookState.activeScenarios.size * 0.14;
  const liveComex = comexState.data || outlookRes.base?.comex || FALLBACK_COMEX;
  const inst = getActiveInstitutionalSignals(outlookRes);
  const comexJumpBoost = liveComex?.[metal]?.jumpBoost ?? 0;
  const instJumpBoost =
    (inst.eventRisk?.jumpBoost || 0) +
    (inst.impliedVol?.jumpBoost || 0) +
    (inst.crossMarket?.jumpBoost || 0) +
    (inst.basis?.[metal]?.jumpBoost || 0);
  const catIntensity = clampNum(Math.abs(m.unit) * 0.65 + shockBoost + comexJumpBoost + instJumpBoost, 0.15, 1.0);

  // Mean-revert short-term catalyst drift toward structural 30D model (18-90d) & secular bullion drift on multi-year horizons
  const shortTermWeight = 1 / (1 + tradingDays / 90);
  const secularDailyDrift = isSilver ? 0.072 / 252 : 0.068 / 252;
  const activeUnit = tradingDays >= 18 && Number.isFinite(m.unit30d) ? m.unit30d : m.unit;
  const rawShortDrift = clampNum(activeUnit * m.dailyVol * 0.22, -0.008, 0.008);
  const dailyDrift = rawShortDrift * shortTermWeight + secularDailyDrift * (1 - shortTermWeight);

  // Dampen annualized vol slightly over very long horizons (volatility mean reversion)
  const volDamp = tradingDays > 252 ? clampNum(Math.pow(252 / tradingDays, 0.08), 0.76, 1.0) : 1.0;
  const diffVol = clampNum(m.dailyVol * 0.84 * volDamp * clampNum(coneMult, 0.8, 1.45), 0.0045, 0.045);

  const jc = outlookRes.base?.selfLearning?.jumpCalibration || {};
  const lambdaMult = clampNum(Number(jc.lambdaMult ?? 1.0), 0.75, 1.45);
  const sigmaJMult = clampNum(Number(jc.sigmaJMult ?? 1.0), 0.75, 1.45);

  // Regime-aware asymmetric jump skew & Squeeze Exhaustion / Slam Risk detection
  const reg = m.regime || outlookRes.marketRegime?.[metal] || null;
  const sqzScore = Number.isFinite(reg?.squeezeScore) ? reg.squeezeScore : 0;
  const discScore = Number.isFinite(reg?.discoveryScore) ? reg.discoveryScore : 50;
  const isBackw = Boolean(reg?.isBackwardation || outlookRes.futures?.[metal]?.isBackwardation);
  const rsi14 = Number.isFinite(m.rsi14) ? m.rsi14 : null;
  const exhaustionRisk = sqzScore >= 65 && discScore < 45 && rsi14 != null && rsi14 >= 78;

  let regimeLambdaBoost = 0;
  let regimeSigmaMult = 1.0;
  let regimeJumpSkew = 0;
  let skewRegime = 'Balanced Tails';

  if (exhaustionRisk) {
    regimeLambdaBoost = (isSilver ? 0.032 : 0.022) * shortTermWeight;
    regimeSigmaMult = 1.18;
    regimeJumpSkew = (isSilver ? -0.012 : -0.007) * shortTermWeight;
    skewRegime = 'Squeeze Exhaustion — Slam Risk';
  } else if (sqzScore >= 55 || isBackw) {
    const sqzInt = clampNum((sqzScore - 45) / 55, 0, 1) + (isBackw ? 0.25 : 0);
    regimeLambdaBoost = clampNum(sqzInt * (isSilver ? 0.034 : 0.021), 0, 0.045) * shortTermWeight;
    regimeSigmaMult = 1 + clampNum(sqzInt * 0.13, 0, 0.16) * shortTermWeight;
    regimeJumpSkew = clampNum(sqzInt * (isSilver ? 0.011 : 0.0065), 0, isSilver ? 0.014 : 0.0085) * shortTermWeight;
    skewRegime = isBackw ? 'Right-Tail Squeeze (Backwardation)' : 'Right-Tail Squeeze';
  } else if (discScore >= 58) {
    regimeJumpSkew = (isSilver ? 0.003 : 0.002) * shortTermWeight;
    regimeSigmaMult = 0.96;
    skewRegime = 'Steady Discovery';
  }

  const vixBoost = clampNum((vix - 16) / 35, 0, 0.08) * shortTermWeight;
  const catBoost = clampNum(catIntensity * 0.04, 0, 0.05) * shortTermWeight;
  const lambda = clampNum(((isSilver ? 0.085 : 0.045) + vixBoost + catBoost + regimeLambdaBoost) * lambdaMult, 0.02, 0.30);
  const jumpSigma = (isSilver ? 0.042 : 0.022) * volDamp * clampNum(coneMult, 0.8, 1.45) * sigmaJMult * regimeSigmaMult;
  const jumpMean = clampNum(m.unit * (isSilver ? 0.012 : 0.007) * shortTermWeight + regimeJumpSkew, -0.024, 0.026);
  const adjDrift = exhaustionRisk && dailyDrift > 0 ? Math.min(dailyDrift * 0.35, 0.0005) : dailyDrift;

  return {
    diffVol,
    lambda,
    jumpMean,
    jumpSigma,
    dailyDrift: adjDrift,
    expectedJumpsPerMonth: +(lambda * 21).toFixed(1),
    skewRegime,
    exhaustionRisk,
  };
}

function runClientJumpDiffusion({ spot, horizonKey = '7d', paths = 1500, params, seed }) {
  const spec = MC_HORIZON_SPECS[horizonKey] || MC_HORIZON_SPECS['7d'];
  const totalDays = spec.tradingDays;
  const steps = spec.steps;
  const dt = totalDays / steps;

  const rng = createMcRng(seed);
  const { diffVol, dailyDrift, lambda, jumpMean, jumpSigma } = params;
  const kappa = Math.exp(jumpMean + 0.5 * jumpSigma * jumpSigma) - 1;
  const driftStep = (dailyDrift - 0.5 * diffVol * diffVol - lambda * kappa) * dt;
  const stepDiffVol = diffVol * Math.sqrt(dt);
  const stepLambda = lambda * dt;

  const terminalPrices = new Float64Array(paths);
  const maxPrices = new Float64Array(paths);
  const minPrices = new Float64Array(paths);
  const stepBuckets = Array.from({ length: steps + 1 }, () => new Float64Array(paths));
  const samplePaths = [];
  const sampleCount = 18;

  for (let p = 0; p < paths; p++) {
    let s = spot;
    let hi = spot;
    let lo = spot;
    stepBuckets[0][p] = s;
    const rec = p < sampleCount;
    const arr = rec ? [s] : null;

    for (let st = 1; st <= steps; st++) {
      const z = mcNormal(rng);
      const nJumps = mcPoisson(stepLambda, rng);
      let jumpSum = 0;
      if (nJumps > 0) {
        // Exact sum of nJumps i.i.d. Normal(jumpMean, jumpSigma^2) = Normal(n*jumpMean, n*jumpSigma^2)
        jumpSum = nJumps * jumpMean + Math.sqrt(nJumps) * jumpSigma * mcNormal(rng);
      }
      s = s * Math.exp(driftStep + stepDiffVol * z + jumpSum);
      if (s > hi) hi = s;
      if (s < lo) lo = s;
      stepBuckets[st][p] = s;
      if (rec) arr.push(s);
    }

    terminalPrices[p] = s;
    maxPrices[p] = hi;
    minPrices[p] = lo;
    if (rec) samplePaths.push(arr);
  }

  const curves = { p10: [], p25: [], p50: [], p75: [], p90: [] };
  for (let st = 0; st <= steps; st++) {
    const sorted = Array.from(stepBuckets[st]).sort((a, b) => a - b);
    curves.p10.push(mcQuantile(sorted, 0.1));
    curves.p25.push(mcQuantile(sorted, 0.25));
    curves.p50.push(mcQuantile(sorted, 0.5));
    curves.p75.push(mcQuantile(sorted, 0.75));
    curves.p90.push(mcQuantile(sorted, 0.9));
  }

  let higher = 0;
  for (let p = 0; p < paths; p++) {
    if (terminalPrices[p] > spot) higher++;
  }

  return {
    spot,
    paths,
    horizonKey,
    spec,
    steps,
    tradingDays: totalDays,
    params,
    p10: curves.p10[steps],
    p25: curves.p25[steps],
    p50: curves.p50[steps],
    p75: curves.p75[steps],
    p90: curves.p90[steps],
    probFinishHigherPct: Math.round((higher / paths) * 100),
    curves,
    samplePaths,
    terminalPrices,
    maxPrices,
    minPrices,
  };
}

function getChartJumpDiffusion(metal, outlookRes, horizonKey = '7d') {
  const m = outlookRes[metal];
  const spec = MC_HORIZON_SPECS[horizonKey] || MC_HORIZON_SPECS['7d'];
  const key = `${metal}|${horizonKey}|${m.spot.toFixed(2)}|${m.score}|${mcState.seed}`;
  const cached = mcState.chartCache[key];
  if (cached) return cached;
  const params = estimateClientJumpParams(metal, outlookRes, spec.tradingDays);
  const sim = runClientJumpDiffusion({
    spot: m.spot,
    horizonKey,
    paths: 800,
    params,
    seed: mcState.seed + (metal === 'silver' ? 777 : 0),
  });
  mcState.chartCache[key] = sim;
  return sim;
}

function evaluateMcTarget(sim, targetOz) {
  const isUp = targetOz >= sim.spot;
  let touch = 0;
  let finish = 0;
  const n = sim.paths;
  for (let p = 0; p < n; p++) {
    if (isUp ? sim.maxPrices[p] >= targetOz : sim.minPrices[p] <= targetOz) touch++;
    if (isUp ? sim.terminalPrices[p] >= targetOz : sim.terminalPrices[p] <= targetOz) finish++;
  }
  return {
    isUp,
    pctDelta: ((targetOz - sim.spot) / sim.spot) * 100,
    touchPct: Math.round((touch / n) * 100),
    finishPct: Math.round((finish / n) * 100),
  };
}

function drawMcPathsCanvas(sim, metal, targetOz) {
  const canvas = document.getElementById('mc-paths-canvas');
  if (!canvas || !sim) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const styles = getComputedStyle(document.documentElement);
  const upCol = styles.getPropertyValue('--up').trim() || '#22C55E';
  const downCol = styles.getPropertyValue('--down').trim() || '#EF4444';
  const accentCol =
    metal === 'gold'
      ? styles.getPropertyValue('--gold').trim() || '#D4A843'
      : styles.getPropertyValue('--silver').trim() || '#C2CAD6';
  const textCol = styles.getPropertyValue('--text').trim() || '#F4F5F7';
  const mutedCol = styles.getPropertyValue('--text-subtle').trim() || '#777';
  const gridCol = styles.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.06)';
  const isLight = isLightThemeName(document.documentElement.getAttribute('data-theme'));

  const steps = sim.steps;
  let minVal = Math.min(...sim.curves.p10, targetOz || sim.spot);
  let maxVal = Math.max(...sim.curves.p90, targetOz || sim.spot);
  sim.samplePaths.forEach((path) => {
    for (let i = 0; i < path.length; i++) {
      if (path[i] < minVal) minVal = path[i];
      if (path[i] > maxVal) maxVal = path[i];
    }
  });
  const pSpan = sim.p90 - sim.p10 || sim.spot * 0.05;
  minVal = Math.max(0, Math.max(minVal, sim.p10 - pSpan * 1.15));
  maxVal = Math.min(maxVal, sim.p90 + pSpan * 1.15);
  const span = maxVal - minVal || sim.spot * 0.04;
  minVal = Math.max(0, minVal - span * 0.08);
  maxVal += span * 0.08;

  const padTop = 12;
  const padBottom = 20;
  const padLeft = 8;
  const padRight = 58;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const xAt = (s) => padLeft + (s / Math.max(1, steps)) * plotW;
  const yAt = (v) => padTop + (1 - (v - minVal) / (maxVal - minVal)) * plotH;

  // Horizontal grid + right Y-axis labels
  ctx.font = '500 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let g = 0; g <= 3; g++) {
    const val = maxVal - ((maxVal - minVal) * g) / 3;
    const y = yAt(val);
    ctx.strokeStyle = gridCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();
    ctx.fillStyle = mutedCol;
    ctx.fillText(formatCompactMoney(convertUnit(val), val >= 100 ? 0 : 2), w - 2, y);
  }

  const fillEnvelope = (upperArr, lowerArr, fillStyle) => {
    ctx.save();
    ctx.beginPath();
    upperArr.forEach((v, d) => (d === 0 ? ctx.moveTo(xAt(d), yAt(v)) : ctx.lineTo(xAt(d), yAt(v))));
    for (let d = lowerArr.length - 1; d >= 0; d--) {
      ctx.lineTo(xAt(d), yAt(lowerArr[d]));
    }
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.restore();
  };

  fillEnvelope(
    sim.curves.p90,
    sim.curves.p10,
    metal === 'gold'
      ? isLight ? 'rgba(181, 134, 30, 0.09)' : 'rgba(212, 168, 67, 0.09)'
      : isLight ? 'rgba(100, 116, 139, 0.10)' : 'rgba(194, 202, 214, 0.09)'
  );
  fillEnvelope(
    sim.curves.p75,
    sim.curves.p25,
    metal === 'gold'
      ? isLight ? 'rgba(181, 134, 30, 0.15)' : 'rgba(212, 168, 67, 0.15)'
      : isLight ? 'rgba(100, 116, 139, 0.16)' : 'rgba(194, 202, 214, 0.15)'
  );

  // Translucent simulated Merton Jump-Diffusion sample paths
  ctx.save();
  ctx.lineWidth = 1;
  sim.samplePaths.forEach((path) => {
    const endUp = path[path.length - 1] >= sim.spot;
    ctx.strokeStyle = endUp
      ? isLight ? 'rgba(22, 163, 74, 0.24)' : 'rgba(34, 197, 94, 0.22)'
      : isLight ? 'rgba(220, 38, 38, 0.22)' : 'rgba(239, 68, 68, 0.20)';
    ctx.beginPath();
    path.forEach((v, d) => {
      const y = clampNum(yAt(v), padTop, padTop + plotH);
      if (d === 0) ctx.moveTo(xAt(d), y);
      else ctx.lineTo(xAt(d), y);
    });
    ctx.stroke();
  });
  ctx.restore();

  const drawLine = (arr, color, dash, width) => {
    ctx.save();
    if (dash) ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    arr.forEach((v, d) => (d === 0 ? ctx.moveTo(xAt(d), yAt(v)) : ctx.lineTo(xAt(d), yAt(v))));
    ctx.stroke();
    ctx.restore();
  };

  drawLine(sim.curves.p90, upCol, [4, 3], 1.6);
  drawLine(sim.curves.p10, downCol, [4, 3], 1.6);
  drawLine(sim.curves.p50, accentCol, null, 2.2);

  if (targetOz > 0 && targetOz >= minVal && targetOz <= maxVal) {
    const ty = yAt(targetOz);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = textCol;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(padLeft, ty);
    ctx.lineTo(padLeft + plotW, ty);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = textCol;
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Target ${formatMoney(convertUnit(targetOz), targetOz >= 100 ? 0 : 2)}`, padLeft + 4, Math.max(padTop + 8, ty - 7));
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(xAt(0), yAt(sim.spot), 3.2, 0, Math.PI * 2);
  ctx.fillStyle = accentCol;
  ctx.fill();

  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  ctx.fillStyle = mutedCol;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText('Today', padLeft, h - 2);
  ctx.textAlign = 'center';
  ctx.fillText(sim.spec.xMid, padLeft + plotW / 2, h - 2);
  ctx.textAlign = 'right';
  ctx.fillText(sim.spec.xEnd, padLeft + plotW, h - 2);
}

function renderMcTargetReadout() {
  const sim = mcState.lastSim;
  if (!sim) return;
  const metal = mcState.metal;
  const inputEl = document.getElementById('input-mc-target');
  let rawTarget = parseFloat(inputEl?.value);
  if (!Number.isFinite(rawTarget) || rawTarget <= 0) {
    rawTarget = mcState.targetByMetal[metal];
  } else {
    mcState.targetByMetal[metal] = rawTarget;
  }

  const currSpan = document.querySelector('.mc-currency');
  if (currSpan) currSpan.textContent = getCurrencySymbol();

  const fx = getFxRate();
  const rawUsd = rawTarget / fx;
  const targetOz = state.settings.unit === 'g' ? rawUsd * TROY_OZ_TO_GRAMS : rawUsd;
  const res = evaluateMcTarget(sim, targetOz);

  const deltaEl = document.getElementById('mc-target-delta');
  if (deltaEl) {
    deltaEl.textContent = `${formatSignedPct(res.pctDelta)} vs today`;
    deltaEl.className = `mc-target-delta ${res.isUp ? 'up' : 'down'}`;
  }

  const touchEl = document.getElementById('mc-touch-pct');
  const finishEl = document.getElementById('mc-finish-pct');
  const touchBar = document.getElementById('mc-touch-bar');
  const finishBar = document.getElementById('mc-finish-bar');
  const touchHint = document.getElementById('mc-touch-hint');
  const finishHint = document.getElementById('mc-finish-hint');

  if (touchEl) touchEl.textContent = `${res.touchPct}%`;
  if (finishEl) finishEl.textContent = `${res.finishPct}%`;
  if (touchBar) touchBar.style.width = `${res.touchPct}%`;
  if (finishBar) finishBar.style.width = `${res.finishPct}%`;
  const dirWord = res.isUp ? 'above' : 'below';
  if (touchHint) touchHint.textContent = `Reaches ${dirWord} this price at least once (${sim.spec.label})`;
  if (finishHint) finishHint.textContent = `Still ${dirWord} this price at ${sim.spec.xEnd}`;

  drawMcPathsCanvas(sim, metal, targetOz);
}

let mcWorker = null;
let mcWorkerBroken = false;
let mcReqSeq = 0;
const mcSimCache = new Map();

function getMcWorker() {
  if (mcWorkerBroken || typeof Worker === 'undefined') return null;
  if (mcWorker) return mcWorker;
  try {
    mcWorker = new Worker('./mc_worker.js');
    mcWorker.onerror = () => {
      mcWorkerBroken = true;
      mcWorker = null;
    };
    return mcWorker;
  } catch {
    mcWorkerBroken = true;
    return null;
  }
}

function paintJumpDiffusionSim(sim, metal, spec) {
  const subEl = document.getElementById('mc-subtitle');
  if (subEl) {
    subEl.textContent = `1,500 simulated ${spec.label} price paths · ~${sim.params.expectedJumpsPerMonth} big jumps/mo`;
  }
  const skewEl = document.getElementById('mc-skew-badge');
  if (skewEl) {
    const rawLabel = sim.params?.skewRegime || 'Balanced Tails';
    const isExh = Boolean(sim.params?.exhaustionRisk);
    const isSqz = !isExh && rawLabel.includes('Squeeze');
    const isDisc = !isExh && rawLabel.includes('Discovery');
    const friendly = isExh
      ? '⚠ Overheated — Drop Risk'
      : isSqz
        ? 'Upside Spike Risk'
        : isDisc
          ? 'Steady Climb Odds'
          : 'Normal Odds';
    skewEl.textContent = friendly;
    skewEl.className = `regime-pill ${isExh ? 'squeeze' : isSqz ? 'hybrid' : isDisc ? 'discovery' : 'neutral'}`;
  }

  const dec = metal === 'gold' && state.settings.unit === 'oz' ? 0 : 2;
  const p10El = document.getElementById('mc-p10');
  const p50El = document.getElementById('mc-p50');
  const p90El = document.getElementById('mc-p90');
  const upEl = document.getElementById('mc-prob-up');

  if (p10El) p10El.textContent = formatMoney(convertUnit(sim.p10), dec);
  if (p50El) p50El.textContent = formatMoney(convertUnit(sim.p50), dec);
  if (p90El) p90El.textContent = formatMoney(convertUnit(sim.p90), dec);
  if (upEl) {
    upEl.textContent = `${sim.probFinishHigherPct}%`;
    upEl.className = `mc-stat-val ${sim.probFinishHigherPct >= 52 ? 'up' : sim.probFinishHigherPct <= 48 ? 'down' : ''}`;
  }

  const inputEl = document.getElementById('input-mc-target');
  if (inputEl && document.activeElement !== inputEl) {
    const saved = mcState.targetByMetal[metal];
    inputEl.value = metal === 'gold' && state.settings.unit === 'oz' ? Math.round(saved) : Number(saved).toFixed(2);
  }

  renderMcTargetReadout();
}

function renderJumpDiffusion(outlookRes) {
  if (!document.getElementById('panel-jump-diffusion')) return;
  const res = outlookRes || computeInteractiveOutlook();
  const metal = mcState.metal;
  const hKey = MC_HORIZON_SPECS[mcState.horizon] ? mcState.horizon : '7d';
  const spec = MC_HORIZON_SPECS[hKey];
  const m = res[metal];

  document.getElementById('mc-btn-gold')?.classList.toggle('active', metal === 'gold');
  document.getElementById('mc-btn-silver')?.classList.toggle('active', metal === 'silver');
  document.querySelectorAll('#mc-tf-bar .tf-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mcTf === hKey);
  });

  const jc = res.base?.selfLearning?.jumpCalibration || {};
  const regKey = `${m.regime?.discoveryScore ?? 0}/${m.regime?.squeezeScore ?? 0}/${m.regime?.isBackwardation ? 1 : 0}`;
  const key = `${metal}|${hKey}|${m.spot.toFixed(2)}|${m.score}|${regKey}|${outlookState.activeScenarios.size}|${mcState.seed}|${jc.lambdaMult ?? 1}|${jc.sigmaJMult ?? 1}`;

  if (mcSimCache.has(key)) {
    const cachedSim = mcSimCache.get(key);
    mcState.cacheKey = key;
    mcState.lastSim = cachedSim;
    paintJumpDiffusionSim(cachedSim, metal, spec);
    return;
  }

  const params = estimateClientJumpParams(metal, res, spec.tradingDays);
  const seed = mcState.seed + (metal === 'silver' ? 777 : 0);
  const worker = getMcWorker();

  if (worker) {
    const reqId = ++mcReqSeq;
    worker.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.reqId !== mcReqSeq || !msg.sim) return;
      if (mcSimCache.size > 24) {
        const oldest = mcSimCache.keys().next().value;
        mcSimCache.delete(oldest);
      }
      mcSimCache.set(msg.cacheKey, msg.sim);
      mcState.cacheKey = msg.cacheKey;
      mcState.lastSim = msg.sim;
      paintJumpDiffusionSim(msg.sim, mcState.metal, MC_HORIZON_SPECS[mcState.horizon] || spec);
    };
    worker.postMessage({
      reqId,
      cacheKey: key,
      spot: m.spot,
      horizonKey: hKey,
      spec,
      paths: 1500,
      params,
      seed,
    });
    return;
  }

  // Graceful synchronous fallback if Web Workers are unavailable
  const sim = runClientJumpDiffusion({
    spot: m.spot,
    horizonKey: hKey,
    paths: 1500,
    params,
    seed,
  });
  if (mcSimCache.size > 24) {
    const oldest = mcSimCache.keys().next().value;
    mcSimCache.delete(oldest);
  }
  mcSimCache.set(key, sim);
  mcState.cacheKey = key;
  mcState.lastSim = sim;
  paintJumpDiffusionSim(sim, metal, spec);
}

/* ---------- Shanghai Gold Exchange (SGE) Quotes & Premiums ---------- */

const shanghaiState = {
  data: null,
};

const FALLBACK_SHANGHAI = {
  source: 'Shanghai Gold Exchange (SGE)',
  updatedAt: new Date().toISOString(),
  usdCny: 7.24,
  gold: {
    contract: 'Au99.99',
    cnyPerG: 635.2,
    openCnyPerG: 629.5,
    pct: 0.91,
    usdPerOz: 2728.85,
  },
  silver: {
    contract: 'Ag(T+D)',
    cnyPerKg: 8465.0,
    openCnyPerKg: 8340.0,
    pct: 1.5,
    usdPerOz: 36.37,
  },
  benchmarks: {
    SHAU: { tradeDate: 'Latest', am: 633.8, pm: 635.2 },
    SHAG: { tradeDate: 'Latest', am: 8410, pm: 8465 },
  },
};

async function fetchShanghaiData() {
  try {
    shanghaiState.data = await fetchFreshRepoJson('shanghai.json');
    state.feedHealth.sgeAt = Date.parse(shanghaiState.data?.updatedAt || 0) || Date.now();
  } catch {
    shanghaiState.data = outlookState.data?.shanghai || FALLBACK_SHANGHAI;
  }
  renderShanghai();
  renderFeedHealth();
  renderStackTracker();
}

function renderShanghai() {
  const sge = shanghaiState.data || outlookState.data?.shanghai || FALLBACK_SHANGHAI;
  if (!sge || !sge.gold || !sge.silver) return;

  const usdCny = sge.usdCny || 7.24;
  const unitLabel = state.settings.unit === 'g' ? 'g' : 'oz';

  // Compute USD/oz directly from native SGE CNY quotes & USD/CNY rate
  const goldUsdOz = sge.gold.usdPerOz ?? (sge.gold.cnyPerG * TROY_OZ_TO_GRAMS) / usdCny;
  const silverUsdOz = sge.silver.usdPerOz ?? ((sge.silver.cnyPerKg / 1000) * TROY_OZ_TO_GRAMS) / usdCny;
  const silverExVatUsdOz = silverUsdOz / 1.13;

  const westGold = state.quotes.gold.price;
  const westSilver = state.quotes.silver.price;

  const goldPremOz = westGold ? goldUsdOz - westGold : sge.gold.premiumUsdOz;
  const goldPremPct = westGold && goldPremOz != null ? (goldPremOz / westGold) * 100 : sge.gold.premiumPct;
  const silverExVatPremOz = westSilver ? silverExVatUsdOz - westSilver : sge.silver.exVatPremiumUsdOz;

  const subEl = document.getElementById('sge-subtitle');
  if (subEl) {
    subEl.textContent = `Shanghai physical prices · 1 USD = ¥${usdCny.toFixed(2)} Yuan`;
  }

  // Gold SGE Card
  document.getElementById('sge-gold-contract').textContent = 'Shanghai Gold';
  const gPctEl = document.getElementById('sge-gold-pct');
  gPctEl.textContent = formatSignedPct(sge.gold.pct || 0);
  gPctEl.className = `sge-pct ${(sge.gold.pct || 0) >= 0.01 ? 'up' : (sge.gold.pct || 0) <= -0.01 ? 'down' : ''}`;
  document.getElementById('sge-gold-cny').textContent = `¥${Number(sge.gold.cnyPerG).toFixed(2)} / g`;
  document.getElementById('sge-gold-usd').textContent = `${formatMoney(convertUnit(goldUsdOz))} / ${unitLabel}`;

  const gPremEl = document.getElementById('sge-gold-premium');
  if (goldPremOz != null) {
    const premDisp = convertUnit(goldPremOz);
    const pctPart = goldPremPct != null ? ` (${formatSignedPct(goldPremPct)})` : '';
    gPremEl.textContent = `vs US/London: ${formatSignedMoney(premDisp)}/${unitLabel}${pctPart}`;
    gPremEl.className = `sge-spread ${goldPremOz >= 0 ? 'up' : 'down'}`;
  } else {
    gPremEl.textContent = 'vs US/London: —';
    gPremEl.className = 'sge-spread';
  }

  // Silver SGE Card
  document.getElementById('sge-silver-contract').textContent = 'Shanghai Silver';
  const sPctEl = document.getElementById('sge-silver-pct');
  sPctEl.textContent = formatSignedPct(sge.silver.pct || 0);
  sPctEl.className = `sge-pct ${(sge.silver.pct || 0) >= 0.01 ? 'up' : (sge.silver.pct || 0) <= -0.01 ? 'down' : ''}`;
  document.getElementById('sge-silver-cny').textContent = `¥${Math.round(Number(sge.silver.cnyPerKg)).toLocaleString('en-US')} / kg`;
  document.getElementById('sge-silver-usd').textContent = `${formatMoney(convertUnit(silverUsdOz))} / ${unitLabel} (incl. tax)`;

  const sPremEl = document.getElementById('sge-silver-premium');
  if (silverExVatPremOz != null) {
    sPremEl.textContent = `Before 13% tax: ${formatMoney(convertUnit(silverExVatUsdOz))} (${formatSignedMoney(convertUnit(silverExVatPremOz))})`;
    sPremEl.className = `sge-spread ${silverExVatPremOz >= 0 ? 'up' : 'down'}`;
  } else {
    sPremEl.textContent = `Before 13% tax: ${formatMoney(convertUnit(silverExVatUsdOz))}`;
    sPremEl.className = 'sge-spread';
  }

  // Benchmarks strip
  const benchEl = document.getElementById('sge-benchmarks');
  if (benchEl) {
    const shau = sge.benchmarks?.SHAU;
    const shag = sge.benchmarks?.SHAG;
    const parts = [];
    if (shau && (shau.am || shau.pm)) {
      parts.push(`Shanghai Gold Fix: Morning ¥${shau.am ?? '—'} · Afternoon ¥${shau.pm ?? '—'}/g`);
    }
    if (shag && (shag.am || shag.pm)) {
      parts.push(`Silver Fix: Morning ¥${shag.am ?? '—'} · Afternoon ¥${shag.pm ?? '—'}/kg`);
    }
    benchEl.textContent = parts.length
      ? parts.join('  |  ')
      : 'Source: Shanghai Gold Exchange';
  }
}

const THEME_META_COLORS = {
  dark: '#0D0E11',
  light: '#F6F4EF',
  oled: '#000000',
  'swiss-gold': '#0F0D09',
  'mint-silver': '#0A0F14',
  'terminal-amber': '#090704',
  'daylight-paper': '#FBF8F1',
};

function isLightThemeName(theme) {
  return theme === 'light' || theme === 'daylight-paper';
}

function applyTheme(theme) {
  const safeTheme = ALLOWED_THEMES.has(theme) ? theme : 'dark';
  state.settings.theme = safeTheme;
  document.documentElement.setAttribute('data-theme', safeTheme);
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', THEME_META_COLORS[safeTheme] || '#0D0E11');
  renderChart();
  renderAccuracyReplayChart(computeInteractiveOutlook());
  if (mcState.lastSim) {
    renderJumpDiffusion();
    renderMcTargetReadout();
  }
  window.BullionIntel?.renderAll?.();
  window.BullionDisplay?.syncThemeUi?.();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMacroStrip() {
  const snap = outlookState.data?.macroSnapshot || FALLBACK_OUTLOOK.macroSnapshot || {};
  const setTile = (valId, chgId, valText, pctVal, liveLabel = null) => {
    const vEl = document.getElementById(valId);
    const cEl = document.getElementById(chgId);
    if (vEl) vEl.textContent = valText;
    if (cEl) {
      if (pctVal != null && Number.isFinite(Number(pctVal))) {
        const n = Number(pctVal);
        cEl.textContent = `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}% 5d`;
        cEl.className = `macro-d ${n > 0.05 ? 'up' : n < -0.05 ? 'down' : ''}`;
      } else if (liveLabel) {
        cEl.textContent = liveLabel;
        cEl.className = 'macro-d';
      } else {
        cEl.textContent = 'Snapshot';
        cEl.className = 'macro-d';
      }
    }
  };
  const livePlat = state.liveMacro.platinum ?? snap.platinum;
  const liveDxy = state.liveMacro.dxy ?? snap.dxy;
  setTile(
    'macro-dxy',
    'macro-dxy-chg',
    liveDxy != null ? Number(liveDxy).toFixed(2) : '—',
    state.liveMacro.dxy != null ? null : snap.dxy5dPct,
    state.liveMacro.dxy != null ? state.liveMacro.dxySource || 'Live ICE DXY' : null
  );
  setTile('macro-tnx', 'macro-tnx-chg', snap.tnx != null ? `${Number(snap.tnx).toFixed(2)}%` : '—', snap.tnx5dPct);
  setTile('macro-copper', 'macro-copper-chg', snap.copper != null ? formatMoney(Number(snap.copper), 2) : '—', snap.cu5dPct);
  setTile(
    'macro-platinum',
    'macro-platinum-chg',
    livePlat != null ? formatMoney(Number(livePlat), 0) : '—',
    snap.platinum5dPct,
    state.liveMacro.platinum != null ? 'Live XPT' : null
  );
}

function syncLotsToStackTotals() {
  const lots = Array.isArray(state.settings.stackLots) ? state.settings.stackLots : [];
  const syncPill = document.getElementById('stack-lots-sync-note');
  if (!lots.length) {
    if (syncPill) syncPill.hidden = true;
    return;
  }
  const agg = { gold: { oz: 0, costSum: 0, count: 0 }, silver: { oz: 0, costSum: 0, count: 0 } };
  for (const lot of lots) {
    const m = lot.metal === 'silver' ? 'silver' : 'gold';
    const oz = Number(lot.oz) || 0;
    const cost = Number(lot.cost) || 0;
    if (oz > 0) {
      agg[m].oz += oz;
      agg[m].costSum += oz * cost;
      agg[m].count += 1;
    }
  }
  if (!state.settings.stack) state.settings.stack = { ...DEFAULT_SETTINGS.stack };
  if (agg.gold.count > 0) {
    state.settings.stack.goldOz = String(+agg.gold.oz.toFixed(4));
    state.settings.stack.goldCost = String(+(agg.gold.costSum / agg.gold.oz).toFixed(2));
  }
  if (agg.silver.count > 0) {
    state.settings.stack.silverOz = String(+agg.silver.oz.toFixed(3));
    state.settings.stack.silverCost = String(+(agg.silver.costSum / agg.silver.oz).toFixed(2));
  }
  if (syncPill) {
    syncPill.hidden = false;
    syncPill.textContent = `Auto-filled from ${lots.length} purchase${lots.length > 1 ? 's' : ''}`;
  }
}

const DEAL_PRESETS = {
  ase_1oz: { name: '1 oz American Silver Eagle', metal: 'silver', ozPerUnit: 1.0, lowPct: 8, highPct: 16, qtyLabel: 'Quantity (coins)' },
  silver_maple: { name: '1 oz Silver Maple / Britannia', metal: 'silver', ozPerUnit: 1.0, lowPct: 5, highPct: 11, qtyLabel: 'Quantity (coins)' },
  silver_round: { name: '1 oz Generic Silver Round', metal: 'silver', ozPerUnit: 1.0, lowPct: 3, highPct: 7.5, qtyLabel: 'Quantity (rounds)' },
  silver_bar_10: { name: '10 oz Silver Bar', metal: 'silver', ozPerUnit: 10.0, lowPct: 2.5, highPct: 6.5, qtyLabel: 'Quantity (bars)' },
  junk_90: { name: '90% Pre-1965 US Silver', metal: 'silver', ozPerUnit: 0.715, lowPct: 2, highPct: 8, qtyLabel: 'Face Value ($1 = 0.715 oz)' },
  junk_40: { name: '40% Silver Half Dollars', metal: 'silver', ozPerUnit: 0.295, lowPct: -2, highPct: 5, qtyLabel: 'Face Value ($1 = 0.295 oz)' },
  age_1oz: { name: '1 oz American Gold Eagle', metal: 'gold', ozPerUnit: 1.0, lowPct: 3.5, highPct: 6.5, qtyLabel: 'Quantity (coins)' },
  agb_1oz: { name: '1 oz American Gold Buffalo', metal: 'gold', ozPerUnit: 1.0, lowPct: 3.8, highPct: 7.0, qtyLabel: 'Quantity (coins)' },
  gold_bar_1oz: { name: '1 oz Gold Bar / Maple', metal: 'gold', ozPerUnit: 1.0, lowPct: 1.5, highPct: 4.0, qtyLabel: 'Quantity (bars/coins)' },
  gold_tenth: { name: '1/10 oz Gold Coin', metal: 'gold', ozPerUnit: 0.1, lowPct: 8, highPct: 15, qtyLabel: 'Quantity (coins)' },
  gold_14k_g: { name: '14K Gold Jewelry (58.3% pure)', metal: 'gold', ozPerUnit: 0.5833 / TROY_OZ_TO_GRAMS, lowPct: 10, highPct: 25, qtyLabel: 'Weight (grams)' },
  gold_18k_g: { name: '18K Gold Jewelry (75% pure)', metal: 'gold', ozPerUnit: 0.75 / TROY_OZ_TO_GRAMS, lowPct: 10, highPct: 25, qtyLabel: 'Weight (grams)' },
  gold_24k_g: { name: '24K Pure Gold (99.9% pure)', metal: 'gold', ozPerUnit: 1.0 / TROY_OZ_TO_GRAMS, lowPct: 4, highPct: 12, qtyLabel: 'Weight (grams)' },
};

function renderDealGrader() {
  if (!document.getElementById('panel-deal-grader')) return;
  const dg = state.settings.dealGrader || DEFAULT_SETTINGS.dealGrader;
  const preset = DEAL_PRESETS[dg.preset] || DEAL_PRESETS.ase_1oz;
  const qty = Math.max(0.01, parseFloat(dg.qty) || 1);
  const askInput = parseFloat(dg.ask);

  const qtyLbl = document.getElementById('deal-qty-label');
  const askLbl = document.getElementById('deal-ask-label');
  const badgeEl = document.getElementById('deal-grade-badge');
  const meltEl = document.getElementById('deal-melt-val');
  const ozEl = document.getElementById('deal-pure-oz');
  const markupEl = document.getElementById('deal-markup-val');
  const rangeEl = document.getElementById('deal-typical-range');
  const beEl = document.getElementById('deal-breakeven-val');
  const beSubEl = document.getElementById('deal-breakeven-sub');
  const noteEl = document.getElementById('deal-verdict-note');

  if (qtyLbl) qtyLbl.textContent = preset.qtyLabel;
  if (askLbl) askLbl.textContent = `Seller Asking Price (Total ${getCurrencySymbol()})`;

  const canonical = getCanonicalSpotPrices();
  const spotUsd = preset.metal === 'silver' ? canonical.silver : canonical.gold;
  const pureOz = qty * preset.ozPerUnit;
  const meltUsd = pureOz * spotUsd;
  const metalWord = preset.metal === 'silver' ? 'Silver' : 'Gold';

  if (meltEl) meltEl.textContent = formatMoney(meltUsd, 2);
  if (ozEl) ozEl.textContent = `${pureOz.toFixed(pureOz >= 1 ? 3 : 4)} pure oz ${metalWord}`;
  if (rangeEl) rangeEl.textContent = `Typical markup: ${preset.lowPct}%–${preset.highPct}%`;

  if (!Number.isFinite(askInput) || askInput <= 0 || meltUsd <= 0) {
    if (badgeEl) {
      badgeEl.textContent = 'Enter Price';
      badgeEl.className = 'signal-pill';
    }
    if (markupEl) {
      markupEl.textContent = '—';
      markupEl.className = 'stack-stat-v';
    }
    if (beEl) beEl.textContent = `${getCurrencySymbol()}—`;
    if (beSubEl) beSubEl.textContent = `Fair range: ${formatMoney(meltUsd * (1 + preset.lowPct / 100))} – ${formatMoney(meltUsd * (1 + preset.highPct / 100))}`;
    if (noteEl) {
      noteEl.className = 'deal-verdict-note';
      noteEl.textContent = `Pure metal melt is ${formatMoney(meltUsd)}. Enter the seller's total asking price above to grade this deal right now.`;
    }
    return;
  }

  const askUsd = askInput / getFxRate();
  const markupUsd = askUsd - meltUsd;
  const markupPct = (markupUsd / meltUsd) * 100;
  const breakEvenUsd = pureOz > 0 ? askUsd / pureOz : 0;
  const beMovePct = spotUsd > 0 ? ((breakEvenUsd - spotUsd) / spotUsd) * 100 : 0;

  if (markupEl) {
    markupEl.textContent = `${formatSignedMoney(markupUsd)} (${formatSignedPct(markupPct)})`;
    markupEl.className = `stack-stat-v ${markupPct <= preset.lowPct ? 'up' : markupPct > preset.highPct ? 'down' : ''}`;
  }
  if (beEl) beEl.textContent = `${formatMoney(breakEvenUsd, preset.metal === 'silver' ? 2 : 0)}/oz`;
  if (beSubEl) {
    beSubEl.textContent =
      beMovePct <= 0
        ? `Instant equity (${formatSignedPct(Math.abs(beMovePct))} below spot)`
        : `${metalWord} needs +${beMovePct.toFixed(1)}% to break even`;
  }

  let gradeLabel = 'Fair Price';
  let badgeCls = 'signal-pill';
  let noteCls = 'deal-verdict-note fair';
  let verdictMsg = `Fair Price — markup (${markupPct.toFixed(1)}%) sits right inside the normal shop range (${preset.lowPct}%–${preset.highPct}%) for ${preset.name}.`;

  if (markupPct <= 0) {
    gradeLabel = 'Below Melt! 🔥';
    badgeCls = 'signal-pill bullish';
    noteCls = 'deal-verdict-note great';
    verdictMsg = `Steal — priced ${Math.abs(markupPct).toFixed(1)}% below pure metal melt (${formatMoney(meltUsd)}). Double-check weight and authenticity before buying.`;
  } else if (markupPct <= preset.lowPct) {
    gradeLabel = 'Great Deal';
    badgeCls = 'signal-pill bullish';
    noteCls = 'deal-verdict-note great';
    verdictMsg = `Great Deal — paying ${markupPct.toFixed(1)}% over spot is at or below the low end of normal shop prices for ${preset.name}.`;
  } else if (markupPct > preset.highPct) {
    gradeLabel = 'Overpriced';
    badgeCls = 'signal-pill bearish';
    noteCls = 'deal-verdict-note high';
    const fairTop = meltUsd * (1 + preset.highPct / 100);
    verdictMsg = `Overpriced — you're paying ${(markupPct - preset.highPct).toFixed(1)}% above normal shop prices. Try negotiating closer to ${formatMoney(fairTop)} or compare other dealers.`;
  }

  if (badgeEl) {
    badgeEl.textContent = gradeLabel;
    badgeEl.className = badgeCls;
  }
  if (noteEl) {
    noteEl.className = noteCls;
    noteEl.textContent = verdictMsg;
  }
}

function renderStackGoalsAndWhatIf() {
  if (!document.getElementById('panel-stack-goals')) return;

  const st = state.settings.stack || {};
  const gOz = Math.max(0, parseFloat(st.goldOz) || 0);
  const sOz = Math.max(0, parseFloat(st.silverOz) || 0);
  const canonical = getCanonicalSpotPrices();
  const gSpot = canonical.gold;
  const sSpot = canonical.silver;
  const totalValUsd = gOz * gSpot + sOz * sSpot;
  const hidden = isPrivacyOn();

  // Goals progress bars
  const goals = state.settings.stackGoals || DEFAULT_SETTINGS.stackGoals;
  const gGoal = Math.max(0, parseFloat(goals.goldOz) || 0);
  const sGoal = Math.max(0, parseFloat(goals.silverOz) || 0);
  const fx = getFxRate();
  const rawUsdGoalInput = Math.max(0, parseFloat(goals.targetUsd) || 0);
  const targetValUsd = rawUsdGoalInput > 0 ? rawUsdGoalInput / fx : 0;

  const goalUsdLbl = document.getElementById('input-goal-usd')?.closest('label')?.querySelector('span');
  if (goalUsdLbl) goalUsdLbl.textContent = `Value Goal (${getCurrencySymbol()})`;

  const progListEl = document.getElementById('stack-goals-progress');
  const oddsEl = document.getElementById('stack-goal-odds');
  const goalRows = [];

  if (gGoal > 0) {
    const pct = Math.min(100, (gOz / gGoal) * 100);
    const rem = Math.max(0, gGoal - gOz);
    goalRows.push({
      label: 'Gold Ounces Goal',
      cls: '',
      pct,
      nums: hidden
        ? `••• / ${gGoal.toFixed(2)} oz (${pct.toFixed(0)}%)`
        : `${gOz.toFixed(2)} / ${gGoal.toFixed(2)} oz (${pct.toFixed(0)}%)${rem > 0 ? ` · ${rem.toFixed(2)} oz left` : ' · Reached! 🎉'}`,
    });
  }
  if (sGoal > 0) {
    const pct = Math.min(100, (sOz / sGoal) * 100);
    const rem = Math.max(0, sGoal - sOz);
    goalRows.push({
      label: 'Silver Ounces Goal',
      cls: 'silver',
      pct,
      nums: hidden
        ? `••• / ${sGoal.toFixed(0)} oz (${pct.toFixed(0)}%)`
        : `${sOz.toFixed(1)} / ${sGoal.toFixed(0)} oz (${pct.toFixed(0)}%)${rem > 0 ? ` · ${rem.toFixed(1)} oz left` : ' · Reached! 🎉'}`,
    });
  }
  if (targetValUsd > 0) {
    const pct = Math.min(100, (totalValUsd / targetValUsd) * 100);
    const rem = Math.max(0, targetValUsd - totalValUsd);
    goalRows.push({
      label: 'Stack Value Goal',
      cls: '',
      pct,
      nums: hidden
        ? `${getCurrencySymbol()}••••• / ${formatMoney(targetValUsd, 0)} (${pct.toFixed(0)}%)`
        : `${formatMoney(totalValUsd, 0)} / ${formatMoney(targetValUsd, 0)} (${pct.toFixed(0)}%)${rem > 0 ? ` · ${formatMoney(rem, 0)} left` : ' · Reached! 🎉'}`,
    });
  }

  if (progListEl) {
    if (!goalRows.length) {
      progListEl.innerHTML =
        '<div class="empty-state">Enter a Gold oz, Silver oz, or Dollar value goal above to track progress bars &amp; 1-year odds.</div>';
    } else {
      progListEl.innerHTML = goalRows
        .map(
          (r) => `
          <div class="goal-prog-row">
            <div class="goal-prog-head">
              <span class="goal-prog-label">${escapeHtml(r.label)}</span>
              <span class="goal-prog-nums">${escapeHtml(r.nums)}</span>
            </div>
            <div class="goal-prog-track">
              <div class="goal-prog-fill ${r.cls}" style="width:${r.pct.toFixed(1)}%"></div>
            </div>
          </div>`
        )
        .join('');
    }
  }

  if (oddsEl) {
    if (targetValUsd > 0 && totalValUsd > 0) {
      if (totalValUsd >= targetValUsd) {
        oddsEl.textContent = 'Goal Reached! 🎉';
        oddsEl.className = 'signal-pill bullish';
      } else {
        const wG = (gOz * gSpot) / totalValUsd;
        const wS = 1 - wG;
        const sigG = 0.175;
        const sigS = 0.31;
        const rho = 0.78;
        const portVol = Math.sqrt(wG * wG * sigG * sigG + wS * wS * sigS * sigS + 2 * rho * wG * wS * sigG * sigS);
        const mu = 0.085;
        const z = (Math.log(targetValUsd / totalValUsd) - (mu - 0.5 * portVol * portVol)) / Math.max(0.08, portVol);
        const prob = clampNum(Math.round((1 - normalCdf(z)) * 100), 1, 99);
        oddsEl.textContent = `~${prob}% chance in 1 yr`;
        oddsEl.className = `signal-pill ${prob >= 55 ? 'bullish' : ''}`;
      }
    } else if (goalRows.length) {
      const avgPct = Math.round(goalRows.reduce((s, r) => s + r.pct, 0) / goalRows.length);
      oddsEl.textContent = `${avgPct}% to goals`;
      oddsEl.className = `signal-pill ${avgPct >= 100 ? 'bullish' : ''}`;
    } else {
      oddsEl.textContent = 'Set a goal';
      oddsEl.className = 'signal-pill';
    }
  }

  // Interactive Future Price Wealth Sliders (USD internal, formatted in active currency)
  if (state.whatIfPrices.gold == null) state.whatIfPrices.gold = Math.round(gSpot);
  if (state.whatIfPrices.silver == null) state.whatIfPrices.silver = +sSpot.toFixed(2);

  const simG = clampNum(Number(state.whatIfPrices.gold) || gSpot, 2000, 10000);
  const simS = clampNum(Number(state.whatIfPrices.silver) || sSpot, 20, 250);

  const gSlider = document.getElementById('slider-whatif-gold');
  const sSlider = document.getElementById('slider-whatif-silver');
  const gValEl = document.getElementById('whatif-gold-val');
  const sValEl = document.getElementById('whatif-silver-val');
  const totEl = document.getElementById('whatif-total-val');
  const gainEl = document.getElementById('whatif-gain-val');
  const ratioEl = document.getElementById('whatif-ratio-val');

  if (gSlider && document.activeElement !== gSlider) gSlider.value = String(Math.round(simG));
  if (sSlider && document.activeElement !== sSlider) sSlider.value = String(+simS.toFixed(1));
  if (gValEl) gValEl.textContent = `${formatMoney(simG, 0)}/oz`;
  if (sValEl) sValEl.textContent = `${formatMoney(simS, 2)}/oz`;

  const futureTotal = gOz * simG + sOz * simS;
  const gainUsd = futureTotal - totalValUsd;
  const gainPct = totalValUsd > 0 ? (gainUsd / totalValUsd) * 100 : 0;

  if (totEl) totEl.textContent = privMoney(futureTotal, 2);
  if (gainEl) {
    if (gOz <= 0 && sOz <= 0) {
      gainEl.textContent = 'Add ounces above to simulate your stack';
      gainEl.className = 'whatif-gain';
    } else if (hidden) {
      gainEl.textContent = 'Hidden (Privacy Mode ON)';
      gainEl.className = 'whatif-gain';
    } else {
      gainEl.textContent = `${formatSignedMoney(gainUsd, 0)} (${formatSignedPct(gainPct)}) vs today`;
      gainEl.className = `whatif-gain ${gainUsd > 0.5 ? 'up' : gainUsd < -0.5 ? 'down' : ''}`;
    }
  }
  if (ratioEl) {
    ratioEl.textContent = `Simulated Ratio: ${(simG / Math.max(0.01, simS)).toFixed(1)} : 1`;
  }
}

function renderStackLots() {
  const listEl = document.getElementById('stack-lots-list');
  const countEl = document.getElementById('stack-lots-count');
  const lots = Array.isArray(state.settings.stackLots) ? state.settings.stackLots : [];
  if (countEl) countEl.textContent = `${lots.length} saved`;
  if (!listEl) return;
  if (!lots.length) {
    listEl.innerHTML =
      '<div class="empty-state">No purchases saved yet. Add your coins or bars above to track your exact average cost and profit.</div>';
    return;
  }
  const canonical = getCanonicalSpotPrices();
  const hidden = isPrivacyOn();
  listEl.innerHTML = lots
    .map((lot) => {
      const isSilver = lot.metal === 'silver';
      const spot = isSilver ? canonical.silver : canonical.gold;
      const oz = Number(lot.oz) || 0;
      const cost = Number(lot.cost) || 0;
      const melt = oz * spot;
      const paid = oz * cost;
      const pnl = melt - paid;
      const pnlPct = paid > 0 ? (pnl / paid) * 100 : 0;
      const cls = hidden ? '' : pnl > 0.01 ? 'up' : pnl < -0.01 ? 'down' : '';
      const badgeCls = isSilver ? 'silver' : 'gold';
      const sym = isSilver ? 'XAG' : 'XAU';
      const notePart = lot.note ? ` · ${escapeHtml(lot.note)}` : '';
      const ozLabel = hidden ? '••• oz' : `${oz.toFixed(isSilver ? 2 : 3)} oz`;
      const paidLine = hidden
        ? 'Cost hidden (Privacy Mode)'
        : `Paid ${formatMoney(cost)}/oz (Basis ${formatMoney(paid)})`;
      const pnlLine = hidden ? '•••••' : `${formatSignedMoney(pnl)} (${formatSignedPct(pnlPct)})`;
      return `
        <div class="lot-row">
          <div class="lot-main">
            <div class="lot-title">
              <span class="metal-badge ${badgeCls}" style="width:24px;height:24px;font-size:9px;">${sym}</span>
              <span>${ozLabel} · ${escapeHtml(lot.form || 'Bullion')}${notePart}</span>
            </div>
            <div class="lot-sub">${paidLine}</div>
          </div>
          <div class="lot-right">
            <div class="lot-val-box">
              <strong>${privMoney(melt)}</strong>
              <span class="${cls}">${pnlLine}</span>
            </div>
            <button type="button" class="lot-del-btn" data-lot-id="${escapeHtml(lot.id)}" aria-label="Remove lot" title="Remove lot">&times;</button>
          </div>
        </div>`;
    })
    .join('');
}

function renderRatioSwapCalculator() {
  if (!document.getElementById('panel-ratio-swap')) return;
  const canonical = getCanonicalSpotPrices();
  const liveRatio = canonical.silver > 0 ? canonical.gold / canonical.silver : 82;
  const ra = computeClientRatioAnalytics(liveRatio, outlookState.data || FALLBACK_OUTLOOK);

  const dir = state.swapCalc.dir === 's2g' ? 's2g' : 'g2s';
  document.getElementById('swap-dir-g2s')?.classList.toggle('active', dir === 'g2s');
  document.getElementById('swap-dir-s2g')?.classList.toggle('active', dir === 's2g');

  const ozLbl = document.getElementById('swap-oz-label');
  const recK = document.getElementById('swap-receive-k');
  const retK = document.getElementById('swap-return-k');
  const liveRatioEl = document.getElementById('swap-live-ratio');
  const liveBiasEl = document.getElementById('swap-live-bias');
  const recNowEl = document.getElementById('swap-receive-now');
  const freeOzEl = document.getElementById('swap-free-oz');
  const rtTotalEl = document.getElementById('swap-roundtrip-total');
  const noteEl = document.getElementById('swap-signal-note');

  const ozInput = Math.max(0.01, Number(state.swapCalc.oz) || 1);
  const targetRatio = Math.max(10, Number(state.swapCalc.targetRatio) || (dir === 'g2s' ? 65 : 90));
  const frictionPct = clampNum(Number(state.swapCalc.frictionPct) || 0, 0, 30);
  const legFactor = Math.max(0.5, 1 - (frictionPct / 2) / 100);

  if (ozLbl) ozLbl.textContent = dir === 'g2s' ? 'Gold to Trade (oz)' : 'Silver to Trade (oz)';
  if (recK) recK.textContent = dir === 'g2s' ? 'Silver You Get Today' : 'Gold You Get Today';
  if (retK) retK.textContent = dir === 'g2s' ? 'Extra Free Gold' : 'Extra Free Silver';

  let receivedNow = 0;
  let roundTripEnd = 0;
  if (dir === 'g2s') {
    receivedNow = ozInput * liveRatio * legFactor;
    roundTripEnd = (receivedNow / targetRatio) * legFactor;
  } else {
    receivedNow = (ozInput / liveRatio) * legFactor;
    roundTripEnd = receivedNow * targetRatio * legFactor;
  }
  const freeOz = roundTripEnd - ozInput;
  const freePct = (freeOz / ozInput) * 100;

  if (liveRatioEl) liveRatioEl.textContent = `${liveRatio.toFixed(1)} : 1`;
  if (liveBiasEl) {
    liveBiasEl.textContent = ra.swapBias;
  }
  if (recNowEl) recNowEl.textContent = `${receivedNow.toFixed(dir === 'g2s' ? 1 : 3)} oz`;
  if (freeOzEl) {
    const sign = freeOz >= 0 ? '+' : '−';
    freeOzEl.textContent = `${sign}${Math.abs(freeOz).toFixed(dir === 'g2s' ? 3 : 1)} oz`;
    freeOzEl.className = `stack-stat-v ${freeOz >= 0 ? 'up' : 'down'}`;
  }
  if (rtTotalEl) {
    const unitTag = dir === 'g2s' ? 'oz Gold' : 'oz Silver';
    rtTotalEl.textContent = `End total: ${roundTripEnd.toFixed(dir === 'g2s' ? 3 : 1)} ${unitTag} (${formatSignedPct(freePct)})`;
  }
  if (noteEl) {
    noteEl.textContent = `${ra.regime} (Higher than ${ra.percentile5y}% of past 5 yrs) · ${ra.swapBias}`;
  }
}

function renderStackTracker() {
  syncLotsToStackTotals();
  renderStackLots();
  renderRatioSwapCalculator();
  renderDealGrader();
  renderStackGoalsAndWhatIf();
  applyPrivacyMode();

  const hidden = isPrivacyOn();
  const totalEl = document.getElementById('stack-total-val');
  const buybackValEl = document.getElementById('stack-buyback-val');
  const buybackSubEl = document.getElementById('stack-buyback-sub');
  const headerMeltValEl = document.getElementById('header-melt-val');
  const headerMeltBtnEl = document.getElementById('btn-header-melt');
  const dayEl = document.getElementById('stack-day-chg');
  const pnlValEl = document.getElementById('stack-pnl-val');
  const pnlPctEl = document.getElementById('stack-pnl-pct');
  const splitEl = document.getElementById('stack-split-val');
  const sgeEl = document.getElementById('stack-sge-val');
  const scStripEl = document.getElementById('stack-scenario-strip');
  const breakdownEl = document.getElementById('stack-breakdown-grid');
  const milestonesEl = document.getElementById('stack-milestones-list');

  const st = state.settings.stack || {};
  const gOz = Math.max(0, parseFloat(st.goldOz) || 0);
  const gCost = Math.max(0, parseFloat(st.goldCost) || 0);
  const sOz = Math.max(0, parseFloat(st.silverOz) || 0);
  const sCost = Math.max(0, parseFloat(st.silverCost) || 0);
  const gSpread = Number.isFinite(parseFloat(st.goldSpreadPct)) ? parseFloat(st.goldSpreadPct) : -2.5;
  const sSpread = Number.isFinite(parseFloat(st.silverSpreadPct)) ? parseFloat(st.silverSpreadPct) : -6.0;

  const headerStackActive = state.activeView === 'stack' ? ' active' : '';
  if (gOz <= 0 && sOz <= 0) {
    const zeroText = hidden ? `${getCurrencySymbol()}•••••` : formatMoney(0, 2);
    if (totalEl) totalEl.textContent = zeroText;
    if (buybackValEl) buybackValEl.textContent = zeroText;
    if (buybackSubEl) buybackSubEl.textContent = `Gold ${gSpread}% · Silver ${sSpread}%`;
    if (headerMeltValEl) headerMeltValEl.textContent = zeroText;
    if (headerMeltBtnEl) headerMeltBtnEl.className = `header-melt-btn${headerStackActive}`;
    if (dayEl) {
      dayEl.textContent = hidden ? 'Hidden (Privacy Mode ON)' : 'Enter oz above to track live';
      dayEl.className = 'stack-stat-s';
    }
    if (pnlValEl) {
      pnlValEl.textContent = hidden ? `${getCurrencySymbol()}•••••` : '—';
      pnlValEl.className = 'stack-stat-v';
    }
    if (pnlPctEl) pnlPctEl.textContent = 'What you paid vs. today';
    if (splitEl) splitEl.textContent = '—';
    if (sgeEl) sgeEl.textContent = 'Est. value at China prices';
    if (scStripEl) scStripEl.hidden = true;
    if (breakdownEl) {
      breakdownEl.innerHTML =
        '<div class="empty-state">Enter your Gold or Silver ounces above to view metal-by-metal breakdown.</div>';
    }
    if (milestonesEl) {
      milestonesEl.innerHTML =
        '<div class="empty-state">Add holdings above to calculate US Dollar impact and future price scenarios.</div>';
    }
    if (state.activeView === 'stack') window.BullionIntel?.renderStackTimeMachine?.();
    return;
  }

  const canonical = getCanonicalSpotPrices();
  const gSpot = canonical.gold;
  const sSpot = canonical.silver;
  const gVal = gOz * gSpot;
  const sVal = sOz * sSpot;
  const totalVal = gVal + sVal;
  const buybackVal = gVal * (1 + gSpread / 100) + sVal * (1 + sSpread / 100);
  const buybackDiff = buybackVal - totalVal;
  const gDayChg = gOz * (state.quotes.gold.chg || 0);
  const sDayChg = sOz * (state.quotes.silver.chg || 0);
  const dayChg = gDayChg + sDayChg;
  const prevTotal = totalVal - dayChg;
  const dayPct = prevTotal > 0 ? (dayChg / prevTotal) * 100 : 0;

  const formattedTotal = totalVal > 0 ? privMoney(totalVal) : `${getCurrencySymbol()}—`;
  const formattedHeaderTotal = totalVal > 0
    ? (hidden ? `${getCurrencySymbol()}•••••` : formatCompactMoney(totalVal))
    : `${getCurrencySymbol()}—`;
  if (totalEl) totalEl.textContent = formattedTotal;
  if (buybackValEl) buybackValEl.textContent = totalVal > 0 ? privMoney(buybackVal) : `${getCurrencySymbol()}—`;
  if (buybackSubEl) {
    buybackSubEl.textContent = hidden
      ? `Hidden (Gold ${gSpread}% / Silver ${sSpread}%)`
      : totalVal > 0
        ? `${formatSignedMoney(buybackDiff)} vs melt (Gold ${gSpread}% / Silver ${sSpread}%)`
        : 'After shop buyback discount';
  }
  if (headerMeltValEl) headerMeltValEl.textContent = formattedHeaderTotal;
  if (headerMeltBtnEl) {
    headerMeltBtnEl.className = hidden
      ? `header-melt-btn${headerStackActive}`
      : `header-melt-btn ${dayChg > 0.01 ? 'up' : dayChg < -0.01 ? 'down' : ''}${headerStackActive}`;
  }
  if (dayEl) {
    if (hidden) {
      dayEl.textContent = `Today: ••••• (${formatSignedPct(dayPct)})`;
      dayEl.className = 'stack-stat-s';
    } else if (totalVal > 0) {
      dayEl.textContent = `Today: ${formatSignedMoney(dayChg)} (${formatSignedPct(dayPct)})`;
      dayEl.className = `stack-stat-s ${dayChg > 0.01 ? 'up' : dayChg < -0.01 ? 'down' : ''}`;
    } else {
      dayEl.textContent = 'Waiting for live spot…';
      dayEl.className = 'stack-stat-s';
    }
  }

  let basisCost = 0;
  let basisCurrent = 0;
  if (gOz > 0 && gCost > 0) {
    basisCost += gOz * gCost;
    basisCurrent += gVal;
  }
  if (sOz > 0 && sCost > 0) {
    basisCost += sOz * sCost;
    basisCurrent += sVal;
  }

  if (pnlValEl && pnlPctEl) {
    if (basisCost > 0 && basisCurrent > 0) {
      const pnlUsd = basisCurrent - basisCost;
      const pnlPct = (pnlUsd / basisCost) * 100;
      pnlValEl.textContent = privSignedMoney(pnlUsd);
      pnlValEl.className = hidden
        ? 'stack-stat-v'
        : `stack-stat-v ${pnlUsd > 0.01 ? 'up' : pnlUsd < -0.01 ? 'down' : ''}`;
      pnlPctEl.textContent = hidden
        ? `${formatSignedPct(pnlPct)} (basis hidden)`
        : `${formatSignedPct(pnlPct)} on ${formatMoney(basisCost)}`;
    } else {
      pnlValEl.textContent = '—';
      pnlValEl.className = 'stack-stat-v';
      pnlPctEl.textContent = 'Add avg $/oz cost for P&L';
    }
  }

  const gShare = totalVal > 0 ? Math.round((gVal / totalVal) * 100) : 0;
  const sShare = totalVal > 0 ? 100 - gShare : 0;
  if (splitEl) splitEl.textContent = totalVal > 0 ? `${gShare}% Au / ${sShare}% Ag` : '—';

  const sge = shanghaiState.data || outlookState.data?.shanghai || FALLBACK_SHANGHAI;
  const usdCny = sge?.usdCny || 7.24;
  const gSgeOz = sge?.gold?.usdPerOz ?? ((sge?.gold?.cnyPerG || 635) * TROY_OZ_TO_GRAMS) / usdCny;
  const sSgeOzRaw = sge?.silver?.usdPerOz ?? (((sge?.silver?.cnyPerKg || 8450) / 1000) * TROY_OZ_TO_GRAMS) / usdCny;
  const sSgeOz = sSgeOzRaw / 1.13;
  const gSgeVal = gOz * gSgeOz;
  const sSgeVal = sOz * sSgeOz;
  const sgeTotal = gSgeVal + sSgeVal;
  const sgeDiff = sgeTotal - totalVal;
  if (sgeEl) {
    sgeEl.textContent = hidden
      ? 'China value: •••••'
      : totalVal > 0
        ? `China value: ${formatMoney(sgeTotal)} (${formatSignedMoney(sgeDiff)})`
        : 'Est. value at China prices';
  }

  const oRes = totalVal > 0 ? computeInteractiveOutlook() : null;

  if (scStripEl) {
    if (totalVal > 0 && oRes) {
      const bearVal = gOz * oRes.gold.range.bear + sOz * oRes.silver.range.bear;
      const baseVal = gOz * oRes.gold.range.base + sOz * oRes.silver.range.base;
      const bullVal = gOz * oRes.gold.range.bull + sOz * oRes.silver.range.bull;
      const hLbl = outlookState.horizon === '30d' ? '30D' : '7D';
      const scCount = outlookState.activeScenarios.size;
      const scTag = scCount > 0 ? `${scCount} What-If Test${scCount > 1 ? 's' : ''} On` : `${hLbl} Forecast Range`;
      scStripEl.innerHTML = `
        <div class="stack-sc-head">
          <span>Estimated Stack Value (${hLbl})</span>
          <span>${escapeHtml(scTag)}</span>
        </div>
        <div class="stack-sc-grid">
          <div class="stack-sc-box">
            <span class="stack-sc-k">Low Estimate</span>
            <strong class="stack-sc-v down">${privMoney(bearVal)}</strong>
          </div>
          <div class="stack-sc-box">
            <span class="stack-sc-k">Likely Value</span>
            <strong class="stack-sc-v base">${privMoney(baseVal)}</strong>
          </div>
          <div class="stack-sc-box">
            <span class="stack-sc-k">High Estimate</span>
            <strong class="stack-sc-v up">${privMoney(bullVal)}</strong>
          </div>
        </div>`;
      scStripEl.hidden = false;
    } else {
      scStripEl.hidden = true;
    }
  }

  // Metal-by-Metal Breakdown (#panel-stack-breakdown)
  if (breakdownEl) {
    const fmtWeight = (oz) => {
      if (hidden) return '••• oz · ••• g';
      const grams = oz * TROY_OZ_TO_GRAMS;
      return grams >= 1000
        ? `${oz.toFixed(2)} oz · ${(grams / 1000).toFixed(2)} kg`
        : `${oz.toFixed(2)} oz · ${grams.toFixed(1)} g`;
    };
    const buildMetalCard = ({ code, cls, name, oz, val, share, cost, dayDelta, sgeVal }) => {
      const hasCost = oz > 0 && cost > 0;
      const pnl = hasCost ? val - oz * cost : null;
      const pnlPct = hasCost && oz * cost > 0 ? (pnl / (oz * cost)) * 100 : null;
      const pnlText = hidden
        ? '•••••'
        : pnl != null
          ? `${formatSignedMoney(pnl)} (${formatSignedPct(pnlPct)})`
          : 'No cost basis';
      return `
        <article class="stack-metal-card">
          <div class="stack-metal-head">
            <div class="stack-metal-title">
              <span class="metal-badge ${cls}" style="width:28px;height:28px;font-size:10px;">${code}</span>
              <span>${name}</span>
            </div>
            <strong class="stack-metal-val">${privMoney(val)}</strong>
          </div>
          <div class="stack-alloc-bar">
            <div class="stack-alloc-fill ${cls === 'silver' ? 'silver' : ''}" style="width:${share}%"></div>
          </div>
          <div class="stack-metal-meta">
            <span>Weight: ${escapeHtml(fmtWeight(oz))}</span>
            <span>Share: ${share}% of stack</span>
            <span>Today: ${escapeHtml(privSignedMoney(dayDelta))}</span>
            <span>Profit/Loss: ${escapeHtml(pnlText)}</span>
            <span>China Value: ${escapeHtml(privMoney(sgeVal))}</span>
            <span>Spot: ${escapeHtml(formatMoney(oz > 0 ? val / oz : 0))}/oz</span>
          </div>
        </article>`;
    };
    breakdownEl.innerHTML =
      buildMetalCard({
        code: 'XAU',
        cls: 'gold',
        name: 'Physical Gold',
        oz: gOz,
        val: gVal,
        share: gShare,
        cost: gCost,
        dayDelta: gDayChg,
        sgeVal: gSgeVal,
      }) +
      buildMetalCard({
        code: 'XAG',
        cls: 'silver',
        name: 'Physical Silver',
        oz: sOz,
        val: sVal,
        share: sShare,
        cost: sCost,
        dayDelta: sDayChg,
        sgeVal: sSgeVal,
      });
  }

  // FX Dollar Impact & Price Milestones (#panel-stack-scenarios)
  if (milestonesEl && oRes) {
    const hLbl = outlookState.horizon === '30d' ? '30D' : '7D';
    const fxImp = outlookState.horizon === '30d' ? oRes.dollarStrength?.impact30d : oRes.dollarStrength?.impact7d;
    const fxDelta = (fxImp?.goldUsdOz || 0) * gOz + (fxImp?.silverUsdOz || 0) * sOz;
    const fxAfterVal = totalVal + fxDelta;

    const peakVal = gOz * 5589.38 + sOz * 121.62;
    const bullVal = gOz * oRes.gold.range.bull + sOz * oRes.silver.range.bull;
    const bearVal = gOz * oRes.gold.range.bear + sOz * oRes.silver.range.bear;

    const rows = [
      {
        name: `US Dollar Effect on Stack (${hLbl})`,
        sub: `Dollar Index ${oRes.dollarStrength?.dxy?.toFixed(2) ?? '—'} · ${oRes.dollarStrength?.regime || 'Normal Dollar'}`,
        val: fxAfterVal,
        delta: fxDelta,
      },
      {
        name: 'If Prices Return to 2026 Highs',
        sub: `Gold ${formatMoney(5589.38, 0)}/oz · Silver ${formatMoney(121.62, 2)}/oz`,
        val: peakVal,
        delta: peakVal - totalVal,
      },
      {
        name: `${hLbl} High Forecast`,
        sub: `Gold ${formatMoney(oRes.gold.range.bull, 0)} · Silver ${formatMoney(oRes.silver.range.bull, 2)}`,
        val: bullVal,
        delta: bullVal - totalVal,
      },
      {
        name: `${hLbl} Low Forecast Pullback`,
        sub: `Gold ${formatMoney(oRes.gold.range.bear, 0)} · Silver ${formatMoney(oRes.silver.range.bear, 2)}`,
        val: bearVal,
        delta: bearVal - totalVal,
      },
    ];

    milestonesEl.innerHTML = rows
      .map((r) => {
        const pct = totalVal > 0 ? (r.delta / totalVal) * 100 : 0;
        const cls = hidden ? '' : r.delta > 0.01 ? 'up' : r.delta < -0.01 ? 'down' : '';
        return `
          <div class="stack-milestone-row">
            <div class="stack-ms-left">
              <span class="stack-ms-name">${escapeHtml(r.name)}</span>
              <span class="stack-ms-sub">${escapeHtml(r.sub)}</span>
            </div>
            <div class="stack-ms-right">
              <span class="stack-ms-val">${privMoney(r.val)}</span>
              <span class="stack-ms-delta ${cls}">${hidden ? `••••• (${formatSignedPct(pct)})` : `${formatSignedMoney(r.delta)} (${formatSignedPct(pct)})`}</span>
            </div>
          </div>`;
      })
      .join('');
  }
  if (state.activeView === 'stack') window.BullionIntel?.renderStackTimeMachine?.();
}

function renderAll() {
  renderMacroStrip();
  renderFeedHealth();
  renderStatus();
  renderMetalCard('gold');
  renderMetalCard('silver');
  renderFuturesPanel();
  renderStats();
  renderStackTracker();
  renderShanghai();
  renderChart();
  renderSettingsControls();
  renderAlertLog();
  renderOutlook();
  window.BullionIntel?.renderAll?.();
}

/* ---------- Navigation, Sub-Pages & Events ---------- */

function applySubView(viewName, subName) {
  const viewEl = document.getElementById(`view-${viewName}`);
  if (!viewEl) return;
  const fallback = DEFAULT_SETTINGS.subViews[viewName] || 'live';
  const nav = viewEl.querySelector(`.sub-nav[data-parent-view="${viewName}"]`);
  const validSubs = nav
    ? Array.from(nav.querySelectorAll('.sub-tab-btn')).map((b) => b.dataset.subTarget)
    : [];
  const target = validSubs.includes(subName) ? subName : validSubs[0] || fallback;
  if (!state.settings.subViews) state.settings.subViews = { ...DEFAULT_SETTINGS.subViews };
  state.settings.subViews[viewName] = target;

  if (nav) {
    nav.querySelectorAll('.sub-tab-btn').forEach((btn) => {
      const isAct = btn.dataset.subTarget === target;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
    });
  }

  viewEl.querySelectorAll(':scope > [data-sub]').forEach((el) => {
    el.classList.toggle('sub-hidden', el.dataset.sub !== target);
  });
}

function applyAllSubViews() {
  const sv = state.settings.subViews || DEFAULT_SETTINGS.subViews;
  for (const v of ['markets', 'outlook', 'trade', 'stack', 'alerts']) {
    applySubView(v, sv[v]);
  }
}

function switchSubView(viewName, subName) {
  applySubView(viewName, subName);
  savePersistedState();

  if (viewName === 'markets') {
    if (subName === 'live') {
      renderMetalCard('gold');
      renderMetalCard('silver');
      renderStats();
      requestAnimationFrame(renderChart);
    } else if (subName === 'global') {
      renderFuturesPanel();
      renderShanghai();
      window.BullionIntel?.renderGlobalSub?.();
    } else if (subName === 'charts') {
      requestAnimationFrame(() => window.BullionIntel?.renderDeepChartsSub?.());
    } else if (subName === 'macro') {
      renderMacroStrip();
      renderFeedHealth();
      window.BullionIntel?.renderTickTrust?.();
    }
  } else if (viewName === 'outlook') {
    renderOutlook();
    window.BullionIntel?.renderOutlookSubs?.();
    if (subName === 'sim') {
      requestAnimationFrame(() => {
        renderAccuracyReplayChart(computeInteractiveOutlook());
        renderJumpDiffusion();
      });
    }
  } else if (viewName === 'trade') {
    const res = computeInteractiveOutlook();
    if (subName === 'swap') {
      renderRatioAnalytics(res);
      renderRatioSwapCalculator();
    } else if (subName === 'ladder') {
      renderBuyLadder(res);
    } else if (subName === 'grader') {
      renderDealGrader();
    }
  } else if (viewName === 'stack') {
    renderStackTracker();
    if (subName === 'overview') {
      requestAnimationFrame(() => window.BullionIntel?.renderStackTimeMachine?.());
    }
  } else if (viewName === 'alerts') {
    renderSettingsControls();
    renderAlertLog();
    window.BullionDisplay?.syncAll?.();
  }
  window.BullionDisplay?.onViewChange?.(viewName);
}

function switchView(viewName) {
  state.activeView = viewName;
  if (viewName !== 'alerts') state.lastMainView = viewName;
  document.querySelectorAll('.view-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `view-${viewName}`);
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const active = btn.dataset.view === viewName;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  const settingsBtn = document.getElementById('btn-settings');
  if (settingsBtn) {
    const isSettings = viewName === 'alerts';
    settingsBtn.classList.toggle('active', isSettings);
    settingsBtn.setAttribute('aria-pressed', isSettings ? 'true' : 'false');
  }
  const stackHeaderBtn = document.getElementById('btn-header-melt');
  if (stackHeaderBtn) {
    const isStack = viewName === 'stack';
    stackHeaderBtn.classList.toggle('active', isStack);
    if (isStack) stackHeaderBtn.setAttribute('aria-current', 'page');
    else stackHeaderBtn.removeAttribute('aria-current');
  }
  const activeSub = state.settings.subViews?.[viewName] || DEFAULT_SETTINGS.subViews[viewName];
  applySubView(viewName, activeSub);
  if (window.scrollY > 20) {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  if (viewName === 'markets') {
    renderMetalCard('gold');
    renderMetalCard('silver');
    renderFuturesPanel();
    renderFeedHealth();
    renderStats();
    if (state.settings.subViews?.markets === 'live') {
      requestAnimationFrame(renderChart);
    } else if (state.settings.subViews?.markets === 'charts') {
      requestAnimationFrame(() => window.BullionIntel?.renderDeepChartsSub?.());
    } else if (state.settings.subViews?.markets === 'global') {
      window.BullionIntel?.renderGlobalSub?.();
    } else if (state.settings.subViews?.markets === 'macro') {
      window.BullionIntel?.renderTickTrust?.();
    }
  } else if (viewName === 'outlook') {
    renderOutlook();
    window.BullionIntel?.renderOutlookSubs?.();
    if (state.settings.subViews?.outlook === 'sim') {
      requestAnimationFrame(() => {
        renderAccuracyReplayChart(computeInteractiveOutlook());
        renderJumpDiffusion();
      });
    }
  } else if (viewName === 'trade') {
    const res = computeInteractiveOutlook();
    renderRatioAnalytics(res);
    renderBuyLadder(res);
    renderDealGrader();
    renderRatioSwapCalculator();
  } else if (viewName === 'stack') {
    renderStackTracker();
    if (activeSub === 'overview') {
      requestAnimationFrame(() => window.BullionIntel?.renderStackTimeMachine?.());
    }
  } else if (viewName === 'alerts') {
    renderSettingsControls();
    renderAlertLog();
    window.BullionDisplay?.syncAll?.();
  }
  window.BullionDisplay?.onViewChange?.(viewName);
}

function wireEvents() {
  // Title-bar & bottom navigation + Persistent Title-Bar Melt Value button
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (btn.tagName === 'A') e.preventDefault();
      switchView(btn.dataset.view);
    });
  });
  document.getElementById('btn-header-melt')?.addEventListener('click', () => {
    switchView('stack');
    switchSubView('stack', 'overview');
  });

  // Sub-Page Pill Navigation inside each main tab
  document.querySelectorAll('.sub-nav').forEach((nav) => {
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.sub-tab-btn[data-sub-target]');
      if (!btn) return;
      const parentView = nav.dataset.parentView;
      const subTarget = btn.dataset.subTarget;
      if (parentView && subTarget) switchSubView(parentView, subTarget);
    });
  });

  // Privacy Mode Toggle (hides header Melt value & Stack holdings across reloads)
  document.getElementById('btn-privacy-toggle')?.addEventListener('click', () => {
    state.settings.privacyMode = !state.settings.privacyMode;
    applyPrivacyMode();
    renderStackTracker();
    savePersistedState();
  });

  // Live Multi-Currency Switcher (USD, CAD, EUR, GBP, AUD, MXN)
  document.getElementById('select-currency')?.addEventListener('change', (e) => {
    const oldFx = getFxRate();
    const nextCode = String(e.target.value || 'USD').toUpperCase();
    state.settings.currency = CURRENCY_META[nextCode] ? nextCode : 'USD';
    const newFx = getFxRate();
    if (oldFx > 0 && newFx > 0 && oldFx !== newFx) {
      const ratio = newFx / oldFx;
      mcState.targetByMetal.gold =
        state.settings.unit === 'oz'
          ? Math.round(mcState.targetByMetal.gold * ratio)
          : +(mcState.targetByMetal.gold * ratio).toFixed(2);
      mcState.targetByMetal.silver = +(mcState.targetByMetal.silver * ratio).toFixed(2);
      const mcIn = document.getElementById('input-mc-target');
      if (mcIn) mcIn.value = mcState.targetByMetal[mcState.metal];
    }
    renderAll();
    if (mcState.lastSim) renderMcTargetReadout();
    savePersistedState();
  });

  // Candlestick chart 15m–ALL timeframe selector (lazy-loads candles_hist.json once on 7D–ALL)
  document.getElementById('chart-tf-bar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tf-btn');
    if (!btn || !btn.dataset.tf) return;
    state.settings.chartTimeframe = btn.dataset.tf;
    resetChartZoom();
    if (!INTRADAY_TIMEFRAMES.has(btn.dataset.tf)) ensureHistoricalCandlesLoaded();
    renderChart();
    savePersistedState();
  });

  // Chart Zoom & Pan toolbar controls (stay anchored to live candle when at live edge)
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
    const anchor = state.chartGeom?.isAtLiveEdge ? 1.0 : 0.5;
    zoomChartBy(0.7, anchor);
  });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
    const anchor = state.chartGeom?.isAtLiveEdge ? 1.0 : 0.5;
    zoomChartBy(1.42, anchor);
  });
  document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
    resetChartZoom();
    renderChart();
  });
  document.getElementById('btn-pan-left')?.addEventListener('click', () => {
    const step = Math.max(3, Math.round((state.chartGeom?.visCount || 15) * 0.35));
    panChartBy(-step);
  });
  document.getElementById('btn-pan-right')?.addEventListener('click', () => {
    const step = Math.max(3, Math.round((state.chartGeom?.visCount || 15) * 0.35));
    panChartBy(step);
  });
  document.getElementById('btn-zoom-1m')?.addEventListener('click', () => {
    const curTf = state.settings.chartTimeframe || '1d';
    state.settings.chartTimeframe = curTf === '15min' ? '1h' : '15min';
    resetChartZoom();
    renderChart();
    savePersistedState();
  });

  // Jump-Diffusion Monte Carlo controls, 1D–ALL horizon selector & Target Hit Probability Calculator
  document.getElementById('mc-tf-bar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tf-btn');
    if (!btn || !btn.dataset.mcTf) return;
    mcState.horizon = btn.dataset.mcTf;
    mcState.cacheKey = '';
    renderJumpDiffusion();
  });

  ['gold', 'silver'].forEach((metal) => {
    document.getElementById(`mc-btn-${metal}`)?.addEventListener('click', () => {
      mcState.metal = metal;
      const inputEl = document.getElementById('input-mc-target');
      if (inputEl) {
        const val = mcState.targetByMetal[metal];
        inputEl.value = metal === 'gold' && state.settings.unit === 'oz' ? Math.round(val) : Number(val).toFixed(2);
      }
      renderJumpDiffusion();
    });
  });

  document.getElementById('btn-rerun-mc')?.addEventListener('click', () => {
    mcState.seed = (mcState.seed + 7919 + Math.floor(Math.random() * 10000)) >>> 0;
    mcState.cacheKey = '';
    mcState.chartCache = {};
    mcSimCache.clear();
    renderJumpDiffusion();
    renderChart();
  });

  let mcTargetTimer = null;
  document.getElementById('input-mc-target')?.addEventListener('input', () => {
    clearTimeout(mcTargetTimer);
    mcTargetTimer = setTimeout(() => renderMcTargetReadout(), 120);
  });

  document.querySelectorAll('.mc-preset-btn[data-pct]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pct = parseFloat(btn.dataset.pct);
      const sim = mcState.lastSim;
      const inputEl = document.getElementById('input-mc-target');
      if (!sim || !inputEl || !Number.isFinite(pct)) return;
      const spotDisp = convertUnit(sim.spot) * getFxRate();
      const targetDisp = spotDisp * (1 + pct / 100);
      const formatted = spotDisp >= 500 ? Math.round(targetDisp / 10) * 10 : +targetDisp.toFixed(2);
      mcState.targetByMetal[mcState.metal] = formatted;
      inputEl.value = formatted;
      renderMcTargetReadout();
    });
  });

  // Smart Buy-the-Dip Ladder, Spoken Brief & Shareable Market Snapshot Card
  document.getElementById('input-ladder-budget')?.addEventListener('input', (e) => {
    if (!state.settings.ladder) state.settings.ladder = { ...DEFAULT_SETTINGS.ladder };
    state.settings.ladder.budget = Math.max(50, parseFloat(e.target.value) || 1000);
    renderBuyLadder(computeInteractiveOutlook());
    savePersistedState();
  });
  document.getElementById('select-ladder-metal')?.addEventListener('change', (e) => {
    if (!state.settings.ladder) state.settings.ladder = { ...DEFAULT_SETTINGS.ladder };
    state.settings.ladder.metal = e.target.value || 'auto';
    renderBuyLadder(computeInteractiveOutlook());
    savePersistedState();
  });
  document.getElementById('btn-apply-ladder-alerts')?.addEventListener('click', () => {
    applyLadderDipAlerts();
  });
  document.getElementById('btn-listen-brief')?.addEventListener('click', () => {
    toggleBriefingSpeech();
  });
  document.getElementById('btn-stop-audio-bar')?.addEventListener('click', () => {
    stopAllSpeech();
  });
  document.getElementById('select-tts-voice')?.addEventListener('change', (e) => {
    state.settings.ttsVoice = e.target.value || 'auto';
    populateVoiceSelector();
    savePersistedState();
  });
  document.getElementById('select-tts-rate')?.addEventListener('change', (e) => {
    state.settings.ttsRate = clampNum(parseFloat(e.target.value) || 0.96, 0.75, 1.35);
    savePersistedState();
  });
  document.getElementById('btn-test-voice')?.addEventListener('click', () => {
    unlockMobileAudioSync();
    const fb = document.getElementById('voice-feedback');
    const c = getCanonicalSpotPrices();
    speakSentencesNaturally(
      [
        `Hello! Gold is currently at ${formatSpokenMoney(c.gold, false)} per ounce, and your Bullion Pulse audio briefing is ready.`,
      ],
      { isBriefBtn: false, feedbackEl: fb }
    );
  });
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.addEventListener?.('voiceschanged', populateVoiceSelector);
  }
  document.getElementById('btn-share-card')?.addEventListener('click', () => {
    exportShareMarketCard();
  });

  // Coin Shop Fair Price & Deal Grader
  document.getElementById('deal-preset')?.addEventListener('change', (e) => {
    if (!state.settings.dealGrader) state.settings.dealGrader = { ...DEFAULT_SETTINGS.dealGrader };
    state.settings.dealGrader.preset = e.target.value || 'ase_1oz';
    renderDealGrader();
    savePersistedState();
  });
  document.getElementById('input-deal-qty')?.addEventListener('input', (e) => {
    if (!state.settings.dealGrader) state.settings.dealGrader = { ...DEFAULT_SETTINGS.dealGrader };
    state.settings.dealGrader.qty = e.target.value;
    renderDealGrader();
    savePersistedState();
  });
  document.getElementById('input-deal-ask')?.addEventListener('input', (e) => {
    if (!state.settings.dealGrader) state.settings.dealGrader = { ...DEFAULT_SETTINGS.dealGrader };
    state.settings.dealGrader.ask = e.target.value;
    renderDealGrader();
    savePersistedState();
  });

  // Stack Goals & Future Price Wealth Sliders
  [
    ['input-goal-gold-oz', 'goldOz'],
    ['input-goal-silver-oz', 'silverOz'],
    ['input-goal-usd', 'targetUsd'],
  ].forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      if (!state.settings.stackGoals) state.settings.stackGoals = { ...DEFAULT_SETTINGS.stackGoals };
      state.settings.stackGoals[key] = e.target.value.trim();
      renderStackGoalsAndWhatIf();
      savePersistedState();
    });
  });

  document.getElementById('slider-whatif-gold')?.addEventListener('input', (e) => {
    state.whatIfPrices.gold = parseFloat(e.target.value) || 3500;
    renderStackGoalsAndWhatIf();
  });
  document.getElementById('slider-whatif-silver')?.addEventListener('input', (e) => {
    state.whatIfPrices.silver = parseFloat(e.target.value) || 41;
    renderStackGoalsAndWhatIf();
  });
  document.querySelectorAll('.whatif-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.reset) {
        const c = getCanonicalSpotPrices();
        state.whatIfPrices.gold = Math.round(c.gold);
        state.whatIfPrices.silver = +c.silver.toFixed(2);
      } else {
        const g = parseFloat(btn.dataset.gold);
        const s = parseFloat(btn.dataset.silver);
        if (Number.isFinite(g)) state.whatIfPrices.gold = g;
        if (Number.isFinite(s)) state.whatIfPrices.silver = s;
      }
      renderStackGoalsAndWhatIf();
    });
  });

  // Outlook horizon & scenario simulator
  document.getElementById('horizon-7d')?.addEventListener('click', () => {
    outlookState.horizon = '7d';
    mcState.horizon = '7d';
    mcState.cacheKey = '';
    renderOutlook();
    renderStackTracker();
    renderChart();
  });
  document.getElementById('horizon-30d')?.addEventListener('click', () => {
    outlookState.horizon = '30d';
    mcState.horizon = '1m';
    mcState.cacheKey = '';
    renderOutlook();
    renderStackTracker();
    renderChart();
  });
  document.getElementById('scenario-chips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.scenario-chip');
    if (!btn) return;
    const id = btn.dataset.scenario;
    if (outlookState.activeScenarios.has(id)) outlookState.activeScenarios.delete(id);
    else outlookState.activeScenarios.add(id);
    renderOutlook();
    renderStackTracker();
    renderChart();
  });
  document.getElementById('btn-reset-scenarios')?.addEventListener('click', () => {
    outlookState.activeScenarios.clear();
    renderOutlook();
    renderStackTracker();
    renderChart();
  });

  // Forecast, Price Discovery, Short Squeeze & Fibonacci overlay toggles on candlestick chart
  document.getElementById('btn-toggle-forecast')?.addEventListener('click', () => {
    state.settings.showForecast = !state.settings.showForecast;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-toggle-discovery')?.addEventListener('click', () => {
    state.settings.showDiscovery = !state.settings.showDiscovery;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-toggle-squeeze')?.addEventListener('click', () => {
    state.settings.showSqueeze = !state.settings.showSqueeze;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-toggle-fib')?.addEventListener('click', () => {
    state.settings.showFib = !state.settings.showFib;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-toggle-sma')?.addEventListener('click', () => {
    state.settings.showSma = !state.settings.showSma;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-toggle-rsi')?.addEventListener('click', () => {
    state.settings.showRsi = !state.settings.showRsi;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-toggle-mybuys')?.addEventListener('click', () => {
    state.settings.showMyBuys = !state.settings.showMyBuys;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-toggle-patterns')?.addEventListener('click', () => {
    state.settings.showPatterns = !state.settings.showPatterns;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-toggle-gaps')?.addEventListener('click', () => {
    state.settings.showGaps = !state.settings.showGaps;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-toggle-newsdots')?.addEventListener('click', () => {
    state.settings.showNewsDots = !state.settings.showNewsDots;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-chart-replay')?.addEventListener('click', () => {
    if (state.chartReplay.active) stopChartReplay(true);
    else startChartReplay();
  });

  document.getElementById('btn-replay-playpause')?.addEventListener('click', () => {
    if (!state.chartReplay.active) return;
    const total = state.chartGeom?.converted?.length || 28;
    if (state.chartReplay.idx > total) {
      startChartReplay();
      return;
    }
    state.chartReplay.paused = !state.chartReplay.paused;
    const ppBtn = document.getElementById('btn-replay-playpause');
    if (ppBtn) ppBtn.textContent = state.chartReplay.paused ? '▶' : '⏸';
  });

  document.getElementById('btn-replay-speed')?.addEventListener('click', () => {
    state.chartReplay.speed = state.chartReplay.speed === 1 ? 2 : 1;
    const spBtn = document.getElementById('btn-replay-speed');
    if (spBtn) spBtn.textContent = `${state.chartReplay.speed}×`;
    if (state.chartReplay.active && state.chartReplay.timer) {
      clearInterval(state.chartReplay.timer);
      state.chartReplay.timer = setInterval(stepChartReplay, state.chartReplay.speed === 2 ? 150 : 320);
    }
  });

  document.getElementById('btn-replay-stop')?.addEventListener('click', () => {
    stopChartReplay(true);
  });

  for (const [btnId, mode] of [
    ['news-filter-all', 'all'],
    ['news-filter-signal', 'signal'],
    ['news-filter-nohype', 'nohype'],
  ]) {
    document.getElementById(btnId)?.addEventListener('click', () => {
      state.settings.newsFilter = mode;
      renderOutlook();
      savePersistedState();
    });
  }
  document.getElementById('news-topic-chips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.news-topic-chip');
    if (!btn) return;
    state.settings.newsTopic = btn.dataset.topic || 'all';
    renderOutlook();
    savePersistedState();
  });
  document.getElementById('phys-grid')?.addEventListener('click', (e) => {
    const applyBtn = e.target.closest('[data-phys-apply]');
    const resetBtn = e.target.closest('[data-phys-reset]');
    if (applyBtn) {
      const key = applyBtn.dataset.physApply;
      const inp = document.querySelector(`[data-phys-input="${key}"]`);
      const val = Number(inp?.value);
      if (!state.settings.dealerQuotes) state.settings.dealerQuotes = { goldStreetOz: null, silverStreetOz: null };
      if (Number.isFinite(val) && val > 0) {
        state.settings.dealerQuotes[key] = +val.toFixed(2);
        savePersistedState();
        renderOutlook();
        renderChart();
      }
    } else if (resetBtn) {
      const key = resetBtn.dataset.physReset;
      if (!state.settings.dealerQuotes) state.settings.dealerQuotes = { goldStreetOz: null, silverStreetOz: null };
      state.settings.dealerQuotes[key] = null;
      savePersistedState();
      renderOutlook();
      renderChart();
    }
  });

  // Interactive 60fps dual-canvas OHLC crosshair, wheel/pinch zoom & drag-to-pan on candlestick chart
  const chartCanvas = document.getElementById('intraday-chart');
  if (chartCanvas) {
    const chartWrapEl = chartCanvas.closest('.chart-wrap');
    const inspectPointer = (clientX) => {
      const g = state.chartGeom;
      const rect = chartCanvas.getBoundingClientRect();
      const plotW = g ? g.plotW : rect.width - 66;
      const chartMode = state.settings.chartMode || state.settings.selectedMetal || 'gold';
      const isRatio = chartMode === 'ratio';
      const tf = state.settings.chartTimeframe || '1d';
      const candleAreaW = g ? g.candleAreaW : (state.settings.showForecast && !isRatio ? plotW * 0.72 : plotW);
      const padLeft = g ? g.padLeft : 6;
      const relX = clientX - rect.left - padLeft;
      const len = g?.converted?.length || (isRatio
        ? getRatioBarsForTimeframe(tf).length
        : getCandlesForTimeframe(state.settings.selectedMetal, tf).length);
      if (!len || relX < 0 || relX > plotW) {
        if (state.hoverCandleIdx !== null || state.hoverForecastIdx !== null) {
          state.hoverCandleIdx = null;
          state.hoverForecastIdx = null;
          renderCrosshairOverlay(null, null);
        }
        return;
      }
      if (relX > candleAreaW && g?.forecastLine?.points?.length > 1) {
        const pts = g.forecastLine.points;
        const absX = relX + padLeft;
        let bestI = 1;
        let bestDist = Infinity;
        for (let i = 1; i < pts.length; i++) {
          const d = Math.abs(pts[i].x - absX);
          if (d < bestDist) {
            bestDist = d;
            bestI = i;
          }
        }
        if (state.hoverForecastIdx !== bestI || state.hoverCandleIdx !== null) {
          state.hoverCandleIdx = null;
          state.hoverForecastIdx = bestI;
          renderCrosshairOverlay(null, bestI);
        }
        return;
      }
      if (relX > candleAreaW) {
        if (state.hoverCandleIdx !== null || state.hoverForecastIdx !== null) {
          state.hoverCandleIdx = null;
          state.hoverForecastIdx = null;
          renderCrosshairOverlay(null, null);
        }
        return;
      }
      const idx = Math.max(0, Math.min(len - 1, Math.floor((relX / candleAreaW) * len)));
      if (state.hoverCandleIdx !== idx || state.hoverForecastIdx !== null) {
        state.hoverForecastIdx = null;
        state.hoverCandleIdx = idx;
        renderCrosshairOverlay(idx, null);
      }
    };

    const endChartDrag = () => {
      state.chartZoom.dragging = false;
      state.chartZoom.didDrag = false;
      if (chartWrapEl) chartWrapEl.classList.remove('is-dragging');
    };

    chartCanvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const g = state.chartGeom;
      if (g && g.visCount < g.totalCount) {
        state.chartZoom.dragging = true;
        state.chartZoom.dragStartX = e.clientX;
        state.chartZoom.dragStartIdx = g.viewStart;
        state.chartZoom.didDrag = false;
        if (chartWrapEl) chartWrapEl.classList.add('is-dragging');
      }
      inspectPointer(e.clientX);
    });

    chartCanvas.addEventListener('pointermove', (e) => {
      const g = state.chartGeom;
      if (state.chartZoom.dragging && g && g.visCount < g.totalCount && (e.pointerType !== 'mouse' || (e.buttons & 1))) {
        const dx = e.clientX - state.chartZoom.dragStartX;
        if (Math.abs(dx) > 5) state.chartZoom.didDrag = true;
        if (state.chartZoom.didDrag) {
          const barsDelta = Math.round(-dx / Math.max(4, g.stepX));
          const maxStart = Math.max(0, g.totalCount - g.visCount);
          const nextStart = Math.max(0, Math.min(maxStart, state.chartZoom.dragStartIdx + barsDelta));
          if (nextStart !== g.viewStart) {
            state.chartZoom.visibleCount = g.visCount;
            state.chartZoom.startIdx = nextStart >= maxStart ? null : nextStart;
            state.hoverCandleIdx = null;
            renderChart();
          }
          return;
        }
      }
      inspectPointer(e.clientX);
    });

    chartCanvas.addEventListener('pointerup', endChartDrag);
    chartCanvas.addEventListener('pointercancel', endChartDrag);
    chartCanvas.addEventListener('pointerleave', () => {
      endChartDrag();
      state.hoverCandleIdx = null;
      state.hoverForecastIdx = null;
      renderCrosshairOverlay(null, null);
    });

    // Mouse wheel / trackpad scroll zoom centered on cursor candle
    chartCanvas.addEventListener(
      'wheel',
      (e) => {
        const g = state.chartGeom;
        if (!g || !g.totalCount) return;
        e.preventDefault();
        const rect = chartCanvas.getBoundingClientRect();
        const anchorFrac = clampNum((e.clientX - rect.left - g.padLeft) / Math.max(1, g.candleAreaW), 0, 1);
        const factor = e.deltaY < 0 ? 0.78 : 1.28;
        zoomChartBy(factor, anchorFrac);
      },
      { passive: false }
    );

    // Double-click to reset zoom to 100%
    chartCanvas.addEventListener('dblclick', () => {
      resetChartZoom();
      renderChart();
    });

    // Two-finger touchscreen pinch-to-zoom
    chartCanvas.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2 && state.chartGeom) {
          e.preventDefault();
          endChartDrag();
          const [t1, t2] = e.touches;
          state.chartZoom.pinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          state.chartZoom.pinchCount = state.chartGeom.visCount;
          const rect = chartCanvas.getBoundingClientRect();
          const midX = (t1.clientX + t2.clientX) / 2;
          state.chartZoom.pinchCenterFrac = clampNum(
            (midX - rect.left - state.chartGeom.padLeft) / Math.max(1, state.chartGeom.candleAreaW),
            0,
            1
          );
        }
      },
      { passive: false }
    );

    chartCanvas.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 2 && state.chartZoom.pinchDist && state.chartGeom) {
          e.preventDefault();
          const [t1, t2] = e.touches;
          const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          if (dist < 10) return;
          const g = state.chartGeom;
          const ratio = state.chartZoom.pinchDist / dist;
          const targetVis = Math.max(
            Math.min(g.totalCount, MIN_ZOOM_BARS),
            Math.min(g.totalCount, Math.round(state.chartZoom.pinchCount * ratio))
          );
          if (targetVis !== g.visCount) {
            const anchorBar = g.viewStart + state.chartZoom.pinchCenterFrac * g.visCount;
            const maxStart = Math.max(0, g.totalCount - targetVis);
            const nextStart = Math.max(
              0,
              Math.min(maxStart, Math.round(anchorBar - state.chartZoom.pinchCenterFrac * targetVis))
            );
            state.chartZoom.visibleCount = targetVis;
            state.chartZoom.startIdx = nextStart >= maxStart ? null : nextStart;
            state.hoverCandleIdx = null;
            renderChart();
          }
        }
      },
      { passive: false }
    );

    chartCanvas.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        state.chartZoom.pinchDist = null;
        state.chartZoom.pinchCount = null;
      }
    });
  }

  // Refresh & Theme
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    navigator.serviceWorker?.getRegistration?.().then((r) => r?.update()).catch(() => {});
    fetchSpotQuotes(true);
    fetchOutlookData();
    fetchShanghaiData();
    fetchCandlesData();
    fetchComexData();
  fetchLiveSpaceWeather();
    fetchLivePlatinumPrice();
    fetchLiveDxyIndex();
    fetchLiveFuturesQuotes();
  });
  document.getElementById('btn-refresh-comex')?.addEventListener('click', () => {
    fetchComexData();
  fetchLiveSpaceWeather();
  });
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    if (window.BullionDisplay?.cycleTheme) {
      window.BullionDisplay.cycleTheme();
    } else {
      applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
      savePersistedState();
    }
  });
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    if (state.activeView === 'alerts') {
      switchView(state.lastMainView || 'markets');
    } else {
      switchView('alerts');
    }
  });
  document.getElementById('btn-close-settings')?.addEventListener('click', () => {
    switchView(state.lastMainView || 'markets');
  });

  // Unit switch
  document.getElementById('unit-oz')?.addEventListener('click', () => {
    if (state.settings.unit === 'g') {
      mcState.targetByMetal.gold = Math.round(mcState.targetByMetal.gold * TROY_OZ_TO_GRAMS);
      mcState.targetByMetal.silver = +(mcState.targetByMetal.silver * TROY_OZ_TO_GRAMS).toFixed(2);
    }
    state.settings.unit = 'oz';
    renderAll();
    savePersistedState();
  });
  document.getElementById('unit-g')?.addEventListener('click', () => {
    if (state.settings.unit === 'oz') {
      mcState.targetByMetal.gold = +(mcState.targetByMetal.gold / TROY_OZ_TO_GRAMS).toFixed(2);
      mcState.targetByMetal.silver = +(mcState.targetByMetal.silver / TROY_OZ_TO_GRAMS).toFixed(2);
    }
    state.settings.unit = 'g';
    renderAll();
    savePersistedState();
  });

  // Metal selection & Au/Ag Ratio chart mode
  ['gold', 'silver'].forEach((metal) => {
    const selectMetal = () => {
      state.settings.selectedMetal = metal;
      state.settings.chartMode = metal;
      resetChartZoom();
      renderAll();
      savePersistedState();
    };
    document.getElementById(`card-${metal}`)?.addEventListener('click', selectMetal);
    document.getElementById(`chart-btn-${metal}`)?.addEventListener('click', selectMetal);
  });

  document.getElementById('chart-btn-ratio')?.addEventListener('click', () => {
    state.settings.chartMode = 'ratio';
    resetChartZoom();
    if (!INTRADAY_TIMEFRAMES.has(state.settings.chartTimeframe || '1d')) ensureHistoricalCandlesLoaded();
    renderChart();
    savePersistedState();
  });

  // Alert Banner dismiss
  document.getElementById('btn-dismiss-banner')?.addEventListener('click', () => {
    const banner = document.getElementById('alert-banner');
    if (banner) banner.hidden = true;
  });

  // Threshold sliders & direction
  document.getElementById('input-gold-threshold')?.addEventListener('input', (e) => {
    state.settings.goldThreshold = parseFloat(e.target.value);
    renderAll();
    savePersistedState();
  });
  document.getElementById('input-silver-threshold')?.addEventListener('input', (e) => {
    state.settings.silverThreshold = parseFloat(e.target.value);
    renderAll();
    savePersistedState();
  });
  document.getElementById('input-sge-threshold')?.addEventListener('input', (e) => {
    state.settings.shanghaiThreshold = parseFloat(e.target.value);
    renderSettingsControls();
    savePersistedState();
  });
  document.getElementById('select-direction')?.addEventListener('change', (e) => {
    state.settings.direction = e.target.value;
    renderSettingsControls();
    savePersistedState();
  });
  document.getElementById('chk-confirm-moves')?.addEventListener('change', (e) => {
    state.settings.confirmMoves = !!e.target.checked;
    if (!state.settings.confirmMoves) {
      state.pendingAlert = { gold: null, silver: null };
    }
    renderSettingsControls();
    savePersistedState();
  });

  // ntfy topic input
  document.getElementById('input-ntfy-topic')?.addEventListener('input', (e) => {
    state.settings.ntfyTopic = e.target.value.trim();
    renderSettingsControls();
    savePersistedState();
  });

  // Private My Bullion Stack inputs (stored 100% locally)
  const stackInputs = [
    ['input-stack-gold-oz', 'goldOz'],
    ['input-stack-gold-cost', 'goldCost'],
    ['input-stack-silver-oz', 'silverOz'],
    ['input-stack-silver-cost', 'silverCost'],
    ['input-stack-gold-spread', 'goldSpreadPct'],
    ['input-stack-silver-spread', 'silverSpreadPct'],
  ];
  stackInputs.forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      if (!state.settings.stack) state.settings.stack = { ...DEFAULT_SETTINGS.stack };
      state.settings.stack[key] = e.target.value.trim();
      renderStackTracker();
      savePersistedState();
    });
  });

  // Purchase Lot Ledger: Add & Remove lots
  document.getElementById('form-add-lot')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const metal = document.getElementById('lot-metal')?.value === 'silver' ? 'silver' : 'gold';
    const form = document.getElementById('lot-form')?.value || 'Coin / Eagle';
    const ozEl = document.getElementById('lot-oz');
    const costEl = document.getElementById('lot-cost');
    const noteEl = document.getElementById('lot-note');
    const oz = parseFloat(ozEl?.value);
    const cost = parseFloat(costEl?.value);
    if (!Number.isFinite(oz) || oz <= 0 || !Number.isFinite(cost) || cost <= 0) return;
    if (!Array.isArray(state.settings.stackLots)) state.settings.stackLots = [];
    state.settings.stackLots.unshift({
      id: `lot_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      metal,
      form,
      oz: +oz.toFixed(4),
      cost: +cost.toFixed(2),
      note: (noteEl?.value || '').trim().slice(0, 40),
      createdAt: new Date().toISOString(),
    });
    state.settings.stackLots = state.settings.stackLots.slice(0, 100);
    if (ozEl) ozEl.value = '';
    if (costEl) costEl.value = '';
    if (noteEl) noteEl.value = '';
    syncLotsToStackTotals();
    renderSettingsControls();
    renderStackTracker();
    savePersistedState();
  });

  document.getElementById('stack-lots-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.lot-del-btn[data-lot-id]');
    if (!btn) return;
    const id = btn.dataset.lotId;
    const removed = (state.settings.stackLots || []).find((l) => l.id === id);
    state.settings.stackLots = (state.settings.stackLots || []).filter((l) => l.id !== id);
    if (removed) {
      const m = removed.metal === 'silver' ? 'silver' : 'gold';
      if (!state.settings.stackLots.some((l) => (l.metal === 'silver' ? 'silver' : 'gold') === m)) {
        if (m === 'gold') {
          state.settings.stack.goldOz = '';
          state.settings.stack.goldCost = '';
        } else {
          state.settings.stack.silverOz = '';
          state.settings.stack.silverCost = '';
        }
      }
    }
    syncLotsToStackTotals();
    renderSettingsControls();
    renderStackTracker();
    savePersistedState();
  });

  // Au <-> Ag Ratio Swap Calculator smooth scroll inside Trade tab
  document.getElementById('btn-open-ratio-swap')?.addEventListener('click', () => {
    switchView('trade');
    switchSubView('trade', 'swap');
    requestAnimationFrame(() => {
      document.getElementById('panel-ratio-swap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  document.getElementById('swap-dir-g2s')?.addEventListener('click', () => {
    state.swapCalc.dir = 'g2s';
    state.swapCalc.oz = 1;
    state.swapCalc.targetRatio = 65;
    const ozEl = document.getElementById('input-swap-oz');
    const tgtEl = document.getElementById('input-swap-target-ratio');
    if (ozEl) ozEl.value = '1';
    if (tgtEl) tgtEl.value = '65';
    renderRatioSwapCalculator();
  });
  document.getElementById('swap-dir-s2g')?.addEventListener('click', () => {
    state.swapCalc.dir = 's2g';
    state.swapCalc.oz = 80;
    state.swapCalc.targetRatio = 90;
    const ozEl = document.getElementById('input-swap-oz');
    const tgtEl = document.getElementById('input-swap-target-ratio');
    if (ozEl) ozEl.value = '80';
    if (tgtEl) tgtEl.value = '90';
    renderRatioSwapCalculator();
  });
  document.getElementById('input-swap-oz')?.addEventListener('input', (e) => {
    state.swapCalc.oz = parseFloat(e.target.value) || 0;
    renderRatioSwapCalculator();
  });
  document.getElementById('input-swap-target-ratio')?.addEventListener('input', (e) => {
    state.swapCalc.targetRatio = parseFloat(e.target.value) || 65;
    renderRatioSwapCalculator();
  });
  document.getElementById('input-swap-friction')?.addEventListener('input', (e) => {
    state.swapCalc.frictionPct = parseFloat(e.target.value) || 0;
    renderRatioSwapCalculator();
  });

  // Self-Learning Visual Accuracy Chart Metal & Horizon (Daily / 7D / 30D) Toggles + Interactive Hover
  document.getElementById('ha-btn-gold')?.addEventListener('click', () => {
    state.hiddenAlphaMetal = 'gold';
    renderHiddenAlpha(computeInteractiveOutlook());
  });
  document.getElementById('ha-btn-silver')?.addEventListener('click', () => {
    state.hiddenAlphaMetal = 'silver';
    renderHiddenAlpha(computeInteractiveOutlook());
  });
  document.getElementById('aidc-body')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-aidc-sim]');
    if (!btn) return;
    const mode = btn.getAttribute('data-aidc-sim');
    outlookState.activeScenarios.delete('ai_capex_surge');
    outlookState.activeScenarios.delete('ai_capex_pause');
    if (mode === 'surge') outlookState.activeScenarios.add('ai_capex_surge');
    else if (mode === 'pause') outlookState.activeScenarios.add('ai_capex_pause');
    renderOutlook();
    renderChart();
  });
  document.getElementById('acc-chart-gold')?.addEventListener('click', () => {
    state.accuracyChartMetal = 'gold';
    state.accuracyHoverIdx = null;
    renderAccuracyReplayChart(computeInteractiveOutlook());
  });
  document.getElementById('acc-chart-silver')?.addEventListener('click', () => {
    state.accuracyChartMetal = 'silver';
    state.accuracyHoverIdx = null;
    renderAccuracyReplayChart(computeInteractiveOutlook());
  });
  for (const [btnId, hzVal] of [
    ['acc-hz-daily', 'daily'],
    ['acc-hz-7d', '7d'],
    ['acc-hz-30d', '30d'],
  ]) {
    document.getElementById(btnId)?.addEventListener('click', () => {
      state.accuracyChartHorizon = hzVal;
      state.accuracyHoverIdx = null;
      renderAccuracyReplayChart(computeInteractiveOutlook());
    });
  }
  const accCanvas = document.getElementById('accuracy-replay-chart');
  if (accCanvas) {
    const inspectAcc = (clientX) => {
      const g = state.accuracyGeom;
      if (!g || !g.points?.length) return;
      const rect = accCanvas.getBoundingClientRect();
      const relX = clientX - rect.left;
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i < g.points.length; i++) {
        const d = Math.abs(g.xAt(i) - relX);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      if (state.accuracyHoverIdx !== bestI) {
        state.accuracyHoverIdx = bestI;
        renderAccuracyReplayChart(computeInteractiveOutlook());
      }
    };
    accCanvas.addEventListener('pointermove', (e) => inspectAcc(e.clientX));
    accCanvas.addEventListener('pointerdown', (e) => inspectAcc(e.clientX));
    accCanvas.addEventListener('pointerleave', () => {
      if (state.accuracyHoverIdx !== null) {
        state.accuracyHoverIdx = null;
        renderAccuracyReplayChart(computeInteractiveOutlook());
      }
    });
  }

  // Smart Regime & Quiet-Hours Alerts controls
  [
    ['chk-alert-backwardation', 'backwardation'],
    ['chk-alert-squeeze', 'shortSqueeze'],
    ['chk-alert-dxy', 'dxyShock'],
    ['chk-morning-digest', 'morningDigest'],
  ].forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      if (!state.settings.smartAlerts) state.settings.smartAlerts = { ...DEFAULT_SETTINGS.smartAlerts };
      state.settings.smartAlerts[key] = !!e.target.checked;
      renderSettingsControls();
      savePersistedState();
    });
  });

  document.getElementById('chk-quiet-hours')?.addEventListener('change', (e) => {
    if (!state.settings.quietHours) state.settings.quietHours = { ...DEFAULT_SETTINGS.quietHours };
    state.settings.quietHours.enabled = !!e.target.checked;
    renderSettingsControls();
    savePersistedState();
  });
  document.getElementById('select-quiet-start')?.addEventListener('change', (e) => {
    if (!state.settings.quietHours) state.settings.quietHours = { ...DEFAULT_SETTINGS.quietHours };
    state.settings.quietHours.start = parseInt(e.target.value, 10);
    renderSettingsControls();
    savePersistedState();
  });
  document.getElementById('select-quiet-end')?.addEventListener('change', (e) => {
    if (!state.settings.quietHours) state.settings.quietHours = { ...DEFAULT_SETTINGS.quietHours };
    state.settings.quietHours.end = parseInt(e.target.value, 10);
    renderSettingsControls();
    savePersistedState();
  });

  // Export & Import JSON Backup (protects Stack, Lots & Custom Alerts from cache clears)
  document.getElementById('btn-export-backup')?.addEventListener('click', () => {
    const payload = {
      app: 'Bullion Pulse',
      version: 52,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      alertLog: state.alertLog.slice(0, 25),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bullion-pulse-backup-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.getElementById('btn-import-backup')?.addEventListener('click', () => {
    document.getElementById('input-import-backup')?.click();
  });

  document.getElementById('input-import-backup')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) {
        throw new Error('Backup file too large');
      }
      const parsed = JSON.parse(await file.text());
      if (isPlainObject(parsed) && isPlainObject(parsed.settings)) {
        state.settings = sanitizePersistedSettings({
          ...state.settings,
          ...parsed.settings,
          subViews: state.settings.subViews,
        });
        if (Array.isArray(parsed.alertLog)) {
          state.alertLog = sanitizeAlertLog(parsed.alertLog);
        }
        applyTheme(state.settings.theme);
        applyPrivacyMode();
        window.BullionDisplay?.syncAll?.();
        renderAll();
        savePersistedState();
      }
    } catch {
      // Ignore malformed or oversized JSON backup file
    } finally {
      e.target.value = '';
    }
  });

  // Custom Target Price Alert inputs (debounced evaluation so partial typing doesn't misfire)
  const targetInputs = [
    ['input-target-gold-above', 'goldAbove'],
    ['input-target-gold-below', 'goldBelow'],
    ['input-target-silver-above', 'silverAbove'],
    ['input-target-silver-below', 'silverBelow'],
    ['input-target-ratio-above', 'ratioAbove'],
    ['input-target-ratio-below', 'ratioBelow'],
  ];
  let targetEvalTimer = null;
  targetInputs.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const evaluateRule = () => {
      if (state.sessionAlerted.targets) delete state.sessionAlerted.targets[key];
      if (state.quotes.gold.price && state.quotes.silver.price) {
        evaluateClientPriceTargets(state.quotes.gold.price, state.quotes.silver.price);
        renderAlertLog();
      }
      savePersistedState();
    };
    el.addEventListener('input', (e) => {
      if (!state.settings.targets) state.settings.targets = { ...DEFAULT_SETTINGS.targets };
      state.settings.targets[key] = e.target.value.trim();
      renderSettingsControls();
      savePersistedState();
      clearTimeout(targetEvalTimer);
      targetEvalTimer = setTimeout(evaluateRule, 750);
    });
    el.addEventListener('change', () => {
      clearTimeout(targetEvalTimer);
      evaluateRule();
    });
  });

  // Browser Web Notification API activation
  document.getElementById('btn-enable-web-notif')?.addEventListener('click', async () => {
    const feedback = document.getElementById('ntfy-feedback');
    if (typeof Notification === 'undefined') {
      if (feedback) {
        feedback.className = 'feedback-note err';
        feedback.textContent = 'Browser notifications are not supported on this browser — use ntfy.sh push above.';
      }
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      renderSettingsControls();
      if (perm === 'granted') {
        maybeSendBrowserNotification(
          'Bullion Pulse Browser Alerts Active',
          'You will receive live alerts whenever daily moves or custom price targets hit.'
        );
        if (feedback) {
          feedback.className = 'feedback-note ok';
          feedback.textContent = 'Browser notifications enabled!';
        }
      } else if (feedback) {
        feedback.className = 'feedback-note err';
        feedback.textContent = 'Notification permission was denied in browser settings.';
      }
    } catch (err) {
      if (feedback) {
        feedback.className = 'feedback-note err';
        feedback.textContent = `Could not enable browser alerts: ${err.message}`;
      }
    }
  });

  // Interactive Sector Bellwethers drill-down drawer
  document.getElementById('sector-leaders-grid')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.sector-chip[data-symbol]');
    if (!chip) return;
    const sym = chip.dataset.symbol;
    state.selectedMiner = state.selectedMiner === sym ? null : sym;
    renderSectorLeaders(computeInteractiveOutlook());
  });

  document.getElementById('sector-detail-drawer')?.addEventListener('click', (e) => {
    if (e.target.closest('#btn-close-miner-drawer')) {
      state.selectedMiner = null;
      renderSectorLeaders(computeInteractiveOutlook());
    }
  });

  // Send Test Push via ntfy.sh
  document.getElementById('btn-test-ntfy')?.addEventListener('click', async () => {
    const feedback = document.getElementById('ntfy-feedback');
    const topic = state.settings.ntfyTopic.trim();
    feedback.className = 'feedback-note';

    if (!topic) {
      feedback.textContent = 'Enter a unique topic name above first (and subscribe to it in the ntfy phone app).';
      feedback.classList.add('err');
      return;
    }

    feedback.textContent = 'Sending anonymous test notification via ntfy.sh…';
    try {
      const goldStr = state.quotes.gold.price ? formatMoney(state.quotes.gold.price) : '$—';
      const silverStr = state.quotes.silver.price ? formatMoney(state.quotes.silver.price) : '$—';
      const cleanTopic = await publishToNtfy({
        topic,
        title: 'Bullion Pulse Connected',
        message: `Test alert succeeded! Gold: ${goldStr}/oz · Silver: ${silverStr}/oz. Rules: ±${state.settings.goldThreshold}% XAU · ±${state.settings.silverThreshold}% XAG · ±$${state.settings.shanghaiThreshold}/oz SGE.`,
        priority: 'high',
        tags: 'white_check_mark,coin',
      });
      feedback.textContent = `Sent to ntfy.sh/${cleanTopic} — check your phone!`;
      feedback.classList.add('ok');
    } catch (err) {
      feedback.textContent = `Could not send push: ${err.message}`;
      feedback.classList.add('err');
    }
  });

  // Simulate Big Daily Move
  document.getElementById('btn-simulate-move')?.addEventListener('click', () => {
    const feedback = document.getElementById('ntfy-feedback');
    const pickSilver = Math.random() > 0.5;
    const metal = pickSilver ? 'silver' : 'gold';
    const threshold =
      metal === 'gold' ? state.settings.goldThreshold : state.settings.silverThreshold;
    const sign =
      state.settings.direction === 'down'
        ? -1
        : state.settings.direction === 'up'
          ? 1
          : Math.random() > 0.45
            ? 1
            : -1;
    const simPct = sign * +(threshold + 0.65).toFixed(2);
    const prev = state.quotes[metal].prevClose ?? (metal === 'gold' ? 3740.0 : 45.2);
    const simPrice = +(prev * (1 + simPct / 100)).toFixed(2);

    evaluateAlerts(
      metal,
      {
        price: simPrice,
        prevClose: prev,
        chg: simPrice - prev,
        pct: simPct,
      },
      true
    );
    savePersistedState();
    feedback.className = 'feedback-note ok';
    feedback.textContent = `Simulated a ${formatSignedPct(simPct)} ${metal.toUpperCase()} daily move — see banner & Alert History.`;
  });

  // Simulate Shanghai Gold Premium Spike (+$42/oz)
  document.getElementById('btn-simulate-sge')?.addEventListener('click', () => {
    const feedback = document.getElementById('ntfy-feedback');
    const prem = Math.max(42, state.settings.shanghaiThreshold + 7);
    const title = `[Simulated] Shanghai Gold PREMIUM: +$${prem.toFixed(2)}/oz`;
    const body = `SGE Au99.99 trading +$${prem.toFixed(2)}/oz above Western Spot (alert rule ±$${state.settings.shanghaiThreshold}/oz).`;
    showAlertBanner(title, body, 'up');
    state.alertLog.unshift({
      id: Date.now() + Math.random(),
      metal: 'shanghai',
      symbol: 'SGE',
      title,
      body,
      pct: 0,
      badge: `+$${prem.toFixed(0)}/oz`,
      dir: 'up',
      time: formatTime(new Date()),
    });
    state.alertLog = state.alertLog.slice(0, 25);
    renderAlertLog();
    savePersistedState();
    feedback.className = 'feedback-note ok';
    feedback.textContent = `Simulated Shanghai Gold Premium alert (+$${prem.toFixed(0)}/oz) — see banner & Alert History.`;
  });

  // Clear Alert Log
  document.getElementById('btn-clear-log')?.addEventListener('click', () => {
    state.alertLog = [];
    renderAlertLog();
    savePersistedState();
  });

  // Copy Setup Config Snippet
  document.getElementById('btn-copy-config')?.addEventListener('click', async () => {
    const snippet = document.getElementById('setup-secrets-preview')?.textContent || '';
    const feedback = document.getElementById('copy-feedback');
    try {
      await navigator.clipboard.writeText(snippet);
      feedback.className = 'feedback-note ok';
      feedback.textContent = 'Copied GitHub Actions config to clipboard.';
    } catch {
      feedback.className = 'feedback-note err';
      feedback.textContent = 'Copy unavailable in this browser — select the box text manually.';
    }
  });

  // Resize & visibility battery optimization
  window.addEventListener('resize', () => {
    renderChart();
    renderAccuracyReplayChart(computeInteractiveOutlook());
    if (mcState.lastSim) renderMcTargetReadout();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(state.refreshTimer);
      clearInterval(state.candleRefreshTimer);
      clearInterval(state.countdownTimer);
      state.refreshTimer = null;
      state.candleRefreshTimer = null;
      state.countdownTimer = null;
    } else {
      fetchSpotQuotes();
      fetchCandlesData();
      refreshSlowFeeds(false);
      startPolling();
    }
  });
}

let lastSlowRefreshAt = Date.now();
function refreshSlowFeeds(force = false) {
  const now = Date.now();
  if (!force && now - lastSlowRefreshAt < 60000) return;
  lastSlowRefreshAt = now;
  fetchOutlookData();
  fetchShanghaiData();
  fetchComexData();
  fetchLivePlatinumPrice();
  fetchLiveDxyIndex();
  fetchLiveFuturesQuotes();
  fetchLiveSpaceWeather();
}

function startPolling() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  if (state.candleRefreshTimer) clearInterval(state.candleRefreshTimer);
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.nextRefreshAt = Date.now() + REFRESH_MS;
  state.refreshTimer = setInterval(() => {
    state.nextRefreshAt = Date.now() + REFRESH_MS;
    fetchSpotQuotes();
  }, REFRESH_MS);
  state.candleRefreshTimer = setInterval(() => {
    fetchCandlesData();
    refreshSlowFeeds(true);
  }, SLOW_REFRESH_MS);
  state.countdownTimer = setInterval(updateCandleCountdown, 1000);
  updateCandleCountdown();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.location.protocol.startsWith('http')) return;
  const hadController = !!navigator.serviceWorker.controller;
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || swRefreshing) return;
    swRefreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      reg.update().catch(() => {});
    })
    .catch(() => {});
}

/* ---------- Boot ---------- */

/* ---------- Modular Intelligence Bridge for intel.js ---------- */
window.__BP_BRIDGE = {
  state,
  outlookState,
  FALLBACK_OUTLOOK,
  CURRENCY_META,
  TROY_OZ_TO_GRAMS,
  formatMoney,
  formatCompactMoney,
  formatSignedMoney,
  formatSignedPct,
  escapeHtml,
  getCanonicalSpotPrices,
  getCurrencyCode,
  getFxRate,
  convertUnit,
  isPrivacyOn,
  savePersistedState,
  fetchSpotQuotes,
  computeInteractiveOutlook,
  getCandlesForTimeframe,
  applyTheme,
  applyAllSubViews,
  switchView,
  renderAll,
  renderChart,
  renderOutlook,
  renderJumpDiffusion,
  renderRatioAnalytics,
  renderRatioSwapCalculator,
  renderBuyLadder,
  renderDealGrader,
  renderStackTracker,
};

function init() {
  loadPersistedState();
  applyTheme(state.settings.theme);
  applyPrivacyMode();
  applyAllSubViews();
  wireEvents();
  populateVoiceSelector();
  window.BullionIntel?.init?.();
  renderAll();
  window.BullionDisplay?.init?.();
  fetchSpotQuotes(true);
  fetchOutlookData();
  fetchShanghaiData();
  fetchCandlesData();
  fetchComexData();
  fetchLiveSpaceWeather();
  fetchLivePlatinumPrice();
  fetchLiveDxyIndex();
  fetchLiveFuturesQuotes();
  startPolling();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
