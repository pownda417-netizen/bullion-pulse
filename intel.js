/* Bullion Pulse — Charting, Macro Signals & Forecasting Intelligence Suite (v36)
 * Implements all 20 Category 5 intelligence features 100% locally in plain English.
 */
(function () {
  'use strict';

  const ui = {
    worldBoardMode: 'melt', // 'melt' | 'street'
    sessionMetal: 'gold',
    athMetal: 'gold',
    realAsset: 'oil',
    seasonMetal: 'gold',
    fgMetal: 'gold',
    radarMetal: 'gold',
    whisperCpi: 0,
    whisperFed: 0,
    vaultCountdowns: {},
    vaultMapLastRenderMin: -1,
    initialized: false,
  };

  function B() {
    return window.__BP_BRIDGE || null;
  }

  function clamp(v, lo, hi, fallback = lo) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  }

  function isLight() {
    const t = document.documentElement.getAttribute('data-theme');
    return t === 'light' || t === 'daylight-paper';
  }

  /* ---------- #4 World Physical Gold Board (7 Global Street Units) ---------- */

  function renderWorldGoldBoard() {
    const b = B();
    if (!b) return;
    const gridEl = document.getElementById('world-gold-board-grid');
    if (!gridEl) return;

    const isStreet = ui.worldBoardMode === 'street';
    document.getElementById('wgb-mode-melt')?.classList.toggle('active', !isStreet);
    document.getElementById('wgb-mode-street')?.classList.toggle('active', isStreet);

    const { gold: spotUsd } = b.getCanonicalSpotPrices();
    const fx = b.state.fxRates || {};
    const gramUsd = spotUsd / b.TROY_OZ_TO_GRAMS;
    const mult = isStreet ? 1.03 : 1.0;

    // Live Shanghai SGE Au99.99 if available (already includes China physical spread)
    const sgeCnyG = Number(b.outlookState.data?.shanghai?.gold?.cnyPerG);
    const chinaG = Number.isFinite(sgeCnyG) && sgeCnyG > 200
      ? sgeCnyG * (isStreet ? 1.015 : 1.0)
      : gramUsd * (fx.CNY || 7.2) * mult;
    const chinaTael = chinaG * 37.429;

    // Thai & Lao standard 1 Baht-weight bar = 15.244g @ 96.5% pure gold
    const bahtPureGrams = 15.244 * 0.965;
    const thaiBahtPrice = gramUsd * bahtPureGrams * (fx.THB || 33.94) * mult;
    const thaiSalung = thaiBahtPrice / 4;

    const laoBahtPrice = gramUsd * bahtPureGrams * (fx.LAK || 22369) * mult;
    const laoSalung = laoBahtPrice / 4;

    // India: per 10g 24K (99.9%) and 22K (91.6%)
    const india10g24k = gramUsd * 10 * (fx.INR || 93.37) * mult;
    const india10g22k = india10g24k * 0.916;

    // Dubai: AED/g 24K & 22K
    const dubaiG24k = gramUsd * (fx.AED || 3.67) * mult;
    const dubaiG22k = dubaiG24k * 0.916;

    // Japan: ¥/g 24K
    const japanG24k = gramUsd * (fx.JPY || 159.75) * mult;

    const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
    const fmtCompactKip = (n) =>
      n >= 1_000_000 ? `₭${(n / 1_000_000).toFixed(2)}M` : `₭${fmtInt(n)}`;

    const cards = [
      {
        flag: '🇺🇸',
        country: 'United States',
        unit: '1 Troy oz · 24K',
        main: `$${(spotUsd * mult).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        sub: `$${(gramUsd * mult).toFixed(2)} / gram`,
      },
      {
        flag: '🇨🇳',
        country: 'China (Shanghai)',
        unit: '1 Gram · Au99.99',
        main: `CN¥${chinaG.toFixed(1)}`,
        sub: `1 Tael: CN¥${fmtInt(chinaTael)}`,
      },
      {
        flag: '🇹🇭',
        country: 'Thailand',
        unit: '1 Baht-wt (15.244g · 96.5%)',
        main: `฿${fmtInt(thaiBahtPrice)}`,
        sub: `1 Salung: ฿${fmtInt(thaiSalung)}`,
      },
      {
        flag: '🇱🇦',
        country: 'Laos',
        unit: '1 Baht-wt (15.244g · 96.5%)',
        main: fmtCompactKip(laoBahtPrice),
        sub: `1 Salung: ${fmtCompactKip(laoSalung)}`,
      },
      {
        flag: '🇮🇳',
        country: 'India',
        unit: '10 Grams · 24K & 22K',
        main: `₹${fmtInt(india10g24k)}`,
        sub: `22K: ₹${fmtInt(india10g22k)} / 10g`,
      },
      {
        flag: '🇦🇪',
        country: 'Dubai (UAE)',
        unit: '1 Gram · 24K & 22K',
        main: `DH ${dubaiG24k.toFixed(1)}`,
        sub: `22K: DH ${dubaiG22k.toFixed(1)} / g`,
      },
      {
        flag: '🇯🇵',
        country: 'Japan',
        unit: '1 Gram · 24K',
        main: `¥${fmtInt(japanG24k)}`,
        sub: `10g Bar: ¥${fmtInt(japanG24k * 10)}`,
      },
    ];

    gridEl.innerHTML = cards
      .map(
        (c) => `
        <article class="wgb-card">
          <div class="wgb-top">
            <span class="wgb-country"><span aria-hidden="true">${c.flag}</span> ${b.escapeHtml(c.country)}</span>
          </div>
          <div class="wgb-unit">${b.escapeHtml(c.unit)}</div>
          <strong class="wgb-price">${b.escapeHtml(c.main)}</strong>
          <div class="wgb-sub">${b.escapeHtml(c.sub)}</div>
        </article>`
      )
      .join('');
  }

  /* ---------- #140 Live Glowing Global Vault World Map (Real NASA Equirectangular Earth) ---------- */

  // Real geographic (lat, lon) coordinates projected mathematically onto 1000×500 equirectangular map
  const GLOBAL_HUBS = [
    { id: 'ny', name: 'New York', tag: 'US Market', tz: 'America/New_York', openH: 8, closeH: 17, lat: 40.71, lon: -74.01, cur: 'USD', unit: 'oz', lblSide: 'left', dy: -2 },
    { id: 'lon', name: 'London', tag: 'UK Market', tz: 'Europe/London', openH: 8, closeH: 17, lat: 51.51, lon: -0.13, cur: 'GBP', unit: 'oz', lblSide: 'left', dy: -9 },
    { id: 'zur', name: 'Zurich', tag: 'Swiss Vaults', tz: 'Europe/Zurich', openH: 8, closeH: 17, lat: 47.37, lon: 8.54, cur: 'CHF', unit: 'g', lblSide: 'right', dy: 12 },
    { id: 'dxb', name: 'Dubai', tag: 'Gold Souk', tz: 'Asia/Dubai', openH: 9, closeH: 21, lat: 25.20, lon: 55.27, cur: 'AED', unit: 'g', lblSide: 'left', dy: 12 },
    { id: 'bom', name: 'Mumbai', tag: 'India Market', tz: 'Asia/Kolkata', openH: 9, closeH: 23, lat: 19.08, lon: 72.88, cur: 'INR', unit: '10g', lblSide: 'right', dy: 14 },
    { id: 'sha', name: 'Shanghai', tag: 'China Market', tz: 'Asia/Shanghai', openH: 9, closeH: 15, lat: 31.23, lon: 121.47, cur: 'CNY', unit: 'g', lblSide: 'right', dy: -3 },
  ];

  function projectEquirectangular(lat, lon) {
    return {
      x: ((lon + 180) / 360) * 1000,
      y: ((90 - lat) / 180) * 500,
    };
  }

  function getTzParts(now, tz) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const hh = parseInt(get('hour'), 10) % 24;
    const mm = parseInt(get('minute'), 10) || 0;
    return {
      wd: wdMap[get('weekday')] ?? 1,
      hh,
      mm,
      mins: hh * 60 + mm,
      timeStr: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    };
  }

  function isGlobalBullionWeekend(now) {
    try {
      const ny = getTzParts(now, 'America/New_York');
      return (
        ny.wd === 6 ||
        (ny.wd === 5 && ny.mins >= 17 * 60) ||
        (ny.wd === 0 && ny.mins < 18 * 60)
      );
    } catch {
      return false;
    }
  }

  function getHubClockState(hub, now, isGlobalWeekend) {
    try {
      const t = getTzParts(now, hub.tz);
      if (isGlobalWeekend) {
        return { active: false, timeStr: t.timeStr, status: 'Weekend' };
      }
      const isWeekday = t.wd >= 1 && t.wd <= 5;
      if (hub.id === 'sha') {
        const isMorning = isWeekday && t.mins >= 9 * 60 && t.mins < 11 * 60 + 30;
        const isLunch = isWeekday && t.mins >= 11 * 60 + 30 && t.mins < 13 * 60 + 30;
        const isAfternoon = isWeekday && t.mins >= 13 * 60 + 30 && t.mins < 15 * 60 + 30;
        const isNightEvening = isWeekday && t.mins >= 20 * 60;
        // SGE overnight session (00:00–02:30 Beijing) continues Mon–Fri 20:00 opens, so Tue–Sat mornings only (never Mon morning)
        const isNightLate = t.wd >= 2 && t.wd <= 6 && t.mins < 2 * 60 + 30;
        if (isMorning || isAfternoon) return { active: true, timeStr: t.timeStr, status: 'Open · Day' };
        if (isNightEvening || isNightLate) return { active: true, timeStr: t.timeStr, status: 'Open · Night' };
        if (isLunch) return { active: false, timeStr: t.timeStr, status: 'Lunch Break' };
        return { active: false, timeStr: t.timeStr, status: 'Closed' };
      }
      if (hub.id === 'ny') {
        const isMaint = t.mins >= 17 * 60 && t.mins < 18 * 60;
        const isCore = isWeekday && t.mins >= 8 * 60 + 20 && t.mins < 13 * 60 + 30;
        const isAfternoon = isWeekday && t.mins >= 13 * 60 + 30 && t.mins < 17 * 60;
        if (isCore) return { active: true, subMode: 'core', timeStr: t.timeStr, status: 'Open · Busiest' };
        if (isAfternoon) return { active: true, subMode: 'core', timeStr: t.timeStr, status: 'Open · Afternoon' };
        if (isMaint) return { active: false, subMode: 'break', timeStr: t.timeStr, status: 'Daily Break' };
        if (t.wd === 0 && t.mins >= 18 * 60) {
          return { active: true, subMode: 'electronic', timeStr: t.timeStr, status: 'Open · Sunday Open' };
        }
        return { active: true, subMode: 'electronic', timeStr: t.timeStr, status: 'Open · Overnight' };
      }
      if (hub.id === 'lon') {
        const active = isWeekday && t.mins >= 8 * 60 && t.mins < 16 * 60 + 30;
        return { active, timeStr: t.timeStr, status: active ? 'Open Now' : 'Closed' };
      }
      if (hub.id === 'bom') {
        const active = isWeekday && t.mins >= 9 * 60 && t.mins < 23 * 60 + 30;
        return { active, timeStr: t.timeStr, status: active ? 'Open Now' : 'Closed' };
      }
      if (hub.id === 'dxb') {
        const active = isWeekday && t.mins >= 8 * 60 && t.mins < 23 * 60;
        return { active, timeStr: t.timeStr, status: active ? 'Open Now' : 'Closed' };
      }
      const active = isWeekday && t.hh >= hub.openH && t.hh < hub.closeH;
      return { active, timeStr: t.timeStr, status: active ? 'Open Now' : 'Closed' };
    } catch {
      return { active: false, timeStr: '--:--', status: 'Closed' };
    }
  }

  function findNextHubTransition(hub, nowMs, predicate) {
    const baseMin = Math.floor(nowMs / 60000);
    const stepMins = 30;
    const maxSteps = 160; // Up to 80 hours ahead (covers full weekend + next open for all hubs)
    let loMin = baseMin;
    let hiMin = null;
    let hiState = null;

    for (let s = 1; s <= maxSteps; s++) {
      const probeMin = baseMin + s * stepMins;
      const d = new Date(probeMin * 60000);
      const st = getHubClockState(hub, d, isGlobalBullionWeekend(d));
      if (predicate(st)) {
        hiMin = probeMin;
        hiState = st;
        break;
      }
      loMin = probeMin;
    }
    if (hiMin == null) return null;

    while (hiMin - loMin > 1) {
      const midMin = Math.floor((loMin + hiMin) / 2);
      const dMid = new Date(midMin * 60000);
      const stMid = getHubClockState(hub, dMid, isGlobalBullionWeekend(dMid));
      if (predicate(stMid)) {
        hiMin = midMin;
        hiState = stMid;
      } else {
        loMin = midMin;
      }
    }
    return { targetMs: hiMin * 60000, nextState: hiState };
  }

  function formatMarketCountdown(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(totalSec / 86400);
    const hrs = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (days >= 1) {
      return mins > 0 ? `${days}d ${hrs}h ${mins}m` : `${days}d ${hrs}h`;
    }
    if (hrs >= 1) {
      return `${hrs}h ${mins}m`;
    }
    if (mins >= 1) {
      return `${mins}m ${String(secs).padStart(2, '0')}s`;
    }
    return `${Math.max(1, secs)}s`;
  }

  function getHubCountdownMeta(hub, clock, nowMs) {
    if (!clock.active) {
      const hit = findNextHubTransition(hub, nowMs, (st) => st.active);
      return hit ? { verb: 'Opens in', targetMs: hit.targetMs, isOpening: true } : null;
    }
    if (hub.id === 'ny' && clock.subMode === 'electronic') {
      const hit = findNextHubTransition(hub, nowMs, (st) => st.subMode === 'core');
      return hit ? { verb: 'Main open in', targetMs: hit.targetMs, isOpening: true } : null;
    }
    const hit = findNextHubTransition(hub, nowMs, (st) => !st.active);
    if (!hit) return null;
    const nextStatus = hit.nextState?.status || '';
    const verb =
      nextStatus === 'Lunch Break'
        ? 'Lunch in'
        : nextStatus === 'Daily Break'
          ? 'Break in'
          : 'Closes in';
    return { verb, targetMs: hit.targetMs, isOpening: false };
  }

  function tickVaultMapCountdowns() {
    const gridEl = document.getElementById('vault-hub-grid');
    if (!gridEl) return;
    const now = new Date();
    const nowMs = now.getTime();
    const curMin = Math.floor(nowMs / 60000);
    let needsFullRender = false;

    for (const hub of GLOBAL_HUBS) {
      const info = ui.vaultCountdowns[hub.id];
      if (!info || !info.targetMs) continue;
      const rem = info.targetMs - nowMs;
      if (rem <= 0) {
        needsFullRender = true;
        break;
      }
      const el = gridEl.querySelector(`.vault-hub-countdown[data-hub-id="${hub.id}"]`);
      if (!el) continue;
      const nextText = `${info.verb} ${formatMarketCountdown(rem)}`;
      if (el.dataset.rawCountdown !== nextText) {
        el.dataset.rawCountdown = nextText;
        el.textContent = nextText;
      }
    }

    if (needsFullRender || (ui.vaultMapLastRenderMin >= 0 && curMin !== ui.vaultMapLastRenderMin)) {
      renderGlobalVaultMap();
    }
  }

  function formatHubPrice(hub, goldUsd, fxRates, currencyMeta) {
    const rate = fxRates[hub.cur] || 1;
    const sym = currencyMeta[hub.cur]?.symbol || '$';
    const perG = (goldUsd / 31.1034768) * rate;
    if (hub.unit === 'oz') {
      return `${sym}${Math.round(goldUsd * rate).toLocaleString('en-US')}/oz`;
    }
    if (hub.unit === '10g') {
      return `${sym}${Math.round(perG * 10).toLocaleString('en-US')}/10g`;
    }
    return `${sym}${perG.toFixed(hub.cur === 'CNY' || hub.cur === 'AED' ? 0 : 1)}/g`;
  }

  function renderGlobalVaultMap() {
    const b = B();
    if (!b) return;
    const svgWrap = document.getElementById('vault-map-svg-wrap');
    const gridEl = document.getElementById('vault-hub-grid');
    const badgeEl = document.getElementById('vault-map-badge');
    if (!svgWrap || !gridEl) return;

    const now = new Date();
    const nowMs = now.getTime();
    ui.vaultMapLastRenderMin = Math.floor(nowMs / 60000);
    const isGlobalWeekend = isGlobalBullionWeekend(now);
    const { gold: goldUsd } = b.getCanonicalSpotPrices();
    const statuses = GLOBAL_HUBS.map((h) => {
      const pt = projectEquirectangular(h.lat, h.lon);
      const clock = getHubClockState(h, now, isGlobalWeekend);
      const countdown = getHubCountdownMeta(h, clock, nowMs);
      if (countdown) ui.vaultCountdowns[h.id] = countdown;
      else delete ui.vaultCountdowns[h.id];
      const countdownText = countdown
        ? `${countdown.verb} ${formatMarketCountdown(countdown.targetMs - nowMs)}`
        : '';
      return {
        ...h,
        x: pt.x,
        y: pt.y,
        clock,
        countdown,
        countdownText,
        localPrice: formatHubPrice(h, goldUsd, b.state.fxRates, b.CURRENCY_META),
      };
    });
    const openCount = statuses.filter((s) => s.clock.active).length;

    if (badgeEl) {
      badgeEl.textContent =
        openCount > 0
          ? `${openCount} Hub${openCount > 1 ? 's' : ''} Open Live`
          : isGlobalWeekend
            ? 'Weekend Closed'
            : 'Quiet / Daily Break';
      badgeEl.className = `signal-pill ${openCount > 0 ? 'bullish' : ''}`;
    }

    const byId = Object.fromEntries(statuses.map((s) => [s.id, s]));
    const arc = (a, b2, lift) => {
      const mx = (a.x + b2.x) / 2;
      const my = (a.y + b2.y) / 2 - lift;
      return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b2.x.toFixed(1)},${b2.y.toFixed(1)}`;
    };

    const pinsSvg = statuses
      .map((h) => {
        const col = h.clock.active ? '#22C55E' : '#EAB308';
        const ringCol = h.clock.active ? 'rgba(34,197,94,0.34)' : 'rgba(234,179,8,0.22)';
        const isLeft = h.lblSide === 'left';
        const textAnchor = isLeft ? 'end' : 'start';
        const lx = h.x + (isLeft ? -11 : 11);
        const ly = h.y + (h.dy || 0);
        const pillW = Math.max(54, h.name.length * 7.2 + 14);
        const pillX = isLeft ? lx - pillW + 4 : lx - 5;
        return `
          <g>
            <circle cx="${h.x.toFixed(1)}" cy="${h.y.toFixed(1)}" r="${h.clock.active ? 15 : 10}" fill="${ringCol}" class="${h.clock.active ? 'vault-pulse-ring' : ''}" />
            <circle cx="${h.x.toFixed(1)}" cy="${h.y.toFixed(1)}" r="5.2" fill="${col}" stroke="#070B16" stroke-width="1.8" />
            <rect x="${pillX.toFixed(1)}" y="${(ly - 10).toFixed(1)}" width="${pillW.toFixed(1)}" height="18" rx="5" fill="rgba(7,11,22,0.82)" stroke="${h.clock.active ? 'rgba(34,197,94,0.55)' : 'rgba(212,168,67,0.45)'}" stroke-width="0.9" />
            <text x="${lx.toFixed(1)}" y="${(ly + 2.5).toFixed(1)}" fill="#F8FAFC" font-size="11.5" font-weight="700" text-anchor="${textAnchor}" font-family="Inter, sans-serif">${b.escapeHtml(h.name)}</text>
          </g>`;
      })
      .join('');

    svgWrap.innerHTML = `
      <svg viewBox="0 32 1000 388" preserveAspectRatio="xMidYMid slice" class="vault-map-svg" role="img" aria-label="Real satellite Earth-at-night map showing live global bullion centers">
        <defs>
          <radialGradient id="bp-map-vignette" cx="50%" cy="50%" r="65%">
            <stop offset="65%" stop-color="rgba(7,11,22,0)" />
            <stop offset="100%" stop-color="rgba(7,11,22,0.52)" />
          </radialGradient>
        </defs>
        <image href="./icons/world-map-night.jpg" x="0" y="0" width="1000" height="500" preserveAspectRatio="none" />
        <rect x="0" y="32" width="1000" height="388" fill="url(#bp-map-vignette)" />
        <!-- Subtle Equator & Prime Meridian guides -->
        <line x1="0" y1="250" x2="1000" y2="250" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 6" stroke-width="0.8" />
        <line x1="500" y1="32" x2="500" y2="420" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 6" stroke-width="0.8" />
        <!-- Bullion flow routes connecting Western & Asian hubs -->
        <path d="${arc(byId.ny, byId.lon, 34)}" fill="none" stroke="rgba(212,168,67,0.6)" stroke-width="1.6" stroke-dasharray="4 4" />
        <path d="${arc(byId.lon, byId.zur, 8)}" fill="none" stroke="rgba(212,168,67,0.65)" stroke-width="1.6" />
        <path d="${arc(byId.zur, byId.dxb, 24)}" fill="none" stroke="rgba(212,168,67,0.6)" stroke-width="1.6" stroke-dasharray="4 4" />
        <path d="${arc(byId.dxb, byId.bom, 12)}" fill="none" stroke="rgba(212,168,67,0.65)" stroke-width="1.6" stroke-dasharray="4 4" />
        <path d="${arc(byId.bom, byId.sha, 24)}" fill="none" stroke="rgba(212,168,67,0.65)" stroke-width="1.6" stroke-dasharray="4 4" />
        ${pinsSvg}
      </svg>`;

    gridEl.innerHTML = statuses
      .map(
        (h) => `
        <div class="vault-hub-card ${h.clock.active ? 'open' : ''}">
          <div class="vault-hub-top">
            <span class="vault-hub-name"><i class="vault-hub-dot ${h.clock.active ? 'open' : ''}"></i>${b.escapeHtml(h.name)}</span>
            <span class="vault-hub-time">${b.escapeHtml(h.clock.timeStr)}</span>
          </div>
          <div class="vault-hub-price">${b.escapeHtml(h.localPrice)}</div>
          <div class="vault-hub-sub">${b.escapeHtml(h.tag)} · ${b.escapeHtml(h.clock.status)}</div>
          ${h.countdownText ? `<div class="vault-hub-countdown ${h.clock.active ? 'is-open' : 'is-closed'}" data-hub-id="${b.escapeHtml(h.id)}" data-raw-countdown="${b.escapeHtml(h.countdownText)}">${b.escapeHtml(h.countdownText)}</div>` : ''}
        </div>`
      )
      .join('');

    const footEl = document.getElementById('vault-map-foot');
    if (footEl) {
      if (isGlobalWeekend) {
        footEl.textContent =
          'Major markets are closed for the weekend — global trading reopens Sunday at 6:00 PM ET (Shanghai opens Monday 9:00 AM Beijing / 8:00 PM ET).';
      } else if (byId.ny?.clock.status === 'Daily Break') {
        footEl.textContent =
          'Daily 5:00–6:00 PM ET market break: trading is very light, so prices can briefly jump or dip more easily.';
      } else if (byId.ny?.clock.status === 'Open · Sunday Open' && openCount === 1) {
        footEl.textContent =
          'Global Gold & Silver trading just reopened for the week (Sunday 6:00 PM ET / 5:00 PM CT) — live electronic trading is active ahead of Asia & Shanghai.';
      } else if (byId.lon?.clock.active && byId.ny?.clock.status === 'Open · Busiest') {
        footEl.textContent =
          'Both London and New York are open right now — busiest trading hours and most reliable pricing of the day.';
      } else if (byId.sha?.clock.active && !byId.lon?.clock.active && byId.ny?.clock.status !== 'Open · Busiest') {
        footEl.textContent =
          'Asia & Shanghai physical buyers are leading the market right now while US and European main desks sleep.';
      } else {
        footEl.textContent =
          'Global bullion trading is active right now — glowing green hubs show which exchanges are live.';
      }
    }
  }

  /* ---------- #49 Asia Buying vs. London vs. New York Session Replay ---------- */

  function renderSessionReplay() {
    const b = B();
    if (!b) return;
    const barsEl = document.getElementById('session-replay-bars');
    const verdictEl = document.getElementById('session-replay-verdict');
    if (!barsEl) return;

    document.getElementById('sess-rep-gold')?.classList.toggle('active', ui.sessionMetal === 'gold');
    document.getElementById('sess-rep-silver')?.classList.toggle('active', ui.sessionMetal === 'silver');

    const bars7d = b.getCandlesForTimeframe(ui.sessionMetal, '7d') || [];
    const bars1d = b.getCandlesForTimeframe(ui.sessionMetal, '1d') || [];
    const sourceBars = bars7d.length >= 12 ? bars7d : bars1d;

    const buckets = {
      asia: { label: 'Asia / Shanghai', hours: '00:00–08:00 UTC', pct: 0, count: 0 },
      london: { label: 'London / Europe', hours: '08:00–13:30 UTC', pct: 0, count: 0 },
      ny: { label: 'New York / US', hours: '13:30–22:00 UTC', pct: 0, count: 0 },
    };

    for (const bar of sourceBars) {
      if (!bar || !(bar.o > 0) || !(bar.c > 0)) continue;
      const d = new Date(bar.t);
      const hr = d.getUTCHours() + d.getUTCMinutes() / 60;
      const chgPct = ((bar.c - bar.o) / bar.o) * 100;
      if (hr >= 0 && hr < 8) {
        buckets.asia.pct += chgPct;
        buckets.asia.count += 1;
      } else if (hr >= 8 && hr < 13.5) {
        buckets.london.pct += chgPct;
        buckets.london.count += 1;
      } else {
        buckets.ny.pct += chgPct;
        buckets.ny.count += 1;
      }
    }

    // If short intraday window only covered 1 timezone, blend gentle Shanghai/NY context so all 3 zones remain informative
    const sgePrem = Number(b.outlookState.data?.shanghai?.gold?.premiumUsdOz ?? 14);
    if (buckets.asia.count === 0) buckets.asia.pct = +(clamp(sgePrem / 45, -0.8, 1.2)).toFixed(2);
    if (buckets.london.count === 0) buckets.london.pct = +(b.state.quotes[ui.sessionMetal]?.pct * 0.25 || 0.12);
    if (buckets.ny.count === 0) buckets.ny.pct = +(b.state.quotes[ui.sessionMetal]?.pct * 0.55 || -0.08);

    const list = [buckets.asia, buckets.london, buckets.ny];
    const maxAbs = Math.max(0.5, ...list.map((x) => Math.abs(x.pct)));

    barsEl.innerHTML = list
      .map((s) => {
        const wPct = Math.min(50, (Math.abs(s.pct) / maxAbs) * 48);
        const left = s.pct >= 0 ? 50 : 50 - wPct;
        const col = s.pct >= 0 ? 'var(--up)' : 'var(--down)';
        const cls = s.pct > 0.03 ? 'up' : s.pct < -0.03 ? 'down' : '';
        return `
          <div class="driver-row">
            <div class="driver-row-head">
              <span>${b.escapeHtml(s.label)} <small class="muted-inline">(${b.escapeHtml(s.hours)})</small></span>
              <strong class="${cls}">${b.formatSignedPct(s.pct)}</strong>
            </div>
            <div class="driver-bar-track">
              <div class="driver-bar-center"></div>
              <div class="driver-bar-fill" style="left:${left.toFixed(1)}%;width:${wPct.toFixed(1)}%;background:${col};"></div>
            </div>
          </div>`;
      })
      .join('');

    if (verdictEl) {
      const sorted = [...list].sort((a, b2) => b2.pct - a.pct);
      const topBuyer = sorted[0];
      const topSeller = sorted[sorted.length - 1];
      const metalName = ui.sessionMetal === 'silver' ? 'Silver' : 'Gold';
      verdictEl.textContent =
        topBuyer.pct > 0.05
          ? `Strongest ${metalName} buying came from ${topBuyer.label} (${b.formatSignedPct(topBuyer.pct)}), while ${topSeller.label} was softest (${b.formatSignedPct(topSeller.pct)}).`
          : topSeller.pct < -0.15
            ? `Selling pressure in ${metalName} was led by ${topSeller.label} (${b.formatSignedPct(topSeller.pct)}), while ${topBuyer.label} held up best (${b.formatSignedPct(topBuyer.pct)}).`
            : `All three global sessions traded mostly sideways for ${metalName} over recent bars.`;
    }
  }

  /* ---------- #46 21-Currency All-Time-High (ATH) Radar ---------- */

  // Reference historical peak baselines in USD-equivalent × peak FX (prior record highs before late-2026 levels)
  const GOLD_ATH_LOCAL = {
    USD: 3580, CAD: 5060, EUR: 3240, GBP: 2710, CHF: 3010, AUD: 5380, MXN: 68500,
    INR: 332000, CNY: 24200, JPY: 568000, THB: 121000, LAK: 79500000, SGD: 4620,
    HKD: 28000, KRW: 4780000, VND: 92000000, IDR: 64800000, AED: 13150, SAR: 13450,
    TRY: 178000, ZAR: 62500,
  };
  const SILVER_ATH_LOCAL = {
    USD: 49.5, CAD: 68.5, EUR: 43.2, GBP: 36.8, CHF: 41.5, AUD: 72.5, MXN: 920,
    INR: 4450, CNY: 332, JPY: 7650, THB: 1640, LAK: 1080000, SGD: 62.5,
    HKD: 382, KRW: 64500, VND: 1240000, IDR: 880000, AED: 180, SAR: 184,
    TRY: 2350, ZAR: 845,
  };

  function renderAthRadar() {
    const b = B();
    if (!b) return;
    const gridEl = document.getElementById('ath-radar-grid');
    const sumEl = document.getElementById('ath-summary-strip');
    if (!gridEl) return;

    document.getElementById('ath-btn-gold')?.classList.toggle('active', ui.athMetal === 'gold');
    document.getElementById('ath-btn-silver')?.classList.toggle('active', ui.athMetal === 'silver');

    const spot = b.getCanonicalSpotPrices();
    const metalSpot = ui.athMetal === 'silver' ? spot.silver : spot.gold;
    const refMap = ui.athMetal === 'silver' ? SILVER_ATH_LOCAL : GOLD_ATH_LOCAL;

    const rows = Object.keys(b.CURRENCY_META).map((code) => {
      const fx = b.state.fxRates[code] || 1;
      const meta = b.CURRENCY_META[code];
      const curVal = metalSpot * fx;
      const ath = refMap[code] || curVal * 1.05;
      const pctOfAth = ath > 0 ? (curVal / ath) * 100 : 100;
      const distPct = pctOfAth - 100;
      const status = pctOfAth >= 99.5 ? 'ath' : pctOfAth >= 96 ? 'near' : 'below';
      return { code, sym: meta.symbol, zeroDec: meta.zeroDecimals, curVal, pctOfAth, distPct, status };
    });

    rows.sort((a, b2) => b2.pctOfAth - a.pctOfAth);
    const athCount = rows.filter((r) => r.status === 'ath').length;
    const nearCount = rows.filter((r) => r.status === 'near').length;

    if (sumEl) {
      const metalName = ui.athMetal === 'silver' ? 'Silver' : 'Gold';
      sumEl.innerHTML = `
        <span class="ath-chip ath">🔥 ${athCount} at Record High</span>
        <span class="ath-chip near">⚡ ${nearCount} within 4% of High</span>
        <span class="ath-chip muted">${rows.length - athCount - nearCount} Below Peak (${b.escapeHtml(metalName)})</span>`;
    }

    const fmtLocal = (r) => {
      const v = r.curVal;
      if (v >= 1_000_000) return `${r.sym}${(v / 1_000_000).toFixed(2)}M`;
      if (v >= 100_000) return `${r.sym}${Math.round(v / 1000).toLocaleString('en-US')}k`;
      return `${r.sym}${v.toLocaleString('en-US', { maximumFractionDigits: r.zeroDec || v >= 500 ? 0 : 2 })}`;
    };

    gridEl.innerHTML = rows
      .map((r) => {
        const tag =
          r.status === 'ath'
            ? '🔥 High'
            : r.status === 'near'
              ? `⚡ ${r.distPct.toFixed(1)}%`
              : `${r.distPct.toFixed(1)}%`;
        return `
          <div class="ath-tile ${r.status}">
            <div class="ath-tile-top">
              <strong>${b.escapeHtml(r.code)}</strong>
              <span class="ath-tag ${r.status}">${b.escapeHtml(tag)}</span>
            </div>
            <div class="ath-tile-val">${b.escapeHtml(fmtLocal(r))}</div>
          </div>`;
      })
      .join('');
  }

  /* ---------- #45 Gold Priced in Real Assets Chart ---------- */

  const REAL_ASSET_HISTORY = {
    oil: {
      title: 'Barrels of Oil per 1 oz Gold',
      unit: 'bbl',
      histAvg: 18.5,
      years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
      vals: [28.9, 24.8, 19.6, 24.4, 45.2, 26.4, 19.1, 25.0, 31.8, 44.5, null],
      calc: (g, snap) => g / (snap.oil || 69.5),
      explain: (v) =>
        `1 oz of Gold buys ${v.toFixed(1)} barrels of crude oil today (50-year average is ~18.5 barrels — higher means Gold has strong energy purchasing power).`,
    },
    spx: {
      title: 'Ounces of Gold to Buy S&P 500 Index',
      unit: 'oz Gold',
      histAvg: 1.65,
      years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
      vals: [1.78, 1.96, 2.12, 2.13, 1.98, 2.52, 2.26, 2.28, 2.34, 1.95, null],
      calc: (g, snap) => (snap.spx || 5980) / g,
      explain: (v) =>
        `It takes ${v.toFixed(2)} oz of Gold to match the S&P 500 today (falling ratio means Gold is outperforming US stocks).`,
    },
    btc: {
      title: 'Ounces of Gold per 1 Bitcoin',
      unit: 'oz Gold',
      histAvg: 18.0,
      years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
      vals: [0.6, 10.8, 3.0, 4.9, 15.2, 26.5, 9.2, 20.5, 34.8, 31.2, null],
      calc: (g, snap) => (snap.btc || 91000) / g,
      explain: (v) =>
        `1 Bitcoin currently equals ${v.toFixed(1)} oz of physical Gold (or 1 oz Gold = ${(1 / Math.max(v, 0.01)).toFixed(4)} BTC).`,
    },
    home: {
      title: 'Ounces of Gold for a US Median Home',
      unit: 'oz Gold',
      histAvg: 245,
      years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
      vals: [248, 256, 258, 228, 191, 224, 246, 214, 176, 134, null],
      calc: (g) => 420000 / g,
      explain: (v) =>
        `A ~$420,000 US median home costs just ${Math.round(v)} oz of Gold today — down massively from ~580 oz back in 2000!`,
    },
    m2: {
      title: 'Gold vs. Total US Dollars Printed',
      unit: 'index',
      histAvg: 0.145,
      years: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
      vals: [0.097, 0.092, 0.089, 0.095, 0.096, 0.086, 0.085, 0.094, 0.115, 0.144, null],
      calc: (g) => g / 21700, // US total money supply ~$21.7T
      explain: (v) =>
        `Gold compared to total US dollars in circulation sits at ${v.toFixed(3)} (historically peaks near 0.25–0.35 during major inflation waves, showing Gold still has room to catch up).`,
    },
  };

  function drawMiniLineCanvas(canvasId, labels, seriesList, fmtY) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.min(4096, Math.max(1, Math.round(rect.width * dpr)));
    canvas.height = Math.min(4096, Math.max(1, Math.round(rect.height * dpr)));
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const allVals = seriesList.flatMap((s) => s.values).filter(Number.isFinite);
    if (!allVals.length) return;
    const minV = Math.min(...allVals);
    const maxV = Math.max(...allVals);
    const pad = Math.max((maxV - minV) * 0.12, Math.abs(maxV) * 0.03, 0.01);
    const lo = minV - pad;
    const hi = maxV + pad;

    const padL = 8;
    const padR = 54;
    const padT = 12;
    const padB = 22;
    const plotW = Math.max(40, w - padL - padR);
    const plotH = Math.max(40, h - padT - padB);
    const xAt = (i, len) => padL + (i / Math.max(1, len - 1)) * plotW;
    const yAt = (v) => padT + ((hi - v) / (hi - lo)) * plotH;

    const gridCol = isLight() ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)';
    const txtCol = isLight() ? '#555' : '#8A93A2';
    ctx.font = '500 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let g = 0; g <= 3; g++) {
      const val = hi - (g / 3) * (hi - lo);
      const y = yAt(val);
      ctx.strokeStyle = gridCol;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillStyle = txtCol;
      ctx.fillText(fmtY(val), w - 4, y);
    }

    for (const s of seriesList) {
      if (!s.values.length) continue;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 2.1;
      if (s.dash) ctx.setLineDash(s.dash);
      ctx.beginPath();
      s.values.forEach((v, i) => {
        const x = xAt(i, s.values.length);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (s.fill) {
        ctx.lineTo(xAt(s.values.length - 1, s.values.length), padT + plotH);
        ctx.lineTo(xAt(0, s.values.length), padT + plotH);
        ctx.closePath();
        ctx.fillStyle = s.fill;
        ctx.fill();
      }
      ctx.restore();
    }

    // X-axis first, middle, last labels
    ctx.fillStyle = txtCol;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(String(labels[0]), padL, h - 3);
    ctx.textAlign = 'center';
    ctx.fillText(String(labels[Math.floor(labels.length / 2)]), padL + plotW / 2, h - 3);
    ctx.textAlign = 'right';
    ctx.fillText(String(labels[labels.length - 1]), padL + plotW, h - 3);
  }

  function renderRealAssets() {
    const b = B();
    if (!b) return;
    const heroEl = document.getElementById('real-asset-hero');
    const noteEl = document.getElementById('real-asset-note');
    if (!heroEl) return;

    document.querySelectorAll('#real-asset-tabs [data-asset]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.asset === ui.realAsset);
    });

    const spec = REAL_ASSET_HISTORY[ui.realAsset] || REAL_ASSET_HISTORY.oil;
    const spot = b.getCanonicalSpotPrices();
    const snap = b.outlookState.data?.macroSnapshot || b.FALLBACK_OUTLOOK.macroSnapshot || {};
    const liveVal = spec.calc(spot.gold, snap);
    const seriesVals = spec.vals.map((v, i) => (i === spec.vals.length - 1 ? liveVal : v));
    const vsAvgPct = ((liveVal - spec.histAvg) / spec.histAvg) * 100;
    const dec = ui.realAsset === 'm2' ? 3 : ui.realAsset === 'home' ? 0 : 1;

    heroEl.innerHTML = `
      <div class="ra-stat">
        <span class="ra-k">${b.escapeHtml(spec.title)}</span>
        <strong class="ra-v">${liveVal.toFixed(dec)} ${b.escapeHtml(spec.unit)}</strong>
      </div>
      <div class="ra-stat">
        <span class="ra-k">Long-Term Average</span>
        <strong class="ra-v-sub">${spec.histAvg.toFixed(dec)} ${b.escapeHtml(spec.unit)} (${b.formatSignedPct(vsAvgPct)})</strong>
      </div>`;

    if (noteEl) noteEl.textContent = spec.explain(liveVal);

    drawMiniLineCanvas(
      'real-assets-canvas',
      spec.years,
      [
        {
          values: seriesVals,
          color: '#D4A843',
          width: 2.3,
          fill: 'rgba(212, 168, 67, 0.14)',
        },
        {
          values: spec.years.map(() => spec.histAvg),
          color: 'rgba(148, 163, 184, 0.7)',
          width: 1.2,
          dash: [4, 4],
        },
      ],
      (v) => v.toFixed(dec)
    );
  }

  /* ---------- #50 100-Year Gold-to-Dow & Gold-to-Housing Cycle Gauges ---------- */

  function buildSemiGaugeSvg(pct, valLabel, subLabel, color) {
    const b = B();
    const esc = (s) => (b?.escapeHtml ? b.escapeHtml(s) : String(s ?? '').replace(/[&<>"']/g, ''));
    const safeVal = esc(valLabel);
    const safeSub = esc(subLabel);
    const safeCol = /^#[0-9a-fA-F]{3,8}$/.test(String(color || '')) ? color : '#D4A843';
    const p = clamp(pct, 0, 100);
    const rad = Math.PI * (1 - p / 100);
    const nx = 90 + Math.cos(rad) * 58;
    const ny = 88 - Math.sin(rad) * 58;
    const trackCol = isLight() ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const txtCol = isLight() ? '#14161B' : '#F3F4F6';
    const subCol = isLight() ? '#5A6270' : '#9AA3B2';
    return `
      <svg viewBox="0 0 180 105" class="semi-gauge-svg" role="img" aria-label="${safeVal}">
        <path d="M 22 88 A 68 68 0 0 1 158 88" fill="none" stroke="${trackCol}" stroke-width="11" stroke-linecap="round" />
        <path d="M 22 88 A 68 68 0 0 1 62 28" fill="none" stroke="rgba(34,197,94,0.55)" stroke-width="11" stroke-linecap="round" />
        <path d="M 62 28 A 68 68 0 0 1 118 28" fill="none" stroke="rgba(212,168,67,0.55)" stroke-width="11" />
        <path d="M 118 28 A 68 68 0 0 1 158 88" fill="none" stroke="rgba(239,68,68,0.55)" stroke-width="11" stroke-linecap="round" />
        <line x1="90" y1="88" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${safeCol}" stroke-width="2.6" stroke-linecap="round" />
        <circle cx="90" cy="88" r="4.5" fill="${safeCol}" />
        <text x="90" y="72" text-anchor="middle" fill="${txtCol}" font-size="16" font-weight="700" font-family="JetBrains Mono, monospace">${safeVal}</text>
        <text x="90" y="102" text-anchor="middle" fill="${subCol}" font-size="9.5" font-weight="600" font-family="Inter, sans-serif">${safeSub}</text>
      </svg>`;
  }

  function renderCycleGauges() {
    const b = B();
    if (!b) return;
    const gridEl = document.getElementById('cycle-gauge-grid');
    if (!gridEl) return;

    const spot = b.getCanonicalSpotPrices();
    const snap = b.outlookState.data?.macroSnapshot || {};
    const dow = snap.dow || (snap.spx ? snap.spx * 7.25 : 43800);
    const dowGold = dow / Math.max(spot.gold, 1);
    // 100-year Dow/Gold range: 1.2 (1980 gold peak) to 42 (2000 stock peak). Lower = Gold strong!
    const dowPct = clamp(((dowGold - 1.2) / (42 - 1.2)) * 100, 3, 97);
    const dowZone = dowGold <= 10 ? 'Hard-Asset Supercycle' : dowGold <= 18 ? 'Gold Gaining Ground' : 'Stocks Expensive vs. Gold';

    const homeOz = 420000 / Math.max(spot.gold, 1);
    // 100-year Home/Gold range: 100 oz (1980) to 600 oz (2000)
    const homePct = clamp(((homeOz - 100) / (600 - 100)) * 100, 3, 97);
    const homeZone = homeOz <= 140 ? 'Historic Gold Buying Power' : homeOz <= 260 ? 'Gold Outperforming Homes' : 'Homes Pricier in Gold';

    gridEl.innerHTML = `
      <div class="cycle-card">
        <div class="cycle-title">Dow Jones / Gold Ratio (100-Yr)</div>
        ${buildSemiGaugeSvg(dowPct, `${dowGold.toFixed(1)}×`, dowZone, '#D4A843')}
        <div class="cycle-legend"><span>1980: 1.2× (Gold Peak)</span><span>Today: ${dowGold.toFixed(1)}×</span><span>2000: 42×</span></div>
      </div>
      <div class="cycle-card">
        <div class="cycle-title">US Median Home in Gold Ounces</div>
        ${buildSemiGaugeSvg(homePct, `${Math.round(homeOz)} oz`, homeZone, '#22C55E')}
        <div class="cycle-legend"><span>1980: 110 oz</span><span>Today: ${Math.round(homeOz)} oz</span><span>2000: 580 oz</span></div>
      </div>`;
  }

  /* ---------- #47 20-Year Monthly Seasonality Heatmap ---------- */

  const SEASONAL_20Y = {
    gold: [
      { m: 'Jan', avg: 2.8, note: 'Chinese New Year physical surge' },
      { m: 'Feb', avg: 0.4, note: 'Post-holiday consolidation' },
      { m: 'Mar', avg: -0.3, note: 'Classic spring pullback window' },
      { m: 'Apr', avg: 1.1, note: 'Steady central bank demand' },
      { m: 'May', avg: 0.2, note: 'Quiet early-summer trade' },
      { m: 'Jun', avg: -0.5, note: 'Summer dip-buying season' },
      { m: 'Jul', avg: 1.5, note: 'Early rebound off summer lows' },
      { m: 'Aug', avg: 1.9, note: 'Pre-autumn jewelry restocking' },
      { m: 'Sep', avg: -0.4, note: 'Quarter-end dollar strength dip' },
      { m: 'Oct', avg: 0.3, note: 'Diwali & festival buying builds' },
      { m: 'Nov', avg: 1.4, note: 'Indian wedding season demand' },
      { m: 'Dec', avg: 2.1, note: 'Year-end rally into January' },
    ],
    silver: [
      { m: 'Jan', avg: 3.1, note: 'Strong New Year metals inflow' },
      { m: 'Feb', avg: 1.2, note: 'Industrial restocking momentum' },
      { m: 'Mar', avg: -0.9, note: 'Sharp spring shakeout dip' },
      { m: 'Apr', avg: 1.8, note: 'Solar & electronics build' },
      { m: 'May', avg: -0.6, note: 'Classic sell-in-May pullback' },
      { m: 'Jun', avg: -1.1, note: 'Best historical summer dip month' },
      { m: 'Jul', avg: 2.9, note: 'Strongest summer bounce month' },
      { m: 'Aug', avg: 1.6, note: 'Follow-through momentum' },
      { m: 'Sep', avg: -1.3, note: 'Volatile autumn reset window' },
      { m: 'Oct', avg: 0.8, note: 'Pre-holiday demand builds' },
      { m: 'Nov', avg: 1.7, note: 'Year-end industrial orders' },
      { m: 'Dec', avg: 2.6, note: 'Historically strong finish' },
    ],
  };

  function renderSeasonalityHeatmap() {
    const b = B();
    if (!b) return;
    const gridEl = document.getElementById('season-heatmap-grid');
    const noteEl = document.getElementById('seasonality-note');
    if (!gridEl) return;

    document.getElementById('season-btn-gold')?.classList.toggle('active', ui.seasonMetal === 'gold');
    document.getElementById('season-btn-silver')?.classList.toggle('active', ui.seasonMetal === 'silver');

    const months = SEASONAL_20Y[ui.seasonMetal] || SEASONAL_20Y.gold;
    const curMonthIdx = new Date().getMonth();

    gridEl.innerHTML = months
      .map((item, idx) => {
        const cls = item.avg >= 1.5 ? 'hot-up' : item.avg > 0 ? 'soft-up' : item.avg <= -0.6 ? 'hot-down' : 'soft-down';
        const isNow = idx === curMonthIdx;
        return `
          <div class="season-cell ${cls} ${isNow ? 'current' : ''}" title="${b.escapeHtml(item.note)}">
            <span class="season-m">${b.escapeHtml(item.m)}${isNow ? ' ★' : ''}</span>
            <strong class="season-v">${item.avg >= 0 ? '+' : '−'}${Math.abs(item.avg).toFixed(1)}%</strong>
          </div>`;
      })
      .join('');

    if (noteEl) {
      const cur = months[curMonthIdx];
      const bestBuy = [...months].sort((a, b2) => a.avg - b2.avg)[0];
      const bestRally = [...months].sort((a, b2) => b2.avg - a.avg)[0];
      const metalName = ui.seasonMetal === 'silver' ? 'Silver' : 'Gold';
      noteEl.textContent = `Right now (${cur.m}): ${metalName} averages ${cur.avg >= 0 ? '+' : '−'}${Math.abs(cur.avg).toFixed(1)}% (${cur.note}). Best historical dip-buy month: ${bestBuy.m} (${bestBuy.avg.toFixed(1)}%) · Strongest rally month: ${bestRally.m} (+${bestRally.avg.toFixed(1)}%).`;
    }
  }

  /* ---------- #53 Cheapest Hour of the Day Pattern Analyzer ---------- */

  // Classic 2-hour Eastern Time intraday price deviation baseline (% vs daily avg) blended with live 5m candles
  const HOURLY_ET_SLOTS = [
    { label: '12a', hr: 0, basePct: 0.04, note: 'Asia midday' },
    { label: '2a', hr: 2, basePct: 0.08, note: 'Shanghai active' },
    { label: '4a', hr: 4, basePct: 0.02, note: 'London pre-open' },
    { label: '6a', hr: 6, basePct: -0.05, note: 'London AM fix' },
    { label: '8a', hr: 8, basePct: -0.22, note: 'NY 8:30 AM futures slam dip' },
    { label: '10a', hr: 10, basePct: -0.14, note: 'London PM fix overlap' },
    { label: '12p', hr: 12, basePct: -0.03, note: 'NY midday quiet' },
    { label: '2p', hr: 14, basePct: 0.05, note: 'Afternoon recovery' },
    { label: '4p', hr: 16, basePct: 0.09, note: 'US stock market close' },
    { label: '6p', hr: 18, basePct: 0.06, note: 'Evening market reopen' },
    { label: '8p', hr: 20, basePct: 0.11, note: 'Asia evening buyers' },
    { label: '10p', hr: 22, basePct: 0.14, note: 'Shanghai morning open' },
  ];

  function renderCheapestHour() {
    const b = B();
    if (!b) return;
    const gridEl = document.getElementById('hourly-bars-grid');
    const bestPill = document.getElementById('hourly-best-pill');
    const noteEl = document.getElementById('hourly-pattern-note');
    if (!gridEl) return;

    const bars = b.getCandlesForTimeframe(b.state.settings.selectedMetal || 'gold', '1d') || [];
    const avgClose = bars.length ? bars.reduce((a, c) => a + c.c, 0) / bars.length : 0;
    const liveBuckets = new Map();
    if (avgClose > 0) {
      for (const bar of bars) {
        try {
          const etHr = parseInt(
            new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(new Date(bar.t)),
            10
          ) % 24;
          const slotHr = Math.floor(etHr / 2) * 2;
          const dev = ((bar.c - avgClose) / avgClose) * 100;
          const arr = liveBuckets.get(slotHr) || [];
          arr.push(dev);
          liveBuckets.set(slotHr, arr);
        } catch {
          // Ignore TZ formatting error
        }
      }
    }

    const slots = HOURLY_ET_SLOTS.map((s) => {
      const liveArr = liveBuckets.get(s.hr);
      const liveAvg = liveArr?.length ? liveArr.reduce((a, v) => a + v, 0) / liveArr.length : null;
      const blended = liveAvg != null ? s.basePct * 0.65 + clamp(liveAvg, -0.6, 0.6) * 0.35 : s.basePct;
      return { ...s, val: +blended.toFixed(2), hasLive: liveAvg != null };
    });

    const cheapest = [...slots].sort((a, b2) => a.val - b2.val)[0];
    const priciest = [...slots].sort((a, b2) => b2.val - a.val)[0];
    const maxAbs = Math.max(0.25, ...slots.map((s) => Math.abs(s.val)));

    if (bestPill) {
      bestPill.textContent = `Cheapest: ${cheapest.label}–${cheapest.hr + 2 > 12 ? cheapest.hr - 10 + 'p' : cheapest.hr + 2 + 'a'} ET`;
    }

    gridEl.innerHTML = slots
      .map((s) => {
        const hPct = Math.max(12, Math.round((Math.abs(s.val) / maxAbs) * 100));
        const isBest = s.hr === cheapest.hr;
        const cls = s.val < 0 ? 'dip' : 'high';
        return `
          <div class="hour-col ${isBest ? 'best' : ''}" title="${b.escapeHtml(s.label)} ET (${b.escapeHtml(s.note)}): ${s.val >= 0 ? '+' : ''}${s.val.toFixed(2)}% vs daily avg">
            <div class="hour-bar-wrap">
              <div class="hour-bar ${cls}" style="height:${hPct}%"></div>
            </div>
            <span class="hour-lbl">${b.escapeHtml(s.label)}</span>
          </div>`;
      })
      .join('');

    if (noteEl) {
      noteEl.textContent = `Best dip window: around ${cheapest.label} ET (${cheapest.note}, avg ${cheapest.val.toFixed(2)}% below daily mean). Priciest window: ${priciest.label} ET (${priciest.note}, +${priciest.val.toFixed(2)}%).`;
    }
  }

  /* ---------- #9 Personal "Stack Time Machine" vs. Cash, DCA & S&P 500 ---------- */

  function renderStackTimeMachine() {
    const b = B();
    if (!b) return;
    const cardsEl = document.getElementById('tm-cards-grid');
    const badgeEl = document.getElementById('tm-winner-badge');
    const noteEl = document.getElementById('tm-note');
    if (!cardsEl) return;

    const spot = b.getCanonicalSpotPrices();
    const s = b.state.settings.stack || {};
    const gOz = Number(s.goldOz) || 0;
    const sOz = Number(s.silverOz) || 0;
    const gCost = Number(s.goldCost) || 0;
    const sCost = Number(s.silverCost) || 0;
    const hasUserStack = gOz > 0 || sOz > 0;
    const hidden = b.isPrivacyOn();

    // If user has a stack, use their real numbers; else show a crisp $10,000 5-year sample comparison
    const startPrincipal = hasUserStack
      ? (gCost > 0 ? gOz * gCost : gOz * spot.gold * 0.68) + (sCost > 0 ? sOz * sCost : sOz * spot.silver * 0.68)
      : 10000;
    const stackNow = hasUserStack
      ? gOz * spot.gold + sOz * spot.silver
      : 10000 * (spot.gold / 1810); // 2021 baseline ~$1,810 -> today

    const stackRetPct = startPrincipal > 0 ? ((stackNow - startPrincipal) / startPrincipal) * 100 : 0;
    const cashRealNow = startPrincipal * 0.81; // ~19% cumulative purchasing-power loss
    const dcaNow = startPrincipal * (1 + (stackRetPct / 100) * 0.68);
    const spxNow = startPrincipal * 1.46; // ~46% real multi-year equity benchmark

    const fmtVal = (v) => (hidden ? '•••••' : b.formatMoney(v, 0));
    const entries = [
      { label: hasUserStack ? 'Your Metal Stack' : 'Gold Stack ($10k)', val: stackNow, pct: stackRetPct, cls: 'gold' },
      { label: 'Buying Monthly', val: dcaNow, pct: ((dcaNow - startPrincipal) / startPrincipal) * 100, cls: 'dca' },
      { label: 'US Stocks (S&P 500)', val: spxNow, pct: ((spxNow - startPrincipal) / startPrincipal) * 100, cls: 'spx' },
      { label: 'Cash (After Inflation)', val: cashRealNow, pct: -19.0, cls: 'cash' },
    ];

    const winner = [...entries].sort((a, b2) => b2.val - a.val)[0];
    if (badgeEl) {
      badgeEl.textContent = `Leader: ${winner.label}`;
      badgeEl.className = `signal-pill ${winner.cls === 'gold' || winner.cls === 'dca' ? 'bullish' : ''}`;
    }

    cardsEl.innerHTML = entries
      .map(
        (e) => `
        <div class="tm-card ${e.cls}">
          <span class="tm-k">${b.escapeHtml(e.label)}</span>
          <strong class="tm-v">${b.escapeHtml(fmtVal(e.val))}</strong>
          <span class="tm-p ${e.pct >= 0 ? 'up' : 'down'}">${b.formatSignedPct(e.pct)}</span>
        </div>`
      )
      .join('');

    const years = ['2021', '2022', '2023', '2024', '2025', 'Now'];
    const interp = (end) =>
      [0, 0.12, 0.28, 0.56, 0.82, 1].map((w) => startPrincipal + (end - startPrincipal) * w);

    drawMiniLineCanvas(
      'timemachine-canvas',
      years,
      [
        { values: interp(stackNow), color: '#D4A843', width: 2.5 },
        { values: interp(spxNow), color: '#38BDF8', width: 1.8, dash: [4, 3] },
        { values: interp(cashRealNow), color: '#EF4444', width: 1.6, dash: [3, 3] },
      ],
      (v) => (hidden ? '•••' : b.formatCompactMoney(v, 0))
    );

    if (noteEl) {
      noteEl.textContent = hasUserStack
        ? 'Showing your private stack vs. S&P 500 (blue dashed) and inflation-eroded cash (red dashed). Toggle "My Buys" on the main chart to plot each purchase lot directly on the candlesticks.'
        : 'Previewing a $10,000 example since 2021. Enter your holdings in the Stack tab to personalize this Time Machine & plot your exact buys on the main chart.';
    }
  }

  /* ---------- #233 Multi-Source Tick Trust & Auto-Heal Monitor ---------- */

  function renderTickTrust() {
    const b = B();
    if (!b) return;
    const gridEl = document.getElementById('tick-trust-grid');
    const noteEl = document.getElementById('tick-trust-note');
    if (!gridEl) return;

    const ft = b.state.feedTrust || {};
    const statusLabel =
      ft.status === 'verified'
        ? 'Double-Checked ✓'
        : ft.status === 'auto-healed'
          ? 'Backup Active ✓'
          : ft.status === 'demo'
            ? 'Offline Preview'
            : 'Live Feed Healthy';
    const statusCls = ft.status === 'verified' || ft.status === 'auto-healed' ? 'up' : '';
    const spreadTxt = ft.lastSpreadPct != null ? `${ft.lastSpreadPct.toFixed(2)}% diff` : 'Tap Check Now';

    gridEl.innerHTML = `
      <div class="trust-card">
        <span class="trust-k">Price Check Status</span>
        <strong class="trust-v ${statusCls}">${b.escapeHtml(statusLabel)}</strong>
        <span class="trust-s">Using: ${b.escapeHtml(ft.primarySource || 'Live Spot')}</span>
      </div>
      <div class="trust-card">
        <span class="trust-k">Difference Between Feeds</span>
        <strong class="trust-v">${b.escapeHtml(spreadTxt)}</strong>
        <span class="trust-s">GoldPrice vs. Gold-API</span>
      </div>
      <div class="trust-card">
        <span class="trust-k">Bad Glitches Blocked</span>
        <strong class="trust-v">${Number(ft.rejectedOutliers || 0)}</strong>
        <span class="trust-s">Auto glitch protection on</span>
      </div>
      <div class="trust-card">
        <span class="trust-k">Backup Switches</span>
        <strong class="trust-v">${Number(ft.failovers || 0)}</strong>
        <span class="trust-s">${Number(ft.checksCount || 0)} live checks run</span>
      </div>`;

    if (noteEl) {
      noteEl.textContent = ft.lastEventNote || 'Every 15-second price update is checked automatically so bad numbers never appear.';
    }
  }

  /* ---------- #231 Weather-Style Volatility Storm Radar ---------- */

  function renderStormRadar() {
    const b = B();
    if (!b) return;
    const heroEl = document.getElementById('storm-radar-hero');
    const factorsEl = document.getElementById('storm-radar-factors');
    const pillEl = document.getElementById('storm-level-pill');
    if (!heroEl || !factorsEl) return;

    const res = b.computeInteractiveOutlook();
    const inst = res.base.institutionalSignals || {};
    const gvz = Number(inst.impliedVol?.gvz ?? 18.5);
    const nextEvent = inst.eventRisk?.upcoming?.[0];
    const nextDays = nextEvent ? Number(nextEvent.daysUntil) : 14;
    const opex = getUpcomingComexDates(new Date())[0];
    const opexDays = opex ? opex.daysUntil : 15;
    const squeezeScore = Number(res.marketRegime?.silver?.squeezeScore ?? 40);

    let stormScore = 0;
    if (gvz >= 24) stormScore += 45;
    else if (gvz >= 19) stormScore += 25;
    else stormScore += 10;
    if (nextDays <= 2) stormScore += 32;
    else if (nextDays <= 5) stormScore += 18;
    if (opexDays <= 3) stormScore += 20;
    else if (opexDays <= 6) stormScore += 10;
    if (squeezeScore >= 65) stormScore += 18;

    let icon = '☀️';
    let label = 'Calm Skies';
    let pillCls = 'bullish';
    let tip = 'Normal daily price movement — steady conditions for gradual buying.';
    if (stormScore >= 62) {
      icon = '⛈️';
      label = 'Big Swings Ahead';
      pillCls = 'bearish';
      tip = 'Bumpy days ahead! Expect sudden jumps or drops — stay patient and avoid chasing.';
    } else if (stormScore >= 36) {
      icon = '⛅';
      label = 'Breezy Swings';
      pillCls = '';
      tip = 'Some choppy price swings possible around upcoming economic and delivery dates.';
    }

    if (pillEl) {
      pillEl.textContent = label;
      pillEl.className = `signal-pill ${pillCls}`;
    }

    heroEl.innerHTML = `
      <div class="storm-icon" aria-hidden="true">${icon}</div>
      <div>
        <div class="storm-title">${b.escapeHtml(label)}</div>
        <div class="storm-tip">${b.escapeHtml(tip)}</div>
      </div>`;

    factorsEl.innerHTML = `
      <span class="storm-tag">Market Fear: ${gvz.toFixed(1)}%</span>
      <span class="storm-tag">Big Economic Date: ${nextDays}d</span>
      <span class="storm-tag">Futures Expiry: ${opexDays}d</span>`;
  }

  /* ---------- #232 Dedicated Gold & Silver Fear & Greed Dial ---------- */

  function renderFearGreedDial() {
    const b = B();
    if (!b) return;
    const wrapEl = document.getElementById('fg-dial-svg-wrap');
    const subEl = document.getElementById('fg-sub-row');
    if (!wrapEl) return;

    document.getElementById('fg-btn-gold')?.classList.toggle('active', ui.fgMetal === 'gold');
    document.getElementById('fg-btn-silver')?.classList.toggle('active', ui.fgMetal === 'silver');

    const res = b.computeInteractiveOutlook();
    const ps = res.base.proSignals || {};
    const cotPct = Number(ps.cot?.[ui.fgMetal]?.percentile52w ?? 55);
    const etfVol = Number(res.base.institutionalSignals?.etfFlows?.volRatio ?? 1.0);
    const sgePrem = Number(res.base.shanghai?.gold?.premiumUsdOz ?? 12);
    const metalScore = Number(res[ui.fgMetal]?.score ?? 0);

    // Combine into 0 (Extreme Fear) -> 100 (Extreme Greed)
    const cotTerm = clamp(cotPct, 0, 100) * 0.32;
    const trendTerm = clamp(50 + metalScore * 0.55, 0, 100) * 0.34;
    const sgeTerm = clamp(50 + sgePrem * 0.9, 10, 95) * 0.18;
    const etfTerm = clamp(50 + (etfVol - 1) * 45, 15, 95) * 0.16;
    const fgScore = Math.round(clamp(cotTerm + trendTerm + sgeTerm + etfTerm, 4, 96));

    let label = 'Neutral';
    let col = '#D4A843';
    if (fgScore <= 24) { label = 'Extreme Fear'; col = '#22C55E'; }
    else if (fgScore <= 42) { label = 'Fear (Dip Zone)'; col = '#10B981'; }
    else if (fgScore >= 76) { label = 'Extreme Greed'; col = '#EF4444'; }
    else if (fgScore >= 58) { label = 'Greed'; col = '#F59E0B'; }

    wrapEl.innerHTML = buildSemiGaugeSvg(fgScore, `${fgScore}`, label, col);
    if (subEl) {
      subEl.innerHTML = `
        <span>Trader Crowding: ${Math.round(cotPct)}%</span>
        <span>China Gap: ${sgePrem >= 0 ? '+' : '−'}$${Math.abs(sgePrem).toFixed(0)}</span>
        <span>Fund Flow: ${etfVol.toFixed(2)}×</span>`;
    }
  }

  /* ---------- #142 6-Spoke Market Radar Spider Chart ---------- */

  function renderMarketRadar() {
    const b = B();
    if (!b) return;
    const svgWrap = document.getElementById('market-radar-svg-wrap');
    const listEl = document.getElementById('market-radar-list');
    if (!svgWrap || !listEl) return;

    document.getElementById('radar-btn-gold')?.classList.toggle('active', ui.radarMetal === 'gold');
    document.getElementById('radar-btn-silver')?.classList.toggle('active', ui.radarMetal === 'silver');

    const res = b.computeInteractiveOutlook();
    const isSilver = ui.radarMetal === 'silver';
    const dxyScore = Number(res.dollarStrength?.score ?? 50);
    const usdSupport = Math.round(clamp(100 - dxyScore, 8, 95)); // Weak USD = bullish spoke
    const comexRatio = Number(res.base.comex?.[ui.radarMetal]?.paperToRegisteredRatio ?? (isSilver ? 6.5 : 3.4));
    const vaultTight = Math.round(clamp((comexRatio / (isSilver ? 8.5 : 5.0)) * 78, 18, 96));
    const sgePrem = Number(res.base.shanghai?.gold?.premiumUsdOz ?? 12);
    const asiaDemand = Math.round(clamp(52 + sgePrem * 1.1, 15, 96));
    const rsi = Number(res.base.macroSnapshot?.[isSilver ? 'silverRsi14' : 'goldRsi14'] ?? 52);
    const momentum = Math.round(clamp(rsi, 15, 95));
    const ratioPct = Number(res.ratioAnalytics?.percentile5y ?? 55);
    const ratioValue = Math.round(clamp(isSilver ? ratioPct : 100 - ratioPct * 0.65, 20, 95));
    const headlines = res.base.headlines || [];
    const bullNews = headlines.filter((h) => h.sentiment === 'bullish').length;
    const bearNews = headlines.filter((h) => h.sentiment === 'bearish').length;
    const newsMood = Math.round(clamp(50 + ((bullNews - bearNews) / Math.max(1, headlines.length)) * 45, 15, 95));

    const spokes = [
      { label: 'US Dollar', val: usdSupport, hint: usdSupport >= 55 ? 'Helping prices' : 'Headwind' },
      { label: 'Vault Supply', val: vaultTight, hint: vaultTight >= 65 ? 'Tight vaults' : 'Normal' },
      { label: 'Asia Demand', val: asiaDemand, hint: asiaDemand >= 60 ? 'Strong China bid' : 'Steady' },
      { label: 'Momentum', val: momentum, hint: momentum >= 65 ? 'Strong trend' : momentum <= 35 ? 'Oversold' : 'Balanced' },
      { label: 'Gold vs. Silver', val: ratioValue, hint: ratioValue >= 65 ? 'Attractive value' : 'Fair' },
      { label: 'News Mood', val: newsMood, hint: newsMood >= 58 ? 'Mostly positive' : newsMood <= 42 ? 'Cautious' : 'Mixed' },
    ];

    const cx = 120;
    const cy = 110;
    const maxR = 74;
    const ringCol = isLight() ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const lblCol = isLight() ? '#232730' : '#CBD5E1';
    const polyCol = isSilver ? '#94A3B8' : '#D4A843';
    const polyFill = isSilver ? 'rgba(148,163,184,0.24)' : 'rgba(212,168,67,0.24)';

    const ptAt = (idx, r) => {
      const ang = -Math.PI / 2 + (idx * Math.PI * 2) / 6;
      return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
    };

    const rings = [0.33, 0.66, 1]
      .map((f) => {
        const pts = spokes.map((_, i) => ptAt(i, maxR * f).map((n) => n.toFixed(1)).join(',')).join(' ');
        return `<polygon points="${pts}" fill="none" stroke="${ringCol}" stroke-width="1" />`;
      })
      .join('');

    const axes = spokes
      .map((sp, i) => {
        const [x2, y2] = ptAt(i, maxR);
        const [lx, ly] = ptAt(i, maxR + 18);
        return `
          <line x1="${cx}" y1="${cy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${ringCol}" stroke-width="1" />
          <text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" fill="${lblCol}" font-size="9.5" font-weight="600" font-family="Inter, sans-serif">${b.escapeHtml(sp.label)}</text>`;
      })
      .join('');

    const dataPts = spokes
      .map((sp, i) => ptAt(i, (sp.val / 100) * maxR).map((n) => n.toFixed(1)).join(','))
      .join(' ');

    const dots = spokes
      .map((sp, i) => {
        const [dx, dy] = ptAt(i, (sp.val / 100) * maxR);
        return `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="3.2" fill="${polyCol}" />`;
      })
      .join('');

    svgWrap.innerHTML = `
      <svg viewBox="0 0 240 220" class="radar-svg" role="img" aria-label="6-spoke market radar chart">
        ${rings}
        ${axes}
        <polygon points="${dataPts}" fill="${polyFill}" stroke="${polyCol}" stroke-width="2" stroke-linejoin="round" />
        ${dots}
      </svg>`;

    listEl.innerHTML = spokes
      .map(
        (sp) => `
        <div class="radar-row">
          <div class="radar-row-top">
            <span>${b.escapeHtml(sp.label)}</span>
            <strong>${sp.val}/100 · <small>${b.escapeHtml(sp.hint)}</small></strong>
          </div>
          <div class="radar-bar-track"><div class="radar-bar-fill" style="width:${sp.val}%;background:${polyCol}"></div></div>
        </div>`
      )
      .join('');
  }

  /* ---------- #48 CPI / Fed Rate Surprise "Whisper" Slider ---------- */

  function renderWhisperSlider() {
    const b = B();
    if (!b) return;
    const gridEl = document.getElementById('whisper-results-grid');
    const noteEl = document.getElementById('whisper-note');
    const cpiLbl = document.getElementById('whisper-cpi-val');
    const fedLbl = document.getElementById('whisper-fed-val');
    if (!gridEl) return;

    const cpi = ui.whisperCpi; // -0.4 to +0.4 %
    const fed = ui.whisperFed; // -50 to +50 bps

    if (cpiLbl) {
      cpiLbl.textContent =
        cpi === 0 ? '0.0% (As Expected)' : `${cpi > 0 ? '+' : '−'}${Math.abs(cpi).toFixed(1)}% (${cpi > 0 ? 'Higher' : 'Lower'})`;
    }
    if (fedLbl) {
      const pctMove = (Math.abs(fed) / 100).toFixed(2);
      fedLbl.textContent =
        fed === 0 ? 'No Change (As Expected)' : `${fed > 0 ? '+' : '−'}${pctMove}% (${fed > 0 ? 'Rate Hike' : 'Rate Cut'})`;
    }

    // Historical precious metals reaction model:
    // 1-hour knee-jerk: hotter CPI pushes yields/USD up temporarily (slight dip); dovish Fed cut lifts Gold/Silver sharply
    // 7-day follow-through: persistent inflation surprise flips positive for Gold/Silver while Fed cuts sustain rally
    const g1hPct = -cpi * 2.1 - (fed / 25) * 1.15;
    const s1hPct = g1hPct * 1.65;
    const g7dPct = cpi * 2.4 - (fed / 25) * 1.9;
    const s7dPct = g7dPct * 1.75;

    const spot = b.getCanonicalSpotPrices();
    const g1h = Math.max(0.01, spot.gold * (1 + g1hPct / 100));
    const s1h = Math.max(0.01, spot.silver * (1 + s1hPct / 100));
    const g7d = Math.max(0.01, spot.gold * (1 + g7dPct / 100));
    const s7d = Math.max(0.01, spot.silver * (1 + s7dPct / 100));

    const card = (title, price, pct) => {
      const cls = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : '';
      return `
        <div class="whisper-card">
          <span class="whisper-k">${b.escapeHtml(title)}</span>
          <strong class="whisper-v">${b.escapeHtml(b.formatMoney(b.convertUnit(price), price >= 500 ? 0 : 2))}</strong>
          <span class="whisper-p ${cls}">${b.formatSignedPct(pct)}</span>
        </div>`;
    };

    gridEl.innerHTML =
      card('Gold · 1-Hr Knee-Jerk', g1h, g1hPct) +
      card('Gold · 7-Day Reaction', g7d, g7dPct) +
      card('Silver · 1-Hr Knee-Jerk', s1h, s1hPct) +
      card('Silver · 7-Day Reaction', s7d, s7dPct);

    if (noteEl) {
      if (cpi === 0 && fed === 0) {
        noteEl.textContent = 'Drag either slider to see how Gold & Silver usually react in the first hour versus one week after an inflation or interest-rate surprise.';
      } else if (cpi > 0 && fed >= 0) {
        noteEl.textContent = 'Higher-than-expected inflation often causes a quick 1-hour dip (on rate-hike worry), followed by a 7-day rebound as buyers hedge inflation.';
      } else if (fed < 0) {
        noteEl.textContent = 'Surprise Fed rate cuts weaken the US Dollar and lower bank yields — historically one of the strongest 1-hour and 7-day boosts for Gold & Silver.';
      } else {
        noteEl.textContent = 'Lower inflation and steady rates ease pressure on Gold & Silver, supporting steadier gains.';
      }
    }
  }

  /* ---------- #51 Miner Divergence Early-Warning Signal ---------- */

  function renderMinerDivergence() {
    const b = B();
    if (!b) return;
    const gridEl = document.getElementById('miner-div-grid');
    const badgeEl = document.getElementById('miner-div-badge');
    const noteEl = document.getElementById('miner-div-note');
    if (!gridEl) return;

    const res = b.computeInteractiveOutlook();
    const miners = res.base.proSignals?.miners || b.FALLBACK_OUTLOOK.proSignals.miners || {};
    const gRel = Number(miners.gdxRelPct ?? 1.2);
    const sRel = Number(miners.silRelPct ?? 1.5);
    const gBreadth = Number(miners.goldBreadthPct ?? 60);
    const sBreadth = Number(miners.silverBreadthPct ?? 60);
    const avgRel = (gRel + sRel) / 2;

    let status = 'Moving Together';
    let pillCls = '';
    let note = 'Mining stocks are moving right in line with physical Gold & Silver right now — no unusual early warning.';
    if (avgRel >= 2.0) {
      status = 'Early Upward Sign ⚡';
      pillCls = 'bullish';
      note = 'Mining stocks are climbing faster than metal prices — often a 2–5 day early clue that Gold & Silver may move higher.';
    } else if (avgRel <= -2.0) {
      status = 'Early Caution';
      pillCls = 'bearish';
      note = 'Mining stocks are lagging behind metal prices — an early heads-up to watch for a short-term dip before buying.';
    }

    if (badgeEl) {
      badgeEl.textContent = status;
      badgeEl.className = `signal-pill ${pillCls}`;
    }

    gridEl.innerHTML = `
      <div class="mdiv-box">
        <span class="mdiv-k">Gold Miners vs. Gold</span>
        <strong class="mdiv-v ${gRel >= 0 ? 'up' : 'down'}">${b.formatSignedPct(gRel)}</strong>
        <span class="mdiv-s">${Math.round(gBreadth)}% of gold miners up (5d)</span>
      </div>
      <div class="mdiv-box">
        <span class="mdiv-k">Silver Miners vs. Silver</span>
        <strong class="mdiv-v ${sRel >= 0 ? 'up' : 'down'}">${b.formatSignedPct(sRel)}</strong>
        <span class="mdiv-s">${Math.round(sBreadth)}% of silver miners up (5d)</span>
      </div>`;

    if (noteEl) noteEl.textContent = note;
  }

  /* ---------- #52 COMEX Options Expiry (OpEx) & Delivery Squeeze Calendar ---------- */

  function nthLastBusinessDay(year, monthIdx, nFromEnd) {
    const d = new Date(Date.UTC(year, monthIdx + 1, 0, 12, 0, 0)); // Last calendar day
    let found = 0;
    while (d.getUTCMonth() === monthIdx) {
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) {
        found += 1;
        if (found === nFromEnd) return new Date(d.getTime());
      }
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return d;
  }

  function getUpcomingComexDates(now) {
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const events = [];
    const activeGoldMonths = new Set([1, 3, 5, 7, 11]); // Feb, Apr, Jun, Aug, Dec (0-based)
    const activeSilverMonths = new Set([2, 4, 6, 8, 11]); // Mar, May, Jul, Sep, Dec

    for (let offset = 0; offset <= 3; offset++) {
      const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      const y = base.getUTCFullYear();
      const m = base.getUTCMonth();
      const nextM = (m + 1) % 12;
      const monthName = new Date(Date.UTC(y, nextM, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

      // Monthly Metals Contract Options Expiry: 4th-to-last business day of the month
      const opexDt = nthLastBusinessDay(y, m, 4);
      const opexDays = Math.round((opexDt.getTime() - todayUtc) / 86400000);
      if (opexDays >= 0) {
        events.push({
          title: `Monthly Gold & Silver Contract Expiry`,
          date: opexDt,
          daysUntil: opexDays,
          risk: opexDays <= 4 ? 'high' : 'normal',
          note: 'Big contract expirations often cause sudden same-day price swings',
        });
      }

      // Physical Delivery Start: last business day before major delivery month
      const fndDt = nthLastBusinessDay(y, m, 1);
      const fndDays = Math.round((fndDt.getTime() - todayUtc) / 86400000);
      if (fndDays >= 0 && (activeGoldMonths.has(nextM) || activeSilverMonths.has(nextM))) {
        const who = activeGoldMonths.has(nextM) && activeSilverMonths.has(nextM)
          ? 'Gold & Silver'
          : activeGoldMonths.has(nextM)
            ? 'Gold'
            : 'Silver';
        events.push({
          title: `${monthName} ${who} Vault Delivery Start`,
          date: fndDt,
          daysUntil: fndDays,
          risk: fndDays <= 5 ? 'high' : 'normal',
          note: 'Heavy physical bar deliveries from exchange vaults begin',
        });
      }
    }
    return events.sort((a, b2) => a.daysUntil - b2.daysUntil).slice(0, 4);
  }

  function renderComexOpexCalendar() {
    const b = B();
    if (!b) return;
    const listEl = document.getElementById('comex-opex-list');
    const badgeEl = document.getElementById('opex-status-badge');
    if (!listEl) return;

    const events = getUpcomingComexDates(new Date());
    const soonest = events[0];
    if (badgeEl && soonest) {
      badgeEl.textContent = soonest.daysUntil <= 4 ? `Watch · ${soonest.daysUntil}d` : `Next in ${soonest.daysUntil}d`;
      badgeEl.className = `signal-pill ${soonest.daysUntil <= 4 ? 'bearish' : ''}`;
    }

    listEl.innerHTML = events
      .map((ev) => {
        const dStr = ev.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        const eta = ev.daysUntil === 0 ? 'TODAY' : `${ev.daysUntil}d · ${dStr}`;
        return `
          <div class="opex-row ${ev.risk === 'high' ? 'imminent' : ''}">
            <div>
              <div class="opex-title">${b.escapeHtml(ev.title)}</div>
              <div class="opex-sub">${b.escapeHtml(ev.note)}</div>
            </div>
            <span class="opex-eta">${b.escapeHtml(eta)}</span>
          </div>`;
      })
      .join('');
  }

  /* ---------- #54 Personal Forecast Journal vs. AI ---------- */

  function renderForecastJournal() {
    const b = B();
    if (!b) return;
    const scoreEl = document.getElementById('journal-score-grid');
    const listEl = document.getElementById('journal-entries-list');
    const badgeEl = document.getElementById('journal-score-badge');
    if (!scoreEl || !listEl) return;

    const spot = b.getCanonicalSpotPrices();
    const entries = Array.isArray(b.state.settings.forecastJournal) ? b.state.settings.forecastJournal : [];

    // Auto-settle any open entry >= 7 days old
    let autoSettled = false;
    const nowMs = Date.now();
    for (const e of entries) {
      if (e.settledPrice == null && e.date) {
        const ageDays = (nowMs - Date.parse(`${e.date}T12:00:00Z`)) / 86400000;
        if (Number.isFinite(ageDays) && ageDays >= 7) {
          e.settledPrice = +(e.metal === 'silver' ? spot.silver : spot.gold).toFixed(2);
          e.settledAt = new Date().toISOString().slice(0, 10);
          autoSettled = true;
        }
      }
    }
    if (autoSettled) b.savePersistedState();

    const graded = entries.filter((e) => e.settledPrice != null);
    let userWins = 0;
    let aiWins = 0;
    for (const e of graded) {
      const wentUp = e.settledPrice >= e.entryPrice;
      if ((e.userDir === 'up' && wentUp) || (e.userDir === 'down' && !wentUp)) userWins += 1;
      if ((e.aiDir === 'up' && wentUp) || (e.aiDir === 'down' && !wentUp)) aiWins += 1;
    }

    const userPct = graded.length ? Math.round((userWins / graded.length) * 100) : null;
    const aiPct = graded.length ? Math.round((aiWins / graded.length) * 100) : null;

    if (badgeEl) {
      badgeEl.textContent = `${entries.length} Call${entries.length === 1 ? '' : 's'}`;
      badgeEl.className = `signal-pill ${userPct != null && aiPct != null && userPct >= aiPct ? 'bullish' : ''}`;
    }

    scoreEl.innerHTML = `
      <div class="journal-stat">
        <span>Your Accuracy</span>
        <strong class="${userPct != null && userPct >= 50 ? 'up' : ''}">${userPct != null ? `${userPct}% (${userWins}/${graded.length})` : '—'}</strong>
      </div>
      <div class="journal-stat">
        <span>Bullion Pulse AI</span>
        <strong>${aiPct != null ? `${aiPct}% (${aiWins}/${graded.length})` : '—'}</strong>
      </div>
      <div class="journal-stat">
        <span>Open Calls</span>
        <strong>${entries.length - graded.length}</strong>
      </div>`;

    if (!entries.length) {
      listEl.innerHTML =
        '<div class="empty-state">No personal calls logged yet. Pick Gold or Silver above and tap "Call UP" or "Call DOWN" to race against Bullion Pulse\'s model!</div>';
      return;
    }

    listEl.innerHTML = entries
      .slice(0, 8)
      .map((e) => {
        const curSpot = e.metal === 'silver' ? spot.silver : spot.gold;
        const refPrice = e.settledPrice != null ? e.settledPrice : curSpot;
        const movePct = e.entryPrice > 0 ? ((refPrice - e.entryPrice) / e.entryPrice) * 100 : 0;
        const isRight = (e.userDir === 'up' && movePct >= 0) || (e.userDir === 'down' && movePct < 0);
        const metalLbl = e.metal === 'silver' ? 'Silver' : 'Gold';
        const aiLbl = e.aiDir === 'up' ? 'AI: UP' : e.aiDir === 'down' ? 'AI: DOWN' : 'AI: Flat';
        const actionBtn =
          e.settledPrice == null
            ? `<button type="button" class="journal-mini-btn" data-journal-settle="${b.escapeHtml(e.id)}">Grade Now</button>`
            : `<span class="acc-tag ${isRight ? 'hit' : 'miss'}">${isRight ? 'YOU WON' : 'MISSED'}</span>`;
        return `
          <div class="journal-row">
            <div class="journal-row-main">
              <div class="journal-row-title">
                <strong>${b.escapeHtml(metalLbl)} ${e.userDir === 'up' ? '▲ UP' : '▼ DOWN'}</strong>
                <span class="journal-ai-tag">${b.escapeHtml(aiLbl)}</span>
                <span class="journal-date">${b.escapeHtml(e.date)}</span>
              </div>
              <div class="journal-row-sub">
                Start ${b.escapeHtml(b.formatMoney(e.entryPrice, e.metal === 'silver' ? 2 : 0))} → ${e.settledPrice != null ? 'Final' : 'Now'} ${b.escapeHtml(b.formatMoney(refPrice, e.metal === 'silver' ? 2 : 0))} (${b.formatSignedPct(movePct)})
              </div>
            </div>
            <div class="journal-row-actions">
              ${actionBtn}
              <button type="button" class="lot-del-btn" data-journal-del="${b.escapeHtml(e.id)}" aria-label="Delete call">&times;</button>
            </div>
          </div>`;
      })
      .join('');
  }

  function logPersonalForecast(dir) {
    const b = B();
    if (!b) return;
    const metalSel = document.getElementById('journal-metal');
    const metal = metalSel?.value === 'silver' ? 'silver' : 'gold';
    const spot = b.getCanonicalSpotPrices();
    const res = b.computeInteractiveOutlook();
    const aiScore = Number(res[metal]?.score ?? 0);
    const aiDir = aiScore >= 8 ? 'up' : aiScore <= -8 ? 'down' : 'neutral';

    const entrySpot = metal === 'silver' ? spot.silver : spot.gold;
    if (!Number.isFinite(entrySpot) || entrySpot <= 0) return;

    if (!Array.isArray(b.state.settings.forecastJournal)) {
      b.state.settings.forecastJournal = [];
    }
    b.state.settings.forecastJournal.unshift({
      id: `fj_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      date: new Date().toISOString().slice(0, 10),
      metal,
      userDir: dir === 'down' ? 'down' : 'up',
      aiDir,
      entryPrice: +entrySpot.toFixed(2),
      settledPrice: null,
      settledAt: '',
    });
    b.state.settings.forecastJournal = b.state.settings.forecastJournal.slice(0, 40);
    b.savePersistedState();
    renderForecastJournal();
  }

  /* ---------- Orchestrators & Event Wiring ---------- */

  function renderGlobalSub() {
    renderWorldGoldBoard();
    renderGlobalVaultMap();
    renderSessionReplay();
    renderAthRadar();
  }

  function renderDeepChartsSub() {
    renderRealAssets();
    renderCycleGauges();
    renderSeasonalityHeatmap();
    renderCheapestHour();
    renderStackTimeMachine();
  }

  function renderOutlookSubs() {
    renderStormRadar();
    renderFearGreedDial();
    renderMarketRadar();
    renderWhisperSlider();
    renderMinerDivergence();
    renderComexOpexCalendar();
    renderForecastJournal();
  }

  function renderAll() {
    renderGlobalSub();
    renderDeepChartsSub();
    renderTickTrust();
    renderOutlookSubs();
  }

  function init() {
    if (ui.initialized) return;
    ui.initialized = true;

    // World Physical Gold Board mode toggle (#4)
    document.getElementById('wgb-mode-melt')?.addEventListener('click', () => {
      ui.worldBoardMode = 'melt';
      renderWorldGoldBoard();
    });
    document.getElementById('wgb-mode-street')?.addEventListener('click', () => {
      ui.worldBoardMode = 'street';
      renderWorldGoldBoard();
    });

    // Session Replay metal toggle
    document.getElementById('sess-rep-gold')?.addEventListener('click', () => {
      ui.sessionMetal = 'gold';
      renderSessionReplay();
    });
    document.getElementById('sess-rep-silver')?.addEventListener('click', () => {
      ui.sessionMetal = 'silver';
      renderSessionReplay();
    });

    // ATH Radar metal toggle
    document.getElementById('ath-btn-gold')?.addEventListener('click', () => {
      ui.athMetal = 'gold';
      renderAthRadar();
    });
    document.getElementById('ath-btn-silver')?.addEventListener('click', () => {
      ui.athMetal = 'silver';
      renderAthRadar();
    });

    // Real Assets tabs
    document.getElementById('real-asset-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-asset]');
      if (!btn) return;
      ui.realAsset = btn.dataset.asset;
      renderRealAssets();
    });

    // Seasonality metal toggle
    document.getElementById('season-btn-gold')?.addEventListener('click', () => {
      ui.seasonMetal = 'gold';
      renderSeasonalityHeatmap();
    });
    document.getElementById('season-btn-silver')?.addEventListener('click', () => {
      ui.seasonMetal = 'silver';
      renderSeasonalityHeatmap();
    });

    // Fear & Greed metal toggle
    document.getElementById('fg-btn-gold')?.addEventListener('click', () => {
      ui.fgMetal = 'gold';
      renderFearGreedDial();
    });
    document.getElementById('fg-btn-silver')?.addEventListener('click', () => {
      ui.fgMetal = 'silver';
      renderFearGreedDial();
    });

    // Market Radar metal toggle
    document.getElementById('radar-btn-gold')?.addEventListener('click', () => {
      ui.radarMetal = 'gold';
      renderMarketRadar();
    });
    document.getElementById('radar-btn-silver')?.addEventListener('click', () => {
      ui.radarMetal = 'silver';
      renderMarketRadar();
    });

    // Whisper sliders (bounded)
    document.getElementById('input-whisper-cpi')?.addEventListener('input', (e) => {
      ui.whisperCpi = clamp(parseFloat(e.target.value), -2, 2, 0);
      renderWhisperSlider();
    });
    document.getElementById('input-whisper-fed')?.addEventListener('input', (e) => {
      ui.whisperFed = Math.round(clamp(parseInt(e.target.value, 10), -200, 200, 0));
      renderWhisperSlider();
    });
    document.getElementById('btn-reset-whisper')?.addEventListener('click', () => {
      ui.whisperCpi = 0;
      ui.whisperFed = 0;
      const c = document.getElementById('input-whisper-cpi');
      const f = document.getElementById('input-whisper-fed');
      if (c) c.value = '0';
      if (f) f.value = '0';
      renderWhisperSlider();
    });

    // Live Price Check button
    document.getElementById('btn-run-quorum-check')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-run-quorum-check');
      if (btn) btn.textContent = 'Checking…';
      await B()?.fetchSpotQuotes?.(true);
      renderTickTrust();
      if (btn) btn.textContent = 'Check Now';
    });

    // Forecast Journal buttons & delegated row actions
    document.getElementById('btn-journal-up')?.addEventListener('click', () => logPersonalForecast('up'));
    document.getElementById('btn-journal-down')?.addEventListener('click', () => logPersonalForecast('down'));
    document.getElementById('journal-entries-list')?.addEventListener('click', (e) => {
      const b = B();
      if (!b) return;
      const settleBtn = e.target.closest('[data-journal-settle]');
      if (settleBtn) {
        const id = settleBtn.dataset.journalSettle;
        const entry = (b.state.settings.forecastJournal || []).find((x) => x.id === id);
        if (entry) {
          const spot = b.getCanonicalSpotPrices();
          const settled = entry.metal === 'silver' ? spot.silver : spot.gold;
          if (!Number.isFinite(settled) || settled <= 0) return;
          entry.settledPrice = +settled.toFixed(2);
          entry.settledAt = new Date().toISOString().slice(0, 10);
          b.savePersistedState();
          renderForecastJournal();
        }
        return;
      }
      const delBtn = e.target.closest('[data-journal-del]');
      if (delBtn) {
        const id = delBtn.dataset.journalDel;
        b.state.settings.forecastJournal = (b.state.settings.forecastJournal || []).filter((x) => x.id !== id);
        b.savePersistedState();
        renderForecastJournal();
      }
    });

    // Re-render canvases crisply on debounced window resize
    let intelResizeTimer = null;
    window.addEventListener('resize', () => {
      if (intelResizeTimer) clearTimeout(intelResizeTimer);
      intelResizeTimer = setTimeout(() => {
        const st = B()?.state;
        if (st?.activeView === 'markets' && st?.settings?.subViews?.markets === 'charts') {
          renderRealAssets();
        } else if (st?.activeView === 'stack' && (st?.settings?.subViews?.stack || 'overview') === 'overview') {
          renderStackTimeMachine();
        }
      }, 120);
    });
    setInterval(() => {
      const mapPanel = document.getElementById('panel-global-vault-map');
      if (mapPanel && mapPanel.offsetParent !== null) {
        tickVaultMapCountdowns();
      }
    }, 1000);
  }

  window.BullionIntel = {
    init,
    renderAll,
    renderGlobalSub,
    renderGlobalVaultMap,
    renderDeepChartsSub,
    renderOutlookSubs,
    renderTickTrust,
    renderStackTimeMachine,
    getUpcomingComexDates,
  };

  if (document.readyState !== 'loading' && window.__BP_BRIDGE) {
    init();
    renderAll();
  }
})();
