/**
 * Bullion Pulse — Historical Pattern, Macro Catalyst & Probabilistic Outlook Engine
 * Pure ES module with zero dependencies.
 *
 * IMPORTANT: Models probabilistic ranges from historical cross-market relationships
 * and documented event analogs. Educational / analytical tool — not financial advice.
 */

import { estimateJumpParams, runJumpDiffusion } from './jump_diffusion.mjs';

export const DRIVER_META = {
  inflation: {
    id: 'inflation',
    label: 'Inflation & Currency',
    shortLabel: 'Inflation',
    goldWeight: 0.16,
    silverWeight: 0.13,
    description: 'CPI/PCE surprises, stagflation, fiscal deficits, and purchasing-power erosion.',
  },
  geopolitics: {
    id: 'geopolitics',
    label: 'Wars & Geopolitics',
    shortLabel: 'Geopolitics',
    goldWeight: 0.16,
    silverWeight: 0.09,
    description: 'Armed conflict escalations, sanctions, trade wars, and safe-haven demand.',
  },
  rates_usd: {
    id: 'rates_usd',
    label: 'Real Yields (TIPS) & USD',
    shortLabel: 'Real Yields',
    goldWeight: 0.19,
    silverWeight: 0.14,
    description: '10Y TIPS real yields (DFII10), breakeven inflation (T10YIE), Fed policy, and US Dollar Index.',
  },
  equities: {
    id: 'equities',
    label: 'Stock Markets & Risk',
    shortLabel: 'Equities',
    goldWeight: 0.07,
    silverWeight: 0.09,
    description: 'S&P 500 selloffs, VIX volatility spikes, credit stress, and risk-off rotation.',
  },
  mining_supply: {
    id: 'mining_supply',
    label: 'Mining & Industrial',
    shortLabel: 'Mining / Supply',
    goldWeight: 0.05,
    silverWeight: 0.17,
    description: 'Mine strikes, ore disruptions, vault deficits, and solar/EV/electronics demand.',
  },
  central_banks: {
    id: 'central_banks',
    label: 'Central Banks & ETFs',
    shortLabel: 'Central Banks',
    goldWeight: 0.08,
    silverWeight: 0.05,
    description: 'Sovereign gold reserve accumulation, de-dollarization, and bullion ETF flows.',
  },
  shanghai_sge: {
    id: 'shanghai_sge',
    label: 'Shanghai Physical (SGE)',
    shortLabel: 'Shanghai SGE',
    goldWeight: 0.10,
    silverWeight: 0.11,
    description: 'Shanghai Gold (Au99.99) & Silver (Ag(T+D)) premiums over Western spot and Asian physical demand.',
  },
  positioning_miners: {
    id: 'positioning_miners',
    label: 'COT Crowding & Miners',
    shortLabel: 'COT / Miners',
    goldWeight: 0.09,
    silverWeight: 0.10,
    description: 'CFTC Managed Money contrarian crowding (52w percentile) and GDX/SIL mining stock confirmation.',
  },
  comex_paper: {
    id: 'comex_paper',
    label: 'COMEX Paper vs. Physical',
    shortLabel: 'COMEX Paper',
    goldWeight: 0.10,
    silverWeight: 0.12,
    description: 'Fresh COMEX GC/SI paper open interest contracts vs. registered deliverable vault ounces and delivery squeeze stress.',
  },
};

/**
 * Documented historical macro episodes and how Spot Gold (XAU) & Silver (XAG)
 * reacted over roughly 7-day and 30-day windows after the catalyst emerged.
 */
export const HISTORICAL_ANALOGS = [
  {
    id: 'ukraine-2022',
    title: 'Russia–Ukraine Invasion (Feb 2022)',
    drivers: ['geopolitics', 'inflation'],
    direction: 'bullish',
    gold7dPct: 4.8,
    gold30dPct: 8.2,
    silver7dPct: 6.1,
    silver30dPct: 10.4,
    note: 'Acute geopolitical shock plus commodity inflation triggered an immediate safe-haven spike before higher Fed rates later capped gains.',
  },
  {
    id: 'mideast-2023',
    title: 'Middle East Escalation (Oct 2023)',
    drivers: ['geopolitics'],
    direction: 'bullish',
    gold7dPct: 5.4,
    gold30dPct: 7.9,
    silver7dPct: 5.0,
    silver30dPct: 8.6,
    note: 'War risk drove rapid safe-haven inflows into gold despite elevated Treasury yields.',
  },
  {
    id: 'svb-banking-2023',
    title: 'US Regional Banking Stress (Mar 2023)',
    drivers: ['equities', 'rates_usd'],
    direction: 'bullish',
    gold7dPct: 6.5,
    gold30dPct: 9.8,
    silver7dPct: 8.2,
    silver30dPct: 16.5,
    note: 'Equity/bank stress caused bond yields to plunge as markets priced emergency Fed liquidity, fueling a sharp precious-metals breakout.',
  },
  {
    id: 'fed-hikes-2022',
    title: 'Aggressive Fed Rate-Hike Cycle (Mid-2022)',
    drivers: ['rates_usd'],
    direction: 'bearish',
    gold7dPct: -2.4,
    gold30dPct: -6.8,
    silver7dPct: -4.9,
    silver30dPct: -12.5,
    note: 'Surging real yields and a 20-year high US Dollar created a strong mechanical headwind for non-yielding bullion.',
  },
  {
    id: 'covid-2020',
    title: 'COVID Liquidity Crash → Fed Cuts (Mar 2020)',
    drivers: ['equities', 'rates_usd', 'inflation'],
    direction: 'mixed',
    gold7dPct: -4.5,
    gold30dPct: 11.4,
    silver7dPct: -14.0,
    silver30dPct: 19.2,
    note: 'During sudden stock-market margin liquidations, silver and gold often dip briefly first, then rally strongly once central banks cut rates.',
  },
  {
    id: 'inflation-1979',
    title: 'Stagflation & Oil Shock (1979–1980)',
    drivers: ['inflation', 'geopolitics'],
    direction: 'bullish',
    gold7dPct: 6.2,
    gold30dPct: 18.5,
    silver7dPct: 9.4,
    silver30dPct: 26.0,
    note: 'Persistent inflation outpacing interest rates drove historic capital rotation into hard assets.',
  },
  {
    id: 'us-downgrade-2011',
    title: 'US Credit Downgrade & Euro Debt Crisis (Aug 2011)',
    drivers: ['equities', 'central_banks', 'inflation'],
    direction: 'bullish',
    gold7dPct: 5.9,
    gold30dPct: 12.1,
    silver7dPct: 4.2,
    silver30dPct: 8.5,
    note: 'Sovereign debt fears favored gold over industrial silver as equity volatility spiked.',
  },
  {
    id: 'cb-buying-2024',
    title: 'Record Central Bank Buying & Fed Pivot (2024)',
    drivers: ['central_banks', 'rates_usd'],
    direction: 'bullish',
    gold7dPct: 2.8,
    gold30dPct: 7.4,
    silver7dPct: 4.1,
    silver30dPct: 11.8,
    note: 'Sustained emerging-market central bank accumulation paired with rate-cut expectations drove repeated all-time highs.',
  },
  {
    id: 'silver-deficit-2024',
    title: 'Solar Demand & Silver Mine Supply Deficit (2024–25)',
    drivers: ['mining_supply'],
    direction: 'bullish',
    gold7dPct: 1.1,
    gold30dPct: 3.4,
    silver7dPct: 5.6,
    silver30dPct: 14.2,
    note: 'Multi-year structural silver deficits from photovoltaic solar and electronics demand compressed the Gold/Silver ratio rapidly.',
  },
  {
    id: 'silver-squeeze-2026',
    title: 'China Silver Export Curbs & SGE Squeeze (Jan 2026)',
    drivers: ['shanghai_sge', 'mining_supply'],
    direction: 'bullish',
    gold7dPct: 3.4,
    gold30dPct: 9.1,
    silver7dPct: 12.8,
    silver30dPct: 28.5,
    note: 'China refined silver export licensing and surging Shanghai Ag(T+D) premiums triggered an acute physical scramble across Asia before high-volatility mean reversion.',
  },
  {
    id: 'disinflation-rally-2013',
    title: 'Taper Tantrum & Cooling Inflation (Apr–Jun 2013)',
    drivers: ['rates_usd', 'inflation', 'central_banks'],
    direction: 'bearish',
    gold7dPct: -5.8,
    gold30dPct: -11.2,
    silver7dPct: -8.6,
    silver30dPct: -17.4,
    note: 'Rising real yields alongside heavy gold ETF outflows triggered an abrupt liquidation across bullion markets.',
  },
];

