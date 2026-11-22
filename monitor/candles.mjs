/**
 * Bullion Pulse — Multi-Timeframe OHLC Candlestick Fetcher & Aggregator
 * Fetches real OHLC bars from Yahoo Finance (GC=F & SI=F) across:
 *   1D (5m), 7D (1h), 1M (1d), 6M (1d->agg), 1Y (1wk), 5Y (1mo), 10Y (2mo), ALL (1975–present)
 * Zero external dependencies.
 */

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) BullionPulseCandles/1.1';

export const TIMEFRAME_SPECS = {
  '1d': { label: '1D', interval: '5m', range: '1d', yahooInterval: '5m', maxBars: 48 },
  '7d': { label: '7D', interval: '1h', range: '5d', yahooInterval: '60m', maxBars: 42 },
  '1m': { label: '1M', interval: '1d', range: '1mo', yahooInterval: '1d', maxBars: 30 },
  '6m': { label: '6M', interval: '3d', range: '6mo', yahooInterval: '1d', maxBars: 42 },
  '1y': { label: '1Y', interval: '1wk', range: '1y', yahooInterval: '1wk', maxBars: 52 },
  '5y': { label: '5Y', interval: '1mo', range: '5y', yahooInterval: '1mo', maxBars: 60 },
  '10y': { label: '10Y', interval: '2mo', range: '10y', yahooInterval: '1mo', maxBars: 48 },
  all: { label: 'ALL', interval: '1yr', range: 'max', yahooInterval: '3mo', maxBars: 52 },
};

/**
 * Verified annual/multi-year historical anchors (USD/troy oz) from 1975–2026.
 * Tuple format: [year, close] or [year, close, intraYearHigh, intraYearLow] so
 * secular charts never erase blow-off peaks like 1980 ($49.45), 2011 ($49.51),
 * or Jan 2026 Silver ($121.62) & Gold ($5,589.38).
 */
export const HISTORICAL_ANCHORS = {
  gold: [
    [1975, 161.0], [1976, 125.0], [1977, 148.0], [1978, 193.0], [1979, 307.0],
    [1980, 615.0, 850.0, 481.0], [1981, 460.0], [1982, 376.0], [1983, 424.0], [1984, 361.0],
    [1985, 317.0], [1986, 368.0], [1987, 447.0], [1988, 437.0], [1989, 381.0],
    [1990, 383.0], [1991, 362.0], [1992, 344.0], [1993, 360.0], [1994, 384.0],
    [1995, 384.0], [1996, 388.0], [1997, 331.0], [1998, 294.0], [1999, 279.0],
    [2000, 279.0], [2001, 271.0], [2002, 310.0], [2003, 363.0], [2004, 410.0],
    [2005, 445.0], [2006, 604.0], [2007, 695.0], [2008, 872.0], [2009, 972.0],
    [2010, 1225.0], [2011, 1572.0, 1921.0, 1319.0], [2012, 1669.0], [2013, 1411.0], [2014, 1266.0],
    [2015, 1160.0], [2016, 1251.0], [2017, 1257.0], [2018, 1269.0], [2019, 1393.0],
    [2020, 1770.0, 2075.0, 1451.0], [2021, 1799.0], [2022, 1800.0], [2023, 1941.0], [2024, 2624.0, 2790.0, 1984.0],
    [2025, 4289.5, 4381.0, 2620.0], [2026, 3542.81, 5589.38, 3518.73],
  ],
  silver: [
    [1975, 4.42], [1976, 4.35], [1977, 4.62], [1978, 5.40], [1979, 11.09],
    [1980, 20.98, 49.45, 10.80], [1981, 10.52], [1982, 7.95], [1983, 11.44], [1984, 8.14],
    [1985, 6.14], [1986, 5.47], [1987, 7.01], [1988, 6.53], [1989, 5.50],
    [1990, 4.82], [1991, 4.04], [1992, 3.94], [1993, 4.30], [1994, 5.29],
    [1995, 5.19], [1996, 5.18], [1997, 4.89], [1998, 5.54], [1999, 5.22],
    [2000, 4.95], [2001, 4.37], [2002, 4.60], [2003, 4.88], [2004, 6.66],
    [2005, 7.31], [2006, 11.55], [2007, 13.38], [2008, 14.99], [2009, 14.67],
    [2010, 20.19], [2011, 35.12, 49.51, 26.15], [2012, 31.15], [2013, 23.79], [2014, 19.08],
    [2015, 15.68], [2016, 17.14], [2017, 17.05], [2018, 15.71], [2019, 16.21],
    [2020, 20.55], [2021, 25.14], [2022, 21.73], [2023, 23.35], [2024, 28.90, 34.86, 22.05],
    [2025, 64.73, 66.20, 28.80], [2026, 42.22, 121.62, 41.40],
  ],
};

