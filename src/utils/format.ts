import type {
  CurrencyCode,
  CurrencyMeta,
  DealPreset,
  LanguageMeta,
  UnitMode,
  VaultThemeId,
  VaultThemeMeta,
} from '../types/bullion';

export const TROY_OZ_TO_GRAMS = 31.1034768;
export const REFRESH_MS = 15_000;
export const SLOW_REFRESH_MS = 60_000;
export const CANDLE_INTERVAL_MS = 5 * 60 * 1000;
export const CANDLE_1M_MS = 60 * 1000;
export const MIN_ZOOM_BARS = 6;
export const STORAGE_KEY = 'bullion_pulse_state_v2';
export const MAX_BACKUP_BYTES = 512 * 1024;

export const DEFAULT_FX_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  CAD: 1.43,
  EUR: 0.91,
  GBP: 0.76,
  CHF: 0.84,
  AUD: 1.5,
  MXN: 19.03,
  INR: 93.37,
  CNY: 6.69,
  JPY: 159.75,
  THB: 33.94,
  LAK: 22369,
  SGD: 1.29,
  HKD: 7.84,
  KRW: 1331,
  VND: 25730,
  IDR: 18262,
  AED: 3.67,
  SAR: 3.75,
  TRY: 50.53,
  ZAR: 17.41,
};

export const CURRENCY_META: Readonly<Record<CurrencyCode, CurrencyMeta>> = Object.freeze({
  USD: { symbol: '$', label: 'USD', zeroDecimals: false, spoken: 'dollars', spokenSub: 'cents' },
  CAD: { symbol: 'C$', label: 'CAD', zeroDecimals: false, spoken: 'Canadian dollars', spokenSub: 'cents' },
  EUR: { symbol: '€', label: 'EUR', zeroDecimals: false, spoken: 'euros', spokenSub: 'cents' },
  GBP: { symbol: '£', label: 'GBP', zeroDecimals: false, spoken: 'pounds', spokenSub: 'pence' },
  CHF: { symbol: 'Fr', label: 'CHF', zeroDecimals: false, spoken: 'Swiss francs', spokenSub: 'centimes' },
  AUD: { symbol: 'A$', label: 'AUD', zeroDecimals: false, spoken: 'Australian dollars', spokenSub: 'cents' },
  MXN: { symbol: 'MX$', label: 'MXN', zeroDecimals: false, spoken: 'pesos', spokenSub: 'centavos' },
  INR: { symbol: '₹', label: 'INR', zeroDecimals: false, spoken: 'rupees', spokenSub: 'paise' },
  CNY: { symbol: 'CN¥', label: 'CNY', zeroDecimals: false, spoken: 'yuan', spokenSub: '' },
  JPY: { symbol: '¥', label: 'JPY', zeroDecimals: true, spoken: 'yen', spokenSub: '' },
  THB: { symbol: '฿', label: 'THB', zeroDecimals: false, spoken: 'baht', spokenSub: '' },
  LAK: { symbol: '₭', label: 'LAK', zeroDecimals: true, spoken: 'kip', spokenSub: '' },
  SGD: { symbol: 'S$', label: 'SGD', zeroDecimals: false, spoken: 'Singapore dollars', spokenSub: 'cents' },
  HKD: { symbol: 'HK$', label: 'HKD', zeroDecimals: false, spoken: 'Hong Kong dollars', spokenSub: 'cents' },
  KRW: { symbol: '₩', label: 'KRW', zeroDecimals: true, spoken: 'won', spokenSub: '' },
  VND: { symbol: '₫', label: 'VND', zeroDecimals: true, spoken: 'dong', spokenSub: '' },
  IDR: { symbol: 'Rp', label: 'IDR', zeroDecimals: true, spoken: 'rupiah', spokenSub: '' },
  AED: { symbol: 'DH ', label: 'AED', zeroDecimals: false, spoken: 'dirhams', spokenSub: '' },
  SAR: { symbol: 'SR ', label: 'SAR', zeroDecimals: false, spoken: 'riyals', spokenSub: '' },
  TRY: { symbol: '₺', label: 'TRY', zeroDecimals: false, spoken: 'Turkish lira', spokenSub: '' },
  ZAR: { symbol: 'R', label: 'ZAR', zeroDecimals: false, spoken: 'rand', spokenSub: '' },
});

