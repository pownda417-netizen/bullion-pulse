/**
 * Bullion Pulse — Institutional Pro Quant Signals Module
 * Zero external dependencies (Node.js 20+ built-in fetch), 100% free & anonymous.
 *
 * 1. FRED 10Y Real Yields (DFII10) & 10Y Breakeven Inflation (T10YIE)
 * 2. FRED 10Y-2Y Yield Curve (T10Y2Y) & 2Y Treasury Yield (DGS2) Fed-Pivot Tracker
 * 3. S&P 500 / Gold Capital-Rotation Ratio (^GSPC / GC=F) vs. 40m & 80m Moving Averages
 * 4. CFTC Disaggregated Commitments of Traders (COT) Managed Money Crowding (72hh-3qpy)
 * 5. Mining Equities Relative Strength Confirmation (GDX/Gold & SIL/Silver)
 */

import {
  isSaneIsoDate,
  readResponseJsonWithLimit,
  readResponseTextWithLimit,
  safeFetch,
} from './net_security.mjs';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) BullionPulseQuant/1.0';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* ---------- 1. FRED Real Yields (DFII10) & Breakevens (T10YIE) ---------- */

export function parseFredCsv(csvText, maxRows = 60) {
  const lines = String(csvText || '').slice(0, 2 * 1024 * 1024).trim().split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const [rawDate, rawVal] = lines[i].split(',');
    const date = String(rawDate || '').trim();
    const val = parseFloat(rawVal);
    if (isSaneIsoDate(date) && Number.isFinite(val) && val >= -10 && val <= 30) {
      rows.push({ date, value: val });
    }
  }
  return rows.slice(-maxRows);
}

export function computeRealYieldSignal(dfii10Rows = [], t10yieRows = []) {
  if (!dfii10Rows.length && !t10yieRows.length) return null;

  const latestReal = dfii10Rows[dfii10Rows.length - 1] || null;
  const prev5Real = dfii10Rows[Math.max(0, dfii10Rows.length - 6)] || latestReal;
  const prev20Real = dfii10Rows[Math.max(0, dfii10Rows.length - 21)] || latestReal;

  const latestBe = t10yieRows[t10yieRows.length - 1] || null;
  const prev5Be = t10yieRows[Math.max(0, t10yieRows.length - 6)] || latestBe;

  const realDelta5dBps =
    latestReal && prev5Real ? Math.round((latestReal.value - prev5Real.value) * 100) : 0;
  const realDelta20dBps =
    latestReal && prev20Real ? Math.round((latestReal.value - prev20Real.value) * 100) : 0;
  const beDelta5dBps =
    latestBe && prev5Be ? Math.round((latestBe.value - prev5Be.value) * 100) : 0;

  // Falling real yields (-bps) and rising breakeven inflation (+bps) are bullish for Gold & Silver
  const realComponent = clamp((-realDelta5dBps / 22) * 0.65 + (-realDelta20dBps / 40) * 0.35, -1, 1);
  const beComponent = clamp(beDelta5dBps / 18, -0.6, 0.6);
  const goldSignal = clamp(realComponent * 0.72 + beComponent * 0.28, -1, 1);
  const silverSignal = clamp(realComponent * 0.65 + beComponent * 0.35, -1, 1);

  return {
    asOf: latestReal?.date || latestBe?.date || null,
    realYield10yPct: latestReal ? +latestReal.value.toFixed(2) : null,
    realDelta5dBps,
    realDelta20dBps,
    breakeven10yPct: latestBe ? +latestBe.value.toFixed(2) : null,
    breakevenDelta5dBps: beDelta5dBps,
    goldSignal: +goldSignal.toFixed(3),
    silverSignal: +silverSignal.toFixed(3),
    regime:
      realDelta5dBps <= -6
        ? 'Falling Real Yields (Bullish)'
        : realDelta5dBps >= 6
          ? 'Rising Real Yields (Headwind)'
          : 'Stable Real Yields',
  };
}

