/**
 * Bullion Pulse — Merton Jump-Diffusion Monte Carlo Engine
 * Pure ES module, zero external dependencies, deterministic seeded PRNG option.
 *
 * Models continuous Brownian diffusion + Poisson fat-tail jump shocks:
 *   S_{t+1} = S_t * exp((mu - 0.5*sigma^2 - lambda*kappa) + sigma*Z + sum(Y_k))
 * Particularly suited to Silver & Gold, which exhibit sudden macro/geopolitical jumps.
 */

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Deterministic Mulberry32 PRNG for reproducible tests & snapshots */
export function createRng(seed = 20261119) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSample(rng) {
  let u = 0;
  let v = 0;
  while (u <= 1e-12) u = rng();
  while (v <= 1e-12) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function poissonSample(lambda, rng) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 12);
  return k - 1;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const idx = clamp(q * (sorted.length - 1), 0, sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * GARCH(1,1) + RiskMetrics EWMA Volatility Clustering & GVZ Implied-Vol Term Structure.
 * Captures sudden stress-regime vol spikes and mean-reversion toward long-run vol
 * over multi-day horizons (7D / 30D / 90D) instead of a flat static 20-day window.
 */
export function computeEwmaGarchVol(
  closes = [],
  {
    ewmaLambda = 0.94,
    alpha = 0.085,
    beta = 0.875,
    impliedVolAnnPct = null,
    fallbackDailyVol = 0.012,
  } = {}
) {
  const clean = Array.isArray(closes)
    ? closes.filter((c) => typeof c === 'number' && Number.isFinite(c) && c > 0)
    : [];
  if (clean.length < 10) {
    const base = clamp(Number(fallbackDailyVol) || 0.012, 0.004, 0.06);
    const ivDaily =
      Number.isFinite(Number(impliedVolAnnPct)) && Number(impliedVolAnnPct) > 4
        ? clamp(Number(impliedVolAnnPct) / 100 / Math.sqrt(252), 0.004, 0.08)
        : null;
    const blended = ivDaily != null ? base * 0.62 + ivDaily * 0.38 : base;
    return {
      ewmaDailyVol: +base.toFixed(5),
      ewmaAnnVolPct: +(base * Math.sqrt(252) * 100).toFixed(1),
      garchDailyVol: +base.toFixed(5),
      longRunDailyVol: +base.toFixed(5),
      blendedDailyVol: +blended.toFixed(5),
      blendedAnnVolPct: +(blended * Math.sqrt(252) * 100).toFixed(1),
      ivSpreadAnnPct: ivDaily != null ? +((ivDaily - base) * Math.sqrt(252) * 100).toFixed(1) : 0,
      volRegime: ivDaily != null && ivDaily > base * 1.28 ? 'Vol Expansion (IV > RV)' : 'Balanced Vol',
      termVolForDays: () => +blended.toFixed(5),
    };
  }

  const rets = [];
  for (let i = 1; i < clean.length; i++) {
    const r = Math.log(clean[i] / clean[i - 1]);
    if (Number.isFinite(r)) rets.push(clamp(r, -0.18, 0.18));
  }
  const meanR = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const longRunVar = clamp(
    rets.reduce((s, r) => s + (r - meanR) * (r - meanR), 0) / Math.max(1, rets.length - 1),
    0.000016,
    0.0036
  );

  let ewmaVar = longRunVar;
  let garchVar = longRunVar;
  const omega = Math.max(1e-7, (1 - alpha - beta) * longRunVar);

  for (const r of rets) {
    const eps2 = (r - meanR) * (r - meanR);
    ewmaVar = ewmaLambda * ewmaVar + (1 - ewmaLambda) * eps2;
    garchVar = omega + alpha * eps2 + beta * garchVar;
  }

  const ewmaDailyVol = clamp(Math.sqrt(ewmaVar), 0.004, 0.065);
  const garchDailyVol = clamp(Math.sqrt(garchVar), 0.004, 0.065);
  const longRunDailyVol = clamp(Math.sqrt(longRunVar), 0.004, 0.06);
  const realizedDynamic = garchDailyVol * 0.65 + ewmaDailyVol * 0.35;

  const ivDaily =
    Number.isFinite(Number(impliedVolAnnPct)) && Number(impliedVolAnnPct) > 4
      ? clamp(Number(impliedVolAnnPct) / 100 / Math.sqrt(252), 0.004, 0.085)
      : null;

  // Weight options implied vol higher when IV >> RV (forward stress fear)
  const ivWeight = ivDaily != null ? (ivDaily > realizedDynamic * 1.2 ? 0.42 : 0.32) : 0;
  const blendedDailyVol = clamp(
    ivDaily != null ? realizedDynamic * (1 - ivWeight) + ivDaily * ivWeight : realizedDynamic,
    0.0045,
    0.07
  );

  const persistence = clamp(alpha + beta, 0.75, 0.985);
  const termVolForDays = (horizonDays = 21) => {
    const h = Math.max(1, Math.round(horizonDays));
    let avgVar = 0;
    const startVar = blendedDailyVol * blendedDailyVol;
    const eqVar =
      ivDaily != null
        ? (longRunDailyVol * 0.7 + ivDaily * 0.3) ** 2
        : longRunVar;
    for (let k = 0; k < h; k++) {
      const decay = Math.pow(persistence, k);
      avgVar += eqVar + decay * (startVar - eqVar);
    }
    return +clamp(Math.sqrt(avgVar / h), 0.0045, 0.07).toFixed(5);
  };

  const ivSpreadAnnPct =
    ivDaily != null ? +((ivDaily - realizedDynamic) * Math.sqrt(252) * 100).toFixed(1) : 0;
  const volRegime =
    ivSpreadAnnPct >= 6
      ? 'Stress / High Options Fear'
      : garchDailyVol > longRunDailyVol * 1.22
        ? 'Volatility Clustering (Expanding)'
        : garchDailyVol < longRunDailyVol * 0.82
          ? 'Compressed / Coiling Vol'
          : 'Balanced Volatility';

  return {
    ewmaDailyVol: +ewmaDailyVol.toFixed(5),
    ewmaAnnVolPct: +(ewmaDailyVol * Math.sqrt(252) * 100).toFixed(1),
    garchDailyVol: +garchDailyVol.toFixed(5),
    longRunDailyVol: +longRunDailyVol.toFixed(5),
    blendedDailyVol: +blendedDailyVol.toFixed(5),
    blendedAnnVolPct: +(blendedDailyVol * Math.sqrt(252) * 100).toFixed(1),
    ivSpreadAnnPct,
    volRegime,
    termVolForDays,
  };
}

const EVENT_RISK_PROFILES = {
  fomc:          { shortLabel: 'FOMC',     volMult: 1.48, jumpMult: 2.5 },
  cpi:           { shortLabel: 'CPI',      volMult: 1.42, jumpMult: 2.3 },
  nfp:           { shortLabel: 'NFP',      volMult: 1.38, jumpMult: 2.1 },
  pce:           { shortLabel: 'PCE',      volMult: 1.24, jumpMult: 1.6 },
  comex_fnd:     { shortLabel: 'Ag FND',   volMult: 1.32, jumpMult: 1.9 },
  comex_gold_fnd:{ shortLabel: 'Au FND',   volMult: 1.24, jumpMult: 1.6 },
  cftc_cot:      { shortLabel: 'COT',      volMult: 1.12, jumpMult: 1.25 },
};

/**
 * Maps scheduled high-impact macro/COMEX calendar events into exact Jump-Diffusion
 * simulation steps so volatility and Poisson jump intensity spike specifically on FOMC/CPI/NFP/FND dates.
 */
export function buildEventRiskSchedule(
  expandedEvents = [],
  { calendarDays = 30, steps = 21 } = {}
) {
  if (!Array.isArray(expandedEvents) || !expandedEvents.length || steps < 2) return [];
  const byStep = new Map();

  for (const ev of expandedEvents) {
    const daysUntil = Number(ev?.daysUntil);
    if (!Number.isFinite(daysUntil) || daysUntil < 0 || daysUntil > calendarDays) continue;
    const type = String(ev?.type || '').toLowerCase();
    const prof = EVENT_RISK_PROFILES[type] || (ev?.impact === 'high'
      ? { shortLabel: 'Event', volMult: 1.28, jumpMult: 1.75 }
      : null);
    if (!prof) continue;

    const frac = clamp(daysUntil / Math.max(1, calendarDays), 0.04, 0.98);
    const stepIdx = clamp(Math.round(frac * steps), 1, steps);
    const existing = byStep.get(stepIdx);
    if (!existing || prof.jumpMult > existing.jumpMult) {
      byStep.set(stepIdx, {
        stepIdx,
        daysUntil,
        date: String(ev.date || ''),
        type,
        shortLabel: prof.shortLabel,
        title: String(ev.title || prof.shortLabel),
        impact: String(ev.impact || 'high'),
        volMult: prof.volMult,
        jumpMult: prof.jumpMult,
      });
    }
  }

  return Array.from(byStep.values()).sort((a, b) => a.stepIdx - b.stepIdx);
}

/**
 * Estimates jump intensity (jumps/day), jump mean skew, and jump volatility
 * from metal beta, macro VIX stress, active catalyst intensity, market regime
 * (Short Squeeze vs. True Price Discovery), and RSI exhaustion.
 */
export function estimateJumpParams({
  metal = 'gold',
  dailyVol = 0.012,
  unitScore = 0,
  vix = 18,
  catalystIntensity = 0.3,
  coneMultiplier = 1.0,
  lambdaMult = 1.0,
  sigmaJMult = 1.0,
  regime = null,
  rsi14 = null,
}) {
  const isSilver = metal === 'silver';
  // Split total realized vol into continuous diffusion (~82%) + jump component
  const diffVol = clamp(dailyVol * 0.84 * clamp(coneMultiplier, 0.8, 1.45), 0.0045, 0.045);

  const sqzScore = Number.isFinite(regime?.squeezeScore) ? regime.squeezeScore : 0;
  const discScore = Number.isFinite(regime?.discoveryScore) ? regime.discoveryScore : 50;
  const isBackwardation = Boolean(regime?.isBackwardation);
  const exhaustionRisk =
    sqzScore >= 65 && discScore < 45 && Number.isFinite(rsi14) && rsi14 >= 78;

  const vixBoost = clamp((vix - 16) / 35, 0, 0.08);
  const catBoost = clamp(catalystIntensity * 0.04, 0, 0.05);

  let regimeLambdaBoost = 0;
  let regimeSigmaMult = 1.0;
  let regimeJumpSkew = 0;
  let skewRegime = 'Balanced Tails';

  if (exhaustionRisk) {
    // Overextended short squeeze lacking structural discovery support -> elevated slam / pullback risk
    regimeLambdaBoost = isSilver ? 0.032 : 0.022;
    regimeSigmaMult = 1.18;
    regimeJumpSkew = isSilver ? -0.012 : -0.007;
    skewRegime = 'Squeeze Exhaustion / Slam Risk';
  } else if (sqzScore >= 55 || isBackwardation) {
    // Active Short Squeeze / Backwardation -> asymmetric fat right-tail upside skew
    const sqzIntensity = clamp((sqzScore - 45) / 55, 0, 1) + (isBackwardation ? 0.25 : 0);
    regimeLambdaBoost = clamp(sqzIntensity * (isSilver ? 0.034 : 0.021), 0, 0.045);
    regimeSigmaMult = 1 + clamp(sqzIntensity * 0.13, 0, 0.16);
    regimeJumpSkew = clamp(sqzIntensity * (isSilver ? 0.011 : 0.0065), 0, isSilver ? 0.014 : 0.0085);
    skewRegime = isBackwardation
      ? 'Right-Tail Squeeze (Backwardation)'
      : 'Right-Tail Squeeze Skew';
  } else if (discScore >= 58) {
    // Structural Price Discovery -> steady gentle upside skew, contained jump shocks
    regimeJumpSkew = isSilver ? 0.003 : 0.002;
    regimeSigmaMult = 0.96;
    skewRegime = 'Steady Structural Discovery';
  }

  // Baseline ~0.045 jumps/day Gold (~1/mo), ~0.085 jumps/day Silver (~1.8/mo), self-calibrated by lambdaMult
  const rawLambda = (isSilver ? 0.085 : 0.045) + vixBoost + catBoost + regimeLambdaBoost;
  const lambda = clamp(rawLambda * clamp(lambdaMult, 0.75, 1.45), 0.02, 0.30);

  // Jump size volatility: Silver jumps roughly 2x harder than Gold, self-calibrated by sigmaJMult
  const jumpSigma =
    (isSilver ? 0.042 : 0.022) *
    clamp(coneMultiplier, 0.8, 1.45) *
    clamp(sigmaJMult, 0.75, 1.45) *
    regimeSigmaMult;

  // Directional jump skew driven by active catalyst balance + asymmetric regime skew
  const baseJumpMean = unitScore * (isSilver ? 0.012 : 0.007);
  const jumpMean = clamp(baseJumpMean + regimeJumpSkew, -0.024, 0.026);

  // Daily drift capped conservatively so Monte Carlo medians match macro reality
  let dailyDrift = clamp(unitScore * dailyVol * 0.22, -0.008, 0.008);
  if (exhaustionRisk && dailyDrift > 0) {
    dailyDrift = Math.min(dailyDrift * 0.35, 0.0005);
  }

  return {
    diffVol: +diffVol.toFixed(5),
    lambda: +lambda.toFixed(4),
    jumpMean: +jumpMean.toFixed(5),
    jumpSigma: +jumpSigma.toFixed(5),
    dailyDrift: +dailyDrift.toFixed(5),
    expectedJumpsPerMonth: +(lambda * 21).toFixed(1),
    skewRegime,
    exhaustionRisk,
    exhaustionLabel: exhaustionRisk ? 'Squeeze Exhaustion — Slam Risk' : null,
  };
}

/**
 * Runs a Merton Jump-Diffusion Monte Carlo simulation over `tradingDays`.
 * Returns percentile envelopes (P10/P25/P50/P75/P90), jump-move probabilities,
 * and a small set of representative sample paths for visualization.
 */
export function runJumpDiffusion({
  spot,
  tradingDays = 21,
  paths = 1500,
  diffVol = 0.012,
  dailyDrift = 0,
  lambda = 0.05,
  jumpMean = 0,
  jumpSigma = 0.025,
  samplePathCount = 18,
  seed = 20261119,
  eventSchedule = [],
}) {
  const rng = createRng(seed);
  const kappa = Math.exp(jumpMean + 0.5 * jumpSigma * jumpSigma) - 1;
  const eventMap = new Map();
  if (Array.isArray(eventSchedule)) {
    for (const ev of eventSchedule) {
      const idx = Math.round(Number(ev?.stepIdx));
      if (idx >= 1 && idx <= tradingDays) eventMap.set(idx, ev);
    }
  }

  const terminalPrices = new Float64Array(paths);
  const maxPrices = new Float64Array(paths);
  const minPrices = new Float64Array(paths);
  const stepBuckets = Array.from({ length: tradingDays + 1 }, () => new Float64Array(paths));
  const samplePaths = [];

  for (let p = 0; p < paths; p++) {
    let s = spot;
    let hi = spot;
    let lo = spot;
    stepBuckets[0][p] = s;
    const recordSample = p < samplePathCount;
    const pathArr = recordSample ? [s] : null;

    for (let d = 1; d <= tradingDays; d++) {
      const ev = eventMap.get(d);
      const localVol = ev ? diffVol * clamp(Number(ev.volMult) || 1, 1, 2.2) : diffVol;
      const localLambda = ev ? lambda * clamp(Number(ev.jumpMult) || 1, 1, 3.5) : lambda;
      const localDrift = dailyDrift - 0.5 * localVol * localVol - localLambda * kappa;
      const z = normalSample(rng);
      const nJumps = poissonSample(localLambda, rng);
      let jumpSum = 0;
      for (let j = 0; j < nJumps; j++) {
        jumpSum += jumpMean + jumpSigma * normalSample(rng);
      }
      s = s * Math.exp(localDrift + localVol * z + jumpSum);
      if (s > hi) hi = s;
      if (s < lo) lo = s;
      stepBuckets[d][p] = s;
      if (recordSample) pathArr.push(+s.toFixed(2));
    }

    terminalPrices[p] = s;
    maxPrices[p] = hi;
    minPrices[p] = lo;
    if (recordSample) samplePaths.push(pathArr);
  }

  // Compute quantile trajectories per step for smooth P10 / P25 / P50 / P75 / P90 curves
  const curves = { p10: [], p25: [], p50: [], p75: [], p90: [] };
  for (let d = 0; d <= tradingDays; d++) {
    const sorted = Array.from(stepBuckets[d]).sort((a, b) => a - b);
    curves.p10.push(+quantile(sorted, 0.1).toFixed(2));
    curves.p25.push(+quantile(sorted, 0.25).toFixed(2));
    curves.p50.push(+quantile(sorted, 0.5).toFixed(2));
    curves.p75.push(+quantile(sorted, 0.75).toFixed(2));
    curves.p90.push(+quantile(sorted, 0.9).toFixed(2));
  }

  const endSorted = Array.from(terminalPrices).sort((a, b) => a - b);
  const p10 = +quantile(endSorted, 0.1).toFixed(2);
  const p25 = +quantile(endSorted, 0.25).toFixed(2);
  const p50 = +quantile(endSorted, 0.5).toFixed(2);
  const p75 = +quantile(endSorted, 0.75).toFixed(2);
  const p90 = +quantile(endSorted, 0.9).toFixed(2);

  // Tail event probabilities (+5% surge / -5% drop touch probabilities)
  const up5 = spot * 1.05;
  const dn5 = spot * 0.95;
  let touchUp5 = 0;
  let touchDn5 = 0;
  let finishHigher = 0;
  for (let p = 0; p < paths; p++) {
    if (maxPrices[p] >= up5) touchUp5++;
    if (minPrices[p] <= dn5) touchDn5++;
    if (terminalPrices[p] > spot) finishHigher++;
  }

  // Round psychological upside/downside milestone targets
  const stepRound = spot >= 1000 ? 100 : spot >= 100 ? 10 : 5;
  const upTarget = Math.ceil((spot * 1.04) / stepRound) * stepRound;
  const dnTarget = Math.floor((spot * 0.96) / stepRound) * stepRound;

  const targetStats = (target) => {
    const isUp = target >= spot;
    let touch = 0;
    let finish = 0;
    for (let p = 0; p < paths; p++) {
      if (isUp ? maxPrices[p] >= target : minPrices[p] <= target) touch++;
      if (isUp ? terminalPrices[p] >= target : terminalPrices[p] <= target) finish++;
    }
    return {
      target: +target.toFixed(2),
      direction: isUp ? 'above' : 'below',
      touchPct: Math.round((touch / paths) * 100),
      finishPct: Math.round((finish / paths) * 100),
    };
  };

  return {
    paths,
    tradingDays,
    spot: +spot.toFixed(2),
    p10,
    p25,
    p50,
    p75,
    p90,
    p10Pct: +(((p10 - spot) / spot) * 100).toFixed(2),
    p50Pct: +(((p50 - spot) / spot) * 100).toFixed(2),
    p90Pct: +(((p90 - spot) / spot) * 100).toFixed(2),
    probFinishHigherPct: Math.round((finishHigher / paths) * 100),
    probTouchUp5Pct: Math.round((touchUp5 / paths) * 100),
    probTouchDown5Pct: Math.round((touchDn5 / paths) * 100),
    milestones: {
      upside: targetStats(upTarget),
      downside: targetStats(dnTarget),
    },
    curves,
    samplePaths,
  };
}
