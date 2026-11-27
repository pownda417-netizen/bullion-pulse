/**
 * Bullion Pulse — 6 Exclusive Hidden-Alpha Bullion Prediction Engines
 * Zero-dependency ES module, strictly causal (zero look-ahead).
 *
 * Signals no retail bullion app combines into live forecasts:
 *  1. East-vs-West Session Footprint (Asia/London physical accumulation vs. NY paper slams)
 *  2. 21-Currency Stealth Global Breakout Breadth (worldwide currency highs hidden by USD)
 *  3. Bullion Spring Coiling Detector (volatility compression + vault pressure before breakouts)
 *  4. Cross-Asset Liquidity Compass (Gold/Bitcoin debasement, Gold/Oil miner margin, Cu/Pt industrial)
 *  5. Narrative Consensus Crowding & Capitulation Contrarian Brake (anti-FOMO top / panic bottom)
 *  6. COMEX OpEx Round-Strike Gravity & Post-OpEx Snapback ($50 Gold / $1 Silver strike magnets)
 */

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Reference ATH/breakout benchmarks in local currencies (per troy oz) for Stealth Global Breadth
const FX_BREAKOUT_BENCHMARKS = {
  gold: {
    USD: 3750, EUR: 3420, GBP: 2920, JPY: 565000, CNY: 26800, INR: 318000,
    AUD: 5750, CAD: 5180, CHF: 3280, THB: 128000, TRY: 132000, ZAR: 68500,
    MXN: 74500, KRW: 5180000, SGD: 4980, HKD: 29100,
  },
  silver: {
    USD: 46.0, EUR: 42.0, GBP: 35.8, JPY: 6950, CNY: 330, INR: 3920,
    AUD: 70.5, CAD: 63.5, CHF: 40.2, THB: 1580, TRY: 1620, ZAR: 840,
    MXN: 915, KRW: 63500, SGD: 61.0, HKD: 358,
  },
};

function nyHourFromMs(ms) {
  try {
    const h = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        hour12: false,
      }).format(new Date(ms))
    );
    return Number.isFinite(h) ? h % 24 : new Date(ms).getUTCHours();
  } catch {
    return (new Date(ms).getUTCHours() + 19) % 24;
  }
}

/* ---------- 1. East-vs-West Session Footprint ---------- */

export function computeSessionFlowDivergence({ bars = [], metal = 'gold' } = {}) {
  const isSilver = metal === 'silver';
  if (!Array.isArray(bars) || bars.length < 6) {
    return {
      asiaPct: 0,
      londonPct: 0,
      nyPct: 0,
      eastMinusWestPct: 0,
      regime: 'Balanced Sessions',
      signal: 0,
      note: 'Waiting for full 24h intraday bars across Asia, London & NY.',
    };
  }

  let asiaPct = 0;
  let londonPct = 0;
  let nyPct = 0;
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const curr = bars[i];
    if (!(prev?.c > 0) || !(curr?.c > 0) || !curr?.t) continue;
    const retPct = ((curr.c - prev.c) / prev.c) * 100;
    if (Math.abs(retPct) > 8) continue; // ignore stale gaps
    const hr = nyHourFromMs(curr.t);
    if (hr >= 18 || hr < 3) asiaPct += retPct;
    else if (hr >= 3 && hr < 8) londonPct += retPct;
    else nyPct += retPct;
  }

  const eastPct = asiaPct + londonPct;
  const eastMinusWestPct = eastPct - nyPct;
  const scale = isSilver ? 2.6 : 1.35;

  let regime = 'Balanced Global Flow';
  let signal = 0;
  let note = `Asia ${asiaPct >= 0 ? '+' : '−'}${Math.abs(asiaPct).toFixed(2)}% · London ${londonPct >= 0 ? '+' : '−'}${Math.abs(londonPct).toFixed(2)}% · NY ${nyPct >= 0 ? '+' : '−'}${Math.abs(nyPct).toFixed(2)}%`;

  if (eastPct > (isSilver ? 0.25 : 0.12) && nyPct < -(isSilver ? 0.25 : 0.12)) {
    regime = 'East Accumulating / West Paper Dip ↑';
    signal = clamp(eastMinusWestPct / scale, 0.18, 0.82);
    note = `Asia+London physical desks bought (${eastPct >= 0 ? '+' : ''}${eastPct.toFixed(2)}%) while NY paper sold (${nyPct.toFixed(2)}%) — classic snap-back bullish divergence.`;
  } else if (nyPct > (isSilver ? 0.35 : 0.18) && eastPct < -(isSilver ? 0.25 : 0.12)) {
    regime = 'NY Paper Chase / Asia Selling ↓';
    signal = clamp(eastMinusWestPct / scale, -0.70, -0.15);
    note = `NY futures chased higher (+${nyPct.toFixed(2)}%) while Asia/London sold into strength (${eastPct.toFixed(2)}%) — rally prone to fade.`;
  } else if (eastPct > 0.15 && nyPct > 0.15) {
    regime = 'Synchronized Global Buying ↑';
    signal = clamp((eastPct + nyPct) / (scale * 1.4), 0.12, 0.65);
    note = `Asia, London & NY are all bidding higher together — clean global trend confirmation.`;
  } else if (eastPct < -0.15 && nyPct < -0.15) {
    regime = 'Broad Global Distribution ↓';
    signal = clamp((eastPct + nyPct) / (scale * 1.4), -0.65, -0.12);
    note = `Selling pressure across both Eastern physical and Western futures sessions.`;
  } else {
    signal = clamp(eastMinusWestPct / (scale * 2.2), -0.25, 0.25);
  }

  return {
    asiaPct: +asiaPct.toFixed(2),
    londonPct: +londonPct.toFixed(2),
    nyPct: +nyPct.toFixed(2),
    eastMinusWestPct: +eastMinusWestPct.toFixed(2),
    regime,
    signal: +signal.toFixed(3),
    note,
  };
}

