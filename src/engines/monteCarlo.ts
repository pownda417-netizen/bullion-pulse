/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MetalKey, MonteCarloMilestone, MonteCarloSummary } from '../types/bullion';
import { clampNum } from '../utils/format';
import { estimateJumpParams, runJumpDiffusion } from '../../monitor/jump_diffusion.mjs';

const mcCache = new Map<string, MonteCarloSummary>();
const MAX_MC_CACHE = 32;

let mcWorker: Worker | null = null;
let reqSeq = 0;

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!mcWorker) {
    try {
      mcWorker = new Worker('./mc_worker.js');
    } catch {
      return null;
    }
  }
  return mcWorker;
}

export interface MonteCarloRequest {
  metal: MetalKey;
  spot: number;
  horizonDays: number; // calendar days: 7 | 30 | 90
  annualVolPct: number;
  unitScore: number; // -1..+1
  vix?: number;
  coneMultiplier?: number;
  lambdaMult?: number;
  sigmaJMult?: number;
  regime?: Record<string, any> | null;
  rsi14?: number | null;
  spaceJumpBoost?: number;
  ensembleTargetPct?: number | null; // expected % move from 4-model ensemble for this horizon
  hurst?: number;
  precomputedJumpParams?: Record<string, any> | null;
  pathsCount?: number;
}

export function calendarToTradingDays(calendarDays: number): number {
  if (calendarDays <= 7) return 5;
  if (calendarDays <= 30) return 21;
  return Math.max(5, Math.round((calendarDays / 365) * 252));
}

function resolveJumpParams(req: MonteCarloRequest): {
  diffVol: number;
  lambda: number;
  jumpMean: number;
  jumpSigma: number;
  dailyDrift: number;
  expectedJumpsPerMonth: number;
  skewRegime: string;
  exhaustionRisk: boolean;
} {
  const dailyVol = clampNum(req.annualVolPct / 100 / Math.sqrt(252), 0.005, 0.055);
  const pre = req.precomputedJumpParams;
  const est = estimateJumpParams({
    metal: req.metal,
    dailyVol,
    unitScore: clampNum(req.unitScore, -1, 1),
    vix: req.vix ?? 18,
    coneMultiplier: req.coneMultiplier ?? 1.0,
    lambdaMult: req.lambdaMult ?? 1.0,
    sigmaJMult: req.sigmaJMult ?? 1.0,
    regime: req.regime || null,
    rsi14: req.rsi14 ?? null,
  });

  // Prefer calibrated backend jumpParams when available & no extreme override, layering space jump boost
  const usePre =
    pre &&
    Number.isFinite(Number(pre.diffVol)) &&
    Number.isFinite(Number(pre.lambda)) &&
    Number.isFinite(Number(pre.jumpSigma)) &&
    Math.abs(req.unitScore) < 0.99;

  const baseDiffVol = usePre ? Number(pre.diffVol) : Number(est.diffVol);
  const baseLambda = clampNum((usePre ? Number(pre.lambda) : Number(est.lambda)) + (req.spaceJumpBoost ?? 0), 0.02, 0.35);
  const baseJumpMean = usePre ? Number(pre.jumpMean) : Number(est.jumpMean);
  const baseJumpSigma = usePre ? Number(pre.jumpSigma) : Number(est.jumpSigma);
  // Blend backend drift with live unitScore so scenario/whisper changes move the distribution cleanly
  const baseDailyDrift = usePre
    ? clampNum(Number(pre.dailyDrift) * 0.65 + Number(est.dailyDrift) * 0.35, -0.008, 0.008)
    : Number(est.dailyDrift);

  return {
    diffVol: +baseDiffVol.toFixed(5),
    lambda: +baseLambda.toFixed(4),
    jumpMean: +baseJumpMean.toFixed(5),
    jumpSigma: +baseJumpSigma.toFixed(5),
    dailyDrift: +baseDailyDrift.toFixed(5),
    expectedJumpsPerMonth: +(baseLambda * 21).toFixed(1),
    skewRegime: String((usePre ? pre.skewRegime : est.skewRegime) || 'Balanced Tails'),
    exhaustionRisk: Boolean(usePre ? pre.exhaustionRisk : est.exhaustionRisk),
  };
}

/**
 * Computes the Most Logical Prediction Path inside the high-density P25–P75 Core 50% Zone:
 * - Combines the P50 median jump-diffusion curve with the 4-model ensemble drift anchor
 * - Shapes early vs. late trajectory using Hurst persistence/mean-reversion dynamics
 * - Strictly constrains every step inside the P25–P75 Core 50% Probability Corridor
 * - Also identifies the exact realized simulated path closest in L2 norm to the logical trajectory
 */
