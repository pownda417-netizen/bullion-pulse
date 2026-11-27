/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  CandleBar,
  ChartMode,
  CurrencyCode,
  TimeframeKey,
  UnitMode,
} from '../types/bullion';
import { clampNum, convertUnit, DEFAULT_FX_RATES, formatMoney } from '../utils/format';
import { analyzeMarketGaps } from '../../monitor/historical_patterns.mjs';

export interface ChartRenderOptions {
  canvas: HTMLCanvasElement;
  rsiCanvas?: HTMLCanvasElement | null;
  bars: CandleBar[];
  mode: ChartMode;
  timeframe: TimeframeKey;
  unit: UnitMode;
  currency: CurrencyCode;
  fxRates: Record<CurrencyCode, number>;
  livePrice: number | null;
  hoverIdx: number | null;
  zoomStart: number | null;
  zoomCount: number | null;
  overlays: {
    showForecast: boolean;
    showDiscovery: boolean;
    showSqueeze: boolean;
    showFib: boolean;
    showSma: boolean;
    showRsi: boolean;
    showPatterns: boolean;
    showGaps: boolean;
    showSessions: boolean;
  };
  precisionLine?: any;
  activeRegime?: any;
  metalUnit?: number;
  isLightTheme?: boolean;
}

export interface ChartGeometry {
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  plotW: number;
  plotH: number;
  candleAreaW: number;
  startIdx: number;
  visibleCount: number;
  totalSlots: number;
  slotW: number;
  minP: number;
  maxP: number;
  forecastBars: number;
  displayBars: CandleBar[];
}

export const CHART_FORECAST_HALF_SPECS: Readonly<
  Record<TimeframeKey, { label: string; horizonFrac: number }>
> = {
  '15min': { label: '+7.5m', horizonFrac: 0.5 },
  '1h':    { label: '+30m',  horizonFrac: 0.5 },
  '4h':    { label: '+2H',   horizonFrac: 0.5 },
  '1d':    { label: '+12H',  horizonFrac: 0.5 },
  '7d':    { label: '+3.5D', horizonFrac: 0.5 },
  '1m':    { label: '+15D',  horizonFrac: 0.5 },
  '6m':    { label: '+3M',   horizonFrac: 0.5 },
  '1y':    { label: '+6M',   horizonFrac: 0.5 },
  '5y':    { label: '+2.5Y', horizonFrac: 0.5 },
  '10y':   { label: '+5Y',   horizonFrac: 1.0 },
  all:     { label: '+5Y',   horizonFrac: 1.0 },
};

export function resampleBarsForDisplay(rawBars: CandleBar[], maxBars: number): CandleBar[] {
  if (!Array.isArray(rawBars) || rawBars.length <= maxBars || maxBars < 12) {
    return rawBars;
  }
  const groupSize = Math.ceil(rawBars.length / maxBars);
  if (groupSize <= 1) return rawBars;
  const out: CandleBar[] = [];
  for (let i = 0; i < rawBars.length; i += groupSize) {
    const end = Math.min(rawBars.length, i + groupSize);
    const first = rawBars[i];
    const last = rawBars[end - 1];
    let hi = first.h;
    let lo = first.l;
    let vol = 0;
    for (let j = i; j < end; j++) {
      if (rawBars[j].h > hi) hi = rawBars[j].h;
      if (rawBars[j].l < lo) lo = rawBars[j].l;
      vol += Number(rawBars[j].v || 0);
    }
    out.push({
      t: last.t,
      o: first.o,
      h: hi,
      l: lo,
      c: last.c,
      v: vol,
    });
  }
  return out;
}

export function buildExtendedChartForecast(
  precisionLine: any,
  timeframe: TimeframeKey,
  startPrice: number,
  steps = 16
): { points: number[]; horizonLabel: string } {
  const spec = CHART_FORECAST_HALF_SPECS[timeframe] || CHART_FORECAST_HALF_SPECS['1d'];
  const rawPts: any[] = Array.isArray(precisionLine?.points)
    ? precisionLine.points
    : Array.isArray(precisionLine?.path)
      ? precisionLine.path
      : [];

  const parsed: number[] = [];
  for (const pt of rawPts) {
    const p = Number(typeof pt === 'number' ? pt : pt?.price ?? pt?.mid ?? pt?.value);
    if (Number.isFinite(p) && p > 0) parsed.push(p);
  }

  if (parsed.length >= 2) {
    // Anchor raw curve cleanly to live startPrice so there is never a discontinuity
    const base0 = parsed[0];
    const ratio = base0 > 0 ? startPrice / base0 : 1;
    const anchored = parsed.map((p) => p * ratio);
    const maxIdx = Math.max(1, (anchored.length - 1) * spec.horizonFrac);
    const out: number[] = [];
    for (let k = 1; k <= steps; k++) {
      const pos = (k / steps) * maxIdx;
      const lo = Math.floor(pos);
      const hi = Math.min(anchored.length - 1, Math.ceil(pos));
      const t = pos - lo;
      const val = anchored[lo] * (1 - t) + anchored[hi] * t;
      out.push(+val.toFixed(2));
    }
    return { points: out, horizonLabel: spec.label };
  }

  // Fallback smooth trajectory when precisionLine has no points yet
  const pctBias = (clampNum(Number(precisionLine?.expectedMovePct ?? 0.6), -8, 8) / 100) * spec.horizonFrac;
  const out: number[] = [];
  for (let k = 1; k <= steps; k++) {
    out.push(+(startPrice * (1 + pctBias * (k / steps))).toFixed(2));
  }
  return { points: out, horizonLabel: spec.label };
}