/* ---------- 2. 21-Currency Stealth Global Breakout Breadth ---------- */

export function computeCurrencyBreakoutBreadth({
  spotGold,
  spotSilver,
  fxRates = null,
  metal = 'gold',
} = {}) {
  const isSilver = metal === 'silver';
  const spot = isSilver ? spotSilver : spotGold;
  const benches = FX_BREAKOUT_BENCHMARKS[metal];
  const defaultRates = {
    USD: 1, EUR: 0.92, GBP: 0.785, JPY: 151.5, CNY: 7.22, INR: 84.4,
    AUD: 1.53, CAD: 1.39, CHF: 0.88, THB: 34.4, TRY: 34.5, ZAR: 18.1,
    MXN: 20.1, KRW: 1390, SGD: 1.34, HKD: 7.78,
  };
  const rates = fxRates && typeof fxRates === 'object' ? { ...defaultRates, ...fxRates } : defaultRates;

  if (!(spot > 0)) {
    return { nearHighCount: 0, totalCurrencies: 16, breadthPct: 50, usdPctOfHigh: 95, stealthBull: false, regime: 'Neutral Breadth', signal: 0 };
  }

  let nearHighCount = 0;
  let total = 0;
  let usdRatio = 0.95;

  for (const [ccy, bench] of Object.entries(benches)) {
    const r = Number(rates[ccy]);
    if (!(r > 0) || !(bench > 0)) continue;
    const localPrice = spot * r;
    const ratio = localPrice / bench;
    if (ccy === 'USD') usdRatio = ratio;
    if (ratio >= 0.96) nearHighCount++;
    total++;
  }

  const breadthPct = total > 0 ? Math.round((nearHighCount / total) * 100) : 50;
  const usdPctOfHigh = +(usdRatio * 100).toFixed(1);
  const stealthBull = breadthPct >= 62 && usdRatio < 0.985;

  let regime = 'Balanced FX Breadth';
  let signal = 0;
  if (stealthBull) {
    regime = 'Stealth Global Breakout ↑';
    signal = clamp(0.28 + ((breadthPct - 60) / 40) * 0.48, 0.25, 0.75);
  } else if (breadthPct >= 75) {
    regime = 'Universal Global Highs ↑';
    signal = clamp(0.32 + ((breadthPct - 75) / 25) * 0.35, 0.30, 0.68);
  } else if (breadthPct <= 20) {
    regime = 'Broad FX Pullback ↓';
    signal = -0.25;
  } else {
    signal = clamp(((breadthPct - 45) / 55) * 0.25, -0.18, 0.22);
  }

  return {
    nearHighCount,
    totalCurrencies: total,
    breadthPct,
    usdPctOfHigh,
    stealthBull,
    regime,
    signal: +signal.toFixed(3),
  };
}