async function fetchFredSeries(id, maxRows = 60) {
  const res = await safeFetch(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`,
    { headers: { 'User-Agent': USER_AGENT } },
    { timeoutMs: 12000, maxRedirects: 1, allowedHosts: ['fred.stlouisfed.org'] }
  );
  if (!res.ok) throw new Error(`FRED ${id} HTTP ${res.status}`);
  const csv = await readResponseTextWithLimit(res, 2 * 1024 * 1024);
  return parseFredCsv(csv, maxRows);
}

export async function fetchFredRealYields() {
  const [dfii10, t10yie] = await Promise.all([fetchFredSeries('DFII10', 60), fetchFredSeries('T10YIE', 60)]);
  return computeRealYieldSignal(dfii10, t10yie);
}

/* ---------- 1b. FRED 10Y-2Y Yield Curve (T10Y2Y) & 2Y Treasury Yield (DGS2) ---------- */

export function computeYieldCurveSignal(t10y2yRows = [], dgs2Rows = []) {
  if (!t10y2yRows.length && !dgs2Rows.length) return null;

  const latestSpread = t10y2yRows[t10y2yRows.length - 1] || null;
  const prev5Spread = t10y2yRows[Math.max(0, t10y2yRows.length - 6)] || latestSpread;
  const prev20Spread = t10y2yRows[Math.max(0, t10y2yRows.length - 21)] || latestSpread;

  const latest2y = dgs2Rows[dgs2Rows.length - 1] || null;
  const prev52y = dgs2Rows[Math.max(0, dgs2Rows.length - 6)] || latest2y;
  const prev202y = dgs2Rows[Math.max(0, dgs2Rows.length - 21)] || latest2y;

  const spread10y2yPct = latestSpread ? +latestSpread.value.toFixed(2) : null;
  const spreadDelta5dBps =
    latestSpread && prev5Spread ? Math.round((latestSpread.value - prev5Spread.value) * 100) : 0;
  const spreadDelta20dBps =
    latestSpread && prev20Spread ? Math.round((latestSpread.value - prev20Spread.value) * 100) : 0;

  const yield2yPct = latest2y ? +latest2y.value.toFixed(2) : null;
  const yield2yDelta5dBps =
    latest2y && prev52y ? Math.round((latest2y.value - prev52y.value) * 100) : 0;
  const yield2yDelta20dBps =
    latest2y && prev202y ? Math.round((latest2y.value - prev202y.value) * 100) : 0;

  const isInverted = spread10y2yPct != null && spread10y2yPct < 0;

  // Bull steepening (2Y falling faster than 10Y ahead of Fed cuts) is historically Gold's strongest macro launchpad;
  // curve flattening + rising 2Y signals hawkish Fed pressure / headwind.
  const steepComp = clamp((spreadDelta20dBps / 24) * 0.65 + (spreadDelta5dBps / 14) * 0.35, -1, 1);
  const y2Comp = clamp((-yield2yDelta20dBps / 35) * 0.65 + (-yield2yDelta5dBps / 18) * 0.35, -1, 1);
  const bullSteepenBonus = yield2yDelta20dBps <= -12 && spreadDelta20dBps >= 8 ? 0.18 : 0;

  const goldSignal = clamp(steepComp * 0.48 + y2Comp * 0.52 + bullSteepenBonus, -1, 1);
  const silverSignal = clamp(steepComp * 0.44 + y2Comp * 0.56 + bullSteepenBonus * 0.85, -1, 1);

  let regime = 'Balanced Curve';
  if (yield2yDelta20dBps <= -12 && spreadDelta20dBps >= 8) {
    regime = 'Bull Steepening (Fed Pivot)';
  } else if (isInverted) {
    regime = 'Inverted Curve (Slowing Watch)';
  } else if (spreadDelta20dBps >= 8) {
    regime = 'Steepening Curve (Supportive)';
  } else if (spreadDelta20dBps <= -8 || yield2yDelta20dBps >= 14) {
    regime = 'Flattening / Hawkish 2Y';
  }

  return {
    asOf: latestSpread?.date || latest2y?.date || null,
    spread10y2yPct,
    spreadDelta5dBps,
    spreadDelta20dBps,
    yield2yPct,
    yield2yDelta5dBps,
    yield2yDelta20dBps,
    isInverted,
    goldSignal: +goldSignal.toFixed(3),
    silverSignal: +silverSignal.toFixed(3),
    regime,
  };
}

export async function fetchFredYieldCurve() {
  const [t10y2y, dgs2] = await Promise.all([fetchFredSeries('T10Y2Y', 90), fetchFredSeries('DGS2', 90)]);
  return computeYieldCurveSignal(t10y2y, dgs2);
}

/* ---------- 1c. S&P 500 / Gold Capital-Rotation Ratio (40m & 80m MAs) ---------- */

function smaTail(values = [], period = 40) {
  if (!Array.isArray(values) || values.length < Math.min(12, period)) return null;
  const win = values.slice(-period);
  return win.reduce((s, v) => s + v, 0) / win.length;
}

export function computeSpxGoldRatioSignal({
  spxMonthly = [],
  goldMonthly = [],
  spxDaily = [],
  goldDaily = [],
} = {}) {
  // Align monthly points by YYYY-MM key (supports { ym, close } objects or plain numeric arrays)
  const paired = [];
  if (
    spxMonthly.length &&
    goldMonthly.length &&
    typeof spxMonthly[0] === 'object' &&
    typeof goldMonthly[0] === 'object'
  ) {
    const goldByYm = new Map();
    for (const g of goldMonthly) {
      if (g?.ym && Number.isFinite(g.close) && g.close > 0) goldByYm.set(g.ym, g.close);
    }
    for (const s of spxMonthly) {
      if (!s?.ym || !Number.isFinite(s.close) || s.close <= 0) continue;
      const gClose = goldByYm.get(s.ym);
      if (gClose > 0) {
        paired.push({ ym: s.ym, spx: s.close, gold: gClose, ratio: s.close / gClose });
      }
    }
  } else if (spxMonthly.length && goldMonthly.length) {
    const n = Math.min(spxMonthly.length, goldMonthly.length);
    const sOff = spxMonthly.length - n;
    const gOff = goldMonthly.length - n;
    for (let i = 0; i < n; i++) {
      const s = Number(spxMonthly[sOff + i]);
      const g = Number(goldMonthly[gOff + i]);
      if (Number.isFinite(s) && s > 0 && Number.isFinite(g) && g > 0) {
        paired.push({ ym: `M${i + 1}`, spx: s, gold: g, ratio: s / g });
      }
    }
  }

  // Latest live daily ratio if available, otherwise latest monthly
  const spxNow = spxDaily.length ? spxDaily[spxDaily.length - 1] : paired[paired.length - 1]?.spx ?? null;
  const goldNow = goldDaily.length ? goldDaily[goldDaily.length - 1] : paired[paired.length - 1]?.gold ?? null;
  if (!(spxNow > 0 && goldNow > 0)) return null;

  const ratio = spxNow / goldNow;

  // Weekly (5 trading days) rotation change
  let chg5dPct = 0;
  const dn = Math.min(spxDaily.length, goldDaily.length);
  if (dn >= 6) {
    const sPrev = spxDaily[spxDaily.length - 6];
    const gPrev = goldDaily[goldDaily.length - 6];
    if (sPrev > 0 && gPrev > 0) {
      const rPrev = sPrev / gPrev;
      chg5dPct = +(((ratio - rPrev) / rPrev) * 100).toFixed(2);
    }
  } else if (paired.length >= 2) {
    const rPrev = paired[paired.length - 2].ratio;
    chg5dPct = +(((ratio - rPrev) / rPrev) * 100).toFixed(2);
  }

  const ratios = paired.map((p) => p.ratio);
  const goldClosesM = paired.map((p) => p.gold);
  // Append live spot ratio into tail if monthly array doesn't already reflect current close
  const ma40m = smaTail(ratios, 40);
  const ma80m = smaTail(ratios, 80);
  const goldMa40m = smaTail(goldClosesM, 40);

  const vsMa40mPct = ma40m ? +(((ratio - ma40m) / ma40m) * 100).toFixed(2) : null;
  const vsMa80mPct = ma80m ? +(((ratio - ma80m) / ma80m) * 100).toFixed(2) : null;
  const goldVsMa40mPct = goldMa40m ? +(((goldNow - goldMa40m) / goldMa40m) * 100).toFixed(2) : null;

  // Real-terms capital rotation signal:
  // Falling SPX/Gold below 40m & 80m MAs = capital rotating out of stocks into Gold (bullish Gold).
  // Rising SPX/Gold above both MAs = stocks outperforming Gold in real terms (headwind).
  let maTilt = 0;
  if (vsMa40mPct != null && vsMa80mPct != null) {
    maTilt = clamp((-vsMa40mPct / 18) * 0.55 + (-vsMa80mPct / 24) * 0.45, -0.75, 0.75);
  } else if (vsMa40mPct != null) {
    maTilt = clamp(-vsMa40mPct / 18, -0.75, 0.75);
  }
  const momTilt = clamp(-chg5dPct / 6.5, -0.45, 0.45);
  const goldSignal = clamp(maTilt * 0.68 + momTilt * 0.32, -0.85, 0.85);
  const silverSignal = clamp(maTilt * 0.55 + momTilt * 0.28, -0.75, 0.75);

  let regime = 'Neutral Rotation';
  if (ma40m != null && ma80m != null) {
    if (ratio < ma40m && ratio < ma80m) {
      regime = 'Capital Rotating to Gold';
    } else if (ratio > ma40m && ratio > ma80m) {
      regime = 'Equities Leading vs. Gold';
    } else {
      regime = 'Testing 40m/80m Pivot Zone';
    }
  } else if (ma40m != null) {
    regime = ratio < ma40m ? 'Below 40m MA (Gold Leading)' : 'Above 40m MA (Stocks Leading)';
  }

  // Compact 48-month history for UI sparkline (ratio + running 40m MA)
  const history48m = [];
  const startIdx = Math.max(0, paired.length - 48);
  for (let i = startIdx; i < paired.length; i++) {
    const winStart = Math.max(0, i - 39);
    let sum = 0;
    for (let k = winStart; k <= i; k++) sum += paired[k].ratio;
    const runMa40 = sum / (i - winStart + 1);
    history48m.push({
      ym: paired[i].ym,
      ratio: +paired[i].ratio.toFixed(3),
      ma40m: +runMa40.toFixed(3),
    });
  }

  return {
    asOf: paired[paired.length - 1]?.ym || null,
    ratio: +ratio.toFixed(3),
    chg5dPct,
    ma40m: ma40m != null ? +ma40m.toFixed(3) : null,
    ma80m: ma80m != null ? +ma80m.toFixed(3) : null,
    vsMa40mPct,
    vsMa80mPct,
    goldMa40m: goldMa40m != null ? +goldMa40m.toFixed(2) : null,
    goldVsMa40mPct,
    goldSignal: +goldSignal.toFixed(3),
    silverSignal: +silverSignal.toFixed(3),
    regime,
    history48m,
  };
}

export async function fetchSpxGoldMonthly() {
  const fetchMonthly = async (symbol) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1mo`;
    const res = await safeFetch(
      url,
      { headers: { 'User-Agent': USER_AGENT } },
      { timeoutMs: 12000, maxRedirects: 0, allowedHosts: ['query1.finance.yahoo.com'] }
    );
    if (!res.ok) throw new Error(`Yahoo monthly ${symbol} HTTP ${res.status}`);
    const data = await readResponseJsonWithLimit(res, 1024 * 1024);
    const result = data?.chart?.result?.[0];
    const ts = result?.timestamp || [];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const out = [];
    for (let i = 0; i < Math.min(ts.length, closes.length); i++) {
      const c = closes[i];
      if (typeof c === 'number' && Number.isFinite(c) && c > 0 && Number.isFinite(ts[i])) {
        const d = new Date(ts[i] * 1000);
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        out.push({ ym, close: c });
      }
    }
    return out;
  };

  const [spxMonthly, goldMonthly] = await Promise.all([fetchMonthly('^GSPC'), fetchMonthly('GC=F')]);
  return { spxMonthly, goldMonthly };
}