/**
 * Interactive "What-If" scenario presets used in the mobile UI & simulator.
 */
export const SCENARIO_PRESETS = [
  {
    id: 'hot_cpi',
    label: 'Hot CPI Inflation',
    driver: 'inflation',
    goldDelta: 0.65,
    silverDelta: 0.72,
    summary: 'Inflation surprise above expectations boosts hard-asset hedging demand.',
  },
  {
    id: 'war_escalation',
    label: 'War Escalation',
    driver: 'geopolitics',
    goldDelta: 0.85,
    silverDelta: 0.50,
    summary: 'Geopolitical conflict drives immediate safe-haven bids, led by Gold.',
  },
  {
    id: 'fed_rate_cut',
    label: 'Fed Rate Cut / Weak USD',
    driver: 'rates_usd',
    goldDelta: 0.75,
    silverDelta: 0.80,
    summary: 'Falling real yields and a softer US Dollar lower the opportunity cost of holding bullion.',
  },
  {
    id: 'hawkish_usd',
    label: 'Hawkish Fed / USD Surge',
    driver: 'rates_usd',
    goldDelta: -0.75,
    silverDelta: -0.82,
    summary: 'Higher real yields and stronger USD historically pressure both Gold and Silver.',
  },
  {
    id: 'stock_crash',
    label: 'Stock Market −5% Shock',
    driver: 'equities',
    goldDelta: 0.45,
    silverDelta: -0.25,
    summary: 'Sharp stock selloffs boost Gold safe-haven demand, while Silver can initially lag due to industrial & margin-call selling.',
  },
  {
    id: 'mine_strike',
    label: 'Silver Mine Strike / Deficit',
    driver: 'mining_supply',
    goldDelta: 0.25,
    silverDelta: 0.90,
    summary: 'Mine supply disruptions and tight vault inventories disproportionately lift Silver.',
  },
  {
    id: 'cb_buying',
    label: 'Central Bank Gold Buying',
    driver: 'central_banks',
    goldDelta: 0.70,
    silverDelta: 0.35,
    summary: 'Sovereign reserve accumulation provides a persistent structural floor under Gold.',
  },
  {
    id: 'shanghai_premium',
    label: 'Shanghai Premium Surge (+$40)',
    driver: 'shanghai_sge',
    goldDelta: 0.75,
    silverDelta: 0.80,
    summary: 'Elevated SGE physical premiums over London/COMEX signal strong Chinese physical bullion demand.',
  },
  {
    id: 'comex_squeeze',
    label: 'COMEX Delivery Squeeze (OI Spike)',
    driver: 'comex_paper',
    goldDelta: 0.65,
    silverDelta: 0.88,
    summary: 'Surging COMEX paper open interest against draining registered vaults raises short-covering and physical squeeze tail risk.',
  },
];

/* ---------- Keyword-Based News Classifier ---------- */

