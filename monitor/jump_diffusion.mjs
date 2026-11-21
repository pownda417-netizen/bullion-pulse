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
}) {
  const rng = createRng(seed);
  const kappa = Math.exp(jumpMean + 0.5 * jumpSigma * jumpSigma) - 1;
  const driftStep = dailyDrift - 0.5 * diffVol * diffVol - lambda * kappa;

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
      const z = normalSample(rng);
      const nJumps = poissonSample(lambda, rng);
      let jumpSum = 0;
      for (let j = 0; j < nJumps; j++) {
        jumpSum += jumpMean + jumpSigma * normalSample(rng);
      }
      s = s * Math.exp(driftStep + diffVol * z + jumpSum);
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