/* ---------- 2. CFTC Disaggregated COT Positioning (Crowding) ---------- */

export function parseCftcCotRows(rows = []) {
  const parsed = [];
  for (const r of rows) {
    const longPos = parseFloat(r.m_money_positions_long_all);
    const shortPos = parseFloat(r.m_money_positions_short_all);
    const oi = parseFloat(r.open_interest_all);
    const date = r.report_date_as_yyyy_mm_dd || r.report_date;
    if (!Number.isFinite(longPos) || !Number.isFinite(shortPos) || !Number.isFinite(oi) || oi <= 0) {
      continue;
    }
    const net = longPos - shortPos;
    parsed.push({
      date: String(date || '').slice(0, 10),
      net: Math.round(net),
      netPctOi: +((net / oi) * 100).toFixed(2),
      openInterest: Math.round(oi),
    });
  }
  parsed.sort((a, b) => a.date.localeCompare(b.date));
  return parsed;
}

export function computeCotSignal(history = []) {
  if (!history.length) return null;
  const latest = history[history.length - 1];
  const prev = history.length >= 2 ? history[history.length - 2] : latest;
  const window = history.slice(-52);
  const nets = window.map((w) => w.net);
  const minNet = Math.min(...nets);
  const maxNet = Math.max(...nets);
  const percentile =
    maxNet > minNet ? Math.round(((latest.net - minNet) / (maxNet - minNet)) * 100) : 50;

  // Contrarian crowding model:
  // > 82nd pct = crowded long (pullback risk)
  // < 25th pct = washed out (bounce potential)
  let signal = 0;
  let regime = 'Balanced';
  if (percentile >= 85) {
    signal = -clamp((percentile - 75) / 45, 0.2, 0.6);
    regime = 'Crowded Long (Pullback Risk)';
  } else if (percentile >= 70) {
    signal = -0.12;
    regime = 'Elevated Longs';
  } else if (percentile <= 22) {
    signal = clamp((35 - percentile) / 45, 0.25, 0.65);
    regime = 'Washed Out (Bounce Setup)';
  } else if (percentile <= 38) {
    signal = 0.18;
    regime = 'Light Positioning';
  }

  return {
    asOf: latest.date,
    netContracts: latest.net,
    weeklyChange: latest.net - prev.net,
    netPctOi: latest.netPctOi,
    percentile52w: percentile,
    regime,
    signal: +signal.toFixed(3),
  };
}

