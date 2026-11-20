#!/usr/bin/env node
/**
 * Bullion Pulse — World News, Metals News & Historical Macro Outlook Pipeline
 * Zero external dependencies (Node.js 20+ built-in fetch).
 *
 * Fetches:
 *  1. Live RSS feeds (world/geopolitics, inflation/Fed, gold/silver/mining, stock markets)
 *  2. 6-month daily historical closes from Yahoo Finance (GC=F, SI=F, DX-Y.NYB, ^GSPC, ^TNX, ^VIX)
 *  3. Optional Gemini narrative synthesis if GEMINI_API_KEY is set
 * Outputs:
 *  - data/outlook.json (consumed directly by the mobile PWA)
 *  - Optional ntfy.sh catalyst push if CATALYST_ALERTS=true and regime shifts sharply
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOutlook } from './historical_patterns.mjs';
import { parseGoldPriceOrg } from './check_metals.mjs';
import { fetchShanghaiMetals } from './shanghai.mjs';
import { fetchMetalMultiTimeframeCandles, splitCandlePayloads } from './candles.mjs';
import { fetchComexPaperAndStocks } from './comex.mjs';
import {
  computeMinersConfirmation,
  fetchCftcCot,
  fetchFredRealYields,
} from './pro_signals.mjs';
import { runWalkForwardBacktest, updateAccuracyLog } from './accuracy.mjs';
import {
  computeBasisSignal,
  computeCrossMarketSignal,
  computeEtfFlowSignal,
  computeImpliedVolSignal,
  getUpcomingEventRisk,
} from './institutional_signals.mjs';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) BullionPulseOutlook/1.0';

const RSS_FEEDS = [
  {
    name: 'Global Silver Supply & Demand',
    url: 'https://news.google.com/rss/search?q=(silver+price+OR+global+silver+deficit+OR+Silver+Institute+OR+silver+mining+Mexico+Peru)+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Shanghai & Asia Silver/Gold',
    url: 'https://news.google.com/rss/search?q=(Shanghai+silver+OR+Shanghai+Gold+Exchange+OR+China+silver+export+OR+India+silver+imports+OR+COMEX+silver+inventory)+when:4d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Metals & Mining',
    url: 'https://news.google.com/rss/search?q=(gold+price+OR+gold+mining+OR+silver+solar+EV+demand+OR+COMEX+gold)+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Inflation & Fed',
    url: 'https://news.google.com/rss/search?q=(inflation+CPI+OR+Federal+Reserve+interest+rates+OR+US+dollar+treasury+yields)+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'World & Geopolitics',
    url: 'https://news.google.com/rss/search?q=(geopolitical+conflict+OR+war+escalation+OR+sanctions+OR+central+bank+gold+reserves)+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Stock Markets',
    url: 'https://news.google.com/rss/search?q=(stock+market+selloff+OR+S%26P+500+OR+recession+fears+OR+VIX+volatility)+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
];

const YAHOO_SYMBOLS = {
  gold: 'GC=F',
  silver: 'SI=F',
  dxy: 'DX-Y.NYB',
  spx: '^GSPC',
  tnx: '^TNX',
  vix: '^VIX',
  gdx: 'GDX',
  sil: 'SIL',
  gvz: '^GVZ',
  gld: 'GLD',
  slv: 'SLV',
  pslv: 'PSLV',
  copper: 'HG=F',
  usdjpy: 'JPY=X',
};

/* ---------- Lightweight Zero-Dependency XML RSS Parser ---------- */

function decodeXmlEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseRssItems(xmlText, fallbackSource = 'News') {
  const items = [];
  const itemMatches = xmlText.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  for (const block of itemMatches.slice(0, 15)) {
    const pick = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? decodeXmlEntities(m[1]) : '';
    };
    const title = pick('title');
    if (!title) continue;
    const link = pick('link');
    const pubDate = pick('pubDate');
    const source = pick('source') || fallbackSource;
    const description = pick('description');

    const parsedDate = pubDate ? new Date(pubDate) : new Date();
    items.push({
      title,
      summary: description.slice(0, 240),
      source,
      url: link,
      publishedAt: Number.isNaN(parsedDate.getTime())
        ? new Date().toISOString()
        : parsedDate.toISOString(),
    });
  }
  return items;
}

async function fetchAllHeadlines() {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseRssItems(await res.text(), feed.name);
    })
  );

  const headlines = [];
  for (const r of results) {
    if (r.status === 'fulfilled') headlines.push(...r.value);
  }
  return headlines;
}

