/**
 * Bullion Pulse — Shanghai Gold Exchange (SGE) Spot & Benchmark Module
 * Parses official SGE contracts (Au99.99, Au(T+D), Ag(T+D), SHAU/SHAG benchmarks)
 * and computes USD/troy oz conversions and Shanghai vs. Western Spot premiums.
 * Zero external dependencies (Node.js 20+ built-in fetch).
 */

export const TROY_OZ_TO_GRAMS = 31.1034768;
export const CHINA_SILVER_VAT = 0.13; // SGE domestic Ag(T+D) includes 13% VAT; investment Au99.99 is VAT-exempt

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) BullionPulseSGE/1.0';

/* ---------- Unit Conversion & Spread Math ---------- */

export function cnyPerGramToUsdPerOz(cnyPerGram, usdCny) {
  if (!Number.isFinite(cnyPerGram) || !Number.isFinite(usdCny) || usdCny <= 0) return null;
  return (cnyPerGram * TROY_OZ_TO_GRAMS) / usdCny;
}

export function cnyPerKgToUsdPerOz(cnyPerKg, usdCny) {
  if (!Number.isFinite(cnyPerKg) || !Number.isFinite(usdCny) || usdCny <= 0) return null;
  return ((cnyPerKg / 1000) * TROY_OZ_TO_GRAMS) / usdCny;
}

export function computeShanghaiMetrics({
  goldCnyPerG,
  goldOpenCnyPerG,
  goldContract = 'Au99.99',
  silverCnyPerKg,
  silverOpenCnyPerKg,
  silverContract = 'Ag(T+D)',
  usdCny,
  westernGoldUsdOz,
  westernSilverUsdOz,
  benchmarks = null,
  source = 'Shanghai Gold Exchange (SGE)',
  updatedAt = new Date().toISOString(),
}) {
  const goldUsdOz = cnyPerGramToUsdPerOz(goldCnyPerG, usdCny);
  const silverUsdOz = cnyPerKgToUsdPerOz(silverCnyPerKg, usdCny);
  const silverExVatUsdOz = silverUsdOz != null ? silverUsdOz / (1 + CHINA_SILVER_VAT) : null;

  const goldPct =
    goldOpenCnyPerG > 0 ? ((goldCnyPerG - goldOpenCnyPerG) / goldOpenCnyPerG) * 100 : 0;
  const silverPct =
    silverOpenCnyPerKg > 0 ? ((silverCnyPerKg - silverOpenCnyPerKg) / silverOpenCnyPerKg) * 100 : 0;

  const goldPremiumUsd =
    goldUsdOz != null && westernGoldUsdOz > 0 ? goldUsdOz - westernGoldUsdOz : null;
  const goldPremiumPct =
    goldPremiumUsd != null && westernGoldUsdOz > 0
      ? (goldPremiumUsd / westernGoldUsdOz) * 100
      : null;

  const silverSpreadUsd =
    silverUsdOz != null && westernSilverUsdOz > 0 ? silverUsdOz - westernSilverUsdOz : null;
  const silverExVatPremiumUsd =
    silverExVatUsdOz != null && westernSilverUsdOz > 0
      ? silverExVatUsdOz - westernSilverUsdOz
      : null;

  return {
    source,
    updatedAt,
    usdCny: +usdCny.toFixed(4),
    gold: {
      contract: goldContract,
      cnyPerG: +goldCnyPerG.toFixed(2),
      openCnyPerG: goldOpenCnyPerG ? +goldOpenCnyPerG.toFixed(2) : null,
      pct: +goldPct.toFixed(2),
      usdPerOz: goldUsdOz != null ? +goldUsdOz.toFixed(2) : null,
      premiumUsdOz: goldPremiumUsd != null ? +goldPremiumUsd.toFixed(2) : null,
      premiumPct: goldPremiumPct != null ? +goldPremiumPct.toFixed(2) : null,
    },
    silver: {
      contract: silverContract,
      cnyPerKg: +silverCnyPerKg.toFixed(1),
      openCnyPerKg: silverOpenCnyPerKg ? +silverOpenCnyPerKg.toFixed(1) : null,
      pct: +silverPct.toFixed(2),
      usdPerOz: silverUsdOz != null ? +silverUsdOz.toFixed(2) : null,
      exVatUsdPerOz: silverExVatUsdOz != null ? +silverExVatUsdOz.toFixed(2) : null,
      spreadUsdOz: silverSpreadUsd != null ? +silverSpreadUsd.toFixed(2) : null,
      exVatPremiumUsdOz: silverExVatPremiumUsd != null ? +silverExVatPremiumUsd.toFixed(2) : null,
    },
    benchmarks,
  };
}

