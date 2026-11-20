import assert from 'node:assert/strict';
import {
  buildOutlook,
  classifyHeadline,
  classifyHeadlines,
  computeQuantSignals,
  recencyDecayWeight,
} from './historical_patterns.mjs';
import { parseRssItems } from './analyze_outlook.mjs';
import {
  cnyPerGramToUsdPerOz,
  cnyPerKgToUsdPerOz,
  computeShanghaiMetrics,
  parseSgeHomepageHtml,
} from './shanghai.mjs';
import {
  computeCotSignal,
  computeMinersConfirmation,
  computeRealYieldSignal,
  parseCftcCotRows,
  parseFredCsv,
} from './pro_signals.mjs';
import { runWalkForwardBacktest, updateAccuracyLog } from './accuracy.mjs';
import {
  buildBaselineComexSnapshot,
  computeComexSignal,
  parseCftcOpenInterest,
  parseVaultHtml,
} from './comex.mjs';
import {
  buildBaselineInstitutionalSignals,
  computeBasisSignal,
  computeCrossMarketSignal,
  computeEtfFlowSignal,
  computeImpliedVolSignal,
  getUpcomingEventRisk,
} from './institutional_signals.mjs';
import {
  LEARNING_CONFIG,
  buildSeededLearnedState,
  computePinballLoss,
  createInitialLearnedState,
  detectMarketRegime,
  huberScale,
  isComexHoliday,
  isPostCloseLearningWindow,
  runDailyLearningStep,
} from './self_learn.mjs';
import { estimateJumpParams } from './jump_diffusion.mjs';

// 1. Headline classification across key macro themes
const cpi = classifyHeadline({
  title: 'Hot CPI inflation surges above expectations as oil jumps',
  source: 'MacroWire',
});
assert.equal(cpi.driver, 'inflation');
assert.equal(cpi.sentiment, 'bullish');
assert.ok(cpi.goldImpact > 0);

const war = classifyHeadline({
  title: 'Middle East escalation: airstrike fears spark safe-haven gold rush',
  source: 'WorldDesk',
});
assert.equal(war.driver, 'geopolitics');
assert.equal(war.sentiment, 'bullish');
assert.ok(war.goldImpact > war.silverImpact); // Gold leads geopolitics

const mining = classifyHeadline({
  title: 'Major Peru silver mine strike deepens structural solar supply deficit',
  source: 'MiningDaily',
});
assert.equal(mining.driver, 'mining_supply');
assert.equal(mining.sentiment, 'bullish');
assert.ok(mining.silverImpact > mining.goldImpact); // Silver leads mining/supply

const hawkish = classifyHeadline({
  title: 'US dollar surges as hawkish Fed delays rate cuts and Treasury yields jump',
  source: 'Markets',
});
assert.equal(hawkish.driver, 'rates_usd');
assert.equal(hawkish.sentiment, 'bearish');
assert.ok(hawkish.goldImpact < 0);

// 2. RSS XML parser handles CDATA and entities
const xml = `
<rss><channel>
  <item>
    <title><![CDATA[Central bank gold buying hits record &amp; silver deficit widens]]></title>
    <link>https://example.com/news/1</link>
    <pubDate>Thu, 19 Nov 2026 14:00:00 GMT</pubDate>
    <source>Metals Wire</source>
    <description>Central banks added bullion reserves.</description>
  </item>
</channel></rss>`;
const rssItems = parseRssItems(xml, 'Fallback');
assert.equal(rssItems.length, 1);
assert.equal(rssItems[0].title, 'Central bank gold buying hits record & silver deficit widens');
assert.equal(rssItems[0].source, 'Metals Wire');