function buildLogicalTrajectory(
  spot: number,
  curves: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] },
  samplePaths: number[][],
  req: MonteCarloRequest,
  jumpParams: ReturnType<typeof resolveJumpParams>
): {
  logicalPath: number[];
  logicalEnd: number;
  logicalMovePct: number;
  logicalReason: string;
  closestSamplePath: number[];
} {
  const steps = curves.p50.length;
  const p50End = curves.p50[steps - 1] ?? spot;
  const p25End = curves.p25[steps - 1] ?? spot;
  const p75End = curves.p75[steps - 1] ?? spot;

  // Ensemble-anchored terminal target (blending 55% ensemble anchor + 45% P50 median + subtle jump skew)
  const ensTarget =
    req.ensembleTargetPct != null && Number.isFinite(req.ensembleTargetPct)
      ? spot * (1 + req.ensembleTargetPct / 100)
      : p50End;
  const skewShift = spot * clampNum(jumpParams.jumpMean * jumpParams.lambda * calendarToTradingDays(req.horizonDays) * 0.45, -0.025, 0.025);
  const rawLogicalEnd = ensTarget * 0.58 + p50End * 0.42 + skewShift;
  // Constrain firmly within the high-density core (P25..P75) so it is ALWAYS statistically logical
  const logicalEnd = +clampNum(rawLogicalEnd, p25End, p75End).toFixed(2);

  // Curvature exponent from Hurst exponent:
  // H < 0.48 (mean-reverting): front-loaded / gentle S-curve pullback then drift;
  // H > 0.54 (trending): steady concave continuation
  const hurst = clampNum(req.hurst ?? 0.5, 0.25, 0.78);
  const logicalPath: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps > 1 ? i / (steps - 1) : 1;
    const p50i = curves.p50[i] ?? spot;
    const p25i = curves.p25[i] ?? spot;
    const p75i = curves.p75[i] ?? spot;

    const linearTarget = spot + (logicalEnd - spot) * t;
    // Subtle regime-aware inflection wave that vanishes at endpoints t=0 and t=1
    const regimeWave =
      hurst < 0.48
        ? -Math.sin(Math.PI * t) * Math.abs(logicalEnd - spot) * 0.14 * (1 - t * 0.4)
        : hurst > 0.54
          ? Math.sin(Math.PI * t) * (logicalEnd - spot) * 0.1
          : 0;
    const blended = p50i * 0.35 + (linearTarget + regimeWave) * 0.65;
    const clamped = i === 0 ? spot : clampNum(blended, p25i, p75i);
    logicalPath.push(+clamped.toFixed(2));
  }

  // Pick the closest realized jump-diffusion sample path (L2 norm vs logicalPath)
  let closestSamplePath: number[] = logicalPath;
  let bestDist = Infinity;
  for (const sp of samplePaths) {
    if (!Array.isArray(sp) || sp.length !== steps) continue;
    let d2 = 0;
    for (let i = 0; i < steps; i++) {
      const diff = (sp[i] - logicalPath[i]) / Math.max(1, spot);
      d2 += diff * diff;
    }
    if (d2 < bestDist) {
      bestDist = d2;
      closestSamplePath = sp.map((v) => +Number(v).toFixed(2));
    }
  }

  const logicalMovePct = spot > 0 ? +(((logicalEnd - spot) / spot) * 100).toFixed(2) : 0;
  const dirWord =
    logicalMovePct > 0.35 ? 'gradual upward drift' : logicalMovePct < -0.35 ? 'controlled pullback' : 'range-bound consolidation';
  const hurstDesc =
    hurst < 0.48
      ? `mean-reverting chop (H=${hurst.toFixed(2)}) favoring dip-and-recover swings`
      : hurst > 0.54
        ? `persistent trend (H=${hurst.toFixed(2)}) favoring directional follow-through`
        : `balanced diffusion (H=${hurst.toFixed(2)})`;

  const logicalReason = `Highest-density corridor points to a ${dirWord} (${logicalMovePct >= 0 ? '+' : ''}${logicalMovePct.toFixed(2)}%) inside the P25–P75 core band, shaped by ${jumpParams.skewRegime.toLowerCase()} (~${jumpParams.expectedJumpsPerMonth} jumps/mo) and ${hurstDesc}.`;

  return {
    logicalPath,
    logicalEnd,
    logicalMovePct,
    logicalReason,
    closestSamplePath,
  };
}