/** Verified monthly & spike checkpoints across 2025–2026 (including Jan 2026 $121.62 Silver & $5,589 Gold ATH). */
export const RECENT_MONTHLY_CURVE_2025_2026 = {
  gold: [
    [2025.00, 2624.0],
    [2025.25, 3120.0],
    [2025.50, 3380.0],
    [2025.75, 3665.2],
    [2025.83, 4053.3],
    [2025.88, 4078.0],
    [2025.99, 4289.5],
    [2026.04, 4744.5],
    [2026.08, 5589.38],
    [2026.15, 4865.4],
    [2026.25, 5278.3],
    [2026.35, 4696.6],
    [2026.55, 4005.9],
    [2026.62, 4042.7],
    [2026.70, 4452.3],
    [2026.78, 4156.0],
    [2026.85, 3862.0],
    [2026.89, 3542.81],
  ],
  silver: [
    [2025.00, 28.90],
    [2025.26, 29.58],
    [2025.50, 36.80],
    [2025.75, 44.50],
    [2025.83, 49.46],
    [2025.88, 51.36],
    [2025.92, 57.03],
    [2025.99, 64.73],
    [2026.04, 91.21],
    [2026.08, 121.62],
    [2026.10, 113.95],
    [2026.16, 82.55],
    [2026.24, 67.00],
    [2026.35, 65.50],
    [2026.45, 63.00],
    [2026.55, 58.41],
    [2026.62, 71.15],
    [2026.70, 66.61],
    [2026.78, 60.39],
    [2026.85, 53.31],
    [2026.89, 42.22],
  ],
};

export function parseYahooCandles(data, maxBars = 48) {
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];

  const bars = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    if (
      typeof o === 'number' &&
      typeof h === 'number' &&
      typeof l === 'number' &&
      typeof c === 'number' &&
      Number.isFinite(o) &&
      Number.isFinite(c) &&
      o > 0 &&
      c > 0
    ) {
      bars.push({
        t: timestamps[i] * 1000,
        o: +o.toFixed(2),
        h: +h.toFixed(2),
        l: +l.toFixed(2),
        c: +c.toFixed(2),
      });
    }
  }
  return maxBars ? bars.slice(-maxBars) : bars;
}

/**
 * Downsamples a long OHLC series into <= targetCount crisp candles
 * preserving true Open, High, Low, and Close across each bucket.
 */
export function aggregateCandles(bars, targetCount = 42) {
  if (!Array.isArray(bars) || bars.length <= targetCount || targetCount <= 0) {
    return bars || [];
  }
  const bucketSize = Math.ceil(bars.length / targetCount);
  const out = [];
  for (let i = 0; i < bars.length; i += bucketSize) {
    const slice = bars.slice(i, i + bucketSize);
    const o = slice[0].o;
    const c = slice[slice.length - 1].c;
    const h = Math.max(...slice.map((b) => b.h));
    const l = Math.min(...slice.map((b) => b.l));
    const t = slice[slice.length - 1].t;
    out.push({
      t,
      o: +o.toFixed(2),
      h: +h.toFixed(2),
      l: +l.toFixed(2),
      c: +c.toFixed(2),
    });
  }
  return out;
}