// 3. Quantitative cross-market signals & correlations
const quant = computeQuantSignals({
  gold: [2600, 2630, 2615, 2655, 2642, 2685, 2710],
  silver: [30.1, 30.5, 30.2, 30.8, 30.6, 31.1, 31.5],
  dxy: [106.5, 105.7, 106.1, 105.0, 105.3, 104.4, 103.9],
  spx: [5950, 5920, 5880, 5840, 5790, 5750, 5710],
  tnx: [4.45, 4.40, 4.35, 4.30, 4.24, 4.18, 4.12],
  vix: [15.2, 16.0, 17.5, 19.0, 21.4, 22.8, 24.5],
});
assert.ok(quant.ratesUsdMacro > 0, 'Falling USD & yields should be bullish macro signal');
assert.ok(quant.equityStressGold > 0, 'Falling SPX + rising VIX should support Gold');
assert.ok(
  quant.macroSnapshot.goldVsDxyCorr < -0.5,
  `Expected strong negative Gold/DXY correlation, got ${quant.macroSnapshot.goldVsDxyCorr}`
);

// 4. Full probabilistic outlook with bullish catalysts + what-if scenario
const outlook = buildOutlook({
  spotGold: 2705,
  spotSilver: 31.0,
  rawHeadlines: [
    { title: 'Hot CPI inflation surges above forecast', source: 'Reuters' },
    { title: 'Central bank gold reserve buying accelerates in Asia', source: 'Bloomberg' },
    { title: 'Silver mine strike triggers acute solar supply deficit', source: 'Mining.com' },
  ],
  series: {
    gold: [2600, 2615, 2625, 2640, 2660, 2680, 2705],
    silver: [30.1, 30.2, 30.3, 30.4, 30.6, 30.8, 31.0],
    dxy: [106.5, 106.2, 105.8, 105.4, 104.9, 104.5, 104.1],
  },
  scenarioIds: ['war_escalation'],
});

assert.ok(outlook.gold.score > 20, `Expected bullish gold score, got ${outlook.gold.score}`);
assert.ok(outlook.silver.score > 20, `Expected bullish silver score, got ${outlook.silver.score}`);
assert.ok(outlook.gold.horizon30d.bear < outlook.gold.horizon30d.base);
assert.ok(outlook.gold.horizon30d.base < outlook.gold.horizon30d.bull);
assert.equal(outlook.matchedAnalogs.length, 3);
assert.ok(outlook.confidence >= 28 && outlook.confidence <= 82);

// 5. Bearish hawkish scenario pulls projections lower
const bearishOutlook = buildOutlook({
  spotGold: 2705,
  spotSilver: 31.0,
  rawHeadlines: [
    { title: 'US dollar surges and yields jump on hawkish Fed tightening', source: 'FT' },
    { title: 'Inflation cools sharply as peace deal eases geopolitical risk', source: 'Reuters' },
  ],
  scenarioIds: ['hawkish_usd'],
});
assert.ok(bearishOutlook.gold.score < -15, `Expected bearish gold score, got ${bearishOutlook.gold.score}`);
assert.ok(bearishOutlook.gold.horizon30d.expectedPct < 0);

// 6. Shanghai Gold Exchange (SGE) HTML parsing & CNY->USD/oz premium math
const sampleSgeHtml = `
<table>
  <tr><td>Au99.95</td><td>0.0</td><td>0.0</td><td>0.0</td><td>0.0</td></tr>
  <tr><td>Au99.99</td><td>792.1</td><td>803.99</td><td>792.1</td><td>803.9</td></tr>
  <tr><td>Au(T+D)</td><td>792.83</td><td>801.15</td><td>790.64</td><td>798.06</td></tr>
  <tr><td>Ag(T+D)</td><td>10638.0</td><td>10869.0</td><td>10500.0</td><td>10715.0</td></tr>
</table>
<table>
  <tr><td>20261118</td><td>SHAU</td><td>816.91</td><td>810.68</td></tr>
  <tr><td>20261118</td><td>SHAG</td><td>11150</td><td>10955</td></tr>
</table>`;
const sgeParsed = parseSgeHomepageHtml(sampleSgeHtml);
assert.equal(sgeParsed.gold.contract, 'Au99.99');
assert.equal(sgeParsed.gold.latest, 792.1);
assert.equal(sgeParsed.silver.contract, 'Ag(T+D)');
assert.equal(sgeParsed.silver.latest, 10638);
assert.equal(sgeParsed.benchmarks.SHAU.pm, 810.68);
assert.equal(sgeParsed.benchmarks.SHAG.pm, 10955);

