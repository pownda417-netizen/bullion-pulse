import assert from 'node:assert/strict';
import {
  buildMorningDigestPayload,
  evaluateMetalAlert,
  evaluatePriceTargets,
  evaluateRegimeAlerts,
  evaluateShanghaiPremiumAlert,
  fetchSpotPrices,
  formatNtfyPayload,
  formatShanghaiNtfyPayload,
  isQuietHours,
  maskSecretTopic,
  parseGoldApiQuotes,
  parseGoldPriceOrg,
  parseYahooChart,
  validateAppUrl,
  validateNtfyServerUrl,
  validateNtfyTopic,
} from './check_metals.mjs';
import { fetchSettledCloses, parseGoldApiCloses } from './self_learn.mjs';
import {
  aggregateCandles,
  buildSeededMultiTimeframeCandles,
  parseYahooCandles,
  splitCandlePayloads,
} from './candles.mjs';

// 1. Parse goldprice.org payload
const parsed = parseGoldPriceOrg({
  date: 'Nov 19th 2026, 02:15:00 pm NY',
  items: [
    {
      curr: 'USD',
      xauPrice: 2742.5,
      xagPrice: 32.84,
      chgXau: 52.5,
      chgXag: 1.24,
      pcXau: 1.9517,
      pcXag: 3.9241,
      xauClose: 2690.0,
      xagClose: 31.6,
    },
  ],
});
assert.equal(parsed.gold.price, 2742.5);
assert.equal(parsed.silver.pct, 3.9241);

// 2. Parse Yahoo Finance fallback payload
const yahooQuote = parseYahooChart(
  {
    chart: {
      result: [
        {
          meta: { regularMarketPrice: 2610.0, chartPreviousClose: 2660.0 },
        },
      ],
    },
  },
  'XAU',
  'Gold'
);
assert.equal(yahooQuote.chg, -50);
assert.ok(Math.abs(yahooQuote.pct - -1.8797) < 0.001);

// 3. Alert below threshold should not trigger
const quiet = evaluateMetalAlert({
  quote: { symbol: 'XAU', name: 'Gold', price: 2710, prevClose: 2690, chg: 20, pct: 0.74 },
  thresholdPct: 1.5,
  dayKey: '2026-11-19',
});
assert.equal(quiet.shouldAlert, false);
assert.equal(quiet.reason, 'below_threshold');

// 4. Initial big move triggers alert
const initial = evaluateMetalAlert({
  quote: parsed.gold,
  thresholdPct: 1.5,
  dayKey: '2026-11-19',
});
assert.equal(initial.shouldAlert, true);
assert.equal(initial.kind, 'initial');
assert.equal(initial.dir, 'up');

// 5. Same day small drift deduplicates (no spam)
const dup = evaluateMetalAlert({
  quote: { ...parsed.gold, pct: 2.3 },
  thresholdPct: 1.5,
  escalationStepPct: 1.0,
  prevAlert: initial.nextState,
  dayKey: '2026-11-19',
});
assert.equal(dup.shouldAlert, false);
assert.equal(dup.reason, 'already_alerted_today');

// 6. Same day major escalation (+1.0% further) DOES re-alert
const escalated = evaluateMetalAlert({
  quote: { ...parsed.gold, pct: 3.15 },
  thresholdPct: 1.5,
  escalationStepPct: 1.0,
  prevAlert: initial.nextState,
  dayKey: '2026-11-19',
});
assert.equal(escalated.shouldAlert, true);
assert.equal(escalated.kind, 'escalation');

// 7. Intraday reversal (big up -> big down) DOES re-alert
const reversal = evaluateMetalAlert({
  quote: { ...parsed.gold, pct: -1.85, chg: -49.7 },
  thresholdPct: 1.5,
  prevAlert: initial.nextState,
  dayKey: '2026-11-19',
});
assert.equal(reversal.shouldAlert, true);
assert.equal(reversal.kind, 'reversal');
assert.equal(reversal.dir, 'down');

// 8. Direction filter works
const filtered = evaluateMetalAlert({
  quote: { ...parsed.gold, pct: -2.1 },
  thresholdPct: 1.5,
  directionRule: 'up',
  dayKey: '2026-11-19',
});
assert.equal(filtered.shouldAlert, false);
assert.equal(filtered.reason, 'direction_filtered');