export async function fetchCftcCot() {
  const fetchMarket = async (marketName) => {
    const where = encodeURIComponent(`market_and_exchange_names='${marketName}'`);
    const url =
      `https://publicreporting.cftc.gov/resource/72hh-3qpy.json` +
      `?$where=${where}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=52`;
    const res = await safeFetch(
      url,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
      { timeoutMs: 12000, maxRedirects: 0, allowedHosts: ['publicreporting.cftc.gov'] }
    );
    if (!res.ok) throw new Error(`CFTC ${marketName} HTTP ${res.status}`);
    return computeCotSignal(parseCftcCotRows(await readResponseJsonWithLimit(res, 1024 * 1024)));
  };

  const [gold, silver] = await Promise.all([
    fetchMarket('GOLD - COMMODITY EXCHANGE INC.'),
    fetchMarket('SILVER - COMMODITY EXCHANGE INC.'),
  ]);
  return { gold, silver };
}

/* ---------- 3. Mining Equities & 9-Company Sector Bellwether Basket ---------- */

export const SECTOR_COMPANIES = [
  { key: 'nem', symbol: 'NEM', name: 'Newmont', metal: 'gold' },
  { key: 'aem', symbol: 'AEM', name: 'Agnico Eagle', metal: 'gold' },
  { key: 'b', symbol: 'B', name: 'Barrick Mining', metal: 'gold' },
  { key: 'wpm', symbol: 'WPM', name: 'Wheaton Precious', metal: 'gold' },
  { key: 'fnv', symbol: 'FNV', name: 'Franco-Nevada', metal: 'gold' },
  { key: 'paas', symbol: 'PAAS', name: 'Pan American', metal: 'silver' },
  { key: 'hl', symbol: 'HL', name: 'Hecla Mining', metal: 'silver' },
  { key: 'ag', symbol: 'AG', name: 'First Majestic', metal: 'silver' },
  { key: 'cde', symbol: 'CDE', name: 'Coeur Mining', metal: 'silver' },
];