const goldUsdOz = cnyPerGramToUsdPerOz(635.0, 7.24);
assert.ok(Math.abs(goldUsdOz - 2727.99) < 0.1, `Unexpected SGE gold USD/oz: ${goldUsdOz}`);
const silverUsdOz = cnyPerKgToUsdPerOz(8450, 7.24);
assert.ok(Math.abs(silverUsdOz - 36.3) < 0.1, `Unexpected SGE silver USD/oz: ${silverUsdOz}`);

const sgeMetrics = computeShanghaiMetrics({
  goldCnyPerG: 635.0,
  goldOpenCnyPerG: 628.0,
  silverCnyPerKg: 8450,
  silverOpenCnyPerKg: 8300,
  usdCny: 7.24,
  westernGoldUsdOz: 2704.1,
  westernSilverUsdOz: 31.86,
  benchmarks: sgeParsed.benchmarks,
});
assert.ok(sgeMetrics.gold.premiumUsdOz > 20, 'SGE gold should show positive Shanghai premium');
assert.ok(sgeMetrics.silver.exVatUsdPerOz < sgeMetrics.silver.usdPerOz, 'Ex-VAT silver should be lower than VAT-included domestic price');

// 7. FRED Real Yields (DFII10) & Breakevens (T10YIE) CSV parsing & bullish falling-real-yield signal
const dfii10 = parseFredCsv(`DATE,DFII10\n2026-11-10,2.05\n2026-11-11,2.02\n2026-11-12,1.98\n2026-11-13,1.95\n2026-11-14,1.92\n2026-11-17,.\n2026-11-18,1.88\n`);
const t10yie = parseFredCsv(`DATE,T10YIE\n2026-11-10,2.24\n2026-11-11,2.26\n2026-11-12,2.28\n2026-11-13,2.30\n2026-11-14,2.32\n2026-11-18,2.35\n`);
const rySig = computeRealYieldSignal(dfii10, t10yie);
assert.equal(rySig.realYield10yPct, 1.88);
assert.equal(rySig.realDelta5dBps, -17);
assert.ok(rySig.goldSignal > 0.3, `Expected bullish falling real-yield signal, got ${rySig.goldSignal}`);

// 8. CFTC COT contrarian crowding model (washed-out silver vs crowded gold)
const cotRows = [];
for (let i = 0; i < 20; i++) {
  cotRows.push({
    report_date_as_yyyy_mm_dd: `2026-06-${String(i + 1).padStart(2, '0')}T00:00:00.000`,
    m_money_positions_long_all: String(40000 + i * 2000),
    m_money_positions_short_all: '15000',
    open_interest_all: '150000',
  });
}
// Latest week washes out to bottom of range -> bullish contrarian bounce signal
cotRows.push({
  report_date_as_yyyy_mm_dd: '2026-11-10T00:00:00.000',
  m_money_positions_long_all: '36000',
  m_money_positions_short_all: '17000',
  open_interest_all: '148000',
});
const cotSilver = computeCotSignal(parseCftcCotRows(cotRows));
assert.ok(cotSilver.percentile52w <= 10, `Expected washed-out percentile, got ${cotSilver.percentile52w}`);
assert.ok(cotSilver.signal > 0.25, 'Washed-out positioning should produce contrarian bullish bounce signal');