const DRIVER_RULES = [
  {
    driver: 'inflation',
    bullish: [
      /\binflation\b.*\b(surge|jump|rise|hot|acceler|sticky|high|above|exceed)/i,
      /\b(hot|higher|sticky|persistent)\b.*\b(cpi|pce|inflation)/i,
      /\bstagflation\b/i,
      /\b(deficit|national debt|debt ceiling|debasement)\b/i,
      /\boil\b.*\b(surge|spike|jump)/i,
    ],
    bearish: [
      /\binflation\b.*\b(cool|ease|drop|fall|slow|below|tame)/i,
      /\bdisinflation\b|\bdeflation\b/i,
      /\b(cpi|pce)\b.*\b(cool|below|lower|drop|miss)/i,
    ],
  },
  {
    driver: 'geopolitics',
    bullish: [
      /\b(war|airstrike|missile|invasion|escalat|conflict|hostilit|strike|retaliat)\b/i,
      /\b(middle east|ukraine|gaza|iran|taiwan|red sea)\b.*\b(tension|attack|crisis|clash|warning|fear)/i,
      /\b(sanction|tariff|trade war|embargo|geopolitical)\b/i,
      /\bsafe[- ]haven\b/i,
    ],
    bearish: [
      /\b(ceasefire|peace deal|truce|de-escalat|peace talk|diplomatic breakthrough)\b/i,
      /\b(tariff|sanction).*\b(lift|ease|pause|roll back|dropped)\b/i,
    ],
  },
  {
    driver: 'rates_usd',
    bullish: [
      /\b(rate cut|cut rates|dovish|pivot|easing cycle|lower rates)\b/i,
      /\b(dollar|usd|dxy)\b.*\b(fall|drop|slip|weaken|slide|tumble|retreat)/i,
      /\b(yield|treasury)\b.*\b(fall|drop|plunge|slip|decline|retreat)/i,
      /\bfed\b.*\b(pause|cut|dovish|soften)/i,
    ],
    bearish: [
      /\b(rate hike|hike rates|hawkish|higher for longer|tightening)\b/i,
      /\b(dollar|usd|dxy)\b.*\b(surge|rally|jump|strengthen|rise|climb|strong)/i,
      /\b(yield|treasury)\b.*\b(surge|jump|spike|climb|rise|higher)/i,
      /\bfed\b.*\b(hawkish|delay cut|hold high|hike)/i,
    ],
  },
  {
    driver: 'equities',
    bullish: [
      /\b(stock|equit|s&p|nasdaq|dow|wall street)\b.*\b(crash|plunge|selloff|sell-off|tumble|slump|sink|rout)/i,
      /\b(recession|banking crisis|bank failure|credit crunch|vix spike|market turmoil)\b/i,
    ],
    bearish: [
      /\b(stock|equit|s&p|nasdaq)\b.*\b(record high|rally|surge|boom|risk-on)\b/i,
      /\brisk appetite\b.*\b(return|surge|strong)/i,
    ],
  },
  {
    driver: 'mining_supply',
    bullish: [
      /\b(mine|mining|miner|smelter)\b.*\b(strike|halt|shut|disrupt|suspend|protest|shortage|deficit|decline|fall|lower output)/i,
      /\b(silver|gold)\b.*\b(deficit|shortage|tight supply|vault drain|inventory drop|record demand|squeeze|sixth straight)/i,
      /\b(solar|photovoltaic|ev|electrification|charging|electronics|ai data center)\b.*\b(silver|demand|grow|surge|boom|rise)/i,
      /\bexport (ban|curb|restriction|licensing|control)\b.*\b(silver|gold|metal|mineral)/i,
      /\b(comex|lbma|shfe)\b.*\b(inventory|stock|vault)\b.*\b(drop|decline|drain|low|plummet)/i,
    ],
    bearish: [
      /\b(mine|mining)\b.*\b(record output|production surge|supply glut|oversupply|reopen|restart)/i,
      /\b(silver|gold)\b.*\b(surplus|oversupply|weak industrial demand|thrifting|substitution|narrow)/i,
    ],
  },
  {
    driver: 'central_banks',
    bullish: [
      /\bcentral bank\b.*\b(buy|buying|accumulat|add|reserve|record|gold)\b/i,
      /\b(china|pboc|india|rbi|poland|turkey)\b.*\b(gold reserve|buys gold|adds gold|silver import)/i,
      /\b(gold|silver) (etf|etp)\b.*\b(inflow|surge|buying|add|recover)/i,
      /\bde-dollariz/i,
    ],
    bearish: [
      /\bcentral bank\b.*\b(sell|selling|pause buying|halt gold|dump)\b/i,
      /\b(gold|silver) (etf|etp)\b.*\b(outflow|redemption|selling|trim)/i,
    ],
  },
  {
    driver: 'shanghai_sge',
    bullish: [
      /\b(shanghai|sge|shfe)\b.*\b(premium|surge|high|squeeze|tight|demand|au99|ag\(t\+d\)|vault drain)/i,
      /\bchina\b.*\b(silver|gold)\b.*\b(export control|export restriction|licensing|premium|rush|shortage)/i,
    ],
    bearish: [
      /\b(shanghai|sge|shfe)\b.*\b(discount|margin hike|margin rate|cooling|inventory build|slump)/i,
    ],
  },
  {
    driver: 'comex_paper',
    bullish: [
      /\bcomex\b.*\b(registered|vault|stockpile|inventor|delivery)\b.*\b(drop|drain|fall|low|squeeze|drawdown|outflow|stand for delivery)/i,
      /\b(paper silver|paper gold|open interest)\b.*\b(surge|jump|squeeze|record|exceed|short covering)/i,
    ],
    bearish: [
      /\bcomex\b.*\b(margin hike|registered build|inventory surge|liquidation|paper dump|paper slam)/i,
    ],
  },
];

export function classifyHeadline(headline) {
  const text = `${headline.title || ''} ${headline.summary || ''}`.trim();
  let bestMatch = null;

  for (const rule of DRIVER_RULES) {
    let bullHits = 0;
    let bearHits = 0;
    for (const rx of rule.bullish) {
      if (rx.test(text)) bullHits++;
    }
    for (const rx of rule.bearish) {
      if (rx.test(text)) bearHits++;
    }
    const total = bullHits + bearHits;
    if (total === 0) continue;

    const polarity = bullHits === bearHits ? 0 : bullHits > bearHits ? 1 : -1;
    const strength = Math.min(1, 0.45 + total * 0.22);
    if (!bestMatch || total > bestMatch.hits) {
      bestMatch = {
        driver: rule.driver,
        polarity,
        strength,
        hits: total,
      };
    }
  }

  if (!bestMatch) return null;

  // Mentioning silver specifically boosts silver sensitivity; gold boosts gold
  const mentionsSilver = /\b(silver|xag|comex silver|solar)\b/i.test(text);
  const mentionsGold = /\b(gold|xau|bullion)\b/i.test(text);

  let goldImpact = bestMatch.polarity * bestMatch.strength;
  let silverImpact = bestMatch.polarity * bestMatch.strength;

  if (bestMatch.driver === 'mining_supply') {
    silverImpact *= 1.25;
    goldImpact *= 0.65;
  } else if (bestMatch.driver === 'geopolitics' || bestMatch.driver === 'central_banks') {
    goldImpact *= 1.15;
    silverImpact *= 0.75;
  } else if (bestMatch.driver === 'equities' && bestMatch.polarity > 0) {
    // Stock selloffs help gold more reliably than industrial silver
    goldImpact *= 1.05;
    silverImpact *= 0.35;
  }

  if (mentionsSilver && !mentionsGold) {
    silverImpact *= 1.2;
    goldImpact *= 0.7;
  }

  return {
    title: headline.title,
    source: headline.source || 'News Feed',
    publishedAt: headline.publishedAt || new Date().toISOString(),
    url: headline.url || '',
    driver: bestMatch.driver,
    driverLabel: DRIVER_META[bestMatch.driver].shortLabel,
    sentiment: bestMatch.polarity > 0 ? 'bullish' : bestMatch.polarity < 0 ? 'bearish' : 'neutral',
    goldImpact: clamp(goldImpact, -1, 1),
    silverImpact: clamp(silverImpact, -1, 1),
  };
}

