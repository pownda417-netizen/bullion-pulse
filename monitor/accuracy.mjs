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

/**
 * Walk-forward 5-trading-day (7-calendar-day) historical backtest over the fetched 6-month series
 * using strictly past information at each step (no look-ahead bias!).
 */
export function runWalkForwardBacktest({ gold = [], silver = [], dxy = [], gdx = [], sil = [] }) {
  const backtestMetal = (closes, miners, dxySeries) => {
    const n = closes.length;
    if (n < 30) return null;
    let total = 0;
    let dirHits = 0;
    let coneHits = 0;
    let errSum = 0;

    for (let i = 20; i < n - 5; i += 2) {
      const spot = closes[i];
      const sma10 = closes.slice(i - 10, i).reduce((a, b) => a + b, 0) / 10;
      const sma20 = closes.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
      const trend = clamp(((spot - sma10) / sma10) * 14 + ((sma10 - sma20) / sma20) * 10, -1, 1);

      let macro = 0;
      if (dxySeries.length === n && i >= 5 && dxySeries[i - 5] > 0) {
        const dxy5d = ((dxySeries[i] - dxySeries[i - 5]) / dxySeries[i - 5]) * 100;
        macro = clamp(-dxy5d / 2.2, -1, 1);
      }

      let minerSig = 0;
      if (miners.length === n && i >= 10 && miners[i - 10] > 0 && closes[i - 10] > 0) {
        const mRet = ((miners[i] - miners[i - 10]) / miners[i - 10]) * 100;
        const sRet = ((closes[i] - closes[i - 10]) / closes[i - 10]) * 100;
        minerSig = clamp((mRet - sRet) / 9, -0.7, 0.7);
      }

      const unit = clamp(trend * 0.45 + macro * 0.35 + minerSig * 0.2, -1, 1);

      // Realized trailing 20d volatility
      const rets = [];
      for (let k = i - 19; k <= i; k++) {
        if (closes[k - 1] > 0) rets.push((closes[k] - closes[k - 1]) / closes[k - 1]);
      }
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const vol = clamp(
        Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1)),
        0.006,
        0.04
      );

      const sig5 = vol * Math.sqrt(5);
      const expPct = unit * sig5 * 0.72 * 100;
      const bear = spot * (1 + (expPct / 100 - 1.15 * sig5));
      const bull = spot * (1 + (expPct / 100 + 1.15 * sig5));
      const futureSpot = closes[i + 5];
      const actualPct = ((futureSpot - spot) / spot) * 100;

      total++;
      if ((expPct >= 0 && actualPct >= 0) || (expPct < 0 && actualPct < 0)) dirHits++;
      if (futureSpot >= bear && futureSpot <= bull) coneHits++;
      errSum += Math.abs(actualPct - expPct);
    }

    if (!total) return null;
    return {
      samples: total,
      dirHitPct: Math.round((dirHits / total) * 100),
      inConePct: Math.round((coneHits / total) * 100),
      avgErrPct: +(errSum / total).toFixed(2),
    };
  };

  return {
    gold: backtestMetal(gold, gdx, dxy),
    silver: backtestMetal(silver, sil, dxy),
  };
}