export const VAULT_THEMES: readonly VaultThemeMeta[] = Object.freeze([
  {
    id: 'dark',
    name: 'Classic Dark',
    desc: 'Balanced obsidian dark desk with warm gold accents',
    metaColor: '#0D0E11',
    swatches: ['#0D0E11', '#15171C', '#D4A843', '#22C55E'],
    light: false,
  },
  {
    id: 'oled',
    name: 'OLED Pitch Black',
    desc: 'True #000000 black background — saves OLED phone & monitor battery',
    metaColor: '#000000',
    swatches: ['#000000', '#090A0D', '#E8C15A', '#22C55E'],
    light: false,
  },
  {
    id: 'swiss-gold',
    name: 'Swiss Gold',
    desc: 'Warm Zurich espresso-black vault with brushed champagne gold',
    metaColor: '#0F0D09',
    swatches: ['#0F0D09', '#1A160F', '#F0CA67', '#34D399'],
    light: false,
  },
  {
    id: 'mint-silver',
    name: 'Mint Silver',
    desc: 'Cool arctic slate with crisp platinum & mint silver accents',
    metaColor: '#0A0F14',
    swatches: ['#0A0F14', '#121B24', '#5EEAD4', '#CBD5E1'],
    light: false,
  },
  {
    id: 'terminal-amber',
    name: 'Retro Terminal Amber',
    desc: 'Classic glowing amber-on-black CRT trading terminal display',
    metaColor: '#090704',
    swatches: ['#090704', '#141008', '#FFB000', '#FFD166'],
    light: false,
  },
  {
    id: 'daylight-paper',
    name: 'Daylight Paper',
    desc: 'Warm high-contrast ivory broadsheet made for bright sunlight',
    metaColor: '#FBF8F1',
    swatches: ['#FBF8F1', '#F2ECE0', '#9A6B12', '#0F6A3B'],
    light: true,
  },
  {
    id: 'light',
    name: 'Classic Light',
    desc: 'Clean soft cream finish for daytime reading',
    metaColor: '#F6F4EF',
    swatches: ['#F6F4EF', '#FFFFFF', '#A77B16', '#15803D'],
    light: true,
  },
]);

export const THEME_MAP: Readonly<Record<VaultThemeId, VaultThemeMeta>> = Object.freeze(
  Object.fromEntries(VAULT_THEMES.map((t) => [t.id, t])) as Record<VaultThemeId, VaultThemeMeta>
);

export const LANGUAGES: readonly LanguageMeta[] = Object.freeze([
  { code: 'en', short: 'EN', native: 'English', label: 'EN · English' },
  { code: 'th', short: 'ไทย', native: 'ไทย', label: 'ไทย · Thai' },
  { code: 'lo', short: 'ລາວ', native: 'ລາວ', label: 'ລາວ · Lao' },
  { code: 'es', short: 'ES', native: 'Español', label: 'ES · Español' },
  { code: 'zh', short: '中文', native: '中文', label: '中文 · Chinese' },
  { code: 'ja', short: '日本語', native: '日本語', label: '日本語 · Japanese' },
  { code: 'hi', short: 'हिन्दी', native: 'हिन्दी', label: 'हिन्दी · Hindi' },
]);