// 9. ntfy payload formatting & urgent priority on 2x threshold
const payload = formatNtfyPayload({
  topic: 'my-secret-bullion-topic',
  quote: { ...parsed.gold, pct: 3.25 },
  ratio: 83.5,
  thresholdPct: 1.5,
  kind: 'escalation',
  dir: 'up',
  appUrl: 'https://example.github.io/bullion-pulse/',
});
assert.equal(payload.topic, 'my-secret-bullion-topic');
assert.equal(payload.priority, 5); // >= 2x threshold => urgent
assert.match(payload.title, /EXTENDED MOVE: Gold \(XAU\) UP \+3\.25%/);
assert.match(payload.message, /Gold\/Silver Ratio: 83\.5 : 1/);
assert.equal(payload.click, 'https://example.github.io/bullion-pulse/');

// 10. Shanghai Gold Premium alert triggers above ±$35/oz and deduplicates
const sgeQuiet = evaluateShanghaiPremiumAlert({ premiumUsdOz: 18, thresholdUsd: 35, dayKey: '2026-11-19' });
assert.equal(sgeQuiet.shouldAlert, false);
const sgeHit = evaluateShanghaiPremiumAlert({ premiumUsdOz: 42.5, thresholdUsd: 35, dayKey: '2026-11-19' });
assert.equal(sgeHit.shouldAlert, true);
assert.equal(sgeHit.dir, 'premium');
const sgeDup = evaluateShanghaiPremiumAlert({
  premiumUsdOz: 49,
  thresholdUsd: 35,
  escalationStepUsd: 15,
  prevAlert: sgeHit.nextState,
  dayKey: '2026-11-19',
});
assert.equal(sgeDup.shouldAlert, false);
const sgeEsc = evaluateShanghaiPremiumAlert({
  premiumUsdOz: 61,
  thresholdUsd: 35,
  escalationStepUsd: 15,
  prevAlert: sgeHit.nextState,
  dayKey: '2026-11-19',
});
assert.equal(sgeEsc.shouldAlert, true);
assert.equal(sgeEsc.kind, 'escalation');

const sgePayload = formatShanghaiNtfyPayload({
  topic: 'anon-topic',
  shanghai: {
    usdCny: 7.24,
    gold: { contract: 'Au99.99', cnyPerG: 878.5, usdPerOz: 3774.2, premiumUsdOz: 42.5 },
    silver: { contract: 'Ag(T+D)', cnyPerKg: 10638, usdPerOz: 45.7 },
  },
  thresholdUsd: 35,
  kind: 'initial',
  dir: 'premium',
});
assert.match(sgePayload.title, /Shanghai Gold PREMIUM: \+\$42\.50\/oz/);

// 11. 5-minute OHLC candle parser filters nulls and keeps valid bars
const parsedCandles = parseYahooCandles({
  chart: {
    result: [
      {
        timestamp: [1763596800, 1763597100, 1763597400],
        indicators: {
          quote: [
            {
              open: [45.1, null, 45.4],
              high: [45.5, null, 45.9],
              low: [44.9, null, 45.2],
              close: [45.4, null, 45.8],
            },
          ],
        },
      },
    ],
  },
});
assert.equal(parsedCandles.length, 2);
assert.equal(parsedCandles[0].o, 45.1);
assert.equal(parsedCandles[1].c, 45.8);

// 12. Multi-timeframe OHLC aggregation & seeded 8-timeframe generation (1D -> ALL)
const agg = aggregateCandles(
  [
    { t: 1000, o: 10, h: 12, l: 9, c: 11 },
    { t: 2000, o: 11, h: 15, l: 10, c: 14 },
    { t: 3000, o: 14, h: 16, l: 12, c: 13 },
    { t: 4000, o: 13, h: 14, l: 8, c: 9 },
  ],
  2
);
assert.equal(agg.length, 2);
assert.equal(agg[0].o, 10);
assert.equal(agg[0].h, 15);
assert.equal(agg[0].l, 9);
assert.equal(agg[0].c, 14);
assert.equal(agg[1].o, 14);
assert.equal(agg[1].l, 8);
assert.equal(agg[1].c, 9);

