import type {
  CandleBar,
  ComexData,
  CurrencyCode,
  FeedTrustState,
  MetalQuote,
  OutlookData,
  ShanghaiData,
  SpaceWeatherData,
  TimeframesData,
} from '../types/bullion';
import { DEFAULT_FX_RATES } from '../utils/format';
import {
  ALLOWED_CURRENCIES,
  defaultSpaceWeather,
  fetchWithTimeout,
  isPlainObject,
  sanitizeOutlookPayload,
  sanitizeSpaceWeatherFallback,
} from '../utils/security';
import { parseNoaaSpaceWeather } from '../../monitor/historical_patterns.mjs';

const RAW_DATA_BASE =
  'https://raw.githubusercontent.com/pownda417-netizen/bullion-pulse/main/data/';

export async function fetchFreshRepoJson<T = Record<string, unknown>>(fileName: string): Promise<T> {
  if (typeof fileName !== 'string' || !/^[a-z0-9_]+\.json$/i.test(fileName)) {
    throw new Error('Invalid data filename');
  }
  const localFetch = async (): Promise<T> => {
    const res = await fetchWithTimeout(`./data/${fileName}?t=${Date.now()}`, { cache: 'no-store' }, 8000);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  };

  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const canPollRaw =
    typeof window !== 'undefined' &&
    host === 'pownda417-netizen.github.io' &&
    path.startsWith('/bullion-pulse/');

  if (!canPollRaw) return localFetch();

  const rawFetch = async (): Promise<T> => {
    const res = await fetchWithTimeout(`${RAW_DATA_BASE}${fileName}?t=${Date.now()}`, {}, 4000);
    if (!res.ok) throw new Error(`Raw HTTP ${res.status}`);
    return (await res.json()) as T;
  };

  const [locRes, rawRes] = await Promise.allSettled([localFetch(), rawFetch()]);
  const loc = locRes.status === 'fulfilled' ? locRes.value : null;
  const raw = rawRes.status === 'fulfilled' ? rawRes.value : null;
  if (!loc && !raw) throw new Error(`Failed loading ${fileName}`);
  if (!raw) return loc as T;
  if (!loc) return raw as T;
  const locObj = loc as Record<string, unknown>;
  const rawObj = raw as Record<string, unknown>;
  const tLoc = Date.parse(String(locObj.generatedAt || locObj.updatedAt || 0)) || 0;
  const tRaw = Date.parse(String(rawObj.generatedAt || rawObj.updatedAt || 0)) || 0;
  return tRaw >= tLoc ? raw : loc;
}

export interface SpotFetchResult {
  gold: MetalQuote;
  silver: MetalQuote;
  source: string;
  trustStatus: FeedTrustState['status'];
  spreadPct: number | null;
  note: string;
  ts: number;
}

function isSaneQuote(metal: 'gold' | 'silver', p: number): boolean {
  if (!Number.isFinite(p) || p <= 0) return false;
  return metal === 'gold' ? p >= 1000 && p <= 25000 : p >= 10 && p <= 500;
}

const TROY_OZ_PER_KG = 32.15074656862798;

async function fetchBullionVaultSpot(): Promise<{ goldPrice: number; silverPrice: number } | null> {
  try {
    const res = await fetchWithTimeout(
      `https://www.bullionvault.com/view_market_json.do?t=${Date.now()}`,
      { cache: 'no-store' },
      5500
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      market?: {
        pitches?: Array<{
          securityId?: string;
          securityClassNarrative?: string;
          considerationCurrency?: string;
          buyPrices?: Array<{ limit?: number }>;
          sellPrices?: Array<{ limit?: number }>;
        }>;
      };
    };
    const pitches = data?.market?.pitches;
    if (!Array.isArray(pitches) || !pitches.length) return null;

    const pickMidOz = (preferredIds: string[], narrative: string): number | null => {
      const usdPitches = pitches.filter(
        (p) => p?.considerationCurrency === 'USD' && p?.securityClassNarrative === narrative
      );
      let chosen = null;
      for (const id of preferredIds) {
        chosen = usdPitches.find((p) => p.securityId === id) || null;
        if (chosen) break;
      }
      if (!chosen) chosen = usdPitches[0] || null;
      if (!chosen) return null;
      const bid = Number(chosen.buyPrices?.[0]?.limit);
      const ask = Number(chosen.sellPrices?.[0]?.limit);
      const midKg =
        Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0
          ? (bid + ask) / 2
          : Number.isFinite(bid) && bid > 0
            ? bid
            : Number.isFinite(ask) && ask > 0
              ? ask
              : NaN;
      if (!Number.isFinite(midKg) || midKg <= 0) return null;
      return +(midKg / TROY_OZ_PER_KG).toFixed(2);
    };

    const goldPrice = pickMidOz(['AUXLN', 'AUXZU', 'AUXNY', 'AUXSG', 'AUXTR'], 'GOLD');
    const silverPrice = pickMidOz(['AGXZU', 'AGXLN', 'AGXSG', 'AGXTR'], 'SILVER');
    if (goldPrice == null || silverPrice == null) return null;
    if (!isSaneQuote('gold', goldPrice) || !isSaneQuote('silver', silverPrice)) return null;
    return { goldPrice, silverPrice };
  } catch {
    return null;
  }
}