// 9. Miners relative strength confirmation (GDX & SIL leading spot)
const minersSig = computeMinersConfirmation({
  gold: [3600, 3610, 3620, 3630, 3640, 3650, 3660, 3670, 3680, 3690, 3700],
  silver: [44.0, 44.1, 44.2, 44.3, 44.4, 44.5, 44.6, 44.7, 44.8, 44.9, 45.0],
  gdx: [42.0, 42.6, 43.1, 43.5, 44.0, 44.6, 45.0, 45.5, 46.1, 46.7, 47.4],
  sil: [60.0, 61.0, 61.8, 62.5, 63.4, 64.2, 65.0, 65.8, 66.5, 67.3, 68.4],
});
assert.ok(minersSig.gdxVsGold10dPct > 5, 'GDX outperforming gold should show positive relative strength');
assert.ok(minersSig.goldSignal > 0.3 && minersSig.silverSignal > 0.3);

// 10. News recency decay & Jaccard story clustering deduplicates duplicate rewrites
const nowMs = Date.parse('2026-11-19T18:00:00Z');
const freshW = recencyDecayWeight('2026-11-19T17:00:00Z', nowMs);
const staleW = recencyDecayWeight('2026-11-17T18:00:00Z', nowMs);
assert.ok(freshW > staleW * 2.5, `Expected fresh news (${freshW}) to outweigh 48h old news (${staleW})`);

const clustered = classifyHeadlines(
  [
    { title: 'Silver Institute forecasts sixth straight annual global silver supply deficit in 2026', source: 'Reuters', publishedAt: '2026-11-19T17:00:00Z' },
    { title: 'Silver Institute forecasts sixth straight annual global silver supply deficit for 2026', source: 'Random Blog', publishedAt: '2026-11-19T12:00:00Z' },
  ],
  nowMs
);
assert.equal(clustered.length, 1, 'Near-duplicate headlines should collapse into 1 cluster');
assert.equal(clustered[0].clusterCount, 2);
assert.equal(clustered[0].source, 'Reuters', 'Higher-tier & fresher source should win cluster lead');

// 11. Walk-forward accuracy logger auto-grades matured 7d predictions & backtester works
const oldCreated = new Date(nowMs - 8 * 86400000).toISOString();
const accResult = updateAccuracyLog({
  log: {
    predictions: [
      {
        id: '2026-11-11-gold',
        createdAt: oldCreated,
        metal: 'gold',
        spotAtForecast: 3680,
        score: 48,
        signal: 'Strong Bullish',
        horizon7d: { bear: 3610, base: 3725, bull: 3820, expectedPct: 1.22 },
        horizon30d: { bear: 3520, base: 3780, bull: 4010, expectedPct: 2.72 },
        graded7d: null,
        graded30d: null,
      },
    ],
  },
  outlook: buildOutlook({
    spotGold: 3742.5,
    spotSilver: 45.28,
    proSignals: { realYields: rySig, cot: { gold: cotSilver, silver: cotSilver }, miners: minersSig },
    generatedAt: new Date(nowMs).toISOString(),
  }),
  spotGold: 3742.5,
  spotSilver: 45.28,
  now: new Date(nowMs),
});
assert.equal(accResult.scorecard.live7d.count, 1);
assert.equal(accResult.scorecard.live7d.dirHitPct, 100);
assert.equal(accResult.scorecard.live7d.inConePct, 100);

const btSeries = Array.from({ length: 45 }, (_, i) => +(3500 + i * 5 + Math.sin(i) * 18).toFixed(2));
const bt = runWalkForwardBacktest({ gold: btSeries, silver: btSeries.map((v) => +(v / 82).toFixed(2)) });
assert.ok(bt.gold && bt.gold.samples >= 10 && bt.gold.inConePct >= 50);

