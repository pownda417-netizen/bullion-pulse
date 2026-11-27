/**
 * Bullion Pulse — AI Data Center & Big Tech Infrastructure Race Engine (v52)
 * Zero-dependency ES module, strictly causal (no look-ahead).
 *
 * Models how hyperscale AI buildouts (Google, NVIDIA, Microsoft, Meta, Amazon,
 * TSMC, Broadcom) and high-power electrical infrastructure (Vertiv, Eaton,
 * Constellation Energy & grid upgrades) impact physical Silver & Gold demand:
 *
 *  - SILVER (High Structural + Live Sensitivity):
 *      * Highest electrical & thermal conductivity (~7% better thermal transfer than copper)
 *      * Non-thriftable in 50–500MW+ zero-downtime data center switchgear, busbars,
 *        circuit breakers, relays, UPS, server motherboards & grid substations (~20–42 Moz/yr)
 *      * Global DC IT power projected +165% (2025 ~50 GW -> 2030 ~132 GW)
 *      * Compounds a 6-year structural silver deficit + 70–80% byproduct mining inelasticity
 *      * Industrial fabricators compete for the same refined metal pool as bars & coins
 *
 *  - GOLD (Measured Supporting Industrial Layer):
 *      * Corrosion-resistant wire bonding, edge connectors, memory modules & high-speed pins
 *      * Engineers actively thrift per-chip usage, and monetary / central-bank flows remain
 *        Gold's primary driver (~36% relative AI sensitivity vs. Silver)
 */

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export const AI_COMPUTE_META = [
  { key: 'nvda', ticker: 'NVDA', name: 'NVIDIA', role: 'AI GPUs & Interconnects' },
  { key: 'googl', ticker: 'GOOGL', name: 'Google', role: 'TPU Hyperscale & Power' },
  { key: 'msft', ticker: 'MSFT', name: 'Microsoft', role: 'Azure AI Campuses' },
  { key: 'meta', ticker: 'META', name: 'Meta', role: 'AI Training Clusters' },
  { key: 'amzn', ticker: 'AMZN', name: 'Amazon', role: 'AWS Cloud Buildout' },
  { key: 'tsm', ticker: 'TSM', name: 'TSMC', role: 'Wafer & Wire Bonding' },
  { key: 'avgo', ticker: 'AVGO', name: 'Broadcom', role: 'AI Silicon & Networking' },
];

export const AI_POWER_META = [
  { key: 'vrt', ticker: 'VRT', name: 'Vertiv', role: 'Switchgear, Busbars & UPS' },
  { key: 'etn', ticker: 'ETN', name: 'Eaton', role: 'Breakers, Relays & Grid' },
  { key: 'ceg', ticker: 'CEG', name: 'Constellation', role: '24/7 Hyperscale Power' },
];

const BULL_AI_CAPEX_PATTERNS = [
  /\b(nvidia|google|alphabet|microsoft|meta|amazon|aws|openai|xai|oracle|tsmc|broadcom|vertiv|eaton|stargate|hyperscaler)\b.*\b(data center|ai infrastructure|ai capex|capex|gigawatt|megawatt|power deal|nuclear|substation|switchgear|busbar|grid upgrade|server|blackwell|rubin|tpu|billion|expand|buildout|surge|boom|record)/i,
  /\b(ai data center|hyperscale data center|ai power demand|data center power|power grid upgrade|switchgear|busbar|wire bonding)\b.*\b(surge|boom|jump|soar|expand|gw|gigawatt|record|shortage|silver|gold|demand|strain|tight)/i,
  /\b(silver|gold)\b.*\b(ai data center|ai server|ai chip|switchgear|busbar|semiconductor|wire bonding|hyperscale)/i,
];

const BEAR_AI_CAPEX_PATTERNS = [
  /\b(nvidia|google|alphabet|microsoft|meta|amazon|aws|openai|hyperscaler|data center|ai infrastructure)\b.*\b(capex cut|cut spending|cancel|delay|pause|slowdown|pullback|bubble burst|halt|slump|oversupply|excess capacity)/i,
  /\b(ai data center|ai capex|ai chip|server demand)\b.*\b(cool|slow|drop|fall|shrink|cut|cancel|delay|bubble)/i,
];