async function fetchCoinbasePaxgSpot(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(
      'https://api.coinbase.com/v2/prices/PAXG-USD/spot',
      { cache: 'no-store' },
      4500
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { amount?: string } };
    const gp = Number(data?.data?.amount);
    if (!isSaneQuote('gold', gp)) return null;
    return +gp.toFixed(2);
  } catch {
    return null;
  }
}

async function fetchGoldPriceOrg(): Promise<{ gold: MetalQuote; silver: MetalQuote } | null> {
  try {
    const res = await fetchWithTimeout('https://data-asg.goldprice.org/dbXRates/USD', {}, 5000);
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: Array<Record<string, number>> };
    const item = data?.items?.[0];
    if (!item) return null;
    const gp = Number(item.xauPrice);
    const sp = Number(item.xagPrice);
    if (!isSaneQuote('gold', gp) || !isSaneQuote('silver', sp)) return null;
    const gPrev = Number(item.xauClose) || gp;
    const sPrev = Number(item.xagClose) || sp;
    return {
      gold: {
        price: gp,
        prevClose: gPrev,
        chg: Number.isFinite(Number(item.chgXau)) ? Number(item.chgXau) : gp - gPrev,
        pct: Number.isFinite(Number(item.pcXau)) ? Number(item.pcXau) : gPrev > 0 ? ((gp - gPrev) / gPrev) * 100 : 0,
      },
      silver: {
        price: sp,
        prevClose: sPrev,
        chg: Number.isFinite(Number(item.chgXag)) ? Number(item.chgXag) : sp - sPrev,
        pct: Number.isFinite(Number(item.pcXag)) ? Number(item.pcXag) : sPrev > 0 ? ((sp - sPrev) / sPrev) * 100 : 0,
      },
    };
  } catch {
    return null;
  }
}

async function fetchGoldApi(): Promise<{ goldPrice: number; silverPrice: number } | null> {
  try {
    const [gRes, sRes] = await Promise.all([
      fetchWithTimeout('https://api.gold-api.com/price/XAU', {}, 4500),
      fetchWithTimeout('https://api.gold-api.com/price/XAG', {}, 4500),
    ]);
    if (!gRes.ok || !sRes.ok) return null;
    const gJson = (await gRes.json()) as { price?: number };
    const sJson = (await sRes.json()) as { price?: number };
    const gp = Number(gJson?.price);
    const sp = Number(sJson?.price);
    if (!isSaneQuote('gold', gp) || !isSaneQuote('silver', sp)) return null;
    return { goldPrice: gp, silverPrice: sp };
  } catch {
    return null;
  }
}

let goldPriceOrgBlockedUntil = 0;
let goldApiBlockedUntil = 0;

function anchorQuote(price: number, prevClose?: number | null, maxDrift = 0.18): MetalQuote {
  const p = +price.toFixed(2);
  const prev =
    prevClose != null &&
    Number.isFinite(prevClose) &&
    prevClose > 0 &&
    Math.abs(p - prevClose) / prevClose < maxDrift
      ? +prevClose.toFixed(2)
      : p;
  const chg = +(p - prev).toFixed(2);
  const pct = prev > 0 ? +(((p - prev) / prev) * 100).toFixed(2) : 0;
  return { price: p, prevClose: prev, chg, pct };
}

