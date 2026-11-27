import assert from 'node:assert/strict';
import {
  analyzeMarketGaps,
  buildOutlook,
  classifyHeadline,
  classifyHeadlines,
  computeCrossAssetLeadLag,
  computeEmpiricalHistoricalTwins,
  computeMarketRegimeDecomposition,
  computeQuantSignals,
  computeRatioAnalytics,
  computeSetupQuality,
  computeWorldSpacePulse,
  parseNoaaSpaceWeather,
  project30DayPrecision,
  recencyDecayWeight,
} from './historical_patterns.mjs';
import {
  computeHurstExponent,
  computePrecisionForecastLine,
} from './precision_forecast.mjs';
import { computePhysicalPremiumSignals } from './physical_premiums.mjs';
import {
  computeSessionFlowDivergence,
  computeCurrencyBreakoutBreadth,
  computeSpringCoilingIndex,
  computeCrossAssetLiquidityCompass,
  computeContrarianCrowdingBrake,
  computeOpexDeliveryMagnet,
  computeHiddenAlphaSuite,
} from './hidden_alpha.mjs';
import { parseRssItems, sanitizeHttpUrl } from './analyze_outlook.mjs';
import {
  cnyPerGramToUsdPerOz,
  cnyPerKgToUsdPerOz,
  computeShanghaiMetrics,
  parseSgeHomepageHtml,
} from './shanghai.mjs';
import {
  SECTOR_COMPANIES,
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
  parseCmeStocksBuffer,
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
        spotAtForecast: 3625,
        score: -42,
        signal: 'Bearish Tilt',
        horizon7d: { bear: 3480, base: 3560, bull: 3650, expectedPct: -1.79 },
        horizon30d: { bear: 3410, base: 3590, bull: 3810, expectedPct: -0.97 },
        graded7d: null,
        graded30d: null,
      },
    ],
  },
  outlook: buildOutlook({
    spotGold: 3542.81,
    spotSilver: 42.22,
    proSignals: { realYields: rySig, cot: { gold: cotSilver, silver: cotSilver }, miners: minersSig },
    generatedAt: new Date(nowMs).toISOString(),
  }),
  spotGold: 3542.81,
  spotSilver: 42.22,
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
  spotGold: 3542.81,
  spotSilver: 42.22,
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
  spotGold: 3542.81,
  spotSilver: 42.22,
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
  spotGold: 3542.81,
  futGold: 3548.50,
  spotSilver: 42.22,
  futSilver: 42.13,
});
assert.equal(basisSig.silver.state, 'Backwardation (Tight!)');
assert.ok(basisSig.silver.signal >= 0.45 && basisSig.silver.jumpBoost >= 0.2);

