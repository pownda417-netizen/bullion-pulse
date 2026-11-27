/**
 * Bullion Pulse — Physical Bullion Premium vs. Spot & Melt Analyzer
 * Zero-dependency ES module.
 *
 * Tracks retail physical coin & bar markups above paper spot / pure melt value,
 * detects Paper-vs-Physical Disconnects, estimates Dealer Buyback spreads, recommends
 * lower-premium product rotation during coin squeezes, and feeds a leading physical
 * supply/demand signal directly into Gold & Silver forecasts.
 */

const TROY_OZ_TO_GRAMS = 31.1034768;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export const PHYSICAL_BENCHMARKS = {
  gold: {
    normalLowPct: 2.0,
    normalHighPct: 5.0,
    squeezeStartPct: 6.5,
    products: [
      { id: 'gold_eagle', name: '1 oz Gold Eagle', oz: 1, basePremPct: 4.3, stressMult: 1.35, buybackOffsetPct: -1.8 },
      { id: 'gold_buffalo', name: '1 oz Gold Buffalo', oz: 1, basePremPct: 4.8, stressMult: 1.42, buybackOffsetPct: -1.6 },
      { id: 'gold_bar_1oz', name: '1 oz Gold Bar', oz: 1, basePremPct: 2.4, stressMult: 0.78, buybackOffsetPct: -1.4 },
    ],
  },
  silver: {
    normalLowPct: 8.0,
    normalHighPct: 15.0,
    squeezeStartPct: 20.0,
    products: [
      { id: 'silver_eagle', name: '1 oz Silver Eagle', oz: 1, basePremPct: 14.5, stressMult: 1.55, buybackOffsetPct: -5.5 },
      { id: 'silver_bar_10oz', name: '10 oz Silver Bar', oz: 10, basePremPct: 8.2, stressMult: 0.92, buybackOffsetPct: -4.8 },
      { id: 'silver_round_1oz', name: '1 oz Generic Round', oz: 1, basePremPct: 7.4, stressMult: 0.86, buybackOffsetPct: -5.0 },
    ],
  },
};

/**
 * Computes physical retail bullion premiums vs. Spot & Pure Melt for Gold and Silver
 * from live market microstructure (COMEX backwardation, Shanghai physical spread,
 * vault leverage, VIX/GVZ stress, Mint/Dealer shortage news) + optional user LCS dealer quotes.
 */
