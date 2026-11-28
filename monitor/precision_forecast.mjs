/**
 * Bullion Pulse — Groundbreaking Precision Forecast Engine (Zero-Lookahead Causal)
 * Pure ES module, zero dependencies.
 *
 * Replaces wide shaded cones with a single razor-sharp, timeframe-matched trajectory
 * powered by 5 institutional quantitative breakthroughs:
 *   1. Variance-Ratio Hurst Exponent (H in [0.22, 0.85]): detects Trending (H > 0.56),
 *      Mean-Reverting (H < 0.44), or Random-Walk regimes live on every chart.
 *   2. Asymmetric Semi-Volatility (Parkinson + Wilder ATR + Up/Down Semi-Vol):
 *      captures precious-metals upside squeeze vs. downside liquidation skew.
 *   3. 4-Specialist Causal Online Meta-Learner (Stacking Ensemble):
 *      runs Momentum/Breakout, Mean-Reversion/Structure, Macro/Physical Flow, and
 *      Cycle/Seasonality specialists in parallel, dynamically weighting them by
 *      causal inverse-RMSE walk-forward performance on recent bars.
 *   4. Ensemble Agreement Damping: amplifies conviction when all specialists agree
 *      and automatically shrinks directional risk when models conflict.
 *   5. Distribution-Free Conformal Error Calibration: tracks actual out-of-sample
 *      empirical error quantiles (MAE & Conformal 75% radius) with zero Gaussian assumptions.
 */

import { computeSpectralForecast } from './spectral_forecast.mjs';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export const FORECAST_HORIZON_SPECS = {
  '15min': { label: '+15m', steps: 15, stepMs: 60000,       wTech: 0.92, wMacro: 0.08, horizonBars: 15, maxCapSigma: 1.55 },
  '1h':    { label: '+1H',  steps: 16, stepMs: 225000,      wTech: 0.88, wMacro: 0.12, horizonBars: 24, maxCapSigma: 1.75 },
  '4h':    { label: '+4H',  steps: 16, stepMs: 900000,      wTech: 0.80, wMacro: 0.20, horizonBars: 20, maxCapSigma: 1.90 },
  '1d':    { label: '+24H', steps: 16, stepMs: 5400000,     wTech: 0.68, wMacro: 0.32, horizonBars: 20, maxCapSigma: 2.05 },
  '7d':    { label: '+7D',  steps: 14, stepMs: 43200000,    wTech: 0.42, wMacro: 0.58, horizonBars: 18, maxCapSigma: 2.25 },
  '1m':    { label: '+1M',  steps: 16, stepMs: 162000000,   wTech: 0.28, wMacro: 0.72, horizonBars: 16, maxCapSigma: 2.35 },
  '6m':    { label: '+6M',  steps: 16, stepMs: 972000000,   wTech: 0.18, wMacro: 0.82, horizonBars: 16, maxCapSigma: 2.45 },
  '1y':    { label: '+1Y',  steps: 16, stepMs: 1971000000,  wTech: 0.12, wMacro: 0.88, horizonBars: 16, maxCapSigma: 2.55 },
  '5y':    { label: '+5Y',  steps: 16, stepMs: 9855000000,  wTech: 0.10, wMacro: 0.90, horizonBars: 12, maxCapSigma: 2.65 },
  '10y':   { label: '+5Y',  steps: 16, stepMs: 9855000000,  wTech: 0.10, wMacro: 0.90, horizonBars: 12, maxCapSigma: 2.65 },
  all:     { label: '+5Y',  steps: 16, stepMs: 9855000000,  wTech: 0.10, wMacro: 0.90, horizonBars: 12, maxCapSigma: 2.65 },
};