// 12. Merton Jump-Diffusion Monte Carlo fat-tail quantiles & touch >= finish probability
const jdOutlook = buildOutlook({
  spotGold: 3742.5,
  spotSilver: 45.28,
  proSignals: { realYields: rySig, cot: { gold: cotSilver, silver: cotSilver }, miners: minersSig },
  generatedAt: new Date(nowMs).toISOString(),
});
const mcAg30 = jdOutlook.silver.jumpDiffusion30d;
assert.ok(mcAg30.p10 < mcAg30.p25 && mcAg30.p25 < mcAg30.p50 && mcAg30.p50 < mcAg30.p75 && mcAg30.p75 < mcAg30.p90);
assert.ok(mcAg30.milestones.upside.touchPct >= mcAg30.milestones.upside.finishPct);
assert.ok(mcAg30.samplePaths.length === 16 && mcAg30.curves.p90.length === 22);
assert.ok(jdOutlook.silver.jumpParams.expectedJumpsPerMonth > jdOutlook.gold.jumpParams.expectedJumpsPerMonth);

// 13. COMEX Paper Silver & Paper Gold Contracts vs. Registered Vault Stocks
const parsedOi = parseCftcOpenInterest(
  [
    { report_date_as_yyyy_mm_dd: '2026-11-17', open_interest_all: '142000', change_in_oi_all: '4100', swap_positions_short_all: '45000' },
    { report_date_as_yyyy_mm_dd: '2026-11-10', open_interest_all: '137900', change_in_oi_all: '1200', swap_positions_short_all: '44000' },
    { report_date_as_yyyy_mm_dd: '2026-11-03', open_interest_all: '125000', change_in_oi_all: '-500', swap_positions_short_all: '41000' },
  ],
  'silver'
);
assert.equal(parsedOi.openInterestContracts, 142000);
assert.equal(parsedOi.oiChangeContracts, 4100);
assert.equal(parsedOi.oiPct52w, 100);

const parsedVault = parseVaultHtml(
  '<p>COMEX silver inventory on Nov 17, 2026: 101.16M oz registered and 229.11M oz eligible. Stocks declined 1.9% over the past 30 days.</p>',
  'silver'
);
assert.equal(parsedVault.registeredOz, 101160000);
assert.equal(parsedVault.eligibleOz, 229110000);
assert.equal(parsedVault.registered30dPct, -1.9);

const squeezeComex = buildBaselineComexSnapshot({ price5dGoldPct: 1.5, price5dSilverPct: 2.5 });
assert.ok(squeezeComex.silver.paperToRegisteredRatio > 6.0);
assert.ok(squeezeComex.gold.paperToRegisteredRatio > 3.0);
assert.ok(squeezeComex.silver.signal > 0 && squeezeComex.gold.signal > 0);

const comexOutlook = buildOutlook({
  spotGold: 3742.5,
  spotSilver: 45.28,
  comex: squeezeComex,
  generatedAt: new Date(nowMs).toISOString(),
});
const comexDriver = comexOutlook.drivers.find((d) => d.id === 'comex_paper');
assert.ok(comexDriver && comexDriver.silver > 0 && comexDriver.gold > 0);
assert.match(comexOutlook.narrative, /COMEX paper claims stand at/);
assert.ok(comexOutlook.silver.jumpParams.lambda >= jdOutlook.silver.jumpParams.lambda * 0.9);

// 14. Institutional Microstructure & Catalyst Signals (Event Calendar, GVZ IV, ETF Flows, Copper/JPY, Basis)
const evRisk = getUpcomingEventRisk(new Date('2026-11-19T12:00:00Z'));
assert.ok(evRisk.nextEvent && evRisk.nextEvent.type === 'comex_fnd' && evRisk.nextEvent.date === '2026-11-30');
assert.ok(evRisk.upcoming.length === 3 && evRisk.jumpBoost > 0);
const evImminent = getUpcomingEventRisk(new Date('2026-12-08T12:00:00Z'));
assert.equal(evImminent.nextEvent.type, 'fomc');
assert.equal(evImminent.regime, 'Imminent Catalyst (<48h)');
assert.ok(evImminent.jumpBoost >= 0.2);

const ivSig = computeImpliedVolSignal([18.5, 19.1, 19.6, 20.2, 21.0, 22.4], 16.5);
assert.equal(ivSig.gvz, 22.4);
assert.ok(ivSig.ivMinusRv > 5 && ivSig.blendedGoldAnnPct > 19 && ivSig.jumpBoost > 0);

