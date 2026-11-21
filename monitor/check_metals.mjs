#!/usr/bin/env node
/**
 * Bullion Pulse — 24/7 Background Spot Gold & Silver Alert Monitor
 * Zero external dependencies (requires Node.js 20+ for built-in fetch).
 *
 * Environment variables:
 *   NTFY_TOPIC            (required unless --dry-run) Your private ntfy.sh topic
 *   NTFY_SERVER           (optional, default: https://ntfy.sh)
 *   NTFY_TOKEN            (optional, Bearer token for protected/self-hosted topics)
 *   GOLD_THRESHOLD_PCT    (optional, default: 1.5)
 *   SILVER_THRESHOLD_PCT  (optional, default: 3.0)
 *   ALERT_DIRECTION       (optional, default: both | up | down)
 *   ESCALATION_STEP_PCT   (optional, default: 1.0) Re-alert if move deepens by this %
 *   APP_URL               (optional) Click-through URL to your hosted Bullion Pulse PWA
 *   STATE_FILE            (optional, default: monitor/state.json)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchShanghaiMetals } from './shanghai.mjs';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) BullionPulseMonitor/1.0';

/* ---------- Feed Parsers ---------- */

export function parseGoldPriceOrg(data) {
  const item = data?.items?.[0];
  if (!item || typeof item.xauPrice !== 'number' || typeof item.xagPrice !== 'number') {
    throw new Error('Invalid goldprice.org response');
  }
  return {
    source: 'goldprice.org',
    timestamp: data.date || new Date().toISOString(),
    gold: {
      symbol: 'XAU',
      name: 'Gold',
      price: item.xauPrice,
      prevClose: item.xauClose ?? item.xauPrice - (item.chgXau || 0),
      chg: item.chgXau ?? 0,
      pct: item.pcXau ?? 0,
    },
    silver: {
      symbol: 'XAG',
      name: 'Silver',
      price: item.xagPrice,
      prevClose: item.xagClose ?? item.xagPrice - (item.chgXag || 0),
      chg: item.chgXag ?? 0,
      pct: item.pcXag ?? 0,
    },
  };
}

export function parseYahooChart(data, symbol, name) {
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const prevClose = meta?.chartPreviousClose ?? meta?.previousClose;
  if (typeof price !== 'number' || typeof prevClose !== 'number' || prevClose === 0) {
    throw new Error(`Invalid Yahoo Finance chart response for ${symbol}`);
  }
  const chg = price - prevClose;
  const pct = (chg / prevClose) * 100;
  return { symbol, name, price, prevClose, chg, pct };
}

export function parseGoldApiQuotes(xauJson, xagJson, prevCloses = {}) {
  const gPrice = Number(xauJson?.price);
  const sPrice = Number(xagJson?.price);
  if (!Number.isFinite(gPrice) || gPrice <= 0 || !Number.isFinite(sPrice) || sPrice <= 0) {
    throw new Error('Invalid gold-api.com response');
  }
  const gPrev = Number.isFinite(Number(prevCloses.gold)) && Number(prevCloses.gold) > 0 ? Number(prevCloses.gold) : gPrice;
  const sPrev = Number.isFinite(Number(prevCloses.silver)) && Number(prevCloses.silver) > 0 ? Number(prevCloses.silver) : sPrice;
  const gChg = +(gPrice - gPrev).toFixed(2);
  const sChg = +(sPrice - sPrev).toFixed(2);
  return {
    source: 'gold-api.com',
    timestamp: xauJson?.updatedAt || new Date().toISOString(),
    gold: {
      symbol: 'XAU',
      name: 'Gold',
      price: +gPrice.toFixed(2),
      prevClose: +gPrev.toFixed(2),
      chg: gChg,
      pct: gPrev > 0 ? +((gChg / gPrev) * 100).toFixed(4) : 0,
    },
    silver: {
      symbol: 'XAG',
      name: 'Silver',
      price: +sPrice.toFixed(2),
      prevClose: +sPrev.toFixed(2),
      chg: sChg,
      pct: sPrev > 0 ? +((sChg / sPrev) * 100).toFixed(4) : 0,
    },
  };
}

