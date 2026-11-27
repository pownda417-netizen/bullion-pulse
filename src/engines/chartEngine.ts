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
  startIdx: number;
  visibleCount: number;
  totalSlots: number;
  slotW: number;
  minP: number;
  maxP: number;
  forecastBars: number;
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
  const visBars = bars.slice(startIdx, startIdx + visibleCount);

  // Compute dynamic Fair Value (Price Discovery) & Short Squeeze curves causally across full bars, then slice to visible window
  const fullDiscovery =
    overlays.showDiscovery && mode !== 'ratio'
      ? computePriceDiscoverySeries(bars, activeRegime, metalUnit)
      : null;
  const fullSqueeze =
    overlays.showSqueeze && mode !== 'ratio'
      ? computeShortSqueezeSeries(bars, activeRegime)
      : null;
  const discoverySeries = fullDiscovery ? fullDiscovery.slice(startIdx, startIdx + visibleCount) : null;
  const squeezeSeries = fullSqueeze ? fullSqueeze.slice(startIdx, startIdx + visibleCount) : null;

  // Analyze market gaps directly on the visible window so indices & fill zones align 100% with visible candles
  const visGapAnalysis =
    overlays.showGaps && mode !== 'ratio' && visBars.length >= 2
      ? analyzeMarketGaps(visBars, livePrice ?? visBars[visBars.length - 1].c, mode, opts.timeframe)
      : null;

  const forecastPts: number[] = [];
  if (overlays.showForecast && mode !== 'ratio') {
    const rawPts: any[] = Array.isArray(precisionLine?.points)
      ? precisionLine.points
      : Array.isArray(precisionLine?.path)
        ? precisionLine.path
        : [];
    if (rawPts.length > 0) {
      for (const pt of rawPts.slice(0, 14)) {
        const p = Number(typeof pt === 'number' ? pt : pt?.price ?? pt?.mid ?? pt?.value);
        if (Number.isFinite(p) && p > 0) forecastPts.push(p);
      }
    } else if (visBars.length >= 2) {
      const lastC = livePrice ?? visBars[visBars.length - 1].c;
      const pctBias = clampNum(Number(precisionLine?.expectedMovePct ?? 0.6), -6, 6) / 100;
      for (let i = 1; i <= 8; i++) {
        forecastPts.push(+(lastC * (1 + pctBias * (i / 8))).toFixed(2));
      }
    }
  }
  const forecastSlots = forecastPts.length > 0 ? Math.min(10, forecastPts.length) : 0;

  const padL = 12;
  const padR = 66;
  const padT = 22;
  const padB = 26;
  const plotW = Math.max(100, cssW - padL - padR);
  const plotH = Math.max(100, cssH - padT - padB);
  const totalSlots = visBars.length + forecastSlots;
  const slotW = plotW / Math.max(1, totalSlots);

  let minP = Infinity;
  let maxP = -Infinity;
  for (const b of visBars) {
    if (b.l < minP) minP = b.l;
    if (b.h > maxP) maxP = b.h;
  }
  for (const fp of forecastPts.slice(0, forecastSlots)) {
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
  const rangePad = (maxP - minP) * 0.08;
  minP -= rangePad;
  maxP += rangePad;

  const yOf = (p: number) => padT + ((maxP - p) / (maxP - minP)) * plotH;
  const xOf = (i: number) => padL + (i + 0.5) * slotW;
  const candleAreaRight = padL + visBars.length * slotW;

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
    const price = maxP - frac * (maxP - minP);
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

  // 4. Candlesticks (with clean wick + crisp body)
  const bodyW = Math.max(2, Math.min(14, slotW * 0.64));
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
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(x, yH);
    ctx.lineTo(x, yL);
    ctx.stroke();

    ctx.fillStyle = col;
    const top = Math.min(yO, yC);
    const h = Math.max(1.5, Math.abs(yC - yO));
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

  // 7. SMA 20 & SMA 50 overlays
  if (overlays.showSma) {
    const allCloses = bars.map((b) => b.c);
    const sma20 = calcSma(allCloses, 20).slice(startIdx, startIdx + visibleCount);
    const sma50 = calcSma(allCloses, 50).slice(startIdx, startIdx + visibleCount);
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

  // 8. Single Precision Forecast Line (NO wide shaded cone — clean single trajectory!)
  if (overlays.showForecast && forecastSlots > 0 && mode !== 'ratio') {
    const lastIdx = visBars.length - 1;
    const startPrice = livePrice ?? visBars[lastIdx].c;
    const endPrice = forecastPts[forecastSlots - 1];
    const lineCol = endPrice >= startPrice ? '#34d399' : '#f87171';

    ctx.save();
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(xOf(lastIdx), yOf(startPrice));
    for (let j = 0; j < forecastSlots; j++) {
      ctx.lineTo(xOf(lastIdx + 1 + j), yOf(forecastPts[j]));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Crisp endpoint dot & target tag
    const endX = xOf(lastIdx + forecastSlots);
    const endY = yOf(endPrice);
    ctx.fillStyle = lineCol;
    ctx.beginPath();
    ctx.arc(endX, endY, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `Est ${formatMoney(convertUnit(endPrice, unit), mode === 'silver' ? 2 : 0, currency, fxRates)}`,
      cssW - padR - 4,
      Math.max(padT + 11, endY - 7)
    );
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

  // 12. Bottom time axis labels (edge-aligned on first/last tick; 4 ticks on narrow mobile to prevent overlap)
  ctx.fillStyle = textCol;
  ctx.font = '500 9.5px "JetBrains Mono", monospace';
  const maxTicks = cssW < 440 ? 3 : 5;
  const tickCount = Math.min(maxTicks, visBars.length);
  for (let i = 0; i < tickCount; i++) {
    const bi = Math.min(visBars.length - 1, Math.round((i / Math.max(1, tickCount - 1)) * (visBars.length - 1)));
    const d = new Date(visBars[bi].t);
    const label =
      opts.timeframe === '15min' || opts.timeframe === '1h' || opts.timeframe === '4h' || opts.timeframe === '1d'
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (i === 0) {
      ctx.textAlign = 'left';
      ctx.fillText(label, padL + 2, cssH - 8);
    } else if (i === tickCount - 1) {
      ctx.textAlign = 'right';
      ctx.fillText(label, cssW - padR - 2, cssH - 8);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(label, xOf(bi), cssH - 8);
    }
  }

  // 13. Optional RSI-14 sub-canvas
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
      const rsiArr = calcRsi(bars.map((b) => b.c), 14).slice(startIdx, startIdx + visibleCount);
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
    startIdx,
    visibleCount,
    totalSlots,
    slotW,
    minP,
    maxP,
    forecastBars: forecastSlots,
  };
}