/* ---------- 3. Bullion Spring Coiling Detector ---------- */

export function computeSpringCoilingIndex({
  closes = [],
  comexRatio = null,
  isBackwardation = false,
  metal = 'gold',
} = {}) {
  const isSilver = metal === 'silver';
  if (!Array.isArray(closes) || closes.length < 22) {
    return {
      coilingScore: 42,
      volRatio: 1.0,
      breakoutEnergyMult: 1.0,
      regime: 'Normal Energy',
      note: 'Volatility sits near its 30-day average.',
    };
  }

  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  const rms = (arr) => (arr.length ? Math.sqrt(arr.reduce((s, r) => s + r * r, 0) / arr.length) : 0.01);
  const shortVol = rms(rets.slice(-5));
  const baseVol = Math.max(0.003, rms(rets.slice(-30)));
  const volRatio = +(shortVol / baseVol).toFixed(2);

  // Tighter shortVol relative to baseVol = tighter compressed spring!
  const compressionPts = clamp((1.15 - volRatio) / 0.65, 0, 1) * 68;
  const vaultFuel =
    (isBackwardation ? 18 : 0) +
    (Number.isFinite(comexRatio) ? clamp((comexRatio - (isSilver ? 4.5 : 2.5)) * 4.5, 0, 16) : 0);
  const coilingScore = Math.round(clamp(compressionPts + vaultFuel, 5, 98));

  let regime = 'Normal Range Energy';
  let breakoutEnergyMult = 1.0;
  let note = `Short-term swings are ${volRatio.toFixed(2)}× normal — balanced energy.`;
  if (coilingScore >= 72) {
    regime = 'Coiled Spring · Breakout Imminent ⚡';
    breakoutEnergyMult = 1.28;
    note = `Volatility compressed to ${volRatio.toFixed(2)}× baseline while physical tension builds — sharp directional breakout typically follows.`;
  } else if (coilingScore >= 54) {
    regime = 'Tightening Coil · Watch Breakout';
    breakoutEnergyMult = 1.12;
    note = `Price range is narrowing (${volRatio.toFixed(2)}× baseline) — energy storing up for next leg.`;
  } else if (volRatio >= 1.45) {
    regime = 'Expanded / Post-Breakout';
    breakoutEnergyMult = 0.88;
    note = `Volatility already expanded (${volRatio.toFixed(2)}× baseline) — expect digestion/consolidation.`;
  }

  return {
    coilingScore,
    volRatio,
    breakoutEnergyMult,
    regime,
    note,
  };
}

/* ---------- 4. Cross-Asset Liquidity Compass (Gold/BTC, Gold/Oil, Cu/Pt) ---------- */

