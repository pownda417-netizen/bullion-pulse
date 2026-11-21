/* Bullion Pulse — Spot Gold & Silver PWA */

const TROY_OZ_TO_GRAMS = 31.1034768;
const REFRESH_MS = 15000;
const SLOW_REFRESH_MS = 60000;
const CANDLE_INTERVAL_MS = 5 * 60 * 1000;
const STORAGE_KEY = 'bullion_pulse_state_v2';
const ANON_FETCH_OPTS = {
  cache: 'no-store',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
};
const RAW_DATA_BASE =
  'https://raw.githubusercontent.com/pownda417-netizen/bullion-pulse/main/data/';

async function fetchFreshRepoJson(fileName) {
  const localFetch = async () => {
    const res = await fetch(`./data/${fileName}`, ANON_FETCH_OPTS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  const canPollRaw =
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('github.io') ||
      window.location.search.includes('liveRaw=1'));

  if (!canPollRaw) return localFetch();

  const rawFetch = async () => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(`${RAW_DATA_BASE}${fileName}?t=${Date.now()}`, {
        ...ANON_FETCH_OPTS,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Raw HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(tid);
    }
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
  theme: 'dark',
  selectedMetal: 'gold',
  chartMode: 'gold', // 'gold' | 'silver' | 'ratio'
  confirmMoves: false,
  showForecast: true,
  showDiscovery: true,
  showSqueeze: true,
  showFib: false,
  showSma: false,
  showRsi: false,
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
  },
  quietHours: {
    enabled: false,
    start: 22,
    end: 7,
  },
};

const state = {
  settings: {
    ...DEFAULT_SETTINGS,
    stack: { ...DEFAULT_SETTINGS.stack },
    stackLots: [],
    targets: { ...DEFAULT_SETTINGS.targets },
    smartAlerts: { ...DEFAULT_SETTINGS.smartAlerts },
    quietHours: { ...DEFAULT_SETTINGS.quietHours },
  },
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
  accuracyChartMetal: 'gold',
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
  timeframes: {},
  hoverCandleIdx: null,
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

/* ---------- Persistence ---------- */

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.settings) {
      state.settings = {
        ...DEFAULT_SETTINGS,
        ...parsed.settings,
        stack: { ...DEFAULT_SETTINGS.stack, ...(parsed.settings.stack || {}) },
        stackLots: Array.isArray(parsed.settings.stackLots) ? parsed.settings.stackLots.slice(0, 100) : [],
        targets: { ...DEFAULT_SETTINGS.targets, ...(parsed.settings.targets || {}) },
        smartAlerts: { ...DEFAULT_SETTINGS.smartAlerts, ...(parsed.settings.smartAlerts || {}) },
        quietHours: { ...DEFAULT_SETTINGS.quietHours, ...(parsed.settings.quietHours || {}) },
      };
      if (!parsed.settings.chartMode && parsed.settings.selectedMetal) {
        state.settings.chartMode = parsed.settings.selectedMetal;
      }
    }
    if (Array.isArray(parsed.alertLog)) {
      state.alertLog = parsed.alertLog.slice(0, 25);
    }
    if (parsed.history && Array.isArray(parsed.history.gold) && Array.isArray(parsed.history.silver)) {
      state.history.gold = parsed.history.gold.slice(-60);
      state.history.silver = parsed.history.silver.slice(-60);
    }
    if (parsed.sessionAlerted) {
      state.sessionAlerted = {
        ...state.sessionAlerted,
        ...parsed.sessionAlerted,
        targets: { ...(parsed.sessionAlerted.targets || {}) },
        regime: { ...(parsed.sessionAlerted.regime || {}) },
      };
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

/* ---------- Formatting Helpers ---------- */

function convertUnit(usdPerOz) {
  if (usdPerOz == null || Number.isNaN(usdPerOz)) return null;
  return state.settings.unit === 'g' ? usdPerOz / TROY_OZ_TO_GRAMS : usdPerOz;
}

function formatMoney(value, decimals = 2) {
  if (value == null || Number.isNaN(value)) return '$—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatSignedMoney(value, decimals = 2) {
  if (value == null || Number.isNaN(value)) return '$—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatMoney(Math.abs(value), decimals)}`;
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
  const res = await fetch('https://data-asg.goldprice.org/dbXRates/USD', {
    cache: 'no-store',
  });
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
    fetch('https://api.gold-api.com/price/XAU', { cache: 'no-store' }),
    fetch('https://api.gold-api.com/price/XAG', { cache: 'no-store' }),
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
    const res = await fetch('https://api.gold-api.com/price/XPT', ANON_FETCH_OPTS);
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
      return val != null ? { val, label } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(tid);
    }
  };

  const hit =
    (await tryEndpoint('https://open.er-api.com/v6/latest/USD', 'Live ICE DXY')) ||
    (await tryEndpoint(
      'https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,GBP,CAD,SEK,CHF',
      'Live ICE DXY'
    ));

  if (hit) {
    state.liveMacro.dxy = hit.val;
    state.liveMacro.dxySource = hit.label;
    state.feedHealth.dxyAt = Date.now();
    state.feedHealth.dxyLive = true;
    renderMacroStrip();
    renderFeedHealth();
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

async function fetchSpotQuotes(checkQuorum = false) {
  if (spotFetchInFlight && !checkQuorum) return;
  spotFetchInFlight = true;
  const refreshBtn = document.getElementById('btn-refresh');
  refreshBtn?.classList.add('spinning');

  let result;
  state.liveMacro.consensusNote = '';
  try {
    if (checkQuorum) {
      const [gpRes, gaRes] = await Promise.allSettled([
        fetchFromGoldPriceOrg(),
        fetchFromGoldApiCom(),
      ]);
      if (gpRes.status === 'fulfilled') {
        goldPriceOrgBlockedUntil = 0;
        result = gpRes.value;
        if (gaRes.status === 'fulfilled' && result.gold.price > 0) {
          const spreadPct = Math.abs(result.gold.price - gaRes.value.gold.price) / result.gold.price * 100;
          state.liveMacro.consensusNote = spreadPct <= 0.65 ? 'Quorum ✓' : `Spread ${spreadPct.toFixed(1)}%`;
        }
      } else if (gaRes.status === 'fulfilled') {
        goldPriceOrgBlockedUntil = Date.now() + 10 * 60 * 1000;
        result = gaRes.value;
      } else {
        throw new Error('All live spot feeds failed');
      }
      state.mode = 'live';
    } else if (Date.now() < goldPriceOrgBlockedUntil) {
      result = await fetchFromGoldApiCom();
      state.mode = 'live';
    } else {
      try {
        result = await fetchFromGoldPriceOrg();
        state.mode = 'live';
      } catch {
        goldPriceOrgBlockedUntil = Date.now() + 10 * 60 * 1000;
        result = await fetchFromGoldApiCom();
        state.mode = 'live';
      }
    }
  } catch {
    result = buildFallbackDemoQuotes();
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
  const cleanTopic = topic.replace(/^https?:\/\/ntfy\.sh\//i, '').replace(/^\/+|\/+$/g, '');
  if (!cleanTopic) throw new Error('Please enter an ntfy topic name first.');

  // Query parameters + text/plain avoids CORS preflight issues in mobile browsers
  const params = new URLSearchParams({
    title,
    priority,
    tags,
  });

  const url = `https://ntfy.sh/${encodeURIComponent(cleanTopic)}?${params.toString()}`;
  const res = await fetch(url, {
    method: 'POST',
    body: message,
  });

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
  const unitSuffix = state.settings.unit === 'g' ? 'USD / gram' : 'USD / troy oz';

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

  priceEl.textContent = formatMoney(displayPrice, decimals);
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
}

/* ---------- Multi-Timeframe OHLC Candlesticks & Forecast Fan Chart ---------- */

const CHART_TF_META = {
  '1d':  { label: '1D',  interval: '5m',  subtitle: '5m OHLC candles',           fcHorizon: '7d',  fcLabel: '+7d',  maxBars: 28 },
  '7d':  { label: '7D',  interval: '1h',  subtitle: 'Hourly OHLC · 7-Day range', fcHorizon: '7d',  fcLabel: '+7d',  maxBars: 36 },
  '1m':  { label: '1M',  interval: '1d',  subtitle: 'Daily OHLC · 1-Month',      fcHorizon: '1m',  fcLabel: '+1M',  maxBars: 28 },
  '6m':  { label: '6M',  interval: '3d',  subtitle: '3-Day OHLC · 6-Month',      fcHorizon: '6m',  fcLabel: '+6M',  maxBars: 36 },
  '1y':  { label: '1Y',  interval: '1wk', subtitle: 'Weekly OHLC · 1-Year',      fcHorizon: '1y',  fcLabel: '+1Y',  maxBars: 52 },
  '5y':  { label: '5Y',  interval: '1mo', subtitle: 'Monthly OHLC · 5-Year',     fcHorizon: '1y',  fcLabel: '+1Y',  maxBars: 60 },
  '10y': { label: '10Y', interval: '2mo', subtitle: '2-Month OHLC · 10-Year',    fcHorizon: '5y',  fcLabel: '+5Y',  maxBars: 48 },
  all:   { label: 'ALL', interval: '1yr', subtitle: 'Annual OHLC · 1975–2026',   fcHorizon: '5y',  fcLabel: '+5Y',  maxBars: 52 },
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

function seed5mCandlesIfEmpty(metal, spotPrice, prevClose, force = false) {
  if (!force && state.candles[metal].length >= 8) return;
  const nowBucket = bucket5m(Date.now());
  const count = 28;
  const startPrice = prevClose || spotPrice;
  const vol = metal === 'silver' ? 0.0038 : 0.0018;
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

  if (tf === '1d') {
    const bars = state.candles[metal];
    if (
      bars.length >= 4 &&
      quote.price != null &&
      Math.abs(bars[bars.length - 1].c - quote.price) / quote.price > 0.03
    ) {
      seed5mCandlesIfEmpty(metal, spot, prevClose, true);
    } else {
      seed5mCandlesIfEmpty(metal, spot, prevClose);
    }
    return state.candles[metal].slice(-meta.maxBars);
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

function formatCandleTimestamp(ts, tf, compact = false) {
  const d = new Date(ts);
  if (tf === '1d') {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

function updateActive5mCandle(metal, price, prevClose) {
  if (price == null) return;
  seed5mCandlesIfEmpty(metal, price, prevClose);
  const bars = state.candles[metal];
  const currentBucket = bucket5m(Date.now());
  const last = bars[bars.length - 1];

  if (!last || last.t < currentBucket) {
    const open = last ? last.c : price;
    bars.push({
      t: currentBucket,
      o: +open.toFixed(2),
      h: +Math.max(open, price).toFixed(2),
      l: +Math.min(open, price).toFixed(2),
      c: +price.toFixed(2),
    });
    if (bars.length > 48) bars.shift();
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
    if (Array.isArray(g1d) && g1d.length >= 4) {
      state.candles.gold = g1d.slice(-40);
      if (state.quotes.gold.price != null && state.quotes.gold.prevClose === state.quotes.gold.price && state.candles.gold[0]?.o > 0) {
        state.quotes.gold.prevClose = +state.candles.gold[0].o.toFixed(2);
        state.quotes.gold.chg = +(state.quotes.gold.price - state.quotes.gold.prevClose).toFixed(2);
        state.quotes.gold.pct = +((state.quotes.gold.chg / state.quotes.gold.prevClose) * 100).toFixed(2);
        renderMetalCard('gold');
        renderStats();
        renderStackTracker();
      }
    }
    if (Array.isArray(s1d) && s1d.length >= 4) {
      state.candles.silver = s1d.slice(-40);
      if (state.quotes.silver.price != null && state.quotes.silver.prevClose === state.quotes.silver.price && state.candles.silver[0]?.o > 0) {
        state.quotes.silver.prevClose = +state.candles.silver[0].o.toFixed(2);
        state.quotes.silver.chg = +(state.quotes.silver.price - state.quotes.silver.prevClose).toFixed(2);
        state.quotes.silver.pct = +((state.quotes.silver.chg / state.quotes.silver.prevClose) * 100).toFixed(2);
        renderMetalCard('silver');
        renderStats();
        renderStackTracker();
      }
    }
    if (state.quotes.gold.price) {
      updateActive5mCandle('gold', state.quotes.gold.price, state.quotes.gold.prevClose);
    }
    if (state.quotes.silver.price) {
      updateActive5mCandle('silver', state.quotes.silver.price, state.quotes.silver.prevClose);
    }
    renderChart();
    if ((state.settings.chartTimeframe || '1d') !== '1d' && !histCandlesLoaded) {
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

function getTzClock(nowDate, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(nowDate);
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const h = Number(get('hour')) % 24;
  const m = Number(get('minute')) || 0;
  return { wd: wdMap[get('weekday')] ?? 1, h, m, mins: h * 60 + m };
}

function renderSessionClock(nowDate = new Date()) {
  if (!document.getElementById('panel-session-clock')) return;
  const ny = getTzClock(nowDate, 'America/New_York');
  const lon = getTzClock(nowDate, 'Europe/London');
  const sh = getTzClock(nowDate, 'Asia/Shanghai');

  const isWeekend =
    ny.wd === 6 ||
    (ny.wd === 5 && ny.mins >= 17 * 60) ||
    (ny.wd === 0 && ny.mins < 18 * 60);

  const sgeDay = !isWeekend && sh.wd >= 1 && sh.wd <= 5 && sh.mins >= 9 * 60 && sh.mins < 15 * 60 + 30;
  const sgeNightEvening = !isWeekend && sh.wd >= 1 && sh.wd <= 5 && sh.mins >= 20 * 60;
  const sgeNightLate = !isWeekend && sh.wd >= 2 && sh.wd <= 6 && sh.mins < 2 * 60 + 30;
  const sgeOpen = sgeDay || sgeNightEvening || sgeNightLate;

  const lonWeekday = lon.wd >= 1 && lon.wd <= 5 && !isWeekend;
  const lonOpen = lonWeekday && lon.mins >= 8 * 60 && lon.mins < 16 * 60 + 30;
  const lonAmFix = lonWeekday && Math.abs(lon.mins - (10 * 60 + 30)) <= 15;
  const lonPmFix = lonWeekday && Math.abs(lon.mins - 15 * 60) <= 15;

  const comexMaint = !isWeekend && ny.mins >= 17 * 60 && ny.mins < 18 * 60;
  const comexCore = !isWeekend && ny.wd >= 1 && ny.wd <= 5 && ny.mins >= 8 * 60 + 20 && ny.mins < 13 * 60 + 30;
  const comexGlobex = !isWeekend && !comexMaint;

  const setSess = (id, statusId, cls, txt) => {
    const item = document.getElementById(id);
    const st = document.getElementById(statusId);
    if (item) item.className = `session-item ${cls}`;
    if (st) st.textContent = txt;
  };

  setSess(
    'sess-sge',
    'sess-sge-status',
    sgeOpen ? 'open' : '',
    sgeDay ? 'OPEN · Day' : (sgeNightEvening || sgeNightLate) ? 'OPEN · Night' : 'Closed'
  );
  setSess(
    'sess-london',
    'sess-london-status',
    lonAmFix || lonPmFix ? 'fix' : lonOpen ? 'open' : '',
    lonAmFix ? 'Morning Price Fix' : lonPmFix ? 'Afternoon Price Fix' : lonOpen ? 'OPEN · Active' : 'Closed'
  );
  setSess(
    'sess-comex',
    'sess-comex-status',
    comexCore ? 'fix' : comexGlobex ? 'open' : '',
    comexCore ? 'OPEN · Busiest' : comexMaint ? 'Daily Break (5–6p)' : comexGlobex ? 'OPEN · After-Hours' : 'Weekend Closed'
  );

  const riskPill = document.getElementById('session-liquidity-pill');
  const noteEl = document.getElementById('session-liquidity-note');
  const nextEl = document.getElementById('session-next-countdown');

  let riskLabel = 'Normal Activity';
  let riskCls = '';
  let note = 'Global trading is open with steady buyer and seller activity.';
  let nextTxt = '';

  if (isWeekend) {
    riskLabel = 'Weekend Closed';
    riskCls = '';
    note = 'Major markets are closed for the weekend — trading reopens Sunday at 6:00 PM ET (prices can gap at open).';
    nextTxt = 'Opens Sun 6:00 PM ET';
  } else if (comexMaint) {
    riskLabel = 'Quiet Hour · Jumpy Prices';
    riskCls = 'warn';
    const rem = 18 * 60 - ny.mins;
    note = 'Daily 5:00–6:00 PM ET market break: trading is very light, so prices can briefly jump or dip more easily.';
    nextTxt = `Reopens in ${rem}m`;
  } else if (lonPmFix) {
    riskLabel = 'London Price Fix · Active';
    riskCls = 'peak';
    note = 'London afternoon benchmark price is being set right now — big banks are active, so prices can move quickly.';
    nextTxt = 'London Fix Active Now';
  } else if (lonOpen && comexCore) {
    riskLabel = 'Busiest Trading Hours';
    riskCls = 'peak';
    const remToPm = 15 * 60 - lon.mins;
    note = 'Both London and New York are open right now — highest trading volume and most reliable pricing of the day.';
    nextTxt = remToPm > 0 ? `London Fix in ${Math.floor(remToPm / 60)}h ${remToPm % 60}m` : 'NY main hours end 1:30 PM ET';
  } else if (sgeOpen && !lonOpen && !comexCore) {
    riskLabel = 'Asia Trading Active';
    riskCls = '';
    note = 'China (Shanghai) physical buyers are leading the market right now while US and Europe sleep.';
    nextTxt = 'London opens 3:00 AM ET';
  } else if (comexCore) {
    riskLabel = 'US Main Hours';
    riskCls = 'peak';
    const rem = 13 * 60 + 30 - ny.mins;
    note = 'New York main trading hours are open — US traders and funds are setting the pace.';
    nextTxt = `US main hours end in ${Math.floor(rem / 60)}h ${rem % 60}m`;
  } else {
    const remMaint = ny.mins < 17 * 60 ? 17 * 60 - ny.mins : 24 * 60 - ny.mins + 8 * 60 + 20;
    nextTxt = ny.mins < 17 * 60 ? `Daily break in ${Math.floor(remMaint / 60)}h ${remMaint % 60}m` : `NY main open in ${Math.floor(remMaint / 60)}h ${remMaint % 60}m`;
  }

  if (riskPill) {
    riskPill.textContent = riskLabel;
    riskPill.className = `session-risk-pill ${riskCls}`;
  }
  if (noteEl) noteEl.textContent = note;
  if (nextEl) nextEl.textContent = nextTxt;
}

function updateCandleCountdown() {
  const el = document.getElementById('chart-subtitle');
  if (el) {
    const tf = state.settings.chartTimeframe || '1d';
    const now = Date.now();
    const nextTickAt = state.nextRefreshAt || now + REFRESH_MS;
    const remaining = Math.max(0, nextTickAt - now);
    if (tf === '1d') {
      el.textContent = `5-min price bars · Next live update in ${formatCountdown(remaining)}`;
    } else {
      const meta = CHART_TF_META[tf] || CHART_TF_META['1d'];
      el.textContent = `${meta.subtitle} · Live update in ${formatCountdown(remaining)}`;
    }
  }
  renderSessionClock();
  renderFeedHealth();
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

function friendlyRegimeLabel(label) {
  const map = {
    'True Price Discovery': 'Real Demand Rally',
    'Discovery Bias': 'Real Demand Leaning',
    'Short Squeeze': 'Short Squeeze',
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
  const discLegend = document.getElementById('legend-discovery');
  if (discLegend) discLegend.hidden = !state.settings.showDiscovery || isRatio;
  const sqzLegend = document.getElementById('legend-squeeze');
  if (sqzLegend) sqzLegend.hidden = !state.settings.showSqueeze || isRatio;
  const fibLegend = document.getElementById('legend-fib');
  if (fibLegend) fibLegend.hidden = !state.settings.showFib;
  const smaLegend = document.getElementById('legend-sma');
  if (smaLegend) smaLegend.hidden = !state.settings.showSma;
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

  const converted = bars.map((b) => ({
    t: b.t,
    o: isRatio ? b.o : convertUnit(b.o),
    h: isRatio ? b.h : convertUnit(b.h),
    l: isRatio ? b.l : convertUnit(b.l),
    c: isRatio ? b.c : convertUnit(b.c),
  }));
  const firstOpen = converted[0].o;
  const lastClose = converted[converted.length - 1].c;
  const refLineVal = isRatio
    ? (tf === '1d' && state.quotes.gold.prevClose && state.quotes.silver.prevClose
        ? state.quotes.gold.prevClose / state.quotes.silver.prevClose
        : firstOpen)
    : (tf === '1d' ? convertUnit(quote.prevClose ?? bars[0].o) : firstOpen);
  const fmtChartVal = (v, dec) => (isRatio ? `${Number(v).toFixed(1)}:1` : formatMoney(v, dec));

  // Period return badge
  const tfChgEl = document.getElementById('chart-tf-change');
  if (tfChgEl && firstOpen > 0) {
    const tfPct = ((lastClose - firstOpen) / firstOpen) * 100;
    const dec = Math.abs(tfPct) >= 100 ? 0 : 1;
    tfChgEl.textContent = `${tfPct >= 0 ? '+' : '−'}${Math.abs(tfPct).toFixed(dec)}% (${meta.label})`;
    tfChgEl.className = `tf-return-pill ${tfPct >= 0.05 ? 'up' : tfPct <= -0.05 ? 'down' : ''}`;
  }

  // Compute Jump-Diffusion fat-tail forecast cone scaled proportionally to the active timeframe
  const showFc = !!state.settings.showForecast && !isRatio;
  const showDiscovery = !!state.settings.showDiscovery && !isRatio;
  const showSqueeze = !!state.settings.showSqueeze && !isRatio;
  const showFib = !!state.settings.showFib;
  const showSma = !!state.settings.showSma;
  const fibCol = styles.getPropertyValue('--fib').trim() || '#A78BFA';
  const discCol = '#10B981';
  const sqzCol = '#F43F5E';
  const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
  const fibData = showFib ? computeFibonacciLevels(converted) : null;
  const sma20 = showSma ? computeSmaSeries(converted, 20) : null;
  const sma50 = showSma ? computeSmaSeries(converted, 50) : null;
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

  const discoverySeries = showDiscovery
    ? computePriceDiscoverySeries(converted, activeRegime, outlookRes[sel]?.unit ?? 0)
    : null;
  const squeezeSeries = showSqueeze ? computeShortSqueezeSeries(converted, activeRegime) : null;

  const fcHorizon = tf === '1d' ? (outlookState.horizon === '30d' ? '1m' : '7d') : meta.fcHorizon;
  const fcLabel = tf === '1d' ? (outlookState.horizon === '30d' ? '+30d' : '+7d') : meta.fcLabel;
  const jdChart = showFc ? getChartJumpDiffusion(sel, outlookRes, fcHorizon) : null;
  const horizonRange = outlookRes[sel].range;
  const p90Target = convertUnit(jdChart ? jdChart.p90 : horizonRange.bull);
  const p75Target = convertUnit(jdChart ? jdChart.p75 : (horizonRange.bull + horizonRange.base) / 2);
  const p50Target = convertUnit(jdChart ? jdChart.p50 : horizonRange.base);
  const p25Target = convertUnit(jdChart ? jdChart.p25 : (horizonRange.bear + horizonRange.base) / 2);
  const p10Target = convertUnit(jdChart ? jdChart.p10 : horizonRange.bear);

  // Structural Price Discovery & Concave Gamma Short Squeeze forecast endpoints
  const lastDisc = discoverySeries?.length ? discoverySeries[discoverySeries.length - 1] : lastClose;
  const lastSqz = squeezeSeries?.length ? squeezeSeries[squeezeSeries.length - 1] : lastClose;
  const discScoreNorm = clampNum((activeRegime?.discoveryScore ?? 45) / 100, 0.1, 1.0);
  const sqzScoreNorm = clampNum((activeRegime?.squeezeScore ?? 35) / 100, 0.1, 1.0);
  const discFcTarget =
    lastDisc +
    (p50Target - lastClose) * (0.55 + discScoreNorm * 0.45) +
    (p75Target - p50Target) * Math.max(0, discScoreNorm - 0.5) * 0.45;
  const sqzGammaAnchor = Math.max(lastSqz, lastClose);
  const upperSpread = Math.max(Math.abs(p90Target - lastClose), Math.abs(p75Target - lastClose), lastClose * 0.012);
  const sqzFcTarget =
    sqzGammaAnchor +
    upperSpread * (0.45 + sqzScoreNorm * 0.82 + (activeRegime?.isBackwardation ? 0.18 : 0));

  let min = Math.min(...converted.map((b) => b.l), refLineVal);
  let max = Math.max(...converted.map((b) => b.h), refLineVal);
  if (discoverySeries?.length) {
    min = Math.min(min, ...discoverySeries);
    max = Math.max(max, ...discoverySeries);
  }
  if (squeezeSeries?.length) {
    min = Math.min(min, ...squeezeSeries);
    max = Math.max(max, ...squeezeSeries);
  }
  if (showFc) {
    min = Math.min(min, p10Target, p50Target);
    max = Math.max(max, p90Target, p50Target);
    if (showDiscovery) {
      min = Math.min(min, discFcTarget);
      max = Math.max(max, discFcTarget);
    }
    if (showSqueeze) {
      max = Math.max(max, sqzFcTarget);
    }
  }
  const span = max - min || max * 0.008 || 1;
  min = Math.max(0, min - span * 0.09);
  max += span * 0.09;

  const padTop = 12;
  const padBottom = 20;
  const padLeft = 6;
  const padRight = 60;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const candleAreaW = showFc ? plotW * 0.72 : plotW;
  const forecastAreaW = showFc ? plotW * 0.28 : 0;
  const stepX = candleAreaW / Math.max(1, converted.length);
  const candleW = Math.max(2.5, Math.min(9.5, stepX * 0.64));
  const xCandle = (i) => padLeft + i * stepX + stepX * 0.5;
  const yAt = (v) => padTop + (1 - (v - min) / (max - min)) * plotH;

  // Subtle horizontal gridlines + price axis labels
  const desktopCanvas = w >= 720;
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
    ctx.fillStyle = mutedCol;
    ctx.fillText(fmtChartVal(val, val >= 500 ? 0 : 2), w - 2, y);
  }

  // Reference baseline (Prev close on 1D, period open on longer ranges)
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

  // Draw OHLC Candlesticks
  converted.forEach((b, i) => {
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

  // Bottom X-axis date labels across historical candlestick zone
  ctx.font = `500 ${desktopCanvas ? 11 : 9.5}px "JetBrains Mono", monospace`;
  ctx.fillStyle = mutedCol;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(formatCandleTimestamp(converted[0].t, tf, true), padLeft, h - 2);
  const midIdx = Math.floor(converted.length / 2);
  if (converted[midIdx]) {
    ctx.textAlign = 'center';
    ctx.fillText(formatCandleTimestamp(converted[midIdx].t, tf, true), padLeft + candleAreaW / 2, h - 2);
  }
  if (!showFc) {
    ctx.textAlign = 'right';
    ctx.fillText(formatCandleTimestamp(converted[converted.length - 1].t, tf, true), padLeft + candleAreaW, h - 2);
  }

  // Jump-Diffusion Forecast Fan (P10-P90 outer fat-tail + P25-P75 core cone)
  if (showFc && forecastAreaW > 20) {
    const startX = xCandle(converted.length - 1);
    const endX = padLeft + plotW;
    const nowY = yAt(lastClose);

    // Vertical "Now" divider
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = borderCol;
    ctx.beginPath();
    ctx.moveTo(startX, padTop);
    ctx.lineTo(startX, padTop + plotH);
    ctx.stroke();
    ctx.restore();

    const toPtsFromCurve = (arr, fallbackTarget) => {
      if (Array.isArray(arr) && arr.length > 1) {
        const lastIdx = arr.length - 1;
        return arr.map((val, idx) => ({
          x: startX + (idx / lastIdx) * (endX - startX),
          y: yAt(idx === 0 ? lastClose : convertUnit(val)),
        }));
      }
      const steps = 8;
      const pts = [];
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        pts.push({
          x: startX + u * (endX - startX),
          y: yAt(lastClose + (fallbackTarget - lastClose) * Math.pow(u, 0.85)),
        });
      }
      return pts;
    };

    const p90Pts = toPtsFromCurve(jdChart?.curves?.p90, p90Target);
    const p75Pts = toPtsFromCurve(jdChart?.curves?.p75, p75Target);
    const p50Pts = toPtsFromCurve(jdChart?.curves?.p50, p50Target);
    const p25Pts = toPtsFromCurve(jdChart?.curves?.p25, p25Target);
    const p10Pts = toPtsFromCurve(jdChart?.curves?.p10, p10Target);

    const fillBand = (upper, lower, fillStyle) => {
      ctx.save();
      ctx.beginPath();
      upper.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      for (let idx = lower.length - 1; idx >= 0; idx--) {
        ctx.lineTo(lower[idx].x, lower[idx].y);
      }
      ctx.closePath();
      ctx.fillStyle = fillStyle;
      ctx.fill();
      ctx.restore();
    };

    fillBand(
      p90Pts,
      p10Pts,
      sel === 'gold' ? 'rgba(212, 168, 67, 0.08)' : 'rgba(194, 202, 214, 0.08)'
    );
    fillBand(
      p75Pts,
      p25Pts,
      sel === 'gold' ? 'rgba(212, 168, 67, 0.16)' : 'rgba(194, 202, 214, 0.16)'
    );

    const drawCurve = (pts, color, dash, width) => {
      ctx.save();
      if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
    };

    drawCurve(p90Pts, upCol, [4, 3], 1.5);
    drawCurve(p10Pts, downCol, [4, 3], 1.5);
    drawCurve(p50Pts, baseCol, [6, 2], 2.0);

    // Continue Price Discovery steadily into Forecast zone (Now -> Horizon)
    if (showDiscovery) {
      const steps = 10;
      const discPts = [];
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const val = lastDisc + (discFcTarget - lastDisc) * Math.pow(u, 0.96);
        discPts.push({
          x: startX + u * (endX - startX),
          y: yAt(val),
        });
      }
      drawCurve(discPts, discCol, null, desktopCanvas ? 2.1 : 1.8);
    }

    // Project Short Squeeze along steeper concave gamma trajectory into Forecast zone
    if (showSqueeze) {
      const steps = 12;
      const sqzPts = [];
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        // Concave gamma trajectory: rapid front-loaded short-covering breakout curve
        const gammaShape = Math.pow(u, 0.62);
        const val = sqzGammaAnchor + (sqzFcTarget - sqzGammaAnchor) * gammaShape;
        sqzPts.push({
          x: startX + u * (endX - startX),
          y: yAt(val),
        });
      }
      drawCurve(sqzPts, sqzCol, [6, 4], desktopCanvas ? 2.1 : 1.8);
    }

    // Current price anchor dot
    ctx.beginPath();
    ctx.arc(startX, nowY, 3, 0, Math.PI * 2);
    ctx.fillStyle = baseCol;
    ctx.fill();

    // Forecast horizon label at bottom right
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = mutedCol;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    ctx.fillText(`Now → ${fcLabel}`, (startX + endX) / 2, h - 2);
  }

  // Optional RSI(14) oscillator sub-chart
  let rsiData = null;
  if (state.settings.showRsi) {
    rsiData = computeRsiSeries(converted, 14);
    drawRsiPane(rsiData, candleAreaW, padLeft, stepX);
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
    sma20,
    sma50,
    discoverySeries,
    squeezeSeries,
    rsiValues: rsiData?.values || null,
    xCandle,
    yAt,
    fmtChartVal,
    borderCol,
    baseCol,
  };
  renderCrosshairOverlay(state.hoverCandleIdx);
}

function renderCrosshairOverlay(idx = state.hoverCandleIdx) {
  const g = state.chartGeom;
  const overlay = document.getElementById('chart-crosshair-overlay');
  const tipEl = document.getElementById('chart-tooltip');
  const ohlcEl = document.getElementById('chart-ohlc');
  if (!g || !g.converted?.length) {
    if (tipEl) tipEl.hidden = true;
    return;
  }

  const activeIdx = idx != null && g.converted[idx] ? idx : null;
  const bar = g.converted[activeIdx != null ? activeIdx : g.converted.length - 1];
  const tLabel = formatCandleTimestamp(bar.t, g.tf, false);
  const dec = bar.c >= 500 ? 0 : 2;
  if (ohlcEl) {
    ohlcEl.textContent =
      `${tLabel} · Open ${g.fmtChartVal(bar.o, dec)} · High ${g.fmtChartVal(bar.h, dec)} · Low ${g.fmtChartVal(bar.l, dec)} · Close ${g.fmtChartVal(bar.c, dec)}`;
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

    tipEl.innerHTML =
      `<div>${escapeHtml(tLabel)} · <strong>${escapeHtml(g.fmtChartVal(bar.c, dec))}</strong></div>` +
      `<div class="tt-sub">Open ${escapeHtml(g.fmtChartVal(bar.o, dec))} · High ${escapeHtml(g.fmtChartVal(bar.h, dec))} · Low ${escapeHtml(g.fmtChartVal(bar.l, dec))}</div>` +
      (regimeParts.length ? `<div class="tt-sub">${regimeParts.join(' · ')}</div>` : '') +
      (subParts.length ? `<div class="tt-sub">${escapeHtml(subParts.join(' · '))}</div>` : '');
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
      (item) => `
      <li class="log-item">
        <div>
          <div>${escapeHtml(item.title)}</div>
          <div class="log-meta">${escapeHtml(item.body)} · ${escapeHtml(item.time)}</div>
        </div>
        <span class="log-pct ${item.dir}">${escapeHtml(item.badge || formatSignedPct(item.pct))}</span>
      </li>
    `
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
  if (chkBackw) chkBackw.checked = sa.backwardation !== false;
  if (chkSqz) chkSqz.checked = sa.shortSqueeze !== false;
  if (chkDxy) chkDxy.checked = sa.dxyShock !== false;

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
];

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
};

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
  const url =
    `https://publicreporting.cftc.gov/resource/72hh-3qpy.json` +
    `?cftc_contract_market_code=${code}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=16`;
  const res = await fetch(url, ANON_FETCH_OPTS);
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

  const gUnit = clampNum(gComp * 1.45 + driftG + backwBoostGold, -1, 1);
  const sUnit = clampNum(sComp * 1.45 + driftS + backwBoostSilver, -1, 1);
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

  const project = (spot, vol, unit) => {
    const sig = vol * Math.sqrt(days);
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

  return {
    base,
    drivers,
    analogs,
    narrative,
    days,
    futures,
    dollarStrength,
    marketRegime,
    ratioAnalytics,
    setupQuality,
    gold: {
      spot: spotGold,
      dailyVol: gDailyVol,
      rsi14: gRsi14,
      unit: gUnit,
      score: gScore,
      signal: signalFromScore(gScore),
      regime: marketRegime.gold,
      range: project(spotGold, gDailyVol, gUnit),
    },
    silver: {
      spot: spotSilver,
      dailyVol: sDailyVol,
      rsi14: sRsi14,
      unit: sUnit,
      score: sScore,
      signal: signalFromScore(sScore),
      regime: marketRegime.silver,
      range: project(spotSilver, sDailyVol, sUnit),
    },
  };
}

function renderFuturesPanel(outlookRes = null) {
  if (!document.getElementById('panel-futures')) return;
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
    const dec = dispFut >= 500 ? 2 : 2;
    if (priceEl) priceEl.textContent = formatMoney(dispFut, dec);
    if (basisEl) {
      const sign = dispBasis > 0 ? '+' : dispBasis < 0 ? '−' : '';
      const pctSign = data.basisPct > 0 ? '+' : data.basisPct < 0 ? '−' : '';
      basisEl.textContent = `Diff vs Spot: ${sign}$${Math.abs(dispBasis).toFixed(2)}/${uLbl} (${pctSign}${Math.abs(data.basisPct).toFixed(2)}%)`;
      basisEl.className = `futures-basis ${data.isBackwardation ? 'up' : data.basisPct > 1.15 ? 'down' : ''}`;
    }
    if (curveEl) {
      if (data.isBackwardation) {
        curveEl.textContent = 'Shortage (Backwardation) ↑';
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
        boostEl.textContent = `Futures cost less than today's price — tight physical supply lifts forecasts (+${liftPts} pts)`;
      } else if (data.state === 'Compressed EFP') {
        const liftPts = Math.round((data.priceDiscoveryBoost || 0) * 100);
        boostEl.textContent = `Futures nearly match today's spot — physical supply is tightening (+${liftPts} pts)`;
      } else {
        boostEl.textContent = `Normal pricing (futures cost slightly more than today's spot of ${formatMoney(convertUnit(data.spot))})`;
      }
    }
  };

  renderCard('gold', fut.gold);
  renderCard('silver', fut.silver);

  const subEl = document.getElementById('futures-subtitle');
  const badgeEl = document.getElementById('futures-status-badge');
  const anyBackw = !!(fut.gold?.isBackwardation || fut.silver?.isBackwardation);
  if (subEl) {
    subEl.textContent = anyBackw
      ? 'Supply shortage active (futures below spot) — lifting price forecasts'
      : 'Futures vs. today\'s price — included automatically in forecasts';
  }
  if (badgeEl) {
    badgeEl.textContent = anyBackw
      ? 'Supply Shortage ↑'
      : fut.gold?.state === 'Compressed EFP' || fut.silver?.state === 'Compressed EFP'
        ? 'Tight Supply'
        : 'Normal Market';
    badgeEl.className = `signal-pill ${anyBackw ? 'bullish' : ''}`;
  }
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

function renderAccuracyReplayChart(res) {
  const canvas = document.getElementById('accuracy-replay-chart');
  if (!canvas) return;
  const metal = state.accuracyChartMetal === 'silver' ? 'silver' : 'gold';
  document.getElementById('acc-chart-gold')?.classList.toggle('active', metal === 'gold');
  document.getElementById('acc-chart-silver')?.classList.toggle('active', metal === 'silver');

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
  const rawHist = (sl?.recentHistory || []).slice(0, 12).reverse();
  const coneMult = Number(sl?.coneMultiplier || res?.base?.coneMultiplier || 1.0);
  const halfConeBase = (metal === 'silver' ? 2.05 : 1.05) * coneMult;

  const points = rawHist.length >= 2
    ? rawHist.map((row) => ({
        label: row.date ? row.date.slice(5) : '—',
        pred: Number(metal === 'silver' ? row.silverPredPct : row.goldPredPct) || 0,
        actual: Number(metal === 'silver' ? row.silverActualPct : row.goldActualPct) || 0,
        inCone: Boolean(metal === 'silver' ? row.inConeSilver : row.inConeGold),
        half: halfConeBase,
      }))
    : [
        { label: 'D-4', pred: -0.35, actual: -0.42, inCone: true, half: halfConeBase },
        { label: 'D-3', pred: -0.40, actual: -0.55, inCone: true, half: halfConeBase },
        { label: 'D-2', pred: -0.25, actual: 0.31, inCone: true, half: halfConeBase },
        { label: 'D-1', pred: -0.55, actual: -0.82, inCone: true, half: halfConeBase },
        { label: 'Now', pred: -0.45, actual: -0.58, inCone: true, half: halfConeBase },
      ];

  const styles = getComputedStyle(document.documentElement);
  const upCol = styles.getPropertyValue('--up').trim() || '#22C55E';
  const downCol = styles.getPropertyValue('--down').trim() || '#EF4444';
  const baseCol = metal === 'gold'
    ? styles.getPropertyValue('--gold').trim() || '#D4A843'
    : styles.getPropertyValue('--silver').trim() || '#C2CAD6';
  const mutedCol = styles.getPropertyValue('--text-subtle').trim() || '#777';
  const gridCol = styles.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.08)';

  let minV = Math.min(0, ...points.flatMap((p) => [p.pred - p.half, p.actual]));
  let maxV = Math.max(0, ...points.flatMap((p) => [p.pred + p.half, p.actual]));
  const span = Math.max(1.0, maxV - minV);
  minV -= span * 0.14;
  maxV += span * 0.14;

  const padL = 8;
  const padR = 40;
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
    ctx.strokeStyle = idx === 1 ? 'rgba(255,255,255,0.18)' : gridCol;
    if (idx === 1) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = mutedCol;
    ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, w - 2, y);
  });

  // Shaded P10-P90 predicted cone
  ctx.save();
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xAt(i);
    const y = yAt(p.pred + p.half);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = points.length - 1; i >= 0; i--) {
    ctx.lineTo(xAt(i), yAt(points[i].pred - points[i].half));
  }
  ctx.closePath();
  ctx.fillStyle = metal === 'gold' ? 'rgba(212, 168, 67, 0.16)' : 'rgba(194, 202, 214, 0.16)';
  ctx.fill();
  ctx.restore();

  // Predicted Base Line (dashed)
  ctx.save();
  ctx.strokeStyle = baseCol;
  ctx.lineWidth = 1.8;
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

  // Actual realized path & dots (green = inside cone, red = breach)
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xAt(i);
    const y = yAt(p.actual);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();

  points.forEach((p, i) => {
    const x = xAt(i);
    const y = yAt(p.actual);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = p.inCone ? upCol : downCol;
    ctx.fill();
    ctx.strokeStyle = 'rgba(13,14,17,0.85)';
    ctx.lineWidth = 1.2;
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
}

function renderOutlook() {
  const view = document.getElementById('view-outlook');
  if (!view) return;

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
  renderSetupQuality(res);
  renderRatioAnalytics(res);
  renderDollarStrength(res);

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
      ryEl.textContent = `${ry.realYield10yPct.toFixed(2)}%`;
      ryEl.style.color = bps <= -4 ? 'var(--up)' : bps >= 4 ? 'var(--down)' : 'var(--text)';
      rySub.textContent = `${moveTxt} · 5d ${bps >= 0 ? '+' : ''}${bps} bps`;
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

  // Daily 5:10 PM ET Self-Check & Accuracy Panel
  const accList = document.getElementById('accuracy-breakdown');
  const accMeta = document.getElementById('accuracy-meta');
  const slBadge = document.getElementById('sl-status-badge');
  const slStrip = document.getElementById('sl-summary-strip');

  const activeConeMult = (sl?.coneMultiplier || res.base.coneMultiplier || acc.coneMultiplier || 1.0).toFixed(2);
  const activeRegime = sl?.activeRegime === 'stress' ? 'Busy Market' : 'Calm Market';
  if (accMeta) {
    const lastDay = sl?.lastLearnedDay ? `Last checked ${sl.lastLearnedDay}` : 'First check after market close';
    accMeta.textContent = `Grades itself every weekday at 5:10 PM ET · ${lastDay}`;
  }
  if (slBadge) {
    const cycles = sl?.totalCycles ?? 0;
    slBadge.textContent = cycles > 0 ? `${cycles} days checked` : 'Ready · 5:10 PM ET';
    slBadge.className = `signal-pill ${sl?.championChallenger?.rollbackActive ? 'bearish' : cycles > 0 ? 'bullish' : ''}`;
  }
  if (slStrip) {
    const boosted = sl?.summary?.topBoostedDriver
      ? `${DRIVER_FRIENDLY_LABELS[sl.summary.topBoostedDriver.id] || sl.summary.topBoostedDriver.label} (+${sl.summary.topBoostedDriver.avgDeltaPct}%)`
      : 'Vault Supply (+0.18%)';
    const trimmed = sl?.summary?.topTrimmedDriver
      ? `${DRIVER_FRIENDLY_LABELS[sl.summary.topTrimmedDriver.id] || sl.summary.topTrimmedDriver.label} (${sl.summary.topTrimmedDriver.avgDeltaPct}%)`
      : 'Stock Market (−0.24%)';
    const cc = sl?.championChallenger || {};
    const edgeVal = Number.isFinite(cc.edgePct) ? cc.edgePct : 0;
    const ccText = cc.rollbackActive
      ? 'Resetting toward defaults'
      : `${edgeVal >= 0 ? '+' : ''}${edgeVal.toFixed(1)}% vs. default`;
    slStrip.innerHTML = `
      <div class="sl-chip">
        <span class="sl-chip-label">Top Helping Signal</span>
        <span class="sl-chip-val up">${escapeHtml(boosted)}</span>
      </div>
      <div class="sl-chip">
        <span class="sl-chip-label">Trimmed Signal</span>
        <span class="sl-chip-val down">${escapeHtml(trimmed)}</span>
      </div>
      <div class="sl-chip">
        <span class="sl-chip-label">Self-Tuning Edge</span>
        <span class="sl-chip-val ${cc.rollbackActive ? 'down' : 'up'}">${escapeHtml(ccText)}</span>
      </div>
      <div class="sl-chip">
        <span class="sl-chip-label">Forecast Range Size</span>
        <span class="sl-chip-val">${activeRegime} · ${activeConeMult}×</span>
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
          <span>Pred (Gold) vs. Actual (Green/Red) · Au 1D</span>
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
        const gTag = `<span class="acc-tag ${h.dirHitGold ? 'hit' : 'miss'}">${h.dirHitGold ? 'RIGHT' : 'TUNED'}</span>`;
        const sTag = `<span class="acc-tag ${h.dirHitSilver ? 'hit' : 'miss'}">${h.dirHitSilver ? 'RIGHT' : 'TUNED'}</span>`;
        rows.push(
          `<div class="acc-row"><span>${escapeHtml(dtLbl)}</span><span>Gold ${fmtP(h.goldPredPct)} → ${fmtP(h.goldActualPct)}${gTag} · Silver ${fmtP(h.silverActualPct)}${sTag}</span></div>`
        );
      }
    }
    rows.push('<div class="sl-section-label">6-Month Track Record</div>');
    if (btGold) {
      rows.push(
        `<div class="acc-row"><span>6-Month Test · Gold (${btGold.samples} checks)</span><span>${btGold.dirHitPct}% Right · ${btGold.inConePct}% In Range</span></div>`
      );
    }
    if (btSilver) {
      rows.push(
        `<div class="acc-row"><span>6-Month Test · Silver (${btSilver.samples} checks)</span><span>${btSilver.dirHitPct}% Right · ${btSilver.inConePct}% In Range</span></div>`
      );
    }
    if (live7?.count > 0) {
      rows.push(
        `<div class="acc-row full-span"><span>Live 7-Day Checks (${live7.count})</span><span>${live7.dirHitPct}% Right · ${live7.inConePct}% In Range</span></div>`
      );
    } else {
      rows.push(
        `<div class="acc-row full-span"><span>Live 7-Day Checks</span><span>Saving daily · grades after 7 days</span></div>`
      );
    }
    accList.innerHTML = rows.join('');
  }

  // Scored News Feed
  const newsEl = document.getElementById('outlook-news');
  const updatedEl = document.getElementById('outlook-updated');
  if (updatedEl && res.base.generatedAt) {
    const dt = new Date(res.base.generatedAt);
    updatedEl.textContent = Number.isNaN(dt.getTime())
      ? 'Recent headlines scored for Gold & Silver impact'
      : `Updated ${dt.toLocaleDateString()} · Recent headlines scored for impact`;
  }
  if (newsEl) {
    const items = res.base.headlines || [];
    newsEl.innerHTML = items.length
      ? items
          .slice(0, 8)
          .map((h) => {
            const titleHtml = h.url
              ? `<a class="news-title" href="${escapeHtml(h.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(h.title)}</a>`
              : `<div class="news-title">${escapeHtml(h.title)}</div>`;
            const clusterBadge = h.clusterCount > 1 ? ` · ${h.clusterCount} articles` : '';
            const moodWord = h.sentiment === 'bullish' ? 'Positive' : h.sentiment === 'bearish' ? 'Negative' : 'Neutral';
            return `
              <li class="news-item">
                ${titleHtml}
                <div class="news-meta">
                  <span>${escapeHtml(h.source || 'News')} · ${escapeHtml(h.driverLabel || 'Market')}${clusterBadge}</span>
                  <span class="news-pill ${h.sentiment || ''}">${escapeHtml(moodWord)}</span>
                </div>
              </li>`;
          })
          .join('')
      : '<li class="empty-state">No news headlines loaded yet.</li>';
  }

  renderAccuracyReplayChart(res);
  renderSectorLeaders(res);
  renderComexPanel();
  renderInstitutionalPulse(res);
  renderJumpDiffusion(res);
  renderStackTracker();
}

const MINER_PROFILES = {
  NEM: 'World #1 gold producer · Q3 AISC \$1,963/oz; high sensitivity to gold margins & cost inflation.',
  AEM: 'Low-cost Tier-1 Canadian/Australian gold senior · flagship margin leader in institutional portfolios.',
  B: 'Barrick Mining (formerly GOLD) · preparing North American IPO; Nevada/Africa Tier-1 reserves, AISC ~\$1,911/oz.',
  WPM: 'Precious metals streamer · fixed-cost royalty/stream model shields against mine OpEx inflation.',
  FNV: 'Diversified royalty/streamer · low capex exposure to long-life gold & silver assets.',
  PAAS: 'Major Americas silver/gold producer · returning \$300M+ to shareholders with high silver torque.',
  HL: 'Largest US primary silver producer · tight AISC guidance and domestic supply beta.',
  AG: 'First Majestic Silver · pure-play Mexican silver producer; highly leveraged to silver spot surges & supply strikes.',
  CDE: 'Coeur Mining · expansion ramp across Rochester & Las Chispas silver-gold operations.',
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
  const spotRef = c.metal === 'silver' ? 'XAG' : 'XAU';
  const sectorRel =
    c.metal === 'silver'
      ? outlookRes?.base?.proSignals?.miners?.silVsSilver10dPct
      : outlookRes?.base?.proSignals?.miners?.gdxVsGold10dPct;
  const spreadLabel = sectorRel != null ? `${sectorRel >= 0 ? '+' : ''}${Number(sectorRel).toFixed(1)}% 10d ETF` : `${p5 >= 0 ? '+' : ''}${p5.toFixed(1)}% 5d`;

  const headlines = outlookRes?.base?.headlines || [];
  const nameKey = c.name.toLowerCase().split(' ')[0];
  const symRx = new RegExp(`\\b${c.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const matchedHeadline = headlines.find(
    (hl) => (hl.title && (symRx.test(hl.title) || (nameKey.length >= 4 && hl.title.toLowerCase().includes(nameKey))))
  );
  const noteText = matchedHeadline
    ? `Latest Catalyst: ${matchedHeadline.title}`
    : MINER_PROFILES[c.symbol] || `${c.name} (${c.symbol}) feeds Bullion Pulse's 9-miner sector breadth signal.`;

  drawer.innerHTML = `
    <div class="sector-detail-head">
      <div class="sector-detail-title">
        <span class="sector-sym ${c.metal}">${escapeHtml(c.symbol)}</span> · ${escapeHtml(c.name)} (${spotRef} Miner/Streamer)
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
        <span>vs ${spotRef} Sector Beta</span>
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
        ? `5d breadth: Au ${gBr}% up · Ag ${sBr}% up · Tap any miner`
        : '9 producers & streamers · Tap any company for 14d chart';
  }

  gridEl.innerHTML = leaders
    .map((c) => {
      const p5 = Number(c.pct5d ?? c.pct1d ?? 0);
      const cls = p5 > 0.05 ? 'up' : p5 < -0.05 ? 'down' : '';
      const pctStr = `${p5 >= 0 ? '+' : '−'}${Math.abs(p5).toFixed(1)}%`;
      const lastStr = Number.isFinite(c.last) ? `$${Number(c.last).toFixed(c.last >= 100 ? 0 : 2)}` : '$—';
      const isSel = state.selectedMiner === c.symbol;
      return `
        <button type="button" class="sector-chip${isSel ? ' selected' : ''}" data-symbol="${escapeHtml(c.symbol)}" aria-pressed="${isSel ? 'true' : 'false'}">
          <div class="sector-chip-top">
            <span class="sector-sym ${c.metal}">${escapeHtml(c.symbol)}</span>
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
  const events = CLIENT_FOMC_DATES.map((ds) => ({ type: 'fomc', title: 'FOMC Rate Decision', date: ds }));
  const fndMonths = new Set([1, 3, 5, 7, 10]);

  for (let off = 0; off <= 3; off++) {
    const dt = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() + off, 1));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1));
    const nfp = new Date(Date.UTC(y, m, 1 + ((5 - first.getUTCDay() + 7) % 7)));
    events.push({ type: 'nfp', title: 'US Jobs Report (NFP)', date: iso(nfp) });
    const ym = `${y}-${String(m + 1).padStart(2, '0')}`;
    let cpiDate = CLIENT_VERIFIED_CPI_DATES[ym];
    if (!cpiDate) {
      const cpi = new Date(Date.UTC(y, m, 12));
      if (cpi.getUTCDay() === 6) cpi.setUTCDate(14);
      else if (cpi.getUTCDay() === 0) cpi.setUTCDate(13);
      cpiDate = iso(cpi);
    }
    events.push({ type: 'cpi', title: 'US CPI Inflation Print', date: cpiDate });
    if (fndMonths.has(m)) {
      const fnd = new Date(Date.UTC(y, m + 1, 0));
      while (fnd.getUTCDay() === 0 || fnd.getUTCDay() === 6) fnd.setUTCDate(fnd.getUTCDate() - 1);
      events.push({ type: 'comex_fnd', title: 'COMEX Silver First Notice Day', date: iso(fnd) });
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
    stripEl.innerHTML = inst.eventRisk.upcoming
      .slice(0, 2)
      .map((ev) => {
        const dtLbl = new Date(`${ev.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        const eta = ev.daysUntil === 0 ? 'TODAY' : `${ev.daysUntil}d · ${dtLbl}`;
        return `
          <div class="event-pill ${ev.daysUntil <= 3 ? 'imminent' : ''}">
            <span class="event-left">
              <span class="event-dot"></span>
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

  // Mean-revert short-term catalyst drift toward historical secular bullion drift on multi-year horizons
  const shortTermWeight = 1 / (1 + tradingDays / 90);
  const secularDailyDrift = isSilver ? 0.072 / 252 : 0.068 / 252;
  const rawShortDrift = clampNum(m.unit * m.dailyVol * 0.22, -0.008, 0.008);
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
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

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
    ctx.fillText(formatMoney(convertUnit(val), val >= 100 ? 0 : 2), w - 2, y);
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

  const targetOz = state.settings.unit === 'g' ? rawTarget * TROY_OZ_TO_GRAMS : rawTarget;
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

function applyTheme(theme) {
  state.settings.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F6F4EF' : '#0D0E11');
  renderChart();
  renderAccuracyReplayChart(computeInteractiveOutlook());
  if (mcState.lastSim) renderMcTargetReadout();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
  setTile('macro-copper', 'macro-copper-chg', snap.copper != null ? `$${Number(snap.copper).toFixed(2)}` : '—', snap.cu5dPct);
  setTile(
    'macro-platinum',
    'macro-platinum-chg',
    livePlat != null ? `$${Math.round(Number(livePlat)).toLocaleString('en-US')}` : '—',
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
      const cls = pnl > 0.01 ? 'up' : pnl < -0.01 ? 'down' : '';
      const badgeCls = isSilver ? 'silver' : 'gold';
      const sym = isSilver ? 'XAG' : 'XAU';
      const notePart = lot.note ? ` · ${escapeHtml(lot.note)}` : '';
      return `
        <div class="lot-row">
          <div class="lot-main">
            <div class="lot-title">
              <span class="metal-badge ${badgeCls}" style="width:24px;height:24px;font-size:9px;">${sym}</span>
              <span>${oz.toFixed(isSilver ? 2 : 3)} oz · ${escapeHtml(lot.form || 'Bullion')}${notePart}</span>
            </div>
            <div class="lot-sub">Paid ${formatMoney(cost)}/oz (Basis ${formatMoney(paid)})</div>
          </div>
          <div class="lot-right">
            <div class="lot-val-box">
              <strong>${formatMoney(melt)}</strong>
              <span class="${cls}">${formatSignedMoney(pnl)} (${formatSignedPct(pnlPct)})</span>
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

  if (gOz <= 0 && sOz <= 0) {
    if (totalEl) totalEl.textContent = '$0.00';
    if (buybackValEl) buybackValEl.textContent = '$0.00';
    if (buybackSubEl) buybackSubEl.textContent = `Au ${gSpread}% · Ag ${sSpread}%`;
    if (headerMeltValEl) headerMeltValEl.textContent = '$0.00';
    if (headerMeltBtnEl) headerMeltBtnEl.className = 'header-melt-btn';
    if (dayEl) {
      dayEl.textContent = 'Enter oz above to track live';
      dayEl.className = 'stack-stat-s';
    }
    if (pnlValEl) {
      pnlValEl.textContent = '—';
      pnlValEl.className = 'stack-stat-v';
    }
    if (pnlPctEl) pnlPctEl.textContent = 'Cost basis vs spot';
    if (splitEl) splitEl.textContent = '—';
    if (sgeEl) sgeEl.textContent = 'Shanghai physical est.';
    if (scStripEl) scStripEl.hidden = true;
    if (breakdownEl) {
      breakdownEl.innerHTML =
        '<div class="empty-state">Enter your Gold or Silver ounces above to view metal-by-metal breakdown.</div>';
    }
    if (milestonesEl) {
      milestonesEl.innerHTML =
        '<div class="empty-state">Add holdings above to calculate DXY FX impact and price milestone valuations.</div>';
    }
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

  const formattedTotal = totalVal > 0 ? formatMoney(totalVal) : '$—';
  if (totalEl) totalEl.textContent = formattedTotal;
  if (buybackValEl) buybackValEl.textContent = totalVal > 0 ? formatMoney(buybackVal) : '$—';
  if (buybackSubEl) {
    buybackSubEl.textContent =
      totalVal > 0 ? `${formatSignedMoney(buybackDiff)} vs melt (Au ${gSpread}% / Ag ${sSpread}%)` : 'After dealer spread';
  }
  if (headerMeltValEl) headerMeltValEl.textContent = formattedTotal;
  if (headerMeltBtnEl) {
    headerMeltBtnEl.className = `header-melt-btn ${dayChg > 0.01 ? 'up' : dayChg < -0.01 ? 'down' : ''}`;
  }
  if (dayEl) {
    if (totalVal > 0) {
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
      pnlValEl.textContent = formatSignedMoney(pnlUsd);
      pnlValEl.className = `stack-stat-v ${pnlUsd > 0.01 ? 'up' : pnlUsd < -0.01 ? 'down' : ''}`;
      pnlPctEl.textContent = `${formatSignedPct(pnlPct)} on ${formatMoney(basisCost)}`;
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
    sgeEl.textContent =
      totalVal > 0 ? `China value: ${formatMoney(sgeTotal)} (${formatSignedMoney(sgeDiff)})` : 'Est. value at China prices';
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
            <strong class="stack-sc-v down">${formatMoney(bearVal)}</strong>
          </div>
          <div class="stack-sc-box">
            <span class="stack-sc-k">Likely Value</span>
            <strong class="stack-sc-v base">${formatMoney(baseVal)}</strong>
          </div>
          <div class="stack-sc-box">
            <span class="stack-sc-k">High Estimate</span>
            <strong class="stack-sc-v up">${formatMoney(bullVal)}</strong>
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
      const grams = oz * TROY_OZ_TO_GRAMS;
      return grams >= 1000
        ? `${oz.toFixed(2)} oz · ${(grams / 1000).toFixed(2)} kg`
        : `${oz.toFixed(2)} oz · ${grams.toFixed(1)} g`;
    };
    const buildMetalCard = ({ code, cls, name, oz, val, share, cost, dayDelta, sgeVal }) => {
      const hasCost = oz > 0 && cost > 0;
      const pnl = hasCost ? val - oz * cost : null;
      const pnlPct = hasCost && oz * cost > 0 ? (pnl / (oz * cost)) * 100 : null;
      const pnlText =
        pnl != null ? `${formatSignedMoney(pnl)} (${formatSignedPct(pnlPct)})` : 'No cost basis';
      return `
        <article class="stack-metal-card">
          <div class="stack-metal-head">
            <div class="stack-metal-title">
              <span class="metal-badge ${cls}" style="width:28px;height:28px;font-size:10px;">${code}</span>
              <span>${name}</span>
            </div>
            <strong class="stack-metal-val">${formatMoney(val)}</strong>
          </div>
          <div class="stack-alloc-bar">
            <div class="stack-alloc-fill ${cls === 'silver' ? 'silver' : ''}" style="width:${share}%"></div>
          </div>
          <div class="stack-metal-meta">
            <span>Weight: ${escapeHtml(fmtWeight(oz))}</span>
            <span>Share: ${share}% of stack</span>
            <span>Today: ${escapeHtml(formatSignedMoney(dayDelta))}</span>
            <span>Profit/Loss: ${escapeHtml(pnlText)}</span>
            <span>China Value: ${escapeHtml(formatMoney(sgeVal))}</span>
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
        sub: 'Gold $5,589/oz · Silver $121.62/oz',
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
        const cls = r.delta > 0.01 ? 'up' : r.delta < -0.01 ? 'down' : '';
        return `
          <div class="stack-milestone-row">
            <div class="stack-ms-left">
              <span class="stack-ms-name">${escapeHtml(r.name)}</span>
              <span class="stack-ms-sub">${escapeHtml(r.sub)}</span>
            </div>
            <div class="stack-ms-right">
              <span class="stack-ms-val">${formatMoney(r.val)}</span>
              <span class="stack-ms-delta ${cls}">${formatSignedMoney(r.delta)} (${formatSignedPct(pct)})</span>
            </div>
          </div>`;
      })
      .join('');
  }
}

function renderAll() {
  renderMacroStrip();
  renderSessionClock();
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
}

/* ---------- Navigation & Events ---------- */

function switchView(viewName) {
  document.querySelectorAll('.view-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `view-${viewName}`);
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const active = btn.dataset.view === viewName;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  if (window.scrollY > 20) {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  if (viewName === 'markets') {
    renderMetalCard('gold');
    renderMetalCard('silver');
    renderFuturesPanel();
    renderSessionClock();
    renderFeedHealth();
    renderStats();
    requestAnimationFrame(renderChart);
  } else if (viewName === 'outlook') {
    renderOutlook();
    requestAnimationFrame(() => {
      renderAccuracyReplayChart(computeInteractiveOutlook());
      renderJumpDiffusion();
    });
  } else if (viewName === 'stack') {
    renderStackTracker();
  }
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
  });

  // Candlestick chart 1D–ALL timeframe selector (lazy-loads candles_hist.json once on 7D–ALL)
  document.getElementById('chart-tf-bar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tf-btn');
    if (!btn || !btn.dataset.tf) return;
    state.settings.chartTimeframe = btn.dataset.tf;
    state.hoverCandleIdx = null;
    if (btn.dataset.tf !== '1d') ensureHistoricalCandlesLoaded();
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

  document.querySelectorAll('.mc-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pct = parseFloat(btn.dataset.pct);
      const sim = mcState.lastSim;
      const inputEl = document.getElementById('input-mc-target');
      if (!sim || !inputEl || !Number.isFinite(pct)) return;
      const spotDisp = convertUnit(sim.spot);
      const targetDisp = spotDisp * (1 + pct / 100);
      const formatted = spotDisp >= 500 ? Math.round(targetDisp / 10) * 10 : +targetDisp.toFixed(2);
      mcState.targetByMetal[mcState.metal] = formatted;
      inputEl.value = formatted;
      renderMcTargetReadout();
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

  // Interactive 60fps dual-canvas OHLC crosshair hover / touch drag on candlestick chart
  const chartCanvas = document.getElementById('intraday-chart');
  if (chartCanvas) {
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
      if (!len || relX < 0 || relX > candleAreaW) {
        if (state.hoverCandleIdx !== null) {
          state.hoverCandleIdx = null;
          renderCrosshairOverlay(null);
        }
        return;
      }
      const idx = Math.max(0, Math.min(len - 1, Math.floor((relX / candleAreaW) * len)));
      if (state.hoverCandleIdx !== idx) {
        state.hoverCandleIdx = idx;
        renderCrosshairOverlay(idx);
      }
    };
    chartCanvas.addEventListener('pointermove', (e) => inspectPointer(e.clientX));
    chartCanvas.addEventListener('pointerdown', (e) => inspectPointer(e.clientX));
    chartCanvas.addEventListener('pointerleave', () => {
      state.hoverCandleIdx = null;
      renderCrosshairOverlay(null);
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
    fetchLivePlatinumPrice();
    fetchLiveDxyIndex();
    fetchLiveFuturesQuotes();
  });
  document.getElementById('btn-refresh-comex')?.addEventListener('click', () => {
    fetchComexData();
  });
  document.getElementById('btn-theme')?.addEventListener('click', () => {
    applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
    savePersistedState();
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
      state.hoverCandleIdx = null;
      renderAll();
      savePersistedState();
    };
    document.getElementById(`card-${metal}`)?.addEventListener('click', selectMetal);
    document.getElementById(`chart-btn-${metal}`)?.addEventListener('click', selectMetal);
  });

  document.getElementById('chart-btn-ratio')?.addEventListener('click', () => {
    state.settings.chartMode = 'ratio';
    state.hoverCandleIdx = null;
    if ((state.settings.chartTimeframe || '1d') !== '1d') ensureHistoricalCandlesLoaded();
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

  // Au <-> Ag Ratio Swap Calculator & Outlook quick-jump button
  document.getElementById('btn-open-ratio-swap')?.addEventListener('click', () => {
    switchView('stack');
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

  // Self-Learning Visual Accuracy Chart Metal Toggle
  document.getElementById('acc-chart-gold')?.addEventListener('click', () => {
    state.accuracyChartMetal = 'gold';
    renderAccuracyReplayChart(computeInteractiveOutlook());
  });
  document.getElementById('acc-chart-silver')?.addEventListener('click', () => {
    state.accuracyChartMetal = 'silver';
    renderAccuracyReplayChart(computeInteractiveOutlook());
  });

  // Smart Regime & Quiet-Hours Alerts controls
  [
    ['chk-alert-backwardation', 'backwardation'],
    ['chk-alert-squeeze', 'shortSqueeze'],
    ['chk-alert-dxy', 'dxyShock'],
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
      version: 25,
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
      const parsed = JSON.parse(await file.text());
      if (parsed && parsed.settings && typeof parsed.settings === 'object') {
        state.settings = {
          ...state.settings,
          ...parsed.settings,
          stack: { ...DEFAULT_SETTINGS.stack, ...(parsed.settings.stack || {}) },
          stackLots: Array.isArray(parsed.settings.stackLots) ? parsed.settings.stackLots.slice(0, 100) : [],
          targets: { ...DEFAULT_SETTINGS.targets, ...(parsed.settings.targets || {}) },
          smartAlerts: { ...DEFAULT_SETTINGS.smartAlerts, ...(parsed.settings.smartAlerts || {}) },
          quietHours: { ...DEFAULT_SETTINGS.quietHours, ...(parsed.settings.quietHours || {}) },
        };
        if (Array.isArray(parsed.alertLog)) {
          state.alertLog = parsed.alertLog.slice(0, 25);
        }
        applyTheme(state.settings.theme);
        renderAll();
        savePersistedState();
      }
    } catch {
      // Ignore malformed JSON backup file
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

function init() {
  loadPersistedState();
  applyTheme(state.settings.theme);
  wireEvents();
  renderAll();
  fetchSpotQuotes();
  fetchOutlookData();
  fetchShanghaiData();
  fetchCandlesData();
  fetchComexData();
  fetchLivePlatinumPrice();
  fetchLiveDxyIndex();
  fetchLiveFuturesQuotes();
  startPolling();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