/* ---------- Official SGE HTML Parser ---------- */

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export function parseSgeHomepageHtml(html) {
  const safeHtml = typeof html === 'string' ? html.slice(0, 2 * 1024 * 1024) : '';
  const rows = safeHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const contracts = {};
  const benchmarks = {};

  for (const row of rows) {
    const cells = (row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || []).map(stripTags);
    if (cells.length < 4) continue;

    // Spot / deferred table: Contract | Latest | High | Low | Open
    const code = cells[0];
    if (/^(Au99\.99|Au\(T\+D\)|mAu\(T\+D\)|Ag\(T\+D\)|Ag99\.99)$/i.test(code)) {
      const latest = parseFloat(cells[1].replace(/,/g, ''));
      const high = parseFloat(cells[2].replace(/,/g, ''));
      const low = parseFloat(cells[3].replace(/,/g, ''));
      const open = cells[4] ? parseFloat(cells[4].replace(/,/g, '')) : NaN;
      if (Number.isFinite(latest) && latest > 0) {
        contracts[code] = {
          contract: code,
          latest,
          high: Number.isFinite(high) ? high : null,
          low: Number.isFinite(low) ? low : null,
          open: Number.isFinite(open) && open > 0 ? open : null,
        };
      }
      continue;
    }

    // Benchmark table: Trade Date | Contract (SHAU/SHAG) | AM | PM
    if (/^\d{8}$/.test(cells[0]) && /^(SHAU|SHAG)$/i.test(cells[1])) {
      const am = parseFloat(cells[2].replace(/,/g, ''));
      const pm = parseFloat(cells[3].replace(/,/g, ''));
      benchmarks[cells[1].toUpperCase()] = {
        tradeDate: cells[0],
        am: Number.isFinite(am) ? am : null,
        pm: Number.isFinite(pm) ? pm : null,
      };
    }
  }

  // Prefer Au99.99, fall back to Au(T+D) or SHAU PM/AM benchmark
  const gold =
    contracts['Au99.99'] ||
    contracts['Au(T+D)'] ||
    contracts['mAu(T+D)'] ||
    (benchmarks.SHAU?.pm || benchmarks.SHAU?.am
      ? {
          contract: 'SHAU Benchmark',
          latest: benchmarks.SHAU.pm || benchmarks.SHAU.am,
          open: benchmarks.SHAU.am || benchmarks.SHAU.pm,
        }
      : null);

  // Prefer Ag(T+D), fall back to Ag99.99 or SHAG PM/AM benchmark
  const silver =
    contracts['Ag(T+D)'] ||
    contracts['Ag99.99'] ||
    (benchmarks.SHAG?.pm || benchmarks.SHAG?.am
      ? {
          contract: 'SHAG Benchmark',
          latest: benchmarks.SHAG.pm || benchmarks.SHAG.am,
          open: benchmarks.SHAG.am || benchmarks.SHAG.pm,
        }
      : null);

  if (!gold || !silver) {
    throw new Error('Could not parse SGE Gold/Silver contracts from en.sge.com.cn');
  }

  return { gold, silver, benchmarks };
}

/* ---------- Live Network Fetchers ---------- */

export async function fetchUsdCnyRate() {
  // Primary: Yahoo Finance CNY=X
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/CNY=X?range=5d&interval=1d', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = await res.json();
      const rate = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof rate === 'number' && rate > 5 && rate < 12) return rate;
    }
  } catch {
    // Fallback below
  }

  // Fallback: open.er-api.com
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = await res.json();
      const rate = json?.rates?.CNY;
      if (typeof rate === 'number' && rate > 5 && rate < 12) return rate;
    }
  } catch {
    // Final safe fallback
  }

  return 7.24;
}

export async function fetchShanghaiMetals({ westernGoldUsdOz, westernSilverUsdOz }) {
  const [usdCny, sgeHtml] = await Promise.all([
    fetchUsdCnyRate(),
    fetch('https://en.sge.com.cn/', {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(12000),
    }).then((res) => {
      if (!res.ok) throw new Error(`SGE HTTP ${res.status}`);
      return res.text();
    }),
  ]);

  const parsed = parseSgeHomepageHtml(sgeHtml);

  return computeShanghaiMetrics({
    goldCnyPerG: parsed.gold.latest,
    goldOpenCnyPerG: parsed.gold.open,
    goldContract: parsed.gold.contract,
    silverCnyPerKg: parsed.silver.latest,
    silverOpenCnyPerKg: parsed.silver.open,
    silverContract: parsed.silver.contract,
    usdCny,
    westernGoldUsdOz,
    westernSilverUsdOz,
    benchmarks: Object.keys(parsed.benchmarks).length ? parsed.benchmarks : null,
  });
}
