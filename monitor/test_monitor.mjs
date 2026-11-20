import assert from 'node:assert/strict';
import {
  evaluateMetalAlert,
  evaluateShanghaiPremiumAlert,
  formatNtfyPayload,
  formatShanghaiNtfyPayload,
  parseGoldPriceOrg,
  parseYahooChart,
} from './check_metals.mjs';
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
  goldSpot: 3742.5,
  goldPrevClose: 3715.75,
  silverSpot: 45.28,
  silverPrevClose: 44.68,
});
for (const tf of ['1d', '7d', '1m', '6m', '1y', '5y', '10y', 'all']) {
  assert.ok(seededAll.timeframes[tf], `missing timeframe ${tf}`);
  assert.ok(seededAll.timeframes[tf].gold.length >= 20, `gold ${tf} too short`);
  assert.ok(seededAll.timeframes[tf].silver.length >= 20, `silver ${tf} too short`);
  assert.equal(seededAll.timeframes[tf].gold.at(-1).c, 3742.5);
  assert.equal(seededAll.timeframes[tf].silver.at(-1).c, 45.28);
}
assert.ok(seededAll.timeframes.all.gold[0].c < 200, 'ALL gold should start in 1975 around $161');

// 13. Split candle payloads (lightweight 1D 5m refresh vs lazy-loaded 7D-ALL history)
const { intraday1d, historical } = splitCandlePayloads(seededAll);
assert.equal(intraday1d.gold.length, seededAll.timeframes['1d'].gold.length);
assert.equal(intraday1d.silver.length, seededAll.timeframes['1d'].silver.length);
assert.equal(historical.timeframes['1d'], undefined);
assert.equal(Object.keys(historical.timeframes).length, 7);
const fullBytes = JSON.stringify(seededAll).length;
const intradayBytes = JSON.stringify(intraday1d).length;
assert.ok(intradayBytes < fullBytes * 0.25, `1D payload (${intradayBytes}B) should be >75% smaller than full (${fullBytes}B)`);

console.log('All 13 Bullion Pulse monitor, Shanghai alert, split-payload & multi-timeframe candle tests passed!');