// 4 Distinct Specialist Sub-Models for Causal Online Stacking
const SPECIALIST_MODELS = [
  { id: 'momentum',  name: 'Momentum',        trendW: 1.28, revW: 0.22, macroW: 0.55, phi: 0.91 },
  { id: 'reversion', name: 'Mean-Reversion',  trendW: 0.34, revW: 1.22, macroW: 0.65, phi: 0.74 },
  { id: 'macro',     name: 'Macro & Vaults',  trendW: 0.62, revW: 0.58, macroW: 1.32, phi: 0.85 },
  { id: 'balanced',  name: 'Cycle-Balanced',  trendW: 0.86, revW: 0.70, macroW: 0.92, phi: 0.83 },
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

/**
 * Computes a causal multi-lag Variance-Ratio Hurst Exponent H in [0.22, 0.85].
 *   H > 0.56 -> Trending / Persistent market
 *   H < 0.44 -> Mean-Reverting / Snap-back market
 *   0.44..0.56 -> Random-Walk / Balanced market
 */
export function computeHurstExponent(closes) {
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
    // Floor variance ratio so near-zero multi-lag variance properly registers strong mean reversion (H -> 0.22)
    const ratio = Math.max(1e-4, vL / v1);
    const hEst = Math.log(ratio) / (2 * Math.log(L));
    if (Number.isFinite(hEst)) {
      hSum += clamp(hEst, 0.18, 0.88);
      hCnt++;
    }
  }
  const hurst = hCnt > 0 ? +clamp(hSum / hCnt, 0.22, 0.85).toFixed(2) : 0.50;
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

/**
 * Extracts causal local volatility (Parkinson + Wilder ATR + Up/Down Asymmetric Semi-Vol),
 * Kaufman Efficiency Ratio, Multi-EMA slope, Hurst Exponent, RSI(14), and Swing Levels.
 */
export function extractLocalFeatures(bars) {
  const n = bars.length;
  const look = bars.slice(-Math.min(36, n));
  const closes = look.map((b) => b.c);
  const last = look[look.length - 1];
  const p0 = last.c;

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
  const barVol = clamp(0.55 * parkVol + 0.45 * atrVol, 0.00025, 0.085);

  // Asymmetric upside vs downside semi-vol (bullion squeeze vs liquidation skew)
  const upSemiVol = upCnt >= 2 ? Math.sqrt(upSqSum / upCnt) : barVol;
  const dnSemiVol = dnCnt >= 2 ? Math.sqrt(dnSqSum / dnCnt) : barVol;
  const volSkewRatio = clamp(upSemiVol / Math.max(dnSemiVol, 1e-6), 0.65, 1.55);

  // Kaufman Efficiency Ratio (trend cleanliness 0..1)
  const erLen = Math.min(12, closes.length - 1);
  let pathLen = 0;
  for (let i = closes.length - erLen; i < closes.length; i++) {
    pathLen += Math.abs(closes[i] - closes[i - 1]);
  }
  const netMove = erLen > 0 ? Math.abs(closes[closes.length - 1] - closes[closes.length - 1 - erLen]) : 0;
  const er = pathLen > 1e-9 ? clamp(netMove / pathLen, 0, 1) : 0;

  // Variance-Ratio Hurst Exponent (persistence vs mean reversion)
  const hurstInfo = computeHurstExponent(closes);

  // Multi-EMA slope normalized by barVol
  const ema5 = computeEmaLast(closes, 5);
  const ema13 = computeEmaLast(closes, 13);
  const ema20 = computeEmaLast(closes, 20);
  const ema26 = computeEmaLast(closes, 26);
  const normDenom = Math.max(p0 * barVol, 1e-6);
  const fastSpread = (ema5 - ema13) / normDenom;
  const slowSpread = (ema13 - ema26) / normDenom;
  const rawSlope = clamp((fastSpread * 0.65 + slowSpread * 0.35) * 0.34, -0.85, 0.85);
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

function projectSpecialistTrajectory({
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
  const maxCumPct = spec.maxCapSigma * clamp(breakoutEnergyMult, 0.85, 1.30) * feats.barVol * Math.sqrt(spec.horizonBars);

  // Hurst regime adapts momentum vs mean reversion continuously
  const hurstTrendGain = clamp(1 + (feats.hurst - 0.50) * 1.45, 0.55, 1.50);
  const hurstRevGain = clamp(1 - (feats.hurst - 0.50) * 1.45, 0.55, 1.50);

  const rsiExhaust =
    feats.rsi >= 68
      ? -clamp((feats.rsi - 66) / 26, 0, 1)
      : feats.rsi <= 32
        ? clamp((34 - feats.rsi) / 26, 0, 1)
        : 0;

  const hasActiveGap =
    Boolean(gapPrimary) && !gapPrimary.isFilled && (gapPrimary.freshness ?? 1) > 0.05;
  const gapFresh = hasActiveGap ? (gapPrimary.freshness ?? 1) : 0;

  const points = [{ step: 0, t: lastT, price: p0 }];
  let cur = p0;

  for (let k = 1; k <= steps; k++) {
    // 1. Hurst-modulated damped trend momentum
    const fTrend =
      feats.emaSlope * specialist.trendW * hurstTrendGain * Math.pow(specialist.phi, k - 1) * spec.wTech;

    // 2. Hurst-modulated Ornstein-Uhlenbeck mean reversion + RSI exhaustion brake
    const stretch = (cur - feats.ema20) / Math.max(feats.ema20 * feats.barVol * 4.2, 1e-6);
    const fOu = -clamp(stretch, -2.5, 2.5) * 0.15 * specialist.revW * hurstRevGain * spec.wTech;
    const fRsi = rsiExhaust * 0.24 * hurstRevGain * Math.pow(0.86, k - 1) * spec.wTech;

    // 3. Unfilled Market Gap pull vs. breakaway continuation
    let fGap = 0;
    if (hasActiveGap) {
      const targetDist = (gapPrimary.fillTarget - cur) / Math.max(cur * stepVol, 1e-6);
      if (!gapPrimary.holdingBeyond && k <= Math.ceil(steps * 0.5)) {
        fGap = clamp(targetDist * 0.22, -0.35, 0.35) * gapFresh * hurstRevGain * spec.wTech;
      } else if (gapPrimary.holdingBeyond) {
        const dirSign = gapPrimary.dir === 'up' ? 1 : -1;
        fGap = dirSign * 0.14 * gapFresh * hurstTrendGain * Math.pow(0.9, k - 1) * spec.wTech;
      }
    }

    // 4. Macro + Cross-Asset Lead-Lag Alpha + 20-Yr Seasonality
    const macroComposite = clamp(
      macroUnit + leadLagAlpha * 0.35 + seasonalityTilt * 0.42,
      -1,
      1
    );
    const fMacro = macroComposite * 0.26 * specialist.macroW * spec.wMacro;

    // 4b. Pre-OpEx Round-Strike Gravity Pin ($50 Gold / $1 Silver) on short horizons
    let fOpex = 0;
    if (opexPinStrength > 0 && Number.isFinite(opexMagnetPrice) && opexMagnetPrice > 0 && spec.wTech >= 0.40) {
      const magDist = (opexMagnetPrice - cur) / Math.max(cur * stepVol, 1e-6);
      fOpex = clamp(magDist * 0.14 * opexPinStrength, -0.25, 0.25);
    }

    let unitStep = (fTrend + fOu + fRsi + fGap + fMacro + fOpex) * clamp(breakoutEnergyMult, 0.88, 1.25);

    // 5. Soft Support / Resistance barrier damping (relaxed when Hurst shows strong breakout)
    const distToCeil = (feats.swingHigh - cur) / Math.max(cur * feats.barVol, 1e-6);
    const distToFloor = (cur - feats.swingLow) / Math.max(cur * feats.barVol, 1e-6);
    if (unitStep > 0 && distToCeil > 0 && distToCeil < 1.2 && feats.er < 0.65 && feats.hurst < 0.60) {
      unitStep *= 0.56;
    } else if (unitStep < 0 && distToFloor > 0 && distToFloor < 1.2 && feats.er < 0.65 && feats.hurst < 0.60) {
      unitStep *= 0.56;
    }

    // Apply subtle asymmetric semi-vol scaling (up moves scale with upSemiVol tilt, down with dnSemiVol)
    const asymScale = unitStep >= 0
      ? clamp(0.85 + 0.15 * feats.volSkewRatio, 0.85, 1.15)
      : clamp(0.85 + 0.15 / Math.max(0.5, feats.volSkewRatio), 0.85, 1.15);

    const stepRet = clamp(unitStep * stepVol * asymScale, -0.58 * stepVol, 0.58 * stepVol);
    const nextPrice = clamp(cur * (1 + stepRet), p0 * (1 - maxCumPct), p0 * (1 + maxCumPct));
    cur = Math.max(0.01, nextPrice);
    points.push({
      step: k,
      t: lastT + k * spec.stepMs,
      price: cur,
    });
  }

  return points;
}

/**
 * Computes a single fine-tuned, zero-lookahead 4-Specialist Stacked Precision Forecast Line
 * with Hurst Regime detection, Ensemble Agreement Damping, and Conformal Error Calibration.
 */
export function computePrecisionForecastLine({
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
  const spec = FORECAST_HORIZON_SPECS[tf] || FORECAST_HORIZON_SPECS['1d'];
  if (!Array.isArray(bars) || bars.length < 4) return null;

  const lastBar = bars[bars.length - 1];
  const p0 =
    Number.isFinite(Number(liveSpot)) && Number(liveSpot) > 0 ? Number(liveSpot) : lastBar.c;
  const lastT = lastBar.t || Date.now();

  // Default prior weights before causal stacking
  let weights = [0.22, 0.24, 0.26, 0.28];
  let calibration = {
    mode: 'Cycle-Balanced',
    dirHitPct: null,
    avgErrPct: null,
    conformalRadiusPct: null,
    samples: 0,
  };

  // Causal Walk-Forward Meta-Learner Stacking + Conformal Error Calibration
  if (bars.length >= 20) {
    const hTest = Math.max(2, Math.min(6, Math.floor(bars.length / 6)));
    const maxSamples = Math.min(12, bars.length - 12 - hTest);
    if (maxSamples >= 3) {
      const startIdx = bars.length - hTest - maxSamples;
      const modelRmse = SPECIALIST_MODELS.map(() => 0);
      const modelDirRate = SPECIALIST_MODELS.map(() => 0);
      const perSamplePreds = [];
      const perSampleActuals = [];
      const perSampleP0 = [];

      for (let s = 0; s < maxSamples; s++) {
        const cutIdx = startIdx + s;
        const histSlice = bars.slice(0, cutIdx + 1);
        const actual = bars[cutIdx + hTest]?.c;
        if (!(actual > 0)) continue;
        const f = extractLocalFeatures(histSlice);
        const testSpec = { ...spec, steps: hTest, horizonBars: hTest };
        const scale = Math.max(f.p0 * f.barVol * Math.sqrt(hTest), 1e-6);

        const rowPreds = [];
        for (let m = 0; m < SPECIALIST_MODELS.length; m++) {
          const pts = projectSpecialistTrajectory({
            p0: f.p0,
            lastT: histSlice[histSlice.length - 1].t,
            feats: f,
            spec: testSpec,
            specialist: SPECIALIST_MODELS[m],
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
          if (Math.abs(actMove) < f.p0 * 0.0001 || (pred - f.p0) * actMove >= 0) {
            modelDirRate[m] += 1;
          }
        }
        perSamplePreds.push(rowPreds);
        perSampleActuals.push(actual);
        perSampleP0.push(f.p0);
      }

      const valid = perSampleActuals.length;
      if (valid >= 3) {
        // Softmax inverse-loss meta-learner weights across all 4 specialists
        const scores = SPECIALIST_MODELS.map((_, m) => {
          const rmse = Math.sqrt(modelRmse[m] / valid);
          const dirR = modelDirRate[m] / valid;
          return -(rmse - 0.16 * dirR) * 2.2;
        });
        const maxS = Math.max(...scores);
        const exps = scores.map((sc) => Math.exp(clamp(sc - maxS, -8, 0)));
        const expSum = exps.reduce((a, b) => a + b, 0) || 1;
        weights = exps.map((e) => e / expSum);

        // Evaluate stacked ensemble out-of-sample errors for conformal calibration
        const absPctErrs = [];
        let ensDirHits = 0;
        for (let i = 0; i < valid; i++) {
          let ensPred = 0;
          for (let m = 0; m < SPECIALIST_MODELS.length; m++) {
            ensPred += perSamplePreds[i][m] * weights[m];
          }
          const actual = perSampleActuals[i];
          const p0i = perSampleP0[i];
          absPctErrs.push((Math.abs(ensPred - actual) / actual) * 100);
          const actMove = actual - p0i;
          if (Math.abs(actMove) < p0i * 0.0001 || (ensPred - p0i) * actMove >= 0) {
            ensDirHits++;
          }
        }
        absPctErrs.sort((a, b) => a - b);
        const q75Idx = Math.min(absPctErrs.length - 1, Math.floor(absPctErrs.length * 0.75));
        const avgErr = absPctErrs.reduce((a, b) => a + b, 0) / absPctErrs.length;

        let topIdx = 0;
        for (let m = 1; m < weights.length; m++) {
          if (weights[m] > weights[topIdx]) topIdx = m;
        }
        calibration = {
          mode: SPECIALIST_MODELS[topIdx].name,
          dirHitPct: Math.round((ensDirHits / valid) * 100),
          avgErrPct: +avgErr.toFixed(2),
          conformalRadiusPct: +absPctErrs[q75Idx].toFixed(2),
          samples: valid,
        };
      }
    }
  }

  const liveFeats = extractLocalFeatures(bars);

  // Run all 4 specialists forward on the live state
  const allPaths = SPECIALIST_MODELS.map((specialist) =>
    projectSpecialistTrajectory({
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

  // Measure Ensemble Directional Agreement (0..100%)
  const endDeltas = allPaths.map((pts) => pts[pts.length - 1].price - p0);
  const upVotes = endDeltas.filter((d) => d > p0 * 0.0002).length;
  const dnVotes = endDeltas.filter((d) => d < -p0 * 0.0002).length;
  const majority = Math.max(upVotes, dnVotes);
  const agreementPct = Math.round((majority / SPECIALIST_MODELS.length) * 100);
  // Disagreement Damping: when models split 2-vs-2, damp excursion 28% toward spot to avoid false breakouts
  const agreementDamp = agreementPct >= 100 ? 1.0 : agreementPct >= 75 ? 0.90 : 0.72;

  // Optional local frequency-domain harmonic wave modulation when active bars show a clear cycle
  const localCloses = bars.map((b) => b.c).filter((c) => typeof c === 'number' && Number.isFinite(c) && c > 0);
  const localSpectral =
    localCloses.length >= 24
      ? computeSpectralForecast(localCloses.slice(-120), {
          horizonDays: spec.steps,
          minPeriod: 4,
          maxPeriod: Math.min(48, Math.floor(Math.min(120, localCloses.length) / 2.2)),
          maxHarmonics: 2,
          sampleLabel: 'bars',
          runWalkForward: false,
        })
      : null;
  const specWaveWeight =
    localSpectral?.available && localSpectral.clarityScore >= 0.35
      ? clamp((localSpectral.clarityScore - 0.30) * 0.34, 0, 0.18) * Math.max(0.35, spec.wTech)
      : 0;
  const maxStepExcursion = spec.maxCapSigma * liveFeats.barVol * Math.sqrt(spec.horizonBars);

  // Weighted Meta-Learner stacked trajectory + gentle spectral wave curvature
  const points = [];
  for (let k = 0; k <= spec.steps; k++) {
    let rawBlend = 0;
    for (let m = 0; m < SPECIALIST_MODELS.length; m++) {
      rawBlend += allPaths[m][k].price * weights[m];
    }
    let dampedPrice = k === 0 ? p0 : p0 + (rawBlend - p0) * agreementDamp;
    if (k > 0 && specWaveWeight > 0 && localSpectral?.projectionWave?.[k]) {
      const wavePct = clamp(localSpectral.projectionWave[k].deltaCyclePct / 100, -maxStepExcursion, maxStepExcursion);
      dampedPrice = dampedPrice * (1 + wavePct * specWaveWeight);
    }
    points.push({
      step: k,
      t: allPaths[0][k].t,
      price: Math.max(0.01, dampedPrice),
    });
  }

  const endPrice = points[points.length - 1].price;
  const delta = endPrice - p0;
  const deltaPct = p0 > 0 ? (delta / p0) * 100 : 0;
  const direction = deltaPct >= 0.05 ? 'up' : deltaPct <= -0.05 ? 'down' : 'flat';

  const ensembleBreakdown = SPECIALIST_MODELS.map((s, idx) => ({
    id: s.id,
    name: s.name,
    weightPct: Math.round(weights[idx] * 100),
  })).sort((a, b) => b.weightPct - a.weightPct);

  const factorTags = [];
  factorTags.push(`${liveFeats.hurstLabel} (H=${liveFeats.hurst.toFixed(2)})`);
  if (localSpectral?.available && localSpectral.clarityScore >= 0.45 && localSpectral.dominantCycles?.[0]) {
    factorTags.push(`Cycle ${localSpectral.dominantCycles[0].period}b (${localSpectral.dominantCycles[0].phaseLabel.split(' ')[0]})`);
  }
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
    spectralCycle: localSpectral?.available
      ? {
          dominantPeriod: localSpectral.dominantCycles[0]?.period ?? null,
          phaseLabel: localSpectral.dominantCycles[0]?.phaseLabel ?? null,
          clarityScore: localSpectral.clarityScore,
          spectralUnitScore: localSpectral.spectralUnitScore,
          summary: localSpectral.summary,
        }
      : null,
    driversSummary: `${Math.round(spec.wTech * 100)}% Tech / ${Math.round(spec.wMacro * 100)}% Macro · ${factorTags.slice(0, 2).join(' · ')}`,
  };
}
