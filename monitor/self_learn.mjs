/**
 * Bullion Pulse — Optimized Daily Post-Close Self-Learning Engine
 * Runs strictly ONCE per trading day, 10 minutes after US/COMEX market close (5:10 PM ET).
 *
 * Production quant optimizations built in:
 *  1. Multi-Horizon Grading: blends 1D (25%) + 5D (45%) + 20D (30%) post-close outcomes
 *     so slow structural drivers (Central Banks, Real Yields, Mining Deficit) earn fair credit.
 *  2. US/COMEX Holiday Calendar + Stale-Close Guard: skips non-trading days automatically.
 *  3. Huber Outlier Clipping (>2.5σ shock damping): prevents one wild headline day from distorting weights.
 *  4. Dual-Regime Learned Weights ('calm' vs. 'stress'): keeps normal-market weights separate from
 *     high-volatility / COMEX backwardation squeeze regimes.
 *  5. Champion-Challenger Auto-Rollback (Pinball Loss): benchmarks learned weights against static
 *     baseline weights every day; auto-dampens 50% back toward prior if learned trails over >=15 days.
 *  6. Jump-Diffusion Tail Calibration: adapts lambdaMult & sigmaJMult toward ~20% P10-P90 breach rate.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DRIVER_META } from './historical_patterns.mjs';
import { parseGoldPriceOrg } from './check_metals.mjs';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) BullionPulseLearner/2.0';

export const LEARNING_CONFIG = {
  learningRate: 0.045,
  priorShrinkage: 0.08,
  minWeight: 0.03,
  maxWeight: 0.28,
  huberDeltaSigma: 2.5,
  horizonWeights: { d1: 0.25, d5: 0.45, d20: 0.30 },
  driftAlpha: 0.12,
  maxDriftBiasPct: 0.35,
  targetInConePct: 75,
  minConeMult: 0.8,
  maxConeMult: 1.45,
  targetTailBreachPct: 20,
  minJumpMult: 0.75,
  maxJumpMult: 1.45,
  rollbackMinDays: 15,
  rollbackLossThresholdRatio: 1.04,
  scheduleLabel: '5:10 PM ET (10m after close)',
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Computes observed date for fixed-date US/COMEX holidays (Sat -> Fri, Sun -> Mon). */
function observedFixedHoliday(year, monthIdx, day) {
  const d = new Date(Date.UTC(year, monthIdx, day));
  const wd = d.getUTCDay();
  if (wd === 6) d.setUTCDate(day - 1);
  else if (wd === 0) d.setUTCDate(day + 1);
  return d.toISOString().slice(0, 10);
}

