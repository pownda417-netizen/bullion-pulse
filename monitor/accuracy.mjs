/**
 * Bullion Pulse — Live Walk-Forward Accuracy Scorecard & Causal 1D/7D/30D Backtester
 * Tracks every 7-day & 30-day prediction in data/accuracy_log.json, automatically grades
 * mature predictions against realized spot prices, computes distribution-free Conformal
 * error quantiles, and benchmarks 1D, 7D, and 30D causal walk-forward accuracy.
 */

import { computeHurstExponent } from './precision_forecast.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const idx = clamp(q * (sorted.length - 1), 0, sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
}

function gradeOneHorizon(entry, horizonKey, actualSpot, nowIso) {
  const h = entry[horizonKey];
  if (!h || !entry.spotAtForecast) return null;
  const actualPct = ((actualSpot - entry.spotAtForecast) / entry.spotAtForecast) * 100;
  const predictedDir = h.expectedPct >= 0 ? 1 : -1;
  const actualDir = actualPct >= 0 ? 1 : -1;
  const flatTol = horizonKey === 'horizon30d' ? 2.0 : 1.1;
  const directionCorrect =
    Math.abs(h.expectedPct) < 0.08
      ? Math.abs(actualPct) < flatTol
      : predictedDir === actualDir;
  const insideCone = actualSpot >= h.bear && actualSpot <= h.bull;
  const signedErrorPct = actualPct - h.expectedPct;
  const absErrorPct = Math.abs(signedErrorPct);

  return {
    actualSpot: +actualSpot.toFixed(2),
    actualPct: +actualPct.toFixed(2),
    directionCorrect,
    insideCone,
    signedErrorPct: +signedErrorPct.toFixed(2),
    absErrorPct: +absErrorPct.toFixed(2),
    gradedAt: nowIso,
  };
}

/**
 * Updates an accuracy log by:
 * 1. Grading any past predictions whose 7d or 30d window has matured
 * 2. Logging today's new forecast snapshot (max 1 snapshot per UTC day per metal)
 * 3. Computing live hit-rate, conformal error radius, pending maturity countdowns, and cone calibration
 */
export function updateAccuracyLog({
  log = { predictions: [] },
  outlook,
  spotGold,
  spotSilver,
  now = new Date(),
}) {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const todayKey = nowIso.slice(0, 10);
  const predictions = Array.isArray(log?.predictions)
    ? log.predictions.map((p) => ({ ...p }))
    : [];

  // 1. Grade matured entries
  for (const p of predictions) {
    const ageMs = nowMs - new Date(p.createdAt).getTime();
    const currentSpot = p.metal === 'gold' ? spotGold : spotSilver;
    if (!currentSpot || !Number.isFinite(ageMs)) continue;

    if (!p.graded7d && ageMs >= 7 * DAY_MS) {
      p.graded7d = gradeOneHorizon(p, 'horizon7d', currentSpot, nowIso);
    }
    if (!p.graded30d && ageMs >= 30 * DAY_MS) {
      p.graded30d = gradeOneHorizon(p, 'horizon30d', currentSpot, nowIso);
    }
  }

  // 2. Append today's snapshot once per day per metal
  if (outlook?.gold && outlook?.silver) {
    for (const metal of ['gold', 'silver']) {
      const alreadyToday = predictions.some(
        (p) => p.metal === metal && String(p.createdAt).slice(0, 10) === todayKey
      );
      if (alreadyToday) continue;
      const m = outlook[metal];
      predictions.push({
        id: `${todayKey}-${metal}`,
        createdAt: nowIso,
        metal,
        spotAtForecast: +(metal === 'gold' ? spotGold : spotSilver).toFixed(2),
        score: m.score,
        signal: m.signal,
        horizon7d: m.horizon7d,
        horizon30d: m.horizon30d,
        graded7d: null,
        graded30d: null,
      });
    }
  }

  const trimmed = predictions.slice(-180);
  const scorecard = summarizeAccuracy(trimmed, now);

  return {
    updatedAt: nowIso,
    scorecard,
    predictions: trimmed,
  };
}