const seededAll = buildSeededMultiTimeframeCandles({
  goldSpot: 3542.81,
  goldPrevClose: 3626.21,
  silverSpot: 42.22,
  silverPrevClose: 42.84,
});
for (const tf of ['1d', '7d', '1m', '6m', '1y', '5y', '10y', 'all']) {
  assert.ok(seededAll.timeframes[tf], `missing timeframe ${tf}`);
  assert.ok(seededAll.timeframes[tf].gold.length >= 20, `gold ${tf} too short`);
  assert.ok(seededAll.timeframes[tf].silver.length >= 20, `silver ${tf} too short`);
  assert.equal(seededAll.timeframes[tf].gold.at(-1).c, 3542.81);
  assert.equal(seededAll.timeframes[tf].silver.at(-1).c, 42.22);
}
assert.ok(seededAll.timeframes.all.gold[0].c < 200, 'ALL gold should start in 1975 around $161');
for (const tf of ['1y', '5y', '10y', 'all']) {
  const sPeak = Math.max(...seededAll.timeframes[tf].silver.map((b) => b.h));
  const gPeak = Math.max(...seededAll.timeframes[tf].gold.map((b) => b.h));
  assert.ok(sPeak >= 120, `Silver ${tf} peak (${sPeak}) must preserve Jan 2026 $120+ spike`);
  assert.ok(gPeak >= 5500, `Gold ${tf} peak (${gPeak}) must preserve Jan 2026 $5,500+ spike`);
}

// 13. Split candle payloads (lightweight 1D 5m refresh vs lazy-loaded 7D-ALL history)
const { intraday1d, historical } = splitCandlePayloads(seededAll);
assert.equal(intraday1d.gold.length, seededAll.timeframes['1d'].gold.length);
assert.equal(intraday1d.silver.length, seededAll.timeframes['1d'].silver.length);
assert.equal(historical.timeframes['1d'], undefined);
assert.equal(Object.keys(historical.timeframes).length, 7);
const fullBytes = JSON.stringify(seededAll).length;
const intradayBytes = JSON.stringify(intraday1d).length;
assert.ok(intradayBytes < fullBytes * 0.25, `1D payload (${intradayBytes}B) should be >75% smaller than full (${fullBytes}B)`);

// 14. Custom absolute USD & Au/Ag ratio target price alerts + same-day deduplication
const tgt1 = evaluatePriceTargets({
  goldPrice: 3655,
  silverPrice: 39.8,
  ratio: 91.8,
  targets: { goldAbove: 3650, silverBelow: 40, ratioAbove: 85 },
  prevTargetsState: {},
  dayKey: '2026-11-20',
});
assert.equal(tgt1.triggered.length, 3);
assert.ok(tgt1.triggered.some((t) => t.id === 'goldAbove'));
assert.ok(tgt1.triggered.some((t) => t.id === 'silverBelow'));
assert.ok(tgt1.triggered.some((t) => t.id === 'ratioAbove'));
const tgtDup = evaluatePriceTargets({
  goldPrice: 3660,
  silverPrice: 39.5,
  ratio: 92.6,
  targets: { goldAbove: 3650, silverBelow: 40, ratioAbove: 85 },
  prevTargetsState: tgt1.nextState,
  dayKey: '2026-11-20',
});
assert.equal(tgtDup.triggered.length, 0, 'Same-day duplicate targets must deduplicate');

// 15. Sustained anti-wick confirmation filter (requires 2 consecutive hits unless >=1.65x threshold)
const firstWick = evaluateMetalAlert({
  quote: { pct: 1.75 },
  thresholdPct: 1.5,
  directionRule: 'both',
  escalationStepPct: 1.0,
  prevAlert: null,
  dayKey: '2026-11-20',
  requireConfirmation: true,
  pendingAlert: null,
});
assert.equal(firstWick.shouldAlert, false);
assert.equal(firstWick.reason, 'pending_confirmation');
assert.ok(firstWick.nextPending && firstWick.nextPending.dir === 'up');

const confirmedSecond = evaluateMetalAlert({
  quote: { pct: 1.82 },
  thresholdPct: 1.5,
  directionRule: 'both',
  escalationStepPct: 1.0,
  prevAlert: null,
  dayKey: '2026-11-20',
  requireConfirmation: true,
  pendingAlert: firstWick.nextPending,
});
assert.equal(confirmedSecond.shouldAlert, true);
assert.equal(confirmedSecond.kind, 'initial');