const upPrices = Array.from({ length: 26 }, (_, i) => +(100 + i * 0.6).toFixed(2));
const surgeVols = Array.from({ length: 26 }, (_, i) => (i >= 21 ? 1800000 : 1000000));
const pslvOutperf = Array.from({ length: 26 }, (_, i) => +(15 + i * 0.14).toFixed(2));
const etfSig = computeEtfFlowSignal({
  gldCloses: upPrices,
  gldVolumes: surgeVols,
  slvCloses: upPrices,
  slvVolumes: surgeVols,
  pslvCloses: pslvOutperf,
});
assert.ok(etfSig.goldSignal > 0.5 && etfSig.silverSignal > 0.5 && etfSig.gldVolRatio > 1.5);
assert.equal(etfSig.regime, 'Institutional Accumulation');

const crossSig = computeCrossMarketSignal({
  copper: Array.from({ length: 22 }, (_, i) => +(5.2 + i * 0.025).toFixed(3)),
  usdjpy: Array.from({ length: 22 }, (_, i) => +(156 - i * 0.25).toFixed(2)),
});
assert.ok(crossSig.cu5dPct > 0 && crossSig.jpy5dPct < 0 && crossSig.silverSignal > 0.2 && crossSig.goldSignal > 0.2);

const basisSig = computeBasisSignal({
  spotGold: 3742.5,
  futGold: 3748.2,
  spotSilver: 45.28,
  futSilver: 45.19,
});
assert.equal(basisSig.silver.state, 'Backwardation (Tight!)');
assert.ok(basisSig.silver.signal >= 0.45 && basisSig.silver.jumpBoost >= 0.2);

const instOutlook = buildOutlook({
  spotGold: 3742.5,
  spotSilver: 45.28,
  comex: squeezeComex,
  institutionalSignals: buildBaselineInstitutionalSignals(new Date('2026-11-19T12:00:00Z')),
  generatedAt: '2026-11-19T12:00:00Z',
});
assert.ok(instOutlook.institutionalSignals?.eventRisk?.nextEvent);
assert.match(instOutlook.narrative, /Next high-vol catalyst/);
assert.match(instOutlook.narrative, /backwardation/i);

// 15. Daily Post-Close Self-Learning (5:10 PM ET window, damped weight updates, clamps, once/day dedup)
// EST (Nov = UTC-5): 21:55 UTC = 4:55 PM ET (before close), 22:10 UTC = 5:10 PM ET (10m after close)
assert.equal(isPostCloseLearningWindow(new Date('2026-11-19T21:55:00Z')), false);
assert.equal(isPostCloseLearningWindow(new Date('2026-11-19T22:10:00Z')), true);
// EDT (Jul = UTC-4): 21:10 UTC = 5:10 PM EDT
assert.equal(isPostCloseLearningWindow(new Date('2026-07-15T21:10:00Z')), true);
// Weekend (Sat Nov 21, 2026): never runs
assert.equal(isPostCloseLearningWindow(new Date('2026-11-21T22:10:00Z')), false);