const instOutlook = buildOutlook({
  spotGold: 3542.81,
  spotSilver: 42.22,
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
  spotGold: 3542.81,
  spotSilver: 42.22,
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
  prevSnapshot: { dayKey: '2026-11-19', goldClose: 3542.81, silverClose: 42.22, pred1dGoldPct: 0.4, pred1dSilverPct: 0.7, halfCone1dGoldPct: 1.0, halfCone1dSilverPct: 2.0, drivers: [] },
  actualGoldClose: 3542.81,
  actualSilverClose: 42.22,
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

// 17. Sector Bellwethers (9 Gold & Silver Miners) & Company Catalyst Headline Classification
assert.equal(SECTOR_COMPANIES.length, 9, 'Must track 9 Gold/Silver sector bellwether companies');
const sectorMinersSig = computeMinersConfirmation({
  gold: [3710, 3695, 3680, 3665, 3650, 3640, 3630, 3626, 3605, 3580, 3542.81],
  silver: [44.8, 44.5, 44.2, 43.9, 43.6, 43.4, 43.1, 42.84, 42.6, 42.4, 42.22],
  gdx: [78.0, 77.2, 76.5, 75.8, 74.9, 74.0, 73.2, 72.1, 71.0, 69.8, 68.5],
  sil: [56.0, 55.4, 54.8, 54.0, 53.3, 52.6, 51.8, 50.9, 50.1, 49.0, 47.9],
  nem: [86.0, 85.4, 84.8, 84.1, 83.6, 82.9, 82.2, 81.4, 80.5, 79.6, 78.6],
  aem: [172.0, 170.5, 169.0, 167.8, 166.2, 164.8, 163.5, 161.9, 160.5, 159.4, 158.24],
  b: [36.2, 35.9, 35.6, 35.4, 35.1, 34.8, 34.5, 34.1, 33.8, 33.4, 33.1],
  wpm: [128.0, 127.1, 126.2, 125.4, 124.5, 123.6, 122.9, 122.0, 120.8, 119.8, 118.9],
  fnv: [258.0, 256.2, 254.5, 253.0, 251.4, 249.8, 248.2, 247.4, 244.1, 240.8, 237.37],
  paas: [35.4, 35.1, 34.8, 34.5, 34.2, 33.9, 33.6, 33.7, 33.2, 32.8, 32.39],
  hl: [19.4, 19.2, 19.0, 18.8, 18.7, 18.6, 18.5, 18.5, 18.3, 18.25, 18.19],
  ag: [13.2, 13.0, 12.8, 12.6, 12.5, 12.3, 12.2, 12.0, 11.8, 11.6, 11.32],
  cde: [21.1, 20.9, 20.7, 20.5, 20.3, 20.1, 19.9, 19.8, 19.6, 19.4, 19.22],
});
assert.equal(sectorMinersSig.sectorLeaders.length, 9);
assert.ok(Array.isArray(sectorMinersSig.sectorLeaders[0].spark) && sectorMinersSig.sectorLeaders[0].spark.length === 11);
assert.ok(sectorMinersSig.sectorLeaders[0].high14 >= sectorMinersSig.sectorLeaders[0].low14);
assert.equal(sectorMinersSig.goldBreadthPct, 0);
assert.equal(sectorMinersSig.silverBreadthPct, 0);
assert.ok(sectorMinersSig.goldSignal < -0.15 && sectorMinersSig.silverSignal < -0.15);
assert.equal(sectorMinersSig.regime, 'Miners Lagging (Pressure)');

const quantMacro = computeQuantSignals({
  gold: [3600, 3590, 3580, 3570, 3560, 3542.81],
  silver: [43.5, 43.2, 43.0, 42.7, 42.5, 42.22],
  copper: [5.3, 5.35, 5.4, 5.5, 5.55, 5.62],
  platinum: [940, 945, 950, 952, 956, 960],
});
assert.equal(quantMacro.macroSnapshot.copper, 5.62);
assert.equal(quantMacro.macroSnapshot.platinum, 960);

const strikeCls = classifyHeadline({ title: 'First Majestic Silver Q3 output drops 41% on San Dimas labor strike' });
assert.ok(strikeCls && strikeCls.driver === 'mining_supply' && strikeCls.silverImpact > 0);
const aiscCls = classifyHeadline({ title: 'Newmont co-product AISC rises 25% YoY to $1,963/oz while free cash flow hits $1.9B' });
assert.ok(aiscCls && aiscCls.driver === 'mining_supply' && aiscCls.goldImpact > 0);
const rampCls = classifyHeadline({ title: 'Barrick Mining Loulo-Gounkoto ramps up 16% QoQ ahead of American Barrick IPO' });
assert.ok(rampCls && rampCls.driver === 'mining_supply' && rampCls.goldImpact < 0);

// 18. CME Official Vault Parser, Exact BLS CPI Schedule, OHLC GK+EWMA Volatility, RSI(14) & Backtest Skill Score
const fakeCmeBuf = Buffer.from(
  'DEPOSITORY SUMMARY\nTOTAL REGISTERED   14,175,200\nTOTAL ELIGIBLE    8,892,400\nCOMBINED TOTAL   23,067,600',
  'latin1'
);
const parsedCmeGold = parseCmeStocksBuffer(fakeCmeBuf, 'gold');
assert.ok(parsedCmeGold && parsedCmeGold.registeredOz === 14175200 && parsedCmeGold.eligibleOz === 8892400);
assert.equal(parsedCmeGold.vaultSource, 'CME Official Daily Stocks');

const evDec05 = getUpcomingEventRisk(new Date('2026-12-05T12:00:00Z'));
const decCpi = evDec05.upcoming.find((e) => e.type === 'cpi' && e.date.startsWith('2026-12'));
assert.ok(decCpi && decCpi.date === '2026-12-10', 'Verified Dec 2026 CPI must match BLS Dec 10 release date');

const n35 = Array.from({ length: 35 }, (_, i) => 4000 - i * 28);
const qRsi = computeQuantSignals({
  gold: n35,
  goldOpen: n35.map((c) => c + 12),
  goldHigh: n35.map((c) => c + 24),
  goldLow: n35.map((c) => c - 18),
  silver: n35.map((c) => c / 80),
});
assert.ok(qRsi.goldRsi14 != null && qRsi.goldRsi14 < 20, `Monotonic drop must trigger oversold RSI <20, got ${qRsi.goldRsi14}`);
assert.ok(qRsi.macroSnapshot.goldRsi14 === qRsi.goldRsi14 && qRsi.goldDailyVol >= 0.0055);

const calmCloses = Array.from({ length: 30 }, (_, i) => 3500 + (i % 2 === 0 ? 12 : -12));
const qCloseOnly = computeQuantSignals({ gold: calmCloses, silver: calmCloses.map((c) => c / 80) });
const qWideOhlc = computeQuantSignals({
  gold: calmCloses,
  goldOpen: calmCloses,
  goldHigh: calmCloses.map((c) => c + 95),
  goldLow: calmCloses.map((c) => c - 95),
  silver: calmCloses.map((c) => c / 80),
});
assert.ok(qWideOhlc.goldDailyVol > qCloseOnly.goldDailyVol, 'Garman-Klass intraday OHLC range must raise volatility estimate over calm closes');

const btSkill = runWalkForwardBacktest({
  gold: Array.from({ length: 45 }, (_, i) => 3500 + Math.sin(i / 4) * 90 + i * 2),
  silver: Array.from({ length: 45 }, (_, i) => 42 + Math.sin(i / 4) * 1.4 + i * 0.04),
  dxy: Array.from({ length: 45 }, (_, i) => 104 - Math.sin(i / 4) * 0.8),
  tnx: Array.from({ length: 45 }, (_, i) => 4.4 - Math.sin(i / 5) * 0.12),
  gdx: Array.from({ length: 45 }, (_, i) => 70 + Math.sin(i / 4) * 3.1 + i * 0.08),
  sil: Array.from({ length: 45 }, (_, i) => 48 + Math.sin(i / 4) * 2.2 + i * 0.06),
  copper: Array.from({ length: 45 }, (_, i) => 5.5 + Math.sin(i / 4) * 0.2),
  gvz: Array.from({ length: 45 }, () => 19.5),
});
assert.ok(btSkill.gold && Number.isFinite(btSkill.gold.pinballSkillPct));
assert.ok(btSkill.silver && Number.isFinite(btSkill.silver.pinballSkillPct));

// 19. US Dollar Strength (DXY) Multi-Timeframe Score, silverVsDxyCorr & 7D/30D FX Cost Impact
const strongDxySeries = Array.from({ length: 45 }, (_, i) => 100.5 + i * 0.18 + Math.sin(i / 2.2) * 0.22);
const weakDxySeries = Array.from({ length: 45 }, (_, i) => 104.5 - i * 0.20 + Math.sin(i / 2.2) * 0.22);
const invGoldFromStrongDxy = strongDxySeries.map((d) => 3650 - (d - 100) * 18);
const invSilverFromStrongDxy = strongDxySeries.map((d) => 43 - (d - 100) * 0.32);

const qStrongDxy = computeQuantSignals({
  gold: invGoldFromStrongDxy,
  silver: invSilverFromStrongDxy,
  dxy: strongDxySeries,
});
assert.ok(qStrongDxy.dollarStrength && qStrongDxy.dollarStrength.score >= 70, `Strong rising DXY must score >=70, got ${qStrongDxy.dollarStrength?.score}`);
assert.ok(qStrongDxy.dollarStrength.regime.includes('USD'), 'Must classify USD regime');
assert.ok(qStrongDxy.macroSnapshot.silverVsDxyCorr != null && qStrongDxy.macroSnapshot.silverVsDxyCorr < -0.5, 'Must compute inverse 60d silverVsDxyCorr');
assert.ok(qStrongDxy.macroSnapshot.dxy20dPct > 0 && qStrongDxy.macroSnapshot.dxyVsSma20Pct > 0);

const oStrongDxy = buildOutlook({
  spotGold: 3530,
  spotSilver: 41.2,
  series: { gold: invGoldFromStrongDxy, silver: invSilverFromStrongDxy, dxy: strongDxySeries },
});
const oWeakDxy = buildOutlook({
  spotGold: 3530,
  spotSilver: 41.2,
  series: {
    gold: weakDxySeries.map((d) => 3500 + (107 - d) * 18),
    silver: weakDxySeries.map((d) => 40 + (107 - d) * 0.32),
    dxy: weakDxySeries,
  },
});
assert.ok(oStrongDxy.dollarStrength?.impact7d?.goldUsdOz < 0, 'Strong USD must create negative Gold FX cost impact');
assert.ok(oStrongDxy.dollarStrength?.impact30d?.goldUsdOz < oStrongDxy.dollarStrength?.impact7d?.goldUsdOz, '30D FX drag magnitude must exceed 7D');
assert.ok(oWeakDxy.dollarStrength?.score <= 30 && oWeakDxy.dollarStrength?.impact7d?.goldUsdOz > 0, 'Weak USD must create positive Gold FX tailwind');
assert.ok(oStrongDxy.narrative.includes('US Dollar Index (DXY'), 'buildNarrative must include DXY strength synthesis');

// 20. Futures & Spot-to-Futures Backwardation Price-Discovery Lift
const backwBasis = computeBasisSignal({ spotGold: 3600, futGold: 3578, spotSilver: 44.0, futSilver: 43.35 });
const contangoBasis = computeBasisSignal({ spotGold: 3600, futGold: 3628, spotSilver: 44.0, futSilver: 44.32 });
assert.equal(backwBasis.gold.isBackwardation, true);
assert.equal(backwBasis.silver.isBackwardation, true);
assert.equal(backwBasis.gold.curveSlope, 'Downward-Sloping (Backwardation)');
assert.equal(backwBasis.silver.curveSlope, 'Downward-Sloping (Backwardation)');
assert.ok(backwBasis.gold.priceDiscoveryBoost > 0 && backwBasis.silver.priceDiscoveryBoost > 0);
assert.equal(contangoBasis.gold.isBackwardation, false);
assert.equal(contangoBasis.gold.priceDiscoveryBoost, 0);

const oBackw = buildOutlook({
  spotGold: 3600,
  spotSilver: 44.0,
  comex: buildBaselineComexSnapshot(),
  institutionalSignals: { ...buildBaselineInstitutionalSignals(), basis: backwBasis },
});
const oContango = buildOutlook({
  spotGold: 3600,
  spotSilver: 44.0,
  comex: buildBaselineComexSnapshot(),
  institutionalSignals: { ...buildBaselineInstitutionalSignals(), basis: contangoBasis },
});
assert.ok(oBackw.gold.score > oContango.gold.score, `Gold backwardation score (${oBackw.gold.score}) must exceed contango (${oContango.gold.score})`);
assert.ok(oBackw.silver.score > oContango.silver.score, `Silver backwardation score (${oBackw.silver.score}) must exceed contango (${oContango.silver.score})`);
assert.ok(oBackw.gold.horizon30d.base > oContango.gold.horizon30d.base, 'Gold backwardation 30d base target must exceed contango');
assert.ok(oBackw.silver.horizon30d.base > oContango.silver.horizon30d.base, 'Silver backwardation 30d base target must exceed contango');
assert.ok(oBackw.narrative.includes('downward-sloping backwardation'), 'Narrative must mention downward-sloping backwardation');

// 21. Short Squeeze vs. True Price Discovery Classifier (Discovery, Squeeze, Hybrid, Bias, Neutral & buildOutlook)
const mixedBasis = computeBasisSignal({ spotGold: 3600, futGold: 3622, spotSilver: 44.0, futSilver: 43.4 });
assert.equal(mixedBasis.gold.isBackwardation, false, 'Contango gold futures must set isBackwardation=false');
assert.equal(mixedBasis.silver.isBackwardation, true, 'Downward-sloping silver futures must set isBackwardation=true');

// 19a. True Price Discovery (structural repricing without acute squeeze catalysts)
const discRegime = computeMarketRegimeDecomposition({
  drivers: {
    rates_usd: { gold: 0.78, silver: 0.72 },
    shanghai_sge: { gold: 0.82, silver: 0.76 },
    central_banks: { gold: 0.85, silver: 0.7 },
    inflation: { gold: 0.65, silver: 0.6 },
    comex_paper: { gold: -0.05, silver: -0.05 },
  },
  quant: { goldTrend: 0.68, silverTrend: 0.62, macroSnapshot: { vix: 15.2 } },
  comex: {
    gold: { paperToRegisteredRatio: 2.1, registered30dPct: 2.4, oi4wPct: 0.5 },
    silver: { paperToRegisteredRatio: 3.1, registered30dPct: 1.8, oi4wPct: 0.4 },
  },
  proSignals: {
    miners: { goldSignal: 0.72, silverSignal: 0.68 },
    cot: { gold: { percentile52w: 72 }, silver: { percentile52w: 68 } },
  },
  institutionalSignals: {
    basis: {
      gold: { basisUsd: 24.0, basisPct: 0.68, isBackwardation: false },
      silver: { basisUsd: 0.35, basisPct: 0.82, isBackwardation: false },
    },
    impliedVol: { gvz: 15.4, ivMinusRv: -0.8 },
  },
});
assert.equal(discRegime.gold.label, 'True Price Discovery', `Expected True Price Discovery for Gold, got ${discRegime.gold.label} (${discRegime.gold.discoveryScore}D/${discRegime.gold.squeezeScore}S)`);
assert.equal(discRegime.silver.label, 'True Price Discovery', `Expected True Price Discovery for Silver, got ${discRegime.silver.label} (${discRegime.silver.discoveryScore}D/${discRegime.silver.squeezeScore}S)`);
assert.ok(discRegime.gold.discoveryScore >= 70 && discRegime.gold.squeezeScore < 25);

// 19b. Short Squeeze (COMEX leverage + backwardation + washed-out COT <= 35% + ^GVZ gamma, weak structural drivers)
const sqzRegime = computeMarketRegimeDecomposition({
  drivers: {
    rates_usd: { gold: -0.45, silver: -0.5 },
    shanghai_sge: { gold: -0.25, silver: -0.35 },
    central_banks: { gold: -0.6, silver: -0.7 },
    inflation: { gold: -0.2, silver: -0.25 },
    comex_paper: { gold: 0.72, silver: 0.88 },
  },
  quant: { goldTrend: -0.35, silverTrend: -0.4, macroSnapshot: { vix: 31 } },
  comex: {
    gold: { paperToRegisteredRatio: 5.1, registered30dPct: -8.5, oi4wPct: 11.2 },
    silver: { paperToRegisteredRatio: 7.4, registered30dPct: -9.2, oi4wPct: 14.0 },
  },
  proSignals: {
    miners: { goldSignal: -0.45, silverSignal: -0.5 },
    cot: { gold: { percentile52w: 14 }, silver: { percentile52w: 6 } },
  },
  institutionalSignals: {
    basis: {
      gold: { basisUsd: -14.0, basisPct: -0.4, isBackwardation: true },
      silver: { basisUsd: -0.45, basisPct: -1.05, isBackwardation: true },
    },
    impliedVol: { gvz: 33.5, ivMinusRv: 14.2 },
  },
});
assert.equal(sqzRegime.gold.label, 'Short Squeeze', `Expected Short Squeeze for Gold, got ${sqzRegime.gold.label} (${sqzRegime.gold.discoveryScore}D/${sqzRegime.gold.squeezeScore}S)`);
assert.equal(sqzRegime.silver.label, 'Short Squeeze', `Expected Short Squeeze for Silver, got ${sqzRegime.silver.label} (${sqzRegime.silver.discoveryScore}D/${sqzRegime.silver.squeezeScore}S)`);
assert.ok(sqzRegime.silver.squeezeScore >= 80 && sqzRegime.silver.discoveryScore < 40);
assert.equal(sqzRegime.silver.isBackwardation, true);

// 19c. Hybrid: Squeeze + Discovery (both structural repricing AND mechanical squeeze catalysts firing)
const hybridRegime = computeMarketRegimeDecomposition({
  drivers: {
    rates_usd: { gold: 0.75, silver: 0.72 },
    shanghai_sge: { gold: 0.85, silver: 0.8 },
    central_banks: { gold: 0.78, silver: 0.68 },
    inflation: { gold: 0.65, silver: 0.62 },
    comex_paper: { gold: 0.75, silver: 0.85 },
  },
  quant: { goldTrend: 0.62, silverTrend: 0.58, macroSnapshot: { vix: 28 } },
  comex: {
    gold: { paperToRegisteredRatio: 4.9, registered30dPct: -7.5, oi4wPct: 9.0 },
    silver: { paperToRegisteredRatio: 7.2, registered30dPct: -8.0, oi4wPct: 12.0 },
  },
  proSignals: {
    miners: { goldSignal: 0.68, silverSignal: 0.64 },
    cot: { gold: { percentile52w: 18 }, silver: { percentile52w: 10 } },
  },
  institutionalSignals: {
    basis: {
      gold: { basisUsd: -8.0, basisPct: -0.22, isBackwardation: true },
      silver: { basisUsd: -0.35, basisPct: -0.85, isBackwardation: true },
    },
    impliedVol: { gvz: 30.0, ivMinusRv: 11.0 },
  },
});
assert.equal(hybridRegime.gold.label, 'Hybrid: Squeeze + Discovery');
assert.equal(hybridRegime.silver.label, 'Hybrid: Squeeze + Discovery');
assert.ok(hybridRegime.gold.discoveryScore >= 58 && hybridRegime.gold.squeezeScore >= 58);

// 19d. Consolidation / Neutral (balanced signals)
const neutralRegime = computeMarketRegimeDecomposition({
  drivers: {
    rates_usd: { gold: 0, silver: 0 },
    shanghai_sge: { gold: 0, silver: 0 },
    central_banks: { gold: 0, silver: 0 },
    inflation: { gold: 0, silver: 0 },
    comex_paper: { gold: 0, silver: 0 },
  },
  quant: { goldTrend: 0, silverTrend: 0, macroSnapshot: { vix: 16.0 } },
  comex: {
    gold: { paperToRegisteredRatio: 2.1, registered30dPct: 0.5, oi4wPct: 0 },
    silver: { paperToRegisteredRatio: 3.2, registered30dPct: 0.5, oi4wPct: 0 },
  },
  proSignals: {
    miners: { goldSignal: 0, silverSignal: 0 },
    cot: { gold: { percentile52w: 60 }, silver: { percentile52w: 60 } },
  },
  institutionalSignals: {
    basis: {
      gold: { basisUsd: 20.0, basisPct: 0.58, isBackwardation: false },
      silver: { basisUsd: 0.25, basisPct: 0.60, isBackwardation: false },
    },
    impliedVol: { gvz: 16.0, ivMinusRv: 0 },
  },
});
assert.equal(neutralRegime.gold.label, 'Consolidation / Neutral');
assert.equal(neutralRegime.silver.label, 'Consolidation / Neutral');

// 19e. buildOutlook & buildNarrative integration
const regimeOutlook = buildOutlook({
  spotGold: 3530,
  spotSilver: 41.2,
  comex: buildBaselineComexSnapshot(),
  institutionalSignals: buildBaselineInstitutionalSignals(),
  proSignals: {
    cot: { gold: { percentile52w: 18, signal: 0.45 }, silver: { percentile52w: 8, signal: 0.6 } },
    miners: { goldSignal: 0.2, silverSignal: 0.15, goldBreadthPct: 60, silverBreadthPct: 50 },
  },
});
assert.ok(regimeOutlook.marketRegime?.gold && regimeOutlook.marketRegime?.silver, 'buildOutlook must attach marketRegime');
assert.ok(regimeOutlook.gold.regime && regimeOutlook.silver.regime, 'buildOutlook must attach per-metal regime');
assert.ok(regimeOutlook.narrative.includes('Regime decomposition:'), 'buildNarrative must include regime decomposition');

// 22. Regime-Aware Asymmetric Jump-Diffusion & Squeeze Exhaustion / Slam Risk
const neutralJp = estimateJumpParams({
  metal: 'silver',
  dailyVol: 0.022,
  unitScore: 0.1,
  regime: { discoveryScore: 45, squeezeScore: 25, isBackwardation: false },
  rsi14: 52,
});
const squeezeJp = estimateJumpParams({
  metal: 'silver',
  dailyVol: 0.022,
  unitScore: 0.1,
  regime: { discoveryScore: 48, squeezeScore: 76, isBackwardation: true },
  rsi14: 64,
});
const exhaustionJp = estimateJumpParams({
  metal: 'silver',
  dailyVol: 0.022,
  unitScore: 0.25,
  regime: { discoveryScore: 34, squeezeScore: 78, isBackwardation: true },
  rsi14: 83,
});
assert.ok(squeezeJp.jumpMean > neutralJp.jumpMean, `Squeeze right-tail jumpMean (${squeezeJp.jumpMean}) must exceed neutral (${neutralJp.jumpMean})`);
assert.ok(squeezeJp.lambda > neutralJp.lambda, 'Squeeze regime must lift Poisson jump intensity lambda');
assert.equal(squeezeJp.exhaustionRisk, false);
assert.equal(exhaustionJp.exhaustionRisk, true, 'High squeeze + weak discovery + RSI >= 78 must trigger Squeeze Exhaustion flag');
assert.ok(exhaustionJp.exhaustionLabel.includes('Slam Risk'));
assert.ok(exhaustionJp.jumpMean < squeezeJp.jumpMean, 'Exhaustion slam risk must flip jump skew downward vs active squeeze');
assert.ok(exhaustionJp.jumpSigma > neutralJp.jumpSigma, 'Exhaustion slam risk must widen tail jumpSigma');

// 23. Gold/Silver Ratio Z-Score, 5-Year Percentile & Swap Signal
const highRatio = computeRatioAnalytics({ ratio: 94.5 });
const lowRatio = computeRatioAnalytics({ ratio: 63.0 });
const fairRatio = computeRatioAnalytics({ ratio: 81.0 });
assert.ok(highRatio.zScore > 1.0 && highRatio.percentile5y >= 85, `Ratio 94.5 must be > +1σ & >= 85th pct, got Z=${highRatio.zScore}, pct=${highRatio.percentile5y}`);
assert.equal(highRatio.swapBias, 'Rotate Gold → Silver');
assert.ok(lowRatio.zScore < -1.0 && lowRatio.percentile5y <= 15, `Ratio 63.0 must be < -1σ & <= 15th pct, got Z=${lowRatio.zScore}, pct=${lowRatio.percentile5y}`);
assert.equal(lowRatio.swapBias, 'Rotate Silver → Gold');
assert.equal(fairRatio.swapBias, 'Hold / Neutral');
assert.ok(regimeOutlook.ratioAnalytics && Number.isFinite(regimeOutlook.ratioAnalytics.zScore), 'buildOutlook must attach ratioAnalytics');

// 24. Plain-English Setup Quality / Actionability Classifier
const sqExhaustion = computeSetupQuality({
  metal: 'silver',
  spot: 45,
  regime: { discoveryScore: 34, squeezeScore: 75, isBackwardation: true },
  rsi14: 82,
  dailyVol: 0.022,
  unitScore: 0.2,
});
assert.equal(sqExhaustion.label, 'Squeeze Exhaustion — Slam Risk');
assert.equal(sqExhaustion.tone, 'bearish');
assert.ok(sqExhaustion.support < 45 && sqExhaustion.resistance > 45);

const sqDipBuy = computeSetupQuality({
  metal: 'gold',
  spot: 3500,
  regime: { discoveryScore: 62, squeezeScore: 30, isBackwardation: false },
  rsi14: 28,
  dailyVol: 0.012,
  unitScore: 0.18,
});
assert.equal(sqDipBuy.label, 'Accumulation / Dip-Buy Zone');
assert.equal(sqDipBuy.tone, 'bullish');
assert.ok(sqDipBuy.score >= 70);

const sqHeadwind = computeSetupQuality({
  metal: 'gold',
  spot: 3500,
  regime: { discoveryScore: 32, squeezeScore: 22, isBackwardation: false },
  rsi14: 48,
  dailyVol: 0.012,
  dollarStrength: { score: 74 },
  unitScore: -0.35,
});
assert.equal(sqHeadwind.label, 'Macro Headwind — Wait');
assert.equal(sqHeadwind.tone, 'bearish');
assert.ok(regimeOutlook.setupQuality?.gold && regimeOutlook.setupQuality?.silver, 'buildOutlook must attach setupQuality');

// 25. Security: RSS URL scheme sanitization blocks javascript:/data:/vbscript: XSS payloads
assert.equal(sanitizeHttpUrl('https://example.com/gold?q=1'), 'https://example.com/gold?q=1');
assert.equal(sanitizeHttpUrl('javascript:alert(document.domain)'), '');
assert.equal(sanitizeHttpUrl('data:text/html,<script>alert(1)</script>'), '');
assert.equal(sanitizeHttpUrl('vbscript:msgbox(1)'), '');
const evilRss = `
  <rss><channel>
    <item><title>Safe Story</title><link>https://reuters.com/markets/gold</link></item>
    <item><title>Poisoned Story</title><link>javascript:alert(1)</link></item>
    <item><title>Data URI Story</title><link>data:text/html,&lt;svg/onload=alert(1)&gt;</link></item>
  </channel></rss>
`;
const parsedEvil = parseRssItems(evilRss, 'TestFeed');
assert.equal(parsedEvil.length, 3);
assert.equal(parsedEvil[0].url, 'https://reuters.com/markets/gold');
assert.equal(parsedEvil[1].url, '', 'javascript: link must be stripped at RSS ingestion');
assert.equal(parsedEvil[2].url, '', 'data: link must be stripped at RSS ingestion');

// 26. Market Gap Analyzer (Bullish Gap Up, Bearish Gap Down, Fill Progress, and Forecast Score Boost)
const tBase = Date.UTC(2026, 10, 20, 21, 55); // Fri close
const tSunOpen = Date.UTC(2026, 10, 22, 23, 0); // Sun open (weekend gap!)
const gapUpBars = [
  { t: tBase, o: 3532, h: 3541, l: 3530, c: 3539 },
  { t: tSunOpen, o: 3572, h: 3592, l: 3572, c: 3588 },
  { t: tSunOpen + 300000, o: 3588, h: 3605, l: 3586, c: 3602 },
];
const gUpRes = analyzeMarketGaps(gapUpBars, 3602, 'gold', '1d');
assert.equal(gUpRes.bias, 'bullish');
assert.equal(gUpRes.status, 'Gap Up · Bullish ↑');
assert.equal(gUpRes.primary.kind, 'Weekend Gap');
assert.equal(gUpRes.primary.fillTarget, 3539);
assert.equal(gUpRes.primary.fillPct, 0);
assert.ok(gUpRes.primary.moveToFillUsd < -60, 'Unfilled Gap Up must require a negative drop to fill');
assert.ok(gUpRes.predictionBoost > 0.05, 'Unfilled Gap Up must boost bullish prediction');

// Partial fill (~50%) reduces fill gap & prediction boost proportionally
const gHalfRes = analyzeMarketGaps(
  [...gapUpBars, { t: tSunOpen + 600000, o: 3602, h: 3602, l: 3555.5, c: 3560 }],
  3560,
  'gold',
  '1d'
);
assert.ok(gHalfRes.primary.fillPct >= 45 && gHalfRes.primary.fillPct <= 55, `Expected ~50% fill, got ${gHalfRes.primary.fillPct}`);
assert.ok(gHalfRes.predictionBoost > 0 && gHalfRes.predictionBoost < gUpRes.predictionBoost, 'Partial fill must decay boost cleanly');

const gapDnBars = [
  { t: tBase, o: 42.2, h: 42.4, l: 41.9, c: 42.1 },
  { t: tSunOpen, o: 41.1, h: 41.2, l: 40.6, c: 40.7 },
];
const sDnRes = analyzeMarketGaps(gapDnBars, 40.7, 'silver', '1d');
assert.equal(sDnRes.bias, 'bearish');
assert.equal(sDnRes.status, 'Gap Down · Bearish ↓');
assert.equal(sDnRes.primary.fillTarget, 42.1);
assert.ok(sDnRes.primary.moveToFillUsd > 1.3, 'Unfilled Gap Down must require a positive rally to fill');
assert.ok(sDnRes.predictionBoost < -0.05, 'Unfilled Gap Down must apply bearish drag to prediction');

const gapFilledBars = [
  ...gapUpBars,
  { t: tSunOpen + 600000, o: 3602, h: 3602, l: 3536, c: 3544 },
];
const gFilledRes = analyzeMarketGaps(gapFilledBars, 3544, 'gold', '1d');
assert.equal(gFilledRes.primary.isFilled, true);
assert.equal(gFilledRes.primary.fillPct, 100);
assert.equal(gFilledRes.predictionBoost, 0, 'Filled gap must no longer bias prediction');

const baseNoGapOut = buildOutlook({ spotGold: 3602, spotSilver: 40.7, rawHeadlines: [] });
const withGapOut = buildOutlook({
  spotGold: 3602,
  spotSilver: 40.7,
  rawHeadlines: [],
  candles: { gold: gapUpBars, silver: gapDnBars },
});
assert.ok(withGapOut.gold.score > baseNoGapOut.gold.score, 'Unfilled Gold Gap Up must lift Gold forecast score');
assert.ok(withGapOut.silver.score < baseNoGapOut.silver.score, 'Unfilled Silver Gap Down must lower Silver forecast score');
assert.ok(withGapOut.marketGaps?.gold?.primary && withGapOut.marketGaps?.silver?.primary, 'buildOutlook must attach marketGaps');

// Aged unfilled gap (>5d decays weight & marks Breakaway Gap (Confirmed); >=10d retires boost to 0)
const aged5dBars = [
  ...gapUpBars,
  { t: tSunOpen + 5 * 86400000, o: 3602, h: 3640, l: 3598, c: 3630 },
];
const gAged5d = analyzeMarketGaps(aged5dBars, 3630, 'gold', '1d');
assert.equal(gAged5d.primary.isBreakawayAged, true);
assert.equal(gAged5d.primary.kind, 'Breakaway Gap (Confirmed)');
assert.ok(gAged5d.predictionBoost > 0 && gAged5d.predictionBoost < gUpRes.predictionBoost, '5-day old unfilled gap must decay prediction boost');

const aged12dBars = [
  ...gapUpBars,
  { t: tSunOpen + 12 * 86400000, o: 3602, h: 3660, l: 3600, c: 3655 },
];
const gAged12d = analyzeMarketGaps(aged12dBars, 3655, 'gold', '1d');
assert.equal(gAged12d.predictionBoost, 0, '10+ day old unfilled gap must retire boost to 0');
assert.equal(gAged12d.status, 'Breakaway (Aged)');

// 27. v48 Precision Forecast Line, Hurst Regime, 30-Day Ensemble Roadmap, NOAA Space Weather & 1D/7D/30D Causal Backtest
// 27a. Hurst Exponent detects strong persistent trend (>0.56) vs choppy mean-reversion (<0.46)
const trendSeries = Array.from({ length: 40 }, (_, i) => 3500 + i * 11 + Math.sin(i * 0.4) * 2);
const chopSeries = Array.from({ length: 40 }, (_, i) => 3500 + (i % 2 === 0 ? 18 : -18));
const hTrend = computeHurstExponent(trendSeries);
const hChop = computeHurstExponent(chopSeries);
assert.ok(hTrend.hurst > 0.56, `Persistent trend should yield Hurst > 0.56, got ${hTrend.hurst}`);
assert.ok(hChop.hurst < 0.46, `Oscillating mean-reverting series should yield Hurst < 0.46, got ${hChop.hurst}`);

// 27b. Precision Forecast Line (4-specialist stacking + conformal calibration + horizon scaling)
const t0Bar = Date.UTC(2026, 10, 20, 12, 0);
const mkSynthBars = (count, stepMs, startP, slopePerBar, amp) =>
  Array.from({ length: count }, (_, i) => {
    const o = startP + i * slopePerBar + Math.sin(i * 0.6) * amp;
    const c = o + slopePerBar * 0.8 + Math.cos(i * 0.7) * (amp * 0.4);
    return { t: t0Bar + i * stepMs, o, h: Math.max(o, c) + amp * 0.7, l: Math.min(o, c) - amp * 0.7, c };
  });
const bars15m = mkSynthBars(36, 60000, 3600, 0.25, 0.8);
const bars1d = mkSynthBars(48, 1800000, 3580, 1.1, 4.5);
const bars1m = mkSynthBars(45, 86400000, 3420, 4.2, 16);

const fc15m = computePrecisionForecastLine({ bars: bars15m, tf: '15min', metal: 'gold', macroUnit: 0.4 });
const fc1d = computePrecisionForecastLine({ bars: bars1d, tf: '1d', metal: 'gold', macroUnit: 0.4 });
const fc1m = computePrecisionForecastLine({ bars: bars1m, tf: '1m', metal: 'gold', macroUnit: 0.4, seasonalityTilt: 0.10 });
assert.ok(fc15m && fc1d && fc1m, 'Precision forecast must compute cleanly across 15m, 1D, and 1M');
assert.equal(fc15m.horizonLabel, '+15m');
assert.equal(fc1d.horizonLabel, '+24H');
assert.equal(fc1m.horizonLabel, '+1M');
assert.ok(fc15m.wTechPct > fc1d.wTechPct && fc1d.wTechPct > fc1m.wTechPct, 'Auto-blend must shift smoothly from Tech on 15m to Macro on 1M');
assert.ok(Math.abs(fc15m.deltaPct) < Math.abs(fc1m.deltaPct), 'Tight 15m horizon excursion must stay much smaller than 1M horizon');
assert.equal(fc1d.ensembleBreakdown.length, 4, 'Must stack all 4 specialist models');
assert.ok(fc1d.calibration.samples >= 3 && fc1d.calibration.conformalRadiusPct >= 0, 'Causal walk-forward conformal calibration must run');

// 27c. NOAA Space Weather & Dynamic World/Space Pulse + Space RSS classification
const swQuiet = parseNoaaSpaceWeather({ '0': { G: { Scale: '0' }, S: { Scale: '0' }, R: { Scale: '0' } } });
assert.equal(swQuiet.goldBoost, 0);
assert.equal(swQuiet.silverBoost, 0);
const swSevere = parseNoaaSpaceWeather({ '0': { G: { Scale: '4' }, S: { Scale: '2' }, R: { Scale: '3' } }, '1': { G: { Scale: '3' } } });
assert.ok(swSevere.goldBoost > 0.10 && swSevere.silverBoost > 0.12, 'Severe G4 solar storm must lift safe-haven Gold & Silver grid/solar boost');
assert.ok(swSevere.jumpBoost > 0.02, 'Severe G4 storm must add jump-risk sensitivity');

const spaceHeadline = classifyHeadline({
  title: 'NOAA warns severe G4 geomagnetic storm and X-class solar flare risk power grid blackout',
  publishedAt: new Date().toISOString(),
  source: 'Space Weather News',
});
assert.equal(spaceHeadline.driver, 'geopolitics');
assert.ok(spaceHeadline.goldImpact > 0, 'Severe solar storm headline must score bullish safe-haven Gold');

const baseCalmOut = buildOutlook({ spotGold: 3600, spotSilver: 43, rawHeadlines: [], spaceWeather: swQuiet });
const stormOut = buildOutlook({ spotGold: 3600, spotSilver: 43, rawHeadlines: [], spaceWeather: swSevere });
assert.ok(stormOut.gold.score > baseCalmOut.gold.score, 'Live severe G4 space weather must dynamically lift Gold outlook score');
assert.ok(stormOut.silver.score > baseCalmOut.silver.score, 'Live severe G4 space weather must dynamically lift Silver outlook score');
assert.ok(stormOut.worldSpacePulse?.activityScore > baseCalmOut.worldSpacePulse?.activityScore, 'World & Space catalyst pulse must rise during severe storm');

// 27d. Next 30 Days Precision Roadmap + Empirical Historical Twins + 1D/7D/30D Walk-Forward Backtest
const gold6m = Array.from({ length: 120 }, (_, i) => 3300 + i * 2.5 + Math.sin(i * 0.25) * 45);
const silver6m = Array.from({ length: 120 }, (_, i) => 38 + i * 0.045 + Math.sin(i * 0.27) * 1.4);
const dxy6m = Array.from({ length: 120 }, (_, i) => 105 - i * 0.02 + Math.cos(i * 0.22) * 0.9);
const tnx6m = Array.from({ length: 120 }, (_, i) => 4.35 - i * 0.002 + Math.sin(i * 0.18) * 0.12);
const twinsRes = computeEmpiricalHistoricalTwins({ closes: gold6m, dxy: dxy6m, horizonDays: 21 });
assert.ok(twinsRes && twinsRes.count >= 1 && twinsRes.matchPct >= 45, 'Empirical historical twins must match strictly causal prior windows');

const out30 = buildOutlook({
  spotGold: gold6m[gold6m.length - 1],
  spotSilver: silver6m[silver6m.length - 1],
  rawHeadlines: [],
  series: { gold: gold6m, silver: silver6m, dxy: dxy6m, tnx: tnx6m },
});
assert.equal(out30.gold.horizon30d.milestones.length, 4, '30-Day forecast must emit Day 7, 14, 21, 30 checkpoints');
assert.equal(out30.gold.horizon30d.milestones[3].day, 30);
assert.equal(out30.gold.horizon30d.modelVotes.length, 4, '30-Day model must emit 4 specialist votes');
assert.ok(out30.gold.horizon30d.probHigherPct >= 12 && out30.gold.horizon30d.probHigherPct <= 88);
assert.ok(out30.gold.horizon30d.seasonality?.windowLabel, '30-Day model must attach 20-Yr seasonality');

const wfAudit = runWalkForwardBacktest({ gold: gold6m, silver: silver6m, dxy: dxy6m, tnx: tnx6m });
assert.ok(wfAudit.gold && wfAudit.silver, '7D walk-forward backtest must remain populated');
assert.ok(wfAudit.gold30d && wfAudit.silver30d, '30D walk-forward backtest must be computed causally');
assert.ok(wfAudit.gold1d && wfAudit.silver1d, '1D walk-forward backtest must be computed causally');
assert.ok(wfAudit.gold30d.conformalRadiusPct >= 0 && wfAudit.gold30d.recentCheckpoints.length >= 3, '30D backtest must include conformal radius & checkpoints');

const accPending = updateAccuracyLog({
  log: { predictions: [] },
  outlook: out30,
  spotGold: gold6m[gold6m.length - 1],
  spotSilver: silver6m[silver6m.length - 1],
  now: new Date('2026-11-26T18:00:00Z'),
});
assert.equal(accPending.scorecard.pendingStatus.next7dInDays, 7);
assert.equal(accPending.scorecard.pendingStatus.next30dInDays, 30);

// 28. v50 Expanded Multi-Subject News Classification (16 feeds, 7 topics, up to 28 stories) & Global Events Calendar
const hTech = classifyHeadline({ title: 'AI data center and solid-state battery silver paste demand surges to record high', source: 'Reuters' });
assert.ok(hTech && hTech.driver === 'mining_supply' && hTech.topic === 'tech_solar_ai' && hTech.silverImpact > 0, 'AI/solid-state silver story must map to tech_solar_ai & bullish Silver');

const hBrics = classifyHeadline({ title: 'BRICS sovereign gold reserve repatriation and PAXG tokenized gold inflows surge', source: 'Bloomberg' });
assert.ok(hBrics && hBrics.driver === 'central_banks' && hBrics.topic === 'central_banks' && hBrics.goldImpact > 0, 'BRICS/PAXG story must map to central_banks & bullish Gold');

const hLbma = classifyHeadline({ title: 'LBMA London bullion vault drawdown pushes silver lease rate spike into backwardation', source: 'Financial Times' });
assert.ok(hLbma && hLbma.driver === 'comex_paper' && hLbma.topic === 'vaults_physical' && hLbma.silverImpact > 0, 'LBMA lease rate spike must map to vaults_physical & bullish');

const hIndia = classifyHeadline({ title: 'India gold and silver imports surge ahead of Diwali as Dubai bullion premiums climb', source: 'Kitco' });
assert.ok(hIndia && hIndia.topic === 'asia_retail' && hIndia.goldImpact > 0, 'India/Dubai bullion rush must map to asia_retail & bullish');

const hHormuz = classifyHeadline({ title: 'Strait of Hormuz shipping disruption fears spark safe-haven gold rally', source: 'WSJ' });
assert.ok(hHormuz && hHormuz.driver === 'geopolitics' && hHormuz.topic === 'geo_space' && hHormuz.goldImpact > 0, 'Chokepoint shipping crisis must map to geo_space & bullish Gold');

const manyRaw = [
  'Fed cuts rates as Treasury yield plunges sharply',
  'PBOC and Poland central bank gold reserve buying hits record',
  'Solar TOPCon silver paste demand jumps on photovoltaic boom',
  'LBMA silver lease rate spikes amid London vault drain',
  'India silver imports surge as MCX and Diwali demand climb',
  'US national debt crisis deepens as Treasury auction tails',
  'NOAA warns G4 geomagnetic solar flare risk for power grids',
  'Strait of Hormuz shipping crisis sends crude oil spiking',
  'Costco gold bars and US Mint silver eagle coins sold out',
  'PAXG tokenized gold and Basel III Tier 1 demand surges',
  'Newmont and Barrick report mine strike labor disruption',
  'Shanghai SGE Ag(T+D) physical premium surges over London',
  'COMEX silver registered vault inventory drops to record low',
  'Bank stress and stock market selloff spark safe-haven buying',
  'Space economy satellite constellation launches lift aerospace silver',
  'OPEC crude oil shock fuels sticky inflation and stagflation fears',
].map((title, idx) => ({ title, source: 'Reuters', publishedAt: new Date(Date.now() - idx * 3600000).toISOString() }));
const outMany = buildOutlook({ spotGold: 3610, spotSilver: 42.8, rawHeadlines: manyRaw });
assert.ok(outMany.headlines.length >= 14, `Expanded outlook should retain >12 stories (got ${outMany.headlines.length})`);
assert.ok(Object.keys(outMany.topicCoverage || {}).length >= 5, 'topicCoverage must span at least 5 Gold & Silver subject domains');

const evExpanded = getUpcomingEventRisk(new Date('2026-11-26T12:00:00Z'));
assert.ok(Array.isArray(evExpanded.expandedEvents) && evExpanded.expandedEvents.length >= 6, 'Expanded global calendar must return >= 6 multi-category events');
const expCats = new Set(evExpanded.expandedEvents.map((e) => e.category));
assert.ok(expCats.size >= 3, `Expanded calendar must cover multiple categories (got ${[...expCats].join(', ')})`);

// 29. v50 Physical Bullion Premiums vs. Spot & Melt (Squeeze, Paper-Physical Disconnect, Above-Spot Buyback & Forecast Lift)
const calmPhys = computePhysicalPremiumSignals({
  spotGold: 3600,
  spotSilver: 42.5,
  spotGoldDailyPct: 0.2,
  spotSilverDailyPct: 0.3,
  vix: 15,
});
assert.equal(calmPhys.gold.products.length, 3);
assert.equal(calmPhys.silver.products.length, 3);
assert.ok(calmPhys.gold.compositePremPct >= 2 && calmPhys.gold.compositePremPct <= 5.5, 'Calm Gold retail markup should sit near 2-5%');
assert.ok(calmPhys.silver.compositePremPct >= 8 && calmPhys.silver.compositePremPct <= 16, 'Calm Silver retail markup should sit near 8-16%');

const squeezePhys = computePhysicalPremiumSignals({
  spotGold: 3600,
  spotSilver: 42.5,
  spotGoldDailyPct: -1.8,
  spotSilverDailyPct: -2.4,
  basis: {
    gold: { isBackwardation: true, basisUsd: -18, basisPct: -0.5 },
    silver: { isBackwardation: true, basisUsd: -0.9, basisPct: -2.1 },
  },
  comex: {
    gold: { paperToRegisteredRatio: 5.5 },
    silver: { paperToRegisteredRatio: 8.5 },
  },
  vix: 30,
  gvz: 28,
  headlines: [
    { title: 'US Mint Silver Eagle coin shortage triggers record dealer premium surge and delivery delays' },
    { title: 'Costco gold bars sold out as bullion dealer premiums spike amid banking panic' },
  ],
});
assert.equal(squeezePhys.silver.tone, 'bullish', 'Spiking Silver premiums must produce bullish physical squeeze signal');
assert.equal(squeezePhys.silver.paperPhysicalDisconnect, true, 'Falling spot + surging premiums must flag Paper-Physical Disconnect');
assert.ok(squeezePhys.silver.buybackAboveSpot, 'Acute Silver Eagle squeeze must lift estimated dealer buyback above spot');
assert.ok(squeezePhys.silver.predictionBoost > 0.08, 'Acute physical squeeze must strongly boost forecast');
assert.ok(squeezePhys.silver.barSavingsPct > 5, 'Coin squeeze must compute significant rotation savings into bars/rounds');

const userOverridePhys = computePhysicalPremiumSignals({
  spotGold: 3600,
  spotSilver: 42.5,
  userOverrides: { goldStreetOz: 3924, silverStreetOz: 57.5 },
});
assert.equal(userOverridePhys.gold.hasUserOverride, true);
assert.equal(userOverridePhys.silver.hasUserOverride, true);
assert.ok(userOverridePhys.silver.products[0].premiumPct > 34, 'User dealer quote $57.50 on $42.50 spot must compute ~35% markup');
assert.ok(userOverridePhys.silver.predictionBoost > calmPhys.silver.predictionBoost, 'High user dealer premium must lift live prediction');

const outSqueezePrem = buildOutlook({
  spotGold: 3600,
  spotSilver: 42.5,
  rawHeadlines: [{ title: 'US Mint Silver Eagle shortage drives record coin dealer premium surge', source: 'Reuters', publishedAt: new Date().toISOString() }],
  institutionalSignals: { basis: { gold: { isBackwardation: true, basisUsd: -15, basisPct: -0.4 }, silver: { isBackwardation: true, basisUsd: -0.8, basisPct: -1.9 } } },
});
assert.ok(outSqueezePrem.physicalPremiums?.silver?.predictionBoost > 0, 'buildOutlook must attach live physicalPremiums signal');

// 30. v51 6 Exclusive Hidden-Alpha Bullion Prediction Engines (Session Flow, 21-FX Stealth Breadth,
//     Spring Coiling, Cross-Asset Liquidity Compass, Crowd Contrarian Brake, COMEX OpEx Strike Magnet)
// 30a. East-vs-West Session Footprint
const dayBase = Date.UTC(2026, 10, 26, 0, 0, 0); // UTC midnight = 19:00 NY (Asia session!)
const eastBuyWestDipBars = [];
let pBar = 3600;
for (let h = 0; h < 24; h++) {
  const t = dayBase + h * 3600000;
  // UTC 0..12 = NY 19..07 (Asia + London): steady accumulation (+0.14%/hr)
  // UTC 13..21 = NY 08..16 (NY paper session): dip (-0.16%/hr)
  if (h <= 12) pBar *= 1.0014;
  else if (h <= 21) pBar *= 0.9984;
  eastBuyWestDipBars.push({ t, o: pBar, h: pBar * 1.001, l: pBar * 0.999, c: pBar });
}
const sfBull = computeSessionFlowDivergence({ bars: eastBuyWestDipBars, metal: 'gold' });
assert.ok(sfBull.regime.includes('East Accumulating'), `Expected East Accumulating divergence, got ${sfBull.regime}`);
assert.ok(sfBull.signal > 0.15, `East buying / West dip must yield bullish signal (got ${sfBull.signal})`);

const nyChaseAsiaSellBars = [];
let pBar2 = 3600;
for (let h = 0; h < 24; h++) {
  const t = dayBase + h * 3600000;
  if (h <= 12) pBar2 *= 0.9986;
  else if (h <= 21) pBar2 *= 1.0018;
  nyChaseAsiaSellBars.push({ t, o: pBar2, h: pBar2 * 1.001, l: pBar2 * 0.999, c: pBar2 });
}
const sfBear = computeSessionFlowDivergence({ bars: nyChaseAsiaSellBars, metal: 'gold' });
assert.ok(sfBear.regime.includes('NY Paper Chase'), `Expected NY Paper Chase fade, got ${sfBear.regime}`);
assert.ok(sfBear.signal < -0.1, `NY chase / Asia sell must yield bearish fade signal (got ${sfBear.signal})`);

// 30b. 21-Currency Stealth Global Breakout Breadth (USD lagging while foreign FX break out)
const fxStealth = computeCurrencyBreakoutBreadth({
  spotGold: 3640, // 97.1% of USD 3750 benchmark (< 98.5%)
  spotSilver: 42.5,
  fxRates: {
    USD: 1, EUR: 0.96, GBP: 0.82, JPY: 162, CNY: 7.55, INR: 90, AUD: 1.62, CAD: 1.46,
    CHF: 0.92, THB: 36.5, TRY: 40, ZAR: 19.5, MXN: 21.5, KRW: 1470, SGD: 1.41, HKD: 8.1,
  },
  metal: 'gold',
});
assert.equal(fxStealth.stealthBull, true, 'Weak foreign FX pushing local Gold to highs while USD lags must flag stealthBull');
assert.ok(fxStealth.breadthPct >= 75 && fxStealth.signal > 0.25, 'Stealth global breakout must produce bullish breadth signal');

// 30c. Bullion Spring Coiling Detector (tight trailing 5-bar vol vs noisy 30-bar baseline + backwardation)
const coiledCloses = [];
let pc = 3500;
for (let i = 0; i < 30; i++) {
  pc *= 1 + (i % 2 === 0 ? 0.018 : -0.017);
  coiledCloses.push(pc);
}
for (let i = 0; i < 6; i++) {
  pc *= 1 + (i % 2 === 0 ? 0.0012 : -0.0011);
  coiledCloses.push(pc);
}
const springHot = computeSpringCoilingIndex({
  closes: coiledCloses,
  comexRatio: 5.5,
  isBackwardation: true,
  metal: 'gold',
});
assert.ok(springHot.coilingScore >= 72, `Tight vol compression + backwardation must score >= 72 (got ${springHot.coilingScore})`);
assert.ok(springHot.breakoutEnergyMult > 1.2, `Coiled spring must amplify breakoutEnergyMult (got ${springHot.breakoutEnergyMult})`);

// 30d. Cross-Asset Liquidity Compass (Gold + BTC debasement wave & Gold/Oil miner margin)
const goldSeriesUp = Array.from({ length: 15 }, (_, i) => 3500 + i * 12);
const btcSeriesUp = Array.from({ length: 15 }, (_, i) => 85000 + i * 900);
const liqDebase = computeCrossAssetLiquidityCompass({
  macroSnapshot: { oil: 65, cu5dPct: 2.8, platinum5dPct: 2.2 },
  series: { gold: goldSeriesUp, btc: btcSeriesUp, spx: Array(15).fill(5900) },
  metal: 'gold',
});
assert.equal(liqDebase.regime, 'Global Fiat Debasement Wave ↑');
assert.ok(liqDebase.goldOilRatio > 50 && liqDebase.signal > 0.35, 'Gold+BTC rally with strong Gold/Oil margin must be bullish');

// 30e. Narrative Consensus Crowding & Capitulation Contrarian Brake
const allBullNews = Array.from({ length: 8 }, () => ({ sentiment: 'bullish' }));
const crowdedTop = computeContrarianCrowdingBrake({ headlines: allBullNews, rsi14: 80, cotPercentile52w: 92 });
assert.ok(crowdedTop.crowdingScore >= 80 && crowdedTop.contrarianNudge < -0.04, 'Euphoric crowding must engage negative pullback brake');

const allBearNews = Array.from({ length: 8 }, () => ({ sentiment: 'bearish' }));
const panicBottom = computeContrarianCrowdingBrake({ headlines: allBearNews, rsi14: 22, cotPercentile52w: 10 });
assert.ok(panicBottom.crowdingScore <= 22 && panicBottom.contrarianNudge > 0.04, 'Bearish washout panic must engage positive reversal lift');

// 30f. COMEX OpEx Round-Strike Gravity & Post-OpEx Snapback
// Nov 2026: last biz day = Nov 30 (Mon), 4th from end = Nov 25 (Wed) -> Nov 24 is 1d pre-OpEx, Nov 27 is 2d post-OpEx
const opexPre = computeOpexDeliveryMagnet({ spot: 3618, metal: 'gold', nowDate: new Date('2026-11-24T12:00:00Z'), trendSign: 1 });
assert.equal(opexPre.magnetStrike, 3600, '$3,618 spot must snap to $3,600 round-strike magnet');
assert.ok(opexPre.pinStrength > 0 && opexPre.signal < 0, 'Pre-OpEx spot above $3,600 strike must exert mild pull toward $3,600');

const opexPost = computeOpexDeliveryMagnet({ spot: 3618, metal: 'gold', nowDate: new Date('2026-11-27T12:00:00Z'), trendSign: 1 });
assert.equal(opexPost.pinStrength, 0, 'Post-OpEx release must clear pinStrength');
assert.ok(opexPost.phase.includes('Post-OpEx') && opexPost.signal > 0.15, 'Post-OpEx release with bullish trend must lift signal');

// 30g. Precision Forecast Line with OpEx magnet & coiled spring energy + Master Orchestrator + buildOutlook integration
const fcBars = Array.from({ length: 30 }, (_, i) => ({
  t: dayBase + i * 300000,
  o: 3618,
  h: 3622,
  l: 3614,
  c: 3618 + Math.sin(i * 0.5) * 2,
}));
const fcNoPin = computePrecisionForecastLine({ bars: fcBars, liveSpot: 3618, tf: '1d', metal: 'gold', opexMagnetPrice: 3600, opexPinStrength: 0, breakoutEnergyMult: 1.0 });
const fcPinned = computePrecisionForecastLine({ bars: fcBars, liveSpot: 3618, tf: '1d', metal: 'gold', opexMagnetPrice: 3600, opexPinStrength: 0.55, breakoutEnergyMult: 1.25 });
assert.ok(fcPinned.endPrice < fcNoPin.endPrice, 'Pre-OpEx strike magnet below spot must pull Precision Forecast Line gently toward $3,600');

const suiteOut = computeHiddenAlphaSuite({
  spotGold: 3640,
  spotSilver: 42.8,
  goldIntradayBars: eastBuyWestDipBars,
  goldDailyCloses: coiledCloses,
  fxRates: { EUR: 0.96, GBP: 0.82, JPY: 162, CNY: 7.55, INR: 90, AUD: 1.62, CAD: 1.46, THB: 36.5, TRY: 40, ZAR: 19.5 },
  comex: { gold: { paperToRegisteredRatio: 5.2 }, silver: { paperToRegisteredRatio: 7.8 } },
  basis: { gold: { isBackwardation: true, basisUsd: -12 }, silver: { isBackwardation: true, basisUsd: -0.6 } },
  macroSnapshot: { oil: 65, cu5dPct: 2.5, platinum5dPct: 2.0 },
  series: { gold: goldSeriesUp, btc: btcSeriesUp, spx: Array(15).fill(5900) },
  goldTrendSign: 1,
  nowDate: new Date('2026-11-27T12:00:00Z'),
});
assert.ok(suiteOut.gold.netBoost > 0.04, `Bullish hidden-alpha alignment must lift gold.netBoost (got ${suiteOut.gold.netBoost})`);

const outHidden = buildOutlook({
  spotGold: 3640,
  spotSilver: 42.8,
  goldGapBars: eastBuyWestDipBars,
  rawHeadlines: [{ title: 'Central bank gold buying accelerates worldwide', source: 'Reuters', publishedAt: new Date().toISOString() }],
});
assert.ok(outHidden.hiddenAlpha?.gold?.sessionFlow && outHidden.hiddenAlpha?.silver?.opexMagnet, 'buildOutlook must attach complete hiddenAlpha suite');

console.log('All 30 Bullion Pulse suites (v51 6 Exclusive Hidden-Alpha Engines + OpEx Magnet, v50 Physical Premiums vs. Spot & Melt + 16-Feed Multi-Subject News & Global Events Calendar, v48 Precision Chart Forecast Line, Hurst Regime, 4-Model Ensemble, 30-Day Roadmap & Twins, Live World & NOAA Space Weather Catalyst Pulse, 1D/7D/30D Conformal Walk-Forward Accuracy + all core suites) passed!');
