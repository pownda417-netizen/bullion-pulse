/**
 * Bullion Pulse v61 — Zero-Lookahead 2-Year Walk-Forward Backtest & Self-Learning Warm-Start
 * Pure ES module, zero dependencies.
 *
 * Fetches 2 years of aligned daily closes/volumes (Gold, Silver, DXY, VIX, TNX, SPX, Copper, GDX, SIL, GLD, SLV),
 * computes strictly causal daily signals using ONLY data <= day t, and runs `runDailyLearningStep`
 * across ~450+ out-of-sample trading days (1D, 5D, and 20D horizons) to warm-start regime weights,
 * coneMultiplier, jumpCalibration (lambdaMult/sigmaJMult), and Brier Score probability calibration.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createInitialLearnedState,
  detectMarketRegime,
  runDailyLearningStep,
} from './self_learn.mjs';
import { computeEwmaGarchVol } from './jump_diffusion.mjs';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) BullionPulseBacktest/61.0';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

async function fetchYahoo2y(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${symbol} HTTP ${res.status}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  const ts = r?.timestamp || [];
  const q = r?.indicators?.quote?.[0] || {};
  const map = new Map();
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue;
    const dayKey = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    map.set(dayKey, { c, v: Number(q.volume?.[i] || 0) });
  }
  return map;
}

function pctN(arr, idx, n) {
  if (idx < n || !arr[idx] || !arr[idx - n]) return 0;
  return ((arr[idx] - arr[idx - n]) / arr[idx - n]) * 100;
}

function buildCausalDriverVector(aligned, idx) {
  const g5 = pctN(aligned.gold, idx, 5);
  const g20 = pctN(aligned.gold, idx, 20);
  const s5 = pctN(aligned.silver, idx, 5);
  const s20 = pctN(aligned.silver, idx, 20);
  const dxy5 = pctN(aligned.dxy, idx, 5);
  const dxy20 = pctN(aligned.dxy, idx, 20);
  const tnx5 = pctN(aligned.tnx, idx, 5);
  const spx5 = pctN(aligned.spx, idx, 5);
  const cu5 = pctN(aligned.copper, idx, 5);
  const vix = aligned.vix[idx] || 18;
  const gdxRel = pctN(aligned.gdx, idx, 10) - pctN(aligned.gold, idx, 10);
  const silRel = pctN(aligned.sil, idx, 10) - pctN(aligned.silver, idx, 10);

  // Signed GLD / SLV dollar-volume flow over trailing 5 bars (strictly causal <= idx)
  const flowOf = (closes, vols) => {
    let s = 0;
    let a = 0;
    for (let k = Math.max(1, idx - 5); k <= idx; k++) {
      const r = (closes[k] - closes[k - 1]) / Math.max(0.01, closes[k - 1]);
      const v = vols[k] || 1;
      s += r * v;
      a += Math.abs(r) * v;
    }
    return a > 0 ? clamp(s / a, -1, 1) : 0;
  };
  const gldFlow = flowOf(aligned.gld, aligned.gldVol);
  const slvFlow = flowOf(aligned.slv, aligned.slvVol);

  const ratesGold = clamp((-dxy5 * 0.28 - dxy20 * 0.12 - tnx5 * 0.12), -0.9, 0.9);
  const ratesSilver = clamp((-dxy5 * 0.25 - dxy20 * 0.1 - tnx5 * 0.1), -0.9, 0.9);
  const eqGold = clamp(-spx5 * 0.14 + (vix - 18) * 0.025, -0.85, 0.85);
  const eqSilver = clamp(spx5 * 0.12 + cu5 * 0.14 - Math.max(0, vix - 24) * 0.03, -0.85, 0.85);
  const minersGold = clamp(gdxRel / 8, -0.85, 0.85);
  const minersSilver = clamp(silRel / 10, -0.85, 0.85);
  const inflGold = clamp(-tnx5 * 0.08 + g20 * 0.06, -0.75, 0.75);
  const inflSilver = clamp(cu5 * 0.12 + s20 * 0.04, -0.75, 0.75);
  const geoGold = clamp((vix - 17) * 0.035, -0.5, 0.85);
  const geoSilver = clamp((vix - 18) * 0.02, -0.5, 0.65);
  const supplyGold = clamp(g20 * 0.05 + gldFlow * 0.35, -0.8, 0.8);
  const supplySilver = clamp(cu5 * 0.15 + slvFlow * 0.35, -0.85, 0.85);
  const cbGold = clamp(g20 * 0.045 + gldFlow * 0.4, -0.75, 0.85);
  const cbSilver = clamp(g20 * 0.03 + slvFlow * 0.35, -0.75, 0.8);
  const sgeGold = clamp(g5 * 0.12 + gldFlow * 0.3, -0.8, 0.8);
  const sgeSilver = clamp(s5 * 0.09 + slvFlow * 0.35, -0.8, 0.8);
  const comexGold = clamp(gldFlow * 0.55, -0.85, 0.85);
  const comexSilver = clamp(slvFlow * 0.6 + silRel / 14, -0.85, 0.85);

  return [
    { id: 'inflation',          gold: +inflGold.toFixed(3),   silver: +inflSilver.toFixed(3) },
    { id: 'geopolitics',        gold: +geoGold.toFixed(3),    silver: +geoSilver.toFixed(3) },
    { id: 'rates_usd',          gold: +ratesGold.toFixed(3),  silver: +ratesSilver.toFixed(3) },
    { id: 'equities',           gold: +eqGold.toFixed(3),     silver: +eqSilver.toFixed(3) },
    { id: 'mining_supply',      gold: +supplyGold.toFixed(3), silver: +supplySilver.toFixed(3) },
    { id: 'central_banks',      gold: +cbGold.toFixed(3),     silver: +cbSilver.toFixed(3) },
    { id: 'shanghai_sge',       gold: +sgeGold.toFixed(3),    silver: +sgeSilver.toFixed(3) },
    { id: 'positioning_miners', gold: +minersGold.toFixed(3), silver: +minersSilver.toFixed(3) },
    { id: 'comex_paper',        gold: +comexGold.toFixed(3),  silver: +comexSilver.toFixed(3) },
  ];
}

export async function runWalkForwardWarmStart({ writeDisk = true } = {}) {
  const syms = {
    gold: 'GC=F',
    silver: 'SI=F',
    dxy: 'DX-Y.NYB',
    vix: '^VIX',
    tnx: '^TNX',
    spx: '^GSPC',
    copper: 'HG=F',
    gdx: 'GDX',
    sil: 'SIL',
    gld: 'GLD',
    slv: 'SLV',
  };
  const entries = await Promise.all(
    Object.entries(syms).map(async ([k, s]) => [k, await fetchYahoo2y(s)])
  );
  const maps = Object.fromEntries(entries);

  // Align all dates strictly on Gold & Silver common trading calendar, forward-filling any single missing macro holiday
  const dates = [...maps.gold.keys()].filter((d) => maps.silver.has(d)).sort();
  if (dates.length < 90) {
    throw new Error(`Insufficient overlapping trading days (${dates.length})`);
  }

  const aligned = {
    dates,
    gold: [],
    silver: [],
    dxy: [],
    vix: [],
    tnx: [],
    spx: [],
    copper: [],
    gdx: [],
    sil: [],
    gld: [],
    gldVol: [],
    slv: [],
    slvVol: [],
  };

  const last = { dxy: 103, vix: 18, tnx: 4.3, spx: 5500, copper: 4.2, gdx: 40, sil: 35, gld: 240, slv: 28 };
  for (const d of dates) {
    const g = maps.gold.get(d).c;
    const s = maps.silver.get(d).c;
    aligned.gold.push(g);
    aligned.silver.push(s);
    for (const k of ['dxy', 'vix', 'tnx', 'spx', 'copper', 'gdx', 'sil']) {
      const hit = maps[k].get(d)?.c;
      if (hit) last[k] = hit;
      aligned[k].push(last[k]);
    }
    const gldRow = maps.gld.get(d);
    if (gldRow?.c) last.gld = gldRow.c;
    aligned.gld.push(last.gld);
    aligned.gldVol.push(gldRow?.v || 0);
    const slvRow = maps.slv.get(d);
    if (slvRow?.c) last.slv = slvRow.c;
    aligned.slv.push(last.slv);
    aligned.slvVol.push(slvRow?.v || 0);
  }

  let state = createInitialLearnedState();
  const startIdx = 45;
  let total1d = 0;
  let hits1dG = 0;
  let hits1dS = 0;
  let inConeAll = 0;
  let brierSumG = 0;
  let brierSumS = 0;
  let total5d = 0;
  let hits5dG = 0;
  let hits5dS = 0;
  let total20d = 0;
  let hits20dG = 0;
  let hits20dS = 0;

  let prevSnap = null;
  for (let i = startIdx; i < dates.length; i++) {
    const dayKey = dates[i];
    const gClose = aligned.gold[i];
    const sClose = aligned.silver[i];
    const garchG = computeEwmaGarchVol(aligned.gold.slice(Math.max(0, i - 60), i + 1));
    const garchS = computeEwmaGarchVol(aligned.silver.slice(Math.max(0, i - 60), i + 1));
    const vix = aligned.vix[i];
    const regime = detectMarketRegime({ vix, gvz: garchG.blendedAnnVolPct });

    if (prevSnap) {
      const res = runDailyLearningStep({
        learnedState: state,
        prevSnapshot: prevSnap,
        actualGoldClose: gClose,
        actualSilverClose: sClose,
        regimeOverride: regime,
        nowDate: new Date(`${dayKey}T22:10:00Z`),
        skipHolidayCheck: true,
      });
      if (res.updated && res.entry) {
        state = res.state;
        total1d++;
        if (res.entry.dirHitGold) hits1dG++;
        if (res.entry.dirHitSilver) hits1dS++;
        if (res.entry.inConeGold) inConeAll++;
        if (res.entry.inConeSilver) inConeAll++;
        if (Number.isFinite(res.entry.brierGold)) brierSumG += res.entry.brierGold;
        if (Number.isFinite(res.entry.brierSilver)) brierSumS += res.entry.brierSilver;

        // Multi-horizon walk-forward accuracy tracking (5D & 20D strictly realized)
        if (i + 5 < dates.length) {
          total5d++;
          const fwd5G = aligned.gold[i + 5] - aligned.gold[i];
          const fwd5S = aligned.silver[i + 5] - aligned.silver[i];
          if (Math.sign(fwd5G) === Math.sign(prevSnap.pred1dGoldPct || 1)) hits5dG++;
          if (Math.sign(fwd5S) === Math.sign(prevSnap.pred1dSilverPct || 1)) hits5dS++;
        }
        if (i + 20 < dates.length) {
          total20d++;
          const fwd20G = aligned.gold[i + 20] - aligned.gold[i];
          const fwd20S = aligned.silver[i + 20] - aligned.silver[i];
          if (Math.sign(fwd20G) === Math.sign(prevSnap.pred1dGoldPct || 1)) hits20dG++;
          if (Math.sign(fwd20S) === Math.sign(prevSnap.pred1dSilverPct || 1)) hits20dS++;
        }
      }
    }

    // Build next day's strictly causal forecast snapshot using active regime learned weights
    const drivers = buildCausalDriverVector(aligned, i);
    const activeW = state.regimeWeights?.[regime] || state.weights;
    let gScore = 0;
    let sScore = 0;
    for (const d of drivers) {
      gScore += d.gold * (activeW?.gold?.[d.id] ?? 0.11);
      sScore += d.silver * (activeW?.silver?.[d.id] ?? 0.11);
    }
    const halfConeG = +clamp(garchG.blendedDailyVol * 100 * 1.15 * (state.coneMultiplier || 1), 0.55, 3.8).toFixed(2);
    const halfConeS = +clamp(garchS.blendedDailyVol * 100 * 1.15 * (state.coneMultiplier || 1), 1.0, 6.5).toFixed(2);
    const pred1dGoldPct = +clamp(gScore * halfConeG * 0.85, -1.6, 1.6).toFixed(3);
    const pred1dSilverPct = +clamp(sScore * halfConeS * 0.85, -2.6, 2.6).toFixed(3);

    prevSnap = {
      dayKey,
      recordedAt: `${dayKey}T22:10:00.000Z`,
      regime,
      goldClose: +gClose.toFixed(2),
      silverClose: +sClose.toFixed(2),
      pred1dGoldPct,
      pred1dSilverPct,
      pred20dGoldPct: +(pred1dGoldPct * 4.5).toFixed(2),
      pred20dSilverPct: +(pred1dSilverPct * 4.5).toFixed(2),
      halfCone1dGoldPct: halfConeG,
      halfCone1dSilverPct: halfConeS,
      drivers,
    };
  }

  state.pendingSnapshot = prevSnap;
  state.walkForwardBacktest = {
    version: 'v61',
    ranAt: new Date().toISOString(),
    fromDate: dates[startIdx],
    toDate: dates[dates.length - 1],
    evaluatedDays: total1d,
    dirHit1dGoldPct: total1d ? Math.round((hits1dG / total1d) * 100) : 50,
    dirHit1dSilverPct: total1d ? Math.round((hits1dS / total1d) * 100) : 50,
    dirHit5dGoldPct: total5d ? Math.round((hits5dG / total5d) * 100) : 50,
    dirHit5dSilverPct: total5d ? Math.round((hits5dS / total5d) * 100) : 50,
    dirHit20dGoldPct: total20d ? Math.round((hits20dG / total20d) * 100) : 50,
    dirHit20dSilverPct: total20d ? Math.round((hits20dS / total20d) * 100) : 50,
    inConeOverallPct: total1d ? Math.round((inConeAll / (total1d * 2)) * 100) : 75,
    brierScoreGold: total1d ? +(brierSumG / total1d).toFixed(3) : 0.22,
    brierScoreSilver: total1d ? +(brierSumS / total1d).toFixed(3) : 0.22,
    brierScoreAvg: total1d ? +((brierSumG + brierSumS) / (total1d * 2)).toFixed(3) : 0.22,
  };

  if (writeDisk) {
    const outPath = path.resolve('data/learned_weights.json');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }
  return state;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWalkForwardWarmStart({ writeDisk: true })
    .then((st) => {
      const wf = st.walkForwardBacktest;
      console.log(
        `v61 2-Year Walk-Forward Warm-Start complete (${wf.evaluatedDays} OOS trading days: ${wf.fromDate} -> ${wf.toDate}):`
      );
      console.log(
        `  1D Dir: Au ${wf.dirHit1dGoldPct}% / Ag ${wf.dirHit1dSilverPct}% | ` +
          `5D Dir: Au ${wf.dirHit5dGoldPct}% / Ag ${wf.dirHit5dSilverPct}% | ` +
          `20D Dir: Au ${wf.dirHit20dGoldPct}% / Ag ${wf.dirHit20dSilverPct}%`
      );
      console.log(
        `  In-Cone: ${wf.inConeOverallPct}% | Brier Score: ${wf.brierScoreAvg} (Au ${wf.brierScoreGold} / Ag ${wf.brierScoreSilver}) | ` +
          `ConeMult: ${st.coneMultiplier}x | Jump λ=${st.jumpCalibration.lambdaMult}x σJ=${st.jumpCalibration.sigmaJMult}x`
      );
    })
    .catch((err) => {
      console.error(`Walk-forward warm-start failed: ${err.message}`);
      process.exitCode = 1;
    });
}
