/* Bullion Pulse — Strict Domain Types (React + TypeScript v60) */

export type MetalKey = 'gold' | 'silver';
export type ChartMode = 'gold' | 'silver' | 'ratio';
export type TimeframeKey = '15min' | '1h' | '4h' | '1d' | '7d' | '1m' | '6m' | '1y' | '5y' | '10y' | 'all';
export type UnitMode = 'oz' | 'g';
export type DirectionPref = 'both' | 'up' | 'down';
export type LogDir = 'up' | 'down' | 'neutral';
export type NewsFilterMode = 'all' | 'signal' | 'nohype';
export type NewsTopicKey =
  | 'all'
  | 'central_banks'
  | 'tech_solar_ai'
  | 'vaults_physical'
  | 'asia_retail'
  | 'geo_space'
  | 'macro_debt'
  | 'miners_supply';

export type CurrencyCode =
  | 'USD' | 'CAD' | 'EUR' | 'GBP' | 'CHF' | 'AUD' | 'MXN' | 'INR' | 'CNY' | 'JPY'
  | 'THB' | 'LAK' | 'SGD' | 'HKD' | 'KRW' | 'VND' | 'IDR' | 'AED' | 'SAR' | 'TRY' | 'ZAR';

export type LangCode = 'en' | 'th' | 'lo' | 'es' | 'zh' | 'ja' | 'hi';

export type VaultThemeId =
  | 'dark'
  | 'light'
  | 'oled'
  | 'swiss-gold'
  | 'mint-silver'
  | 'terminal-amber'
  | 'daylight-paper';

export type DeskLayoutMode = 'auto' | 'single' | 'split' | 'ultrawide';
export type ResolvedDeskLayout = 'single' | 'split' | 'ultrawide';
export type MainViewId = 'markets' | 'outlook' | 'trade' | 'stack' | 'alerts';

export type MarketsSubView = 'live' | 'global' | 'charts' | 'news';
export type OutlookSubView = 'forecast' | 'drivers' | 'vaults' | 'sim';
export type TradeSubView = 'swap' | 'ladder' | 'grader';
export type StackSubView = 'overview' | 'goals' | 'lots';
export type AlertsSubView = 'display' | 'rules' | 'phone' | 'setup';

export interface SubViewsState {
  markets: MarketsSubView;
  outlook: OutlookSubView;
  trade: TradeSubView;
  stack: StackSubView;
  alerts: AlertsSubView;
}

export interface StackSettings {
  goldOz: string;
  goldCost: string;
  silverOz: string;
  silverCost: string;
  goldSpreadPct: number;
  silverSpreadPct: number;
}

export interface StackLot {
  id: string;
  metal: MetalKey;
  oz: number;
  cost: number;
  form: string;
  note: string;
  date: string;
}

export interface StackGoals {
  goldOz: string;
  silverOz: string;
  targetUsd: string;
}

export interface LadderSettings {
  budget: number;
  metal: 'auto' | 'gold' | 'silver' | 'split';
}

export interface DealGraderSettings {
  preset: string;
  qty: number;
  ask: string;
}

export interface TargetAlerts {
  goldAbove: string;
  goldBelow: string;
  silverAbove: string;
  silverBelow: string;
  ratioAbove: string;
  ratioBelow: string;
}

export interface SmartAlerts {
  backwardation: boolean;
  shortSqueeze: boolean;
  dxyShock: boolean;
  morningDigest: boolean;
}

export interface QuietHours {
  enabled: boolean;
  start: number;
  end: number;
}

export interface DealerQuotes {
  goldStreetOz: number | null;
  silverStreetOz: number | null;
}

export interface ForecastJournalEntry {
  id: string;
  date: string;
  metal: MetalKey;
  userDir: 'up' | 'down';
  aiDir: LogDir;
  entryPrice: number;
  settledPrice: number | null;
  settledAt: string;
}

export interface AppSettings {
  goldThreshold: number;
  silverThreshold: number;
  shanghaiThreshold: number;
  direction: DirectionPref;
  ntfyTopic: string;
  unit: UnitMode;
  currency: CurrencyCode;
  privacyMode: boolean;
  ttsVoice: string;
  ttsRate: number;
  theme: VaultThemeId;
  language: LangCode;
  deskLayout: DeskLayoutMode;
  oledPixelShift: boolean;
  selectedMetal: MetalKey;
  chartMode: ChartMode;
  confirmMoves: boolean;
  showForecast: boolean;
  showDiscovery: boolean;
  showSqueeze: boolean;
  showFib: boolean;
  showSma: boolean;
  showRsi: boolean;
  showMyBuys: boolean;
  showPatterns: boolean;
  showGaps: boolean;
  showSessions: boolean;
  showNewsDots: boolean;
  newsFilter: NewsFilterMode;
  newsTopic: NewsTopicKey;
  dealerQuotes: DealerQuotes;
  forecastJournal: ForecastJournalEntry[];
  chartTimeframe: TimeframeKey;
  stack: StackSettings;
  stackLots: StackLot[];
  stackGoals: StackGoals;
  ladder: LadderSettings;
  dealGrader: DealGraderSettings;
  targets: TargetAlerts;
  smartAlerts: SmartAlerts;
  quietHours: QuietHours;
  subViews: SubViewsState;
}