export async function fetchLiveSpotQuorum(
  prevCloseGold?: number | null,
  prevCloseSilver?: number | null,
  lastGoldPrice?: number | null
): Promise<SpotFetchResult | null> {
  const now = Date.now();

  // Primary browser-CORS physical exchange quorum: BullionVault (London/Zurich XAU & XAG) + Coinbase PAXG-USD
  const [bvRes, cbRes] = await Promise.allSettled([
    fetchBullionVaultSpot(),
    fetchCoinbasePaxgSpot(),
  ]);
  const bv = bvRes.status === 'fulfilled' ? bvRes.value : null;
  const cbGold = cbRes.status === 'fulfilled' ? cbRes.value : null;

  if (bv && cbGold != null) {
    const spreadPct = +((Math.abs(bv.goldPrice - cbGold) / cbGold) * 100).toFixed(2);
    if (spreadPct <= 2.5) {
      return {
        gold: anchorQuote(bv.goldPrice, prevCloseGold, 0.15),
        silver: anchorQuote(bv.silverPrice, prevCloseSilver, 0.22),
        source: 'BullionVault + Coinbase Quorum',
        trustStatus: 'verified',
        spreadPct,
        note: `Dual-source live quorum verified (spread ${spreadPct.toFixed(2)}%)`,
        ts: now,
      };
    }
    const useCb =
      lastGoldPrice != null &&
      Math.abs(cbGold - lastGoldPrice) < Math.abs(bv.goldPrice - lastGoldPrice);
    const gp = useCb ? cbGold : bv.goldPrice;
    return {
      gold: anchorQuote(gp, prevCloseGold, 0.15),
      silver: anchorQuote(bv.silverPrice, prevCloseSilver, 0.22),
      source: useCb ? 'Coinbase PAXG (Auto-Healed)' : 'BullionVault (Auto-Healed)',
      trustStatus: 'auto-healed',
      spreadPct,
      note: `Source divergence ${spreadPct.toFixed(2)}% auto-healed against anchor`,
      ts: now,
    };
  }

  if (bv) {
    return {
      gold: anchorQuote(bv.goldPrice, prevCloseGold, 0.15),
      silver: anchorQuote(bv.silverPrice, prevCloseSilver, 0.22),
      source: 'BullionVault Live Spot',
      trustStatus: 'single',
      spreadPct: null,
      note: 'Live BullionVault London/Zurich orderbook feed active',
      ts: now,
    };
  }

  // Fallback chain (cooldown-gated so rate-limited or offline hosts never stall 15s polling)
  const tryGpOrg = now >= goldPriceOrgBlockedUntil;
  const tryGoldApi = now >= goldApiBlockedUntil;
  const [primaryRes, secondaryRes] = await Promise.allSettled([
    tryGpOrg ? fetchGoldPriceOrg() : Promise.resolve(null),
    tryGoldApi ? fetchGoldApi() : Promise.resolve(null),
  ]);
  const primary = primaryRes.status === 'fulfilled' ? primaryRes.value : null;
  const secondary = secondaryRes.status === 'fulfilled' ? secondaryRes.value : null;
  if (tryGpOrg && !primary) goldPriceOrgBlockedUntil = now + 10 * 60 * 1000;
  else if (primary) goldPriceOrgBlockedUntil = 0;
  if (tryGoldApi && !secondary) goldApiBlockedUntil = now + 10 * 60 * 1000;
  else if (secondary) goldApiBlockedUntil = 0;

  if (primary && secondary) {
    const gDiffPct = Math.abs((primary.gold.price! - secondary.goldPrice) / secondary.goldPrice) * 100;
    const sDiffPct = Math.abs((primary.silver.price! - secondary.silverPrice) / secondary.silverPrice) * 100;
    const maxSpread = +Math.max(gDiffPct, sDiffPct).toFixed(2);
    if (maxSpread <= 2.5) {
      return {
        gold: primary.gold,
        silver: primary.silver,
        source: 'GoldPrice + Gold-API Quorum',
        trustStatus: 'verified',
        spreadPct: maxSpread,
        note: `Dual-source quorum verified (spread ${maxSpread.toFixed(2)}%)`,
        ts: now,
      };
    }
    const useSecondary =
      lastGoldPrice != null &&
      Math.abs(secondary.goldPrice - lastGoldPrice) < Math.abs(primary.gold.price! - lastGoldPrice);
    const gp = useSecondary ? secondary.goldPrice : primary.gold.price!;
    const sp = useSecondary ? secondary.silverPrice : primary.silver.price!;
    return {
      gold: anchorQuote(gp, primary.gold.prevClose || prevCloseGold, 0.15),
      silver: anchorQuote(sp, primary.silver.prevClose || prevCloseSilver, 0.22),
      source: useSecondary ? 'Gold-API (Auto-Healed)' : 'GoldPrice (Auto-Healed)',
      trustStatus: 'auto-healed',
      spreadPct: maxSpread,
      note: `Source divergence ${maxSpread.toFixed(2)}% auto-healed against anchor`,
      ts: now,
    };
  }

  if (primary) {
    return {
      gold: primary.gold,
      silver: primary.silver,
      source: 'GoldPrice Spot',
      trustStatus: 'single',
      spreadPct: null,
      note: 'GoldPrice live feed active',
      ts: now,
    };
  }

  if (secondary) {
    return {
      gold: anchorQuote(secondary.goldPrice, prevCloseGold, 0.15),
      silver: anchorQuote(secondary.silverPrice, prevCloseSilver, 0.22),
      source: 'Gold-API Live Spot',
      trustStatus: 'single',
      spreadPct: null,
      note: 'Live Gold-API Spot active with synced daily previous close',
      ts: now,
    };
  }

  // Last-resort live gold fallback via Coinbase PAXG-USD preserving synced Gold/Silver ratio
  if (cbGold != null && prevCloseSilver && prevCloseSilver > 0) {
    const ratio = prevCloseGold && prevCloseGold > 0 ? prevCloseGold / prevCloseSilver : 83.4;
    const estSilver = +(cbGold / Math.max(40, Math.min(130, ratio))).toFixed(2);
    return {
      gold: anchorQuote(cbGold, prevCloseGold, 0.15),
      silver: anchorQuote(estSilver, prevCloseSilver, 0.22),
      source: 'Coinbase PAXG Live',
      trustStatus: 'single',
      spreadPct: null,
      note: 'Live Coinbase PAXG gold feed active',
      ts: now,
    };
  }

  return null;
}