function computeMilestonesFromArrays(
  spot: number,
  terminalPrices: Float64Array,
  maxPrices: Float64Array,
  minPrices: Float64Array
): {
  probUp: number;
  probPlus5: number;
  probMinus5: number;
  milestones: { upside: MonteCarloMilestone; downside: MonteCarloMilestone };
} {
  const n = terminalPrices.length || 1;
  const up5 = spot * 1.05;
  const dn5 = spot * 0.95;
  let finishHigher = 0;
  let touchUp5 = 0;
  let touchDn5 = 0;

  const stepRound = spot >= 1000 ? 100 : spot >= 100 ? 10 : 5;
  const upTarget = Math.ceil((spot * 1.04) / stepRound) * stepRound;
  const dnTarget = Math.floor((spot * 0.96) / stepRound) * stepRound;
  let upTouch = 0;
  let upFin = 0;
  let dnTouch = 0;
  let dnFin = 0;

  for (let i = 0; i < n; i++) {
    if (terminalPrices[i] > spot) finishHigher++;
    if (maxPrices[i] >= up5) touchUp5++;
    if (minPrices[i] <= dn5) touchDn5++;
    if (maxPrices[i] >= upTarget) upTouch++;
    if (terminalPrices[i] >= upTarget) upFin++;
    if (minPrices[i] <= dnTarget) dnTouch++;
    if (terminalPrices[i] <= dnTarget) dnFin++;
  }

  return {
    probUp: Math.round((finishHigher / n) * 100),
    probPlus5: Math.round((touchUp5 / n) * 100),
    probMinus5: Math.round((touchDn5 / n) * 100),
    milestones: {
      upside: {
        target: +upTarget.toFixed(2),
        direction: 'above',
        touchPct: Math.round((upTouch / n) * 100),
        finishPct: Math.round((upFin / n) * 100),
      },
      downside: {
        target: +dnTarget.toFixed(2),
        direction: 'below',
        touchPct: Math.round((dnTouch / n) * 100),
        finishPct: Math.round((dnFin / n) * 100),
      },
    },
  };
}

function buildSummary(
  req: MonteCarloRequest,
  tradingDays: number,
  pathsCount: number,
  curves: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] },
  samplePaths: number[][],
  probs: {
    probUp: number;
    probPlus5: number;
    probMinus5: number;
    milestones?: { upside: MonteCarloMilestone; downside: MonteCarloMilestone };
  },
  jumpParams: ReturnType<typeof resolveJumpParams>
): MonteCarloSummary {
  const lastIdx = curves.p50.length - 1;
  const p10End = +Number(curves.p10[lastIdx] ?? req.spot).toFixed(2);
  const p25End = +Number(curves.p25[lastIdx] ?? req.spot).toFixed(2);
  const medianEnd = +Number(curves.p50[lastIdx] ?? req.spot).toFixed(2);
  const p75End = +Number(curves.p75[lastIdx] ?? req.spot).toFixed(2);
  const p90End = +Number(curves.p90[lastIdx] ?? req.spot).toFixed(2);
  const medianMovePct = req.spot > 0 ? +(((medianEnd - req.spot) / req.spot) * 100).toFixed(2) : 0;

  const logical = buildLogicalTrajectory(req.spot, curves, samplePaths, req, jumpParams);

  return {
    metal: req.metal,
    spot: +req.spot.toFixed(2),
    horizonDays: req.horizonDays,
    tradingDays,
    pathsCount,
    p10: curves.p10.map((v) => +Number(v).toFixed(2)),
    p25: curves.p25.map((v) => +Number(v).toFixed(2)),
    p50: curves.p50.map((v) => +Number(v).toFixed(2)),
    p75: curves.p75.map((v) => +Number(v).toFixed(2)),
    p90: curves.p90.map((v) => +Number(v).toFixed(2)),
    logicalPath: logical.logicalPath,
    logicalEnd: logical.logicalEnd,
    logicalMovePct: logical.logicalMovePct,
    logicalReason: logical.logicalReason,
    closestSamplePath: logical.closestSamplePath,
    samplePaths,
    probUp: probs.probUp,
    probPlus5: probs.probPlus5,
    probMinus5: probs.probMinus5,
    medianEnd,
    medianMovePct,
    p10End,
    p25End,
    p75End,
    p90End,
    jumpRegime: jumpParams.skewRegime,
    expectedJumpsPerMonth: jumpParams.expectedJumpsPerMonth,
    annualVolPct: +req.annualVolPct.toFixed(1),
    dailyDriftPct: +(jumpParams.dailyDrift * 100).toFixed(3),
    exhaustionRisk: jumpParams.exhaustionRisk,
    milestones: probs.milestones,
  };
}

function makeCacheKey(req: MonteCarloRequest, paths: number): string {
  return [
    req.metal,
    Math.round(req.spot * 10),
    req.horizonDays,
    Math.round(req.annualVolPct * 2),
    Math.round(req.unitScore * 100),
    Math.round((req.ensembleTargetPct ?? 0) * 10),
    Math.round((req.regime?.squeezeScore ?? 50)),
    paths,
  ].join('|');
}

