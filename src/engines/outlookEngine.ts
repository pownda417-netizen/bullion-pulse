/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  CandleBar,
  ComexData,
  CurrencyCode,
  DealerQuotes,
  MetalKey,
  MetalQuote,
  OutlookData,
  ShanghaiData,
  SpaceWeatherData,
  TimeframeKey,
  TimeframesData,
} from '../types/bullion';
import { clampNum, DEAL_PRESETS, DEFAULT_FX_RATES, TROY_OZ_TO_GRAMS } from '../utils/format';
import {
  AI_COMPUTE_META,
  AI_POWER_META,
  CHINA_AI_EV_META,
  computeAiDatacenterSignal,
  PRIVATE_AI_SPACE_LABS,
  WORLD_AI_TECH_META,
} from '../../monitor/ai_datacenter.mjs';
import { computeHiddenAlphaSuite } from '../../monitor/hidden_alpha.mjs';
import {
  analyzeMarketGaps,
  computeEmpiricalHistoricalTwins,
  computeMarketRegimeDecomposition,
  computeRatioAnalytics,
  computeSetupQuality,
  computeWorldSpacePulse,
  DRIVER_META,
  getUpcoming30dSeasonality,
  HISTORICAL_ANALOGS,
  NEWS_TOPICS,
  project30DayPrecision,
  SCENARIO_PRESETS,
  SEASONAL_20Y_MONTHLY,
} from '../../monitor/historical_patterns.mjs';
import {
  buildBaselineInstitutionalSignals,
  computeBasisSignal,
  getUpcomingEventRisk,
} from '../../monitor/institutional_signals.mjs';
import { computePhysicalPremiumSignals, PHYSICAL_BENCHMARKS } from '../../monitor/physical_premiums.mjs';
import { computeHurstExponent, computePrecisionForecastLine } from '../../monitor/precision_forecast.mjs';
import { computeEwmaGarchVol } from '../../monitor/jump_diffusion.mjs';
import { computeSpectralForecast } from '../../monitor/spectral_forecast.mjs';

export {
  AI_COMPUTE_META,
  AI_POWER_META,
  CHINA_AI_EV_META,
  DRIVER_META,
  HISTORICAL_ANALOGS,
  NEWS_TOPICS,
  PHYSICAL_BENCHMARKS,
  PRIVATE_AI_SPACE_LABS,
  SCENARIO_PRESETS,
  SEASONAL_20Y_MONTHLY,
  WORLD_AI_TECH_META,
};

export interface GlobalHubClock {
  id: string;
  city: string;
  exchange: string;
  tz: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
  lblSide: 'left' | 'right';
  dy: number;
  open: boolean;
  localTime: string;
  statusText: string;
}

const HUBS = [
  { id: 'ny', city: 'New York', exchange: 'COMEX', tz: 'America/New_York', lat: 40.71, lon: -74.01, openH: 8, closeH: 17, lblSide: 'left' as const, dy: -2 },
  { id: 'lon', city: 'London', exchange: 'LBMA', tz: 'Europe/London', lat: 51.51, lon: -0.13, openH: 8, closeH: 17, lblSide: 'left' as const, dy: -10 },
  { id: 'zur', city: 'Zurich', exchange: 'Swiss Vaults', tz: 'Europe/Zurich', lat: 47.37, lon: 8.54, openH: 8, closeH: 17, lblSide: 'right' as const, dy: 12 },
  { id: 'dxb', city: 'Dubai', exchange: 'DGCX / DMCC', tz: 'Asia/Dubai', lat: 25.2, lon: 55.27, openH: 8, closeH: 23, lblSide: 'left' as const, dy: 12 },
  { id: 'bom', city: 'Mumbai', exchange: 'MCX', tz: 'Asia/Kolkata', lat: 19.08, lon: 72.88, openH: 9, closeH: 23, lblSide: 'right' as const, dy: 14 },
  { id: 'sgp', city: 'Singapore', exchange: 'SBMA', tz: 'Asia/Singapore', lat: 1.35, lon: 103.82, openH: 9, closeH: 17, lblSide: 'left' as const, dy: 4 },
  { id: 'sha', city: 'Shanghai', exchange: 'SGE / SHFE', tz: 'Asia/Shanghai', lat: 31.23, lon: 121.47, openH: 9, closeH: 16, lblSide: 'left' as const, dy: -12 },
  { id: 'tyo', city: 'Tokyo', exchange: 'OSE / TOCOM', tz: 'Asia/Tokyo', lat: 35.68, lon: 139.69, openH: 9, closeH: 16, lblSide: 'right' as const, dy: -2 },
  { id: 'syd', city: 'Sydney', exchange: 'ASX / Perth', tz: 'Australia/Sydney', lat: -33.87, lon: 151.21, openH: 9, closeH: 17, lblSide: 'left' as const, dy: 4 },
] as const;

export function projectEquirectangular(lat: number, lon: number): { x: number; y: number } {
  return {
    x: +(((lon + 180) / 360) * 1000).toFixed(1),
    y: +(((90 - lat) / 180) * 500).toFixed(1),
  };
}