export function computePhysicalPremiumSignals({
  spotGold,
  spotSilver,
  spotGoldDailyPct = 0,
  spotSilverDailyPct = 0,
  shanghai = null,
  comex = null,
  basis = null,
  vix = 18,
  gvz = null,
  headlines = [],
  userOverrides = null, // { goldStreetOz?: number, silverStreetOz?: number }
} = {}) {
  // Count live Mint / Dealer / Coin Shortage / Retail Rush headlines (linear predicate pairs + 600-char cap)
  let retailShortageHits = 0;
  let retailCoolingHits = 0;
  const rxMintEntity = /\b(us mint|royal mint|perth mint|silver eagle|gold eagle|gold buffalo|costco gold|bullion coin|coin dealer|refiner)\b/i;
  const rxShortageWord = /\b(shortage|sold out|sell out|ration|delay|backlog|surge|record|premium|spike|scramble|rush)\b/i;
  const rxPremEntity = /\b(coin premium|bullion premium|dealer premium)\b/i;
  const rxCoolWord = /\b(fall|drop|cool|compress|ease|plunge|low)\b/i;
  for (const h of (headlines || []).slice(0, 150)) {
    const txt = `${h?.title || ''} ${h?.summary || ''}`.slice(0, 600);
    if (rxMintEntity.test(txt) && rxShortageWord.test(txt)) {
      retailShortageHits++;
    } else if (rxPremEntity.test(txt) && rxCoolWord.test(txt)) {
      retailCoolingHits++;
    }
  }
  const newsStress = clamp(retailShortageHits * 0.22 - retailCoolingHits * 0.14, -0.20, 0.65);

  const buildMetal = (metal, spot, dailyPct) => {
    const isSilver = metal === 'silver';
    const cfg = PHYSICAL_BENCHMARKS[metal];
    const safeSpot = Number.isFinite(Number(spot)) && Number(spot) > 0 ? Number(spot) : (isSilver ? 42.5 : 3600);

    // 1. Live physical stress inputs (0 = calm/full shelves, > 1 = acute squeeze)
    const basisM = basis?.[metal] || null;
    const isBackw = Boolean(basisM?.isBackwardation || (basisM?.basisUsd ?? 1) < 0);
    const backwStress = isBackw
      ? clamp(0.48 + Math.abs(basisM?.basisPct || 0.3) * 0.22, 0.45, 0.95)
      : basisM?.state === 'Compressed EFP'
        ? 0.22
        : 0;

    let sgeStress = 0;
    if (shanghai?.[metal]) {
      const prem = isSilver ? shanghai.silver.exVatPremiumUsdOz : shanghai.gold.premiumUsdOz;
      if (typeof prem === 'number' && Number.isFinite(prem)) {
        sgeStress = isSilver
          ? clamp((prem - 0.8) / 3.2, -0.25, 0.85)
          : clamp((prem - 8) / 35, -0.25, 0.85);
      }
    }

    const comexRatio = comex?.[metal]?.paperToRegisteredRatio;
    const vaultStress =
      typeof comexRatio === 'number' && Number.isFinite(comexRatio)
        ? isSilver
          ? clamp((comexRatio - 4.5) / 4.0, -0.15, 0.65)
          : clamp((comexRatio - 2.6) / 3.0, -0.15, 0.55)
        : 0;

    const fearStress =
      (Number.isFinite(gvz) ? clamp((gvz - 18) / 22, -0.1, 0.55) : 0) +
      (Number.isFinite(vix) ? clamp((vix - 19) / 24, -0.1, 0.50) : 0);

    // Paper dip during stress often spikes physical premiums (2020/2023 disconnect effect)
    const dipRush = dailyPct <= -1.2 && (fearStress > 0.15 || backwStress > 0.2) ? clamp(-dailyPct / 6.0, 0, 0.35) : 0;

    const rawStress = clamp(
      backwStress * 0.38 + sgeStress * 0.24 + vaultStress * 0.18 + fearStress * 0.18 + newsStress * 0.35 + dipRush,
      -0.32,
      1.65
    );

    // Compute per-product street price, markup over melt, and estimated dealer buyback
    const overrideKey = isSilver ? 'silverStreetOz' : 'goldStreetOz';
    const userStreet = Number(userOverrides?.[overrideKey]);
    const hasUserOverride = Number.isFinite(userStreet) && userStreet > safeSpot * 0.90;

    const products = cfg.products.map((p, idx) => {
      const meltVal = safeSpot * p.oz;
      let premPct;
      if (hasUserOverride && idx === 0) {
        premPct = ((userStreet - safeSpot) / safeSpot) * 100;
      } else {
        const dynamicAdd = isSilver ? rawStress * 12.5 * p.stressMult : rawStress * 3.1 * p.stressMult;
        premPct = clamp(p.basePremPct + dynamicAdd, isSilver ? 2.5 : 0.7, isSilver ? 68 : 18);
      }
      const streetPrice = meltVal * (1 + premPct / 100);
      const premUsd = streetPrice - meltVal;

      // Dealer buyback rises faster during squeezes — can exceed spot when shelves are bare!
      const squeezeBuybackLift =
        premPct > cfg.squeezeStartPct
          ? (premPct - cfg.squeezeStartPct) * (isSilver ? 0.55 : 0.48)
          : 0;
      const buybackVsSpotPct = clamp(
        p.buybackOffsetPct + squeezeBuybackLift + (hasUserOverride && idx === 0 ? Math.max(0, (premPct - cfg.normalHighPct) * 0.35) : 0),
        isSilver ? -9 : -3.5,
        isSilver ? 25 : 6.5
      );
      const buybackPrice = meltVal * (1 + buybackVsSpotPct / 100);

      return {
        id: p.id,
        name: p.name,
        oz: p.oz,
        meltPrice: +meltVal.toFixed(2),
        streetPrice: +streetPrice.toFixed(2),
        premiumUsd: +premUsd.toFixed(2),
        premiumPct: +premPct.toFixed(2),
        buybackPrice: +buybackPrice.toFixed(2),
        buybackVsSpotPct: +buybackVsSpotPct.toFixed(2),
        buybackAboveSpot: buybackVsSpotPct > 0.05,
        isUserQuote: hasUserOverride && idx === 0,
      };
    });

    // Benchmark sovereign coin (idx 0) & bar (idx 2/1) comparison
    const coin = products[0];
    const bar = products[products.length - 1];
    // Weighted retail premium index (60% sovereign coin + 40% investment bar/round)
    const compositePremPct = +(coin.premiumPct * 0.6 + bar.premiumPct * 0.4).toFixed(2);
    const barSavingsPct = +Math.max(0, ((coin.streetPrice / coin.oz - bar.streetPrice / bar.oz) / (coin.streetPrice / coin.oz)) * 100).toFixed(1);

    // Regime classification & Paper-vs-Physical Disconnect detector
    const normalMid = (cfg.normalLowPct + cfg.normalHighPct) / 2;
    const isSqueeze = coin.premiumPct >= cfg.squeezeStartPct * (isSilver ? 1.15 : 1.1) || compositePremPct >= cfg.squeezeStartPct;
    const isElevated = !isSqueeze && (coin.premiumPct > cfg.normalHighPct || compositePremPct > cfg.normalHighPct);
    const isCompressed = compositePremPct < cfg.normalLowPct;
    const paperPhysicalDisconnect = (isSqueeze || isElevated) && dailyPct <= -0.35;

    let status = 'Normal Retail Spread';
    let tone = 'neutral';
    let signal = 0;
    let predictionBoost = 0;

    if (isSqueeze) {
      status = paperPhysicalDisconnect ? 'Paper-Physical Disconnect ↑↑' : 'Physical Squeeze ↑↑';
      tone = 'bullish';
      const excess = (compositePremPct - cfg.normalHighPct) / (isSilver ? 18 : 5.5);
      signal = clamp(0.45 + excess * 0.42, 0.45, 0.92);
      predictionBoost = clamp(signal * 0.16, 0.07, 0.15);
    } else if (isElevated) {
      status = paperPhysicalDisconnect ? 'Physical Catch-Up Signal ↑' : 'Elevated Retail Demand ↑';
      tone = 'bullish';
      const excess = (compositePremPct - normalMid) / (isSilver ? 14 : 4.5);
      signal = clamp(0.18 + excess * 0.32, 0.15, 0.48);
      predictionBoost = clamp(signal * 0.14, 0.025, 0.07);
    } else if (isCompressed) {
      status = 'Compressed · Best Buyer Value';
      tone = 'value';
      signal = -0.14;
      predictionBoost = -0.025;
    } else {
      status = 'Normal Retail Spread';
      tone = 'neutral';
      const mildTilt = (compositePremPct - normalMid) / (isSilver ? 20 : 6);
      signal = clamp(mildTilt * 0.12, -0.08, 0.10);
      predictionBoost = clamp(signal * 0.08, -0.01, 0.015);
    }

    // Plain-English actionable guidance (Paper Disconnect, Mint Bottleneck, Buyback, Rotation)
    let advice = `Retail markups (${compositePremPct}% avg) sit inside the normal ${cfg.normalLowPct}–${cfg.normalHighPct}% range — shelves are well stocked, making this a clean accumulation window.`;
    if (isSqueeze) {
      advice = paperPhysicalDisconnect
        ? `Paper spot dipped while physical premiums surged to ${coin.premiumPct}% on ${coin.name} — classic Paper-Physical Disconnect (leading bullish spot catch-up). Rotate into ${bar.name} (${bar.premiumPct}%) to get ~${barSavingsPct}% more metal per dollar.`
        : `High physical retail demand (${coin.premiumPct}% on ${coin.name}) signals mint/dealer tightness${coin.buybackAboveSpot ? ' with buybacks above spot' : ''}. Consider ${bar.name} (${bar.premiumPct}%) for ~${barSavingsPct}% more ounces per dollar.`;
    } else if (isElevated) {
      advice = `Physical premiums (${coin.premiumPct}% on ${coin.name}) are running above normal ${cfg.normalLowPct}–${cfg.normalHighPct}% — rising retail buying adds bullish support. ${bar.name} (${bar.premiumPct}%) saves ~${barSavingsPct}% in markup.`;
    } else if (isCompressed) {
      advice = `Dealer markups compressed to ${compositePremPct}% (below normal ${cfg.normalLowPct}–${cfg.normalHighPct}%) — retail rush cooled (neutral short-term momentum), giving buyers the lowest over-melt cost.`;
    }

    return {
      metal,
      spot: +safeSpot.toFixed(2),
      meltPerGram: +(safeSpot / TROY_OZ_TO_GRAMS).toFixed(2),
      compositePremPct,
      normalRangeLabel: `${cfg.normalLowPct}–${cfg.normalHighPct}%`,
      status,
      tone,
      paperPhysicalDisconnect,
      hasUserOverride,
      barSavingsPct,
      buybackAboveSpot: coin.buybackAboveSpot,
      signal: +signal.toFixed(3),
      predictionBoost: +predictionBoost.toFixed(4),
      advice,
      products,
    };
  };

  const gold = buildMetal('gold', spotGold, spotGoldDailyPct);
  const silver = buildMetal('silver', spotSilver, spotSilverDailyPct);
  const overallStatus =
    gold.tone === 'bullish' && silver.tone === 'bullish'
      ? 'Physical Squeeze Active ↑'
      : silver.tone === 'bullish'
        ? 'Silver Physical Squeeze ↑'
        : gold.tone === 'bullish'
          ? 'Gold Physical Tightness ↑'
          : gold.tone === 'value' || silver.tone === 'value'
            ? 'Low Markup · Buyer Window'
            : 'Normal Dealer Spreads';

  return {
    overallStatus,
    gold,
    silver,
  };
}