const TIER1_SOURCES = /\b(reuters|bloomberg|financial times|ft|wsj|silver institute|world bank|cftc|federal reserve|sge|shanghai gold exchange|metals focus|kitco)\b/i;
const TIER2_SOURCES = /\b(mining\.com|mining weekly|fxstreet|seeking alpha|crux investor|investing|marketwatch|cnbc|barron|yahoo|asia metals|commodity desk|metals wire)\b/i;

export function sourceTierInfo(source = '') {
  if (TIER1_SOURCES.test(source)) return { tier: 1, weight: 1.25 };
  if (TIER2_SOURCES.test(source)) return { tier: 2, weight: 1.0 };
  return { tier: 3, weight: 0.75 };
}

export function recencyDecayWeight(publishedAt, nowMs = Date.now()) {
  const ts = publishedAt ? new Date(publishedAt).getTime() : NaN;
  if (!Number.isFinite(ts)) return 0.7;
  const ageHours = Math.max(0, (nowMs - ts) / 3600000);
  // 18-hour half-life: breaking news (~1h) = 0.96x, 36h recap = 0.25x
  return +clamp(Math.exp((-Math.LN2 * ageHours) / 18), 0.2, 1.0).toFixed(3);
}

function titleTokens(title = '') {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^(the|and|for|with|from|that|this|into|over|amid|after|says|report)$/.test(w))
  );
}

function jaccardSimilarity(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  return inter / (setA.size + setB.size - inter);
}

export function classifyHeadlines(rawHeadlines = [], nowMs = Date.now()) {
  const clusters = [];

  for (const h of rawHeadlines) {
    const classified = classifyHeadline(h);
    if (!classified) continue;

    const { tier, weight: tierW } = sourceTierInfo(classified.source);
    const recencyW = recencyDecayWeight(classified.publishedAt, nowMs);
    const combinedW = +(tierW * recencyW).toFixed(3);
    const enriched = {
      ...classified,
      sourceTier: tier,
      recencyWeight: recencyW,
      weight: combinedW,
      clusterCount: 1,
      goldImpact: +clamp(classified.goldImpact * combinedW, -1, 1).toFixed(3),
      silverImpact: +clamp(classified.silverImpact * combinedW, -1, 1).toFixed(3),
    };

    const tokens = titleTokens(enriched.title);
    const match = clusters.find(
      (c) => c.item.driver === enriched.driver && jaccardSimilarity(c.tokens, tokens) >= 0.5
    );

    if (match) {
      match.item.clusterCount += 1;
      // Keep higher-weighted (fresher / higher-tier) headline as cluster lead
      if (enriched.weight > match.item.weight) {
        enriched.clusterCount = match.item.clusterCount;
        match.item = enriched;
        match.tokens = tokens;
      }
    } else {
      clusters.push({ tokens, item: enriched });
    }
  }

  return clusters
    .map((c) => c.item)
    .sort((a, b) => b.weight - a.weight);
}

/* ---------- Quantitative Historical Series Helpers ---------- */

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function dailyReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev > 0 && Number.isFinite(curr)) {
      out.push((curr - prev) / prev);
    }
  }
  return out;
}

export function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function pearsonCorrelation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return null;
  const a = xs.slice(-n);
  const b = ys.slice(-n);
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : +(num / den).toFixed(2);
}

function pctChangeOver(closes, lookback) {
  if (!closes || closes.length < 2) return 0;
  const last = closes[closes.length - 1];
  const idx = Math.max(0, closes.length - 1 - lookback);
  const prev = closes[idx];
  return prev > 0 ? ((last - prev) / prev) * 100 : 0;
}