function calcSma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function calcRsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / period;
  let avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function computePriceDiscoverySeries(bars: CandleBar[], regimeObj: any, metalUnit = 0): number[] {
  if (!Array.isArray(bars) || !bars.length) return [];
  const n = bars.length;
  const period = Math.min(26, Math.max(8, Math.round(n * 0.28)));
  const alpha = 2 / (period + 1);
  const discScore = Number.isFinite(Number(regimeObj?.discoveryScore)) ? Number(regimeObj.discoveryScore) : 45;
  const discTilt = clampNum((discScore - 45) / 100, -0.4, 0.55);
  const unitTilt = clampNum(metalUnit || 0, -1, 1);

  const out = new Array<number>(n);
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

function computeShortSqueezeSeries(bars: CandleBar[], regimeObj: any): number[] {
  if (!Array.isArray(bars) || !bars.length) return [];
  const n = bars.length;
  const sqzScore = Number.isFinite(Number(regimeObj?.squeezeScore)) ? Number(regimeObj.squeezeScore) : 35;
  const sqzIntensity = clampNum(sqzScore / 100, 0.1, 1.0);
  const backwBoost = regimeObj?.isBackwardation ? 0.22 : 0;

  const fastPeriod = Math.min(12, Math.max(5, Math.round(n * 0.14)));
  const fastAlpha = 2 / (fastPeriod + 1);
  const out = new Array<number>(n);

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

    const baseAnchor = Math.max(fastEma, b.c * 0.5 + fastEma * 0.5);
    const volSpread = atrPct * (0.65 + sqzIntensity * 1.45 + backwBoost);
    const stretch = velocity * (0.45 + sqzIntensity * 0.85);
    out[i] = Math.max(0.01, baseAnchor * (1 + clampNum(volSpread + stretch, 0.0015, 0.12)));
  }
  return out;
}

export interface SessionMarker {
  barIdx: number;
  label: string;
  color: string;
  priority: number;
  kind: 'open' | 'close';
}

const NY_CLOCK_FMT =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null;

function getNyClockParts(tsMs: number): { wd: string; mins: number } {
  if (!NY_CLOCK_FMT) {
    const d = new Date(tsMs);
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    return { wd, mins: ((d.getUTCHours() - 5 + 24) % 24) * 60 + d.getUTCMinutes() };
  }
  const parts = NY_CLOCK_FMT.formatToParts(new Date(tsMs));
  const wd = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
  let hr = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  if (hr === 24) hr = 0;
  const min = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return { wd, mins: hr * 60 + min };
}

function crossedMinuteMark(prevMins: number, currMins: number, targetMins: number): boolean {
  if (prevMins <= currMins) {
    return prevMins < targetMins && currMins >= targetMins;
  }
  // Midnight rollover (e.g. 23:55 -> 00:05)
  return prevMins < targetMins || currMins >= targetMins;
}

export function detectMarketSessionMarkers(
  visBars: CandleBar[],
  timeframe: TimeframeKey,
  nowMs: number = Date.now()
): SessionMarker[] {
  if (!Array.isArray(visBars) || visBars.length < 2) return [];
  const markers: SessionMarker[] = [];
  const isIntraday = timeframe === '15min' || timeframe === '1h' || timeframe === '4h' || timeframe === '1d';
  const isMultiDay = timeframe === '7d' || timeframe === '1m';
  if (!isIntraday && !isMultiDay) return markers;

  const markedIdx = new Set<number>();

  if (isIntraday) {
    for (let i = 1; i < visBars.length; i++) {
      const prev = visBars[i - 1];
      const curr = visBars[i];
      if (!prev?.t || !curr?.t) continue;
      const dtMs = curr.t - prev.t;

      // 1. Actual exchange close/reopen halt gaps (catches weekends, 5-6 PM ET daily breaks, & holidays like Black Friday)
      if (dtMs >= 20 * 3600_000) {
        markers.push({ barIdx: i - 1, label: 'Mkt Close', color: '#f87171', priority: 5, kind: 'close' });
        markers.push({ barIdx: i, label: 'Mkt Open', color: '#22c55e', priority: 5, kind: 'open' });
        markedIdx.add(i - 1);
        markedIdx.add(i);
        continue;
      }
      if (dtMs >= 45 * 60_000) {
        markers.push({ barIdx: i - 1, label: 'Mkt Close', color: '#f87171', priority: 4, kind: 'close' });
        markers.push({ barIdx: i, label: 'Mkt Open', color: '#38bdf8', priority: 4, kind: 'open' });
        markedIdx.add(i - 1);
        markedIdx.add(i);
        continue;
      }

      // 2. Major scheduled global bullion opens & closes (America/New_York DST-safe)
      const prevNy = getNyClockParts(prev.t);
      const currNy = getNyClockParts(curr.t);
      if (crossedMinuteMark(prevNy.mins, currNy.mins, 17 * 60)) {
        markers.push({ barIdx: i, label: 'Mkt Close', color: '#f87171', priority: 4, kind: 'close' });
        markedIdx.add(i);
      } else if (crossedMinuteMark(prevNy.mins, currNy.mins, 18 * 60)) {
        markers.push({ barIdx: i, label: 'Mkt Open', color: '#38bdf8', priority: 4, kind: 'open' });
        markedIdx.add(i);
      } else if (crossedMinuteMark(prevNy.mins, currNy.mins, 8 * 60 + 20)) {
        markers.push({ barIdx: i, label: 'NY Open', color: '#22c55e', priority: 3, kind: 'open' });
        markedIdx.add(i);
      } else if (crossedMinuteMark(prevNy.mins, currNy.mins, 3 * 60)) {
        markers.push({ barIdx: i, label: 'Lon Open', color: '#d4a843', priority: 2, kind: 'open' });
        markedIdx.add(i);
      } else if (crossedMinuteMark(prevNy.mins, currNy.mins, 11 * 60 + 30)) {
        markers.push({ barIdx: i, label: 'Lon Close', color: '#f59e0b', priority: 1, kind: 'close' });
        markedIdx.add(i);
      }
    }
  } else if (isMultiDay) {
    // Weekly market open markers across 7D / 1M views
    for (let i = 1; i < visBars.length; i++) {
      const prev = visBars[i - 1];
      const curr = visBars[i];
      if (!prev?.t || !curr?.t) continue;
      const dtMs = curr.t - prev.t;
      const currNy = getNyClockParts(curr.t);
      const prevNy = getNyClockParts(prev.t);
      if (dtMs >= 36 * 3600_000 || (currNy.wd === 'Mon' && prevNy.wd !== 'Mon' && prevNy.wd !== 'Sun')) {
        markers.push({ barIdx: i, label: 'Wk Open', color: '#38bdf8', priority: 4, kind: 'open' });
      }
    }
  }

  // 3. Live right-edge market closed marker during Weekend Close or Daily 5-6 PM ET Settlement Break
  const nowNy = getNyClockParts(nowMs);
  const isWeekendClosed =
    nowNy.wd === 'Sat' ||
    (nowNy.wd === 'Fri' && nowNy.mins >= 17 * 60) ||
    (nowNy.wd === 'Sun' && nowNy.mins < 18 * 60);
  const isDailyBreak =
    nowNy.wd !== 'Sat' && nowNy.wd !== 'Sun' && nowNy.mins >= 17 * 60 && nowNy.mins < 18 * 60;
  if (isWeekendClosed || isDailyBreak) {
    const lastIdx = visBars.length - 1;
    markers.push({
      barIdx: lastIdx,
      label: isWeekendClosed ? 'Mkt Closed' : 'Daily Break',
      color: '#f87171',
      priority: 6,
      kind: 'close',
    });
  }

  return markers;
}

