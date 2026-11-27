/**
 * Bullion Pulse — Global US & China AI Data Center, SpaceX & EV Metal Race Engine (v56)
 * Zero-dependency ES module, strictly causal (no look-ahead).
 *
 * Models how the global AI, Space, and EV electrification race drives physical Silver & Gold demand:
 *
 *  1. US Frontier AI, Autonomous EVs & Space Compute:
 *      * Public tickers: NVDA, GOOGL, MSFT, META, AMZN, TSLA (Dojo/Megapack/EVs), TSM, AVGO
 *      * Private labs tracked via live news: OpenAI (Stargate), Anthropic (Claude/Rainier), SpaceX / Starlink, xAI
 *  2. China AI Hyperscalers, Chips & Silver-Heavy EV Giants:
 *      * Public tickers: BABA (Alibaba Qwen/Cloud), 0700.HK (Tencent Hunyuan), BIDU (Baidu Ernie),
 *        0981.HK (SMIC Foundry), 1211.HK (BYD #1 EVs/Solid-State), 1810.HK (Xiaomi EV/AI),
 *        LI (Li Auto), XPEV (XPeng)
 *      * Private/A-share giants tracked via live news: DeepSeek, Huawei (Ascend), CATL (EV & solid-state batteries), ByteDance, NIO
 *  3. Data Center Power Room, Switchgear & Grid Builders:
 *      * Public tickers: VRT (Vertiv), ETN (Eaton), CEG (Constellation Energy) + Copper (HG=F)
 *
 * Physical Metal Economics:
 *  - SILVER (Primary Industrial Beneficiary):
 *      * Non-thriftable in 50–500MW+ data center switchgear, busbars, circuit breakers, relays & grid (~20–42 Moz/yr)
 *      * Heavy EV & charging draw (BYD, Tesla, Xiaomi, XPeng, Li Auto: ~25–50g Ag per EV + Megapack inverters + solid-state Ag-C batteries)
 *      * SpaceX/Starlink orbital solar arrays & aerospace electronics
 *      * Compounds a 6-year structural silver deficit + 70–80% byproduct mining inelasticity
 *  - GOLD (Measured Supporting Industrial Layer):
 *      * Corrosion-proof wire bonding, edge connectors, memory modules, EV ADAS sensors & satellite contacts
 *      * Realistic ~36% relative AI/EV sensitivity vs. Silver (monetary & central-bank flows stay Gold's primary driver)
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
  { key: 'tsla', ticker: 'TSLA', name: 'Tesla', role: 'EVs, Dojo AI & Megapacks' },
  { key: 'tsm', ticker: 'TSM', name: 'TSMC', role: 'Wafer & Wire Bonding' },
  { key: 'avgo', ticker: 'AVGO', name: 'Broadcom', role: 'AI Silicon & Networking' },
];

export const CHINA_AI_EV_META = [
  { key: 'baba', ticker: 'BABA', name: 'Alibaba', role: 'Qwen AI & Cloud CapEx' },
  { key: 'tencent', ticker: '0700.HK', name: 'Tencent', role: 'Hunyuan AI & Clusters' },
  { key: 'bidu', ticker: 'BIDU', name: 'Baidu', role: 'Ernie AI & Robotaxis' },
  { key: 'smic', ticker: '0981.HK', name: 'SMIC', role: 'China Chip Foundry' },
  { key: 'byd', ticker: '1211.HK', name: 'BYD', role: '#1 EVs & Solid-State Batteries' },
  { key: 'xiaomi', ticker: '1810.HK', name: 'Xiaomi', role: 'SU7 EVs & AI Hardware' },
  { key: 'li', ticker: 'LI', name: 'Li Auto', role: 'High-Voltage EVs' },
  { key: 'xpev', ticker: 'XPEV', name: 'XPeng', role: 'AI Smart EVs & Robotics' },
];

export const AI_POWER_META = [
  { key: 'vrt', ticker: 'VRT', name: 'Vertiv', role: 'Switchgear, Busbars & UPS' },
  { key: 'etn', ticker: 'ETN', name: 'Eaton', role: 'Breakers, Relays & Grid' },
  { key: 'ceg', ticker: 'CEG', name: 'Constellation', role: '24/7 Hyperscale Power' },
];

export const PRIVATE_AI_SPACE_LABS = [
  { id: 'openai', name: 'OpenAI', rx: /\b(openai|stargate)\b/i },
  { id: 'anthropic', name: 'Anthropic', rx: /\b(anthropic|claude)\b/i },
  { id: 'spacex', name: 'SpaceX', rx: /\b(spacex|starlink|starship)\b/i },
  { id: 'deepseek', name: 'DeepSeek', rx: /\b(deepseek)\b/i },
  { id: 'huawei', name: 'Huawei AI', rx: /\b(huawei|ascend)\b/i },
  { id: 'catl', name: 'CATL', rx: /\b(catl)\b/i },
];

const BULL_AI_CAPEX_PATTERNS = [
  /\b(nvidia|google|alphabet|microsoft|meta|amazon|aws|openai|anthropic|claude|spacex|starlink|tesla|megapack|xai|oracle|tsmc|broadcom|vertiv|eaton|stargate|hyperscaler)\b.*\b(data center|ai infrastructure|ai capex|capex|gigawatt|megawatt|power deal|nuclear|substation|switchgear|busbar|grid upgrade|server|blackwell|rubin|tpu|satellite|launch|dojo|cortex|billion|expand|buildout|surge|boom|record|deliveries)/i,
  /\b(alibaba|qwen|tencent|hunyuan|baidu|ernie|deepseek|huawei|ascend|bytedance|smic|byd|catl|xiaomi|xpeng|li auto|nio|geely)\b.*\b(ai data center|ai capex|ai chip|cloud|semiconductor|ev|electric vehicle|solid[- ]?state|battery|charging|megawatt|gigawatt|deliveries|sales surge|record|expand|billion|boom|factory)/i,
  /\b(ai data center|hyperscale data center|ai power demand|data center power|power grid upgrade|switchgear|busbar|wire bonding|solid[- ]?state battery)\b.*\b(surge|boom|jump|soar|expand|gw|gigawatt|record|shortage|silver|gold|demand|strain|tight)/i,
  /\b(silver|gold)\b.*\b(ai data center|ai server|ai chip|switchgear|busbar|semiconductor|wire bonding|hyperscale|byd|tesla|starlink|ev demand)/i,
];

const BEAR_AI_CAPEX_PATTERNS = [
  /\b(nvidia|google|alphabet|microsoft|meta|amazon|aws|openai|anthropic|tesla|spacex|alibaba|tencent|baidu|byd|catl|xiaomi|xpeng|li auto|nio|hyperscaler|data center|ai infrastructure)\b.*\b(capex cut|cut spending|cancel|delay|pause|slowdown|pullback|bubble burst|halt|slump|oversupply|excess capacity|sales drop|ev slump)/i,
  /\b(ai data center|ai capex|ai chip|server demand|ev sales)\b.*\b(cool|slow|drop|fall|shrink|cut|cancel|delay|bubble|slump)/i,
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
  const labMentions = {};
  for (const lab of PRIVATE_AI_SPACE_LABS) labMentions[lab.id] = 0;

  for (const h of headlines || []) {
    const text = `${h?.title || ''} ${h?.summary || ''}`.trim();
    if (!text) continue;
    for (const lab of PRIVATE_AI_SPACE_LABS) {
      if (lab.rx.test(text)) labMentions[lab.id]++;
    }
    const isBear = BEAR_AI_CAPEX_PATTERNS.some((rx) => rx.test(text));
    const isBull = BULL_AI_CAPEX_PATTERNS.some((rx) => rx.test(text));
    if (isBull && !isBear) {
      bullHits++;
      if (matchedTitles.length < 4 && h?.title) matchedTitles.push(h.title);
    } else if (isBear) {
      bearHits++;
      if (matchedTitles.length < 4 && h?.title) matchedTitles.push(h.title);
    }
  }

  const net = bullHits - bearHits;
  return {
    bullHits,
    bearHits,
    net,
    newsScore: +clamp(net * 0.25, -0.85, 0.90).toFixed(3),
    labMentions,
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
  const chinaAiEvBasket = summarizeBasket(CHINA_AI_EV_META, series, fallbackTickers);
  const powerBasket = summarizeBasket(AI_POWER_META, series, fallbackTickers);
  const news = scoreAiDatacenterHeadlines(headlines);

  const cu5 =
    Number.isFinite(Number(copper5dPct))
      ? Number(copper5dPct)
      : (pctChange(series?.copper, 5) ?? 0);

  // Combine short (5d) + structural trend (20d) across US AI/Tesla, China AI/EVs, and Power/Grid
  const computeMom = computeBasket.live
    ? clamp((computeBasket.avg5dPct * 0.55 + computeBasket.avg20dPct * 0.28) / 7.5, -1, 1)
    : 0.12;
  const chinaAiEvMom = chinaAiEvBasket.live
    ? clamp((chinaAiEvBasket.avg5dPct * 0.55 + chinaAiEvBasket.avg20dPct * 0.28) / 8.5, -1, 1)
    : 0.10;
  const powerMom = powerBasket.live
    ? clamp((powerBasket.avg5dPct * 0.52 + powerBasket.avg20dPct * 0.30 + cu5 * 0.18) / 8.0, -1, 1)
    : clamp(0.14 + cu5 / 18, -0.6, 0.8);

  const scenarioShift =
    scenarioMode === 'surge' ? 24 : scenarioMode === 'pause' ? -28 : 0;

  // Structural baseline = 56 (+165% DC power by 2030, global EV/BYD/Tesla ramp & 6-yr silver deficit)
  const rawIndex =
    56 +
    computeMom * 14 +
    chinaAiEvMom * 13 +
    powerMom * 16 +
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

  // Silver: strong non-thriftable industrial + EV + space solar + grid conductivity driver
  const silverRaw = ((raceIndex - 45) / 48) * supplyTightMult;
  const silverSignal = +clamp(silverRaw, -0.65, 0.92).toFixed(3);
  const silverBoost = +clamp(silverSignal * 0.115, -0.055, 0.105).toFixed(4);

  // Gold: realistic supporting electronics/EV/aerospace layer (wire bonding, corrosion-proof contacts)
  const goldSignal = +clamp(silverSignal * 0.36, -0.28, 0.38).toFixed(3);
  const goldBoost = +clamp(goldSignal * 0.105, -0.022, 0.042).toFixed(4);

  // Estimated annualized AI DC + grid silver run-rate within documented 20–42 Moz/yr band
  const estSilverMozYr = Math.round(clamp(20 + ((raceIndex - 20) / 78) * 24, 18, 46));

  let status = 'Steady AI & EV Expansion';
  let tone = 'neutral';
  if (raceIndex >= 74) {
    status = 'Hyperscale & EV Surge ↑';
    tone = 'bullish';
  } else if (raceIndex >= 58) {
    status = 'Active AI & EV Buildout ↑';
    tone = 'bullish';
  } else if (raceIndex <= 34) {
    status = 'CapEx & EV Slowdown ↓';
    tone = 'bearish';
  }

  let summary = `Global US & China AI/EV race index at ${raceIndex}/100 (${status.replace(/[↑↓]/g, '').trim()}). `;
  if (tone === 'bullish') {
    summary += `US hyperscalers & labs (Google, NVIDIA, Tesla, SpaceX, OpenAI, Anthropic) plus China AI & EV leaders (Alibaba, Tencent, Baidu, DeepSeek, BYD, CATL, Xiaomi) compound non-thriftable silver demand (~${estSilverMozYr} Moz/yr DC/grid + EV inverters/solid-state batteries) onto a 6-year deficit with 70–80% byproduct inelasticity, plus supporting gold wire-bonding & EV connector demand.`;
  } else if (tone === 'bearish') {
    summary += `Global AI CapEx & EV stocks cooled recently — easing near-term industrial momentum, though long-term 2025–2030 data center power (+165%) and EV electrification demand remain intact.`;
  } else {
    summary += `Steady US & China AI data centers, SpaceX orbital builds, and BYD/Tesla EV production underpin ~${estSilverMozYr} Moz/yr of non-thriftable silver hardware draw and supporting gold connector demand.`;
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
    chinaAiEvBasket,
    powerBasket,
    privateLabs: PRIVATE_AI_SPACE_LABS.map((l) => ({
      id: l.id,
      name: l.name,
      mentions: news.labMentions[l.id] || 0,
    })),
    news,
    silver: {
      signal: silverSignal,
      predictionBoost: silverBoost,
      pts: Math.round(silverBoost * 100),
      role: 'Primary AI, EV & Space Metal (Switchgear, Busbars, BYD/Tesla EVs, Starlink Solar — Non-Thriftable)',
    },
    gold: {
      signal: goldSignal,
      predictionBoost: goldBoost,
      pts: Math.round(goldBoost * 100),
      role: 'Supporting High-Reliability Metal (Wire Bonding, EV/Server Connectors & Satellite Contacts)',
    },
    summary,
  };
}
