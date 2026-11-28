/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '*/monitor/precision_forecast.mjs' {
  export const FORECAST_HORIZON_SPECS: Record<string, any>;
  export function computeHurstExponent(closes: number[]): any;
  export function extractLocalFeatures(bars: any[]): any;
  export function computePrecisionForecastLine(opts: Record<string, any>): any;
}

declare module '*/monitor/physical_premiums.mjs' {
  export const PHYSICAL_BENCHMARKS: Record<string, any>;
  export function computePhysicalPremiumSignals(opts?: Record<string, any>): any;
}

declare module '*/monitor/institutional_signals.mjs' {
  export function getUpcomingEventRisk(nowDate?: Date): any;
  export function computeBasisSignal(opts?: Record<string, any>): any;
  export function buildBaselineInstitutionalSignals(nowDate?: Date): any;
}

declare module '*/monitor/spectral_forecast.mjs' {
  export function computeSpectralForecast(closes?: number[], opts?: Record<string, any>): any;
}

declare module '*/monitor/jump_diffusion.mjs' {
  export function createRng(seed?: number): () => number;
  export function computeEwmaGarchVol(closes?: number[], opts?: Record<string, any>): any;
  export function buildEventRiskSchedule(expandedEvents?: any[], opts?: Record<string, any>): any[];
  export function estimateJumpParams(opts?: Record<string, any>): any;
  export function runJumpDiffusion(opts?: Record<string, any>): any;
}

declare module '*/monitor/hidden_alpha.mjs' {
  export function computeHiddenAlphaSuite(opts?: Record<string, any>): any;
}

declare module '*/monitor/ai_datacenter.mjs' {
  export const AI_COMPUTE_META: any[];
  export const CHINA_AI_EV_META: any[];
  export const WORLD_AI_TECH_META: any[];
  export const AI_POWER_META: any[];
  export const PRIVATE_AI_SPACE_LABS: any[];
  export function computeAiDatacenterSignal(opts?: Record<string, any>): any;
}

declare module '*/monitor/historical_patterns.mjs' {
  export const DRIVER_META: Record<string, any>;
  export const HISTORICAL_ANALOGS: any[];
  export const SCENARIO_PRESETS: any[];
  export const NEWS_TOPICS: Record<string, any>;
  export const SEASONAL_20Y_MONTHLY: Record<'gold' | 'silver', number[]>;
  export function getUpcoming30dSeasonality(metal?: 'gold' | 'silver', nowDate?: Date): any;
  export function computeRatioAnalytics(opts?: Record<string, any>): any;
  export function computeSetupQuality(opts?: Record<string, any>): any;
  export function computeEmpiricalHistoricalTwins(opts?: Record<string, any>): any;
  export function project30DayPrecision(opts?: Record<string, any>): any;
  export function projectHorizon(
    spotPrice: number,
    dailyVol: number,
    compositeUnitScore: number,
    tradingDays: number,
    coneMultiplier?: number
  ): any;
  export function matchHistoricalAnalogs(driverScores: any, overallDir: string): any[];
  export function computeMarketRegimeDecomposition(opts?: Record<string, any>): any;
  export function analyzeMarketGaps(bars: any[], liveSpot?: number | null, metal?: string, tf?: string): any;
  export function parseNoaaSpaceWeather(noaaJson: any, nowIso?: string): any;
  export function computeWorldSpacePulse(opts?: Record<string, any>): any;
}
