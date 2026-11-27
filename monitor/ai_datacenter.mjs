/**
 * Bullion Pulse — Planetary AI, Space, Grid & EV Metal Race Engine (v57)
 * Zero-dependency ES module, strictly causal (no look-ahead).
 *
 * Tracks 36 live public tickers + 7 frontier private labs across 6 continents:
 *  1. US Frontier AI, Tesla EVs & Silicon: NVDA, GOOGL, MSFT, META, AMZN, TSLA, TSM, AVGO
 *  2. China AI Hyperscalers & EV Giants: BABA, 0700.HK (Tencent), BIDU, 0981.HK (SMIC),
 *     1211.HK (BYD), 1810.HK (Xiaomi), LI, XPEV
 *  3. World Tech Giants (Europe, Japan, South Korea, Malaysia, Canada, South America & India):
 *     - Europe: ASML (NL), SU.PA (Schneider Electric, FR), SIE.DE (Siemens, DE), IFX.DE (Infineon, DE)
 *     - Japan: 9984.T (SoftBank), 8035.T (Tokyo Electron), 6857.T (Advantest), 7203.T (Toyota Solid-State/EV)
 *     - South Korea: 005930.KS (Samsung), 000660.KS (SK Hynix HBM)
 *     - Malaysia: 6742.KL (YTL Power Johor AI DCs), 0166.KL (Inari Amertron OSAT/Wire-Bonding)
 *     - Canada: CLS (Celestica AI Servers), BIP (Brookfield Global Data Centers)
 *     - South America: WEGE3.SA (WEG Power Transformers/Grid, BR), MELI (MercadoLibre Cloud/AI)
 *     - India: RELIANCE.NS (Jio GW AI Data Centers & Solar)
 *  4. Power Room, Switchgear & Grid Builders: VRT (Vertiv), ETN (Eaton), CEG (Constellation) + Copper
 *  5. Frontier Private Labs & Hubs (Live News): OpenAI, Anthropic, SpaceX, DeepSeek, Huawei AI, CATL, Mistral EU
 */

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export const AI_COMPUTE_META = [
  { key: 'nvda', ticker: 'NVDA', name: 'NVIDIA', region: 'US', role: 'AI GPUs & Interconnects' },
  { key: 'googl', ticker: 'GOOGL', name: 'Google', region: 'US', role: 'TPU Hyperscale & Power' },
  { key: 'msft', ticker: 'MSFT', name: 'Microsoft', region: 'US', role: 'Azure AI Campuses' },
  { key: 'meta', ticker: 'META', name: 'Meta', region: 'US', role: 'AI Training Clusters' },
  { key: 'amzn', ticker: 'AMZN', name: 'Amazon', region: 'US', role: 'AWS Cloud Buildout' },
  { key: 'tsla', ticker: 'TSLA', name: 'Tesla', region: 'US', role: 'EVs, Dojo AI & Megapacks' },
  { key: 'tsm', ticker: 'TSM', name: 'TSMC', region: 'TW', role: 'Wafer & Wire Bonding' },
  { key: 'avgo', ticker: 'AVGO', name: 'Broadcom', region: 'US', role: 'AI Silicon & Networking' },
];

export const CHINA_AI_EV_META = [
  { key: 'baba', ticker: 'BABA', name: 'Alibaba', region: 'CN', role: 'Qwen AI & Cloud CapEx' },
  { key: 'tencent', ticker: '0700.HK', name: 'Tencent', region: 'CN', role: 'Hunyuan AI & Clusters' },
  { key: 'bidu', ticker: 'BIDU', name: 'Baidu', region: 'CN', role: 'Ernie AI & Robotaxis' },
  { key: 'smic', ticker: '0981.HK', name: 'SMIC', region: 'CN', role: 'China Chip Foundry' },
  { key: 'byd', ticker: '1211.HK', name: 'BYD', region: 'CN', role: '#1 EVs & Solid-State Batteries' },
  { key: 'xiaomi', ticker: '1810.HK', name: 'Xiaomi', region: 'CN', role: 'SU7 EVs & AI Hardware' },
  { key: 'li', ticker: 'LI', name: 'Li Auto', region: 'CN', role: 'High-Voltage EVs' },
  { key: 'xpev', ticker: 'XPEV', name: 'XPeng', region: 'CN', role: 'AI Smart EVs & Robotics' },
];