function movingAverage(closes, period) {
  if (!closes || closes.length === 0) return null;
  const slice = closes.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

export function computeQuantSignals(series = {}) {
  const goldCloses = series.gold || [];
  const silverCloses = series.silver || [];
  const dxyCloses = series.dxy || [];
  const spxCloses = series.spx || [];
  const tnxCloses = series.tnx || [];
  const vixCloses = series.vix || [];

  const goldRet = dailyReturns(goldCloses.slice(-30));
  const silverRet = dailyReturns(silverCloses.slice(-30));

  // Fallback daily volatilities if historical data is thin (typical long-run σ: ~0.95% gold, ~1.85% silver)
  const goldDailyVol = clamp(stdDev(goldRet) || 0.0095, 0.0055, 0.025);
  const silverDailyVol = clamp(stdDev(silverRet) || 0.0185, 0.010, 0.045);

  const goldLast = goldCloses[goldCloses.length - 1] ?? 2685;
  const silverLast = silverCloses[silverCloses.length - 1] ?? 31.5;
  const ratio = silverLast > 0 ? goldLast / silverLast : 85;

  // Trend: price vs 20d & 50d moving averages
  const goldSma20 = movingAverage(goldCloses, 20) ?? goldLast;
  const goldSma50 = movingAverage(goldCloses, 50) ?? goldLast;
  const silverSma20 = movingAverage(silverCloses, 20) ?? silverLast;
  const silverSma50 = movingAverage(silverCloses, 50) ?? silverLast;

  const goldTrend = clamp(((goldLast - goldSma20) / goldSma20) * 14 + ((goldSma20 - goldSma50) / goldSma50) * 10, -1, 1);
  const silverTrend = clamp(((silverLast - silverSma20) / silverSma20) * 10 + ((silverSma20 - silverSma50) / silverSma50) * 8, -1, 1);

  // Gold/Silver ratio mean-reversion (historical modern norm ~75-82)
  const ratioSignalSilver = clamp((ratio - 80) / 18, -0.7, 0.7);

  // Cross-market macro shifts (5-day returns)
  const dxy5dPct = pctChangeOver(dxyCloses, 5);
  const tnx5dPct = pctChangeOver(tnxCloses, 5);
  const spx5dPct = pctChangeOver(spxCloses, 5);
  const vixLast = vixCloses[vixCloses.length - 1] ?? 16.5;

  // Weaker USD & falling yields are historically bullish for bullion
  const ratesUsdMacro = clamp((-dxy5dPct / 2.2) * 0.6 + (-tnx5dPct / 6.0) * 0.4, -1, 1);

  // Equity stress: moderate-to-high VIX + equity drawdown boosts Gold safe-haven demand
  const equityStressGold = clamp((-spx5dPct / 4.5) * 0.6 + ((vixLast - 17) / 16) * 0.4, -0.8, 0.9);
  // Silver reacts positively to moderate risk-on growth, negatively to acute crashes (VIX > 28)
  const equityStressSilver =
    vixLast > 28 ? clamp(-((vixLast - 25) / 20), -0.8, 0) : clamp((spx5dPct / 5.0) * 0.4, -0.5, 0.5);

  // Rolling correlations (up to 60 trading days)
  const goldVsDxyCorr = pearsonCorrelation(dailyReturns(goldCloses.slice(-61)), dailyReturns(dxyCloses.slice(-61)));
  const goldVsSpxCorr = pearsonCorrelation(dailyReturns(goldCloses.slice(-61)), dailyReturns(spxCloses.slice(-61)));

  return {
    goldDailyVol,
    silverDailyVol,
    ratio: +ratio.toFixed(2),
    goldTrend: +goldTrend.toFixed(3),
    silverTrend: +silverTrend.toFixed(3),
    ratioSignalSilver: +ratioSignalSilver.toFixed(3),
    ratesUsdMacro: +ratesUsdMacro.toFixed(3),
    equityStressGold: +equityStressGold.toFixed(3),
    equityStressSilver: +equityStressSilver.toFixed(3),
    macroSnapshot: {
      dxy: dxyCloses.length ? +dxyCloses[dxyCloses.length - 1].toFixed(2) : null,
      dxy5dPct: +dxy5dPct.toFixed(2),
      spx: spxCloses.length ? +spxCloses[spxCloses.length - 1].toFixed(1) : null,
      spx5dPct: +spx5dPct.toFixed(2),
      tnx: tnxCloses.length ? +tnxCloses[tnxCloses.length - 1].toFixed(2) : null,
      tnx5dPct: +tnx5dPct.toFixed(2),
      vix: vixCloses.length ? +vixLast.toFixed(1) : null,
      goldVolAnnPct: +(goldDailyVol * Math.sqrt(252) * 100).toFixed(1),
      silverVolAnnPct: +(silverDailyVol * Math.sqrt(252) * 100).toFixed(1),
      goldVsDxyCorr,
      goldVsSpxCorr,
    },
  };
}

/* ---------- Composite Outlook Builder ---------- */

function signalLabelFromScore(score) {
  if (score >= 45) return 'Strong Bullish';
  if (score >= 16) return 'Bullish';
  if (score <= -45) return 'Strong Bearish';
  if (score <= -16) return 'Bearish';
  return 'Neutral';
}

function projectHorizon(spotPrice, dailyVol, compositeUnitScore, tradingDays, coneMultiplier = 1.0) {
  const sigmaH = dailyVol * Math.sqrt(tradingDays);
  // Modest expected drift capped to realistic fraction of horizon volatility
  const expectedDrift = compositeUnitScore * sigmaH * 0.72;
  const bandHalfWidth = 1.15 * sigmaH * clamp(coneMultiplier, 0.85, 1.35);
  const bearPct = (expectedDrift - bandHalfWidth) * 100;
  const basePct = expectedDrift * 100;
  const bullPct = (expectedDrift + bandHalfWidth) * 100;

  return {
    bear: +(spotPrice * (1 + bearPct / 100)).toFixed(2),
    base: +(spotPrice * (1 + basePct / 100)).toFixed(2),
    bull: +(spotPrice * (1 + bullPct / 100)).toFixed(2),
    bearPct: +bearPct.toFixed(2),
    expectedPct: +basePct.toFixed(2),
    bullPct: +bullPct.toFixed(2),
  };
}

export function matchHistoricalAnalogs(driverScores, overallDir) {
  const activeDrivers = Object.entries(driverScores)
    .filter(([, d]) => Math.abs(d.gold) >= 0.12 || Math.abs(d.silver) >= 0.12)
    .sort((a, b) => Math.max(Math.abs(b[1].gold), Math.abs(b[1].silver)) - Math.max(Math.abs(a[1].gold), Math.abs(a[1].silver)))
    .map(([id]) => id);

  const scored = HISTORICAL_ANALOGS.map((analog) => {
    let relevance = 0;
    for (const d of analog.drivers) {
      const idx = activeDrivers.indexOf(d);
      if (idx === 0) relevance += 3.0;
      else if (idx === 1) relevance += 2.2;
      else if (idx >= 2) relevance += 1.4;
    }
    if (analog.direction === overallDir) relevance += 1.2;
    else if (analog.direction === 'mixed') relevance += 0.5;
    return { ...analog, relevance: +relevance.toFixed(2) };
  });

  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, 3);
}

