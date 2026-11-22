/**
 * Bullion Pulse — Off-Main-Thread Merton Jump-Diffusion Web Worker
 * Runs 1,500-path stochastic simulations off the UI thread so mobile scrolling
 * and What-If / Target interactions stay locked at 60fps.
 * Uses zero-copy Transferable ArrayBuffers for terminal/max/min price arrays.
 */

function clampNum(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

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

self.onmessage = (event) => {
  const { reqId, cacheKey, spot, horizonKey, spec, paths: rawPaths = 1500, params, seed } = event.data || {};
  if (!Number.isFinite(spot) || spot <= 0 || !spec || !params) return;

  const paths = Math.round(clampNum(Number(rawPaths) || 1500, 1, 5000));
  const totalDays = clampNum(Number(spec.tradingDays) || 1, 1, 3650);
  const steps = Math.round(clampNum(Number(spec.steps) || 1, 1, 400));
  const dt = totalDays / steps;

  const rng = createMcRng(Number.isFinite(Number(seed)) ? Number(seed) : 1);
  const diffVol = Number(params.diffVol);
  const dailyDrift = Number(params.dailyDrift);
  const lambda = Number(params.lambda);
  const jumpMean = Number(params.jumpMean);
  const jumpSigma = Number(params.jumpSigma);
  if (![diffVol, dailyDrift, lambda, jumpMean, jumpSigma].every(Number.isFinite)) return;
  const safeDiffVol = clampNum(diffVol, 0, 5);
  const safeDailyDrift = clampNum(dailyDrift, -0.5, 0.5);
  const safeLambda = clampNum(lambda, 0, 10);
  const safeJumpMean = clampNum(jumpMean, -1, 1);
  const safeJumpSigma = clampNum(jumpSigma, 0, 2);

  const kappa = Math.exp(safeJumpMean + 0.5 * safeJumpSigma * safeJumpSigma) - 1;
  const driftStep = (safeDailyDrift - 0.5 * safeDiffVol * safeDiffVol - safeLambda * kappa) * dt;
  const stepDiffVol = safeDiffVol * Math.sqrt(dt);
  const stepLambda = safeLambda * dt;

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
        jumpSum = nJumps * safeJumpMean + Math.sqrt(nJumps) * safeJumpSigma * mcNormal(rng);
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

  const sim = {
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

  self.postMessage(
    { reqId, cacheKey, sim },
    [terminalPrices.buffer, maxPrices.buffer, minPrices.buffer]
  );
};