export function runMonteCarloSync(req: MonteCarloRequest): MonteCarloSummary {
  const paths = Math.min(2000, Math.max(300, req.pathsCount ?? 1000));
  const cacheKey = makeCacheKey(req, paths);
  const cached = mcCache.get(cacheKey);
  if (cached) return cached;

  const tradingDays = calendarToTradingDays(req.horizonDays);
  const jumpParams = resolveJumpParams(req);
  const seed = (req.metal === 'silver' ? 20261199 : 20261127) + req.horizonDays * 31;

  const raw = runJumpDiffusion({
    spot: req.spot,
    tradingDays,
    paths,
    diffVol: jumpParams.diffVol,
    dailyDrift: jumpParams.dailyDrift,
    lambda: jumpParams.lambda,
    jumpMean: jumpParams.jumpMean,
    jumpSigma: jumpParams.jumpSigma,
    samplePathCount: 24,
    seed,
  });

  const curves = raw.curves || {
    p10: [req.spot, raw.p10 ?? req.spot],
    p25: [req.spot, raw.p25 ?? req.spot],
    p50: [req.spot, raw.p50 ?? req.spot],
    p75: [req.spot, raw.p75 ?? req.spot],
    p90: [req.spot, raw.p90 ?? req.spot],
  };

  const result = buildSummary(
    req,
    tradingDays,
    paths,
    curves,
    Array.isArray(raw.samplePaths) ? raw.samplePaths : [],
    {
      probUp: Number(raw.probFinishHigherPct ?? 50),
      probPlus5: Number(raw.probTouchUp5Pct ?? 0),
      probMinus5: Number(raw.probTouchDown5Pct ?? 0),
      milestones: raw.milestones,
    },
    jumpParams
  );

  if (mcCache.size >= MAX_MC_CACHE) {
    const oldest = mcCache.keys().next().value;
    if (oldest !== undefined) mcCache.delete(oldest);
  }
  mcCache.set(cacheKey, result);
  return result;
}

export async function runMonteCarloAsync(req: MonteCarloRequest): Promise<MonteCarloSummary> {
  const paths = Math.min(2000, Math.max(600, req.pathsCount ?? 1500));
  const cacheKey = makeCacheKey(req, paths);
  const cached = mcCache.get(cacheKey);
  if (cached) return cached;

  const tradingDays = calendarToTradingDays(req.horizonDays);
  const jumpParams = resolveJumpParams(req);
  const worker = getWorker();
  if (!worker) {
    return runMonteCarloSync({ ...req, pathsCount: paths });
  }

  return new Promise<MonteCarloSummary>((resolve) => {
    const reqId = ++reqSeq;
    const timeout = setTimeout(() => {
      worker.removeEventListener('message', onMsg);
      resolve(runMonteCarloSync({ ...req, pathsCount: paths }));
    }, 2500);

    const onMsg = (ev: MessageEvent) => {
      const d = ev.data || {};
      if (d.reqId !== reqId) return;
      clearTimeout(timeout);
      worker.removeEventListener('message', onMsg);
      if (d.sim?.curves?.p50?.length >= 2) {
        const sim = d.sim;
        const probs = computeMilestonesFromArrays(
          req.spot,
          sim.terminalPrices,
          sim.maxPrices,
          sim.minPrices
        );
        const res = buildSummary(
          req,
          tradingDays,
          paths,
          sim.curves,
          Array.isArray(sim.samplePaths) ? sim.samplePaths : [],
          probs,
          jumpParams
        );
        if (mcCache.size >= MAX_MC_CACHE) {
          const oldest = mcCache.keys().next().value;
          if (oldest !== undefined) mcCache.delete(oldest);
        }
        mcCache.set(cacheKey, res);
        resolve(res);
      } else {
        resolve(runMonteCarloSync({ ...req, pathsCount: paths }));
      }
    };

    worker.addEventListener('message', onMsg);
    try {
      const seed = (req.metal === 'silver' ? 20261199 : 20261127) + req.horizonDays * 31;
      worker.postMessage({
        reqId,
        cacheKey,
        spot: req.spot,
        horizonKey: `${req.horizonDays}d`,
        spec: { tradingDays, steps: Math.min(42, Math.max(10, tradingDays)) },
        paths,
        params: {
          diffVol: jumpParams.diffVol,
          dailyDrift: jumpParams.dailyDrift,
          lambda: jumpParams.lambda,
          jumpMean: jumpParams.jumpMean,
          jumpSigma: jumpParams.jumpSigma,
        },
        seed,
      });
    } catch {
      clearTimeout(timeout);
      worker.removeEventListener('message', onMsg);
      resolve(runMonteCarloSync({ ...req, pathsCount: paths }));
    }
  });
}