export function buildOutlook({
  spotGold,
  spotSilver,
  rawHeadlines = [],
  series = {},
  scenarioIds = [],
  shanghai = null,
  comex = null,
  proSignals = null,
  institutionalSignals = null,
  learnedWeights = null,
  accuracy = null,
  coneMultiplier = 1.0,
  generatedAt = new Date().toISOString(),
}) {
  const nowMs = new Date(generatedAt).getTime() || Date.now();
  const scoredHeadlines = classifyHeadlines(rawHeadlines, nowMs);
  const quant = computeQuantSignals(series);

  // Aggregate recency- & tier-weighted news per driver
  const driverBuckets = {};
  for (const id of Object.keys(DRIVER_META)) {
    driverBuckets[id] = { goldSum: 0, silverSum: 0, count: 0 };
  }

  for (const h of scoredHeadlines) {
    const b = driverBuckets[h.driver];
    if (!b) continue;
    b.goldSum += h.goldImpact;
    b.silverSum += h.silverImpact;
    b.count += 1;
  }

  // Blend in quantitative macro signals: FRED Real Yields, Shanghai SGE, COMEX Paper, ETF Flows, Copper/JPY, Basis, COT & Miners
  const shanghaiGoldPremUsd = shanghai?.gold?.premiumUsdOz;
  const shanghaiGoldPct = shanghai?.gold?.pct ?? 0;
  const shanghaiGoldSignal =
    typeof shanghaiGoldPremUsd === 'number' && Number.isFinite(shanghaiGoldPremUsd)
      ? clamp((shanghaiGoldPremUsd - 5) / 42 + (shanghaiGoldPct / 5) * 0.25, -0.85, 0.9)
      : null;

  const shanghaiSilverExVatPrem = shanghai?.silver?.exVatPremiumUsdOz;
  const shanghaiSilverPct = shanghai?.silver?.pct ?? 0;
  const shanghaiSilverSignal =
    typeof shanghaiSilverExVatPrem === 'number' && Number.isFinite(shanghaiSilverExVatPrem)
      ? clamp(shanghaiSilverExVatPrem / 3.5 + (shanghaiSilverPct / 6) * 0.25, -0.85, 0.9)
      : shanghaiGoldSignal != null
        ? shanghaiGoldSignal * 0.75
        : null;

  const comexGoldSig = comex?.gold?.signal ?? null;
  const comexSilverSig = comex?.silver?.signal ?? null;

  const inst = institutionalSignals || {};
  const etfFlows = inst.etfFlows || null;
  const crossMkt = inst.crossMarket || null;
  const basis = inst.basis || null;
  const impliedVol = inst.impliedVol || null;
  const eventRisk = inst.eventRisk || null;

  const ry = proSignals?.realYields || null;
  const cotGoldSig = proSignals?.cot?.gold?.signal ?? null;
  const cotSilverSig = proSignals?.cot?.silver?.signal ?? null;
  const minerGoldSig = proSignals?.miners?.goldSignal ?? null;
  const minerSilverSig = proSignals?.miners?.silverSignal ?? null;

  const blendOpt = (a, b, wa = 0.55) =>
    a != null && b != null ? a * wa + b * (1 - wa) : a ?? b ?? 0;

  const posMinersGold = blendOpt(cotGoldSig, minerGoldSig, 0.55);
  const posMinersSilver = blendOpt(cotSilverSig, minerSilverSig, 0.55);

  const drivers = {};
  for (const [id, meta] of Object.entries(DRIVER_META)) {
    const b = driverBuckets[id];
    let g = b.count > 0 ? clamp(b.goldSum / Math.sqrt(b.count + 0.5), -1, 1) : 0;
    let s = b.count > 0 ? clamp(b.silverSum / Math.sqrt(b.count + 0.5), -1, 1) : 0;

    if (id === 'rates_usd') {
      const macroG = ry ? clamp(ry.goldSignal * 0.62 + quant.ratesUsdMacro * 0.38, -1, 1) : quant.ratesUsdMacro;
      const macroS = ry ? clamp(ry.silverSignal * 0.60 + quant.ratesUsdMacro * 0.40, -1, 1) : quant.ratesUsdMacro;
      g = clamp(b.count > 0 ? g * 0.45 + macroG * 0.55 : macroG, -1, 1);
      s = clamp(b.count > 0 ? s * 0.45 + macroS * 0.55 : macroS, -1, 1);
    } else if (id === 'equities') {
      const eqG = crossMkt ? clamp(quant.equityStressGold * 0.65 + crossMkt.goldSignal * 0.35, -1, 1) : quant.equityStressGold;
      const eqS = crossMkt ? clamp(quant.equityStressSilver * 0.7 + crossMkt.goldSignal * 0.3, -1, 1) : quant.equityStressSilver;
      g = clamp(b.count > 0 ? g * 0.55 + eqG * 0.45 : eqG, -1, 1);
      s = clamp(b.count > 0 ? s * 0.55 + eqS * 0.45 : eqS, -1, 1);
    } else if (id === 'mining_supply') {
      // Blend Copper (HG=F) industrial confirmation directly into Silver supply/demand driver
      if (crossMkt?.silverSignal != null) {
        s = clamp(b.count > 0 ? s * 0.62 + crossMkt.silverSignal * 0.38 : crossMkt.silverSignal, -1, 1);
        g = clamp(b.count > 0 ? g * 0.8 + crossMkt.goldSignal * 0.2 : crossMkt.goldSignal * 0.4, -1, 1);
      }
    } else if (id === 'central_banks') {
      // Blend GLD / SLV / PSLV physical ETF money flows directly into Central Banks & ETFs driver
      if (etfFlows) {
        g = clamp(b.count > 0 ? g * 0.5 + etfFlows.goldSignal * 0.5 : etfFlows.goldSignal, -1, 1);
        s = clamp(b.count > 0 ? s * 0.45 + etfFlows.silverSignal * 0.55 : etfFlows.silverSignal, -1, 1);
      }
    } else if (id === 'shanghai_sge') {
      if (shanghaiGoldSignal != null) {
        g = clamp(b.count > 0 ? g * 0.45 + shanghaiGoldSignal * 0.55 : shanghaiGoldSignal, -1, 1);
      }
      if (shanghaiSilverSignal != null) {
        s = clamp(b.count > 0 ? s * 0.45 + shanghaiSilverSignal * 0.55 : shanghaiSilverSignal, -1, 1);
      }
    } else if (id === 'positioning_miners') {
      g = clamp(posMinersGold, -1, 1);
      s = clamp(posMinersSilver, -1, 1);
    } else if (id === 'comex_paper') {
      const combG = blendOpt(comexGoldSig, basis?.gold?.signal ?? null, 0.72);
      const combS = blendOpt(comexSilverSig, basis?.silver?.signal ?? null, 0.70);
      if (comexGoldSig != null || basis?.gold?.signal != null) {
        g = clamp(b.count > 0 ? g * 0.3 + combG * 0.7 : combG, -1, 1);
      }
      if (comexSilverSig != null || basis?.silver?.signal != null) {
        s = clamp(b.count > 0 ? s * 0.3 + combS * 0.7 : combS, -1, 1);
      }
    }

    drivers[id] = {
      id,
      label: meta.label,
      shortLabel: meta.shortLabel,
      gold: +g.toFixed(3),
      silver: +s.toFixed(3),
      headlineCount: b.count,
    };
  }

  // Apply optional interactive "What-If" scenario shocks
  for (const sid of scenarioIds) {
    const preset = SCENARIO_PRESETS.find((p) => p.id === sid);
    if (!preset) continue;
    const d = drivers[preset.driver];
    if (!d) continue;
    d.gold = +clamp(d.gold + preset.goldDelta, -1, 1).toFixed(3);
    d.silver = +clamp(d.silver + preset.silverDelta, -1, 1).toFixed(3);
  }

  // Detect active market regime ('calm' vs 'stress') to select matching self-learned weights
  const vixVal = quant.macroSnapshot.vix ?? 18;
  const gvzVal = impliedVol?.gvz ?? null;
  const silverBackw = (basis?.silver?.basisUsd ?? 1) < 0;
  const comexSiRatio = comex?.silver?.paperToRegisteredRatio ?? null;
  const activeRegime =
    (Number.isFinite(gvzVal) && gvzVal >= 20) ||
    vixVal >= 21 ||
    silverBackw ||
    (Number.isFinite(comexSiRatio) && comexSiRatio >= 6.5)
      ? 'stress'
      : 'calm';

  const regimeWeightSet =
    learnedWeights?.regimeWeights?.[activeRegime] || learnedWeights?.weights || null;

  // Weighted composite news+macro driver score (uses dual-regime daily post-close self-learned weights when present)
  let goldDriverComposite = 0;
  let silverDriverComposite = 0;
  for (const [id, meta] of Object.entries(DRIVER_META)) {
    const wG = regimeWeightSet?.gold?.[id] ?? meta.goldWeight;
    const wS = regimeWeightSet?.silver?.[id] ?? meta.silverWeight;
    goldDriverComposite += drivers[id].gold * wG;
    silverDriverComposite += drivers[id].silver * wS;
  }

  // Gentle capped drift bias nudge from daily 5:10 PM ET self-learning calibration
  const driftNudgeGold = clamp((learnedWeights?.driftBiasGoldPct || 0) * 0.14, -0.06, 0.06);
  const driftNudgeSilver = clamp((learnedWeights?.driftBiasSilverPct || 0) * 0.14, -0.06, 0.06);
  const effectiveConeMult =
    coneMultiplier === 1.0 && Number.isFinite(learnedWeights?.coneMultiplier)
      ? learnedWeights.coneMultiplier
      : coneMultiplier;

  // Blend: 78% macro+news+pro drivers, 22% technical trend (+ ratio mean reversion for silver)
  const goldUnit = clamp(goldDriverComposite * 1.48 * 0.78 + quant.goldTrend * 0.22 + driftNudgeGold, -1, 1);
  const silverUnit = clamp(
    silverDriverComposite * 1.48 * 0.75 + quant.silverTrend * 0.15 + quant.ratioSignalSilver * 0.10 + driftNudgeSilver,
    -1,
    1
  );

  const goldScore = Math.round(goldUnit * 100);
  const silverScore = Math.round(silverUnit * 100);

  // Use forward-looking ^GVZ blended daily volatility when available
  const effectiveGoldDailyVol = impliedVol?.blendedGoldDailyVol || quant.goldDailyVol;
  const ivRatio =
    impliedVol?.blendedGoldDailyVol && quant.goldDailyVol > 0
      ? clamp(impliedVol.blendedGoldDailyVol / quant.goldDailyVol, 0.82, 1.32)
      : 1.0;
  const effectiveSilverDailyVol = quant.silverDailyVol * ivRatio;

  // Confidence reflects evidence breadth + agreement across drivers (capped at 86% to stay honest)
  const activeVals = Object.values(drivers).map((d) => d.gold).filter((v) => Math.abs(v) >= 0.1);
  const sameSign =
    activeVals.length > 0
      ? Math.max(
          activeVals.filter((v) => v > 0).length,
          activeVals.filter((v) => v < 0).length
        ) / activeVals.length
      : 0.5;
  const proDataPoints =
    (ry ? 2 : 0) +
    (cotGoldSig != null ? 2 : 0) +
    (minerGoldSig != null ? 2 : 0) +
    (comexGoldSig != null ? 2 : 0) +
    (impliedVol ? 1.5 : 0) +
    (etfFlows ? 1.5 : 0) +
    (crossMkt ? 1.5 : 0) +
    (basis ? 1.5 : 0);
  const breadth = Math.min(1, (scoredHeadlines.length + (quant.macroSnapshot.dxy ? 3 : 0) + proDataPoints) / 18);
  const confidence = Math.round(clamp(30 + sameSign * 30 + breadth * 26, 28, 86));

  const overallDir = goldScore > 12 ? 'bullish' : goldScore < -12 ? 'bearish' : 'mixed';
  const matchedAnalogs = matchHistoricalAnalogs(drivers, overallDir);

  const topDriverList = Object.values(drivers)
    .sort((a, b) => Math.abs(b.gold) + Math.abs(b.silver) - (Math.abs(a.gold) + Math.abs(a.silver)))
    .slice(0, 2);

  const narrative = buildNarrative({
    goldScore,
    silverScore,
    topDrivers: topDriverList,
    ratio: quant.ratio,
    headlineCount: scoredHeadlines.length,
    proSignals,
    comex,
    institutionalSignals: inst,
  });

  // Run Merton Jump-Diffusion Monte Carlo simulations (with COMEX + Event Calendar + GVZ + Basis + Carry + self-calibrated tail multipliers)
  const sharedJumpBoost =
    (eventRisk?.jumpBoost || 0) +
    (impliedVol?.jumpBoost || 0) +
    (crossMkt?.jumpBoost || 0);
  const goldCatIntensity = clamp(
    Math.abs(goldUnit) + (comex?.gold?.jumpBoost || 0) + (basis?.gold?.jumpBoost || 0) + sharedJumpBoost,
    0.15,
    1.0
  );
  const silverCatIntensity = clamp(
    Math.abs(silverUnit) + (comex?.silver?.jumpBoost || 0) + (basis?.silver?.jumpBoost || 0) + sharedJumpBoost,
    0.15,
    1.0
  );
  const lambdaMult = learnedWeights?.jumpCalibration?.lambdaMult ?? 1.0;
  const sigmaJMult = learnedWeights?.jumpCalibration?.sigmaJMult ?? 1.0;

  const goldJumpParams = estimateJumpParams({
    metal: 'gold',
    dailyVol: effectiveGoldDailyVol,
    unitScore: goldUnit,
    vix: vixVal,
    catalystIntensity: goldCatIntensity,
    coneMultiplier: effectiveConeMult,
    lambdaMult,
    sigmaJMult,
  });
  const silverJumpParams = estimateJumpParams({
    metal: 'silver',
    dailyVol: effectiveSilverDailyVol,
    unitScore: silverUnit,
    vix: vixVal,
    catalystIntensity: silverCatIntensity,
    coneMultiplier: effectiveConeMult,
    lambdaMult,
    sigmaJMult,
  });

  const goldMc7d = runJumpDiffusion({
    spot: spotGold,
    tradingDays: 5,
    paths: 1500,
    ...goldJumpParams,
    samplePathCount: 16,
    seed: 20261119,
  });
  const goldMc30d = runJumpDiffusion({
    spot: spotGold,
    tradingDays: 21,
    paths: 1500,
    ...goldJumpParams,
    samplePathCount: 16,
    seed: 20261120,
  });
  const silverMc7d = runJumpDiffusion({
    spot: spotSilver,
    tradingDays: 5,
    paths: 1500,
    ...silverJumpParams,
    samplePathCount: 16,
    seed: 20261121,
  });
  const silverMc30d = runJumpDiffusion({
    spot: spotSilver,
    tradingDays: 21,
    paths: 1500,
    ...silverJumpParams,
    samplePathCount: 16,
    seed: 20261122,
  });

  const selfLearning = learnedWeights
    ? {
        version: learnedWeights.version || 2,
        schedule: learnedWeights.schedule || '5:10 PM ET (10m after close)',
        lastLearnedDay: learnedWeights.lastLearnedDay || null,
        lastUpdatedAt: learnedWeights.lastUpdatedAt || null,
        totalCycles: learnedWeights.totalCycles || 0,
        activeRegime,
        coneMultiplier: learnedWeights.coneMultiplier ?? 1.0,
        driftBiasGoldPct: learnedWeights.driftBiasGoldPct ?? 0,
        driftBiasSilverPct: learnedWeights.driftBiasSilverPct ?? 0,
        weights: regimeWeightSet || learnedWeights.weights || null,
        regimeWeights: learnedWeights.regimeWeights || null,
        weightDeltasFromBase: learnedWeights.weightDeltasFromBase || null,
        jumpCalibration: learnedWeights.jumpCalibration || null,
        championChallenger: learnedWeights.championChallenger || null,
        summary: learnedWeights.summary || null,
        recentHistory: (learnedWeights.history || []).slice(0, 7),
      }
    : null;

  return {
    generatedAt,
    disclaimer:
      'Anonymous probabilistic scenario model combining global news (recency-weighted), FRED 10Y TIPS real yields, COMEX paper vs. registered vault contracts, CBOE ^GVZ implied volatility, GLD/SLV/PSLV flows, Copper/USD-JPY cross-markets, COMEX EFP basis, Event-Risk calendar, Shanghai SGE premiums, daily 5:10 PM ET self-learning weight calibration, and Merton Jump-Diffusion Monte Carlo simulations. Educational — not financial advice.',
    confidence,
    coneMultiplier: +effectiveConeMult.toFixed(2),
    narrative,
    gold: {
      spot: +spotGold.toFixed(2),
      score: goldScore,
      signal: signalLabelFromScore(goldScore),
      horizon7d: projectHorizon(spotGold, effectiveGoldDailyVol, goldUnit, 5, effectiveConeMult),
      horizon30d: projectHorizon(spotGold, effectiveGoldDailyVol, goldUnit, 21, effectiveConeMult),
      jumpParams: goldJumpParams,
      jumpDiffusion7d: goldMc7d,
      jumpDiffusion30d: goldMc30d,
    },
    silver: {
      spot: +spotSilver.toFixed(2),
      score: silverScore,
      signal: signalLabelFromScore(silverScore),
      horizon7d: projectHorizon(spotSilver, effectiveSilverDailyVol, silverUnit, 5, effectiveConeMult),
      horizon30d: projectHorizon(spotSilver, effectiveSilverDailyVol, silverUnit, 21, effectiveConeMult),
      jumpParams: silverJumpParams,
      jumpDiffusion7d: silverMc7d,
      jumpDiffusion30d: silverMc30d,
    },
    drivers: Object.values(drivers),
    macroSnapshot: quant.macroSnapshot,
    goldSilverRatio: quant.ratio,
    shanghai,
    comex,
    proSignals,
    institutionalSignals: institutionalSignals || null,
    selfLearning,
    accuracy,
    matchedAnalogs,
    headlines: scoredHeadlines.slice(0, 12),
  };
}