/* ---------- Historical Market Series Fetcher ---------- */

async function fetchYahooDailySeries(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);
  const data = await res.json();
  const q = data?.chart?.result?.[0]?.indicators?.quote?.[0] || {};
  const rawC = q.close || [];
  const rawV = q.volume || [];
  const closes = [];
  const volumes = [];
  for (let i = 0; i < rawC.length; i++) {
    if (typeof rawC[i] === 'number' && Number.isFinite(rawC[i])) {
      closes.push(rawC[i]);
      volumes.push(typeof rawV[i] === 'number' && Number.isFinite(rawV[i]) ? rawV[i] : 0);
    }
  }
  return { closes, volumes };
}

async function fetchMarketSeries() {
  const entries = Object.entries(YAHOO_SYMBOLS);
  const settled = await Promise.allSettled(
    entries.map(async ([key, sym]) => [key, await fetchYahooDailySeries(sym)])
  );
  const series = {};
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      const [key, { closes, volumes }] = r.value;
      series[key] = closes;
      if (key === 'gld' || key === 'slv') {
        series[`${key}Volumes`] = volumes;
      }
    }
  }
  return series;
}

async function fetchSpotBaseline(series) {
  try {
    const res = await fetch('https://data-asg.goldprice.org/dbXRates/USD', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (res.ok) {
      const parsed = parseGoldPriceOrg(await res.json());
      return { spotGold: parsed.gold.price, spotSilver: parsed.silver.price };
    }
  } catch {
    // Fall back to latest Yahoo close
  }
  const gArr = series.gold || [];
  const sArr = series.silver || [];
  return {
    spotGold: gArr[gArr.length - 1] ?? 2685.0,
    spotSilver: sArr[sArr.length - 1] ?? 31.5,
  };
}

/* ---------- Optional Gemini AI Narrative Upgrade ---------- */

async function maybeEnhanceWithGemini(outlook, apiKey) {
  if (!apiKey) return outlook;
  try {
    const prompt =
      `You are a concise precious metals macro analyst. Write a 2-sentence plain-English synthesis ` +
      `(no hype, no guaranteed price claims) explaining the current Gold and Silver outlook based strictly on this data:\n` +
      `Gold signal: ${outlook.gold.signal} (score ${outlook.gold.score}/100, 30d base ${outlook.gold.horizon30d.base})\n` +
      `Silver signal: ${outlook.silver.signal} (score ${outlook.silver.score}/100, 30d base ${outlook.silver.horizon30d.base})\n` +
      `Active drivers: ${outlook.drivers.map((d) => `${d.shortLabel}: Au ${d.gold}, Ag ${d.silver}`).join('; ')}\n` +
      `Top headlines: ${outlook.headlines.slice(0, 6).map((h) => h.title).join(' | ')}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );
    if (!res.ok) return outlook;
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      return { ...outlook, narrative: text, aiEnhanced: true };
    }
  } catch (err) {
    console.warn(`Optional Gemini synthesis skipped: ${err.message}`);
  }
  return outlook;
}

/* ---------- Optional High-Impact Catalyst Push ---------- */

async function maybeNotifyCatalystShift(prevOutlook, nextOutlook) {
  if (process.env.CATALYST_ALERTS !== 'true') return;
  const topic = (process.env.NTFY_TOPIC || '').trim();
  if (!topic) return;

  const prevScore = prevOutlook?.gold?.score ?? 0;
  const delta = Math.abs(nextOutlook.gold.score - prevScore);
  if (Math.abs(nextOutlook.gold.score) < 55 || delta < 25) return;

  const server = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.NTFY_TOKEN) headers.Authorization = `Bearer ${process.env.NTFY_TOKEN}`;

  const payload = {
    topic,
    title: `Macro Regime Shift: Gold ${nextOutlook.gold.signal} (${nextOutlook.gold.score > 0 ? '+' : ''}${nextOutlook.gold.score})`,
    message:
      `${nextOutlook.narrative}\n` +
      `7d Base: Gold $${nextOutlook.gold.horizon7d.base} · Silver $${nextOutlook.silver.horizon7d.base}`,
    priority: 4,
    tags: ['newspaper', 'coin'],
    ...(process.env.APP_URL ? { click: process.env.APP_URL } : {}),
  };

  await fetch(server, { method: 'POST', headers, body: JSON.stringify(payload) });
  console.log('Sent catalyst regime-shift alert to ntfy.');
}

/* ---------- Main Runner ---------- */

async function main() {
  const outPath = process.env.OUTLOOK_FILE || path.resolve('data/outlook.json');
  const shanghaiPath = process.env.SHANGHAI_FILE || path.resolve('data/shanghai.json');
  let prevOutlook = null;
  try {
    prevOutlook = JSON.parse(await fs.readFile(outPath, 'utf8'));
  } catch {
    // First run
  }

  const [rawHeadlines, series] = await Promise.all([fetchAllHeadlines(), fetchMarketSeries()]);
  const { spotGold, spotSilver } = await fetchSpotBaseline(series);

  let shanghai = null;
  try {
    shanghai = await fetchShanghaiMetals({
      westernGoldUsdOz: spotGold,
      westernSilverUsdOz: spotSilver,
    });
    await fs.mkdir(path.dirname(shanghaiPath), { recursive: true });
    await fs.writeFile(shanghaiPath, JSON.stringify(shanghai, null, 2) + '\n', 'utf8');
    console.log(
      `  Shanghai SGE: ${shanghai.gold.contract} ¥${shanghai.gold.cnyPerG}/g ($${shanghai.gold.usdPerOz}/oz, prem ${shanghai.gold.premiumUsdOz >= 0 ? '+' : ''}$${shanghai.gold.premiumUsdOz}) | ${shanghai.silver.contract} ¥${shanghai.silver.cnyPerKg}/kg ($${shanghai.silver.usdPerOz}/oz)`
    );
  } catch (err) {
    console.warn(`Shanghai SGE fetch skipped (${err.message}); keeping prior shanghai.json if present.`);
    try {
      shanghai = JSON.parse(await fs.readFile(shanghaiPath, 'utf8'));
    } catch {
      shanghai = null;
    }
  }

  // Refresh multi-timeframe OHLC candles (1D 5m through ALL years) + split lightweight 1D & lazy history payloads
  const candlesPath = process.env.CANDLES_FILE || path.resolve('data/candles.json');
  const candles1dPath = path.resolve(path.dirname(candlesPath), 'candles_1d.json');
  const candlesHistPath = path.resolve(path.dirname(candlesPath), 'candles_hist.json');
  try {
    const candles = await fetchMetalMultiTimeframeCandles();
    const { intraday1d, historical } = splitCandlePayloads(candles);
    await fs.mkdir(path.dirname(candlesPath), { recursive: true });
    await Promise.all([
      fs.writeFile(candlesPath, JSON.stringify(candles, null, 2) + '\n', 'utf8'),
      fs.writeFile(candles1dPath, JSON.stringify(intraday1d) + '\n', 'utf8'),
      fs.writeFile(candlesHistPath, JSON.stringify(historical) + '\n', 'utf8'),
    ]);
    console.log(
      `  OHLC Candles: ${candles.gold.length} Gold 5m · ${candles.silver.length} Silver 5m · split 1D/Hist payloads written`
    );
  } catch (err) {
    console.warn(`Multi-timeframe candle fetch skipped (${err.message}); keeping prior candles.json if present.`);
  }

  // Fetch institutional pro signals (FRED 10Y TIPS Real Yields, CFTC COT, GDX/SIL Miners) & fresh COMEX Paper Contracts
  const comexPath = process.env.COMEX_FILE || path.resolve('data/comex.json');
  let prevComex = prevOutlook?.comex || null;
  try {
    prevComex = JSON.parse(await fs.readFile(comexPath, 'utf8'));
  } catch {
    // First run
  }
  const pct5d = (arr) => (arr && arr.length >= 6 ? ((arr.at(-1) - arr.at(-6)) / arr.at(-6)) * 100 : 0);
  const [ryRes, cotRes, comexRes] = await Promise.allSettled([
    fetchFredRealYields(),
    fetchCftcCot(),
    fetchComexPaperAndStocks({
      prevComex,
      price5dGoldPct: pct5d(series.gold),
      price5dSilverPct: pct5d(series.silver),
    }),
  ]);
  const realYields = ryRes.status === 'fulfilled' ? ryRes.value : prevOutlook?.proSignals?.realYields || null;
  const cot = cotRes.status === 'fulfilled' ? cotRes.value : prevOutlook?.proSignals?.cot || null;
  const comex = comexRes.status === 'fulfilled' ? comexRes.value : prevComex;
  if (comex) {
    await fs.mkdir(path.dirname(comexPath), { recursive: true });
    await fs.writeFile(comexPath, JSON.stringify(comex, null, 2) + '\n', 'utf8');
    console.log(
      `  COMEX Paper : GC ${comex.gold.openInterestContracts.toLocaleString('en-US')} (${comex.gold.paperToRegisteredRatio}:1 reg) | SI ${comex.silver.openInterestContracts.toLocaleString('en-US')} (${comex.silver.paperToRegisteredRatio}:1 reg)`
    );
  }
  const miners = computeMinersConfirmation(series) || prevOutlook?.proSignals?.miners || null;
  const proSignals = { realYields, cot, miners };

  // Compute the 5 Institutional Microstructure & Catalyst Signals
  const prevInst = prevOutlook?.institutionalSignals || {};
  const futGold = series.gold?.length ? series.gold[series.gold.length - 1] : null;
  const futSilver = series.silver?.length ? series.silver[series.silver.length - 1] : null;
  const institutionalSignals = {
    eventRisk: getUpcomingEventRisk(new Date()),
    impliedVol: computeImpliedVolSignal(series.gvz) || prevInst.impliedVol || null,
    etfFlows:
      computeEtfFlowSignal({
        gldCloses: series.gld,
        gldVolumes: series.gldVolumes,
        slvCloses: series.slv,
        slvVolumes: series.slvVolumes,
        pslvCloses: series.pslv,
      }) ||
      prevInst.etfFlows ||
      null,
    crossMarket:
      computeCrossMarketSignal({
        copper: series.copper,
        usdjpy: series.usdjpy,
      }) ||
      prevInst.crossMarket ||
      null,
    basis:
      computeBasisSignal({
        spotGold,
        futGold,
        spotSilver,
        futSilver,
      }) ||
      prevInst.basis ||
      null,
  };

  // Load accuracy log, daily 5:10 PM ET self-learned weights, & run 6-month walk-forward backtest
  const accPath = process.env.ACCURACY_FILE || path.resolve('data/accuracy_log.json');
  const learnedPath = process.env.LEARNED_FILE || path.resolve('data/learned_weights.json');
  let priorAccLog = { predictions: [] };
  try {
    priorAccLog = JSON.parse(await fs.readFile(accPath, 'utf8'));
  } catch {
    // First run
  }
  let learnedWeights = null;
  try {
    learnedWeights = JSON.parse(await fs.readFile(learnedPath, 'utf8'));
  } catch {
    // Not initialized yet
  }
  const backtest = runWalkForwardBacktest(series);
  const coneMultiplier =
    learnedWeights?.coneMultiplier ?? priorAccLog?.scorecard?.coneMultiplier ?? 1.0;

  let outlook = buildOutlook({
    spotGold,
    spotSilver,
    rawHeadlines,
    series,
    shanghai,
    comex,
    proSignals,
    institutionalSignals,
    learnedWeights,
    coneMultiplier,
  });

  // Grade matured forecasts & append today's snapshot
  const updatedAcc = updateAccuracyLog({
    log: priorAccLog,
    outlook,
    spotGold,
    spotSilver,
  });
  outlook.accuracy = {
    ...updatedAcc.scorecard,
    backtest6m: backtest,
  };

  outlook = await maybeEnhanceWithGemini(outlook, (process.env.GEMINI_API_KEY || '').trim());

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(accPath, JSON.stringify(updatedAcc, null, 2) + '\n', 'utf8');
  await fs.writeFile(outPath, JSON.stringify(outlook, null, 2) + '\n', 'utf8');

  console.log(`Updated ${outPath} & ${accPath}`);
  console.log(
    `  Gold   : ${outlook.gold.signal} (${outlook.gold.score}) | 7d base $${outlook.gold.horizon7d.base} | 30d base $${outlook.gold.horizon30d.base}`
  );
  console.log(
    `  Silver : ${outlook.silver.signal} (${outlook.silver.score}) | 7d base $${outlook.silver.horizon7d.base} | 30d base $${outlook.silver.horizon30d.base}`
  );
  console.log(`  Classified news clusters: ${outlook.headlines.length} | Cone mult: ${coneMultiplier}x`);

  await maybeNotifyCatalystShift(prevOutlook, outlook);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('Outlook pipeline error:', err.message);
    process.exit(1);
  });
}