export function summarizeAccuracy(predictions = [], now = new Date()) {
  const nowMs = now.getTime();
  const graded7 = predictions.filter((p) => p.graded7d);
  const graded30 = predictions.filter((p) => p.graded30d);

  const stats = (list, key) => {
    if (!list.length) {
      return {
        count: 0,
        dirHitPct: null,
        inConePct: null,
        avgErrPct: null,
        rmsePct: null,
        conformalRadiusPct: null,
        signedBiasPct: null,
      };
    }
    const dirHits = list.filter((p) => p[key].directionCorrect).length;
    const coneHits = list.filter((p) => p[key].insideCone).length;
    const absErrs = list.map((p) => Number(p[key].absErrorPct) || 0).sort((a, b) => a - b);
    const errSum = absErrs.reduce((s, v) => s + v, 0);
    const sqErrSum = absErrs.reduce((s, v) => s + v * v, 0);
    const biasSum = list.reduce(
      (s, p) => s + (Number(p[key].signedErrorPct) || (p[key].actualPct - (p[key === 'graded30d' ? 'horizon30d' : 'horizon7d']?.expectedPct || 0))),
      0
    );
    const q75 = quantile(absErrs, 0.75);
    return {
      count: list.length,
      dirHitPct: Math.round((dirHits / list.length) * 100),
      inConePct: Math.round((coneHits / list.length) * 100),
      avgErrPct: +(errSum / list.length).toFixed(2),
      rmsePct: +Math.sqrt(sqErrSum / list.length).toFixed(2),
      conformalRadiusPct: q75 != null ? +q75.toFixed(2) : null,
      signedBiasPct: +(biasSum / list.length).toFixed(2),
    };
  };

  const s7 = stats(graded7, 'graded7d');
  const s30 = stats(graded30, 'graded30d');

  // Pending snapshot maturity countdowns so users see exact days until next live check grades
  const pending7 = predictions.filter((p) => !p.graded7d && p.createdAt);
  const pending30 = predictions.filter((p) => !p.graded30d && p.createdAt);
  const minDaysLeft = (list, windowDays) => {
    if (!list.length) return null;
    let best = Infinity;
    for (const p of list) {
      const ageDays = (nowMs - new Date(p.createdAt).getTime()) / DAY_MS;
      if (Number.isFinite(ageDays)) {
        const left = Math.max(0, Math.ceil(windowDays - ageDays));
        if (left < best) best = left;
      }
    }
    return Number.isFinite(best) ? best : null;
  };

  let coneMultiplier = 1.0;
  if (s7.count >= 6 && s7.inConePct != null) {
    if (s7.inConePct < 60) coneMultiplier = 1.22;
    else if (s7.inConePct < 70) coneMultiplier = 1.1;
    else if (s7.inConePct > 92) coneMultiplier = 0.92;
  }

  return {
    live7d: s7,
    live30d: s30,
    coneMultiplier,
    pendingStatus: {
      pending7dCount: pending7.length,
      pending30dCount: pending30.length,
      next7dInDays: minDaysLeft(pending7, 7),
      next30dInDays: minDaysLeft(pending30, 30),
    },
    recentGrades: [...graded7]
      .slice(-6)
      .reverse()
      .map((p) => ({
        date: p.createdAt.slice(0, 10),
        metal: p.metal,
        signal: p.signal,
        predictedPct: p.horizon7d.expectedPct,
        actualPct: p.graded7d.actualPct,
        absErrorPct: p.graded7d.absErrorPct,
        directionCorrect: p.graded7d.directionCorrect,
        insideCone: p.graded7d.insideCone,
      })),
    recentGrades30d: [...graded30]
      .slice(-6)
      .reverse()
      .map((p) => ({
        date: p.createdAt.slice(0, 10),
        metal: p.metal,
        signal: p.signal,
        predictedPct: p.horizon30d?.expectedPct ?? 0,
        actualPct: p.graded30d.actualPct,
        absErrorPct: p.graded30d.absErrorPct,
        directionCorrect: p.graded30d.directionCorrect,
        insideCone: p.graded30d.insideCone,
      })),
  };
}