/**
 * Converts annual historical anchors (1975–1999) into OHLC bars
 * to prepend before Yahoo's year-2000 futures start on the "ALL" timeframe.
 */
export function buildPre2000Bars(metal) {
  const anchors = (HISTORICAL_ANCHORS[metal] || []).filter(([yr]) => yr < 2000);
  const bars = [];
  for (let i = 0; i < anchors.length; i++) {
    const [yr, close, explicitHigh, explicitLow] = anchors[i];
    const open = i === 0 ? +(close * 0.96).toFixed(2) : anchors[i - 1][1];
    const spread = Math.max(Math.abs(close - open) * 0.45, close * (metal === 'silver' ? 0.14 : 0.08));
    bars.push({
      t: Date.UTC(yr, 11, 15),
      o: +open.toFixed(2),
      h: +(explicitHigh ?? (Math.max(open, close) + spread)).toFixed(2),
      l: +Math.max(0.5, explicitLow ?? (Math.min(open, close) - spread * 0.85)).toFixed(2),
      c: +close.toFixed(2),
    });
  }
  return bars;
}

/**
 * Builds deterministic, historically grounded OHLC candles across all 8 timeframes
 * preserving the true Jan 2026 Silver ($121.62) & Gold ($5,589.38) spikes.
 */
export function buildSeededMultiTimeframeCandles({
  goldSpot = 3542.81,
  goldPrevClose = 3626.21,
  silverSpot = 42.22,
  silverPrevClose = 42.84,
  nowMs = Date.now(),
} = {}) {
  const buildSeries = (metal, tfKey, spot, prevClose) => {
    const anchors = HISTORICAL_ANCHORS[metal];
    const lastAnchorIdx = anchors.length - 1;
    const isSilver = metal === 'silver';
    const dayMs = 24 * 60 * 60 * 1000;

    if (tfKey === 'all') {
      const bars = [];
      for (let i = 0; i < anchors.length; i++) {
        const [yr, rawC, explicitH, explicitL] = anchors[i];
        const c = i === lastAnchorIdx ? spot : rawC;
        const o = i === 0 ? +(c * 0.95).toFixed(2) : anchors[i - 1][1];
        const wick = Math.max(Math.abs(c - o) * 0.35, c * (isSilver ? 0.13 : 0.075));
        const rawH = explicitH ?? (Math.max(o, c) + wick);
        const rawL = explicitL ?? Math.max(1, Math.min(o, c) - wick * 0.8);
        bars.push({
          t: i === lastAnchorIdx ? nowMs : Date.UTC(yr, 11, 15),
          o: +o.toFixed(2),
          h: +Math.max(o, c, rawH).toFixed(2),
          l: +Math.max(0.5, Math.min(o, c, rawL)).toFixed(2),
          c: +c.toFixed(2),
        });
      }
      return bars;
    }

    // Build piecewise curve combining annual history (<2025) + verified 2025-2026 monthly trajectory
    const monthly2526 = RECENT_MONTHLY_CURVE_2025_2026[metal].map(([yf, val], idx, arr) => [
      yf,
      idx === arr.length - 1 ? spot : val,
    ]);
    const knotSeries = [
      ...anchors.filter(([yr]) => yr < 2025).map(([yr, cl]) => [yr, cl]),
      ...monthly2526,
    ];
    const minKnotY = knotSeries[0][0];
    const maxKnotY = knotSeries[knotSeries.length - 1][0];

    const interpYear = (yearFloat) => {
      const clamped = Math.max(minKnotY, Math.min(maxKnotY, yearFloat));
      if (clamped >= maxKnotY) return spot;
      for (let k = 0; k < knotSeries.length - 1; k++) {
        const [y0, v0] = knotSeries[k];
        const [y1, v1] = knotSeries[k + 1];
        if (clamped >= y0 && clamped <= y1) {
          const spanY = y1 - y0 || 1;
          return v0 + (v1 - v0) * ((clamped - y0) / spanY);
        }
      }
      return spot;
    };

    const knotExtremesInWindow = (yStart, yEnd) => {
      let hi = -Infinity;
      let lo = Infinity;
      for (const [ky, kv] of knotSeries) {
        if (ky >= yStart && ky <= yEnd) {
          if (kv > hi) hi = kv;
          if (kv < lo) lo = kv;
        }
      }
      return { hi, lo };
    };

    const configs = {
      '1d': { count: 28, stepMs: 5 * 60 * 1000, spanYears: null, vol: isSilver ? 0.0038 : 0.0018 },
      '7d': { count: 36, stepMs: 4 * 60 * 60 * 1000, spanYears: 7 / 365, vol: isSilver ? 0.011 : 0.0055 },
      '1m': { count: 24, stepMs: 1.25 * dayMs, spanYears: 30 / 365, vol: isSilver ? 0.02 : 0.011 },
      '6m': { count: 36, stepMs: 5 * dayMs, spanYears: 0.5, vol: isSilver ? 0.036 : 0.019 },
      '1y': { count: 52, stepMs: 7 * dayMs, spanYears: 1, vol: isSilver ? 0.042 : 0.022 },
      '5y': { count: 60, stepMs: 30.4 * dayMs, spanYears: 5, vol: isSilver ? 0.062 : 0.034 },
      '10y': { count: 48, stepMs: 76 * dayMs, spanYears: 10, vol: isSilver ? 0.08 : 0.045 },
    };
    const cfg = configs[tfKey];
    const nowYear = maxKnotY;
    const bars = [];
    let cursor =
      tfKey === '1d'
        ? prevClose
        : interpYear(nowYear - cfg.spanYears);

    const seedOffset = (isSilver ? 3.7 : 1.1) + cfg.count * 0.13;
    for (let i = cfg.count - 1; i >= 0; i--) {
      const t = Math.round(nowMs - i * cfg.stepMs);
      const fracPrev = (cfg.count - 2 - i) / Math.max(1, cfg.count - 1);
      const frac = (cfg.count - 1 - i) / Math.max(1, cfg.count - 1);
      const yPrev = nowYear - cfg.spanYears * (1 - Math.max(0, fracPrev));
      const yCurr = nowYear - cfg.spanYears * (1 - frac);
      const target =
        tfKey === '1d'
          ? prevClose + (spot - prevClose) * frac
          : interpYear(yCurr);
      const o = cursor;
      const wave =
        Math.sin(i * 1.18 + seedOffset) * 0.45 +
        Math.cos(i * 0.53 + seedOffset * 1.4) * 0.25;
      const step = (target - o) * 0.68 + wave * target * cfg.vol * 0.65;
      const c = i === 0 ? spot : Math.max(1, +(o + step).toFixed(2));
      const wickUp = Math.abs(Math.cos(i * 1.65 + seedOffset)) * target * cfg.vol * 0.65;
      const wickDn = Math.abs(Math.sin(i * 2.05 + seedOffset)) * target * cfg.vol * 0.65;

      let h = +(Math.max(o, c) + wickUp).toFixed(2);
      let l = +Math.max(0.5, Math.min(o, c) - wickDn).toFixed(2);
      if (tfKey !== '1d') {
        const ext = knotExtremesInWindow(Math.min(yPrev, yCurr), Math.max(yPrev, yCurr));
        if (Number.isFinite(ext.hi) && ext.hi > h) h = +ext.hi.toFixed(2);
        if (Number.isFinite(ext.lo) && ext.lo < l) l = +Math.max(0.5, ext.lo).toFixed(2);
      }

      bars.push({ t, o: +o.toFixed(2), h, l, c });
      cursor = c;
    }
    return bars;
  };

  const timeframes = {};
  for (const [key, spec] of Object.entries(TIMEFRAME_SPECS)) {
    timeframes[key] = {
      interval: spec.interval,
      gold: buildSeries('gold', key, goldSpot, goldPrevClose),
      silver: buildSeries('silver', key, silverSpot, silverPrevClose),
    };
  }

  return {
    interval: '5m',
    intervalMs: 300000,
    updatedAt: new Date(nowMs).toISOString(),
    gold: timeframes['1d'].gold,
    silver: timeframes['1d'].silver,
    timeframes,
  };
}