function pctChange(arr, lookback) {
  if (!Array.isArray(arr) || arr.length <= lookback) return null;
  const a = Number(arr[arr.length - 1 - lookback]);
  const b = Number(arr[arr.length - 1]);
  if (!(a > 0) || !(b > 0)) return null;
  return ((b - a) / a) * 100;
}

function summarizeBasket(metaList, series = {}, fallbackSnapshot = null) {
  const members = [];
  let sum5d = 0;
  let sum20d = 0;
  let cnt5d = 0;
  let cnt20d = 0;
  let up5d = 0;

  for (const m of metaList) {
    const arr = series?.[m.key];
    let p5 = pctChange(arr, 5);
    let p20 = pctChange(arr, 20);
    let price = Array.isArray(arr) && arr.length ? Number(arr[arr.length - 1]) : null;

    if (p5 == null && fallbackSnapshot?.[m.key]) {
      const fb = fallbackSnapshot[m.key];
      if (Number.isFinite(Number(fb.pct5d))) p5 = Number(fb.pct5d);
      if (Number.isFinite(Number(fb.pct20d))) p20 = Number(fb.pct20d);
      if (Number.isFinite(Number(fb.price))) price = Number(fb.price);
    }

    if (p5 != null) {
      sum5d += p5;
      cnt5d++;
      if (p5 > 0) up5d++;
    }
    if (p20 != null) {
      sum20d += p20;
      cnt20d++;
    }
    members.push({
      key: m.key,
      ticker: m.ticker,
      name: m.name,
      role: m.role,
      price: price != null && Number.isFinite(price) ? +price.toFixed(2) : null,
      pct5d: p5 != null ? +p5.toFixed(2) : null,
      pct20d: p20 != null ? +p20.toFixed(2) : null,
    });
  }

  return {
    members,
    avg5dPct: cnt5d > 0 ? +(sum5d / cnt5d).toFixed(2) : 0,
    avg20dPct: cnt20d > 0 ? +(sum20d / cnt20d).toFixed(2) : 0,
    risingCount: up5d,
    trackedCount: cnt5d,
    totalCount: metaList.length,
    live: cnt5d > 0,
  };
}

export function scoreAiDatacenterHeadlines(headlines = []) {
  let bullHits = 0;
  let bearHits = 0;
  const matchedTitles = [];

  for (const h of headlines || []) {
    const text = `${h?.title || ''} ${h?.summary || ''}`.trim();
    if (!text) continue;
    const isBear = BEAR_AI_CAPEX_PATTERNS.some((rx) => rx.test(text));
    const isBull = BULL_AI_CAPEX_PATTERNS.some((rx) => rx.test(text));
    if (isBull && !isBear) {
      bullHits++;
      if (matchedTitles.length < 3 && h?.title) matchedTitles.push(h.title);
    } else if (isBear) {
      bearHits++;
      if (matchedTitles.length < 3 && h?.title) matchedTitles.push(h.title);
    }
  }

  const net = bullHits - bearHits;
  return {
    bullHits,
    bearHits,
    net,
    newsScore: +clamp(net * 0.28, -0.85, 0.90).toFixed(3),
    matchedTitles,
  };
}