export interface MetalQuote {
  price: number | null;
  prevClose: number | null;
  chg: number;
  pct: number;
  dayHigh?: number | null;
  dayLow?: number | null;
}

export interface CandleBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface HistoryPoint {
  ts: number;
  price: number;
}

export interface FuturesItem {
  price: number;
  prevClose?: number;
  pct?: number;
  symbol?: string;
}

export interface FuturesState {
  gold: FuturesItem | null;
  silver: FuturesItem | null;
  liveFetched: boolean;
  source: string;
}

export interface LiveMacroState {
  platinum: number | null;
  dxy: number | null;
  dxySource: string;
  consensusNote: string;
}

export interface FeedHealthState {
  spotAt: number | null;
  spotSource: string;
  dxyAt: number | null;
  dxyLive: boolean;
  futuresAt: number | null;
  sgeAt: number | null;
  comexAt: number | null;
  comexLive: boolean;
  outlookAt: number | null;
}

export interface FeedTrustState {
  status: 'verified' | 'auto-healed' | 'single' | 'demo' | 'connecting';
  primarySource: string;
  secondarySource: string;
  lastSpreadPct: number | null;
  rejectedOutliers: number;
  failovers: number;
  checksCount: number;
  lastVerifiedAt: number | null;
  lastEventNote: string;
}

export interface AlertLogItem {
  title: string;
  body: string;
  time: string;
  dir: LogDir;
  pct: number;
  badge: string;
}

export interface SessionAlertedState {
  gold: { day: string; dir: 'up' | 'down' | null; pct: number };
  silver: { day: string; dir: 'up' | 'down' | null; pct: number };
  shanghai: { day: string; dir: 'up' | 'down' | null; usd: number };
  targets: Record<string, string>;
  regime: Record<string, string>;
}

export interface CurrencyMeta {
  symbol: string;
  label: CurrencyCode;
  zeroDecimals: boolean;
  spoken: string;
  spokenSub: string;
}

export interface VaultThemeMeta {
  id: VaultThemeId;
  name: string;
  desc: string;
  metaColor: string;
  swatches: readonly [string, string, string, string];
  light: boolean;
}

export interface LanguageMeta {
  code: LangCode;
  short: string;
  native: string;
  label: string;
}

export interface DealPreset {
  name: string;
  metal: MetalKey;
  ozPerUnit: number;
  lowPct: number;
  highPct: number;
  qtyLabel: string;
}

export interface SpaceWeatherData {
  source: string;
  updatedAt: string;
  gScale: number;
  sScale: number;
  rScale: number;
  gForecast: number;
  peakScale: number;
  status: string;
  summary: string;
  goldBoost: number;
  silverBoost: number;
  jumpBoost: number;
}

export interface HistoricalTwinsSummary {
  count: number;
  matchPct: number;
  avgReturnPct: number;
  upPct: number;
  unitTilt: number;
  matches?: Array<{
    date: string;
    similarity: number;
    return30dPct: number;
    label?: string;
  }>;
}

export interface NewsArticle {
  title: string;
  source?: string;
  link?: string;
  publishedAt?: string;
  ageText?: string;
  goldImpact?: number;
  silverImpact?: number;
  direction?: 'bullish' | 'bearish' | 'neutral';
  topic?: string;
  topicLabel?: string;
  isHype?: boolean;
  signalStrength?: number;
  clusterCount?: number;
  matchedKeywords?: string[];
  summary?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type OutlookData = Record<string, any>;
export type ShanghaiData = Record<string, any>;
export type ComexData = Record<string, any>;
export type TimeframesData = Record<string, { gold?: CandleBar[]; silver?: CandleBar[] }>;

export interface PrecisionForecastResult {
  metal: MetalKey;
  spot: number;
  days: number;
  projectedEnd: number;
  expectedMovePct: number;
  bandLowEnd: number;
  bandHighEnd: number;
  dailyPath: Array<{ day: number; price: number; low: number; high: number }>;
  models: Array<{
    id: string;
    name: string;
    projectedPct: number;
    projectedPrice: number;
    weight: number;
    signal: 'bullish' | 'bearish' | 'neutral';
    note: string;
  }>;
  agreementPct: number;
  confidenceLabel: string;
  horizonDays: number;
}

export interface SwapCalcState {
  dir: 'g2s' | 's2g';
  oz: number;
  targetRatio: number;
  frictionPct: number;
}

export interface MonteCarloMilestone {
  target: number;
  direction: 'above' | 'below';
  touchPct: number;
  finishPct: number;
}

export interface MonteCarloSummary {
  metal: MetalKey;
  spot: number;
  horizonDays: number;
  tradingDays: number;
  pathsCount: number;
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
  logicalPath: number[];
  logicalEnd: number;
  logicalMovePct: number;
  logicalReason: string;
  closestSamplePath: number[];
  samplePaths: number[][];
  probUp: number;
  probPlus5: number;
  probMinus5: number;
  medianEnd: number;
  medianMovePct: number;
  p10End: number;
  p25End: number;
  p75End: number;
  p90End: number;
  jumpRegime: string;
  expectedJumpsPerMonth: number;
  annualVolPct: number;
  dailyDriftPct: number;
  exhaustionRisk: boolean;
  milestones?: {
    upside: MonteCarloMilestone;
    downside: MonteCarloMilestone;
  };
}