function pctReturnOver(closes = [], lookback = 5) {
  if (!Array.isArray(closes) || closes.length < 2) return null;
  const idx = Math.max(0, closes.length - 1 - lookback);
  const start = closes[idx];
  const end = closes[closes.length - 1];
  if (!start || !end) return null;
  return +(((end - start) / start) * 100).toFixed(2);
}

function relativeReturnPct(minerCloses = [], metalCloses = [], lookback = 10) {
  const n = Math.min(minerCloses.length, metalCloses.length);
  if (n < 3) return null;
  const idx = Math.max(0, n - 1 - lookback);
  const mEnd = minerCloses[minerCloses.length - 1];
  const mStart = minerCloses[minerCloses.length - 1 - (n - 1 - idx)];
  const spotEnd = metalCloses[metalCloses.length - 1];
  const spotStart = metalCloses[metalCloses.length - 1 - (n - 1 - idx)];
  if (!mStart || !spotStart) return null;

  const minerRet = ((mEnd - mStart) / mStart) * 100;
  const metalRet = ((spotEnd - spotStart) / spotStart) * 100;
  return {
    minerRetPct: +minerRet.toFixed(2),
    metalRetPct: +metalRet.toFixed(2),
    relStrengthPct: +(minerRet - metalRet).toFixed(2),
  };
}