export function computeWorldHubs(now = new Date()): {
  hubs: GlobalHubClock[];
  isWeekend: boolean;
  isDailyBreak: boolean;
  bannerTitle: string;
  bannerDesc: string;
  activeCount: number;
} {
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const etDay = etParts.find((p) => p.type === 'weekday')?.value || 'Mon';
  const etHour = Number(etParts.find((p) => p.type === 'hour')?.value || 12) % 24;
  const isWeekend =
    etDay === 'Sat' || (etDay === 'Fri' && etHour >= 17) || (etDay === 'Sun' && etHour < 18);
  const isDailyBreak = !isWeekend && etHour === 17;

  const hubs: GlobalHubClock[] = HUBS.map((h) => {
    const pt = projectEquirectangular(h.lat, h.lon);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: h.tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const wd = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
    const hr = Number(parts.find((p) => p.type === 'hour')?.value || 12) % 24;
    const min = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    const mins = hr * 60 + min;
    const localTime = `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    const isWeekday = wd !== 'Sat' && wd !== 'Sun';

    let open = false;
    let statusText = 'Closed';

    if (isWeekend) {
      open = false;
      statusText = 'Weekend';
    } else if (h.id === 'ny') {
      if (isDailyBreak) {
        open = false;
        statusText = 'Daily Break';
      } else if (isWeekday && mins >= 8 * 60 + 20 && mins < 13 * 60 + 30) {
        open = true;
        statusText = 'Open · Busiest';
      } else if (isWeekday && mins >= 13 * 60 + 30 && mins < 17 * 60) {
        open = true;
        statusText = 'Open · Afternoon';
      } else {
        open = true;
        statusText = wd === 'Sun' ? 'Open · Sunday Open' : 'Open · Overnight';
      }
    } else if (h.id === 'sha') {
      const morning = isWeekday && mins >= 9 * 60 && mins < 11 * 60 + 30;
      const lunch = isWeekday && mins >= 11 * 60 + 30 && mins < 13 * 60 + 30;
      const afternoon = isWeekday && mins >= 13 * 60 + 30 && mins < 15 * 60 + 30;
      const nightEve = isWeekday && mins >= 20 * 60;
      const nightLate = wd !== 'Sun' && wd !== 'Mon' && mins < 2 * 60 + 30;
      if (morning || afternoon) {
        open = true;
        statusText = 'Open · Day';
      } else if (nightEve || nightLate) {
        open = true;
        statusText = 'Open · Night';
      } else if (lunch) {
        open = false;
        statusText = 'Lunch Break';
      }
    } else if (h.id === 'lon') {
      open = isWeekday && mins >= 8 * 60 && mins < 16 * 60 + 30;
      statusText = open ? 'Open Now' : 'Closed';
    } else if (h.id === 'bom') {
      open = isWeekday && mins >= 9 * 60 && mins < 23 * 60 + 30;
      statusText = open ? 'Open Now' : 'Closed';
    } else if (h.id === 'dxb') {
      open = isWeekday && mins >= 8 * 60 && mins < 23 * 60;
      statusText = open ? 'Open Now' : 'Closed';
    } else {
      open = !isDailyBreak && isWeekday && hr >= h.openH && hr < h.closeH;
      statusText = open ? `Open · ${h.closeH - hr}h left` : 'Closed';
    }

    return {
      id: h.id,
      city: h.city,
      exchange: h.exchange,
      tz: h.tz,
      lat: h.lat,
      lon: h.lon,
      x: pt.x,
      y: pt.y,
      lblSide: h.lblSide,
      dy: h.dy,
      open,
      localTime,
      statusText,
    };
  });

  const activeCount = hubs.filter((h) => h.open).length;
  const nyOpen = hubs.find((h) => h.id === 'ny')?.open;
  const lonOpen = hubs.find((h) => h.id === 'lon')?.open;
  const shaOpen = hubs.find((h) => h.id === 'sha')?.open || hubs.find((h) => h.id === 'tyo')?.open;

  let bannerTitle = '24h World Pulse';
  let bannerDesc = 'Global bullion trading is active right now — glowing green hubs show which exchanges are live.';
  if (isWeekend) {
    bannerTitle = 'Weekend Closed';
    bannerDesc =
      'Major markets are closed for the weekend — global trading reopens Sunday at 6:00 PM ET (Shanghai opens Monday 9:00 AM Beijing / 8:00 PM ET).';
  } else if (isDailyBreak) {
    bannerTitle = 'Quiet / Daily Break';
    bannerDesc =
      'Daily 5:00–6:00 PM ET market break: trading is very light, so prices can briefly jump or dip more easily.';
  } else if (nyOpen && lonOpen) {
    bannerTitle = 'London + NY Peak Overlap';
    bannerDesc =
      'Both London and New York are open right now — busiest trading hours and most reliable pricing of the day.';
  } else if (shaOpen && !nyOpen && !lonOpen) {
    bannerTitle = 'Asia & Shanghai Session';
    bannerDesc =
      'Asia & Shanghai physical buyers are leading the market right now while US and European main desks sleep.';
  }

  return { hubs, isWeekend, isDailyBreak, bannerTitle, bannerDesc, activeCount };
}

export interface WorldGoldRow {
  city: string;
  unitLabel: string;
  currency: CurrencyCode;
  localPrice: number;
  usdPerOz: number;
  premiumUsd: number;
}

export function computeWorldGoldBoard(
  goldSpotUsd: number,
  fxRates: Record<CurrencyCode, number> = DEFAULT_FX_RATES,
  shanghaiPremiumUsd = 18
): WorldGoldRow[] {
  const g = goldSpotUsd > 0 ? goldSpotUsd : 3500;
  const gPerGram = g / TROY_OZ_TO_GRAMS;
  const fx = (c: CurrencyCode) => (Number.isFinite(fxRates[c]) && fxRates[c] > 0 ? fxRates[c] : DEFAULT_FX_RATES[c]);
  return [
    { city: 'London / NY Spot', unitLabel: '1 troy oz', currency: 'USD', localPrice: g, usdPerOz: g, premiumUsd: 0 },
    { city: 'Shanghai (SGE Au99.99)', unitLabel: '1 gram', currency: 'CNY', localPrice: (gPerGram + shanghaiPremiumUsd / TROY_OZ_TO_GRAMS) * fx('CNY'), usdPerOz: g + shanghaiPremiumUsd, premiumUsd: shanghaiPremiumUsd },
    { city: 'Bangkok (96.5% Baht)', unitLabel: '1 Baht (15.244g)', currency: 'THB', localPrice: gPerGram * 15.244 * 0.965 * 1.012 * fx('THB'), usdPerOz: g * 1.012, premiumUsd: g * 0.012 },
    { city: 'Mumbai (MCX 24K)', unitLabel: '10 grams', currency: 'INR', localPrice: gPerGram * 10 * 1.06 * fx('INR'), usdPerOz: g * 1.06, premiumUsd: g * 0.06 },
    { city: 'Tokyo (OSE)', unitLabel: '1 gram', currency: 'JPY', localPrice: gPerGram * 1.01 * fx('JPY'), usdPerOz: g * 1.01, premiumUsd: g * 0.01 },
    { city: 'Zurich (Swiss Bar)', unitLabel: '1 troy oz', currency: 'CHF', localPrice: g * 1.005 * fx('CHF'), usdPerOz: g * 1.005, premiumUsd: g * 0.005 },
    { city: 'Dubai (Souk 24K)', unitLabel: '1 gram', currency: 'AED', localPrice: gPerGram * 1.008 * fx('AED'), usdPerOz: g * 1.008, premiumUsd: g * 0.008 },
    { city: 'Frankfurt / EU', unitLabel: '1 troy oz', currency: 'EUR', localPrice: g * 1.015 * fx('EUR'), usdPerOz: g * 1.015, premiumUsd: g * 0.015 },
    { city: 'Vientiane / Laos', unitLabel: '1 Baht (15.244g)', currency: 'LAK', localPrice: gPerGram * 15.244 * 0.965 * 1.02 * fx('LAK'), usdPerOz: g * 1.02, premiumUsd: g * 0.02 },
  ];
}

export interface DipLadderTier {
  label: string;
  dropPct: number;
  targetPriceUsd: number;
  allocationPct: number;
  budgetUsd: number;
  estOz: number;
}

export function computeBuyTheDipLadder(
  metal: MetalKey,
  spotUsd: number,
  budgetUsd: number,
  supportUsd?: number | null
): DipLadderTier[] {
  const spot = spotUsd > 0 ? spotUsd : metal === 'gold' ? 3500 : 40;
  const budget = clampNum(budgetUsd, 10, 1e8);
  const volMult = metal === 'silver' ? 1.7 : 1.0;
  const supportGapPct =
    supportUsd && supportUsd > 0 && supportUsd < spot
      ? clampNum(((spot - supportUsd) / spot) * 100, 1.2, 8)
      : 2.0 * volMult;

  const tiers = [
    { label: 'Tier 1 · Starter Fill', dropPct: 0, alloc: 25 },
    { label: 'Tier 2 · First Pullback', dropPct: +(supportGapPct * 0.65).toFixed(1), alloc: 25 },
    { label: 'Tier 3 · Support Zone', dropPct: +supportGapPct.toFixed(1), alloc: 30 },
    { label: 'Tier 4 · Deep Washout', dropPct: +(supportGapPct * 1.65).toFixed(1), alloc: 20 },
  ];

  return tiers.map((t) => {
    const targetPriceUsd = +(spot * (1 - t.dropPct / 100)).toFixed(2);
    const tierBudget = +(budget * (t.alloc / 100)).toFixed(2);
    return {
      label: t.label,
      dropPct: t.dropPct,
      targetPriceUsd,
      allocationPct: t.alloc,
      budgetUsd: tierBudget,
      estOz: targetPriceUsd > 0 ? +(tierBudget / targetPriceUsd).toFixed(4) : 0,
    };
  });
}

export interface DealGradeResult {
  presetName: string;
  metal: MetalKey;
  pureOz: number;
  meltUsd: number;
  askUsd: number | null;
  markupUsd: number | null;
  markupPct: number | null;
  grade: 'STEAL' | 'GREAT' | 'FAIR' | 'HIGH' | 'OVERPRICED' | 'READY';
  gradeLabel: string;
  tone: 'bullish' | 'neutral' | 'bearish';
  breakEvenSpot: number | null;
  typicalRangeText: string;
  advice: string;
}

export function evaluateDealGrade(
  presetKey: string,
  qty: number,
  askInputLocal: string,
  goldSpotUsd: number,
  silverSpotUsd: number,
  fxRate: number
): DealGradeResult {
  const preset = Object.hasOwn(DEAL_PRESETS, presetKey) ? DEAL_PRESETS[presetKey] : DEAL_PRESETS.ase_1oz;
  const spot = preset.metal === 'gold' ? goldSpotUsd : silverSpotUsd;
  const safeQty = clampNum(qty, 0.01, 10000);
  const pureOz = +(safeQty * preset.ozPerUnit).toFixed(4);
  const meltUsd = +(pureOz * spot).toFixed(2);
  const askLocal = Number(askInputLocal);
  const safeFx = fxRate > 0 ? fxRate : 1;
  const askUsd = askInputLocal.trim() !== '' && Number.isFinite(askLocal) && askLocal > 0 ? askLocal / safeFx : null;
  const typicalRangeText = `+${preset.lowPct}% to +${preset.highPct}% over melt`;

  if (askUsd == null || meltUsd <= 0) {
    return {
      presetName: preset.name,
      metal: preset.metal,
      pureOz,
      meltUsd,
      askUsd: null,
      markupUsd: null,
      markupPct: null,
      grade: 'READY',
      gradeLabel: 'Enter Ask Price',
      tone: 'neutral',
      breakEvenSpot: null,
      typicalRangeText,
      advice: 'Type the total dealer asking price to grade the premium against live melt value.',
    };
  }

  const markupUsd = +(askUsd - meltUsd).toFixed(2);
  const markupPct = +((markupUsd / meltUsd) * 100).toFixed(2);
  const breakEvenSpot = pureOz > 0 ? +(askUsd / pureOz).toFixed(2) : null;

  let grade: DealGradeResult['grade'] = 'FAIR';
  let gradeLabel = 'Fair Market Price';
  let tone: DealGradeResult['tone'] = 'neutral';
  let advice = 'In line with typical physical dealer spreads for this product.';

  if (markupPct <= preset.lowPct * 0.5) {
    grade = 'STEAL';
    gradeLabel = 'A+ Steal · Verify Authenticity';
    tone = 'bullish';
    advice = 'Far below standard dealer premiums — test weight, magnet, and ping before paying.';
  } else if (markupPct <= preset.lowPct) {
    grade = 'GREAT';
    gradeLabel = 'A · Great Buy';
    tone = 'bullish';
    advice = 'Below typical dealer markup — strong physical entry price.';
  } else if (markupPct <= preset.highPct) {
    grade = 'FAIR';
    gradeLabel = 'B · Fair Retail Deal';
    tone = 'neutral';
    advice = 'Inside normal retail dealer spread range.';
  } else if (markupPct <= preset.highPct * 1.45) {
    grade = 'HIGH';
    gradeLabel = 'C · High Premium';
    tone = 'bearish';
    advice = 'Above typical spread — try negotiating closer to melt or compare generic rounds/bars.';
  } else {
    grade = 'OVERPRICED';
    gradeLabel = 'D · Overpriced';
    tone = 'bearish';
    advice = 'Steep markup requires a large spot rally just to break even.';
  }

  return {
    presetName: preset.name,
    metal: preset.metal,
    pureOz,
    meltUsd,
    askUsd,
    markupUsd,
    markupPct,
    grade,
    gradeLabel,
    tone,
    breakEvenSpot,
    typicalRangeText,
    advice,
  };
}

export interface FullQuantModelOutput {
  precisionLine: any;
  precision30d: any;
  interactiveForecast: {
    metal: MetalKey;
    score: number; // -100..+100
    unitScore: number; // -1..+1
    signal: string;
    confidence: number;
    interactiveActive: boolean;
    horizon7d: { bear: number; base: number; bull: number; expectedPct: number; bearPct: number; bullPct: number };
    horizon30d: {
      bear: number;
      base: number;
      bull: number;
      expectedPct: number;
      bearPct: number;
      bullPct: number;
      agreementPct: number;
      agreeCount: number;
      hurst: number;
      hurstLabel: string;
      modelVotes: Array<Record<string, unknown>>;
      milestones: Array<{ day: number; label: string; price: number; pct: number }>;
    };
    volRegime: {
      label: string;
      blendedAnnVolPct: number;
      ewmaAnnVolPct: number;
      gvzAnnPct: number | null;
      ivSpreadAnnPct: number;
    };
    horizonAlignment: {
      tactical12hPct: number;
      swing7dPct: number;
      macro30dPct: number;
      label: string;
      tone: 'bullish' | 'bearish' | 'neutral';
      summary: string;
      upcomingCatalysts7d: number;
    };
  };
  hiddenAlpha: any;
  aiRace: any;
  physicalPremiums: any;
  worldSpacePulse: any;
  setupQuality: any;
  ratioAnalytics: any;
  marketRegime: any;
  eventRisk: any;
  gaps: any;
  twins: any;
  seasonality: any;
  hurst: any;
  basisSignal: any;
  spectral: any;
}

export function computeFullQuantSuite(params: {
  metal: MetalKey;
  timeframe: TimeframeKey;
  goldQuote: MetalQuote;
  silverQuote: MetalQuote;
  outlook: OutlookData | null;
  shanghai: ShanghaiData | null;
  comex: ComexData | null;
  timeframes: TimeframesData;
  candles: { gold: CandleBar[]; silver: CandleBar[] };
  spaceWeather: SpaceWeatherData;
  dealerQuotes: DealerQuotes;
  fxRates: Record<CurrencyCode, number>;
  aiSimDelta?: number;
  whisperCpi?: number;
  whisperFed?: number;
  whisperScenarioId?: string;
}): FullQuantModelOutput {
  const {
    metal,
    timeframe,
    goldQuote,
    silverQuote,
    outlook,
    shanghai,
    comex,
    timeframes,
    candles,
    spaceWeather,
    dealerQuotes,
    fxRates,
    aiSimDelta = 0,
    whisperCpi = 0,
    whisperFed = 0,
    whisperScenarioId = 'none',
  } = params;

  const goldSpot = goldQuote.price || Number(outlook?.gold?.spot) || 3630;
  const silverSpot = silverQuote.price || Number(outlook?.silver?.spot) || 43.5;
  const spot = metal === 'gold' ? goldSpot : silverSpot;
  const macro = outlook?.macroSnapshot || {};

  const activeBars =
    (timeframes[timeframe]?.[metal]?.length ? timeframes[timeframe]?.[metal] : null) ||
    candles[metal] ||
    timeframes['1d']?.[metal] ||
    [];
  const bars1y = timeframes['1y']?.[metal] || timeframes['6m']?.[metal] || activeBars;
  const barsGold1y = timeframes['1y']?.gold || timeframes['6m']?.gold || candles.gold || [];
  const barsSilver1y = timeframes['1y']?.silver || timeframes['6m']?.silver || candles.silver || [];
  const goldCloses = barsGold1y.map((b) => b.c);
  const silverCloses = barsSilver1y.map((b) => b.c);

  // Convert outlook[metal].score (-100..+100) accurately to unit scale (-1..+1)
  const rawScore100 = Number(outlook?.[metal]?.score ?? 0);
  const baseUnitScore = clampNum(Math.abs(rawScore100) > 1.5 ? rawScore100 / 100 : rawScore100, -1, 1);

  // Interactive scenario / CPI / Fed / AI delta (on -1..+1 unit scale)
  let scenarioTilt = 0;
  if (whisperScenarioId && whisperScenarioId !== 'none') {
    const preset = SCENARIO_PRESETS.find((p: any) => p.id === whisperScenarioId);
    if (preset) {
      const presetDelta = Number(metal === 'gold' ? preset.goldDelta ?? preset.delta ?? 0 : preset.silverDelta ?? preset.delta ?? 0);
      scenarioTilt += clampNum(presetDelta, -0.5, 0.5) * 0.45;
    }
  }
  scenarioTilt += clampNum(whisperCpi * 0.06 - whisperFed * 0.08, -0.35, 0.35);
  const aiInteractiveTilt = aiSimDelta * (metal === 'silver' ? 0.09 : 0.035);
  const interactiveDelta = clampNum(scenarioTilt + aiInteractiveTilt, -0.55, 0.55);
  const interactiveActive = Math.abs(interactiveDelta) > 0.001;
  const adjustedUnitScore = clampNum(baseUnitScore + interactiveDelta, -1, 1);

  const basisSignal =
    outlook?.institutionalSignals?.basis ||
    computeBasisSignal({
      spotGold: goldSpot,
      futGold: goldSpot * 1.005,
      spotSilver: silverSpot,
      futSilver: silverSpot * 1.003,
    }) ||
    buildBaselineInstitutionalSignals().basis;

  const physicalPremiums = computePhysicalPremiumSignals({
    spotGold: goldSpot,
    spotSilver: silverSpot,
    spotGoldDailyPct: goldQuote.pct || 0,
    spotSilverDailyPct: silverQuote.pct || 0,
    shanghai,
    comex,
    basis: basisSignal,
    vix: Number(macro.vix ?? 18),
    gvz: Number(outlook?.institutionalSignals?.impliedVol?.gvz) || null,
    headlines: outlook?.headlines || [],
    userOverrides:
      dealerQuotes.goldStreetOz != null || dealerQuotes.silverStreetOz != null
        ? {
            goldStreetOz: dealerQuotes.goldStreetOz ?? undefined,
            silverStreetOz: dealerQuotes.silverStreetOz ?? undefined,
          }
        : null,
  });

  const hiddenAlpha = computeHiddenAlphaSuite({
    spotGold: goldSpot,
    spotSilver: silverSpot,
    goldIntradayBars: candles.gold || timeframes['1d']?.gold || [],
    silverIntradayBars: candles.silver || timeframes['1d']?.silver || [],
    goldDailyCloses: goldCloses,
    silverDailyCloses: silverCloses,
    fxRates,
    comex,
    basis: basisSignal,
    macroSnapshot: macro,
    headlines: outlook?.headlines || [],
    goldRsi14: Number(macro.goldRsi14 ?? outlook?.setupQuality?.gold?.rsi14 ?? 50),
    silverRsi14: Number(macro.silverRsi14 ?? outlook?.setupQuality?.silver?.rsi14 ?? 50),
    cotGoldPct: Number(outlook?.proSignals?.cot?.gold?.percentile52w ?? 55),
    cotSilverPct: Number(outlook?.proSignals?.cot?.silver?.percentile52w ?? 55),
    goldTrendSign: Number(outlook?.gold?.score ?? 0) >= 0 ? 1 : -1,
    silverTrendSign: Number(outlook?.silver?.score ?? 0) >= 0 ? 1 : -1,
  });

  const aiScenarioMode = aiSimDelta > 0 ? 'surge' : aiSimDelta < 0 ? 'pause' : null;
  const aiRace = computeAiDatacenterSignal({
    headlines: outlook?.headlines || [],
    comex,
    basis: basisSignal,
    physicalPremiums,
    scenarioMode: aiScenarioMode,
  });

  const gaps = analyzeMarketGaps(activeBars, spot, metal, timeframe);
  const seasonality = getUpcoming30dSeasonality(metal);
  const alphaForMetal = hiddenAlpha?.[metal] || {};

  // Exact parameter-verified call to 4-Specialist Causal Stacked Precision Forecast Line
  const precisionLine = computePrecisionForecastLine({
    bars: activeBars,
    liveSpot: spot,
    tf: timeframe,
    metal,
    macroUnit: adjustedUnitScore,
    leadLagAlpha: Number(outlook?.[metal]?.leadLagAlpha ?? 0),
    seasonalityTilt: Number(seasonality?.unitTilt ?? 0),
    gapPrimary: gaps?.primary || null,
    opexMagnetPrice: Number(alphaForMetal?.opexMagnet?.magnetPrice) || null,
    opexPinStrength: Number(alphaForMetal?.opexMagnet?.pinStrength ?? 0),
    breakoutEnergyMult: Number(alphaForMetal?.springCoiling?.breakoutEnergyMult ?? 1.0),
  });

  // Historical Twins: prefer backend 7D macro-conditioned twins (DXY+VIX+TNX+price), else compute local empirical twins
  const backendTwins = outlook?.[metal]?.horizon30d?.historicalTwins || null;
  const twins =
    backendTwins && backendTwins.matchPct != null
      ? backendTwins
      : computeEmpiricalHistoricalTwins({
          closes: metal === 'gold' ? goldCloses : silverCloses,
          dxy: [],
          horizonDays: 21,
        }) || backendTwins;

  const hurst = computeHurstExponent((metal === 'gold' ? goldCloses : silverCloses).slice(-90));

  // Build synchronized 7D & 30D Ensemble Forecast anchored to live spot + backend 4-model ensemble + live interactive tilts
  const outMetal = outlook?.[metal] || {};
  const baseH7 = outMetal.horizon7d || {};
  const baseH30 = outMetal.horizon30d || {};
  const annualVolPct = metal === 'silver' ? Number(macro.silverVolAnnPct ?? 36) : Number(macro.goldVolAnnPct ?? 20);
  const fallbackDailyVol = clampNum(annualVolPct / 100 / Math.sqrt(252), 0.006, 0.05);
  const bars1m = timeframes['1m']?.[metal] || [];
  const dailyClosesForVol = bars1m.length >= 10 ? bars1m.map((b) => b.c) : [];
  const gvzRaw = Number(outlook?.institutionalSignals?.impliedVol?.gvz);
  const impliedVolAnnPct = Number.isFinite(gvzRaw) && gvzRaw > 4 ? (metal === 'silver' ? gvzRaw * 1.55 : gvzRaw) : null;
  const garchVol = computeEwmaGarchVol(dailyClosesForVol, {
    impliedVolAnnPct,
    fallbackDailyVol,
  });
  const dailyVol = clampNum(
    (garchVol.termVolForDays ? garchVol.termVolForDays(21) : garchVol.blendedDailyVol) * 0.65 + fallbackDailyVol * 0.35,
    0.006,
    0.06
  );

  // Re-anchor backend horizon percentages to LIVE spot so spot & target never drift apart
  const exp7Pct = +clampNum(Number(baseH7.expectedPct ?? adjustedUnitScore * 2.2) + interactiveDelta * 2.4, -12, 12).toFixed(2);
  const spread7Pct = Math.max(1.8, Math.abs(Number(baseH7.bullPct ?? 4.2) - Number(baseH7.bearPct ?? -3.8)) / 2);
  const h7BearPct = +(exp7Pct - spread7Pct).toFixed(2);
  const h7BullPct = +(exp7Pct + spread7Pct).toFixed(2);

  // Also run pure client project30DayPrecision with exact verified parameters when backend 30D is missing
  const driversObj: Record<string, any> = {};
  if (Array.isArray(outlook?.drivers)) {
    for (const d of outlook.drivers) {
      if (d?.id) driversObj[d.id] = d;
    }
  }
  const clientP30 = project30DayPrecision({
    spotPrice: spot,
    dailyVol,
    shortTermUnit: adjustedUnitScore,
    drivers: driversObj,
    quant: {
      goldRsi14: Number(macro.goldRsi14 ?? 50),
      silverRsi14: Number(macro.silverRsi14 ?? 50),
      ratio: silverSpot > 0 ? goldSpot / silverSpot : 83,
    },
    metal,
    shanghai,
    basis: basisSignal,
    physicalPremiums,
    aiDatacenter: aiRace,
    proSignals: outlook?.proSignals || null,
    series: { gold: goldCloses, silver: silverCloses },
    coneMultiplier: Number(outlook?.selfLearning?.coneMultiplier ?? 1.0),
  });

  const hasBackend30 = Number.isFinite(Number(baseH30.expectedPct));
  const exp30Pct = +clampNum(
    (hasBackend30 ? Number(baseH30.expectedPct) : Number(clientP30?.expectedPct ?? 0)) + interactiveDelta * 4.8,
    -24,
    24
  ).toFixed(2);
  const spread30Low = hasBackend30
    ? Math.max(3.2, Number(baseH30.expectedPct) - Number(baseH30.bearPct))
    : Math.max(3.2, Number(clientP30?.expectedPct ?? 0) - Number(clientP30?.bearPct ?? -6));
  const spread30High = hasBackend30
    ? Math.max(3.2, Number(baseH30.bullPct) - Number(baseH30.expectedPct))
    : Math.max(3.2, Number(clientP30?.bullPct ?? 6) - Number(clientP30?.expectedPct ?? 0));
  const h30BearPct = +(exp30Pct - spread30Low).toFixed(2);
  const h30BullPct = +(exp30Pct + spread30High).toFixed(2);

  const finalScore100 = Math.round(clampNum(adjustedUnitScore * 100, -100, 100));
  const resolvedSignal =
    finalScore100 >= 12
      ? 'Bullish'
      : finalScore100 <= -12
        ? 'Bearish'
        : !interactiveActive && typeof outMetal.signal === 'string'
          ? outMetal.signal
          : 'Neutral';

  const rawVotes = Array.isArray(baseH30.modelVotes) && baseH30.modelVotes.length
    ? baseH30.modelVotes
    : Array.isArray(clientP30?.modelVotes)
      ? clientP30.modelVotes
      : [];

  const milestones = [
    { day: 7, label: 'Day 7', pct: exp7Pct, price: +(spot * (1 + exp7Pct / 100)).toFixed(2) },
    { day: 14, label: 'Day 14', pct: +(exp7Pct + (exp30Pct - exp7Pct) * 0.38).toFixed(2), price: +(spot * (1 + (exp7Pct + (exp30Pct - exp7Pct) * 0.38) / 100)).toFixed(2) },
    { day: 21, label: 'Day 21', pct: +(exp7Pct + (exp30Pct - exp7Pct) * 0.72).toFixed(2), price: +(spot * (1 + (exp7Pct + (exp30Pct - exp7Pct) * 0.72) / 100)).toFixed(2) },
    { day: 30, label: 'Day 30', pct: exp30Pct, price: +(spot * (1 + exp30Pct / 100)).toFixed(2) },
  ];

  const eventRisk = outlook?.institutionalSignals?.eventRisk || getUpcomingEventRisk(new Date());

  // Frequency-Domain Spectral Forecast: prefer backend 1Y Yahoo daily DFT (~252 bars), fallback to local 1M daily closes
  const backendSpectral = outlook?.[metal]?.spectral || outlook?.[metal]?.horizon30d?.spectral || null;
  const spectral =
    backendSpectral?.available
      ? backendSpectral
      : computeSpectralForecast(dailyClosesForVol.length >= 16 ? dailyClosesForVol : activeBars.map((b) => b.c), {
          horizonDays: 21,
          minPeriod: 4,
          maxPeriod: 75,
          maxHarmonics: 3,
          sampleLabel: dailyClosesForVol.length >= 16 ? 'days' : 'bars',
        });

  // Cross-Horizon Alignment: compare +12H Tactical Chart Forecast vs 7D Swing vs 30D Macro Ensemble
  const bars1dForTactical = timeframes['1d']?.[metal] || candles[metal] || activeBars;
  const tacticalLine =
    timeframe === '1d'
      ? precisionLine
      : bars1dForTactical.length >= 6
        ? computePrecisionForecastLine({
            bars: bars1dForTactical,
            liveSpot: spot,
            tf: '1d',
            metal,
            macroUnit: adjustedUnitScore,
            leadLagAlpha: Number(outlook?.[metal]?.leadLagAlpha ?? 0),
            seasonalityTilt: Number(seasonality?.unitTilt ?? 0),
            gapPrimary: gaps?.primary || null,
            opexMagnetPrice: Number(alphaForMetal?.opexMagnet?.magnetPrice) || null,
            opexPinStrength: Number(alphaForMetal?.opexMagnet?.pinStrength ?? 0),
            breakoutEnergyMult: Number(alphaForMetal?.springCoiling?.breakoutEnergyMult ?? 1.0),
          })
        : precisionLine;

  const tacticalPts = Array.isArray(tacticalLine?.points) ? tacticalLine.points : [];
  const tacticalEndPrice = tacticalPts.length >= 2 ? Number(tacticalPts[tacticalPts.length - 1]?.price ?? spot) : spot;
  const tactical12hPct = spot > 0 ? +(((tacticalEndPrice - spot) / spot) * 100).toFixed(2) : 0;

  const signT = tactical12hPct > 0.12 ? 1 : tactical12hPct < -0.12 ? -1 : 0;
  const sign7 = exp7Pct > 0.25 ? 1 : exp7Pct < -0.25 ? -1 : 0;
  const sign30 = exp30Pct > 0.4 ? 1 : exp30Pct < -0.4 ? -1 : 0;
  const evList: Array<Record<string, any>> = Array.isArray(eventRisk?.expandedEvents)
    ? eventRisk.expandedEvents
    : Array.isArray(eventRisk?.upcoming)
      ? eventRisk.upcoming
      : [];
  const upcomingCatalysts7d = evList.filter(
    (e) => e.impact === 'high' && Number(e.daysUntil ?? e.daysAway ?? 99) >= 0 && Number(e.daysUntil ?? e.daysAway ?? 99) <= 7
  ).length;

  let alignLabel = 'Range Consolidation';
  let alignTone: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let alignSummary = 'Tactical +12H, 7D swing, and 30D macro are balanced near spot.';
  if (signT > 0 && sign7 > 0 && sign30 > 0) {
    alignLabel = 'Full Bullish Alignment';
    alignTone = 'bullish';
    alignSummary = 'Tactical +12H, 7D swing, and 30D macro ensemble all point higher.';
  } else if (signT < 0 && sign7 < 0 && sign30 < 0) {
    alignLabel = 'Full Bearish Alignment';
    alignTone = 'bearish';
    alignSummary = 'All three horizons align to the downside — elevated pullback risk.';
  } else if (sign7 > 0 && sign30 > 0) {
    alignLabel = signT < 0 ? 'Dip Inside Uptrend' : 'Bullish Macro Backdrop';
    alignTone = 'bullish';
    alignSummary =
      signT < 0
        ? 'Short-term +12H pullback inside a bullish 7D & 30D macro trend.'
        : '7D swing and 30D macro trend higher with neutral intraday consolidation.';
  } else if (sign7 < 0 && sign30 < 0) {
    alignLabel = signT > 0 ? 'Bounce Inside Downtrend' : 'Bearish Macro Backdrop';
    alignTone = 'bearish';
    alignSummary =
      signT > 0
        ? 'Short-term +12H bounce counter to softer 7D & 30D macro pressure.'
        : '7D swing and 30D macro trend lower with quiet intraday price action.';
  } else if (sign7 !== 0 && sign30 !== 0 && sign7 !== sign30) {
    alignLabel = 'Cross-Horizon Rotation';
    alignTone = 'neutral';
    alignSummary = '7D swing and 30D macro diverge — watch upcoming catalyst windows.';
  }

  const interactiveForecast = {
    metal,
    score: finalScore100,
    unitScore: +adjustedUnitScore.toFixed(3),
    signal: resolvedSignal,
    confidence: Number(outlook?.confidence ?? 72),
    interactiveActive,
    horizon7d: {
      bear: +(spot * (1 + h7BearPct / 100)).toFixed(2),
      base: +(spot * (1 + exp7Pct / 100)).toFixed(2),
      bull: +(spot * (1 + h7BullPct / 100)).toFixed(2),
      expectedPct: exp7Pct,
      bearPct: h7BearPct,
      bullPct: h7BullPct,
    },
    horizon30d: {
      bear: +(spot * (1 + h30BearPct / 100)).toFixed(2),
      base: +(spot * (1 + exp30Pct / 100)).toFixed(2),
      bull: +(spot * (1 + h30BullPct / 100)).toFixed(2),
      expectedPct: exp30Pct,
      bearPct: h30BearPct,
      bullPct: h30BullPct,
      agreementPct: Number(baseH30.agreementPct ?? clientP30?.agreementPct ?? 75),
      agreeCount: Number(baseH30.agreeCount ?? clientP30?.agreeCount ?? 3),
      hurst: Number(baseH30.hurst ?? hurst?.hurst ?? 0.5),
      hurstLabel: String(baseH30.hurstLabel ?? hurst?.label ?? 'Balanced'),
      modelVotes: rawVotes,
      milestones,
    },
    volRegime: {
      label: String(garchVol.volRegime || 'Balanced Volatility'),
      blendedAnnVolPct: Number(garchVol.blendedAnnVolPct ?? annualVolPct),
      ewmaAnnVolPct: Number(garchVol.ewmaAnnVolPct ?? annualVolPct),
      gvzAnnPct: impliedVolAnnPct != null ? +impliedVolAnnPct.toFixed(1) : null,
      ivSpreadAnnPct: Number(garchVol.ivSpreadAnnPct ?? 0),
    },
    horizonAlignment: {
      tactical12hPct,
      swing7dPct: exp7Pct,
      macro30dPct: exp30Pct,
      label: alignLabel,
      tone: alignTone,
      summary: alignSummary,
      upcomingCatalysts7d,
    },
  };

  const precision30d = {
    ...(clientP30 || {}),
    ...baseH30,
    expectedPct: exp30Pct,
    projectedEnd: interactiveForecast.horizon30d.base,
    base: interactiveForecast.horizon30d.base,
  };

  const worldSpacePulse = computeWorldSpacePulse({
    headlines: outlook?.headlines || [],
    spaceWeather,
    dxyPct: Number(macro.dxy5dPct ?? 0),
    vix: Number(macro.vix ?? 18),
  });

  const ratio = silverSpot > 0 ? goldSpot / silverSpot : 83;
  const ratioAnalytics =
    outlook?.ratioAnalytics ||
    computeRatioAnalytics({
      ratio,
      goldCloses,
      silverCloses,
    });

  const setupQuality =
    outlook?.setupQuality?.[metal] ||
    computeSetupQuality({
      metal,
      spot,
      bars: bars1y,
      squeezeScore: Number(comex?.[metal]?.squeezeScore ?? 55),
    });

  const marketRegime =
    outlook?.marketRegime ||
    computeMarketRegimeDecomposition({
      goldCloses,
      silverCloses,
      dxyPct: Number(macro.dxy5dPct ?? 0),
      vix: Number(macro.vix ?? 18),
    });

  return {
    precisionLine,
    precision30d,
    interactiveForecast,
    hiddenAlpha,
    aiRace,
    physicalPremiums,
    worldSpacePulse,
    setupQuality,
    ratioAnalytics,
    marketRegime,
    eventRisk,
    gaps,
    twins,
    seasonality,
    hurst,
    basisSignal,
    spectral,
  };
}