/** Computes Nth weekday of a month (weekday: 0=Sun..6=Sat, nth: 1..4 or -1 for last). */
function nthWeekdayOfMonth(year, monthIdx, weekday, nth) {
  if (nth > 0) {
    const first = new Date(Date.UTC(year, monthIdx, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    const d = new Date(Date.UTC(year, monthIdx, 1 + offset + (nth - 1) * 7));
    return d.toISOString().slice(0, 10);
  }
  const last = new Date(Date.UTC(year, monthIdx + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  last.setUTCDate(last.getUTCDate() - offset);
  return last.toISOString().slice(0, 10);
}

/** Anonymous Gregorian Easter algorithm -> Good Friday (Easter - 2 days). */
function goodFridayForYear(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(Date.UTC(year, month, day));
  easter.setUTCDate(easter.getUTCDate() - 2);
  return easter.toISOString().slice(0, 10);
}

/** Returns true when `dayKey` (YYYY-MM-DD) is a US/CME COMEX market holiday. */
export function isComexHoliday(dayKey) {
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return false;
  const year = Number(dayKey.slice(0, 4));
  const holidays = new Set([
    observedFixedHoliday(year, 0, 1),     // New Year's Day
    nthWeekdayOfMonth(year, 0, 1, 3),     // MLK Day (3rd Mon Jan)
    nthWeekdayOfMonth(year, 1, 1, 3),     // Presidents' Day (3rd Mon Feb)
    goodFridayForYear(year),              // Good Friday
    nthWeekdayOfMonth(year, 4, 1, -1),    // Memorial Day (Last Mon May)
    observedFixedHoliday(year, 5, 19),    // Juneteenth
    observedFixedHoliday(year, 6, 4),     // Independence Day
    nthWeekdayOfMonth(year, 8, 1, 1),     // Labor Day (1st Mon Sep)
    nthWeekdayOfMonth(year, 10, 4, 4),    // Thanksgiving (4th Thu Nov)
    observedFixedHoliday(year, 11, 25),   // Christmas Day
  ]);
  return holidays.has(dayKey);
}

/** Detects 'stress' vs 'calm' metals regime from volatility, backwardation, and COMEX tightness. */
export function detectMarketRegime({
  vix = 18,
  gvz = null,
  silverBackwardation = false,
  comexSilverRatio = null,
} = {}) {
  const highVol = (Number.isFinite(gvz) && gvz >= 20) || (Number.isFinite(vix) && vix >= 21);
  const tightPhysical = Boolean(silverBackwardation) || (Number.isFinite(comexSilverRatio) && comexSilverRatio >= 6.5);
  return highVol || tightPhysical ? 'stress' : 'calm';
}

export function detectRegimeFromOutlook(outlook) {
  if (!outlook) return 'calm';
  return detectMarketRegime({
    vix: outlook.macroSnapshot?.vix ?? 18,
    gvz: outlook.institutionalSignals?.impliedVol?.gvz ?? null,
    silverBackwardation: (outlook.institutionalSignals?.basis?.silver?.basisUsd ?? 1) < 0,
    comexSilverRatio: outlook.comex?.silver?.paperToRegisteredRatio ?? null,
  });
}

export function getBaselineWeights() {
  const gold = {};
  const silver = {};
  for (const [id, meta] of Object.entries(DRIVER_META)) {
    gold[id] = meta.goldWeight;
    silver[id] = meta.silverWeight;
  }
  return { gold, silver };
}

export function createInitialLearnedState() {
  const base = getBaselineWeights();
  return {
    version: 2,
    schedule: LEARNING_CONFIG.scheduleLabel,
    lastLearnedDay: null,
    lastUpdatedAt: null,
    totalCycles: 0,
    activeRegime: 'calm',
    coneMultiplier: 1.0,
    driftBiasGoldPct: 0,
    driftBiasSilverPct: 0,
    weights: structuredClone(base),
    regimeWeights: {
      calm: structuredClone(base),
      stress: structuredClone(base),
    },
    weightDeltasFromBase: { gold: {}, silver: {} },
    jumpCalibration: {
      lambdaMult: 1.0,
      sigmaJMult: 1.0,
      observedTailBreachPct: 20,
      targetTailBreachPct: LEARNING_CONFIG.targetTailBreachPct,
    },
    championChallenger: {
      status: 'warming_up',
      evaluatedDays: 0,
      learnedPinballLoss: null,
      baselinePinballLoss: null,
      edgePct: 0,
      rollbackActive: false,
    },
    pendingSnapshot: null,
    snapshotQueue: [],
    summary: {
      rollingDirHitGoldPct: null,
      rollingDirHitSilverPct: null,
      rollingInConePct: null,
      avgAbsErrGoldPct: null,
      avgAbsErrSilverPct: null,
      horizonsActive: ['1D'],
      topBoostedDriver: null,
      topTrimmedDriver: null,
    },
    history: [],
  };
}

/** Returns America/New_York local date key (YYYY-MM-DD), hour (0-23), minute (0-59), and weekday (0=Sun..6=Sat). */
export function getNewYorkClock(nowDate = new Date()) {
  const d = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(get('hour')) % 24;
  return {
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute: Number(get('minute')),
    weekday: wdMap[get('weekday')] ?? 1,
  };
}

/** True when NY clock is on a non-holiday trading weekday at or after 5:05 PM ET (close is 5:00 PM ET; run 5:10 PM ET). */
export function isPostCloseLearningWindow(nowDate = new Date()) {
  const ny = getNewYorkClock(nowDate);
  const isWeekday = ny.weekday >= 1 && ny.weekday <= 5;
  if (!isWeekday || isComexHoliday(ny.dayKey)) return false;
  const minsSinceMidnight = ny.hour * 60 + ny.minute;
  return minsSinceMidnight >= 17 * 60 + 5;
}

/** Huber damping factor: linear up to delta (2.5σ), softly clipped beyond to ignore one-day shock outliers. */
export function huberScale(absMovePct, expectedScalePct, delta = LEARNING_CONFIG.huberDeltaSigma) {
  const z = absMovePct / Math.max(0.35, expectedScalePct);
  if (z <= delta) return clamp(z, 0.25, 1.4);
  // Smoothly damp extreme outliers (e.g. 5σ shock shrinks back toward 1.0 instead of exploding)
  return clamp((delta / z) * 1.15, 0.35, 1.15);
}

/** Pinball quantile loss averaged across P10, P50, P90 for honest Champion-Challenger grading. */
export function computePinballLoss(actualPct, predPct, halfConePct) {
  const q10 = predPct - halfConePct * 1.12;
  const q50 = predPct;
  const q90 = predPct + halfConePct * 1.12;
  const loss = (q, tau) => {
    const diff = actualPct - q;
    return diff >= 0 ? tau * diff : (tau - 1) * diff;
  };
  return +((loss(q10, 0.1) + loss(q50, 0.5) + loss(q90, 0.9)) / 3).toFixed(4);
}

function predictFromWeights(drivers, weightsMap, metalKey, scalePct) {
  let comp = 0;
  for (const d of drivers || []) {
    const score = Number(d[metalKey] ?? 0);
    const w = weightsMap[d.id] ?? 0;
    comp += score * w;
  }
  return +(clamp(comp * 1.45, -1, 1) * scalePct * 0.65).toFixed(3);
}

function normalizeAndClampWeights(rawMap, baseMap, shrinkage = LEARNING_CONFIG.priorShrinkage) {
  const ids = Object.keys(baseMap);
  const clamped = {};
  for (const id of ids) {
    const base = baseMap[id];
    const w = Number.isFinite(rawMap[id]) ? rawMap[id] : base;
    const shrunk = w * (1 - shrinkage) + base * shrinkage;
    clamped[id] = clamp(shrunk, LEARNING_CONFIG.minWeight, LEARNING_CONFIG.maxWeight);
  }

  for (let iter = 0; iter < 6; iter++) {
    const sum = ids.reduce((acc, id) => acc + clamped[id], 0);
    if (!sum) break;
    const scale = 1 / sum;
    for (const id of ids) {
      clamped[id] = clamp(clamped[id] * scale, LEARNING_CONFIG.minWeight, LEARNING_CONFIG.maxWeight);
    }
  }

  const rounded = {};
  let running = 0;
  ids.forEach((id, idx) => {
    if (idx === ids.length - 1) {
      rounded[id] = +Math.max(LEARNING_CONFIG.minWeight, 1 - running).toFixed(4);
    } else {
      rounded[id] = +clamped[id].toFixed(4);
      running += rounded[id];
    }
  });
  return rounded;
}

/**
 * Multi-horizon damped Hedge update: aggregates weighted alignment across
 * 1D (25%) + 5D (45%) + 20D (30%) windows with Huber outlier clipping.
 */
function updateWeightsMultiHorizon({ currentWeights, baseWeights, horizonObs }) {
  const nextRaw = { ...currentWeights };
  const totalHW = horizonObs.reduce((acc, o) => acc + o.weight, 0) || 1;
  const driverGrad = {};

  for (const obs of horizonObs) {
    const hW = obs.weight / totalHW;
    const dirActual = obs.actualPct > 0.05 ? 1 : obs.actualPct < -0.05 ? -1 : 0;
    if (dirActual === 0) continue;
    const magScale = huberScale(Math.abs(obs.actualPct), obs.expectedMovePct);

    for (const d of obs.drivers || []) {
      const id = d.id;
      if (!(id in baseWeights)) continue;
      const score = d.score;
      if (!Number.isFinite(score) || Math.abs(score) < 0.05) continue;
      const alignment = clamp(score * dirActual, -1, 1);
      driverGrad[id] = (driverGrad[id] || 0) + hW * alignment * magScale;
    }
  }

  for (const id of Object.keys(baseWeights)) {
    const g = driverGrad[id] || 0;
    const mult = Math.exp(LEARNING_CONFIG.learningRate * g);
    nextRaw[id] = (currentWeights[id] ?? baseWeights[id]) * mult;
  }

  return normalizeAndClampWeights(nextRaw, baseWeights);
}

/**
 * Builds a compact snapshot of today's settled prediction, regime, & 9 driver scores
 * stored in `snapshotQueue` to be graded across 1D, 5D, and 20D horizons at 5:10 PM ET.
 */
export function buildPendingSnapshot(outlook, actualGoldClose, actualSilverClose, dayKey) {
  const drivers = (outlook?.drivers || []).map((d) => ({
    id: d.id,
    shortLabel: d.shortLabel || d.id,
    gold: Number(d.gold || 0),
    silver: Number(d.silver || 0),
  }));

  const g7 = outlook?.gold?.horizon7d;
  const s7 = outlook?.silver?.horizon7d;
  const pred1dGoldPct = g7 ? +(g7.expectedPct / 5).toFixed(3) : 0;
  const pred1dSilverPct = s7 ? +(s7.expectedPct / 5).toFixed(3) : 0;
  const halfCone1dGoldPct = g7
    ? +(((g7.bullPct - g7.bearPct) / 2) / Math.sqrt(5)).toFixed(3)
    : 1.1;
  const halfCone1dSilverPct = s7
    ? +(((s7.bullPct - s7.bearPct) / 2) / Math.sqrt(5)).toFixed(3)
    : 2.1;

  return {
    dayKey,
    recordedAt: new Date().toISOString(),
    regime: detectRegimeFromOutlook(outlook),
    goldClose: +actualGoldClose.toFixed(2),
    silverClose: +actualSilverClose.toFixed(2),
    pred1dGoldPct,
    pred1dSilverPct,
    halfCone1dGoldPct: Math.max(0.5, halfCone1dGoldPct),
    halfCone1dSilverPct: Math.max(0.9, halfCone1dSilverPct),
    drivers,
  };
}

/**
 * Executes one disciplined post-close learning step at 5:10 PM ET.
 * Enforces:
 *  - Strictly once per NY trading day dedup
 *  - US/COMEX holiday & stale-close skip guard
 *  - Multi-horizon (1D/5D/20D) Huber-damped weight update inside the active regime ('calm' | 'stress')
 *  - Champion-Challenger Pinball Loss benchmark with automatic rollback protection
 *  - Jump-Diffusion tail breach calibration (lambdaMult, sigmaJMult)
 */
export function runDailyLearningStep({
  learnedState,
  prevSnapshot = null,
  actualGoldClose,
  actualSilverClose,
  nextOutlook = null,
  regimeOverride = null,
  nowDate = new Date(),
  skipHolidayCheck = false,
}) {
  const baseWeights = getBaselineWeights();
  const state = learnedState
    ? structuredClone(learnedState)
    : createInitialLearnedState();

  // Backfill v2 fields cleanly if upgrading from v1 learned_weights.json
  state.version = 2;
  state.regimeWeights = state.regimeWeights || {
    calm: structuredClone(state.weights || baseWeights),
    stress: structuredClone(state.weights || baseWeights),
  };
  state.snapshotQueue = Array.isArray(state.snapshotQueue) ? state.snapshotQueue : [];
  state.jumpCalibration = state.jumpCalibration || {
    lambdaMult: 1.0,
    sigmaJMult: 1.0,
    observedTailBreachPct: 20,
    targetTailBreachPct: LEARNING_CONFIG.targetTailBreachPct,
  };
  state.championChallenger = state.championChallenger || {
    status: 'warming_up',
    evaluatedDays: 0,
    learnedPinballLoss: null,
    baselinePinballLoss: null,
    edgePct: 0,
    rollbackActive: false,
  };

  const ny = getNewYorkClock(nowDate);
  const todayKey = ny.dayKey;

  // Guard 1: US/COMEX Holiday guard
  if (!skipHolidayCheck && isComexHoliday(todayKey)) {
    return { updated: false, skipped: true, reason: `COMEX holiday (${todayKey}) — skipping calibration`, state };
  }

  // Guard 2: Strictly once per NY trading day
  if (state.lastLearnedDay === todayKey) {
    return { updated: false, reason: `Already learned for ${todayKey}`, state };
  }

  const snap1d = prevSnapshot || state.pendingSnapshot || state.snapshotQueue[0] || null;
  if (!snap1d || !snap1d.goldClose || !snap1d.silverClose) {
    const initSnap = buildPendingSnapshot(nextOutlook, actualGoldClose, actualSilverClose, todayKey);
    state.pendingSnapshot = initSnap;
    state.snapshotQueue = [initSnap];
    state.lastUpdatedAt = new Date(nowDate).toISOString();
    return {
      updated: true,
      graded: false,
      reason: 'Recorded initial post-close baseline snapshot; first grading runs tomorrow at 5:10 PM ET.',
      state,
    };
  }

  // Guard 3: Stale-close detector (e.g. unscheduled exchange closure / frozen feed)
  if (
    Math.abs(actualGoldClose - snap1d.goldClose) < 1e-6 &&
    Math.abs(actualSilverClose - snap1d.silverClose) < 1e-6
  ) {
    return {
      updated: false,
      skipped: true,
      reason: `Stale/unchanged closes detected on ${todayKey}; skipping to avoid zero-move decay.`,
      state,
    };
  }

  // Determine regime ('calm' vs 'stress')
  const regime = regimeOverride || snap1d.regime || detectRegimeFromOutlook(nextOutlook) || 'calm';
  state.activeRegime = regime;
  const activeRegimeW = state.regimeWeights[regime] || structuredClone(baseWeights);

  // Build multi-horizon observations (1D, plus 5D and 20D from snapshotQueue when matured)
  const queue = state.snapshotQueue.length ? state.snapshotQueue : [snap1d];
  const snap5d = queue.length >= 5 ? queue[4] : null;
  const snap20d = queue.length >= 20 ? queue[19] : null;

  const actualGold1dPct = +(((actualGoldClose - snap1d.goldClose) / snap1d.goldClose) * 100).toFixed(3);
  const actualSilver1dPct = +(((actualSilverClose - snap1d.silverClose) / snap1d.silverClose) * 100).toFixed(3);

  const goldObs = [
    {
      horizon: '1D',
      weight: LEARNING_CONFIG.horizonWeights.d1,
      actualPct: actualGold1dPct,
      expectedMovePct: snap1d.halfCone1dGoldPct,
      drivers: (snap1d.drivers || []).map((d) => ({ id: d.id, score: d.gold })),
    },
  ];
  const silverObs = [
    {
      horizon: '1D',
      weight: LEARNING_CONFIG.horizonWeights.d1,
      actualPct: actualSilver1dPct,
      expectedMovePct: snap1d.halfCone1dSilverPct,
      drivers: (snap1d.drivers || []).map((d) => ({ id: d.id, score: d.silver })),
    },
  ];

  const horizonsActive = ['1D'];
  if (snap5d && snap5d.goldClose && snap5d.silverClose) {
    horizonsActive.push('5D');
    goldObs.push({
      horizon: '5D',
      weight: LEARNING_CONFIG.horizonWeights.d5,
      actualPct: ((actualGoldClose - snap5d.goldClose) / snap5d.goldClose) * 100,
      expectedMovePct: snap5d.halfCone1dGoldPct * Math.sqrt(5),
      drivers: (snap5d.drivers || []).map((d) => ({ id: d.id, score: d.gold })),
    });
    silverObs.push({
      horizon: '5D',
      weight: LEARNING_CONFIG.horizonWeights.d5,
      actualPct: ((actualSilverClose - snap5d.silverClose) / snap5d.silverClose) * 100,
      expectedMovePct: snap5d.halfCone1dSilverPct * Math.sqrt(5),
      drivers: (snap5d.drivers || []).map((d) => ({ id: d.id, score: d.silver })),
    });
  }
  if (snap20d && snap20d.goldClose && snap20d.silverClose) {
    horizonsActive.push('20D');
    goldObs.push({
      horizon: '20D',
      weight: LEARNING_CONFIG.horizonWeights.d20,
      actualPct: ((actualGoldClose - snap20d.goldClose) / snap20d.goldClose) * 100,
      expectedMovePct: snap20d.halfCone1dGoldPct * Math.sqrt(20),
      drivers: (snap20d.drivers || []).map((d) => ({ id: d.id, score: d.gold })),
    });
    silverObs.push({
      horizon: '20D',
      weight: LEARNING_CONFIG.horizonWeights.d20,
      actualPct: ((actualSilverClose - snap20d.silverClose) / snap20d.silverClose) * 100,
      expectedMovePct: snap20d.halfCone1dSilverPct * Math.sqrt(20),
      drivers: (snap20d.drivers || []).map((d) => ({ id: d.id, score: d.silver })),
    });
  }

  // Champion (static baseline) vs Challenger (learned weights) Pinball Loss on today's 1D outcome
  const learnedPredG = predictFromWeights(snap1d.drivers, activeRegimeW.gold, 'gold', snap1d.halfCone1dGoldPct);
  const basePredG = predictFromWeights(snap1d.drivers, baseWeights.gold, 'gold', snap1d.halfCone1dGoldPct);
  const learnedPredS = predictFromWeights(snap1d.drivers, activeRegimeW.silver, 'silver', snap1d.halfCone1dSilverPct);
  const basePredS = predictFromWeights(snap1d.drivers, baseWeights.silver, 'silver', snap1d.halfCone1dSilverPct);

  const learnedPinball = +(
    (computePinballLoss(actualGold1dPct, learnedPredG, snap1d.halfCone1dGoldPct) +
      computePinballLoss(actualSilver1dPct, learnedPredS, snap1d.halfCone1dSilverPct)) /
    2
  ).toFixed(4);
  const baselinePinball = +(
    (computePinballLoss(actualGold1dPct, basePredG, snap1d.halfCone1dGoldPct) +
      computePinballLoss(actualSilver1dPct, basePredS, snap1d.halfCone1dSilverPct)) /
    2
  ).toFixed(4);

  const errGoldPct = +(actualGold1dPct - snap1d.pred1dGoldPct).toFixed(3);
  const errSilverPct = +(actualSilver1dPct - snap1d.pred1dSilverPct).toFixed(3);

  const dirHitGold =
    Math.abs(snap1d.pred1dGoldPct) < 0.03
      ? Math.abs(actualGold1dPct) <= snap1d.halfCone1dGoldPct
      : Math.sign(actualGold1dPct) === Math.sign(snap1d.pred1dGoldPct);
  const dirHitSilver =
    Math.abs(snap1d.pred1dSilverPct) < 0.03
      ? Math.abs(actualSilver1dPct) <= snap1d.halfCone1dSilverPct
      : Math.sign(actualSilver1dPct) === Math.sign(snap1d.pred1dSilverPct);

  const inConeGold =
    actualGold1dPct >= snap1d.pred1dGoldPct - snap1d.halfCone1dGoldPct &&
    actualGold1dPct <= snap1d.pred1dGoldPct + snap1d.halfCone1dGoldPct;
  const inConeSilver =
    actualSilver1dPct >= snap1d.pred1dSilverPct - snap1d.halfCone1dSilverPct &&
    actualSilver1dPct <= snap1d.pred1dSilverPct + snap1d.halfCone1dSilverPct;

  // Tail breach outside P10-P90 (~1.28x half-cone) for Jump-Diffusion calibration
  const tailBreachGold = Math.abs(actualGold1dPct - snap1d.pred1dGoldPct) > snap1d.halfCone1dGoldPct * 1.12;
  const tailBreachSilver = Math.abs(actualSilver1dPct - snap1d.pred1dSilverPct) > snap1d.halfCone1dSilverPct * 1.12;

  // 1. Update driver weights for active regime via multi-horizon Huber-clipped Hedge
  let nextGoldW = updateWeightsMultiHorizon({
    currentWeights: activeRegimeW.gold,
    baseWeights: baseWeights.gold,
    horizonObs: goldObs,
  });
  let nextSilverW = updateWeightsMultiHorizon({
    currentWeights: activeRegimeW.silver,
    baseWeights: baseWeights.silver,
    horizonObs: silverObs,
  });

  // 2. Append daily audit entry
  const entry = {
    date: todayKey,
    fromDate: snap1d.dayKey,
    regime,
    horizonsGraded: horizonsActive,
    goldPredPct: snap1d.pred1dGoldPct,
    goldActualPct: actualGold1dPct,
    goldErrPct: errGoldPct,
    dirHitGold,
    inConeGold,
    tailBreachGold,
    silverPredPct: snap1d.pred1dSilverPct,
    silverActualPct: actualSilver1dPct,
    silverErrPct: errSilverPct,
    dirHitSilver,
    inConeSilver,
    tailBreachSilver,
    learnedPinball,
    baselinePinball,
  };
  state.history = [entry, ...(state.history || [])].slice(0, 60);
  state.totalCycles = (state.totalCycles || 0) + 1;
  state.lastLearnedDay = todayKey;
  state.lastUpdatedAt = new Date(nowDate).toISOString();

  // 3. Champion-Challenger Auto-Rollback Check (over rolling 20d)
  const recent = state.history.slice(0, 20);
  const ccRows = recent.filter((h) => Number.isFinite(h.learnedPinball) && Number.isFinite(h.baselinePinball));
  let rollbackActive = false;
  let avgLearnedLoss = null;
  let avgBaseLoss = null;
  let edgePct = 0;

  if (ccRows.length > 0) {
    avgLearnedLoss = +(ccRows.reduce((a, h) => a + h.learnedPinball, 0) / ccRows.length).toFixed(4);
    avgBaseLoss = +(ccRows.reduce((a, h) => a + h.baselinePinball, 0) / ccRows.length).toFixed(4);
    edgePct = avgBaseLoss > 0 ? +(((avgBaseLoss - avgLearnedLoss) / avgBaseLoss) * 100).toFixed(2) : 0;

    if (
      ccRows.length >= LEARNING_CONFIG.rollbackMinDays &&
      avgLearnedLoss > avgBaseLoss * LEARNING_CONFIG.rollbackLossThresholdRatio
    ) {
      // Auto-rollback: blend 50% back toward static baseline weights
      rollbackActive = true;
      nextGoldW = normalizeAndClampWeights(nextGoldW, baseWeights.gold, 0.5);
      nextSilverW = normalizeAndClampWeights(nextSilverW, baseWeights.silver, 0.5);
    }
  }

  state.championChallenger = {
    status: rollbackActive
      ? 'auto_rollback_damped'
      : ccRows.length >= 5
        ? 'challenger_active'
        : 'warming_up',
    evaluatedDays: ccRows.length,
    learnedPinballLoss: avgLearnedLoss,
    baselinePinballLoss: avgBaseLoss,
    edgePct,
    rollbackActive,
  };

  state.regimeWeights[regime] = { gold: nextGoldW, silver: nextSilverW };
  state.weights = { gold: nextGoldW, silver: nextSilverW };

  // Track cumulative weight deltas from baseline for UI transparency
  const deltas = { gold: {}, silver: {} };
  const combinedDeltaList = [];
  for (const [id, meta] of Object.entries(DRIVER_META)) {
    const dg = +((nextGoldW[id] - baseWeights.gold[id]) * 100).toFixed(2);
    const ds = +((nextSilverW[id] - baseWeights.silver[id]) * 100).toFixed(2);
    deltas.gold[id] = dg;
    deltas.silver[id] = ds;
    combinedDeltaList.push({ id, label: meta.shortLabel, avgDeltaPct: +((dg + ds) / 2).toFixed(2) });
  }
  state.weightDeltasFromBase = deltas;

  // 4. Gentle EMA drift bias correction (Huber-clipped)
  state.driftBiasGoldPct = +clamp(
    (state.driftBiasGoldPct || 0) * (1 - LEARNING_CONFIG.driftAlpha) +
      clamp(errGoldPct, -1.5, 1.5) * LEARNING_CONFIG.driftAlpha,
    -LEARNING_CONFIG.maxDriftBiasPct,
    LEARNING_CONFIG.maxDriftBiasPct
  ).toFixed(3);
  state.driftBiasSilverPct = +clamp(
    (state.driftBiasSilverPct || 0) * (1 - LEARNING_CONFIG.driftAlpha) +
      clamp(errSilverPct, -2.5, 2.5) * LEARNING_CONFIG.driftAlpha,
    -LEARNING_CONFIG.maxDriftBiasPct,
    LEARNING_CONFIG.maxDriftBiasPct
  ).toFixed(3);

  // 5. Rolling 20-day summary + adaptive cone width + Jump-Diffusion tail calibration
  const n = recent.length;
  const dirGoldPct = Math.round((recent.filter((h) => h.dirHitGold).length / n) * 100);
  const dirSilverPct = Math.round((recent.filter((h) => h.dirHitSilver).length / n) * 100);
  const inConeHits =
    recent.filter((h) => h.inConeGold).length + recent.filter((h) => h.inConeSilver).length;
  const rollingInConePct = Math.round((inConeHits / (n * 2)) * 100);
  const tailBreaches =
    recent.filter((h) => h.tailBreachGold).length + recent.filter((h) => h.tailBreachSilver).length;
  const observedTailBreachPct = Math.round((tailBreaches / (n * 2)) * 100);

  const avgAbsErrGoldPct = +(recent.reduce((acc, h) => acc + Math.abs(h.goldErrPct), 0) / n).toFixed(2);
  const avgAbsErrSilverPct = +(recent.reduce((acc, h) => acc + Math.abs(h.silverErrPct), 0) / n).toFixed(2);

  if (n >= 3) {
    const gap = (LEARNING_CONFIG.targetInConePct - rollingInConePct) / 100;
    state.coneMultiplier = +clamp(
      (state.coneMultiplier || 1.0) + gap * 0.18,
      LEARNING_CONFIG.minConeMult,
      LEARNING_CONFIG.maxConeMult
    ).toFixed(2);

    // Self-calibrate Jump-Diffusion lambda & sigmaJ toward ~20% tail breach rate
    const tailGap = (observedTailBreachPct - LEARNING_CONFIG.targetTailBreachPct) / 100;
    const prevLam = state.jumpCalibration?.lambdaMult ?? 1.0;
    const prevSig = state.jumpCalibration?.sigmaJMult ?? 1.0;
    state.jumpCalibration = {
      lambdaMult: +clamp(prevLam + tailGap * 0.22, LEARNING_CONFIG.minJumpMult, LEARNING_CONFIG.maxJumpMult).toFixed(2),
      sigmaJMult: +clamp(prevSig + tailGap * 0.14, LEARNING_CONFIG.minJumpMult, LEARNING_CONFIG.maxJumpMult).toFixed(2),
      observedTailBreachPct,
      targetTailBreachPct: LEARNING_CONFIG.targetTailBreachPct,
    };
  }

  combinedDeltaList.sort((a, b) => b.avgDeltaPct - a.avgDeltaPct);
  const topBoosted = combinedDeltaList[0];
  const topTrimmed = combinedDeltaList[combinedDeltaList.length - 1];

  state.summary = {
    rollingDirHitGoldPct: dirGoldPct,
    rollingDirHitSilverPct: dirSilverPct,
    rollingInConePct,
    avgAbsErrGoldPct,
    avgAbsErrSilverPct,
    horizonsActive,
    topBoostedDriver: topBoosted && topBoosted.avgDeltaPct > 0.05 ? topBoosted : null,
    topTrimmedDriver: topTrimmed && topTrimmed.avgDeltaPct < -0.05 ? topTrimmed : null,
  };

  // Push today's snapshot onto snapshotQueue (up to 25 trading days for 1D/5D/20D grading)
  const todaySnap = nextOutlook
    ? buildPendingSnapshot(nextOutlook, actualGoldClose, actualSilverClose, todayKey)
    : {
        ...snap1d,
        dayKey: todayKey,
        recordedAt: new Date(nowDate).toISOString(),
        regime,
        goldClose: +actualGoldClose.toFixed(2),
        silverClose: +actualSilverClose.toFixed(2),
      };
  state.pendingSnapshot = todaySnap;
  state.snapshotQueue = [todaySnap, ...state.snapshotQueue.filter((s) => s.dayKey !== todayKey)].slice(0, 25);

  return { updated: true, graded: true, rollbackActive, entry, state };
}

/** Seeded 6-day multi-horizon post-close self-learning state (stress + calm regimes) */
export function buildSeededLearnedState() {
  let state = createInitialLearnedState();
  const sampleDrivers = [
    { id: 'inflation', gold: 0.44, silver: 0.68 },
    { id: 'geopolitics', gold: 0.32, silver: 0.22 },
    { id: 'rates_usd', gold: 0.28, silver: 0.26 },
    { id: 'equities', gold: -0.22, silver: -0.34 },
    { id: 'mining_supply', gold: 0.30, silver: 0.82 },
    { id: 'central_banks', gold: 0.60, silver: 0.44 },
    { id: 'shanghai_sge', gold: 0.52, silver: 0.54 },
    { id: 'positioning_miners', gold: 0.22, silver: 0.40 },
    { id: 'comex_paper', gold: 0.58, silver: 0.72 },
  ];

  // Seed initial snapshot queue so 5D horizon is already active on day 5+
  state.snapshotQueue = [
    { dayKey: '2026-11-11', regime: 'stress', goldClose: 3642.0, silverClose: 43.45, pred1dGoldPct: 0.32, pred1dSilverPct: 0.52, halfCone1dGoldPct: 1.05, halfCone1dSilverPct: 2.05, drivers: sampleDrivers },
    { dayKey: '2026-11-10', regime: 'calm',   goldClose: 3628.5, silverClose: 43.10, pred1dGoldPct: 0.28, pred1dSilverPct: 0.48, halfCone1dGoldPct: 1.05, halfCone1dSilverPct: 2.05, drivers: sampleDrivers },
    { dayKey: '2026-11-09', regime: 'calm',   goldClose: 3615.0, silverClose: 42.85, pred1dGoldPct: 0.25, pred1dSilverPct: 0.44, halfCone1dGoldPct: 1.05, halfCone1dSilverPct: 2.05, drivers: sampleDrivers },
    { dayKey: '2026-11-06', regime: 'calm',   goldClose: 3601.2, silverClose: 42.55, pred1dGoldPct: 0.22, pred1dSilverPct: 0.40, halfCone1dGoldPct: 1.05, halfCone1dSilverPct: 2.05, drivers: sampleDrivers },
  ];

  const sampleDays = [
    { from: '2026-11-12', to: '2026-11-13', regime: 'calm',   gBase: 3658.0,  gClose: 3679.2,  sBase: 43.90, sClose: 44.32, gPred: 0.35, sPred: 0.55 },
    { from: '2026-11-13', to: '2026-11-16', regime: 'calm',   gBase: 3679.2,  gClose: 3694.5,  sBase: 44.32, sClose: 44.58, gPred: 0.40, sPred: 0.62 },
    { from: '2026-11-16', to: '2026-11-17', regime: 'stress', gBase: 3694.5,  gClose: 3682.1,  sBase: 44.58, sClose: 44.21, gPred: 0.28, sPred: 0.45 },
    { from: '2026-11-17', to: '2026-11-18', regime: 'stress', gBase: 3682.1,  gClose: 3715.75, sBase: 44.21, sClose: 44.68, gPred: 0.42, sPred: 0.68 },
    { from: '2026-11-18', to: '2026-11-19', regime: 'stress', gBase: 3715.75, gClose: 3742.5,  sBase: 44.68, sClose: 45.28, gPred: 0.46, sPred: 0.78 },
  ];

  for (const d of sampleDays) {
    const res = runDailyLearningStep({
      learnedState: state,
      prevSnapshot: {
        dayKey: d.from,
        regime: d.regime,
        goldClose: d.gBase,
        silverClose: d.sBase,
        pred1dGoldPct: d.gPred,
        pred1dSilverPct: d.sPred,
        halfCone1dGoldPct: 1.05,
        halfCone1dSilverPct: 2.05,
        drivers: sampleDrivers,
      },
      actualGoldClose: d.gClose,
      actualSilverClose: d.sClose,
      regimeOverride: d.regime,
      nowDate: new Date(`${d.to}T22:10:00Z`),
    });
    state = res.state;
  }

  state.pendingSnapshot = {
    dayKey: '2026-11-19',
    recordedAt: '2026-11-19T22:10:00.000Z',
    regime: 'stress',
    goldClose: 3742.5,
    silverClose: 45.28,
    pred1dGoldPct: 0.42,
    pred1dSilverPct: 0.72,
    halfCone1dGoldPct: 1.05,
    halfCone1dSilverPct: 2.05,
    drivers: sampleDrivers,
  };
  return state;
}

async function fetchSettledCloses() {
  try {
    const res = await fetch('https://data-asg.goldprice.org/dbXRates/USD', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (res.ok) {
      const parsed = parseGoldPriceOrg(await res.json());
      if (parsed.gold?.price && parsed.silver?.price) {
        return { gold: parsed.gold.price, silver: parsed.silver.price };
      }
    }
  } catch {
    // Fall back to Yahoo Futures settled close
  }
  const fetchLast = async (sym) => {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`,
      { headers: { 'User-Agent': USER_AGENT } }
    );
    if (!res.ok) throw new Error(`Yahoo ${sym} HTTP ${res.status}`);
    const closes = (await res.json())?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    const valid = closes.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (!valid.length) throw new Error(`No closes for ${sym}`);
    return valid[valid.length - 1];
  };
  const [gold, silver] = await Promise.all([fetchLast('GC=F'), fetchLast('SI=F')]);
  return { gold, silver };
}

async function main() {
  const force = process.argv.includes('--force');
  const now = new Date();
  const ny = getNewYorkClock(now);

  if (!force && !isPostCloseLearningWindow(now)) {
    const why = isComexHoliday(ny.dayKey) ? 'US/COMEX market holiday' : 'outside Mon–Fri >= 17:05 ET window';
    console.log(
      `Skipping self-learning (${why}): NY time is ${ny.dayKey} ${String(ny.hour).padStart(2, '0')}:${String(ny.minute).padStart(2, '0')} ET.`
    );
    return;
  }

  const learnedPath = process.env.LEARNED_FILE || path.resolve('data/learned_weights.json');
  const outlookPath = process.env.OUTLOOK_FILE || path.resolve('data/outlook.json');

  let learnedState = createInitialLearnedState();
  try {
    learnedState = JSON.parse(await fs.readFile(learnedPath, 'utf8'));
  } catch {
    // First cycle
  }

  if (!force && learnedState.lastLearnedDay === ny.dayKey) {
    console.log(`Already completed daily post-close learning for ${ny.dayKey}. Exiting cleanly.`);
    return;
  }

  let outlook = null;
  try {
    outlook = JSON.parse(await fs.readFile(outlookPath, 'utf8'));
  } catch {
    // No outlook yet
  }

  const { gold: actualGoldClose, silver: actualSilverClose } = await fetchSettledCloses();
  const result = runDailyLearningStep({
    learnedState,
    actualGoldClose,
    actualSilverClose,
    nextOutlook: outlook,
    nowDate: now,
    skipHolidayCheck: force,
  });

  if (!result.updated) {
    console.log(result.reason);
    return;
  }

  await fs.mkdir(path.dirname(learnedPath), { recursive: true });
  await fs.writeFile(learnedPath, JSON.stringify(result.state, null, 2) + '\n', 'utf8');

  if (result.graded && result.entry) {
    const cc = result.state.championChallenger;
    const jc = result.state.jumpCalibration;
    console.log(
      `Daily 5:10 PM ET Self-Learning (${result.entry.regime} regime, ${result.entry.horizonsGraded.join('+')}) for ${ny.dayKey}: ` +
        `Gold ${result.entry.goldActualPct >= 0 ? '+' : ''}${result.entry.goldActualPct}% (pred ${result.entry.goldPredPct}%), ` +
        `Silver ${result.entry.silverActualPct >= 0 ? '+' : ''}${result.entry.silverActualPct}% (pred ${result.entry.silverPredPct}%), ` +
        `Cone ${result.state.coneMultiplier}x, Jump λ=${jc.lambdaMult}x σJ=${jc.sigmaJMult}x, CC Edge ${cc.edgePct >= 0 ? '+' : ''}${cc.edgePct}%${cc.rollbackActive ? ' [AUTO-ROLLBACK]' : ''}`
    );
  } else {
    console.log(result.reason);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Self-learning failed: ${err.message}`);
    process.exitCode = 1;
  });
}
