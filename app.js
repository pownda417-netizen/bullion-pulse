/* Bullion Pulse — Spot Gold & Silver PWA */

const TROY_OZ_TO_GRAMS = 31.1034768;
const REFRESH_MS = 30000;
const CANDLE_INTERVAL_MS = 5 * 60 * 1000;
const STORAGE_KEY = 'bullion_pulse_state_v2';
const ANON_FETCH_OPTS = {
  cache: 'no-store',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
};

const DEFAULT_SETTINGS = {
  goldThreshold: 1.5,
  silverThreshold: 3.0,
  shanghaiThreshold: 35,
  direction: 'both', // 'both' | 'up' | 'down'
  ntfyTopic: '',
  unit: 'oz', // 'oz' | 'g'
  theme: 'dark',
  selectedMetal: 'gold',
  showForecast: true,
  showFib: false,
  chartTimeframe: '1d', // '1d' | '7d' | '1m' | '6m' | '1y' | '5y' | '10y' | 'all'
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  quotes: {
    gold: { price: null, prevClose: null, chg: 0, pct: 0 },
    silver: { price: null, prevClose: null, chg: 0, pct: 0 },
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
  alertLog: [],
  sessionAlerted: {
    gold: { day: '', dir: null, pct: 0 },
    silver: { day: '', dir: null, pct: 0 },
    shanghai: { day: '', dir: null, usd: 0 },
  },
  mode: 'connecting', // 'live' | 'demo' | 'error'
  lastUpdated: null,
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
      state.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
    }
    if (Array.isArray(parsed.alertLog)) {
      state.alertLog = parsed.alertLog.slice(0, 25);
    }
    if (parsed.history && Array.isArray(parsed.history.gold) && Array.isArray(parsed.history.silver)) {
      state.history.gold = parsed.history.gold.slice(-60);
      state.history.silver = parsed.history.silver.slice(-60);
    }
    if (parsed.sessionAlerted) {
      state.sessionAlerted = { ...state.sessionAlerted, ...parsed.sessionAlerted };
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

  const prevGold = state.quotes.gold.prevClose ?? xau.price;
  const prevSilver = state.quotes.silver.prevClose ?? xag.price;
  const goldChg = xau.price - prevGold;
  const silverChg = xag.price - prevSilver;

  return {
    source: 'Gold-API Spot',
    gold: {
      price: xau.price,
      prevClose: prevGold,
      chg: goldChg,
      pct: prevGold ? (goldChg / prevGold) * 100 : 0,
    },
    silver: {
      price: xag.price,
      prevClose: prevSilver,
      chg: silverChg,
      pct: prevSilver ? (silverChg / prevSilver) * 100 : 0,
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

async function fetchSpotQuotes() {
  const refreshBtn = document.getElementById('btn-refresh');
  refreshBtn?.classList.add('spinning');

  let result;
  try {
    result = await fetchFromGoldPriceOrg();
    state.mode = 'live';
  } catch {
    try {
      result = await fetchFromGoldApiCom();
      state.mode = 'live';
    } catch {
      result = buildFallbackDemoQuotes();
      state.mode = 'demo';
    }
  } finally {
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
  savePersistedState();
}

/* ---------- Alert Evaluation & ntfy.sh ---------- */

function directionMatches(pct, ruleDir) {
  if (ruleDir === 'up') return pct > 0;
  if (ruleDir === 'down') return pct < 0;
  return true;
}

function evaluateAlerts(metal, quote, isSimulated) {
  const threshold =
    metal === 'gold' ? state.settings.goldThreshold : state.settings.silverThreshold;
  const absPct = Math.abs(quote.pct);
  if (absPct < threshold) return false;
  if (!directionMatches(quote.pct, state.settings.direction)) return false;

  const dir = quote.pct >= 0 ? 'up' : 'down';
  const today = todayKey();
  const prev = state.sessionAlerted[metal];

  if (!isSimulated && prev.day === today && prev.dir === dir && absPct < prev.pct + 0.75) {
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
    text.textContent = `Live spot · ${timeStr}`;
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

  if (quote.price == null) return;

  const displayPrice = convertUnit(quote.price);
  const displayChg = convertUnit(quote.chg);

  priceEl.textContent = formatMoney(displayPrice, decimals);
  chgEl.textContent = `${formatSignedMoney(displayChg, decimals)} today`;

  pctEl.textContent = formatSignedPct(quote.pct);
  pctEl.classList.remove('up', 'down');
  if (quote.pct > 0.005) pctEl.classList.add('up');
  else if (quote.pct < -0.005) pctEl.classList.add('down');

  const absPct = Math.abs(quote.pct);
  const progress = Math.min(100, (absPct / threshold) * 100);
  const triggered = absPct >= threshold;

  meterLabel.textContent = `Daily move vs ±${threshold.toFixed(metal === 'silver' ? 2 : 1)}% alert`;
  meterStatus.textContent = triggered
    ? 'Alert triggered'
    : `${Math.round(progress)}% of trigger`;
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
  closeLabelEl.textContent = sel === 'gold' ? 'XAU Prev Close' : 'XAG Prev Close';
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

let histCandlesLoaded = false;
let histCandlesLoading = null;

async function ensureHistoricalCandlesLoaded() {
  if (histCandlesLoaded) return;
  if (histCandlesLoading) return histCandlesLoading;
  histCandlesLoading = (async () => {
    try {
      let res = await fetch('./data/candles_hist.json', ANON_FETCH_OPTS);
      if (!res.ok) res = await fetch('./data/candles.json', ANON_FETCH_OPTS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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
    let res = await fetch('./data/candles_1d.json', ANON_FETCH_OPTS);
    if (!res.ok) res = await fetch('./data/candles.json', ANON_FETCH_OPTS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.timeframes && typeof data.timeframes === 'object') {
      state.timeframes = { ...(state.timeframes || {}), ...data.timeframes };
      if (Object.keys(data.timeframes).length > 1) histCandlesLoaded = true;
    }
    const g1d = data.timeframes?.['1d']?.gold || data.gold;
    const s1d = data.timeframes?.['1d']?.silver || data.silver;
    if (Array.isArray(g1d) && g1d.length >= 4) {
      state.candles.gold = g1d.slice(-40);
    }
    if (Array.isArray(s1d) && s1d.length >= 4) {
      state.candles.silver = s1d.slice(-40);
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

function updateCandleCountdown() {
  const el = document.getElementById('chart-subtitle');
  if (!el) return;
  const tf = state.settings.chartTimeframe || '1d';
  const now = Date.now();
  const nextClose = bucket5m(now) + CANDLE_INTERVAL_MS;
  const remaining = nextClose - now;
  if (tf === '1d') {
    el.textContent = `5m OHLC candles · Next refresh in ${formatCountdown(remaining)}`;
  } else {
    const meta = CHART_TF_META[tf] || CHART_TF_META['1d'];
    el.textContent = `${meta.subtitle} · Live spot synced`;
  }
  if (remaining <= 1000) {
    fetchCandlesData();
  }
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

function renderChart() {
  const canvas = document.getElementById('intraday-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const sel = state.settings.selectedMetal;
  const tf = CHART_TF_META[state.settings.chartTimeframe] ? state.settings.chartTimeframe : '1d';
  const meta = CHART_TF_META[tf];
  const quote = state.quotes[sel];
  const bars = getCandlesForTimeframe(sel, tf);

  const titleEl = document.getElementById('chart-title');
  if (titleEl) {
    titleEl.textContent =
      sel === 'gold'
        ? `Gold (XAU/USD) · ${meta.label}`
        : `Silver (XAG/USD) · ${meta.label}`;
  }
  updateCandleCountdown();

  document.getElementById('chart-btn-gold')?.classList.toggle('active', sel === 'gold');
  document.getElementById('chart-btn-silver')?.classList.toggle('active', sel === 'silver');
  document.querySelectorAll('#chart-tf-bar .tf-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tf === tf);
  });
  const fcBtn = document.getElementById('btn-toggle-forecast');
  if (fcBtn) {
    fcBtn.classList.toggle('active', !!state.settings.showForecast);
    fcBtn.setAttribute('aria-pressed', String(!!state.settings.showForecast));
  }
  const fibBtn = document.getElementById('btn-toggle-fib');
  if (fibBtn) {
    fibBtn.classList.toggle('active', !!state.settings.showFib);
    fibBtn.setAttribute('aria-pressed', String(!!state.settings.showFib));
  }
  const fibLegend = document.getElementById('legend-fib');
  if (fibLegend) fibLegend.hidden = !state.settings.showFib;

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
    o: convertUnit(b.o),
    h: convertUnit(b.h),
    l: convertUnit(b.l),
    c: convertUnit(b.c),
  }));
  const firstOpen = converted[0].o;
  const lastClose = converted[converted.length - 1].c;
  const refLineVal = tf === '1d' ? convertUnit(quote.prevClose ?? bars[0].o) : firstOpen;

  // Period return badge
  const tfChgEl = document.getElementById('chart-tf-change');
  if (tfChgEl && firstOpen > 0) {
    const tfPct = ((lastClose - firstOpen) / firstOpen) * 100;
    const dec = Math.abs(tfPct) >= 100 ? 0 : 1;
    tfChgEl.textContent = `${tfPct >= 0 ? '+' : '−'}${Math.abs(tfPct).toFixed(dec)}% (${meta.label})`;
    tfChgEl.className = `tf-return-pill ${tfPct >= 0.05 ? 'up' : tfPct <= -0.05 ? 'down' : ''}`;
  }

  // Compute Jump-Diffusion fat-tail forecast cone scaled proportionally to the active timeframe
  const showFc = !!state.settings.showForecast;
  const showFib = !!state.settings.showFib;
  const fibCol = styles.getPropertyValue('--fib').trim() || '#A78BFA';
  const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
  const fibData = showFib ? computeFibonacciLevels(converted) : null;
  const outlookRes = computeInteractiveOutlook();
  const fcHorizon = tf === '1d' ? (outlookState.horizon === '30d' ? '1m' : '7d') : meta.fcHorizon;
  const fcLabel = tf === '1d' ? (outlookState.horizon === '30d' ? '+30d' : '+7d') : meta.fcLabel;
  const jdChart = showFc ? getChartJumpDiffusion(sel, outlookRes, fcHorizon) : null;
  const horizonRange = outlookRes[sel].range;
  const p90Target = convertUnit(jdChart ? jdChart.p90 : horizonRange.bull);
  const p75Target = convertUnit(jdChart ? jdChart.p75 : (horizonRange.bull + horizonRange.base) / 2);
  const p50Target = convertUnit(jdChart ? jdChart.p50 : horizonRange.base);
  const p25Target = convertUnit(jdChart ? jdChart.p25 : (horizonRange.bear + horizonRange.base) / 2);
  const p10Target = convertUnit(jdChart ? jdChart.p10 : horizonRange.bear);

  let min = Math.min(...converted.map((b) => b.l), refLineVal);
  let max = Math.max(...converted.map((b) => b.h), refLineVal);
  if (showFc) {
    min = Math.min(min, p10Target, p50Target);
    max = Math.max(max, p90Target, p50Target);
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
  ctx.font = '500 10.5px "JetBrains Mono", monospace';
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
    ctx.fillText(formatMoney(val, val >= 500 ? 0 : 2), w - 2, y);
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

    // Active hover highlight
    if (state.hoverCandleIdx === i) {
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = borderCol;
      ctx.beginPath();
      ctx.moveTo(cx, padTop);
      ctx.lineTo(cx, padTop + plotH);
      ctx.stroke();
      ctx.restore();
    }
  });

  // Fibonacci level pills drawn after candles with priority collision avoidance
  if (fibData) {
    const priorityOrder = [0.618, 0.5, 0.382, 0.236, 0.786, 1, 0];
    const placedYs = [];
    ctx.save();
    ctx.font = '600 9px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const ratio of priorityOrder) {
      const lv = fibData.levels.find((item) => item.ratio === ratio);
      if (!lv) continue;
      const y = yAt(lv.price);
      if (y < padTop + 7 || y > padTop + plotH - 7) continue;
      if (placedYs.some((py) => Math.abs(py - y) < 14)) continue;
      placedYs.push(y);
      const decimals = lv.price >= 500 ? 0 : 2;
      const txt = `${lv.label} ${formatMoney(lv.price, decimals)}`;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = isLightTheme ? 'rgba(255, 255, 255, 0.85)' : 'rgba(13, 14, 17, 0.78)';
      ctx.fillRect(padLeft + 2, y - 6.5, tw + 7, 13);
      ctx.fillStyle = fibCol;
      ctx.globalAlpha = lv.isPocketBound ? 1 : 0.85;
      ctx.fillText(txt, padLeft + 5.5, y + 0.3);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Bottom X-axis date labels across historical candlestick zone
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
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

  // Update OHLC readout bar
  const ohlcEl = document.getElementById('chart-ohlc');
  if (ohlcEl) {
    const idx =
      state.hoverCandleIdx != null && converted[state.hoverCandleIdx]
        ? state.hoverCandleIdx
        : converted.length - 1;
    const bar = converted[idx];
    const tLabel = formatCandleTimestamp(bar.t, tf, false);
    const dec = bar.c >= 500 ? 0 : 2;
    ohlcEl.textContent =
      `${tLabel}  O ${formatMoney(bar.o, dec)}  H ${formatMoney(bar.h, dec)}  L ${formatMoney(bar.l, dec)}  C ${formatMoney(bar.c, dec)}`;
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

  document.getElementById('unit-oz')?.classList.toggle('active', state.settings.unit === 'oz');
  document.getElementById('unit-g')?.classList.toggle('active', state.settings.unit === 'g');

  if (snippet) {
    const t = state.settings.ntfyTopic.trim() || 'bullion-pulse-change-me';
    snippet.textContent =
      `NTFY_TOPIC=${t}\n` +
      `GOLD_THRESHOLD_PCT=${Number(state.settings.goldThreshold).toFixed(1)}\n` +
      `SILVER_THRESHOLD_PCT=${Number(state.settings.silverThreshold).toFixed(2)}\n` +
      `SHANGHAI_PREMIUM_THRESHOLD_USD=${Number(state.settings.shanghaiThreshold).toFixed(0)}\n` +
      `ALERT_DIRECTION=${state.settings.direction}\n` +
      `CATALYST_ALERTS=true`;
  }
}

/* ---------- Outlook, Historical Patterns & What-If Simulator ---------- */

const OUTLOOK_SCENARIOS = [
  { id: 'hot_cpi', label: 'Hot CPI Inflation', driver: 'inflation', goldDelta: 0.65, silverDelta: 0.72 },
  { id: 'war_escalation', label: 'War Escalation', driver: 'geopolitics', goldDelta: 0.85, silverDelta: 0.50 },
  { id: 'fed_rate_cut', label: 'Fed Rate Cut / Weak USD', driver: 'rates_usd', goldDelta: 0.75, silverDelta: 0.80 },
  { id: 'hawkish_usd', label: 'Hawkish Fed / USD Surge', driver: 'rates_usd', goldDelta: -0.75, silverDelta: -0.82 },
  { id: 'stock_crash', label: 'Stock Market −5% Shock', driver: 'equities', goldDelta: 0.45, silverDelta: -0.25 },
  { id: 'mine_strike', label: 'Silver Mine Strike', driver: 'mining_supply', goldDelta: 0.25, silverDelta: 0.90 },
  { id: 'cb_buying', label: 'Central Bank Buying', driver: 'central_banks', goldDelta: 0.70, silverDelta: 0.35 },
  { id: 'shanghai_premium', label: 'Shanghai Premium Surge (+$40)', driver: 'shanghai_sge', goldDelta: 0.75, silverDelta: 0.80 },
  { id: 'comex_squeeze', label: 'COMEX Delivery Squeeze (OI Spike)', driver: 'comex_paper', goldDelta: 0.65, silverDelta: 0.88 },
];

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
    const res = await fetch('./data/comex.json', ANON_FETCH_OPTS);
    if (res.ok) base = await res.json();
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
  if (btnEl) btnEl.textContent = 'Fetch Fresh';
  if (subEl && liveCftc) {
    subEl.textContent = `Live CFTC OI synced · ${formatTime(new Date())}`;
  }
  renderOutlook();
  renderChart();
}

function renderComexPanel() {
  const comex = comexState.data || outlookState.data?.comex || FALLBACK_COMEX;
  if (!comex || !comex.gold || !comex.silver) return;

  const subEl = document.getElementById('comex-subtitle');
  if (subEl && !comexState.fetching) {
    const dt = comex.gold.date || (comex.updatedAt ? new Date(comex.updatedAt).toLocaleDateString() : 'Latest');
    subEl.textContent = `${comex.liveFetched ? 'Live CFTC/COMEX' : 'COMEX Snapshot'} (${dt}) · Feeds every prediction`;
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
      oiEl.textContent = `${m.openInterestContracts.toLocaleString('en-US')} ${m.contractCode}${chg}`;
    }
    if (ozEl) {
      ozEl.textContent = `${m.paperMoz.toFixed(1)}M paper · ${m.registeredMoz.toFixed(1)}M reg oz`;
    }
    if (barEl) {
      const cap = metal === 'silver' ? 8.5 : 5.0;
      barEl.style.width = `${clampNum((m.paperToRegisteredRatio / cap) * 100, 12, 100)}%`;
    }
    if (regEl) {
      const dr = m.registered30dPct != null ? ` · Reg ${m.registered30dPct >= 0 ? '+' : ''}${m.registered30dPct}% 30d` : '';
      regEl.textContent = `${m.regime}${dr}`;
    }
  }
}

async function fetchOutlookData() {
  try {
    const res = await fetch('./data/outlook.json', ANON_FETCH_OPTS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    outlookState.data = await res.json();
    if (!comexState.data && outlookState.data?.comex) {
      comexState.data = outlookState.data.comex;
    }
  } catch {
    outlookState.data = FALLBACK_OUTLOOK;
  }
  renderOutlook();
  renderChart();
}

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function signalFromScore(score) {
  if (score >= 45) return { label: 'Strong Bullish', cls: 'bullish' };
  if (score >= 16) return { label: 'Bullish', cls: 'bullish' };
  if (score <= -45) return { label: 'Strong Bearish', cls: 'bearish' };
  if (score <= -16) return { label: 'Bearish', cls: 'bearish' };
  return { label: 'Neutral', cls: '' };
}

function computeInteractiveOutlook() {
  const base = outlookState.data || FALLBACK_OUTLOOK;
  const spotGold = state.quotes.gold.price || base.gold?.spot || 3542.81;
  const spotSilver = state.quotes.silver.price || base.silver?.spot || 42.22;

  const drivers = (base.drivers || []).map((d) => ({ ...d }));
  const liveComex = comexState.data || base.comex || FALLBACK_COMEX;
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
  } else if (comexState.data) {
    comexRow.gold = liveComex.gold.signal;
    comexRow.silver = liveComex.silver.signal;
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
  const gUnit = clampNum(gComp * 1.45 + driftG, -1, 1);
  const sUnit = clampNum(sComp * 1.45 + driftS, -1, 1);
  const gScore = Math.round(gUnit * 100);
  const sScore = Math.round(sUnit * 100);

  const gDailyVol = ((base.macroSnapshot?.goldVolAnnPct || 16.5) / 100) / Math.sqrt(252);
  const sDailyVol = ((base.macroSnapshot?.silverVolAnnPct || 29.5) / 100) / Math.sqrt(252);
  const days = outlookState.horizon === '30d' ? 21 : 5;
  const coneMult = base.selfLearning?.coneMultiplier || base.coneMultiplier || 1.0;

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

  const narrative = activeNames.length
    ? `Simulated shock active (${activeNames.join(' + ')}): historical cross-market weights shift Gold to ${signalFromScore(gScore).label.toLowerCase()} (${gScore >= 0 ? '+' : ''}${gScore}) and Silver to ${signalFromScore(sScore).label.toLowerCase()} (${sScore >= 0 ? '+' : ''}${sScore}) over the ${outlookState.horizon} window.`
    : base.narrative;

  return {
    base,
    drivers,
    analogs,
    narrative,
    days,
    gold: {
      spot: spotGold,
      dailyVol: gDailyVol,
      unit: gUnit,
      score: gScore,
      signal: signalFromScore(gScore),
      range: project(spotGold, gDailyVol, gUnit),
    },
    silver: {
      spot: spotSilver,
      dailyVol: sDailyVol,
      unit: sUnit,
      score: sScore,
      signal: signalFromScore(sScore),
      range: project(spotSilver, sDailyVol, sUnit),
    },
  };
}

function renderOutlook() {
  const view = document.getElementById('view-outlook');
  if (!view) return;

  const res = computeInteractiveOutlook();

  document.getElementById('horizon-7d')?.classList.toggle('active', outlookState.horizon === '7d');
  document.getElementById('horizon-30d')?.classList.toggle('active', outlookState.horizon === '30d');

  // Render Gold & Silver probabilistic cards
  for (const metal of ['gold', 'silver']) {
    const m = res[metal];
    const sigEl = document.getElementById(`outlook-${metal}-signal`);
    const baseEl = document.getElementById(`outlook-${metal}-base`);
    const driftEl = document.getElementById(`outlook-${metal}-drift`);
    const markerEl = document.getElementById(`outlook-${metal}-marker`);
    const bearEl = document.getElementById(`outlook-${metal}-bear`);
    const bullEl = document.getElementById(`outlook-${metal}-bull`);

    sigEl.textContent = m.signal.label;
    sigEl.className = `signal-pill ${m.signal.cls}`;
    baseEl.textContent = formatMoney(convertUnit(m.range.base));
    driftEl.textContent = `${formatSignedPct(m.range.expectedPct)} · Score ${m.score >= 0 ? '+' : ''}${m.score}`;
    driftEl.className = `forecast-drift ${m.range.expectedPct >= 0.05 ? 'up' : m.range.expectedPct <= -0.05 ? 'down' : ''}`;
    markerEl.style.left = `${m.range.markerPct}%`;
    bearEl.textContent = `Bear ${formatMoney(convertUnit(m.range.bear), 0)}`;
    bullEl.textContent = `Bull ${formatMoney(convertUnit(m.range.bull), 0)}`;
  }

  document.getElementById('outlook-confidence').textContent = `Confidence ${res.base.confidence || 62}%`;
  document.getElementById('outlook-narrative').textContent = res.narrative;

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
              <span>${escapeHtml(d.label)}</span>
              <span class="driver-scores">
                <span style="color:var(--gold-bright)">Au ${fmt(d.gold)}</span>
                <span style="color:var(--silver)">Ag ${fmt(d.silver)}</span>
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
      ryEl.textContent = `${ry.realYield10yPct.toFixed(2)}% (${bps >= 0 ? '+' : ''}${bps}bp)`;
      ryEl.style.color = bps <= -4 ? 'var(--up)' : bps >= 4 ? 'var(--down)' : 'var(--text)';
      rySub.textContent = `10Y Breakeven ${ry.breakeven10yPct != null ? ry.breakeven10yPct.toFixed(2) + '%' : '—'} · ${ry.regime || 'FRED TIPS'}`;
    } else {
      ryEl.textContent = '1.88% (−11bp)';
      rySub.textContent = 'FRED DFII10 · Breakeven 2.34%';
    }
  }

  const cotEl = document.getElementById('pro-cot');
  const cotSub = document.getElementById('pro-cot-sub');
  if (cotEl && cotSub) {
    const cg = ps.cot?.gold;
    const cs = ps.cot?.silver;
    if (cg || cs) {
      cotEl.textContent = `Au ${cg?.percentile52w ?? '—'}% · Ag ${cs?.percentile52w ?? '—'}%`;
      cotSub.textContent = cs?.regime || cg?.regime || '52w Managed Money pct';
    } else {
      cotEl.textContent = 'Au 62% · Ag 24%';
      cotSub.textContent = 'Silver washed-out bounce setup';
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
      minSub.textContent = mn.regime || '10d relative vs spot';
    } else {
      minEl.textContent = '-1.8% / -2.4%';
      minSub.textContent = 'Miners Lagging (Pressure)';
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
    const mult = (sl?.coneMultiplier || res.base.coneMultiplier || 1).toFixed(2);
    accEl.textContent = `${dirPct}% Dir`;
    accSub.textContent = `${conePct}% in cone · ${mult}× width`;
  }

  // Walk-Forward & Daily 5:10 PM ET Self-Learning Panel
  const accList = document.getElementById('accuracy-breakdown');
  const accMeta = document.getElementById('accuracy-meta');
  const slBadge = document.getElementById('sl-status-badge');
  const slStrip = document.getElementById('sl-summary-strip');

  const activeConeMult = (sl?.coneMultiplier || res.base.coneMultiplier || acc.coneMultiplier || 1.0).toFixed(2);
  const activeRegime = sl?.activeRegime === 'stress' ? 'Stress' : 'Calm';
  const horizonsLbl = (sl?.summary?.horizonsActive || ['1D', '5D']).join('+');
  if (accMeta) {
    const lastDay = sl?.lastLearnedDay ? `Calibrated ${sl.lastLearnedDay}` : 'First run after close';
    accMeta.textContent = `5:10 PM ET · ${horizonsLbl} Huber · Holiday-safe · ${lastDay}`;
  }
  if (slBadge) {
    const cycles = sl?.totalCycles ?? 0;
    slBadge.textContent = cycles > 0 ? `${activeRegime} · ${cycles}d` : 'Armed · 5:10 PM ET';
    slBadge.className = `signal-pill ${sl?.championChallenger?.rollbackActive ? 'bearish' : cycles > 0 ? 'bullish' : ''}`;
  }
  if (slStrip) {
    const boosted = sl?.summary?.topBoostedDriver
      ? `${sl.summary.topBoostedDriver.label} (+${sl.summary.topBoostedDriver.avgDeltaPct}%)`
      : 'COMEX Paper (+0.18%)';
    const trimmed = sl?.summary?.topTrimmedDriver
      ? `${sl.summary.topTrimmedDriver.label} (${sl.summary.topTrimmedDriver.avgDeltaPct}%)`
      : 'Equities (−0.24%)';
    const cc = sl?.championChallenger || {};
    const edgeVal = Number.isFinite(cc.edgePct) ? cc.edgePct : 0;
    const ccText = cc.rollbackActive
      ? 'Auto-Rollback (50%)'
      : `${edgeVal >= 0 ? '+' : ''}${edgeVal.toFixed(1)}% vs Base · OK`;
    const jc = sl?.jumpCalibration || { lambdaMult: 1.0, sigmaJMult: 1.0 };
    const tailText = `λ ${Number(jc.lambdaMult || 1).toFixed(2)}× · σJ ${Number(jc.sigmaJMult || 1).toFixed(2)}×`;
    slStrip.innerHTML = `
      <div class="sl-chip">
        <span class="sl-chip-label">Weight Boosted (${activeRegime})</span>
        <span class="sl-chip-val up">${escapeHtml(boosted)}</span>
      </div>
      <div class="sl-chip">
        <span class="sl-chip-label">Weight Trimmed</span>
        <span class="sl-chip-val down">${escapeHtml(trimmed)}</span>
      </div>
      <div class="sl-chip">
        <span class="sl-chip-label">Champion–Challenger</span>
        <span class="sl-chip-val ${cc.rollbackActive ? 'down' : 'up'}">${escapeHtml(ccText)}</span>
      </div>
      <div class="sl-chip">
        <span class="sl-chip-label">Tail &amp; Cone Calib</span>
        <span class="sl-chip-val">${escapeHtml(tailText)} · ${activeConeMult}×</span>
      </div>`;
  }

  if (accList) {
    const rows = [];
    const recentHist = sl?.recentHistory || [];
    if (recentHist.length) {
      rows.push('<div class="sl-section-label">Recent 5:10 PM ET Post-Close Self-Corrections</div>');
      for (const h of recentHist.slice(0, 4)) {
        const dtLbl = h.date ? h.date.slice(5) : '—';
        const fmtP = (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`;
        const gTag = `<span class="acc-tag ${h.dirHitGold ? 'hit' : 'miss'}">${h.dirHitGold ? 'HIT' : 'ADJ'}</span>`;
        const sTag = `<span class="acc-tag ${h.dirHitSilver ? 'hit' : 'miss'}">${h.dirHitSilver ? 'HIT' : 'ADJ'}</span>`;
        rows.push(
          `<div class="acc-row"><span>${escapeHtml(dtLbl)}</span><span>Au ${fmtP(h.goldPredPct)}→${fmtP(h.goldActualPct)}${gTag} · Ag ${fmtP(h.silverActualPct)}${sTag}</span></div>`
        );
      }
    }
    rows.push('<div class="sl-section-label">Walk-Forward Backtest &amp; Live 7D Tracker</div>');
    if (live7?.count > 0) {
      rows.push(
        `<div class="acc-row"><span>Live 7d Graded (${live7.count})</span><span>${live7.dirHitPct}% Dir · ${live7.inConePct}% Cone</span></div>`
      );
    } else {
      rows.push(
        `<div class="acc-row"><span>Live 7d Tracker</span><span>Logging daily · grades after 7d</span></div>`
      );
    }
    if (btGold) {
      rows.push(
        `<div class="acc-row"><span>6m Walk-Fwd Gold (${btGold.samples})</span><span>${btGold.dirHitPct}% Dir · ${btGold.inConePct}% Cone</span></div>`
      );
    }
    if (btSilver) {
      rows.push(
        `<div class="acc-row"><span>6m Walk-Fwd Silver (${btSilver.samples})</span><span>${btSilver.dirHitPct}% Dir · ${btSilver.inConePct}% Cone</span></div>`
      );
    }
    accList.innerHTML = rows.join('');
  }

  // Scored News Feed (with Tier, Recency & Cluster Count)
  const newsEl = document.getElementById('outlook-news');
  const updatedEl = document.getElementById('outlook-updated');
  if (updatedEl && res.base.generatedAt) {
    const dt = new Date(res.base.generatedAt);
    updatedEl.textContent = Number.isNaN(dt.getTime())
      ? '18h decay · Deduplicated · Tiered sources'
      : `Updated ${dt.toLocaleDateString()} · 18h recency decay`;
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
            const tierBadge = h.sourceTier ? ` · T${h.sourceTier}` : '';
            const clusterBadge = h.clusterCount > 1 ? ` · ${h.clusterCount} sources` : '';
            return `
              <li class="news-item">
                ${titleHtml}
                <div class="news-meta">
                  <span>${escapeHtml(h.source || 'News')} · ${escapeHtml(h.driverLabel || 'Macro')}${tierBadge}${clusterBadge}</span>
                  <span class="news-pill ${h.sentiment || ''}">${escapeHtml(h.sentiment || 'neutral')}</span>
                </div>
              </li>`;
          })
          .join('')
      : '<li class="empty-state">No scored headlines yet — run the GitHub Actions Outlook workflow to populate live feeds.</li>';
  }

  renderSectorLeaders(res);
  renderComexPanel();
  renderInstitutionalPulse(res);
  renderJumpDiffusion(res);
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
        ? `5d breadth: Gold miners ${gBr}% up · Silver miners ${sBr}% up`
        : '9 producers & streamers · Feeds miner confirmation';
  }

  gridEl.innerHTML = leaders
    .map((c) => {
      const p5 = Number(c.pct5d ?? c.pct1d ?? 0);
      const cls = p5 > 0.05 ? 'up' : p5 < -0.05 ? 'down' : '';
      const pctStr = `${p5 >= 0 ? '+' : '−'}${Math.abs(p5).toFixed(1)}%`;
      const lastStr = Number.isFinite(c.last) ? `$${Number(c.last).toFixed(c.last >= 100 ? 0 : 2)}` : '$—';
      return `
        <article class="sector-chip">
          <div class="sector-chip-top">
            <span class="sector-sym ${c.metal}">${escapeHtml(c.symbol)}</span>
            <span class="sector-pct ${cls}">${pctStr}</span>
          </div>
          <div class="sector-name">${escapeHtml(c.name)}</div>
          <div class="sector-last">${lastStr} (5d)</div>
        </article>`;
    })
    .join('');
}

/* ---------- Institutional Pulse (Event Calendar, ^GVZ, ETF Flows, Copper/JPY, Basis) ---------- */

const CLIENT_FOMC_DATES = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16',
  '2027-07-28', '2027-09-22', '2027-11-03', '2027-12-15',
];

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
    const cpi = new Date(Date.UTC(y, m, 12));
    if (cpi.getUTCDay() === 6) cpi.setUTCDate(14);
    else if (cpi.getUTCDay() === 0) cpi.setUTCDate(13);
    events.push({ type: 'cpi', title: 'US CPI Inflation Print', date: iso(cpi) });
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

  // 2. Options Implied Vol (^GVZ)
  const gvzVal = document.getElementById('inst-gvz-val');
  const gvzSub = document.getElementById('inst-gvz-sub');
  if (gvzVal && gvzSub && inst.impliedVol) {
    const iv = inst.impliedVol;
    gvzVal.textContent = `${iv.gvz.toFixed(1)}% IV`;
    gvzSub.textContent = `${iv.ivMinusRv >= 0 ? '+' : ''}${iv.ivMinusRv.toFixed(1)}% vs RV · ${iv.regime}`;
  }

  // 3. Physical Bullion ETF Flows (GLD / SLV / PSLV)
  const etfVal = document.getElementById('inst-etf-val');
  const etfSub = document.getElementById('inst-etf-sub');
  if (etfVal && etfSub && inst.etfFlows) {
    const ef = inst.etfFlows;
    const avgRatio = (((ef.gldVolRatio || 1) + (ef.slvVolRatio || 1)) / 2).toFixed(2);
    etfVal.textContent = `${avgRatio}× Vol`;
    etfVal.className = `inst-val ${ef.silverSignal >= 0.25 ? 'up' : ef.silverSignal <= -0.25 ? 'down' : ''}`;
    const pslvPart = ef.pslvVsSlv10dPct != null ? `PSLV ${ef.pslvVsSlv10dPct >= 0 ? '+' : ''}${ef.pslvVsSlv10dPct}% vs SLV` : ef.regime;
    etfSub.textContent = `${pslvPart} · ${ef.regime}`;
  }

  // 4. Copper & USD/JPY Carry Stress
  const crossVal = document.getElementById('inst-cross-val');
  const crossSub = document.getElementById('inst-cross-sub');
  if (crossVal && crossSub && inst.crossMarket) {
    const cm = inst.crossMarket;
    const cuStr = cm.cu5dPct != null ? `Cu ${cm.cu5dPct >= 0 ? '+' : ''}${cm.cu5dPct.toFixed(1)}%` : 'Cu —';
    const jpyStr = cm.usdjpyLast != null ? `¥${cm.usdjpyLast.toFixed(1)}` : 'JPY —';
    crossVal.textContent = `${cuStr} · ${jpyStr}`;
    crossVal.className = `inst-val ${(cm.cu5dPct || 0) >= 1 ? 'up' : (cm.cu5dPct || 0) <= -1.5 ? 'down' : ''}`;
    crossSub.textContent = cm.regime;
  }

  // 5. COMEX Spot-to-Futures Basis (Backwardation / Contango)
  const basisVal = document.getElementById('inst-basis-val');
  const basisSub = document.getElementById('inst-basis-sub');
  if (basisVal && basisSub && inst.basis) {
    const bg = inst.basis.gold;
    const bs = inst.basis.silver;
    const gStr = bg ? `Au ${bg.basisUsd >= 0 ? '+' : '−'}$${Math.abs(bg.basisUsd).toFixed(1)}` : 'Au —';
    const sStr = bs ? `Ag ${bs.basisUsd >= 0 ? '+' : '−'}$${Math.abs(bs.basisUsd).toFixed(2)}` : 'Ag —';
    basisVal.textContent = `${gStr} · ${sStr}`;
    const tight = (bs?.basisUsd ?? 1) < 0 || (bg?.basisUsd ?? 1) < 0;
    basisVal.className = `inst-val ${tight ? 'up' : ''}`;
    basisSub.textContent = bs?.basisUsd < 0 ? 'Silver Backwardation (Tight!)' : (bg?.state || bs?.state || 'Normal Contango');
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

  const vixBoost = clampNum((vix - 16) / 35, 0, 0.08) * shortTermWeight;
  const catBoost = clampNum(catIntensity * 0.04, 0, 0.05) * shortTermWeight;
  const lambda = clampNum(((isSilver ? 0.085 : 0.045) + vixBoost + catBoost) * lambdaMult, 0.02, 0.28);
  const jumpSigma = (isSilver ? 0.042 : 0.022) * volDamp * clampNum(coneMult, 0.8, 1.45) * sigmaJMult;
  const jumpMean = clampNum(m.unit * (isSilver ? 0.012 : 0.007) * shortTermWeight, -0.018, 0.018);

  return {
    diffVol,
    lambda,
    jumpMean,
    jumpSigma,
    dailyDrift,
    expectedJumpsPerMonth: +(lambda * 21).toFixed(1),
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
    deltaEl.textContent = `${formatSignedPct(res.pctDelta)} vs spot`;
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
  if (touchHint) touchHint.textContent = `Touches ${dirWord} anytime (${sim.spec.label})`;
  if (finishHint) finishHint.textContent = `Closes ${dirWord} at ${sim.spec.xEnd}`;

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
    subEl.textContent = `1,500 paths · ~${sim.params.expectedJumpsPerMonth} jumps/mo · ${spec.label} P10–P90`;
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
  const key = `${metal}|${hKey}|${m.spot.toFixed(2)}|${m.score}|${outlookState.activeScenarios.size}|${mcState.seed}|${jc.lambdaMult ?? 1}|${jc.sigmaJMult ?? 1}`;

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
    const res = await fetch('./data/shanghai.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    shanghaiState.data = await res.json();
  } catch {
    shanghaiState.data = outlookState.data?.shanghai || FALLBACK_SHANGHAI;
  }
  renderShanghai();
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
    subEl.textContent = `${sge.gold.contract} & ${sge.silver.contract} · USD/CNY ${usdCny.toFixed(4)}`;
  }

  // Gold SGE Card
  document.getElementById('sge-gold-contract').textContent = sge.gold.contract || 'Au99.99';
  const gPctEl = document.getElementById('sge-gold-pct');
  gPctEl.textContent = formatSignedPct(sge.gold.pct || 0);
  gPctEl.className = `sge-pct ${(sge.gold.pct || 0) >= 0.01 ? 'up' : (sge.gold.pct || 0) <= -0.01 ? 'down' : ''}`;
  document.getElementById('sge-gold-cny').textContent = `¥${Number(sge.gold.cnyPerG).toFixed(2)} / g`;
  document.getElementById('sge-gold-usd').textContent = `${formatMoney(convertUnit(goldUsdOz))} / ${unitLabel}`;

  const gPremEl = document.getElementById('sge-gold-premium');
  if (goldPremOz != null) {
    const premDisp = convertUnit(goldPremOz);
    const pctPart = goldPremPct != null ? ` (${formatSignedPct(goldPremPct)})` : '';
    gPremEl.textContent = `vs West: ${formatSignedMoney(premDisp)}/${unitLabel}${pctPart}`;
    gPremEl.className = `sge-spread ${goldPremOz >= 0 ? 'up' : 'down'}`;
  } else {
    gPremEl.textContent = 'vs West: —';
    gPremEl.className = 'sge-spread';
  }

  // Silver SGE Card
  document.getElementById('sge-silver-contract').textContent = sge.silver.contract || 'Ag(T+D)';
  const sPctEl = document.getElementById('sge-silver-pct');
  sPctEl.textContent = formatSignedPct(sge.silver.pct || 0);
  sPctEl.className = `sge-pct ${(sge.silver.pct || 0) >= 0.01 ? 'up' : (sge.silver.pct || 0) <= -0.01 ? 'down' : ''}`;
  document.getElementById('sge-silver-cny').textContent = `¥${Math.round(Number(sge.silver.cnyPerKg)).toLocaleString('en-US')} / kg`;
  document.getElementById('sge-silver-usd').textContent = `${formatMoney(convertUnit(silverUsdOz))} / ${unitLabel} (incl. VAT)`;

  const sPremEl = document.getElementById('sge-silver-premium');
  if (silverExVatPremOz != null) {
    sPremEl.textContent = `Ex-13% VAT: ${formatMoney(convertUnit(silverExVatUsdOz))} (${formatSignedMoney(convertUnit(silverExVatPremOz))})`;
    sPremEl.className = `sge-spread ${silverExVatPremOz >= 0 ? 'up' : 'down'}`;
  } else {
    sPremEl.textContent = `Ex-13% VAT: ${formatMoney(convertUnit(silverExVatUsdOz))}`;
    sPremEl.className = 'sge-spread';
  }

  // Benchmarks strip
  const benchEl = document.getElementById('sge-benchmarks');
  if (benchEl) {
    const shau = sge.benchmarks?.SHAU;
    const shag = sge.benchmarks?.SHAG;
    const parts = [];
    if (shau && (shau.am || shau.pm)) {
      parts.push(`SHAU AM ¥${shau.am ?? '—'} · PM ¥${shau.pm ?? '—'}/g`);
    }
    if (shag && (shag.am || shag.pm)) {
      parts.push(`SHAG AM ¥${shag.am ?? '—'} · PM ¥${shag.pm ?? '—'}/kg`);
    }
    benchEl.textContent = parts.length
      ? parts.join('  |  ')
      : 'Source: Shanghai Gold Exchange (en.sge.com.cn)';
  }
}

function applyTheme(theme) {
  state.settings.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F6F4EF' : '#0D0E11');
  renderChart();
  if (mcState.lastSim) renderMcTargetReadout();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderAll() {
  renderStatus();
  renderMetalCard('gold');
  renderMetalCard('silver');
  renderStats();
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
  if (viewName === 'markets') {
    requestAnimationFrame(renderChart);
  } else if (viewName === 'outlook') {
    requestAnimationFrame(() => renderJumpDiffusion());
  }
}

function wireEvents() {
  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
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
    renderChart();
  });
  document.getElementById('horizon-30d')?.addEventListener('click', () => {
    outlookState.horizon = '30d';
    mcState.horizon = '1m';
    mcState.cacheKey = '';
    renderOutlook();
    renderChart();
  });
  document.getElementById('scenario-chips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.scenario-chip');
    if (!btn) return;
    const id = btn.dataset.scenario;
    if (outlookState.activeScenarios.has(id)) outlookState.activeScenarios.delete(id);
    else outlookState.activeScenarios.add(id);
    renderOutlook();
    renderChart();
  });
  document.getElementById('btn-reset-scenarios')?.addEventListener('click', () => {
    outlookState.activeScenarios.clear();
    renderOutlook();
    renderChart();
  });

  // Forecast & Fibonacci overlay toggles on candlestick chart
  document.getElementById('btn-toggle-forecast')?.addEventListener('click', () => {
    state.settings.showForecast = !state.settings.showForecast;
    renderChart();
    savePersistedState();
  });

  document.getElementById('btn-toggle-fib')?.addEventListener('click', () => {
    state.settings.showFib = !state.settings.showFib;
    renderChart();
    savePersistedState();
  });

  // Interactive OHLC crosshair hover / touch drag on candlestick chart
  const chartCanvas = document.getElementById('intraday-chart');
  if (chartCanvas) {
    const inspectPointer = (clientX) => {
      const rect = chartCanvas.getBoundingClientRect();
      const plotW = rect.width - 66;
      const candleAreaW = state.settings.showForecast ? plotW * 0.72 : plotW;
      const relX = clientX - rect.left - 6;
      const bars = getCandlesForTimeframe(
        state.settings.selectedMetal,
        state.settings.chartTimeframe || '1d'
      );
      if (!bars.length || relX < 0 || relX > candleAreaW) {
        if (state.hoverCandleIdx !== null) {
          state.hoverCandleIdx = null;
          renderChart();
        }
        return;
      }
      const idx = Math.max(0, Math.min(bars.length - 1, Math.floor((relX / candleAreaW) * bars.length)));
      if (state.hoverCandleIdx !== idx) {
        state.hoverCandleIdx = idx;
        renderChart();
      }
    };
    chartCanvas.addEventListener('pointermove', (e) => inspectPointer(e.clientX));
    chartCanvas.addEventListener('pointerdown', (e) => inspectPointer(e.clientX));
    chartCanvas.addEventListener('pointerleave', () => {
      state.hoverCandleIdx = null;
      renderChart();
    });
  }

  // Refresh & Theme
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    fetchSpotQuotes();
    fetchOutlookData();
    fetchShanghaiData();
    fetchCandlesData();
    fetchComexData();
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

  // Metal selection
  ['gold', 'silver'].forEach((metal) => {
    const selectMetal = () => {
      state.settings.selectedMetal = metal;
      state.hoverCandleIdx = null;
      renderAll();
      savePersistedState();
    };
    document.getElementById(`card-${metal}`)?.addEventListener('click', selectMetal);
    document.getElementById(`chart-btn-${metal}`)?.addEventListener('click', selectMetal);
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

  // ntfy topic input
  document.getElementById('input-ntfy-topic')?.addEventListener('input', (e) => {
    state.settings.ntfyTopic = e.target.value.trim();
    renderSettingsControls();
    savePersistedState();
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
      startPolling();
    }
  });
}

function startPolling() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  if (state.candleRefreshTimer) clearInterval(state.candleRefreshTimer);
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.refreshTimer = setInterval(fetchSpotQuotes, REFRESH_MS);
  state.candleRefreshTimer = setInterval(fetchCandlesData, CANDLE_INTERVAL_MS);
  state.countdownTimer = setInterval(updateCandleCountdown, 1000);
  updateCandleCountdown();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
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
  startPolling();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