export const DEAL_PRESETS: Readonly<Record<string, DealPreset>> = Object.freeze({
  ase_1oz: { name: '1 oz American Silver Eagle', metal: 'silver', ozPerUnit: 1.0, lowPct: 8, highPct: 16, qtyLabel: 'Quantity (coins)' },
  silver_maple: { name: '1 oz Silver Maple / Britannia', metal: 'silver', ozPerUnit: 1.0, lowPct: 5, highPct: 11, qtyLabel: 'Quantity (coins)' },
  silver_round: { name: '1 oz Generic Silver Round', metal: 'silver', ozPerUnit: 1.0, lowPct: 3, highPct: 7.5, qtyLabel: 'Quantity (rounds)' },
  silver_bar_10: { name: '10 oz Silver Bar', metal: 'silver', ozPerUnit: 10.0, lowPct: 2.5, highPct: 6.5, qtyLabel: 'Quantity (bars)' },
  junk_90: { name: '90% Pre-1965 US Silver', metal: 'silver', ozPerUnit: 0.715, lowPct: 2, highPct: 8, qtyLabel: 'Face Value ($1 = 0.715 oz)' },
  junk_40: { name: '40% Silver Half Dollars', metal: 'silver', ozPerUnit: 0.295, lowPct: -2, highPct: 5, qtyLabel: 'Face Value ($1 = 0.295 oz)' },
  age_1oz: { name: '1 oz American Gold Eagle', metal: 'gold', ozPerUnit: 1.0, lowPct: 3.5, highPct: 6.5, qtyLabel: 'Quantity (coins)' },
  agb_1oz: { name: '1 oz American Gold Buffalo', metal: 'gold', ozPerUnit: 1.0, lowPct: 3.8, highPct: 7.0, qtyLabel: 'Quantity (coins)' },
  gold_bar_1oz: { name: '1 oz Gold Bar / Maple', metal: 'gold', ozPerUnit: 1.0, lowPct: 1.5, highPct: 4.0, qtyLabel: 'Quantity (bars/coins)' },
  gold_tenth: { name: '1/10 oz Gold Coin', metal: 'gold', ozPerUnit: 0.1, lowPct: 8, highPct: 15, qtyLabel: 'Quantity (coins)' },
  gold_14k_g: { name: '14K Gold Jewelry (58.3% pure)', metal: 'gold', ozPerUnit: 0.5833 / TROY_OZ_TO_GRAMS, lowPct: 10, highPct: 25, qtyLabel: 'Weight (grams)' },
  gold_18k_g: { name: '18K Gold Jewelry (75% pure)', metal: 'gold', ozPerUnit: 0.75 / TROY_OZ_TO_GRAMS, lowPct: 10, highPct: 25, qtyLabel: 'Weight (grams)' },
  gold_24k_g: { name: '24K Pure Gold (99.9% pure)', metal: 'gold', ozPerUnit: 1.0 / TROY_OZ_TO_GRAMS, lowPct: 4, highPct: 12, qtyLabel: 'Weight (grams)' },
});

export function clampNum(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function convertUnit(usdPerOz: number | null | undefined, unit: UnitMode): number | null {
  if (usdPerOz == null) return null;
  const n = Number(usdPerOz);
  if (!Number.isFinite(n)) return null;
  return unit === 'g' ? n / TROY_OZ_TO_GRAMS : n;
}

export function getCurrencyMeta(code: CurrencyCode | string | undefined): CurrencyMeta {
  const key = String(code || 'USD').toUpperCase() as CurrencyCode;
  return Object.hasOwn(CURRENCY_META, key) ? CURRENCY_META[key] : CURRENCY_META.USD;
}

export function formatMoney(
  value: number | null | undefined,
  decimals = 2,
  currency: CurrencyCode = 'USD',
  fxRates: Record<CurrencyCode, number> = DEFAULT_FX_RATES,
  opts?: { usdOnly?: boolean }
): string {
  const code = opts?.usdOnly ? 'USD' : currency;
  const meta = getCurrencyMeta(code);
  const sym = meta.symbol;
  if (value == null) return `${sym}—`;
  const num = Number(value);
  if (!Number.isFinite(num)) return `${sym}—`;
  const fx = opts?.usdOnly ? 1 : (Number.isFinite(fxRates[code]) && fxRates[code] > 0 ? fxRates[code] : 1);
  const converted = num * fx;
  const dec = meta.zeroDecimals ? 0 : decimals;
  const abs = Math.abs(converted);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return `${converted < 0 ? '-' : ''}${sym}${formatted}`;
}

export function formatCompactMoney(
  value: number | null | undefined,
  currency: CurrencyCode = 'USD',
  fxRates: Record<CurrencyCode, number> = DEFAULT_FX_RATES
): string {
  const meta = getCurrencyMeta(currency);
  const sym = meta.symbol;
  if (value == null) return `${sym}—`;
  const num = Number(value);
  if (!Number.isFinite(num)) return `${sym}—`;
  const fx = Number.isFinite(fxRates[currency]) && fxRates[currency] > 0 ? fxRates[currency] : 1;
  const v = num * fx;
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}${sym}${(abs / 1e3).toFixed(1)}k`;
  const dec = meta.zeroDecimals ? 0 : abs >= 100 ? 0 : 2;
  return `${sign}${sym}${abs.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

export function formatSignedMoney(
  value: number | null | undefined,
  decimals = 2,
  currency: CurrencyCode = 'USD',
  fxRates: Record<CurrencyCode, number> = DEFAULT_FX_RATES
): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const base = formatMoney(Math.abs(n), decimals, currency, fxRates);
  return `${n >= 0 ? '+' : '−'}${base}`;
}

export function formatSignedPct(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(decimals)}%`;
}

export function formatTime(ts: number | string | Date | null | undefined): string {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalCdf(z: number): number {
  const x = clampNum(z, -8, 8);
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