const initLearn = createInitialLearnedState();
const step1 = runDailyLearningStep({
  learnedState: initLearn,
  prevSnapshot: {
    dayKey: '2026-11-18',
    goldClose: 3700,
    silverClose: 44.5,
    pred1dGoldPct: 0.4,
    pred1dSilverPct: 0.65,
    halfCone1dGoldPct: 1.0,
    halfCone1dSilverPct: 2.0,
    drivers: [
      { id: 'comex_paper', gold: 0.85, silver: 0.90 },
      { id: 'equities', gold: -0.75, silver: -0.80 },
      { id: 'inflation', gold: 0.50, silver: 0.55 },
      { id: 'geopolitics', gold: 0.10, silver: 0.10 },
      { id: 'rates_usd', gold: 0.25, silver: 0.25 },
      { id: 'mining_supply', gold: 0.30, silver: 0.70 },
      { id: 'central_banks', gold: 0.45, silver: 0.30 },
      { id: 'shanghai_sge', gold: 0.60, silver: 0.60 },
      { id: 'positioning_miners', gold: 0.20, silver: 0.25 },
    ],
  },
  actualGoldClose: 3748.1, // +1.30% actual move
  actualSilverClose: 45.48, // +2.20% actual move
  nowDate: new Date('2026-11-19T22:10:00Z'),
});
assert.equal(step1.updated, true);
assert.equal(step1.graded, true);
assert.equal(step1.state.totalCycles, 1);
assert.ok(
  step1.state.weights.gold.comex_paper > initLearn.weights.gold.comex_paper,
  'Correctly aligned driver should gain weight'
);
assert.ok(
  step1.state.weights.gold.equities < initLearn.weights.gold.equities,
  'Misaligned driver should lose weight'
);
const sumG = Object.values(step1.state.weights.gold).reduce((a, b) => a + b, 0);
const sumS = Object.values(step1.state.weights.silver).reduce((a, b) => a + b, 0);
assert.ok(Math.abs(sumG - 1.0) < 0.002 && Math.abs(sumS - 1.0) < 0.002, 'Learned weights must sum to 1.000');
for (const w of [...Object.values(step1.state.weights.gold), ...Object.values(step1.state.weights.silver)]) {
  assert.ok(w >= LEARNING_CONFIG.minWeight - 0.001 && w <= LEARNING_CONFIG.maxWeight + 0.001);
}

// Strict once-per-NY-day dedup guard
const dupRun = runDailyLearningStep({
  learnedState: step1.state,
  actualGoldClose: 3755,
  actualSilverClose: 45.7,
  nowDate: new Date('2026-11-19T23:30:00Z'),
});
assert.equal(dupRun.updated, false);
assert.equal(dupRun.state.totalCycles, 1);

// Seeded state integrates cleanly into buildOutlook()
const seededLearn = buildSeededLearnedState();
assert.equal(seededLearn.totalCycles, 5);
assert.equal(seededLearn.history.length, 5);
const slOutlook = buildOutlook({
  spotGold: 3742.5,
  spotSilver: 45.28,
  comex: squeezeComex,
  institutionalSignals: buildBaselineInstitutionalSignals(new Date('2026-11-19T12:00:00Z')),
  learnedWeights: seededLearn,
  generatedAt: '2026-11-19T22:10:00Z',
});
assert.ok(slOutlook.selfLearning && slOutlook.selfLearning.totalCycles === 5);
assert.equal(slOutlook.selfLearning.lastLearnedDay, '2026-11-19');
assert.equal(slOutlook.selfLearning.recentHistory.length, 5);

// 16. Self-Learning v2 Optimizations (Holidays, Stale Guard, Huber Clip, Dual-Regime, Multi-Horizon, Auto-Rollback, Tail Calib)
assert.equal(isComexHoliday('2026-11-26'), true, 'Thanksgiving 2026 must be COMEX holiday');
assert.equal(isComexHoliday('2026-04-03'), true, 'Good Friday 2026 must be COMEX holiday');
assert.equal(isComexHoliday('2026-12-25'), true, 'Christmas 2026 must be COMEX holiday');
assert.equal(isComexHoliday('2026-11-19'), false, 'Regular trading day must not be holiday');
assert.equal(isPostCloseLearningWindow(new Date('2026-11-26T22:10:00Z')), false, 'No learning on Thanksgiving');

// Stale-close guard skips zero-change frozen feed
const staleRes = runDailyLearningStep({
  learnedState: seededLearn,
  prevSnapshot: { dayKey: '2026-11-19', goldClose: 3742.5, silverClose: 45.28, pred1dGoldPct: 0.4, pred1dSilverPct: 0.7, halfCone1dGoldPct: 1.0, halfCone1dSilverPct: 2.0, drivers: [] },
  actualGoldClose: 3742.5,
  actualSilverClose: 45.28,
  nowDate: new Date('2026-11-20T22:10:00Z'),
});
assert.equal(staleRes.updated, false);
assert.equal(staleRes.skipped, true);

