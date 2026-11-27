'use strict';

/* ==========================================================================
   Bullion Pulse — Display Modes, 5 Designer Vault Themes, Multi-Language UI,
   Wide-Screen Split-Desk (1440px+), Ultrawide 3-Col Desk & OLED Pixel-Shift
   (#112, #121, #131, #179, #181)
   ========================================================================== */

(() => {
  const B = () => window.__BP_BRIDGE || null;

  /* ---------- #121 Designer Vault Themes ---------- */

  const VAULT_THEMES = [
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
  ];

  const THEME_MAP = Object.fromEntries(VAULT_THEMES.map((t) => [t.id, t]));

  /* ---------- #112 Multi-Language Plain-Language Switcher (7 Languages) ---------- */

  const LANGUAGES = [
    { code: 'en', short: 'EN', native: 'English', label: 'EN · English' },
    { code: 'th', short: 'ไทย', native: 'ไทย', label: 'ไทย · Thai' },
    { code: 'lo', short: 'ລາວ', native: 'ລາວ', label: 'ລາວ · Lao' },
    { code: 'es', short: 'ES', native: 'Español', label: 'ES · Español' },
    { code: 'zh', short: '中文', native: '中文', label: '中文 · Chinese' },
    { code: 'ja', short: '日本語', native: '日本語', label: '日本語 · Japanese' },
    { code: 'hi', short: 'हिन्दी', native: 'हिन्दी', label: 'हिन्दी · Hindi' },
  ];

  // WeakMaps track original English, last rendered string, and rendered language on EVERY text node
  // so chained switches (th -> lo -> es -> zh -> ja -> hi -> en) are 100% lossless & O(1) on unchanged nodes
  const origTextMap = new WeakMap();
  const renderedTextMap = new WeakMap();
  const renderedLangMap = new WeakMap();
  const origPhMap = new WeakMap();
  const renderedPhMap = new WeakMap();
  const renderedPhLangMap = new WeakMap();
  const i18nCache = new Map();
  const MAX_I18N_CACHE = 1000;
  const MAX_I18N_PATTERN_LEN = 320;

  /* ---------- State & Helpers ---------- */

  const PIXEL_SHIFT_ORBIT = [
    [0, 0],
    [2, 0],
    [3, 1],
    [3, 3],
    [1, 3],
    [0, 2],
    [-2, 2],
    [-3, 1],
    [-3, -1],
    [-1, -3],
    [0, -2],
    [2, -1],
  ];

  const ui = {
    initialized: false,
    toastTimer: null,
    shiftStep: 0,
    shiftTimer: null,
    observer: null,
    i18nRaf: null,
    isApplyingI18n: false,
    resizeTimer: null,
    chartDocked: false,
    ultrawideCol3: 'trade', // 'trade' | 'stack' | 'alerts'
  };

  function showToast(msg) {
    const el = document.getElementById('display-toast');
    if (!el) return;
    const lang = B()?.state?.settings?.language || 'en';
    el.textContent = lang === 'en' ? msg : translateString(msg, lang);
    el.hidden = false;
    el.classList.add('show');
    if (ui.toastTimer) clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => {
        if (!el.classList.contains('show')) el.hidden = true;
      }, 220);
    }, 2000);
  }

  /* ---------- #121 Theme Gallery & Cycling ---------- */

  function renderThemeGallery() {
    const grid = document.getElementById('vault-theme-grid');
    if (!grid) return;
    const b = B();
    const cur = b?.state?.settings?.theme || 'dark';
    grid.innerHTML = '';
    VAULT_THEMES.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `vault-theme-card${cur === t.id ? ' active' : ''}`;
      btn.dataset.themeId = t.id;
      btn.setAttribute('aria-pressed', cur === t.id ? 'true' : 'false');

      const swRow = document.createElement('div');
      swRow.className = 'vt-swatches';
      t.swatches.forEach((hex) => {
        const dot = document.createElement('span');
        dot.className = 'vt-swatch';
        dot.style.backgroundColor = hex;
        swRow.appendChild(dot);
      });

      const title = document.createElement('strong');
      title.className = 'vt-name';
      title.textContent = t.name;

      const desc = document.createElement('span');
      desc.className = 'vt-desc';
      desc.textContent = t.desc;

      btn.appendChild(swRow);
      btn.appendChild(title);
      btn.appendChild(desc);

      btn.addEventListener('click', () => {
        selectTheme(t.id, true);
      });
      grid.appendChild(btn);
    });
  }

  function syncThemeUi() {
    const b = B();
    const cur = b?.state?.settings?.theme || 'dark';
    const metaTheme = Object.hasOwn(THEME_MAP, cur) ? THEME_MAP[cur] : THEME_MAP.dark;
    const metaEl = document.getElementById('meta-theme-color');
    if (metaEl) metaEl.setAttribute('content', metaTheme.metaColor);

    const themeBtn = document.getElementById('btn-theme');
    if (themeBtn) {
      themeBtn.title = `Theme: ${metaTheme.name} — click to switch`;
      themeBtn.setAttribute('aria-label', `Current theme ${metaTheme.name}. Click to cycle vault themes`);
    }

    document.querySelectorAll('#vault-theme-grid .vault-theme-card').forEach((card) => {
      const active = card.dataset.themeId === cur;
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function selectTheme(themeId, announce = false) {
    const b = B();
    if (!b || !Object.hasOwn(THEME_MAP, themeId)) return;
    b.applyTheme(themeId);
    b.savePersistedState();
    syncThemeUi();
    if (announce) {
      const meta = THEME_MAP[themeId];
      showToast(`🎨 Theme: ${meta.name}`);
    }
  }

  function cycleTheme() {
    const b = B();
    const cur = b?.state?.settings?.theme || 'dark';
    const idx = VAULT_THEMES.findIndex((t) => t.id === cur);
    const next = VAULT_THEMES[(idx + 1) % VAULT_THEMES.length];
    selectTheme(next.id, true);
  }

  /* ---------- #112 Full-App TreeWalker Translator (Exact + Dynamic Templates + Placeholders) ---------- */

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'NOSCRIPT']);
  const PURE_NUM_RE = /^[\d\s$€£¥₹฿₭.,%+\-—–·:×±/()•…|]+$/;

  function translateString(raw, lang) {
    if (!raw || lang === 'en') return raw;
    const packs = window.__BP_I18N_PACKS;
    if (!packs) return raw;

    // Linear O(N) leading/trailing whitespace extraction (avoids unanchored /\s*$/ backtracking)
    const trimmedStart = raw.trimStart();
    if (!trimmedStart) return raw;
    const lead = raw.slice(0, raw.length - trimmedStart.length);
    const trimmed = trimmedStart.trimEnd();
    const trail = trimmedStart.slice(trimmed.length);
    const norm = trimmed.replace(/\s+/g, ' ');
    if (!norm || PURE_NUM_RE.test(norm)) return raw;

    const cacheKey = `${lang}\u0000${norm}`;
    if (i18nCache.has(cacheKey)) {
      const hit = i18nCache.get(cacheKey);
      return hit === null ? raw : `${lead}${hit}${trail}`;
    }

    const exact = Object.hasOwn(packs.EXACT || {}, norm) ? packs.EXACT[norm]?.[lang] : null;
    if (exact) {
      if (i18nCache.size >= MAX_I18N_CACHE) i18nCache.delete(i18nCache.keys().next().value);
      i18nCache.set(cacheKey, exact);
      return `${lead}${exact}${trail}`;
    }

    // Bound pattern scanning length to prevent client-side ReDoS on long external text
    if (norm.length <= MAX_I18N_PATTERN_LEN) {
      const patterns = packs.PATTERNS || [];
      for (let i = 0; i < patterns.length; i++) {
        const [re, fn] = patterns[i];
        const m = norm.match(re);
        if (m) {
          const out = fn(m, lang);
          if (out) {
            if (i18nCache.size >= MAX_I18N_CACHE) i18nCache.delete(i18nCache.keys().next().value);
            i18nCache.set(cacheKey, out);
            return `${lead}${out}${trail}`;
          }
        }
      }
    }
    if (i18nCache.size >= MAX_I18N_CACHE) i18nCache.delete(i18nCache.keys().next().value);
    i18nCache.set(cacheKey, null);
    return raw;
  }

  function shouldSkipNode(node) {
    let el = node.parentElement;
    if (!el) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.closest('svg, code, .code-block, #select-language, #select-currency, #settings-lang-pills')) {
      return true;
    }
    return false;
  }

  function applyLanguageToDom(lang) {
    if (ui.isApplyingI18n) return;
    ui.isApplyingI18n = true;
    try {
      document.documentElement.lang = lang;
      const root = document.querySelector('.app-shell') || document.body;
      if (!root) return;

      // 1. Walk visible text nodes (O(1) fast-path skip for unchanged already-translated nodes)
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (shouldSkipNode(node)) continue;
        const currentText = node.nodeValue;
        if (!currentText || !currentText.trim()) continue;

        if (!origTextMap.has(node)) {
          origTextMap.set(node, currentText);
          renderedTextMap.set(node, currentText);
          renderedLangMap.set(node, 'en');
        } else {
          const prevRendered = renderedTextMap.get(node);
          const prevLang = renderedLangMap.get(node);
          if (currentText === prevRendered && prevLang === lang) continue;
          const prevOrig = origTextMap.get(node);
          if (currentText !== prevRendered && currentText !== prevOrig) {
            origTextMap.set(node, currentText);
          }
        }
        const orig = origTextMap.get(node);
        const nextText = lang === 'en' ? orig : translateString(orig, lang);
        renderedTextMap.set(node, nextText);
        renderedLangMap.set(node, lang);
        if (nextText !== currentText) {
          node.nodeValue = nextText;
        }
      }

      // 2. Translate input placeholders across all forms
      root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
        const curPh = el.getAttribute('placeholder') || '';
        if (!curPh.trim()) return;
        if (!origPhMap.has(el)) {
          origPhMap.set(el, curPh);
          renderedPhMap.set(el, curPh);
          renderedPhLangMap.set(el, 'en');
        } else {
          const prevR = renderedPhMap.get(el);
          const prevL = renderedPhLangMap.get(el);
          if (curPh === prevR && prevL === lang) return;
          const prevO = origPhMap.get(el);
          if (curPh !== prevR && curPh !== prevO) origPhMap.set(el, curPh);
        }
        const orig = origPhMap.get(el);
        const nextPh = lang === 'en' ? orig : translateString(orig, lang);
        renderedPhMap.set(el, nextPh);
        renderedPhLangMap.set(el, lang);
        if (nextPh !== curPh) el.setAttribute('placeholder', nextPh);
      });
    } finally {
      // Flush self-inflicted mutation records BEFORE clearing guard to prevent double-sweep loops
      if (ui.observer && typeof ui.observer.takeRecords === 'function') {
        ui.observer.takeRecords();
      }
      ui.isApplyingI18n = false;
    }
  }

  function scheduleI18nRefresh() {
    const lang = B()?.state?.settings?.language || 'en';
    if (lang === 'en') return;
    if (ui.i18nRaf) return;
    ui.i18nRaf = requestAnimationFrame(() => {
      ui.i18nRaf = null;
      applyLanguageToDom(B()?.state?.settings?.language || 'en');
    });
  }

  function renderLanguageControls() {
    const lang = B()?.state?.settings?.language || 'en';
    const topSel = document.getElementById('select-language');
    if (topSel && topSel.value !== lang) topSel.value = lang;

    const pillWrap = document.getElementById('settings-lang-pills');
    if (pillWrap) {
      if (!pillWrap.children.length) {
        LANGUAGES.forEach((l) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'lang-pill-btn';
          btn.dataset.langCode = l.code;
          btn.textContent = l.label;
          btn.addEventListener('click', () => setLanguage(l.code, true));
          pillWrap.appendChild(btn);
        });
      }
      pillWrap.querySelectorAll('.lang-pill-btn').forEach((btn) => {
        const act = btn.dataset.langCode === lang;
        btn.classList.toggle('active', act);
        btn.setAttribute('aria-pressed', act ? 'true' : 'false');
      });
    }
  }

  function setLanguage(langCode, announce = false) {
    const b = B();
    const valid = LANGUAGES.find((l) => l.code === langCode) ? langCode : 'en';
    if (b?.state?.settings) {
      b.state.settings.language = valid;
      b.savePersistedState();
    }
    renderLanguageControls();
    applyLanguageToDom(valid);
    if (announce) {
      const meta = LANGUAGES.find((l) => l.code === valid);
      showToast(`🌐 ${meta ? meta.label : 'English'}`);
    }
  }

  /* ---------- #131 Split-Desk (1440px+) & #179 Ultrawide 3-Col Desk ---------- */

  function computeEffectiveDeskMode() {
    const pref = B()?.state?.settings?.deskLayout || 'auto';
    const w = window.innerWidth;
    if (w < 1440) return 'single';
    if (pref === 'single') return 'single';
    if (pref === 'split') return 'split';
    if (pref === 'ultrawide') return w >= 1680 ? 'ultrawide' : 'split';
    // 'auto': automatically turns on 3-Column Trading Desk on true 21:9 / 32:9 ultrawides (2200px+)
    return w >= 2200 ? 'ultrawide' : 'single';
  }

  function dockChartToSplit(shouldDock) {
    const goldCard = document.getElementById('card-gold');
    const silverCard = document.getElementById('card-silver');
    const chartPanel = document.getElementById('panel-chart');
    const statsStrip = document.getElementById('market-stats-strip');
    const splitSlot = document.getElementById('split-desk-chart-slot');
    const spotPair = document.getElementById('split-desk-spot-pair');
    const splitAside = document.getElementById('split-desk-left');
    const goldAnchor = document.getElementById('card-gold-anchor');
    const silverAnchor = document.getElementById('card-silver-anchor');
    const chartAnchor = document.getElementById('panel-chart-anchor');
    const statsAnchor = document.getElementById('market-stats-anchor');
    const placeholder = document.getElementById('split-live-placeholder');
    if (!chartPanel || !splitSlot || !splitAside || !chartAnchor) return;

    const liveItems = [goldCard, silverCard, chartPanel, statsStrip].filter(Boolean);

    if (shouldDock && !ui.chartDocked) {
      if (spotPair) {
        if (goldCard) spotPair.appendChild(goldCard);
        if (silverCard) spotPair.appendChild(silverCard);
      } else {
        if (goldCard) splitSlot.appendChild(goldCard);
        if (silverCard) splitSlot.appendChild(silverCard);
      }
      splitSlot.appendChild(chartPanel);
      if (statsStrip) splitSlot.appendChild(statsStrip);
      liveItems.forEach((el) => el.classList.remove('sub-hidden'));
      splitAside.hidden = false;
      if (placeholder) placeholder.hidden = false;
      ui.chartDocked = true;

      // If user is on Markets -> Live & Chart when entering Split, show Global & Maps on the right so neither pane is empty
      const b = B();
      if (b?.state?.activeView === 'markets' && (b?.state?.settings?.subViews?.markets || 'live') === 'live') {
        document.querySelector('#view-markets .sub-nav .sub-tab-btn[data-sub-target="global"]')?.click();
      }
    } else if (!shouldDock && ui.chartDocked) {
      if (goldCard && goldAnchor?.parentNode) {
        goldAnchor.parentNode.insertBefore(goldCard, goldAnchor.nextSibling);
      }
      if (silverCard && silverAnchor?.parentNode) {
        silverAnchor.parentNode.insertBefore(silverCard, silverAnchor.nextSibling);
      }
      chartAnchor.parentNode.insertBefore(chartPanel, chartAnchor.nextSibling);
      if (statsStrip && statsAnchor?.parentNode) {
        statsAnchor.parentNode.insertBefore(statsStrip, statsAnchor.nextSibling);
      }
      if (placeholder) placeholder.hidden = true;
      splitAside.hidden = true;
      ui.chartDocked = false;
      B()?.applyAllSubViews?.();
    } else if (shouldDock) {
      liveItems.forEach((el) => el.classList.remove('sub-hidden'));
      if (placeholder) placeholder.hidden = false;
      splitAside.hidden = false;
    } else {
      if (placeholder) placeholder.hidden = true;
      splitAside.hidden = true;
    }
  }

  function applyDeskLayout(forceRender = false) {
    const b = B();
    const pref = b?.state?.settings?.deskLayout || 'auto';
    const effective = computeEffectiveDeskMode();
    const prev = document.body.dataset.deskActive || 'single';

    document.body.dataset.deskActive = effective;
    document.body.dataset.deskPref = pref;
    document.body.dataset.deskCol3 = ui.ultrawideCol3;

    // #131 Split-Desk: dock live chart permanently on the left half
    dockChartToSplit(effective === 'split');

    // Sync header quick desk buttons (visible >= 1440px)
    document.querySelectorAll('#desk-mode-bar .desk-pill-btn').forEach((btn) => {
      const m = btn.dataset.deskMode;
      const isAct = (pref === 'auto' && m === effective) || pref === m;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-pressed', isAct ? 'true' : 'false');
    });

    // Sync Settings -> Display & Lang layout buttons
    document.querySelectorAll('#settings-desk-btns .desk-opt-btn').forEach((btn) => {
      const act = btn.dataset.deskMode === pref;
      btn.classList.toggle('active', act);
      btn.setAttribute('aria-pressed', act ? 'true' : 'false');
    });

    // Update live screen-width readout in Settings
    const screenInfo = document.getElementById('desk-screen-status');
    if (screenInfo) {
      const w = window.innerWidth;
      const activeLabel =
        effective === 'ultrawide'
          ? '3-Column Ultrawide Active'
          : effective === 'split'
            ? 'Split-Desk Active (Live & Chart Pinned Left)'
            : 'Single View Active';
      const tip =
        w < 1440
          ? 'Resize window to 1440px+ for Split-Desk or 1680px+ for 3-Column Ultrawide.'
          : w < 1680
            ? 'Split-Desk ready! Widen to 1680px+ for 3-Column Ultrawide.'
            : 'Both Split-Desk and 3-Column Ultrawide are ready on this monitor.';
      screenInfo.textContent = `Current screen: ${w}px · ${activeLabel}. ${tip}`;
    }

    if (prev !== effective || forceRender) {
      requestAnimationFrame(() => {
        b?.renderChart?.();
        if (effective === 'ultrawide') {
          const res = b?.computeInteractiveOutlook?.();
          b?.renderOutlook?.();
          if (res) {
            b?.renderRatioAnalytics?.(res);
            b?.renderBuyLadder?.(res);
          }
          b?.renderRatioSwapCalculator?.();
          b?.renderDealGrader?.();
          b?.renderStackTracker?.();
          window.BullionIntel?.renderAll?.();
        }
      });
    }
  }

  function setDeskLayout(mode, announce = false) {
    const b = B();
    const allowed = new Set(['auto', 'single', 'split', 'ultrawide']);
    const next = allowed.has(mode) ? mode : 'auto';
    if (b?.state?.settings) {
      b.state.settings.deskLayout = next;
      b.savePersistedState();
    }
    applyDeskLayout(true);
    if (announce) {
      const labels = {
        auto: 'Auto Desk Layout',
        single: 'Single View',
        split: window.innerWidth >= 1440 ? 'Split-Desk (Chart Pinned Left)' : 'Split-Desk (activates at 1440px+)',
        ultrawide: window.innerWidth >= 1680 ? '3-Column Ultrawide Desk' : '3-Col Desk (activates at 1680px+)',
      };
      showToast(`🖥️ ${labels[next]}`);
    }
  }

  function onViewChange(viewName) {
    if (viewName === 'trade' || viewName === 'stack' || viewName === 'alerts') {
      ui.ultrawideCol3 = viewName;
      document.body.dataset.deskCol3 = ui.ultrawideCol3;
    }
    if (document.body.dataset.deskActive === 'split') {
      dockChartToSplit(true);
      requestAnimationFrame(() => B()?.renderChart?.());
    }
    const lang = B()?.state?.settings?.language || 'en';
    if (lang !== 'en') {
      applyLanguageToDom(lang);
      requestAnimationFrame(() => applyLanguageToDom(lang));
    }
  }

  /* ---------- #181 OLED Burn-In-Safe Pixel-Shift Display ---------- */

  function updatePixelShiftDom() {
    const enabled = Boolean(B()?.state?.settings?.oledPixelShift);
    const [dx, dy] = enabled ? PIXEL_SHIFT_ORBIT[ui.shiftStep % PIXEL_SHIFT_ORBIT.length] : [0, 0];

    document.body.classList.toggle('pixel-shift-on', enabled);
    document.documentElement.style.setProperty('--oled-shift-x', `${dx}px`);
    document.documentElement.style.setProperty('--oled-shift-y', `${dy}px`);

    const chk = document.getElementById('chk-oled-pixel-shift');
    if (chk) chk.checked = enabled;

    const pill = document.getElementById('oled-shift-status');
    if (pill) {
      if (enabled) {
        const sx = dx >= 0 ? `+${dx}` : `${dx}`;
        const sy = dy >= 0 ? `+${dy}` : `${dy}`;
        pill.textContent = `Active · ${sx}px, ${sy}px`;
        pill.className = 'signal-pill bullish';
      } else {
        pill.textContent = 'Off';
        pill.className = 'signal-pill';
      }
    }
  }

  function startOrStopPixelShift() {
    const enabled = Boolean(B()?.state?.settings?.oledPixelShift);
    if (ui.shiftTimer) {
      clearInterval(ui.shiftTimer);
      ui.shiftTimer = null;
    }
    if (enabled) {
      ui.shiftTimer = setInterval(() => {
        ui.shiftStep = (ui.shiftStep + 1) % PIXEL_SHIFT_ORBIT.length;
        updatePixelShiftDom();
      }, 60 * 1000);
    } else {
      ui.shiftStep = 0;
    }
    updatePixelShiftDom();
  }

  function setOledPixelShift(enabled, announce = false) {
    const b = B();
    if (b?.state?.settings) {
      b.state.settings.oledPixelShift = Boolean(enabled);
      b.savePersistedState();
    }
    if (enabled && ui.shiftStep === 0) ui.shiftStep = 1;
    startOrStopPixelShift();
    if (announce) {
      showToast(enabled ? '🛡️ OLED Pixel-Shift ON (drifts ±3px every 60s)' : 'OLED Pixel-Shift OFF');
    }
  }

  function previewPixelShiftNow() {
    const b = B();
    if (b?.state?.settings && !b.state.settings.oledPixelShift) {
      b.state.settings.oledPixelShift = true;
      b.savePersistedState();
      startOrStopPixelShift();
    }
    ui.shiftStep = (ui.shiftStep + 1) % PIXEL_SHIFT_ORBIT.length;
    updatePixelShiftDom();
    const [dx, dy] = PIXEL_SHIFT_ORBIT[ui.shiftStep];
    showToast(`🛡️ Shifted to (${dx >= 0 ? '+' : ''}${dx}px, ${dy >= 0 ? '+' : ''}${dy}px)`);
  }

  /* ---------- Wiring & Boot ---------- */

  function wireControls() {
    document.getElementById('select-language')?.addEventListener('change', (e) => {
      setLanguage(e.target.value, true);
    });

    document.querySelectorAll('#desk-mode-bar .desk-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setDeskLayout(btn.dataset.deskMode, true);
      });
    });

    document.querySelectorAll('#settings-desk-btns .desk-opt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setDeskLayout(btn.dataset.deskMode, true);
      });
    });

    document.getElementById('btn-exit-split-desk')?.addEventListener('click', () => {
      setDeskLayout('single', true);
    });

    document.getElementById('chk-oled-pixel-shift')?.addEventListener('change', (e) => {
      setOledPixelShift(e.target.checked, true);
    });

    document.getElementById('btn-oled-shift-now')?.addEventListener('click', () => {
      previewPixelShiftNow();
    });

    window.addEventListener('resize', () => {
      if (ui.resizeTimer) clearTimeout(ui.resizeTimer);
      ui.resizeTimer = setTimeout(() => applyDeskLayout(false), 120);
    });

    // Keep dynamically re-rendered panels translated automatically
    const root = document.querySelector('.app-shell');
    if (root && typeof MutationObserver !== 'undefined') {
      ui.observer = new MutationObserver(() => {
        if (!ui.isApplyingI18n && (B()?.state?.settings?.language || 'en') !== 'en') {
          scheduleI18nRefresh();
        }
      });
      ui.observer.observe(root, { childList: true, subtree: true, characterData: true });
    }
  }

  function syncAll() {
    renderThemeGallery();
    syncThemeUi();
    renderLanguageControls();
    applyLanguageToDom(B()?.state?.settings?.language || 'en');
    applyDeskLayout(false);
    startOrStopPixelShift();
  }

  function init() {
    if (ui.initialized) {
      syncAll();
      return;
    }
    ui.initialized = true;
    wireControls();
    syncAll();
  }

  window.BullionDisplay = {
    VAULT_THEMES,
    LANGUAGES,
    init,
    syncAll,
    syncThemeUi,
    selectTheme,
    cycleTheme,
    setLanguage,
    setDeskLayout,
    applyDeskLayout,
    onViewChange,
    setOledPixelShift,
    previewPixelShiftNow,
  };

  if (document.readyState !== 'loading' && window.__BP_BRIDGE) {
    init();
  }
})();