export async function fetchSpotPrices(fetchImpl = fetch) {
  // Primary: goldprice.org spot USD feed (XAU + XAG with daily % change)
  try {
    const res = await fetchImpl('https://data-asg.goldprice.org/dbXRates/USD', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseGoldPriceOrg(await res.json());
  } catch (primaryErr) {
    console.warn(`Primary feed failed (${primaryErr.message}), trying gold-api.com spot fallback…`);
  }

  // Secondary: gold-api.com live XAU/XAG spot (using Yahoo chartPreviousClose or candles_1d session open for daily % change)
  try {
    const [xauRes, xagRes] = await Promise.all([
      fetchImpl('https://api.gold-api.com/price/XAU', {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      }),
      fetchImpl('https://api.gold-api.com/price/XAG', {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      }),
    ]);
    if (xauRes.ok && xagRes.ok) {
      const [xauJson, xagJson] = await Promise.all([xauRes.json(), xagRes.json()]);
      const prevCloses = {};
      try {
        const [gYRes, sYRes] = await Promise.all([
          fetchImpl('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=5m', {
            headers: { 'User-Agent': USER_AGENT },
          }),
          fetchImpl('https://query1.finance.yahoo.com/v8/finance/chart/SI=F?range=1d&interval=5m', {
            headers: { 'User-Agent': USER_AGENT },
          }),
        ]);
        if (gYRes.ok) {
          const gMeta = (await gYRes.json())?.chart?.result?.[0]?.meta;
          prevCloses.gold = gMeta?.chartPreviousClose ?? gMeta?.previousClose;
        }
        if (sYRes.ok) {
          const sMeta = (await sYRes.json())?.chart?.result?.[0]?.meta;
          prevCloses.silver = sMeta?.chartPreviousClose ?? sMeta?.previousClose;
        }
      } catch {
        // Optional prevClose enrichment failed; try local candles_1d.json
      }
      if (!prevCloses.gold || !prevCloses.silver) {
        try {
          const rawC = JSON.parse(await fs.readFile(path.resolve('data/candles_1d.json'), 'utf8'));
          if (!prevCloses.gold && rawC?.gold?.[0]?.o > 0) prevCloses.gold = rawC.gold[0].o;
          if (!prevCloses.silver && rawC?.silver?.[0]?.o > 0) prevCloses.silver = rawC.silver[0].o;
        } catch {
          // Optional local candles unavailable
        }
      }
      return parseGoldApiQuotes(xauJson, xagJson, prevCloses);
    }
  } catch (secErr) {
    console.warn(`gold-api.com fallback failed (${secErr.message}), trying Yahoo Finance…`);
  }

  // Final fallback: Yahoo Finance COMEX continuous futures (GC=F & SI=F)
  const [goldRes, silverRes] = await Promise.all([
    fetchImpl('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=5m', {
      headers: { 'User-Agent': USER_AGENT },
    }),
    fetchImpl('https://query1.finance.yahoo.com/v8/finance/chart/SI=F?range=1d&interval=5m', {
      headers: { 'User-Agent': USER_AGENT },
    }),
  ]);
  if (!goldRes.ok || !silverRes.ok) {
    throw new Error(`Fallback Yahoo feed failed (${goldRes.status}/${silverRes.status})`);
  }
  const [goldJson, silverJson] = await Promise.all([goldRes.json(), silverRes.json()]);
  return {
    source: 'Yahoo Finance (GC=F / SI=F)',
    timestamp: new Date().toISOString(),
    gold: parseYahooChart(goldJson, 'XAU', 'Gold'),
    silver: parseYahooChart(silverJson, 'XAG', 'Silver'),
  };
}

/* ---------- Alert Evaluation Logic ---------- */

export function evaluateMetalAlert({
  quote,
  thresholdPct,
  directionRule = 'both',
  escalationStepPct = 1.0,
  prevAlert = null,
  dayKey,
  requireConfirmation = false,
  pendingAlert = null,
}) {
  const absPct = Math.abs(quote.pct);
  if (absPct < thresholdPct) {
    return {
      shouldAlert: false,
      reason: 'below_threshold',
      nextPending: pendingAlert ? null : undefined,
    };
  }

  const dir = quote.pct >= 0 ? 'up' : 'down';
  if (directionRule === 'up' && dir !== 'up') {
    return { shouldAlert: false, reason: 'direction_filtered' };
  }
  if (directionRule === 'down' && dir !== 'down') {
    return { shouldAlert: false, reason: 'direction_filtered' };
  }

  // Same trading day deduplication & escalation
  if (prevAlert && prevAlert.day === dayKey) {
    if (prevAlert.dir === dir && absPct < prevAlert.absPct + escalationStepPct) {
      return { shouldAlert: false, reason: 'already_alerted_today' };
    }
    const kind = prevAlert.dir !== dir ? 'reversal' : 'escalation';
    return {
      shouldAlert: true,
      kind,
      dir,
      absPct,
      nextState: { day: dayKey, dir, absPct },
      nextPending: null,
    };
  }

  // Optional 2-check confirmation filters out brief single-tick stop-hunt wicks
  const isExtremeSpike = absPct >= thresholdPct * 1.65;
  if (requireConfirmation && !isExtremeSpike) {
    if (!pendingAlert || pendingAlert.day !== dayKey || pendingAlert.dir !== dir) {
      return {
        shouldAlert: false,
        reason: 'pending_confirmation',
        nextPending: { day: dayKey, dir, hits: 1 },
      };
    }
  }

  return {
    shouldAlert: true,
    kind: 'initial',
    dir,
    absPct,
    nextState: { day: dayKey, dir, absPct },
    nextPending: null,
  };
}

export function formatNtfyPayload({
  topic,
  quote,
  ratio,
  thresholdPct,
  kind,
  dir,
  appUrl,
}) {
  const sign = quote.pct >= 0 ? '+' : '';
  const chgSign = quote.chg >= 0 ? '+' : '-';
  const verb = dir === 'up' ? 'UP' : 'DOWN';
  const isExtreme = Math.abs(quote.pct) >= thresholdPct * 2;

  const prefix =
    kind === 'escalation'
      ? 'EXTENDED MOVE: '
      : kind === 'reversal'
        ? 'REVERSAL: '
        : '';

  const title = `${prefix}${quote.name} (${quote.symbol}) ${verb} ${sign}${quote.pct.toFixed(2)}%`;

  const lines = [
    `Spot: $${quote.price.toFixed(2)}/oz (${chgSign}$${Math.abs(quote.chg).toFixed(2)} today)`,
    `Prev Close: $${quote.prevClose.toFixed(2)}/oz`,
    `Alert Rule: ±${thresholdPct}% daily move`,
  ];
  if (ratio) {
    lines.push(`Gold/Silver Ratio: ${ratio.toFixed(1)} : 1`);
  }

  const payload = {
    topic,
    title,
    message: lines.join('\n'),
    priority: isExtreme ? 5 : 4,
    tags:
      dir === 'up'
        ? ['chart_with_upwards_trend', 'coin']
        : ['chart_with_downwards_trend', 'warning'],
  };

  if (appUrl) {
    payload.click = appUrl;
  }

  return payload;
}

export function evaluateShanghaiPremiumAlert({
  premiumUsdOz,
  thresholdUsd = 35,
  escalationStepUsd = 15,
  prevAlert = null,
  dayKey,
}) {
  if (typeof premiumUsdOz !== 'number' || !Number.isFinite(premiumUsdOz)) {
    return { shouldAlert: false, reason: 'missing_premium' };
  }
  const absPrem = Math.abs(premiumUsdOz);
  if (absPrem < thresholdUsd) {
    return { shouldAlert: false, reason: 'below_threshold' };
  }
  const dir = premiumUsdOz >= 0 ? 'premium' : 'discount';
  if (prevAlert && prevAlert.day === dayKey) {
    if (prevAlert.dir === dir && absPrem < prevAlert.absPrem + escalationStepUsd) {
      return { shouldAlert: false, reason: 'already_alerted_today' };
    }
    const kind = prevAlert.dir !== dir ? 'reversal' : 'escalation';
    return { shouldAlert: true, kind, dir, absPrem, nextState: { day: dayKey, dir, absPrem } };
  }
  return { shouldAlert: true, kind: 'initial', dir, absPrem, nextState: { day: dayKey, dir, absPrem } };
}

export function formatShanghaiNtfyPayload({
  topic,
  shanghai,
  thresholdUsd,
  kind,
  dir,
  appUrl,
}) {
  const prem = shanghai.gold.premiumUsdOz;
  const sign = prem >= 0 ? '+' : '-';
  const label = dir === 'premium' ? 'PREMIUM' : 'DISCOUNT';
  const prefix = kind === 'escalation' ? 'WIDENING ' : kind === 'reversal' ? 'FLIP: ' : '';

  const payload = {
    topic,
    title: `${prefix}Shanghai Gold ${label}: ${sign}$${Math.abs(prem).toFixed(2)}/oz`,
    message:
      `SGE ${shanghai.gold.contract}: ¥${shanghai.gold.cnyPerG.toFixed(2)}/g ($${shanghai.gold.usdPerOz.toFixed(2)}/oz)\n` +
      `SGE ${shanghai.silver.contract}: ¥${Math.round(shanghai.silver.cnyPerKg)}/kg ($${shanghai.silver.usdPerOz.toFixed(2)}/oz incl. VAT)\n` +
      `FX USD/CNY: ${shanghai.usdCny.toFixed(4)} · Alert Rule: ±$${thresholdUsd}/oz`,
    priority: Math.abs(prem) >= thresholdUsd * 1.75 ? 5 : 4,
    tags: dir === 'premium' ? ['fire', 'coin'] : ['snowflake', 'coin'],
  };
  if (appUrl) payload.click = appUrl;
  return payload;
}

export function evaluatePriceTargets({
  goldPrice,
  silverPrice,
  ratio,
  targets = {},
  prevTargetsState = {},
  dayKey,
}) {
  const rules = [
    { id: 'goldAbove', label: 'Gold (XAU)', symbol: 'XAU', val: goldPrice, target: Number(targets.goldAbove), op: 'gte', fmt: (v) => `$${v.toFixed(2)}/oz`, dir: 'up' },
    { id: 'goldBelow', label: 'Gold (XAU)', symbol: 'XAU', val: goldPrice, target: Number(targets.goldBelow), op: 'lte', fmt: (v) => `$${v.toFixed(2)}/oz`, dir: 'down' },
    { id: 'silverAbove', label: 'Silver (XAG)', symbol: 'XAG', val: silverPrice, target: Number(targets.silverAbove), op: 'gte', fmt: (v) => `$${v.toFixed(2)}/oz`, dir: 'up' },
    { id: 'silverBelow', label: 'Silver (XAG)', symbol: 'XAG', val: silverPrice, target: Number(targets.silverBelow), op: 'lte', fmt: (v) => `$${v.toFixed(2)}/oz`, dir: 'down' },
    { id: 'ratioAbove', label: 'Au/Ag Ratio', symbol: 'AU/AG', val: ratio, target: Number(targets.ratioAbove), op: 'gte', fmt: (v) => `${v.toFixed(1)}:1`, dir: 'up' },
    { id: 'ratioBelow', label: 'Au/Ag Ratio', symbol: 'AU/AG', val: ratio, target: Number(targets.ratioBelow), op: 'lte', fmt: (v) => `${v.toFixed(1)}:1`, dir: 'down' },
  ];
  const triggered = [];
  const nextState = { ...(prevTargetsState || {}) };
  for (const r of rules) {
    if (!Number.isFinite(r.target) || r.target <= 0 || !Number.isFinite(r.val)) continue;
    const hit = r.op === 'gte' ? r.val >= r.target : r.val <= r.target;
    if (!hit) continue;
    if (nextState[r.id] === dayKey) continue;
    nextState[r.id] = dayKey;
    triggered.push({
      id: r.id,
      symbol: r.symbol,
      dir: r.dir,
      title: `${r.label} Target Hit (${r.op === 'gte' ? '≥' : '≤'} ${r.fmt(r.target)})`,
      message: `${r.label} reached ${r.fmt(r.val)} (your target rule: ${r.op === 'gte' ? '≥' : '≤'} ${r.fmt(r.target)}).`,
    });
  }
  return { triggered, nextState };
}

/**
 * Checks whether `nowDate` falls inside the configured quiet hours window (e.g. 22 -> 7 ET).
 * Supports overnight wrap-around windows (startHour > endHour) and daytime windows.
 */
export function isQuietHours(nowDate = new Date(), startHour = null, endHour = null, timeZone = 'America/New_York') {
  if (startHour === null || startHour === '' || startHour === undefined) return false;
  if (endHour === null || endHour === '' || endHour === undefined) return false;
  const s = Number(startHour);
  const e = Number(endHour);
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || s > 23 || e < 0 || e > 23 || s === e) {
    return false;
  }
  const d = nowDate instanceof Date ? nowDate : new Date(nowDate);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hourVal = Number(parts.find((p) => p.type === 'hour')?.value ?? d.getUTCHours()) % 24;
  if (s < e) {
    return hourVal >= s && hourVal < e;
  }
  // Overnight wrap (e.g. 22:00 through 07:00)
  return hourVal >= s || hourVal < e;
}