const extremeInstant = evaluateMetalAlert({
  quote: { pct: -2.8 },
  thresholdPct: 1.5,
  directionRule: 'both',
  escalationStepPct: 1.0,
  prevAlert: null,
  dayKey: '2026-11-20',
  requireConfirmation: true,
  pendingAlert: null,
});
assert.equal(extremeInstant.shouldAlert, true, 'Extreme spike >=1.65x threshold fires immediately');

// 16. gold-api.com spot fallback (check_metals.mjs & self_learn.mjs) when goldprice.org returns 403
const parsedGa = parseGoldApiQuotes(
  { price: 3560.4, updatedAt: '2026-11-20T20:00:00Z' },
  { price: 42.15, updatedAt: '2026-11-20T20:00:00Z' },
  { gold: 3500.0, silver: 41.0 }
);
assert.equal(parsedGa.source, 'gold-api.com');
assert.equal(parsedGa.gold.price, 3560.4);
assert.ok(Math.abs(parsedGa.gold.pct - 1.7257) < 0.01);

const mockFetch403 = async (url) => {
  if (url.includes('goldprice.org')) return { ok: false, status: 403 };
  if (url.includes('/price/XAU')) return { ok: true, json: async () => ({ price: 3545.25 }) };
  if (url.includes('/price/XAG')) return { ok: true, json: async () => ({ price: 41.80 }) };
  if (url.includes('GC=F')) return { ok: true, json: async () => ({ chart: { result: [{ meta: { chartPreviousClose: 3520 } }] } }) };
  if (url.includes('SI=F')) return { ok: true, json: async () => ({ chart: { result: [{ meta: { chartPreviousClose: 41.2 } }] } }) };
  return { ok: false, status: 404 };
};
const fallbackSpot = await fetchSpotPrices(mockFetch403);
assert.equal(fallbackSpot.source, 'gold-api.com');
assert.equal(fallbackSpot.gold.price, 3545.25);
assert.equal(fallbackSpot.silver.prevClose, 41.2);

const settledGa = parseGoldApiCloses({ price: 3550.1 }, { price: 42.3 });
assert.equal(settledGa.gold, 3550.1);
const settledFallback = await fetchSettledCloses(mockFetch403);
assert.equal(settledFallback.source, 'gold-api.com');
assert.equal(settledFallback.gold, 3545.25);

// 17. ratioBelow target alert & same-day deduplication
const ratioBelowHit = evaluatePriceTargets({
  goldPrice: 3500,
  silverPrice: 54.5,
  ratio: 64.2,
  targets: { ratioBelow: 68 },
  prevTargetsState: {},
  dayKey: '2026-11-20',
});
assert.equal(ratioBelowHit.triggered.length, 1);
assert.equal(ratioBelowHit.triggered[0].id, 'ratioBelow');
assert.match(ratioBelowHit.triggered[0].title, /Au\/Ag Ratio Target Hit \(≤ 68\.0:1\)/);

// 18. Quiet Hours helper (overnight 22:00-07:00 ET wrap + daytime window)
assert.equal(isQuietHours(new Date('2026-11-20T04:30:00Z'), 22, 7, 'America/New_York'), true); // 11:30 PM ET
assert.equal(isQuietHours(new Date('2026-11-20T16:30:00Z'), 22, 7, 'America/New_York'), false); // 11:30 AM ET
assert.equal(isQuietHours(new Date('2026-11-20T16:30:00Z'), 10, 14, 'America/New_York'), true); // daytime window
assert.equal(isQuietHours(new Date('2026-11-20T04:30:00Z'), '', '', 'America/New_York'), false);