function rsiAt(closes, endIdx, period = 14) {
  if (endIdx < period + 1) return 50;
  let g = 0;
  let l = 0;
  for (let k = endIdx - period + 1; k <= endIdx; k++) {
    const diff = closes[k] - closes[k - 1];
    if (diff >= 0) g += diff;
    else l += Math.abs(diff);
  }
  if (l === 0) return g === 0 ? 50 : 90;
  return 100 - 100 / (1 + g / l);
}

function emaAt(closes, endIdx, period) {
  const start = Math.max(0, endIdx - period * 2);
  const k = 2 / (period + 1);
  let ema = closes[start];
  for (let i = start + 1; i <= endIdx; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Strictly Causal Walk-Forward Backtester across 1-Day, 7-Day (5 trading days), and
 * 30-Day (21 trading days) horizons using Hurst regime detection, multi-EMA + Kaufman ER,
 * RSI exhaustion braking, macro/miners/ratio drivers, asymmetric semi-vol, and
 * distribution-free Conformal 75% error calibration. Zero look-ahead bias!
 */
export function runWalkForwardBacktest({
  gold = [],
  silver = [],
  dxy = [],
  tnx = [],
  gdx = [],
  sil = [],
  copper = [],
  gvz = [],
}) {
  const intervalLoss = (actual, low, mid, high) => {
    const pb = (y, q, tau) => (y >= q ? tau * (y - q) : (tau - 1) * (y - q));
    return pb(actual, low, 0.16) + pb(actual, mid, 0.5) + pb(actual, high, 0.84);
  };

  const backtestMetalHorizon = (closes, miners, peerMetal, isSilver, horizonDays, stepStride) => {
    const n = closes.length;
    const minStart = horizonDays >= 20 ? 28 : 20;
    if (n < minStart + horizonDays + 4) return null;

    let total = 0;
    let dirHits = 0;
    let coneHits = 0;
    let errSum = 0;
    let sqErrSum = 0;
    let modelLossSum = 0;
    let rwLossSum = 0;
    const absErrs = [];
    const checkpoints = [];

    const is30d = horizonDays >= 20;
    const is1d = horizonDays <= 1;

    for (let i = minStart; i < n - horizonDays; i += stepStride) {
      const spot = closes[i];
      const ema5 = emaAt(closes, i, 5);
      const ema13 = emaAt(closes, i, 13);
      const ema26 = emaAt(closes, i, 26);

      // Causal Kaufman Efficiency Ratio
      let pathLen = 0;
      for (let k = Math.max(1, i - 11); k <= i; k++) {
        pathLen += Math.abs(closes[k] - closes[k - 1]);
      }
      const netMove = Math.abs(closes[i] - closes[Math.max(0, i - 12)]);
      const er = pathLen > 1e-9 ? clamp(netMove / pathLen, 0, 1) : 0.35;

      // Causal Hurst Exponent on trailing 32 bars
      const hurstInfo = computeHurstExponent(closes.slice(Math.max(0, i - 32), i + 1));
      const hurstTrendScale = clamp(1 + (hurstInfo.hurst - 0.50) * 1.35, 0.55, 1.45);
      const hurstRevScale = clamp(1 - (hurstInfo.hurst - 0.50) * 1.35, 0.55, 1.45);

      let trend =
        clamp(((ema5 - ema13) / Math.max(spot, 1e-6)) * 22 + ((ema13 - ema26) / Math.max(spot, 1e-6)) * 16, -1, 1) *
        (0.4 + 0.6 * er) *
        hurstTrendScale;

      const rsi = rsiAt(closes, i, 14);
      if (rsi <= 26 && trend < 0) trend = trend * 0.45 + 0.22 * hurstRevScale;
      else if (rsi >= 74 && trend > 0) trend = trend * 0.45 - 0.22 * hurstRevScale;

      let macro = 0;
      if (dxy.length === n && i >= 5 && dxy[i - 5] > 0) {
        const dxy5d = ((dxy[i] - dxy[i - 5]) / dxy[i - 5]) * 100;
        const dxy20d = i >= 20 && dxy[i - 20] > 0 ? ((dxy[i] - dxy[i - 20]) / dxy[i - 20]) * 100 : dxy5d;
        const w20 = is30d ? 0.62 : 0.42;
        const dxyBlend = clamp(-dxy5d / 2.2, -1, 1) * (1 - w20) + clamp(-dxy20d / 4.5, -1, 1) * w20;
        macro += dxyBlend * 0.65;
      }
      if (tnx.length === n && i >= 5 && tnx[i - 5] > 0) {
        const tnxLook = is30d && i >= 20 && tnx[i - 20] > 0 ? 20 : 5;
        const tnxRet = ((tnx[i] - tnx[i - tnxLook]) / tnx[i - tnxLook]) * 100;
        macro += clamp(-tnxRet / (is30d ? 9.0 : 6.0), -1, 1) * 0.35;
      }

      // Miners lead-lag divergence (GDX/GC, SIL/SI)
      let minerSig = 0;
      if (miners.length === n && i >= 10 && miners[i - 10] > 0 && closes[i - 10] > 0) {
        const mRet = ((miners[i] - miners[i - 10]) / miners[i - 10]) * 100;
        const sRet = ((closes[i] - closes[i - 10]) / closes[i - 10]) * 100;
        minerSig = clamp((mRet - sRet) / 9, -0.7, 0.7);
      }

      let extra = 0;
      if (isSilver) {
        if (copper.length === n && i >= 5 && copper[i - 5] > 0) {
          const cu5d = ((copper[i] - copper[i - 5]) / copper[i - 5]) * 100;
          extra += clamp(cu5d / 4.0, -0.8, 0.8) * 0.55;
        }
        if (peerMetal.length === n && peerMetal[i] > 0 && spot > 0) {
          const ratio = peerMetal[i] / spot;
          extra += clamp((ratio - 80) / 18, -0.7, 0.7) * 0.45;
        }
      }

      // Horizon-adaptive weighting: Technical/Hurst leads on 1D; Macro/Miners lead on 30D
      const unit = is30d
        ? isSilver
          ? clamp(trend * 0.22 + macro * 0.38 + minerSig * 0.20 + extra * 0.20, -1, 1)
          : clamp(trend * 0.25 + macro * 0.50 + minerSig * 0.25, -1, 1)
        : is1d
          ? isSilver
            ? clamp(trend * 0.50 + macro * 0.22 + minerSig * 0.14 + extra * 0.14, -1, 1)
            : clamp(trend * 0.54 + macro * 0.28 + minerSig * 0.18, -1, 1)
          : isSilver
            ? clamp(trend * 0.34 + macro * 0.28 + minerSig * 0.18 + extra * 0.20, -1, 1)
            : clamp(trend * 0.40 + macro * 0.38 + minerSig * 0.22, -1, 1);

      // EWMA trailing realized volatility + Asymmetric Up/Down semi-vol
      let ewmaVar = 0;
      let prevRet = 0;
      let upSq = 0;
      let upC = 0;
      let dnSq = 0;
      let dnC = 0;
      for (let k = Math.max(1, i - 25); k <= i; k++) {
        if (closes[k - 1] > 0) {
          const r = (closes[k] - closes[k - 1]) / closes[k - 1];
          ewmaVar = ewmaVar === 0 ? r * r : 0.90 * ewmaVar + 0.10 * r * r;
          prevRet = r;
          if (r >= 0) { upSq += r * r; upC++; }
          else { dnSq += r * r; dnC++; }
        }
      }
      let vol = clamp(Math.sqrt(ewmaVar || prevRet * prevRet || 0.0001), 0.006, 0.042);
      if (!isSilver && gvz.length === n && gvz[i] > 5) {
        const gvzDaily = (gvz[i] / 100) / Math.sqrt(252);
        vol = clamp(vol * 0.65 + gvzDaily * 0.35, 0.006, 0.042);
      }
      const upVol = upC >= 3 ? clamp(Math.sqrt(upSq / upC), vol * 0.72, vol * 1.35) : vol;
      const dnVol = dnC >= 3 ? clamp(Math.sqrt(dnSq / dnC), vol * 0.72, vol * 1.35) : vol;

      const sigH = vol * Math.sqrt(horizonDays);
      const driftCoeff = is30d ? 0.66 : is1d ? 0.54 : 0.68;
      const expPct = unit * sigH * driftCoeff * 100;
      const upHalfPct = 1.12 * upVol * Math.sqrt(horizonDays) * 100;
      const dnHalfPct = 1.12 * dnVol * Math.sqrt(horizonDays) * 100;
      const bearPct = expPct - dnHalfPct;
      const bullPct = expPct + upHalfPct;
      const bear = spot * (1 + bearPct / 100);
      const bull = spot * (1 + bullPct / 100);
      const futureSpot = closes[i + horizonDays];
      const actualPct = ((futureSpot - spot) / spot) * 100;
      const absErr = Math.abs(actualPct - expPct);

      const dirHit =
        Math.abs(actualPct) < 0.05 ||
        (expPct >= 0 && actualPct >= 0) ||
        (expPct < 0 && actualPct < 0);
      const inCone = futureSpot >= bear && futureSpot <= bull;

      total++;
      if (dirHit) dirHits++;
      if (inCone) coneHits++;
      errSum += absErr;
      sqErrSum += absErr * absErr;
      absErrs.push(absErr);
      modelLossSum += intervalLoss(actualPct, bearPct, expPct, bullPct);
      rwLossSum += intervalLoss(actualPct, -dnHalfPct, 0, upHalfPct);

      checkpoints.push({
        barIdx: i,
        predPct: +expPct.toFixed(2),
        actualPct: +actualPct.toFixed(2),
        absErrPct: +absErr.toFixed(2),
        dirHit,
        inCone,
      });
    }

    if (!total) return null;
    absErrs.sort((a, b) => a - b);
    const q75 = quantile(absErrs, 0.75);
    const pinballSkillPct =
      rwLossSum > 0 ? +(((1 - modelLossSum / rwLossSum) * 100)).toFixed(1) : 0;

    return {
      samples: total,
      horizonDays,
      dirHitPct: Math.round((dirHits / total) * 100),
      inConePct: Math.round((coneHits / total) * 100),
      avgErrPct: +(errSum / total).toFixed(2),
      rmsePct: +Math.sqrt(sqErrSum / total).toFixed(2),
      conformalRadiusPct: q75 != null ? +q75.toFixed(2) : null,
      pinballSkillPct,
      recentCheckpoints: checkpoints.slice(-12),
    };
  };

  const gold7d = backtestMetalHorizon(gold, gdx, silver, false, 5, 2);
  const silver7d = backtestMetalHorizon(silver, sil, gold, true, 5, 2);
  const gold30d = backtestMetalHorizon(gold, gdx, silver, false, 21, 3);
  const silver30d = backtestMetalHorizon(silver, sil, gold, true, 21, 3);
  const gold1d = backtestMetalHorizon(gold, gdx, silver, false, 1, 2);
  const silver1d = backtestMetalHorizon(silver, sil, gold, true, 1, 2);

  return {
    // Keep legacy top-level gold & silver keys (7D) for 100% backward compatibility
    gold: gold7d,
    silver: silver7d,
    gold1d,
    silver1d,
    gold30d,
    silver30d,
  };
}