export function computeCrossAssetLiquidityCompass({
  macroSnapshot = null,
  series = null,
  metal = 'gold',
} = {}) {
  const isSilver = metal === 'silver';
  const pctLook = (arr, k = 10) => {
    if (!Array.isArray(arr) || arr.length <= k) return null;
    const a = arr[arr.length - 1 - k];
    const b = arr[arr.length - 1];
    return a > 0 ? ((b - a) / a) * 100 : null;
  };

  const gold10d = pctLook(series?.gold, 10);
  const btc10d = pctLook(series?.btc, 10);
  const spx10d = pctLook(series?.spx, 10) ?? (macroSnapshot?.spx5dPct != null ? macroSnapshot.spx5dPct * 1.4 : null);
  const oilPrice = macroSnapshot?.oil ?? (series?.oil?.length ? series.oil[series.oil.length - 1] : null);
  const goldPrice = series?.gold?.length ? series.gold[series.gold.length - 1] : 3600;
  const cu5d = macroSnapshot?.cu5dPct ?? pctLook(series?.copper, 5) ?? 0;
  const pt5d = macroSnapshot?.platinum5dPct ?? pctLook(series?.platinum, 5) ?? 0;

  // Gold/Oil ratio: > 42 means cheap miner energy costs -> bullish miner profit expansion
  const goldOilRatio = oilPrice > 10 && goldPrice > 500 ? +(goldPrice / oilPrice).toFixed(1) : null;
  const minerMarginSig = goldOilRatio != null ? clamp((goldOilRatio - 38) / 22, -0.35, 0.55) : 0;

  // Industrial confirmation (Copper + Platinum moving with Silver)
  const indConfirmSig = clamp((cu5d * 0.6 + pt5d * 0.4) / 5.5, -0.65, 0.65);

  // Fiat Debasement (Gold + BTC rising together) vs Systemic Flight-to-Safety (Gold up, SPX/BTC down)
  let regime = 'Balanced Cross-Asset Flow';
  let liquiditySig = 0;
  if (gold10d != null && btc10d != null) {
    if (gold10d > 0.6 && btc10d > 2.0) {
      regime = 'Global Fiat Debasement Wave ↑';
      liquiditySig = 0.48;
    } else if (gold10d > 0.6 && btc10d < -2.0 && (spx10d ?? 0) < -0.5) {
      regime = 'Pure Safe-Haven Flight ↑';
      liquiditySig = isSilver ? 0.16 : 0.45;
    } else if (gold10d < -1.0 && btc10d < -3.0) {
      regime = 'Broad Liquidity Tightening ↓';
      liquiditySig = -0.38;
    }
  } else if (goldOilRatio != null && goldOilRatio >= 46) {
    regime = 'Strong Miner Margin Tailwind ↑';
    liquiditySig = 0.24;
  }

  const signal = isSilver
    ? clamp(liquiditySig * 0.45 + indConfirmSig * 0.40 + minerMarginSig * 0.15, -0.75, 0.75)
    : clamp(liquiditySig * 0.55 + minerMarginSig * 0.30 + indConfirmSig * 0.15, -0.75, 0.75);

  return {
    regime,
    goldOilRatio,
    cu5d: +Number(cu5d || 0).toFixed(2),
    pt5d: +Number(pt5d || 0).toFixed(2),
    signal: +signal.toFixed(3),
    note: goldOilRatio != null
      ? `Gold/Oil ${goldOilRatio}:1 (miner energy margin) · Copper ${cu5d >= 0 ? '+' : ''}${Number(cu5d).toFixed(1)}% · Platinum ${pt5d >= 0 ? '+' : ''}${Number(pt5d).toFixed(1)}%`
      : `Copper ${cu5d >= 0 ? '+' : ''}${Number(cu5d).toFixed(1)}% · Platinum ${pt5d >= 0 ? '+' : ''}${Number(pt5d).toFixed(1)}%`,
  };
}

/* ---------- 5. Narrative Consensus Crowding & Capitulation Contrarian Brake ---------- */

export function computeContrarianCrowdingBrake({
  headlines = [],
  rsi14 = 50,
  cotPercentile52w = 50,
} = {}) {
  const scored = (headlines || []).filter((h) => h?.sentiment === 'bullish' || h?.sentiment === 'bearish');
  const bullN = scored.filter((h) => h.sentiment === 'bullish').length;
  const bearN = scored.filter((h) => h.sentiment === 'bearish').length;
  const newsBullPct = scored.length >= 3 ? (bullN / scored.length) * 100 : 50;

  const rsi = Number.isFinite(Number(rsi14)) ? Number(rsi14) : 50;
  const cot = Number.isFinite(Number(cotPercentile52w)) ? Number(cotPercentile52w) : 50;

  // 0 = max bearish capitulation, 50 = healthy balanced, 100 = max crowded euphoria
  const crowdingScore = Math.round(clamp(newsBullPct * 0.34 + rsi * 0.38 + cot * 0.28, 4, 96));

  let regime = 'Healthy Positioning';
  let contrarianNudge = 0;
  let note = `Crowd score ${crowdingScore}/100 — room for trend continuation without extreme crowding.`;

  if (crowdingScore >= 78 && rsi >= 68) {
    regime = 'Crowded Euphoria · Pullback Risk ↓';
    contrarianNudge = -clamp(((crowdingScore - 74) / 22) * 0.14, 0.04, 0.14);
    note = `Extreme one-sided bullishness (${crowdingScore}/100, RSI ${rsi.toFixed(0)}) — anti-FOMO contrarian brake warns of shakeout risk.`;
  } else if (crowdingScore <= 24 && rsi <= 34) {
    regime = 'Panic Capitulation · Reversal Zone ↑';
    contrarianNudge = clamp(((28 - crowdingScore) / 22) * 0.14, 0.04, 0.14);
    note = `Washout bearish panic (${crowdingScore}/100, RSI ${rsi.toFixed(0)}) — smart-money contrarian bounce lift active.`;
  }

  return {
    crowdingScore,
    newsBullPct: Math.round(newsBullPct),
    bullHeadlines: bullN,
    bearHeadlines: bearN,
    regime,
    contrarianNudge: +contrarianNudge.toFixed(4),
    note,
  };
}