/**
 * Evaluates smart regime alerts (COMEX Backwardation flip, Short Squeeze >= 65, DXY Dollar Shock).
 * Deduplicated once per dayKey per alert type.
 */
export function evaluateRegimeAlerts({
  outlook = null,
  prevRegimeState = {},
  rules = {},
  dayKey,
}) {
  const triggered = [];
  const nextState = { ...(prevRegimeState || {}) };
  if (!outlook) return { triggered, nextState };

  const enableBackw = rules.backwardation !== false;
  const enableSqueeze = rules.shortSqueeze !== false;
  const enableDxy = rules.dxyShock !== false;
  const dxyThresholdPct = Number.isFinite(Number(rules.dxyShockPct)) ? Number(rules.dxyShockPct) : 0.8;

  // 1. COMEX Spot-to-Futures Backwardation Flip
  if (enableBackw) {
    const bg = outlook.institutionalSignals?.basis?.gold;
    const bs = outlook.institutionalSignals?.basis?.silver;
    const gBackw = Boolean(bg?.isBackwardation || (typeof bg?.basisUsd === 'number' && bg.basisUsd < 0));
    const sBackw = Boolean(bs?.isBackwardation || (typeof bs?.basisUsd === 'number' && bs.basisUsd < 0));
    if (gBackw && nextState.backw_gold !== dayKey) {
      nextState.backw_gold = dayKey;
      triggered.push({
        id: 'backw_gold',
        dir: 'up',
        priority: 4,
        tags: ['fire', 'coin'],
        title: `COMEX Gold Backwardation Active (${bg.basisUsd.toFixed(2)}/oz)`,
        message: `GC=F futures dropped below Gold Spot ($${bg.futures} vs $${bg.spot}). Downward-sloping curve lifts upside price discovery.`,
      });
    }
    if (sBackw && nextState.backw_silver !== dayKey) {
      nextState.backw_silver = dayKey;
      triggered.push({
        id: 'backw_silver',
        dir: 'up',
        priority: 4,
        tags: ['fire', 'coin'],
        title: `COMEX Silver Backwardation Active (${bs.basisUsd.toFixed(2)}/oz)`,
        message: `SI=F futures dropped below Silver Spot ($${bs.futures} vs $${bs.spot}). Physical delivery tightness lifts upside price discovery.`,
      });
    }
  }

  // 2. Short Squeeze Alert (squeezeScore >= 65 or Short Squeeze / Hybrid label)
  if (enableSqueeze) {
    for (const metal of ['gold', 'silver']) {
      const reg = outlook.marketRegime?.[metal] || outlook[metal]?.regime;
      if (!reg) continue;
      const isSqz =
        (Number.isFinite(reg.squeezeScore) && reg.squeezeScore >= 65) ||
        reg.key === 'squeeze' ||
        reg.key === 'hybrid';
      const stateKey = `squeeze_${metal}`;
      if (isSqz && nextState[stateKey] !== dayKey) {
        nextState[stateKey] = dayKey;
        const mName = metal === 'gold' ? 'Gold' : 'Silver';
        triggered.push({
          id: stateKey,
          dir: 'up',
          priority: reg.squeezeScore >= 75 ? 5 : 4,
          tags: ['zap', 'coin'],
          title: `${mName} ${reg.label} Alert (${reg.discoveryScore}D/${reg.squeezeScore}S)`,
          message: `Mechanical squeeze pressure on ${mName} reached ${reg.squeezeScore}/100 (Discovery ${reg.discoveryScore}/100). Elevated gamma/short-covering breakout risk.`,
        });
      }
    }
  }

  // 3. US Dollar (DXY) Shock Alert
  if (enableDxy) {
    const ds = outlook.dollarStrength || outlook.macroSnapshot || null;
    const dxy5d = Number(ds?.dxy5dPct);
    const dxyLevel = Number(ds?.dxy);
    if (Number.isFinite(dxy5d) && Math.abs(dxy5d) >= dxyThresholdPct && nextState.dxy_shock !== dayKey) {
      nextState.dxy_shock = dayKey;
      const usdUp = dxy5d > 0;
      const gFx = outlook.dollarStrength?.impact7d?.goldUsdOz;
      const fxNote = Number.isFinite(gFx) ? ` Est. 7d Gold FX impact: ${gFx >= 0 ? '+' : '-'}$${Math.abs(gFx).toFixed(2)}/oz.` : '';
      triggered.push({
        id: 'dxy_shock',
        dir: usdUp ? 'down' : 'up',
        priority: Math.abs(dxy5d) >= dxyThresholdPct * 2 ? 5 : 4,
        tags: usdUp ? ['dollar', 'warning'] : ['dollar', 'chart_with_upwards_trend'],
        title: `US Dollar (DXY) ${usdUp ? 'Surge' : 'Drop'} ${usdUp ? '+' : ''}${dxy5d.toFixed(2)}% (5d)`,
        message: `DXY moved to ${Number.isFinite(dxyLevel) ? dxyLevel.toFixed(2) : '—'} (${outlook.dollarStrength?.regime || 'FX Shift'}).${fxNote}`,
      });
    }
  }

  return { triggered, nextState };
}