// 19. Smart Regime Alerts (Backwardation Flip, Short Squeeze >= 65, DXY Shock >= 0.8%) + Deduplication
const regimeRes = evaluateRegimeAlerts({
  outlook: {
    institutionalSignals: {
      basis: {
        gold: { spot: 3550, futures: 3570, basisUsd: 20, isBackwardation: false },
        silver: { spot: 42.5, futures: 42.1, basisUsd: -0.4, isBackwardation: true },
      },
    },
    marketRegime: {
      gold: { discoveryScore: 40, squeezeScore: 42, label: 'Consolidation / Neutral', key: 'neutral' },
      silver: { discoveryScore: 32, squeezeScore: 76, label: 'Short Squeeze', key: 'squeeze' },
    },
    dollarStrength: {
      dxy: 105.4,
      dxy5dPct: 1.25,
      regime: 'Strong USD Headwind',
      impact7d: { goldUsdOz: -28.4 },
    },
  },
  prevRegimeState: {},
  rules: { backwardation: true, shortSqueeze: true, dxyShock: true },
  dayKey: '2026-11-20',
});
assert.equal(regimeRes.triggered.length, 3);
assert.ok(regimeRes.triggered.some((a) => a.id === 'backw_silver'));
assert.ok(regimeRes.triggered.some((a) => a.id === 'squeeze_silver'));
assert.ok(regimeRes.triggered.some((a) => a.id === 'dxy_shock'));
const regimeDup = evaluateRegimeAlerts({
  outlook: {
    institutionalSignals: { basis: { silver: { spot: 42.5, futures: 42.1, basisUsd: -0.4, isBackwardation: true } } },
    marketRegime: { silver: { discoveryScore: 32, squeezeScore: 76, label: 'Short Squeeze', key: 'squeeze' } },
    dollarStrength: { dxy: 105.4, dxy5dPct: 1.25 },
  },
  prevRegimeState: regimeRes.nextState,
  rules: { backwardation: true, shortSqueeze: true, dxyShock: true },
  dayKey: '2026-11-20',
});
assert.equal(regimeDup.triggered.length, 0, 'Regime alerts must deduplicate within the same day');

// 20. Daily 8:00 AM ET Morning Brief Digest payload
const digestPayload = buildMorningDigestPayload({
  topic: 'my-morning-topic',
  market: {
    gold: { price: 3542.5, pct: 0.65 },
    silver: { price: 41.25, pct: 1.42 },
  },
  shanghai: { gold: { premiumUsdOz: 24.5 } },
  outlook: {
    dollarStrength: { dxy: 103.5, score: 56, regime: 'Balanced USD' },
    ratioAnalytics: { swapBias: 'Rotate Gold → Silver' },
    setupQuality: {
      gold: { label: 'Accumulation / Dip-Buy Zone', score: 74 },
      silver: { label: 'Squeeze Breakout — Chase Caution', score: 60 },
    },
  },
  appUrl: 'https://pownda417-netizen.github.io/bullion-pulse/',
});
assert.equal(digestPayload.topic, 'my-morning-topic');
assert.match(digestPayload.title, /Good Morning · Gold \$3,543 \| Silver \$41\.25/);
assert.match(digestPayload.message, /China Gold vs US\/London: \+\$24\.50\/oz/);
assert.match(digestPayload.message, /Gold Setup: Accumulation \/ Dip-Buy Zone/);
assert.equal(digestPayload.click, 'https://pownda417-netizen.github.io/bullion-pulse/');

// 21. Security validators (SSRF protection, HTTPS enforcement, topic sanitization & log redaction)
assert.equal(validateNtfyServerUrl('https://ntfy.sh/'), 'https://ntfy.sh');
assert.throws(() => validateNtfyServerUrl('http://ntfy.sh'), /https/i);
assert.throws(() => validateNtfyServerUrl('https://169.254.169.254/latest'), /private|link-local/i);
assert.throws(() => validateNtfyServerUrl('https://127.0.0.1/ntfy'), /private|loopback/i);
assert.throws(() => validateNtfyServerUrl('https://10.0.0.5/ntfy'), /private/i);
assert.throws(() => validateNtfyServerUrl('https://user:pass@ntfy.sh'), /credentials/i);
assert.equal(validateNtfyTopic('https://ntfy.sh/my-gold_topic.1'), 'my-gold_topic.1');
assert.equal(validateNtfyTopic('bad topic/with spaces'), '');
assert.equal(validateNtfyTopic('../admin'), '');
assert.equal(validateAppUrl('https://pownda417-netizen.github.io/bullion-pulse/'), 'https://pownda417-netizen.github.io/bullion-pulse/');
assert.equal(validateAppUrl('javascript:alert(1)'), '');
assert.equal(validateAppUrl('http://insecure.example.com'), '');
assert.equal(validateAppUrl('https://127.0.0.1/app'), '');
assert.equal(maskSecretTopic('my-secret-topic-123'), '[redacted-topic]');
assert.equal(maskSecretTopic('dry-run-topic'), 'dry-run-topic');

console.log('All 21 Bullion Pulse monitor, Security SSRF/Topic, Morning Digest, gold-api fallback, Quiet Hours, Regime/Backwardation/DXY alerts, anti-wick confirmation, target-alert, Shanghai alert, split-payload & multi-timeframe candle tests passed!');