/* ---------- 6. COMEX OpEx Round-Strike Gravity & Post-OpEx Snapback ---------- */

function nthBusinessDayFromEndUtc(year, monthIndex, nBack) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  let seen = 0;
  while (seen < nBack) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
      seen++;
      if (seen === nBack) break;
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

export function computeOpexDeliveryMagnet({
  spot,
  metal = 'gold',
  nowDate = new Date(),
  trendSign = 0,
} = {}) {
  const isSilver = metal === 'silver';
  const safeSpot = Number.isFinite(Number(spot)) && Number(spot) > 0 ? Number(spot) : (isSilver ? 42.5 : 3600);
  const strikeStep = isSilver ? 1.0 : 50.0;
  const magnetStrike = Math.round(safeSpot / strikeStep) * strikeStep;
  const distPct = ((magnetStrike - safeSpot) / safeSpot) * 100;

  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayMs = 86400000;
  const activePreMonths = new Set([0, 2, 4, 6, 8, 10]); // months whose 4th-to-last biz day is active GC/SI OpEx

  let nearestDeltaDays = 999;
  for (let off = -1; off <= 2; off++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + off, 1));
    if (!activePreMonths.has(dt.getUTCMonth())) continue;
    const opex = nthBusinessDayFromEndUtc(dt.getUTCFullYear(), dt.getUTCMonth(), 4);
    const diffDays = Math.round((opex.getTime() - todayUtc) / dayMs);
    if (Math.abs(diffDays) < Math.abs(nearestDeltaDays)) {
      nearestDeltaDays = diffDays;
    }
  }

  let phase = 'Open Trend Window';
  let pinStrength = 0;
  let signal = 0;
  let note = `Nearest major round strike: $${magnetStrike.toLocaleString('en-US')} (${nearestDeltaDays > 0 ? `${nearestDeltaDays}d to OpEx` : `${Math.abs(nearestDeltaDays)}d post-OpEx`}).`;

  if (nearestDeltaDays >= 0 && nearestDeltaDays <= 3) {
    phase = nearestDeltaDays === 0 ? 'OpEx Pin Day (Magnet Active)' : `Pre-OpEx Strike Pin (${nearestDeltaDays}d)`;
    pinStrength = nearestDeltaDays === 0 ? 0.55 : 0.35;
    // Pull gently toward nearest $50 / $1 strike pin
    signal = clamp((distPct / (isSilver ? 2.4 : 1.4)) * 0.25, -0.22, 0.22);
    note = `Options expiration in ${nearestDeltaDays}d — dealers typically pin spot near the $${magnetStrike.toLocaleString('en-US')} round strike before releasing.`;
  } else if (nearestDeltaDays < 0 && nearestDeltaDays >= -5) {
    phase = `Post-OpEx Release (+${Math.abs(nearestDeltaDays)}d) ⚡`;
    pinStrength = 0;
    signal = clamp((trendSign >= 0 ? 1 : -1) * 0.22, -0.25, 0.25);
    note = `Options hedges just rolled off ${Math.abs(nearestDeltaDays)}d ago — suppressed directional trend often accelerates cleanly now.`;
  }

  return {
    magnetStrike: +magnetStrike.toFixed(2),
    distToMagnetPct: +distPct.toFixed(2),
    daysToOpex: nearestDeltaDays,
    phase,
    pinStrength,
    signal: +signal.toFixed(3),
    note,
  };
}