function buildNarrative({ goldScore, silverScore, topDrivers, ratio, headlineCount, proSignals, comex, institutionalSignals }) {
  const gLabel = signalLabelFromScore(goldScore).toLowerCase();
  const sLabel = signalLabelFromScore(silverScore).toLowerCase();
  const lead = topDrivers
    .filter((d) => Math.abs(d.gold) >= 0.08 || Math.abs(d.silver) >= 0.08)
    .map((d) => d.label)
    .join(' and ');

  const driverPhrase = lead
    ? `Primary active drivers: ${lead}.`
    : 'Macro and news drivers are balanced without a single dominant catalyst.';

  const extras = [];
  if (comex?.gold?.paperToRegisteredRatio && comex?.silver?.paperToRegisteredRatio) {
    extras.push(
      `COMEX paper claims stand at ${comex.gold.paperToRegisteredRatio}:1 for Gold (${comex.gold.openInterestContracts.toLocaleString('en-US')} GC) and ${comex.silver.paperToRegisteredRatio}:1 for Silver (${comex.silver.openInterestContracts.toLocaleString('en-US')} SI) vs. registered vaults.`
    );
  }
  if (institutionalSignals?.eventRisk?.nextEvent) {
    const ev = institutionalSignals.eventRisk.nextEvent;
    extras.push(`Next high-vol catalyst: ${ev.title} in ${ev.daysUntil}d (${ev.date}).`);
  }
  if (institutionalSignals?.impliedVol?.gvz != null) {
    extras.push(`Options ^GVZ implied vol is ${institutionalSignals.impliedVol.gvz}% (${institutionalSignals.impliedVol.regime}).`);
  }
  if (institutionalSignals?.basis?.silver?.basisUsd < 0) {
    extras.push(`COMEX Silver futures sit in backwardation (${institutionalSignals.basis.silver.basisUsd.toFixed(2)}/oz vs spot), signaling immediate physical tightness.`);
  }
  if (proSignals?.realYields?.realYield10yPct != null) {
    extras.push(`10Y TIPS real yield sits at ${proSignals.realYields.realYield10yPct}% (${proSignals.realYields.realDelta5dBps >= 0 ? '+' : ''}${proSignals.realYields.realDelta5dBps} bps 5d).`);
  }
  if (ratio >= 86) {
    extras.push(`Gold/Silver ratio (${ratio.toFixed(1)}:1) sits elevated, historically favoring Silver catch-up.`);
  }

  return `Anonymous model signals a ${gLabel} tilt for Gold and ${sLabel} tilt for Silver across ${headlineCount} deduplicated news clusters. ${driverPhrase}${extras.length ? ' ' + extras.join(' ') : ''}`;
}