export function buildRatioBars(goldBars: CandleBar[], silverBars: CandleBar[]): CandleBar[] {
  const len = Math.min(goldBars.length, silverBars.length);
  if (len === 0) return [];
  const gSlice = goldBars.slice(-len);
  const sSlice = silverBars.slice(-len);
  const out: CandleBar[] = [];
  for (let i = 0; i < len; i++) {
    const g = gSlice[i];
    const s = sSlice[i];
    if (!s || s.c <= 0 || s.o <= 0 || s.l <= 0) continue;
    const o = +(g.o / s.o).toFixed(2);
    const c = +(g.c / s.c).toFixed(2);
    const h = +Math.max(o, c, g.h / Math.max(0.01, s.l)).toFixed(2);
    const l = +Math.min(o, c, g.l / Math.max(0.01, s.h)).toFixed(2);
    out.push({ t: g.t, o, h, l, c });
  }
  return out;
}

export function renderCandlestickChart(opts: ChartRenderOptions): ChartGeometry | null {
  const {
    canvas,
    rsiCanvas,
    bars,
    mode,
    unit,
    currency,
    fxRates = DEFAULT_FX_RATES,
    livePrice,
    hoverIdx,
    zoomStart,
    zoomCount,
    overlays,
    precisionLine,
    activeRegime,
    metalUnit = 0,
    isLightTheme = false,
  } = opts;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(280, Math.round(rect.width || canvas.clientWidth || 680));
  const cssH = Math.max(220, Math.round(rect.height || canvas.clientHeight || 300));
  // v60 ASM hardening: clamp DPR <= 2.5 to avoid GPU memory bloat
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const textCol = isLightTheme ? '#3f3f46' : '#9ca3af';
  const gridCol = isLightTheme ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
  const bullCol = '#22c55e';
  const bearCol = '#ef4444';
  const accentCol = mode === 'silver' ? '#94a3b8' : mode === 'ratio' ? '#a855f7' : '#d4a843';

  if (!bars.length) {
    ctx.fillStyle = textCol;
    ctx.font = '500 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Loading market bars…', cssW / 2, cssH / 2);
    return null;
  }

  const total = bars.length;
  const visibleCount = clampNum(zoomCount ?? total, Math.min(6, total), total);
  const startIdx = clampNum(zoomStart ?? Math.max(0, total - visibleCount), 0, Math.max(0, total - visibleCount));
  const rawVisBars = bars.slice(startIdx, startIdx + visibleCount);

  const padL = 12;
  const padR = 66;
  const padT = 22;
  const padB = 26;
  const plotW = Math.max(100, cssW - padL - padR);
  const plotH = Math.max(100, cssH - padT - padB);

  // Allocate exact 2:1 visual ratio (67% candles, 33% future forecast zone = visual +50% horizon extension!)
  const showFc = overlays.showForecast && mode !== 'ratio';
  const candleAreaW = showFc ? Math.round(plotW * 0.67) : plotW;
  const forecastAreaW = showFc ? Math.max(48, plotW - candleAreaW) : 0;

  // Smart OHLC aggregation so candles stay bold & smoothly increase in detail as you zoom in
  const maxReadableBars = Math.max(28, Math.floor(candleAreaW / 7.5));
  const visBars = resampleBarsForDisplay(rawVisBars, maxReadableBars);

  // Compute dynamic Fair Value (Price Discovery) & Short Squeeze curves cleanly on displayed OHLC bars
  const discoverySeries =
    overlays.showDiscovery && mode !== 'ratio'
      ? computePriceDiscoverySeries(visBars, activeRegime, metalUnit)
      : null;
  const squeezeSeries =
    overlays.showSqueeze && mode !== 'ratio'
      ? computeShortSqueezeSeries(visBars, activeRegime)
      : null;

  // Analyze market gaps directly on the displayed window so indices & fill zones align 100% with visible candles
  const visGapAnalysis =
    overlays.showGaps && mode !== 'ratio' && visBars.length >= 2
      ? analyzeMarketGaps(visBars, livePrice ?? visBars[visBars.length - 1].c, mode, opts.timeframe)
      : null;

  const lastBarClose = visBars[visBars.length - 1].c;
  const fcStartPrice = livePrice != null && Number.isFinite(livePrice) && livePrice > 0 ? livePrice : lastBarClose;
  const fcBundle =
    showFc && visBars.length >= 2
      ? buildExtendedChartForecast(precisionLine, opts.timeframe, fcStartPrice, 16)
      : { points: [] as number[], horizonLabel: '' };
  const forecastPts = fcBundle.points;
  const forecastHorizonLabel = fcBundle.horizonLabel;
  const forecastSlots = forecastPts.length;

  const slotW = candleAreaW / Math.max(1, visBars.length);
  const totalSlots = visBars.length + forecastSlots;

  let minP = Infinity;
  let maxP = -Infinity;
  for (const b of visBars) {
    if (b.l < minP) minP = b.l;
    if (b.h > maxP) maxP = b.h;
  }
  for (const fp of forecastPts) {
    if (fp < minP) minP = fp;
    if (fp > maxP) maxP = fp;
  }
  if (livePrice != null && Number.isFinite(livePrice) && livePrice > 0) {
    minP = Math.min(minP, livePrice);
    maxP = Math.max(maxP, livePrice);
  }
  if (discoverySeries) {
    for (const v of discoverySeries) {
      if (Number.isFinite(v)) {
        minP = Math.min(minP, v);
        maxP = Math.max(maxP, v);
      }
    }
  }
  if (squeezeSeries) {
    for (const v of squeezeSeries) {
      if (Number.isFinite(v)) {
        minP = Math.min(minP, v);
        maxP = Math.max(maxP, v);
      }
    }
  }
  if (!Number.isFinite(minP) || !Number.isFinite(maxP) || maxP <= minP) {
    const mid = visBars[visBars.length - 1].c;
    minP = mid * 0.99;
    maxP = mid * 1.01;
  }

  // Use Auto-Log Y-axis on multi-decade views (10Y / ALL) when price spans >= 2.5x so historical candles stay bold & readable
  const useLogScale =
    (opts.timeframe === '10y' || opts.timeframe === 'all') &&
    minP > 0 &&
    maxP / minP >= 2.5;

  let yOf: (p: number) => number;
  let priceAtFrac: (frac: number) => number;
  if (useLogScale) {
    const logMinRaw = Math.log(minP);
    const logMaxRaw = Math.log(maxP);
    const logPad = (logMaxRaw - logMinRaw) * 0.05;
    const logMin = logMinRaw - logPad;
    const logMax = logMaxRaw + logPad;
    minP = Math.exp(logMin);
    maxP = Math.exp(logMax);
    yOf = (p: number) => {
      const lp = Math.log(Math.max(1e-4, p));
      return padT + ((logMax - lp) / Math.max(1e-6, logMax - logMin)) * plotH;
    };
    priceAtFrac = (frac: number) => Math.exp(logMax - frac * (logMax - logMin));
  } else {
    const rangePad = (maxP - minP) * 0.045;
    minP -= rangePad;
    maxP += rangePad;
    yOf = (p: number) => padT + ((maxP - p) / Math.max(1e-6, maxP - minP)) * plotH;
    priceAtFrac = (frac: number) => maxP - frac * (maxP - minP);
  }

  const xOf = (i: number) => padL + (i + 0.5) * slotW;
  const candleAreaRight = padL + candleAreaW;
  const xForecast = (k: number) => {
    const startX = xOf(visBars.length - 1);
    const endX = cssW - padR - 8;
    return startX + ((k + 1) / Math.max(1, forecastSlots)) * Math.max(24, endX - startX);
  };

  // Subtle future forecast zone shading + NOW divider
  if (showFc && forecastSlots > 0) {
    ctx.save();
    ctx.fillStyle = isLightTheme ? 'rgba(0,0,0,0.024)' : 'rgba(255,255,255,0.022)';
    ctx.fillRect(candleAreaRight, padT, forecastAreaW, plotH);
    ctx.strokeStyle = isLightTheme ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(candleAreaRight, padT);
    ctx.lineTo(candleAreaRight, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 1. Horizontal price grid + right-axis labels
  const gridSteps = 4;
  ctx.strokeStyle = gridCol;
  ctx.lineWidth = 1;
  ctx.font = '500 10px "JetBrains Mono", monospace';
  ctx.fillStyle = textCol;
  ctx.textAlign = 'left';
  for (let i = 0; i <= gridSteps; i++) {
    const frac = i / gridSteps;
    const y = padT + frac * plotH;
    const price = priceAtFrac(frac);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(cssW - padR, y);
    ctx.stroke();

    const lbl =
      mode === 'ratio'
        ? `${price.toFixed(1)}×`
        : formatMoney(convertUnit(price, unit), mode === 'silver' ? 2 : 0, currency, fxRates);
    ctx.fillText(lbl, cssW - padR + 6, y + 3.5);
  }
  if (useLogScale) {
    ctx.save();
    ctx.font = '600 8.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#d4a843';
    ctx.textAlign = 'right';
    ctx.fillText('LOG', cssW - 4, padT - 8);
    ctx.restore();
  }

  // 2. Market Gaps overlay (shaded gap zones + dashed fill target + pill label)
  if (overlays.showGaps && mode !== 'ratio') {
    const detectedGaps: any[] = Array.isArray(visGapAnalysis?.gaps) ? visGapAnalysis.gaps : [];
    if (detectedGaps.length > 0) {
      for (const gp of detectedGaps) {
        const zHi = Number(gp.zoneHigh);
        const zLo = Number(gp.zoneLow);
        if (!Number.isFinite(zHi) || !Number.isFinite(zLo)) continue;
        const x1 = Math.max(padL, xOf(Math.max(0, Number(gp.idx || 1) - 1)) + slotW * 0.35);
        const x2 =
          gp.isFilled && gp.filledAtIdx != null
            ? Math.min(candleAreaRight, xOf(Number(gp.filledAtIdx)) + slotW * 0.4)
            : candleAreaRight;
        const y1 = clampNum(yOf(Math.max(zHi, zLo)), padT, padT + plotH);
        const y2 = clampNum(yOf(Math.min(zHi, zLo)), padT, padT + plotH);
        const bandH = Math.max(4, y2 - y1);
        const bandW = Math.max(8, x2 - x1);
        const isUp = gp.dir === 'up';
        const fresh = Number(gp.freshness ?? (gp.isFilled ? 0 : 1));
        const fillAlpha = gp.isFilled ? 0.08 : +(0.1 + 0.14 * fresh).toFixed(3);
        const borderCol = isUp
          ? gp.isFilled ? 'rgba(34,197,94,0.32)' : 'rgba(34,197,94,0.72)'
          : gp.isFilled ? 'rgba(239,68,68,0.32)' : 'rgba(239,68,68,0.72)';

        ctx.save();
        ctx.fillStyle = isUp
          ? `rgba(34,197,94,${fillAlpha})`
          : `rgba(239,68,68,${fillAlpha})`;
        ctx.fillRect(x1, y1, bandW, bandH);
        ctx.strokeStyle = borderCol;
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, y1, bandW, bandH);

        // Dashed Fill Target line for unfilled gaps
        const fillTgt = Number(gp.fillTarget);
        if (!gp.isFilled && Number.isFinite(fillTgt)) {
          const ty = clampNum(yOf(fillTgt), padT, padT + plotH);
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = isUp ? '#34d399' : '#f87171';
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.moveTo(x1, ty);
          ctx.lineTo(x2, ty);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Crisp inline badge label
        const gapPctVal = Number(gp.gapPct ?? 0);
        const sign = gapPctVal >= 0 ? '+' : '';
        const lbl = gp.isFilled
          ? `${gp.kind || 'Gap'} ${sign}${gapPctVal.toFixed(1)}% ✓`
          : `${gp.kind || 'Gap'} ${isUp ? '↑' : '↓'} ${sign}${gapPctVal.toFixed(1)}%`;
        ctx.font = '600 9px "JetBrains Mono", monospace';
        const tw = ctx.measureText(lbl).width;
        const lx = Math.min(cssW - padR - tw - 10, x1 + 4);
        const ly = Math.max(padT + 11, Math.min(padT + plotH - 6, y1 - 3));
        ctx.fillStyle = isLightTheme ? 'rgba(255,255,255,0.88)' : 'rgba(13,14,17,0.84)';
        ctx.fillRect(lx - 3, ly - 9, tw + 6, 12);
        ctx.fillStyle = isUp ? '#34d399' : '#f87171';
        ctx.textAlign = 'left';
        ctx.fillText(lbl, lx, ly);
        ctx.restore();
      }
    }
  }

  // 3. Key Levels (Fibonacci retracements)
  if (overlays.showFib) {
    const hi = Math.max(...visBars.map((b) => b.h));
    const lo = Math.min(...visBars.map((b) => b.l));
    const diff = hi - lo;
    const levels = [0.236, 0.382, 0.5, 0.618, 0.786];
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(212,168,67,0.45)';
    ctx.fillStyle = 'rgba(212,168,67,0.85)';
    ctx.font = '500 9px "JetBrains Mono", monospace';
    for (const lv of levels) {
      const p = hi - diff * lv;
      const y = yOf(p);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(cssW - padR, y);
      ctx.stroke();
      ctx.fillText(`Fib ${(lv * 100).toFixed(1)}%`, padL + 4, y - 3);
    }
    ctx.restore();
  }

  // 3b. Market Open / Close vertical session lines (drawn softly behind candlesticks)
  const sessionMarkers = overlays.showSessions
    ? detectMarketSessionMarkers(visBars, opts.timeframe)
    : [];
  const placedSessionLabels: Array<{ marker: SessionMarker; x: number }> = [];
  if (sessionMarkers.length > 0) {
    // Priority-sort so key markers (Mkt Closed / Mkt Open / NY Open) win if two are too close horizontally
    const minLabelGapPx = cssW < 460 ? 64 : 58;
    const byPriority = [...sessionMarkers].sort((a, b) => b.priority - a.priority || b.barIdx - a.barIdx);
    for (const m of byPriority) {
      const mx = xOf(m.barIdx);
      if (placedSessionLabels.some((p) => Math.abs(p.x - mx) < minLabelGapPx)) continue;
      placedSessionLabels.push({ marker: m, x: mx });
    }
    placedSessionLabels.sort((a, b) => a.x - b.x);

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    for (const { marker, x } of placedSessionLabels) {
      ctx.strokeStyle = marker.color;
      ctx.globalAlpha = 0.52;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 4. Candlesticks (bold, crisp bodies & clear wicks across every timeframe)
  const bodyW = clampNum(slotW * 0.72, 4, 16);
  for (let i = 0; i < visBars.length; i++) {
    const b = visBars[i];
    const x = xOf(i);
    const up = b.c >= b.o;
    const col = up ? bullCol : bearCol;
    const yH = yOf(b.h);
    const yL = yOf(b.l);
    const yO = yOf(b.o);
    const yC = yOf(b.c);

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, yH);
    ctx.lineTo(x, yL);
    ctx.stroke();

    ctx.fillStyle = col;
    const top = Math.min(yO, yC);
    const h = Math.max(2.5, Math.abs(yC - yO));
    ctx.fillRect(x - bodyW / 2, top, bodyW, h);

    // Auto Patterns markers (Engulfing / Pin bar)
    if (overlays.showPatterns && i > 0) {
      const prev = visBars[i - 1];
      const bullEngulf = up && prev.c < prev.o && b.c > prev.o && b.o <= prev.c;
      const bearEngulf = !up && prev.c > prev.o && b.c < prev.o && b.o >= prev.c;
      if (bullEngulf || bearEngulf) {
        ctx.fillStyle = bullEngulf ? '#22c55e' : '#ef4444';
        ctx.font = '700 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bullEngulf ? '▲' : '▼', x, bullEngulf ? yL + 10 : yH - 4);
        ctx.textAlign = 'left';
      }
    }
  }

  // 5. Dynamic Fair Value (solid emerald #10B981) & Short Squeeze Risk (dashed crimson #F43F5E) curves
  const drawRegimeCurve = (arr: number[], color: string, dash: number[] | null, width: number) => {
    ctx.save();
    if (dash) ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (!Number.isFinite(v)) continue;
      const x = xOf(i);
      const y = yOf(v);
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

  if (discoverySeries && discoverySeries.length) {
    drawRegimeCurve(discoverySeries, '#10b981', null, 1.9);
  }

  if (squeezeSeries && squeezeSeries.length) {
    // Soft translucent crimson squeeze envelope above closing prices
    ctx.save();
    ctx.fillStyle = 'rgba(244, 63, 94, 0.08)';
    ctx.beginPath();
    for (let i = 0; i < squeezeSeries.length; i++) {
      const x = xOf(i);
      const y = yOf(squeezeSeries[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = visBars.length - 1; i >= 0; i--) {
      ctx.lineTo(xOf(i), yOf(Math.max(visBars[i].c, visBars[i].o)));
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawRegimeCurve(squeezeSeries, '#f43f5e', [6, 4], 1.9);
  }

  // Compact top-left legend strip for active dynamic overlays (Fair Value / Squeeze Risk / Gaps)
  if (mode !== 'ratio') {
    const chips: Array<{ text: string; color: string }> = [];
    if (discoverySeries && discoverySeries.length) {
      const lastFv = discoverySeries[discoverySeries.length - 1];
      chips.push({
        text: `● Fair ${formatMoney(convertUnit(lastFv, unit), mode === 'silver' ? 2 : 0, currency, fxRates)}`,
        color: '#10b981',
      });
    }
    if (squeezeSeries && squeezeSeries.length) {
      const lastSq = squeezeSeries[squeezeSeries.length - 1];
      chips.push({
        text: `┄ Squeeze ${formatMoney(convertUnit(lastSq, unit), mode === 'silver' ? 2 : 0, currency, fxRates)}`,
        color: '#f43f5e',
      });
    }
    if (overlays.showGaps) {
      const gCount = Array.isArray(visGapAnalysis?.gaps) ? visGapAnalysis.gaps.length : 0;
      const openCount = Number(visGapAnalysis?.openCount ?? 0);
      chips.push({
        text:
          openCount > 0
            ? `▭ ${openCount} Open Gap${openCount > 1 ? 's' : ''}`
            : gCount > 0
              ? `▭ ${gCount} Filled Gap${gCount > 1 ? 's' : ''}`
              : `▭ Gaps: None (${opts.timeframe.toUpperCase()})`,
        color: openCount > 0 ? '#34d399' : textCol,
      });
    }
    if (overlays.showSessions && placedSessionLabels.length === 0) {
      chips.push({
        text: `│ Hours: 15m–1M`,
        color: textCol,
      });
    }
    if (chips.length > 0) {
      ctx.save();
      ctx.font = '600 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let cx = padL + 2;
      const cy = 10;
      for (const ch of chips) {
        const tw = ctx.measureText(ch.text).width;
        if (cx + tw + 10 > cssW - padR) break;
        ctx.fillStyle = isLightTheme ? 'rgba(255,255,255,0.86)' : 'rgba(13,14,17,0.78)';
        ctx.fillRect(cx - 2, cy - 7, tw + 8, 14);
        ctx.fillStyle = ch.color;
        ctx.fillText(ch.text, cx + 2, cy + 0.5);
        cx += tw + 12;
      }
      ctx.restore();
    }
  }

  // 6b. Market Open / Close bottom-anchored badge pills (collision-free above x-axis)
  if (placedSessionLabels.length > 0) {
    ctx.save();
    ctx.font = '600 8.5px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    const pillH = 13;
    const pillY = padT + plotH - pillH - 2;
    for (const { marker, x } of placedSessionLabels) {
      const tw = ctx.measureText(marker.label).width;
      const pillW = tw + 8;
      const maxPillRight = showFc ? candleAreaRight - 2 : cssW - padR - 1;
      const px = clampNum(x - pillW / 2, padL + 1, Math.max(padL + 1, maxPillRight - pillW));
      // Small marker dot at bottom of line
      ctx.fillStyle = marker.color;
      ctx.beginPath();
      ctx.arc(x, padT + plotH, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Pill background + thin color border
      ctx.fillStyle = isLightTheme ? 'rgba(255,255,255,0.92)' : 'rgba(13,14,17,0.88)';
      ctx.fillRect(px, pillY, pillW, pillH);
      ctx.strokeStyle = marker.color;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 0.9;
      ctx.strokeRect(px, pillY, pillW, pillH);
      ctx.globalAlpha = 1;
      // Label text
      ctx.fillStyle = marker.color;
      ctx.textAlign = 'center';
      ctx.fillText(marker.label, px + pillW / 2, pillY + pillH / 2 + 0.3);
    }
    ctx.restore();
  }

  // 7. SMA 20 & SMA 50 overlays (aligned to displayed OHLC bars)
  if (overlays.showSma) {
    const visCloses = visBars.map((b) => b.c);
    const sma20 = calcSma(visCloses, Math.min(20, Math.max(5, Math.floor(visCloses.length * 0.25))));
    const sma50 = calcSma(visCloses, Math.min(50, Math.max(10, Math.floor(visCloses.length * 0.55))));
    const drawLine = (arr: Array<number | null>, color: string) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      arr.forEach((v, i) => {
        if (v == null) return;
        const x = xOf(i);
        const y = yOf(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.restore();
    };
    drawLine(sma20, '#38bdf8');
    drawLine(sma50, '#f59e0b');
  }

  // 8. Extended Half-Range (+50%) Precision Forecast Trajectory (occupies right 33% Forecast Zone cleanly)
  if (showFc && forecastSlots > 0) {
    const lastIdx = visBars.length - 1;
    const startPrice = fcStartPrice;
    const endPrice = forecastPts[forecastSlots - 1];
    const pctDelta = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
    const lineCol = endPrice >= startPrice ? '#34d399' : '#f87171';

    ctx.save();
    // Subtle outer glow along the extended forecast line
    ctx.strokeStyle = lineCol;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(xOf(lastIdx), yOf(startPrice));
    for (let j = 0; j < forecastSlots; j++) {
      ctx.lineTo(xForecast(j), yOf(forecastPts[j]));
    }
    ctx.stroke();

    // Crisp dashed precision trajectory
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(xOf(lastIdx), yOf(startPrice));
    for (let j = 0; j < forecastSlots; j++) {
      ctx.lineTo(xForecast(j), yOf(forecastPts[j]));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Midpoint checkpoint dot
    const midJ = Math.floor(forecastSlots / 2) - 1;
    if (midJ >= 0 && midJ < forecastSlots) {
      ctx.fillStyle = lineCol;
      ctx.beginPath();
      ctx.arc(xForecast(midJ), yOf(forecastPts[midJ]), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp endpoint dot + target pill with horizon label (+12H, +3.5D, +15D, etc.)
    const endX = xForecast(forecastSlots - 1);
    const endY = yOf(endPrice);
    ctx.fillStyle = lineCol;
    ctx.beginPath();
    ctx.arc(endX, endY, 4.2, 0, Math.PI * 2);
    ctx.fill();

    const sign = pctDelta >= 0 ? '+' : '';
    const fcLbl = `${forecastHorizonLabel} ${formatMoney(convertUnit(endPrice, unit), mode === 'silver' ? 2 : 0, currency, fxRates)} (${sign}${pctDelta.toFixed(1)}%)`;
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    const tw = ctx.measureText(fcLbl).width;
    const tagW = tw + 10;
    const tagH = 16;
    const tagX = clampNum(endX - tagW + 2, candleAreaRight + 2, cssW - padR - tagW - 2);
    const highestLineY = Math.min(yOf(startPrice), endY);
    const lowestLineY = Math.max(yOf(startPrice), endY);
    const tagY =
      highestLineY - tagH - 10 >= padT + 2
        ? highestLineY - tagH - 9
        : Math.min(padT + plotH - tagH - 18, lowestLineY + 10);
    ctx.fillStyle = isLightTheme ? 'rgba(255,255,255,0.92)' : 'rgba(13,14,17,0.9)';
    ctx.fillRect(tagX, tagY, tagW, tagH);
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1;
    ctx.strokeRect(tagX, tagY, tagW, tagH);
    ctx.fillStyle = lineCol;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fcLbl, tagX + tagW / 2, tagY + tagH / 2 + 0.5);
    ctx.restore();
  }

  // 9. Live Current Price Line + Highlighted Right-Axis Price Tag (TradingView style)
  const currentP = livePrice ?? visBars[visBars.length - 1].c;
  if (Number.isFinite(currentP) && currentP >= minP && currentP <= maxP) {
    const ly = yOf(currentP);
    const liveCol = mode === 'silver' ? '#cbd5e1' : mode === 'ratio' ? '#c084fc' : '#f0c857';
    ctx.save();
    ctx.strokeStyle = liveCol;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.92;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, ly);
    ctx.lineTo(cssW - padR, ly);
    ctx.stroke();
    ctx.setLineDash([]);

    // Live pulse anchor dot at the rightmost bar
    const anchorX = xOf(visBars.length - 1);
    ctx.fillStyle = liveCol;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(anchorX, ly, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(anchorX, ly, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Right-axis highlighted pill badge with exact current price
    const liveLbl =
      mode === 'ratio'
        ? `${currentP.toFixed(1)}×`
        : formatMoney(convertUnit(currentP, unit), mode === 'silver' ? 2 : 0, currency, fxRates);
    const pillH = 18;
    const pillW = Math.max(54, padR - 4);
    const pillX = cssW - padR + 2;
    const pillY = Math.max(padT - 2, Math.min(cssH - padB - pillH + 2, ly - pillH / 2));

    ctx.fillStyle = liveCol;
    ctx.beginPath();
    const r = 4;
    ctx.moveTo(pillX + r, pillY);
    ctx.lineTo(pillX + pillW - r, pillY);
    ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + r);
    ctx.lineTo(pillX + pillW, pillY + pillH - r);
    ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - r, pillY + pillH);
    ctx.lineTo(pillX + r, pillY + pillH);
    ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - r);
    ctx.lineTo(pillX, pillY + r);
    ctx.quadraticCurveTo(pillX, pillY, pillX + r, pillY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0d0e11';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(liveLbl, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
    ctx.restore();
  }

  // 11. Hover crosshair
  if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < visBars.length) {
    const hx = xOf(hoverIdx);
    const hy = yOf(visBars[hoverIdx].c);
    ctx.save();
    ctx.strokeStyle = isLightTheme ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx, padT);
    ctx.lineTo(hx, padT + plotH);
    ctx.moveTo(padL, hy);
    ctx.lineTo(cssW - padR, hy);
    ctx.stroke();
    ctx.restore();
  }

  // 12. Bottom time axis labels (aligned cleanly to candle zone + explicit future forecast horizon label)
  ctx.fillStyle = textCol;
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  const maxTicks = showFc ? (cssW < 460 ? 3 : 4) : (cssW < 440 ? 3 : 5);
  const tickCount = Math.min(maxTicks, visBars.length);
  for (let i = 0; i < tickCount; i++) {
    const bi = Math.min(visBars.length - 1, Math.round((i / Math.max(1, tickCount - 1)) * (visBars.length - 1)));
    const d = new Date(visBars[bi].t);
    const label =
      opts.timeframe === '15min' || opts.timeframe === '1h' || opts.timeframe === '4h' || opts.timeframe === '1d'
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : opts.timeframe === '5y' || opts.timeframe === '10y' || opts.timeframe === 'all'
          ? String(d.getFullYear())
          : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (i === 0) {
      ctx.textAlign = 'left';
      ctx.fillText(label, padL + 2, cssH - 8);
    } else if (i === tickCount - 1) {
      ctx.textAlign = 'right';
      ctx.fillText(label, candleAreaRight - 2, cssH - 8);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(label, xOf(bi), cssH - 8);
    }
  }
  if (showFc && forecastSlots > 0 && forecastHorizonLabel) {
    ctx.save();
    ctx.fillStyle = forecastPts[forecastSlots - 1] >= fcStartPrice ? '#34d399' : '#f87171';
    ctx.font = '700 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(forecastHorizonLabel, cssW - padR - 2, cssH - 8);
    ctx.restore();
  }

  // 13. Optional RSI-14 sub-canvas (aligned to displayed candles)
  if (overlays.showRsi && rsiCanvas) {
    const rCtx = rsiCanvas.getContext('2d');
    if (rCtx) {
      const rRect = rsiCanvas.getBoundingClientRect();
      const rw = Math.max(280, Math.round(rRect.width || cssW));
      const rh = Math.max(64, Math.round(rRect.height || 72));
      if (rsiCanvas.width !== Math.round(rw * dpr) || rsiCanvas.height !== Math.round(rh * dpr)) {
        rsiCanvas.width = Math.round(rw * dpr);
        rsiCanvas.height = Math.round(rh * dpr);
      }
      rCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rCtx.clearRect(0, 0, rw, rh);
      const rsiArr = calcRsi(visBars.map((b) => b.c), Math.min(14, Math.max(4, visBars.length - 2)));
      const ry = (val: number) => 8 + ((100 - val) / 100) * (rh - 16);
      rCtx.strokeStyle = gridCol;
      rCtx.setLineDash([3, 3]);
      for (const lv of [30, 50, 70]) {
        rCtx.beginPath();
        rCtx.moveTo(padL, ry(lv));
        rCtx.lineTo(rw - padR, ry(lv));
        rCtx.stroke();
      }
      rCtx.setLineDash([]);
      rCtx.strokeStyle = '#a855f7';
      rCtx.lineWidth = 1.6;
      rCtx.beginPath();
      let started = false;
      rsiArr.forEach((v, i) => {
        if (v == null) return;
        const x = padL + (i + 0.5) * slotW;
        const y = ry(v);
        if (!started) {
          rCtx.moveTo(x, y);
          started = true;
        } else {
          rCtx.lineTo(x, y);
        }
      });
      rCtx.stroke();
    }
  }

  return {
    padL,
    padR,
    padT,
    padB,
    plotW,
    plotH,
    candleAreaW,
    startIdx,
    visibleCount: visBars.length,
    totalSlots,
    slotW,
    minP,
    maxP,
    forecastBars: forecastSlots,
    displayBars: visBars,
  };
}