export const WORLD_AI_TECH_META = [
  { key: 'asml', ticker: 'ASML', name: 'ASML', region: 'EU', role: 'EUV Lithography (Netherlands)' },
  { key: 'schneider', ticker: 'SU.PA', name: 'Schneider', region: 'EU', role: 'DC Switchgear & Busbars (France)' },
  { key: 'siemens', ticker: 'SIE.DE', name: 'Siemens', region: 'EU', role: 'Grid & AI Substations (Germany)' },
  { key: 'infineon', ticker: 'IFX.DE', name: 'Infineon', region: 'EU', role: 'AI Power & EV Chips (Germany)' },
  { key: 'softbank', ticker: '9984.T', name: 'SoftBank', region: 'JP', role: 'Stargate & Japan AI DCs (Japan)' },
  { key: 'tokyoelec', ticker: '8035.T', name: 'Tokyo Elec', region: 'JP', role: 'AI Wafer Equipment (Japan)' },
  { key: 'advantest', ticker: '6857.T', name: 'Advantest', region: 'JP', role: 'AI GPU/HBM Test Systems (Japan)' },
  { key: 'toyota', ticker: '7203.T', name: 'Toyota', region: 'JP', role: 'EVs & Solid-State Ag-C (Japan)' },
  { key: 'samsung', ticker: '005930.KS', name: 'Samsung', region: 'KR', role: 'HBM, Foundry & Solid-State (Korea)' },
  { key: 'skhynix', ticker: '000660.KS', name: 'SK Hynix', region: 'KR', role: '#1 AI HBM Memory (Korea)' },
  { key: 'ytlpower', ticker: '6742.KL', name: 'YTL Power', region: 'MY', role: 'Johor Green AI Data Centers (Malaysia)' },
  { key: 'inari', ticker: '0166.KL', name: 'Inari', region: 'MY', role: 'Chip Packaging & Wire Bonding (Malaysia)' },
  { key: 'celestica', ticker: 'CLS', name: 'Celestica', region: 'CA', role: 'Hyperscale AI Servers & 800G (Canada)' },
  { key: 'brookfield', ticker: 'BIP', name: 'Brookfield', region: 'CA', role: 'Global Multi-GW Data Centers (Canada)' },
  { key: 'weg', ticker: 'WEGE3.SA', name: 'WEG', region: 'SA', role: 'Grid Transformers & EV Motors (Brazil)' },
  { key: 'meli', ticker: 'MELI', name: 'MercadoLibre', region: 'SA', role: 'LatAm Cloud & AI Tech (South America)' },
  { key: 'reliance', ticker: 'RELIANCE.NS', name: 'Reliance', region: 'IN', role: 'Jio GW AI Data Centers & Solar (India)' },
];

export const AI_POWER_META = [
  { key: 'vrt', ticker: 'VRT', name: 'Vertiv', region: 'US', role: 'Switchgear, Busbars & UPS' },
  { key: 'etn', ticker: 'ETN', name: 'Eaton', region: 'US', role: 'Breakers, Relays & Grid' },
  { key: 'ceg', ticker: 'CEG', name: 'Constellation', region: 'US', role: '24/7 Hyperscale Power' },
];

export const PRIVATE_AI_SPACE_LABS = [
  { id: 'openai', name: 'OpenAI', rx: /\b(openai|stargate)\b/i },
  { id: 'anthropic', name: 'Anthropic', rx: /\b(anthropic|claude)\b/i },
  { id: 'spacex', name: 'SpaceX', rx: /\b(spacex|starlink|starship)\b/i },
  { id: 'deepseek', name: 'DeepSeek', rx: /\b(deepseek)\b/i },
  { id: 'huawei', name: 'Huawei AI', rx: /\b(huawei|ascend)\b/i },
  { id: 'catl', name: 'CATL', rx: /\b(catl)\b/i },
  { id: 'mistral', name: 'Mistral EU', rx: /\b(mistral)\b/i },
];

