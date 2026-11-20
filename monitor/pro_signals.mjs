/**
 * Bullion Pulse — Institutional Pro Quant Signals Module
 * Zero external dependencies (Node.js 20+ built-in fetch), 100% free & anonymous.
 *
 * 1. FRED 10Y Real Yields (DFII10) & 10Y Breakeven Inflation (T10YIE)
 * 2. CFTC Disaggregated Commitments of Traders (COT) Managed Money Crowding (72hh-3qpy)
 * 3. Mining Equities Relative Strength Confirmation (GDX/Gold & SIL/Silver)
 */

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) BullionPulseQuant/1.0';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/* ---------- 1. FRED Real Yields (DFII10) & Breakevens (T10YIE) ---------- */

export function parseFredCsv(csvText, maxRows = 60) {
  const lines = String(csvText || '').trim().split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, rawVal] = lines[i].split(',');
    const val = parseFloat(rawVal);
    if (date && Number.isFinite(val)) {
      rows.push({ date: date.trim(), value: val });
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

export async function fetchFredRealYields() {
  const fetchSeries = async (id) => {
    const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`FRED ${id} HTTP ${res.status}`);
    return parseFredCsv(await res.text(), 60);
  };

  const [dfii10, t10yie] = await Promise.all([fetchSeries('DFII10'), fetchSeries('T10YIE')]);
  return computeRealYieldSignal(dfii10, t10yie);
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
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`CFTC ${marketName} HTTP ${res.status}`);
    return computeCotSignal(parseCftcCotRows(await res.json()));
  };

  const [gold, silver] = await Promise.all([
    fetchMarket('GOLD - COMMODITY EXCHANGE INC.'),
    fetchMarket('SILVER - COMMODITY EXCHANGE INC.'),
  ]);
  return { gold, silver };
}

/* ---------- 3. Mining Equities Relative Strength (GDX & SIL) ---------- */

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

export function computeMinersConfirmation({ gold = [], silver = [], gdx = [], sil = [] }) {
  const gdxRel = relativeReturnPct(gdx, gold, 10);
  const silRel = relativeReturnPct(sil, silver, 10);
  if (!gdxRel && !silRel) return null;

  const goldSignal = gdxRel ? clamp(gdxRel.relStrengthPct / 8.5, -0.7, 0.7) : 0;
  const silverSignal = silRel ? clamp(silRel.relStrengthPct / 10.5, -0.7, 0.7) : 0;

  return {
    gdxLast: gdx.length ? +gdx[gdx.length - 1].toFixed(2) : null,
    silLast: sil.length ? +sil[sil.length - 1].toFixed(2) : null,
    gdxVsGold10dPct: gdxRel?.relStrengthPct ?? null,
    silVsSilver10dPct: silRel?.relStrengthPct ?? null,
    goldSignal: +goldSignal.toFixed(3),
    silverSignal: +silverSignal.toFixed(3),
    regime:
      goldSignal > 0.15 || silverSignal > 0.15
        ? 'Miners Leading (Confirmed)'
        : goldSignal < -0.15 || silverSignal < -0.15
          ? 'Miners Lagging (Divergence)'
          : 'In Line with Spot',
  };
}
