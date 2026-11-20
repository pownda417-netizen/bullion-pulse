/**
 * Bullion Pulse — Live Walk-Forward Accuracy Scorecard & Historical Backtester
 * Tracks every 7-day & 30-day prediction in data/accuracy_log.json, automatically grades
 * mature predictions against realized spot prices, and computes an adaptive cone multiplier.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function gradeOneHorizon(entry, horizonKey, actualSpot, nowIso) {
  const h = entry[horizonKey];
  if (!h || !entry.spotAtForecast) return null;
  const actualPct = ((actualSpot - entry.spotAtForecast) / entry.spotAtForecast) * 100;
  const predictedDir = h.expectedPct >= 0 ? 1 : -1;
  const actualDir = actualPct >= 0 ? 1 : -1;
  const directionCorrect = Math.abs(h.expectedPct) < 0.1 ? Math.abs(actualPct) < 1.2 : predictedDir === actualDir;
  const insideCone = actualSpot >= h.bear && actualSpot <= h.bull;
  const absErrorPct = Math.abs(actualPct - h.expectedPct);

  return {
    actualSpot: +actualSpot.toFixed(2),
    actualPct: +actualPct.toFixed(2),
    directionCorrect,
    insideCone,
    absErrorPct: +absErrorPct.toFixed(2),
    gradedAt: nowIso,
  };
}

/**
 * Updates an accuracy log by:
 * 1. Grading any past predictions whose 7d or 30d window has matured
 * 2. Logging today's new forecast snapshot (max 1 snapshot per UTC day per metal)
 * 3. Computing live hit-rate, cone calibration, and adaptive cone multiplier
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
  const scorecard = summarizeAccuracy(trimmed);

  return {
    updatedAt: nowIso,
    scorecard,
    predictions: trimmed,
  };
}

export function summarizeAccuracy(predictions = []) {
  const graded7 = predictions.filter((p) => p.graded7d);
  const graded30 = predictions.filter((p) => p.graded30d);

  const stats = (list, key) => {
    if (!list.length) return { count: 0, dirHitPct: null, inConePct: null, avgErrPct: null };
    const dirHits = list.filter((p) => p[key].directionCorrect).length;
    const coneHits = list.filter((p) => p[key].insideCone).length;
    const errSum = list.reduce((s, p) => s + p[key].absErrorPct, 0);
    return {
      count: list.length,
      dirHitPct: Math.round((dirHits / list.length) * 100),
      inConePct: Math.round((coneHits / list.length) * 100),
      avgErrPct: +(errSum / list.length).toFixed(2),
    };
  };

  const s7 = stats(graded7, 'graded7d');
  const s30 = stats(graded30, 'graded30d');

  // Adaptive cone calibration: if live 7d cone coverage < 65% over >= 6 grades, widen future cones slightly
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
    recentGrades: [...graded7]
      .slice(-4)
      .reverse()
      .map((p) => ({
        date: p.createdAt.slice(0, 10),
        metal: p.metal,
        signal: p.signal,
        predictedPct: p.horizon7d.expectedPct,
        actualPct: p.graded7d.actualPct,
        directionCorrect: p.graded7d.directionCorrect,
        insideCone: p.graded7d.insideCone,
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

/**
 * Walk-forward 5-trading-day (7-calendar-day) historical backtest over the fetched 6-month series
 * using strictly past information at each step (no look-ahead bias!), benchmarking Pinball Loss
 * skill against a Random Walk null model.
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

  const backtestMetal = (closes, miners, peerMetal, isSilver) => {
    const n = closes.length;
    if (n < 30) return null;
    let total = 0;
    let dirHits = 0;
    let coneHits = 0;
    let errSum = 0;
    let modelLossSum = 0;
    let rwLossSum = 0;

    for (let i = 20; i < n - 5; i += 2) {
      const spot = closes[i];
      const sma10 = closes.slice(i - 10, i).reduce((a, b) => a + b, 0) / 10;
      const sma20 = closes.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
      let trend = clamp(((spot - sma10) / sma10) * 14 + ((sma10 - sma20) / sma20) * 10, -1, 1);

      const rsi = rsiAt(closes, i, 14);
      if (rsi <= 22 && trend < 0) trend = trend * 0.45 + 0.14;
      else if (rsi >= 78 && trend > 0) trend = trend * 0.45 - 0.14;

      let macro = 0;
      if (dxy.length === n && i >= 5 && dxy[i - 5] > 0) {
        const dxy5d = ((dxy[i] - dxy[i - 5]) / dxy[i - 5]) * 100;
        macro += clamp(-dxy5d / 2.2, -1, 1) * 0.65;
      }
      if (tnx.length === n && i >= 5 && tnx[i - 5] > 0) {
        const tnx5d = ((tnx[i] - tnx[i - 5]) / tnx[i - 5]) * 100;
        macro += clamp(-tnx5d / 6.0, -1, 1) * 0.35;
      }

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

      const unit = isSilver
        ? clamp(trend * 0.34 + macro * 0.28 + minerSig * 0.18 + extra * 0.20, -1, 1)
        : clamp(trend * 0.40 + macro * 0.38 + minerSig * 0.22, -1, 1);

      // EWMA trailing realized volatility
      let ewmaVar = 0;
      let prevRet = 0;
      for (let k = Math.max(1, i - 25); k <= i; k++) {
        if (closes[k - 1] > 0) {
          const r = (closes[k] - closes[k - 1]) / closes[k - 1];
          ewmaVar = ewmaVar === 0 ? r * r : 0.90 * ewmaVar + 0.10 * r * r;
          prevRet = r;
        }
      }
      let vol = clamp(Math.sqrt(ewmaVar || prevRet * prevRet || 0.0001), 0.006, 0.042);
      if (!isSilver && gvz.length === n && gvz[i] > 5) {
        const gvzDaily = (gvz[i] / 100) / Math.sqrt(252);
        vol = clamp(vol * 0.65 + gvzDaily * 0.35, 0.006, 0.042);
      }

      const sig5 = vol * Math.sqrt(5);
      const expPct = unit * sig5 * 0.72 * 100;
      const halfBandPct = 1.15 * sig5 * 100;
      const bearPct = expPct - halfBandPct;
      const bullPct = expPct + halfBandPct;
      const bear = spot * (1 + bearPct / 100);
      const bull = spot * (1 + bullPct / 100);
      const futureSpot = closes[i + 5];
      const actualPct = ((futureSpot - spot) / spot) * 100;

      total++;
      if ((expPct >= 0 && actualPct >= 0) || (expPct < 0 && actualPct < 0)) dirHits++;
      if (futureSpot >= bear && futureSpot <= bull) coneHits++;
      errSum += Math.abs(actualPct - expPct);
      modelLossSum += intervalLoss(actualPct, bearPct, expPct, bullPct);
      rwLossSum += intervalLoss(actualPct, -halfBandPct, 0, halfBandPct);
    }

    if (!total) return null;
    const pinballSkillPct =
      rwLossSum > 0 ? +(((1 - modelLossSum / rwLossSum) * 100)).toFixed(1) : 0;
    return {
      samples: total,
      dirHitPct: Math.round((dirHits / total) * 100),
      inConePct: Math.round((coneHits / total) * 100),
      avgErrPct: +(errSum / total).toFixed(2),
      pinballSkillPct,
    };
  };

  return {
    gold: backtestMetal(gold, gdx, silver, false),
    silver: backtestMetal(silver, sil, gold, true),
  };
}