/* ---------- State & Publishing ---------- */

async function readState(statePath) {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { XAU: null, XAG: null, SGE_AU_PREM: null };
  }
}

async function writeState(statePath, state) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

async function sendNtfy(serverUrl, payload, token) {
  const endpoint = serverUrl.replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ntfy publish failed (${res.status}): ${errText}`);
  }
  return res.json().catch(() => ({}));
}

export function buildMorningDigestPayload({
  topic,
  market,
  shanghai = null,
  outlook = null,
  appUrl = '',
}) {
  const g = market.gold;
  const s = market.silver;
  const ratio = s.price > 0 ? g.price / s.price : 0;
  const gSign = g.pct >= 0 ? '+' : '';
  const sSign = s.pct >= 0 ? '+' : '';

  const lines = [
    `Gold: $${g.price.toFixed(2)}/oz (${gSign}${g.pct.toFixed(2)}%)`,
    `Silver: $${s.price.toFixed(2)}/oz (${sSign}${s.pct.toFixed(2)}%)`,
    `Gold/Silver Ratio: ${ratio.toFixed(1)} : 1${outlook?.ratioAnalytics?.swapBias ? ` (${outlook.ratioAnalytics.swapBias})` : ''}`,
  ];
  if (shanghai?.gold?.premiumUsdOz != null) {
    const prem = shanghai.gold.premiumUsdOz;
    lines.push(`China Gold vs US/London: ${prem >= 0 ? '+' : '-'}$${Math.abs(prem).toFixed(2)}/oz`);
  }
  if (outlook?.dollarStrength?.dxy != null) {
    lines.push(
      `US Dollar: ${outlook.dollarStrength.dxy.toFixed(2)} (${outlook.dollarStrength.score}/100 · ${outlook.dollarStrength.regime})`
    );
  }
  if (outlook?.setupQuality?.gold && outlook?.setupQuality?.silver) {
    lines.push(`Gold Setup: ${outlook.setupQuality.gold.label} (${outlook.setupQuality.gold.score}/100)`);
    lines.push(`Silver Setup: ${outlook.setupQuality.silver.label} (${outlook.setupQuality.silver.score}/100)`);
  }

  return {
    topic: topic || 'dry-run-topic',
    title: `Good Morning · Gold $${Math.round(g.price).toLocaleString('en-US')} | Silver $${s.price.toFixed(2)}`,
    message: lines.join('\n'),
    priority: 3,
    tags: ['sunrise', 'coin'],
    ...(appUrl ? { click: appUrl } : {}),
  };
}

/* ---------- Main Runner ---------- */

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const sendTest = args.has('--test');
  const sendDigest = args.has('--digest');

  const ntfyTopic = (process.env.NTFY_TOPIC || '').trim();
  const ntfyServer = (process.env.NTFY_SERVER || 'https://ntfy.sh').trim();
  const ntfyToken = (process.env.NTFY_TOKEN || '').trim();
  const goldThreshold = parseFloat(process.env.GOLD_THRESHOLD_PCT || '1.5');
  const silverThreshold = parseFloat(process.env.SILVER_THRESHOLD_PCT || '3.0');
  const shanghaiPremThreshold = parseFloat(process.env.SHANGHAI_PREMIUM_THRESHOLD_USD || '35');
  const directionRule = (process.env.ALERT_DIRECTION || 'both').trim().toLowerCase();
  const escalationStep = parseFloat(process.env.ESCALATION_STEP_PCT || '1.0');
  const requireConfirmation = (process.env.CONFIRM_MOVES || '').trim().toLowerCase() === 'true';
  const quietStart = process.env.QUIET_HOURS_START ?? '';
  const quietEnd = process.env.QUIET_HOURS_END ?? '';
  const quietActive = isQuietHours(new Date(), quietStart, quietEnd);
  const appUrl = (process.env.APP_URL || '').trim();
  const statePath = process.env.STATE_FILE || path.resolve('monitor/state.json');

  if (!dryRun && !ntfyTopic) {
    console.error('Error: NTFY_TOPIC environment variable is required (or pass --dry-run).');
    process.exit(1);
  }

  const market = await fetchSpotPrices();
  const ratio = market.gold.price / market.silver.price;
  const dayKey = new Date().toISOString().slice(0, 10);

  let shanghai = null;
  try {
    shanghai = await fetchShanghaiMetals({
      westernGoldUsdOz: market.gold.price,
      westernSilverUsdOz: market.silver.price,
    });
  } catch (err) {
    console.warn(`  Shanghai SGE check skipped: ${err.message}`);
  }

  console.log(`[${market.source}] ${market.timestamp}`);
  console.log(
    `  Gold   (XAU): $${market.gold.price.toFixed(2)}/oz (${market.gold.pct >= 0 ? '+' : ''}${market.gold.pct.toFixed(2)}%) | threshold ±${goldThreshold}%`
  );
  console.log(
    `  Silver (XAG): $${market.silver.price.toFixed(2)}/oz (${market.silver.pct >= 0 ? '+' : ''}${market.silver.pct.toFixed(2)}%) | threshold ±${silverThreshold}%`
  );
  console.log(`  Au/Ag Ratio : ${ratio.toFixed(1)} : 1`);
  if (shanghai) {
    console.log(
      `  Shanghai SGE: ${shanghai.gold.contract} ¥${shanghai.gold.cnyPerG}/g (prem ${shanghai.gold.premiumUsdOz >= 0 ? '+' : ''}$${shanghai.gold.premiumUsdOz}/oz | threshold ±$${shanghaiPremThreshold})`
    );
  }

  if (sendTest) {
    const sgeLine = shanghai
      ? `\nShanghai ${shanghai.gold.contract}: ¥${shanghai.gold.cnyPerG}/g (prem ${shanghai.gold.premiumUsdOz >= 0 ? '+' : ''}$${shanghai.gold.premiumUsdOz}/oz)`
      : '';
    const testPayload = {
      topic: ntfyTopic || 'dry-run-topic',
      title: 'Bullion Pulse Monitor Active',
      message:
        `Test alert from your scheduled monitor.\n` +
        `Gold: $${market.gold.price.toFixed(2)}/oz (${market.gold.pct >= 0 ? '+' : ''}${market.gold.pct.toFixed(2)}%)\n` +
        `Silver: $${market.silver.price.toFixed(2)}/oz (${market.silver.pct >= 0 ? '+' : ''}${market.silver.pct.toFixed(2)}%)${sgeLine}\n` +
        `Rules: ±${goldThreshold}% XAU · ±${silverThreshold}% XAG · ±$${shanghaiPremThreshold} SGE`,
      priority: 4,
      tags: ['white_check_mark', 'coin'],
      ...(appUrl ? { click: appUrl } : {}),
    };

    if (dryRun) {
      console.log('DRY RUN test payload:', JSON.stringify(testPayload, null, 2));
    } else {
      await sendNtfy(ntfyServer, testPayload, ntfyToken);
      console.log(`Test push sent to ${ntfyServer}/${ntfyTopic}`);
    }
    return;
  }

  if (sendDigest) {
    let outlookDigest = null;
    try {
      outlookDigest = JSON.parse(await fs.readFile(path.resolve('data/outlook.json'), 'utf8'));
    } catch {
      // Optional outlook snapshot unavailable
    }
    const digestPayload = buildMorningDigestPayload({
      topic: ntfyTopic || 'dry-run-topic',
      market,
      shanghai,
      outlook: outlookDigest,
      appUrl,
    });
    if (dryRun) {
      console.log('DRY RUN morning digest payload:', JSON.stringify(digestPayload, null, 2));
    } else {
      await sendNtfy(ntfyServer, digestPayload, ntfyToken);
      console.log(`Morning digest sent to ${ntfyServer}/${ntfyTopic}`);
    }
    return;
  }

  const alertState = await readState(statePath);
  if (!alertState.pending) alertState.pending = {};
  const checks = [
    { key: 'XAU', quote: market.gold, threshold: goldThreshold },
    { key: 'XAG', quote: market.silver, threshold: silverThreshold },
  ];

  let stateChanged = false;
  for (const { key, quote, threshold } of checks) {
    const evaluation = evaluateMetalAlert({
      quote,
      thresholdPct: threshold,
      directionRule,
      escalationStepPct: escalationStep,
      prevAlert: alertState[key],
      dayKey,
      requireConfirmation,
      pendingAlert: alertState.pending[key] || null,
    });

    if (!dryRun && evaluation.nextPending !== undefined) {
      if (evaluation.nextPending) alertState.pending[key] = evaluation.nextPending;
      else delete alertState.pending[key];
      stateChanged = true;
    }

    if (!evaluation.shouldAlert) {
      console.log(`  ${key}: no alert (${evaluation.reason})`);
      continue;
    }

    const isExtremeMove = Math.abs(quote.pct) >= threshold * 2;
    if (quietActive && !isExtremeMove) {
      console.log(`  ${key}: suppressed by quiet hours (${quietStart}:00-${quietEnd}:00 ET; extreme ≥2x still breaks through)`);
      continue;
    }

    const payload = formatNtfyPayload({
      topic: ntfyTopic || 'dry-run-topic',
      quote,
      ratio,
      thresholdPct: threshold,
      kind: evaluation.kind,
      dir: evaluation.dir,
      appUrl,
    });

    if (dryRun) {
      console.log(`  ${key}: DRY RUN would send ->`, JSON.stringify(payload));
    } else {
      await sendNtfy(ntfyServer, payload, ntfyToken);
      console.log(`  ${key}: alert sent (${evaluation.kind}) -> ${payload.title}`);
      alertState[key] = evaluation.nextState;
      delete alertState.pending[key];
      stateChanged = true;
    }
  }

  // Evaluate Shanghai Gold Premium Alert
  if (shanghai && shanghaiPremThreshold > 0) {
    const sgeEval = evaluateShanghaiPremiumAlert({
      premiumUsdOz: shanghai.gold.premiumUsdOz,
      thresholdUsd: shanghaiPremThreshold,
      escalationStepUsd: 15,
      prevAlert: alertState.SGE_AU_PREM,
      dayKey,
    });

    if (!sgeEval.shouldAlert) {
      console.log(`  SGE_AU_PREM: no alert (${sgeEval.reason})`);
    } else if (quietActive && Math.abs(shanghai.gold.premiumUsdOz) < shanghaiPremThreshold * 1.75) {
      console.log(`  SGE_AU_PREM: suppressed by quiet hours`);
    } else {
      const payload = formatShanghaiNtfyPayload({
        topic: ntfyTopic || 'dry-run-topic',
        shanghai,
        thresholdUsd: shanghaiPremThreshold,
        kind: sgeEval.kind,
        dir: sgeEval.dir,
        appUrl,
      });
      if (dryRun) {
        console.log('  SGE_AU_PREM: DRY RUN would send ->', JSON.stringify(payload));
      } else {
        await sendNtfy(ntfyServer, payload, ntfyToken);
        console.log(`  SGE_AU_PREM: alert sent (${sgeEval.kind}) -> ${payload.title}`);
        alertState.SGE_AU_PREM = sgeEval.nextState;
        stateChanged = true;
      }
    }
  }

  // Evaluate Custom Absolute USD & Ratio Price Targets
  const tgtEval = evaluatePriceTargets({
    goldPrice: market.gold.price,
    silverPrice: market.silver.price,
    ratio,
    targets: {
      goldAbove: process.env.GOLD_ABOVE_USD,
      goldBelow: process.env.GOLD_BELOW_USD,
      silverAbove: process.env.SILVER_ABOVE_USD,
      silverBelow: process.env.SILVER_BELOW_USD,
      ratioAbove: process.env.RATIO_ABOVE,
      ratioBelow: process.env.RATIO_BELOW,
    },
    prevTargetsState: alertState.TARGETS || {},
    dayKey,
  });
  for (const hit of tgtEval.triggered) {
    if (quietActive) {
      console.log(`  TARGET (${hit.id}): suppressed by quiet hours`);
      continue;
    }
    const payload = {
      topic: ntfyTopic || 'dry-run-topic',
      title: hit.title,
      message: `${hit.message}\nAu: $${market.gold.price.toFixed(2)} · Ag: $${market.silver.price.toFixed(2)} · Ratio: ${ratio.toFixed(1)}:1`,
      priority: 4,
      tags: hit.dir === 'up' ? ['dart', 'coin'] : ['warning', 'coin'],
      ...(appUrl ? { click: appUrl } : {}),
    };
    if (dryRun) {
      console.log(`  TARGET (${hit.id}): DRY RUN ->`, JSON.stringify(payload));
    } else {
      await sendNtfy(ntfyServer, payload, ntfyToken);
      console.log(`  TARGET (${hit.id}): alert sent -> ${payload.title}`);
      alertState.TARGETS = tgtEval.nextState;
      stateChanged = true;
    }
  }

  // Evaluate Smart Regime Alerts (COMEX Backwardation, Short Squeeze, DXY Shock)
  let outlookData = null;
  try {
    outlookData = JSON.parse(await fs.readFile(path.resolve('data/outlook.json'), 'utf8'));
  } catch {
    // Optional outlook snapshot not available
  }
  if (outlookData) {
    const regimeEval = evaluateRegimeAlerts({
      outlook: outlookData,
      prevRegimeState: alertState.REGIME || {},
      rules: {
        backwardation: (process.env.ALERT_BACKWARDATION || 'true').toLowerCase() !== 'false',
        shortSqueeze: (process.env.ALERT_SHORT_SQUEEZE || 'true').toLowerCase() !== 'false',
        dxyShock: (process.env.ALERT_DXY_SHOCK || 'true').toLowerCase() !== 'false',
      },
      dayKey,
    });
    for (const hit of regimeEval.triggered) {
      if (quietActive && hit.priority < 5) {
        console.log(`  REGIME (${hit.id}): suppressed by quiet hours`);
        continue;
      }
      const payload = {
        topic: ntfyTopic || 'dry-run-topic',
        title: hit.title,
        message: hit.message,
        priority: hit.priority || 4,
        tags: hit.tags || ['zap', 'coin'],
        ...(appUrl ? { click: appUrl } : {}),
      };
      if (dryRun) {
        console.log(`  REGIME (${hit.id}): DRY RUN ->`, JSON.stringify(payload));
      } else {
        await sendNtfy(ntfyServer, payload, ntfyToken);
        console.log(`  REGIME (${hit.id}): alert sent -> ${payload.title}`);
        alertState.REGIME = regimeEval.nextState;
        stateChanged = true;
      }
    }
  }

  if (stateChanged && !dryRun) {
    await writeState(statePath, alertState);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('Monitor error:', err.message);
    process.exit(1);
  });
}