// Linear-time predicate pairs (avoids multi-.* polynomial/cubic ReDoS backtracking)
const BULL_AI_CAPEX_PREDICATES = [
  [
    /\b(nvidia|google|alphabet|microsoft|meta|amazon|aws|openai|anthropic|claude|spacex|starlink|tesla|megapack|xai|oracle|tsmc|broadcom|vertiv|eaton|stargate|hyperscaler)\b/i,
    /\b(gigawatt|megawatt|power deal|nuclear|substation|switchgear|busbar|grid upgrade|blackwell|rubin|tpu|satellite|launch|dojo|cortex|billion|expand|buildout|surge|boom|record|deliveries|raise(?:s|d|ing)?\s+(?:\w+\s+){0,3}capex|invest|order|deal)/i,
  ],
  [
    /\b(alibaba|qwen|tencent|hunyuan|baidu|ernie|deepseek|huawei|ascend|bytedance|smic|byd|catl|xiaomi|xpeng|li auto|nio|geely)\b/i,
    /\b(solid[- ]?state|megawatt|gigawatt|deliveries|sales surge|sales jump|record|expand|billion|boom|buildout|invest|ramp|factory|surge)/i,
  ],
  [
    /\b(asml|schneider electric|siemens|infineon|mistral|softbank|tokyo electron|advantest|toyota|samsung|sk hynix|ytl power|inari|johor|malaysia|celestica|brookfield|weg|mercadolibre|reliance|jio)\b/i,
    /\b(hbm|switchgear|transformer|power grid|solid[- ]?state|gigawatt|megawatt|chip plant|wire bonding|billion|expand|buildout|surge|record|invest|order|deal)/i,
  ],
  [
    /\b(ai data center|hyperscale data center|ai power demand|data center power|power grid upgrade|switchgear|busbar|wire bonding|solid[- ]?state battery)\b/i,
    /\b(surge|boom|jump|soar|expand|gw|gigawatt|record|shortage|silver|gold|demand|strain|tight)/i,
  ],
  [
    /\b(silver|gold)\b/i,
    /\b(ai data center|ai server|ai chip|switchgear|busbar|semiconductor|wire bonding|hyperscale|byd|tesla|starlink|samsung|toyota|ev demand)\b/i,
    /\b(surge|boom|jump|rise|demand|boost|tight|shortage|deficit)/i,
  ],
];