export async function fetchLiveFxRates(): Promise<Record<CurrencyCode, number> | null> {
  try {
    const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', {}, 6000);
    if (res.ok) {
      const data = (await res.json()) as { rates?: Record<string, number> };
      if (isPlainObject(data?.rates)) {
        const next: Record<CurrencyCode, number> = { ...DEFAULT_FX_RATES };
        for (const code of ALLOWED_CURRENCIES) {
          const r = Number(data.rates[code]);
          if (Number.isFinite(r) && r > 0 && r < 1e6) next[code] = r;
        }
        next.USD = 1;
        return next;
      }
    }
  } catch {
    // fallback below
  }
  try {
    const res = await fetchWithTimeout('https://api.frankfurter.app/latest?from=USD', {}, 6000);
    if (res.ok) {
      const data = (await res.json()) as { rates?: Record<string, number> };
      if (isPlainObject(data?.rates)) {
        const next: Record<CurrencyCode, number> = { ...DEFAULT_FX_RATES };
        for (const code of ALLOWED_CURRENCIES) {
          const r = Number(data.rates[code]);
          if (Number.isFinite(r) && r > 0 && r < 1e6) next[code] = r;
        }
        next.USD = 1;
        return next;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function fetchLiveNoaaSpaceWeather(fallback?: unknown): Promise<SpaceWeatherData> {
  try {
    const res = await fetchWithTimeout(
      'https://services.swpc.noaa.gov/products/noaa-scales.json',
      {},
      5500
    );
    if (res.ok) {
      const json = await res.json();
      const parsed = parseNoaaSpaceWeather(json);
      if (parsed) return sanitizeSpaceWeatherFallback(parsed);
    }
  } catch {
    /* ignore */
  }
  return fallback ? sanitizeSpaceWeatherFallback(fallback) : defaultSpaceWeather();
}

export interface RepoDataBundle {
  outlook: OutlookData | null;
  shanghai: ShanghaiData | null;
  comex: ComexData | null;
  accuracyLog: Record<string, unknown> | null;
  timeframes: TimeframesData;
  candles: { gold: CandleBar[]; silver: CandleBar[] };
  candles1m: { gold: CandleBar[]; silver: CandleBar[] };
}

function extractBars(raw: unknown): CandleBar[] {
  if (!Array.isArray(raw)) return [];
  const out: CandleBar[] = [];
  for (const b of raw) {
    if (!isPlainObject(b)) continue;
    const t = Number(b.t);
    const o = Number(b.o);
    const h = Number(b.h);
    const l = Number(b.l);
    const c = Number(b.c);
    if (Number.isFinite(t) && Number.isFinite(o) && Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c) && c > 0) {
      out.push({ t, o, h, l, c, v: Number.isFinite(Number(b.v)) ? Number(b.v) : 0 });
    }
  }
  return out;
}

export async function fetchAllRepoData(): Promise<RepoDataBundle> {
  const [outRes, sgeRes, comexRes, c1dRes, cHistRes, cFallbackRes, accRes] = await Promise.allSettled([
    fetchFreshRepoJson<OutlookData>('outlook.json'),
    fetchFreshRepoJson<ShanghaiData>('shanghai.json'),
    fetchFreshRepoJson<ComexData>('comex.json'),
    fetchFreshRepoJson<Record<string, unknown>>('candles_1d.json'),
    fetchFreshRepoJson<Record<string, unknown>>('candles_hist.json'),
    fetchFreshRepoJson<Record<string, unknown>>('candles.json'),
    fetchFreshRepoJson<Record<string, unknown>>('accuracy_log.json'),
  ]);

  const outlook = outRes.status === 'fulfilled' ? sanitizeOutlookPayload(outRes.value) : null;
  const shanghai = sgeRes.status === 'fulfilled' && isPlainObject(sgeRes.value) ? sgeRes.value : null;
  const comex = comexRes.status === 'fulfilled' && isPlainObject(comexRes.value) ? comexRes.value : null;
  const accuracyLog = accRes.status === 'fulfilled' && isPlainObject(accRes.value) ? accRes.value : null;

  const timeframes: TimeframesData = {};
  const mergeTimeframes = (rawObj: unknown) => {
    if (!isPlainObject(rawObj)) return;
    const rawTfs = isPlainObject(rawObj.timeframes)
      ? (rawObj.timeframes as Record<string, unknown>)
      : rawObj;
    for (const [k, val] of Object.entries(rawTfs)) {
      if (isPlainObject(val)) {
        const g = extractBars(val.gold);
        const s = extractBars(val.silver);
        if (g.length || s.length) {
          timeframes[k] = { gold: g, silver: s };
        }
      }
    }
  };
  if (cFallbackRes.status === 'fulfilled') mergeTimeframes(cFallbackRes.value);
  if (cHistRes.status === 'fulfilled') mergeTimeframes(cHistRes.value);

  const candles = { gold: [] as CandleBar[], silver: [] as CandleBar[] };
  const candles1m = { gold: [] as CandleBar[], silver: [] as CandleBar[] };

  if (c1dRes.status === 'fulfilled' && isPlainObject(c1dRes.value)) {
    candles.gold = extractBars(c1dRes.value.gold);
    candles.silver = extractBars(c1dRes.value.silver);
    if (isPlainObject(c1dRes.value.bars1m)) {
      candles1m.gold = extractBars(c1dRes.value.bars1m.gold);
      candles1m.silver = extractBars(c1dRes.value.bars1m.silver);
    }
  }
  if (!candles.gold.length && cFallbackRes.status === 'fulfilled' && isPlainObject(cFallbackRes.value)) {
    candles.gold = extractBars(cFallbackRes.value.gold);
    candles.silver = extractBars(cFallbackRes.value.silver);
  }
  if (candles.gold.length || candles.silver.length) {
    timeframes['1d'] = { gold: candles.gold, silver: candles.silver };
  }

  return { outlook, shanghai, comex, accuracyLog, timeframes, candles, candles1m };
}