/* ---------- Master Orchestrator ---------- */

export function computeHiddenAlphaSuite({
  spotGold,
  spotSilver,
  goldIntradayBars = [],
  silverIntradayBars = [],
  goldDailyCloses = [],
  silverDailyCloses = [],
  fxRates = null,
  comex = null,
  basis = null,
  macroSnapshot = null,
  series = null,
  headlines = [],
  goldRsi14 = 50,
  silverRsi14 = 50,
  cotGoldPct = 50,
  cotSilverPct = 50,
  goldTrendSign = 0,
  silverTrendSign = 0,
  nowDate = new Date(),
} = {}) {
  const buildFor = (metal, spot, intraBars, dailyCloses, rsi14, cotPct, trendSign) => {
    const sessionFlow = computeSessionFlowDivergence({ bars: intraBars, metal });
    const currencyBreadth = computeCurrencyBreakoutBreadth({ spotGold, spotSilver, fxRates, metal });
    const springCoiling = computeSpringCoilingIndex({
      closes: dailyCloses,
      comexRatio: comex?.[metal]?.paperToRegisteredRatio ?? null,
      isBackwardation: Boolean(basis?.[metal]?.isBackwardation || (basis?.[metal]?.basisUsd ?? 1) < 0),
      metal,
    });
    const liquidityCompass = computeCrossAssetLiquidityCompass({ macroSnapshot, series, metal });
    const crowdingBrake = computeContrarianCrowdingBrake({ headlines, rsi14, cotPercentile52w: cotPct });
    const opexMagnet = computeOpexDeliveryMagnet({ spot, metal, nowDate, trendSign });

    // Clean, conservative composite net edge (-0.15..+0.15) fed into forecasts
    const rawEdge =
      sessionFlow.signal * 0.26 +
      currencyBreadth.signal * 0.24 +
      liquidityCompass.signal * 0.24 +
      opexMagnet.signal * 0.14;
    const netBoost = clamp(
      rawEdge * 0.18 * springCoiling.breakoutEnergyMult + crowdingBrake.contrarianNudge,
      -0.14,
      0.15
    );

    return {
      metal,
      sessionFlow,
      currencyBreadth,
      springCoiling,
      liquidityCompass,
      crowdingBrake,
      opexMagnet,
      netBoost: +netBoost.toFixed(4),
      netPts: Math.round(netBoost * 100),
    };
  };

  const gold = buildFor('gold', spotGold, goldIntradayBars, goldDailyCloses, goldRsi14, cotGoldPct, goldTrendSign);
  const silver = buildFor('silver', spotSilver, silverIntradayBars, silverDailyCloses, silverRsi14, cotSilverPct, silverTrendSign);

  const standoutNotes = [];
  if (gold.sessionFlow.regime.includes('East Accumulating') || silver.sessionFlow.regime.includes('East Accumulating')) {
    standoutNotes.push('East Physical Buying / West Paper Dip divergence');
  }
  if (gold.currencyBreadth.stealthBull || silver.currencyBreadth.stealthBull) {
    standoutNotes.push(`Stealth Global Currency Breakout (${Math.max(gold.currencyBreadth.breadthPct, silver.currencyBreadth.breadthPct)}% of world FX near highs)`);
  }
  if (gold.springCoiling.coilingScore >= 72 || silver.springCoiling.coilingScore >= 72) {
    standoutNotes.push('Coiled Spring volatility compression');
  }
  if (gold.crowdingBrake.contrarianNudge !== 0) {
    standoutNotes.push(gold.crowdingBrake.regime);
  }
  if (gold.opexMagnet.pinStrength > 0 || gold.opexMagnet.phase.includes('Post-OpEx')) {
    standoutNotes.push(gold.opexMagnet.phase);
  }

  return {
    gold,
    silver,
    summaryLine: standoutNotes.length
      ? standoutNotes.slice(0, 2).join(' · ')
      : '6 exclusive market-edge detectors active and synced into forecasts',
  };
}