export function computeAiDatacenterSignal({
  series = null,
  fallbackTickers = null,
  headlines = [],
  copper5dPct = null,
  comex = null,
  basis = null,
  physicalPremiums = null,
  scenarioMode = null, // 'surge' | 'pause' | null
} = {}) {
  const computeBasket = summarizeBasket(AI_COMPUTE_META, series, fallbackTickers);
  const powerBasket = summarizeBasket(AI_POWER_META, series, fallbackTickers);
  const news = scoreAiDatacenterHeadlines(headlines);

  const cu5 =
    Number.isFinite(Number(copper5dPct))
      ? Number(copper5dPct)
      : (pctChange(series?.copper, 5) ?? 0);

  // Combine short (5d) + structural trend (20d) for both Compute (Big Tech) & Power/Grid Hardware
  const computeMom = computeBasket.live
    ? clamp((computeBasket.avg5dPct * 0.55 + computeBasket.avg20dPct * 0.28) / 7.5, -1, 1)
    : 0.12;
  const powerMom = powerBasket.live
    ? clamp((powerBasket.avg5dPct * 0.52 + powerBasket.avg20dPct * 0.30 + cu5 * 0.18) / 8.0, -1, 1)
    : clamp(0.14 + cu5 / 18, -0.6, 0.8);

  const scenarioShift =
    scenarioMode === 'surge' ? 24 : scenarioMode === 'pause' ? -28 : 0;

  // Structural baseline = 56 (multi-year +165% 2025->2030 DC IT power ramp & 6-yr silver deficit)
  const rawIndex =
    56 +
    computeMom * 18 +
    powerMom * 20 +
    news.newsScore * 16 +
    scenarioShift;
  const raceIndex = Math.round(clamp(rawIndex, 6, 98));

  // Supply-constraint amplifier for Silver: 70–80% byproduct mining inelasticity + physical pool competition
  const agComexRatio = Number(comex?.silver?.paperToRegisteredRatio);
  const agBackw = Boolean(basis?.silver?.isBackwardation || (basis?.silver?.basisUsd ?? 1) < 0);
  const agPremHot = physicalPremiums?.silver?.tone === 'bullish';
  const supplyTightMult = clamp(
    1.0 +
      (agBackw ? 0.14 : 0) +
      (agPremHot ? 0.10 : 0) +
      (Number.isFinite(agComexRatio) && agComexRatio > 5.0 ? clamp((agComexRatio - 5.0) * 0.03, 0, 0.12) : 0),
    1.0,
    1.32
  );

  // Silver: strong non-thriftable industrial + electrical/thermal conductivity driver
  const silverRaw = ((raceIndex - 45) / 48) * supplyTightMult;
  const silverSignal = +clamp(silverRaw, -0.65, 0.92).toFixed(3);
  const silverBoost = +clamp(silverSignal * 0.115, -0.055, 0.105).toFixed(4);

  // Gold: realistic supporting electronics layer (wire bonding, corrosion-proof pins/connectors,
  // moderated by engineering thrifting; monetary & central banks stay primary)
  const goldSignal = +clamp(silverSignal * 0.36, -0.28, 0.38).toFixed(3);
  const goldBoost = +clamp(goldSignal * 0.105, -0.022, 0.042).toFixed(4);

  // Estimated annualized AI DC + grid silver run-rate within documented 20–42 Moz/yr band
  const estSilverMozYr = Math.round(clamp(20 + ((raceIndex - 20) / 78) * 24, 18, 46));

  let status = 'Steady AI Expansion';
  let tone = 'neutral';
  if (raceIndex >= 74) {
    status = 'Hyperscale Surge ↑';
    tone = 'bullish';
  } else if (raceIndex >= 58) {
    status = 'Active AI Buildout ↑';
    tone = 'bullish';
  } else if (raceIndex <= 34) {
    status = 'CapEx Slowdown ↓';
    tone = 'bearish';
  }

  let summary = `AI data center race index at ${raceIndex}/100 (${status.replace(/[↑↓]/g, '').trim()}). `;
  if (tone === 'bullish') {
    summary += `Hyperscale buildouts (Google, NVIDIA, Microsoft, Meta, Amazon) and power-room switchgear/busbars add non-thriftable physical silver demand (~${estSilverMozYr} Moz/yr run-rate) onto a 6-year structural deficit with 70–80% byproduct supply inelasticity, plus steady gold wire-bonding support.`;
  } else if (tone === 'bearish') {
    summary += `Big Tech AI CapEx stocks and power-grid hardware cooled recently — easing near-term industrial momentum, though long-term 2025–2030 power growth (+165%) remains intact.`;
  } else {
    summary += `Steady hyperscale server & power-grid expansion underpins ~${estSilverMozYr} Moz/yr of non-thriftable silver hardware draw and supporting gold connector demand.`;
  }

  return {
    raceIndex,
    status,
    tone,
    estSilverMozYr,
    dcPowerGrowth2030Pct: 165,
    byproductSilverSharePct: '70–80%',
    deficitYears: 6,
    supplyTightMult: +supplyTightMult.toFixed(2),
    computeBasket,
    powerBasket,
    news,
    silver: {
      signal: silverSignal,
      predictionBoost: silverBoost,
      pts: Math.round(silverBoost * 100),
      role: 'Primary AI Metal (Switchgear, Busbars, Relays, Grid & Thermal — Non-Thriftable)',
    },
    gold: {
      signal: goldSignal,
      predictionBoost: goldBoost,
      pts: Math.round(goldBoost * 100),
      role: 'Supporting Tech Metal (Corrosion-Proof Wire Bonding, Edge Connectors & Memory Pins)',
    },
    summary,
  };
}