// Huber outlier clipping damps >2.5σ extreme shocks
assert.ok(huberScale(9.0, 1.0) <= 1.15 && huberScale(9.0, 1.0) < huberScale(2.0, 1.0));

// Dual-regime detection & weight isolation ('calm' vs 'stress')
assert.equal(detectMarketRegime({ vix: 15, gvz: 16, silverBackwardation: false, comexSilverRatio: 4.5 }), 'calm');
assert.equal(detectMarketRegime({ vix: 18, gvz: 22.5, silverBackwardation: false }), 'stress');
assert.equal(detectMarketRegime({ vix: 15, gvz: 16, silverBackwardation: true }), 'stress');
assert.ok(seededLearn.regimeWeights?.calm && seededLearn.regimeWeights?.stress);
assert.notDeepEqual(seededLearn.regimeWeights.calm.gold, seededLearn.regimeWeights.stress.gold);

// Multi-horizon 1D+5D grading active in seeded state
assert.ok(seededLearn.summary.horizonsActive.includes('1D') && seededLearn.summary.horizonsActive.includes('5D'));

// Champion-Challenger Auto-Rollback triggers when learned Pinball Loss underperforms baseline over >=15 days
const badState = createInitialLearnedState();
badState.history = Array.from({ length: 16 }, (_, i) => ({
  date: `2026-10-${String(28 - i).padStart(2, '0')}`,
  goldPredPct: 0.3,
  goldActualPct: -0.5,
  goldErrPct: -0.8,
  dirHitGold: false,
  inConeGold: true,
  tailBreachGold: false,
  silverPredPct: 0.5,
  silverActualPct: -0.9,
  silverErrPct: -1.4,
  dirHitSilver: false,
  inConeSilver: true,
  tailBreachSilver: false,
  learnedPinball: 0.48,
  baselinePinball: 0.34,
}));
const rbRes = runDailyLearningStep({
  learnedState: badState,
  prevSnapshot: {
    dayKey: '2026-11-18',
    goldClose: 3700,
    silverClose: 44.5,
    pred1dGoldPct: 0.4,
    pred1dSilverPct: 0.6,
    halfCone1dGoldPct: 1.0,
    halfCone1dSilverPct: 2.0,
    drivers: [{ id: 'comex_paper', gold: 0.9, silver: 0.9 }],
  },
  actualGoldClose: 3660,
  actualSilverClose: 43.4,
  nowDate: new Date('2026-11-19T22:10:00Z'),
});
assert.equal(rbRes.rollbackActive, true);
assert.equal(rbRes.state.championChallenger.rollbackActive, true);
assert.equal(rbRes.state.championChallenger.status, 'auto_rollback_damped');

// Pinball loss sanity & Jump-Diffusion tail calibration scaling
assert.ok(computePinballLoss(0.5, 0.5, 1.0) < computePinballLoss(2.5, 0.5, 1.0));
const baseJp = estimateJumpParams({ metal: 'silver', dailyVol: 0.02, unitScore: 0.4, lambdaMult: 1.0, sigmaJMult: 1.0 });
const scaledJp = estimateJumpParams({ metal: 'silver', dailyVol: 0.02, unitScore: 0.4, lambdaMult: 1.25, sigmaJMult: 1.2 });
assert.ok(scaledJp.lambda > baseJp.lambda && scaledJp.jumpSigma > baseJp.jumpSigma);
assert.ok(slOutlook.selfLearning.jumpCalibration && slOutlook.selfLearning.championChallenger);

console.log('All 16 Bullion Pulse suites (Self-Learning v2 Multi-Horizon/Regimes/Auto-Rollback/Tail-Calib, Institutional Signals, COMEX Paper, Jump-Diffusion, FRED, COT, Miners, Shanghai & Accuracy) passed!');