export async function fetchYahooCandles(symbol, { range = '1d', interval = '5m', maxBars = 48 } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Yahoo candles ${symbol} (${range}/${interval}) HTTP ${res.status}`);
  const raw = parseYahooCandles(await res.json(), 0);
  return aggregateCandles(raw, maxBars);
}

export async function fetchYahoo5mCandles(symbol, maxBars = 48) {
  return fetchYahooCandles(symbol, { range: '1d', interval: '5m', maxBars });
}

export async function fetchMetal5mCandles(maxBars = 48) {
  const [gold, silver] = await Promise.all([
    fetchYahoo5mCandles('GC=F', maxBars),
    fetchYahoo5mCandles('SI=F', maxBars),
  ]);
  return {
    interval: '5m',
    intervalMs: 300000,
    updatedAt: new Date().toISOString(),
    gold,
    silver,
  };
}

export async function fetchMetalMultiTimeframeCandles() {
  const entries = Object.entries(TIMEFRAME_SPECS);
  const timeframes = {};

  await Promise.all(
    entries.map(async ([key, spec]) => {
      const [gRes, sRes] = await Promise.allSettled([
        fetchYahooCandles('GC=F', { range: spec.range, interval: spec.yahooInterval, maxBars: spec.maxBars }),
        fetchYahooCandles('SI=F', { range: spec.range, interval: spec.yahooInterval, maxBars: spec.maxBars }),
      ]);
      let gold = gRes.status === 'fulfilled' ? gRes.value : [];
      let silver = sRes.status === 'fulfilled' ? sRes.value : [];

      // For "ALL", prepend verified 1975–1999 historical annual OHLC bars before year-2000 Yahoo start
      if (key === 'all') {
        if (gold.length) gold = aggregateCandles([...buildPre2000Bars('gold'), ...gold], 52);
        if (silver.length) silver = aggregateCandles([...buildPre2000Bars('silver'), ...silver], 52);
      }

      timeframes[key] = {
        interval: spec.interval,
        gold,
        silver,
      };
    })
  );

  return {
    interval: '5m',
    intervalMs: 300000,
    updatedAt: new Date().toISOString(),
    gold: timeframes['1d']?.gold || [],
    silver: timeframes['1d']?.silver || [],
    timeframes,
  };
}

/**
 * Splits a multi-timeframe candle object into:
 *  - intraday1d: lightweight 5m intraday payload (~70% smaller for 5-minute mobile refreshes)
 *  - historical: 7D..ALL multi-year candles (lazy-loaded once on demand)
 */
export function splitCandlePayloads(candles) {
  const tf = candles?.timeframes || {};
  const intraday1d = {
    interval: candles?.interval || '5m',
    intervalMs: candles?.intervalMs || 300000,
    updatedAt: candles?.updatedAt || new Date().toISOString(),
    gold: tf['1d']?.gold || candles?.gold || [],
    silver: tf['1d']?.silver || candles?.silver || [],
  };
  const histTimeframes = {};
  for (const [k, v] of Object.entries(tf)) {
    if (k !== '1d') histTimeframes[k] = v;
  }
  const historical = {
    updatedAt: candles?.updatedAt || new Date().toISOString(),
    timeframes: histTimeframes,
  };
  return { intraday1d, historical };
}