const BEAR_AI_CAPEX_PREDICATES = [
  [
    /\b(nvidia|google|alphabet|microsoft|meta|amazon|aws|openai|anthropic|tesla|spacex|alibaba|tencent|baidu|byd|catl|xiaomi|xpeng|li auto|nio|asml|siemens|samsung|sk hynix|softbank|toyota|hyperscaler|data center|ai infrastructure)\b/i,
    /\b(capex cut|cut spending|cuts? capex|cancel|delay|pause|slowdown|pullback|bubble burst|halt|slump|oversupply|excess capacity|sales drop|sales fall|ev slump)/i,
  ],
  [
    /\b(ai data center|ai capex|ai chip|server demand|ev sales)\b/i,
    /\b(cool|slow|drop|fall|shrink|cut|cancel|delay|bubble|slump)/i,
  ],
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
      if (fb.pct5d != null && fb.pct5d !== '' && Number.isFinite(Number(fb.pct5d))) p5 = Number(fb.pct5d);
      if (fb.pct20d != null && fb.pct20d !== '' && Number.isFinite(Number(fb.pct20d))) p20 = Number(fb.pct20d);
      if (fb.price != null && fb.price !== '' && Number.isFinite(Number(fb.price))) price = Number(fb.price);
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
      region: m.region || 'GLB',
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

  for (const h of (headlines || []).slice(0, 150)) {
    const text = `${h?.title || ''} ${h?.summary || ''}`.trim().slice(0, 600);
    if (!text) continue;
    for (const lab of PRIVATE_AI_SPACE_LABS) {
      if (lab.rx.test(text)) labMentions[lab.id]++;
    }
    const isBear = BEAR_AI_CAPEX_PREDICATES.some((group) => group.every((rx) => rx.test(text)));
    const isBull = BULL_AI_CAPEX_PREDICATES.some((group) => group.every((rx) => rx.test(text)));
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
    newsScore: +clamp(net * 0.24, -0.85, 0.90).toFixed(3),
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
  const worldAiBasket = summarizeBasket(WORLD_AI_TECH_META, series, fallbackTickers);
  const powerBasket = summarizeBasket(AI_POWER_META, series, fallbackTickers);
  const news = scoreAiDatacenterHeadlines(headlines);

  const cu5 =
    copper5dPct != null && copper5dPct !== '' && Number.isFinite(Number(copper5dPct))
      ? Number(copper5dPct)
      : (pctChange(series?.copper, 5) ?? 0);

  // Combine short (5d) + structural trend (20d) across US, China, World ex-US/CN, and Power/Grid
  const computeMom = computeBasket.live
    ? clamp((computeBasket.avg5dPct * 0.55 + computeBasket.avg20dPct * 0.28) / 7.5, -1, 1)
    : 0.12;
  const chinaAiEvMom = chinaAiEvBasket.live
    ? clamp((chinaAiEvBasket.avg5dPct * 0.55 + chinaAiEvBasket.avg20dPct * 0.28) / 8.5, -1, 1)
    : 0.10;
  const worldAiMom = worldAiBasket.live
    ? clamp((worldAiBasket.avg5dPct * 0.55 + worldAiBasket.avg20dPct * 0.28) / 7.5, -1, 1)
    : 0.10;
  const powerMom = powerBasket.live
    ? clamp((powerBasket.avg5dPct * 0.52 + powerBasket.avg20dPct * 0.30 + cu5 * 0.18) / 8.0, -1, 1)
    : clamp(0.14 + cu5 / 18, -0.6, 0.8);

  const scenarioShift =
    scenarioMode === 'surge' ? 24 : scenarioMode === 'pause' ? -28 : 0;

  // Structural baseline = 56 (+165% DC power by 2030, worldwide EV/AI/HBM ramp & 6-yr silver deficit)
  const rawIndex =
    56 +
    computeMom * 11 +
    chinaAiEvMom * 10 +
    worldAiMom * 11 +
    powerMom * 13 +
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

  const estSilverMozYr = Math.round(clamp(20 + ((raceIndex - 20) / 78) * 24, 18, 46));

  let status = 'Steady Global AI & EV';
  let tone = 'neutral';
  if (raceIndex >= 74) {
    status = 'Global AI & EV Surge ↑';
    tone = 'bullish';
  } else if (raceIndex >= 58) {
    status = 'Active Global Buildout ↑';
    tone = 'bullish';
  } else if (raceIndex <= 34) {
    status = 'Global CapEx Slowdown ↓';
    tone = 'bearish';
  }

  let summary = `Planetary AI/Space/EV race index at ${raceIndex}/100 (${status.replace(/[↑↓]/g, '').trim()}). `;
  if (tone === 'bullish') {
    summary += `Worldwide buildouts across the US (NVIDIA/Google/Tesla/SpaceX/OpenAI/Anthropic), China (BYD/Alibaba/Tencent/DeepSeek), Europe (ASML/Schneider/Siemens), Japan/Korea (SoftBank/Samsung/SK Hynix/Toyota), Malaysia (YTL Power/Inari), Canada (Celestica/Brookfield), South America (WEG/MercadoLibre) & India (Reliance) tighten non-thriftable silver (~${estSilverMozYr} Moz/yr DC/grid + EVs) on a 6-yr deficit, plus supporting gold wire-bonding demand.`;
  } else if (tone === 'bearish') {
    summary += `Global AI CapEx, semiconductor & EV equities cooled recently — easing near-term industrial momentum, while multi-year 2025–2030 grid power (+165%) and EV demand remain intact.`;
  } else {
    summary += `Steady global AI data centers, chip fabs, and EV buildouts across 6 continents underpin ~${estSilverMozYr} Moz/yr of non-thriftable silver draw and supporting gold connector demand.`;
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
    worldAiBasket,
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
      role: 'Primary AI, EV & Space Metal (Global Switchgear, BYD/Tesla/Toyota EVs, Samsung Ag-C & Starlink Solar)',
    },
    gold: {
      signal: goldSignal,
      predictionBoost: goldBoost,
      pts: Math.round(goldBoost * 100),
      role: 'Supporting High-Reliability Metal (TSMC/Inari Wire Bonding, HBM/Server Connectors & Satellite Contacts)',
    },
    summary,
  };
}