export function computeMinersConfirmation(series = {}) {
  const { gold = [], silver = [], gdx = [], sil = [] } = series;
  const gdxRel = relativeReturnPct(gdx, gold, 10);
  const silRel = relativeReturnPct(sil, silver, 10);

  const sectorLeaders = [];
  for (const co of SECTOR_COMPANIES) {
    const arr = series[co.key];
    if (!Array.isArray(arr) || arr.length < 2) continue;
    const pct1d = pctReturnOver(arr, 1);
    const pct5d = pctReturnOver(arr, 5);
    const win = arr.slice(-14).map((v) => +v.toFixed(2));
    sectorLeaders.push({
      symbol: co.symbol,
      name: co.name,
      metal: co.metal,
      last: +arr[arr.length - 1].toFixed(2),
      pct1d: pct1d ?? 0,
      pct5d: pct5d ?? 0,
      high14: +Math.max(...win).toFixed(2),
      low14: +Math.min(...win).toFixed(2),
      spark: win,
    });
  }

  if (!gdxRel && !silRel && sectorLeaders.length === 0) return null;

  const metalGold5d = pctReturnOver(gold, 5) ?? 0;
  const metalSilver5d = pctReturnOver(silver, 5) ?? 0;

  const goldPeers = sectorLeaders.filter((c) => c.metal === 'gold');
  const silverPeers = sectorLeaders.filter((c) => c.metal === 'silver');

  const avg5d = (list) =>
    list.length ? +(list.reduce((a, b) => a + b.pct5d, 0) / list.length).toFixed(2) : null;
  const breadth = (list) =>
    list.length ? Math.round((list.filter((c) => c.pct5d > 0).length / list.length) * 100) : null;

  const goldPeers5d = avg5d(goldPeers);
  const silverPeers5d = avg5d(silverPeers);
  const goldBreadthPct = breadth(goldPeers);
  const silverBreadthPct = breadth(silverPeers);

  const gdxSig = gdxRel ? clamp(gdxRel.relStrengthPct / 8.5, -0.75, 0.75) : null;
  const silSig = silRel ? clamp(silRel.relStrengthPct / 10.5, -0.75, 0.75) : null;

  const goldPeerSig =
    goldPeers5d != null
      ? clamp((goldPeers5d - metalGold5d) / 9 + ((goldBreadthPct - 50) / 100) * 0.25, -0.7, 0.7)
      : null;
  const silverPeerSig =
    silverPeers5d != null
      ? clamp((silverPeers5d - metalSilver5d) / 11 + ((silverBreadthPct - 50) / 100) * 0.25, -0.7, 0.7)
      : null;

  const goldSignal =
    gdxSig != null && goldPeerSig != null
      ? gdxSig * 0.68 + goldPeerSig * 0.32
      : gdxSig ?? goldPeerSig ?? 0;
  const silverSignal =
    silSig != null && silverPeerSig != null
      ? silSig * 0.68 + silverPeerSig * 0.32
      : silSig ?? silverPeerSig ?? 0;

  return {
    gdxLast: gdx.length ? +gdx[gdx.length - 1].toFixed(2) : null,
    silLast: sil.length ? +sil[sil.length - 1].toFixed(2) : null,
    gdxVsGold10dPct: gdxRel?.relStrengthPct ?? null,
    silVsSilver10dPct: silRel?.relStrengthPct ?? null,
    goldPeers5dPct: goldPeers5d,
    silverPeers5dPct: silverPeers5d,
    goldBreadthPct,
    silverBreadthPct,
    sectorLeaders,
    goldSignal: +clamp(goldSignal, -0.8, 0.8).toFixed(3),
    silverSignal: +clamp(silverSignal, -0.8, 0.8).toFixed(3),
    regime:
      goldSignal > 0.15 || silverSignal > 0.15
        ? 'Miners Leading (Confirmed)'
        : goldSignal < -0.15 || silverSignal < -0.15
          ? 'Miners Lagging (Pressure)'
          : 'In Line with Spot',
  };
}
