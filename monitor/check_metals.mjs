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

async function fetchSpotPrices() {
  // Primary: goldprice.org spot USD feed (XAU + XAG with daily % change)
  try {
    const res = await fetch('https://data-asg.goldprice.org/dbXRates/USD', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseGoldPriceOrg(await res.json());
  } catch (primaryErr) {
    console.warn(`Primary feed failed (${primaryErr.message}), trying Yahoo Finance fallback…`);
  }

  // Fallback: Yahoo Finance COMEX continuous futures (GC=F & SI=F)
  const [goldRes, silverRes] = await Promise.all([
    fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=1d&interval=5m', {
      headers: { 'User-Agent': USER_AGENT },
    }),
    fetch('https://query1.finance.yahoo.com/v8/finance/chart/SI=F?range=1d&interval=5m', {
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
}) {
  const absPct = Math.abs(quote.pct);
  if (absPct < thresholdPct) {
    return { shouldAlert: false, reason: 'below_threshold' };
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
    };
  }

  return {
    shouldAlert: true,
    kind: 'initial',
    dir,
    absPct,
    nextState: { day: dayKey, dir, absPct },
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

/* ---------- Main Runner ---------- */

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const sendTest = args.has('--test');

  const ntfyTopic = (process.env.NTFY_TOPIC || '').trim();
  const ntfyServer = (process.env.NTFY_SERVER || 'https://ntfy.sh').trim();
  const ntfyToken = (process.env.NTFY_TOKEN || '').trim();
  const goldThreshold = parseFloat(process.env.GOLD_THRESHOLD_PCT || '1.5');
  const silverThreshold = parseFloat(process.env.SILVER_THRESHOLD_PCT || '3.0');
  const shanghaiPremThreshold = parseFloat(process.env.SHANGHAI_PREMIUM_THRESHOLD_USD || '35');
  const directionRule = (process.env.ALERT_DIRECTION || 'both').trim().toLowerCase();
  const escalationStep = parseFloat(process.env.ESCALATION_STEP_PCT || '1.0');
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

  const alertState = await readState(statePath);
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
    });

    if (!evaluation.shouldAlert) {
      console.log(`  ${key}: no alert (${evaluation.reason})`);
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
