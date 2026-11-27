import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AlertLogItem,
  AppSettings,
  CandleBar,
  ComexData,
  CurrencyCode,
  DeskLayoutMode,
  FeedHealthState,
  FeedTrustState,
  ForecastJournalEntry,
  FuturesState,
  HistoryPoint,
  MainViewId,
  MetalKey,
  MetalQuote,
  OutlookData,
  ResolvedDeskLayout,
  SessionAlertedState,
  ShanghaiData,
  SpaceWeatherData,
  StackLot,
  SubViewsState,
  TimeframesData,
  VaultThemeId,
} from '../types/bullion';
import {
  CANDLE_1M_MS,
  CANDLE_INTERVAL_MS,
  DEFAULT_FX_RATES,
  formatMoney,
  formatTime,
  REFRESH_MS,
  SLOW_REFRESH_MS,
  THEME_MAP,
  todayKey,
  VAULT_THEMES,
} from '../utils/format';
import {
  defaultSpaceWeather,
  sanitizePersistedSettings,
  sanitizeShortText,
} from '../utils/security';
import {
  buildBackupJson,
  loadPersistedState,
  parseBackupJson,
  savePersistedState,
} from '../utils/storage';
import {
  fetchAllRepoData,
  fetchLiveFxRates,
  fetchLiveNoaaSpaceWeather,
  fetchLiveSpotQuorum,
} from '../services/marketApi';
import { isInQuietHours, publishToNtfy } from '../services/ntfy';
import { computeFullQuantSuite, type FullQuantModelOutput } from '../engines/outlookEngine';
import { I18nProvider } from '../i18n/I18nContext';

const PIXEL_SHIFT_ORBIT: readonly (readonly [number, number])[] = [
  [0, 0], [2, 0], [3, 1], [3, 3], [1, 3], [0, 2],
  [-2, 2], [-3, 1], [-3, -1], [-1, -3], [0, -2], [2, -1],
];

export interface StackSummary {
  goldOz: number;
  silverOz: number;
  goldCostAvg: number;
  silverCostAvg: number;
  goldMeltUsd: number;
  silverMeltUsd: number;
  totalMeltUsd: number;
  totalCostUsd: number;
  totalPnlUsd: number;
  totalPnlPct: number;
  netLiquidationUsd: number;
  hasHoldings: boolean;
}

export interface AlertBannerState {
  visible: boolean;
  title: string;
  body: string;
  tone: 'up' | 'down' | 'neutral';
}

export interface BullionContextValue {
  settings: AppSettings;
  updateSettings: (updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => void;
  activeView: MainViewId;
  lastMainView: MainViewId;
  setActiveView: (view: MainViewId) => void;
  setSubView: <K extends keyof SubViewsState>(view: K, sub: SubViewsState[K]) => void;
  resolvedDeskLayout: ResolvedDeskLayout;
  setDeskLayout: (mode: DeskLayoutMode) => void;
  quotes: { gold: MetalQuote; silver: MetalQuote };
  futures: FuturesState;
  fxRates: Record<CurrencyCode, number>;
  outlook: OutlookData | null;
  shanghai: ShanghaiData | null;
  comex: ComexData | null;
  accuracyLog: Record<string, unknown> | null;
  timeframes: TimeframesData;
  candles: { gold: CandleBar[]; silver: CandleBar[] };
  candles1m: { gold: CandleBar[]; silver: CandleBar[] };
  spaceWeather: SpaceWeatherData;
  feedHealth: FeedHealthState;
  feedTrust: FeedTrustState;
  mode: 'connecting' | 'live' | 'demo';
  lastUpdated: number | null;
  alertLog: AlertLogItem[];
  alertBanner: AlertBannerState;
  dismissBanner: () => void;
  toastMsg: string | null;
  showToast: (msg: string) => void;
  cycleTheme: () => void;
  selectTheme: (id: VaultThemeId, announce?: boolean) => void;
  togglePrivacyMode: () => void;
  refreshNow: () => Promise<void>;
  sendTestNtfy: () => Promise<{ ok: boolean; error?: string }>;
  stackSummary: StackSummary;
  addStackLot: (lot: Omit<StackLot, 'id'>) => void;
  deleteStackLot: (id: string) => void;
  addForecastEntry: (metal: MetalKey, userDir: 'up' | 'down') => void;
  settleForecastEntry: (id: string) => void;
  exportBackup: () => void;
  importBackup: (rawText: string) => boolean;
  clearAlertLog: () => void;
  quant: FullQuantModelOutput;
  aiSimDelta: number;
  setAiSimDelta: React.Dispatch<React.SetStateAction<number>>;
  whisperCpi: number;
  setWhisperCpi: React.Dispatch<React.SetStateAction<number>>;
  whisperFed: number;
  setWhisperFed: React.Dispatch<React.SetStateAction<number>>;
  whisperScenarioId: string;
  setWhisperScenarioId: React.Dispatch<React.SetStateAction<string>>;
  isLightTheme: boolean;
}

const BullionContext = createContext<BullionContextValue | null>(null);

export const BullionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialPersisted = useMemo(() => loadPersistedState(), []);

  const [settings, setSettings] = useState<AppSettings>(initialPersisted.settings);
  const [alertLog, setAlertLog] = useState<AlertLogItem[]>(initialPersisted.alertLog);
  const [history, setHistory] = useState<{ gold: HistoryPoint[]; silver: HistoryPoint[] }>(
    initialPersisted.history
  );
  const [sessionAlerted, setSessionAlerted] = useState<SessionAlertedState>(
    initialPersisted.sessionAlerted
  );

  const [activeView, setActiveViewRaw] = useState<MainViewId>('markets');
  const [lastMainView, setLastMainView] = useState<MainViewId>('markets');
  const [viewportW, setViewportW] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  const [quotes, setQuotes] = useState<{ gold: MetalQuote; silver: MetalQuote }>({
    gold: { price: null, prevClose: null, chg: 0, pct: 0 },
    silver: { price: null, prevClose: null, chg: 0, pct: 0 },
  });
  const [futures, setFutures] = useState<FuturesState>({
    gold: null,
    silver: null,
    liveFetched: false,
    source: '',
  });
  const [fxRates, setFxRates] = useState<Record<CurrencyCode, number>>(DEFAULT_FX_RATES);
  const [outlook, setOutlook] = useState<OutlookData | null>(null);
  const [shanghai, setShanghai] = useState<ShanghaiData | null>(null);
  const [comex, setComex] = useState<ComexData | null>(null);
  const [accuracyLog, setAccuracyLog] = useState<Record<string, unknown> | null>(null);
  const [timeframes, setTimeframes] = useState<TimeframesData>({});
  const [candles, setCandles] = useState<{ gold: CandleBar[]; silver: CandleBar[] }>({
    gold: [],
    silver: [],
  });
  const [candles1m, setCandles1m] = useState<{ gold: CandleBar[]; silver: CandleBar[] }>({
    gold: [],
    silver: [],
  });
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherData>(defaultSpaceWeather);
  const [mode, setMode] = useState<'connecting' | 'live' | 'demo'>('connecting');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [feedHealth, setFeedHealth] = useState<FeedHealthState>({
    spotAt: null,
    spotSource: '',
    dxyAt: null,
    dxyLive: false,
    futuresAt: null,
    sgeAt: null,
    comexAt: null,
    comexLive: false,
    outlookAt: null,
  });

  const [feedTrust, setFeedTrust] = useState<FeedTrustState>({
    status: 'connecting',
    primarySource: 'BullionVault Live Spot',
    secondarySource: 'Coinbase PAXG Quorum',
    lastSpreadPct: null,
    rejectedOutliers: 0,
    failovers: 0,
    checksCount: 0,
    lastVerifiedAt: null,
    lastEventNote: 'Waiting for first multi-source sanity check…',
  });

  const [alertBanner, setAlertBanner] = useState<AlertBannerState>({
    visible: false,
    title: 'Big Daily Move Detected',
    body: '',
    tone: 'neutral',
  });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Interactive quant scenario controls
  const [aiSimDelta, setAiSimDelta] = useState<number>(0);
  const [whisperCpi, setWhisperCpi] = useState<number>(0);
  const [whisperFed, setWhisperFed] = useState<number>(0);
  const [whisperScenarioId, setWhisperScenarioId] = useState<string>('none');

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2300);
  }, []);

  const updateSettings = useCallback(
    (updater: Partial<AppSettings> | ((prev: AppSettings) => AppSettings)) => {
      setSettings((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        return sanitizePersistedSettings(next);
      });
    },
    []
  );

  // Persist sanitized state
  useEffect(() => {
    savePersistedState({ settings, alertLog, history, sessionAlerted });
  }, [settings, alertLog, history, sessionAlerted]);

  // Responsive viewport tracker
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const resolvedDeskLayout = useMemo<ResolvedDeskLayout>(() => {
    if (viewportW < 1100) return 'single';
    if (settings.deskLayout === 'single') return 'single';
    if (settings.deskLayout === 'ultrawide') return viewportW >= 1500 ? 'ultrawide' : 'split';
    if (settings.deskLayout === 'split') return 'split';
    // auto
    return viewportW >= 1440 ? 'split' : 'single';
  }, [viewportW, settings.deskLayout]);

  const isLightTheme = useMemo(
    () => Boolean(THEME_MAP[settings.theme]?.light),
    [settings.theme]
  );

  // Sync theme, privacy, and split/ultrawide classes to document
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = settings.theme;
    const metaTheme = THEME_MAP[settings.theme] || THEME_MAP.dark;
    const metaEl = document.getElementById('meta-theme-color');
    if (metaEl) metaEl.setAttribute('content', metaTheme.metaColor);
  }, [settings.theme]);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle('privacy-mode', settings.privacyMode);
  }, [settings.privacyMode]);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.dataset.deskActive = resolvedDeskLayout;
    document.body.classList.toggle('desk-split-active', resolvedDeskLayout === 'split');
    document.body.classList.toggle('desk-ultrawide-active', resolvedDeskLayout === 'ultrawide');
  }, [resolvedDeskLayout]);

  // Auto-switch right pane away from Markets -> Live when entering Split-Desk
  useEffect(() => {
    if (
      resolvedDeskLayout === 'split' &&
      activeView === 'markets' &&
      settings.subViews.markets === 'live'
    ) {
      updateSettings((prev) => ({
        ...prev,
        subViews: { ...prev.subViews, markets: 'global' },
      }));
    }
  }, [resolvedDeskLayout, activeView, settings.subViews.markets, updateSettings]);

  // OLED Pixel-Shift burn-in protection
  useEffect(() => {
    if (typeof document === 'undefined' || !settings.oledPixelShift) {
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty('--oled-shift-x', '0px');
        document.documentElement.style.setProperty('--oled-shift-y', '0px');
      }
      return;
    }
    let step = 0;
    const timer = setInterval(() => {
      step = (step + 1) % PIXEL_SHIFT_ORBIT.length;
      const [dx, dy] = PIXEL_SHIFT_ORBIT[step];
      document.documentElement.style.setProperty('--oled-shift-x', `${dx}px`);
      document.documentElement.style.setProperty('--oled-shift-y', `${dy}px`);
    }, 45_000);
    return () => {
      clearInterval(timer);
      document.documentElement.style.setProperty('--oled-shift-x', '0px');
      document.documentElement.style.setProperty('--oled-shift-y', '0px');
    };
  }, [settings.oledPixelShift]);

  const setActiveView = useCallback((view: MainViewId) => {
    setActiveViewRaw(view);
    if (view === 'markets' || view === 'outlook' || view === 'trade') {
      setLastMainView(view);
    }
  }, []);

  const setSubView = useCallback(
    <K extends keyof SubViewsState>(view: K, sub: SubViewsState[K]) => {
      updateSettings((prev) => ({
        ...prev,
        subViews: { ...prev.subViews, [view]: sub },
      }));
    },
    [updateSettings]
  );

  const setDeskLayout = useCallback(
    (nextMode: DeskLayoutMode) => {
      updateSettings((prev) => {
        const nextSub =
          nextMode === 'split' && activeView === 'markets' && prev.subViews.markets === 'live'
            ? { ...prev.subViews, markets: 'global' as const }
            : prev.subViews;
        return { ...prev, deskLayout: nextMode, subViews: nextSub };
      });
      const label =
        nextMode === 'split'
          ? 'Split-Desk Active'
          : nextMode === 'ultrawide'
            ? '3-Column Ultrawide Desk'
            : 'Single Column View';
      showToast(`🖥 ${label}`);
    },
    [activeView, showToast, updateSettings]
  );

  const selectTheme = useCallback(
    (id: VaultThemeId, announce = false) => {
      updateSettings({ theme: id });
      if (announce) {
        const meta = THEME_MAP[id];
        if (meta) showToast(`🎨 Theme: ${meta.name}`);
      }
    },
    [showToast, updateSettings]
  );

  const cycleTheme = useCallback(() => {
    const idx = VAULT_THEMES.findIndex((t) => t.id === settings.theme);
    const next = VAULT_THEMES[(idx + 1) % VAULT_THEMES.length];
    selectTheme(next.id, true);
  }, [selectTheme, settings.theme]);

  const togglePrivacyMode = useCallback(() => {
    updateSettings((prev) => {
      const next = !prev.privacyMode;
      showToast(next ? '🔒 Privacy Mode ON — amounts hidden' : '👁 Privacy Mode OFF');
      return { ...prev, privacyMode: next };
    });
  }, [showToast, updateSettings]);

  // Evaluate alert thresholds on live ticks (uses refs so callback identity stays 100% stable)
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sessionAlertedRef = useRef(sessionAlerted);
  sessionAlertedRef.current = sessionAlerted;
  const fxRatesRef = useRef(fxRates);
  fxRatesRef.current = fxRates;

  const evaluateAlerts = useCallback(
    (nextGold: MetalQuote, nextSilver: MetalQuote) => {
      const s = settingsRef.current;
      const sa = sessionAlertedRef.current;
      const fx = fxRatesRef.current;
      const day = todayKey();
      const quiet = isInQuietHours(s.quietHours);

      const checkMetal = (metal: MetalKey, q: MetalQuote, thresh: number) => {
        if (q.price == null || !Number.isFinite(q.pct)) return;
        const absPct = Math.abs(q.pct);
        const dir: 'up' | 'down' = q.pct >= 0 ? 'up' : 'down';
        if (absPct < thresh) return;
        if (s.direction !== 'both' && s.direction !== dir) return;
        if (sa[metal].day === day && sa[metal].dir === dir && absPct < Math.abs(sa[metal].pct) + 1) {
          return;
        }
        const label = metal === 'gold' ? 'Gold (XAU)' : 'Silver (XAG)';
        const verb = dir === 'up' ? 'surged' : 'dropped';
        const sign = q.pct >= 0 ? '+' : '−';
        const title = `${label} ${verb} ${sign}${absPct.toFixed(2)}%`;
        const body = `Spot ${formatMoney(q.price, 2, s.currency, fx)} · Threshold ±${thresh}%`;

        setAlertBanner({ visible: true, title, body, tone: dir });
        setAlertLog((prev) => [
          {
            title,
            body,
            time: formatTime(Date.now()),
            dir,
            pct: +q.pct.toFixed(2),
            badge: metal === 'gold' ? 'XAU' : 'XAG',
          },
          ...prev.slice(0, 24),
        ]);
        setSessionAlerted((prev) => ({
          ...prev,
          [metal]: { day, dir, pct: q.pct },
        }));

        if (s.ntfyTopic && !quiet) {
          void publishToNtfy({
            topic: s.ntfyTopic,
            title,
            message: body,
            priority: 4,
            tags: [dir === 'up' ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend'],
          });
        }
      };

      checkMetal('gold', nextGold, s.goldThreshold);
      checkMetal('silver', nextSilver, s.silverThreshold);
    },
    []
  );

  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const outlookRef = useRef(outlook);
  outlookRef.current = outlook;

  const syncFuturesFromBasis = useCallback(
    (spotG: number | null, spotS: number | null, outData: OutlookData | null) => {
      const basis = outData?.institutionalSignals?.basis;
      const gcRaw = Number(basis?.gold?.futures ?? basis?.goldFutures);
      const siRaw = Number(basis?.silver?.futures ?? basis?.silverFutures);
      const genMs = Date.parse(String(outData?.generatedAt || 0)) || 0;
      const isFresh = genMs > 0 && Date.now() - genMs < 24 * 60 * 60 * 1000;

      const resolveFut = (rawFut: number, basisPct: number, liveSpot: number | null, defaultSpreadPct: number) => {
        if (Number.isFinite(rawFut) && rawFut > 0) {
          // Use exact COMEX futures quote when fresh and coherent with live spot
          if (liveSpot == null || (isFresh && Math.abs(rawFut - liveSpot) / liveSpot < 0.05)) {
            return +rawFut.toFixed(2);
          }
          // If snapshot is stale relative to live spot, preserve real basis % relative to live spot
          const pct = Number.isFinite(basisPct) ? Math.max(-2.5, Math.min(3.5, basisPct)) : defaultSpreadPct;
          return +(liveSpot * (1 + pct / 100)).toFixed(2);
        }
        return liveSpot != null ? +(liveSpot * (1 + defaultSpreadPct / 100)).toFixed(2) : null;
      };

      const gFut = resolveFut(gcRaw, Number(basis?.gold?.basisPct), spotG, 0.35);
      const sFut = resolveFut(siRaw, Number(basis?.silver?.basisPct), spotS, 0.45);
      if (gFut != null || sFut != null) {
        setFutures({
          gold: gFut != null ? { price: gFut, symbol: 'GC=F' } : null,
          silver: sFut != null ? { price: sFut, symbol: 'SI=F' } : null,
          liveFetched: isFresh && Number.isFinite(gcRaw) && gcRaw > 0,
          source: isFresh && Number.isFinite(gcRaw) ? 'COMEX GC=F / SI=F (Live Synced)' : 'COMEX Basis Estimate',
        });
      }
    },
    []
  );

  const pick24hPrevClose = useCallback((bars: CandleBar[], currentPrice: number | null) => {
    if (!bars.length) return currentPrice;
    const last = bars[bars.length - 1];
    const targetT = last.t - 24 * 60 * 60 * 1000;
    let best = bars[0];
    let bestDiff = Math.abs(best.t - targetT);
    for (let i = 1; i < bars.length; i++) {
      const diff = Math.abs(bars[i].t - targetT);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = bars[i];
      }
    }
    return best?.c ?? best?.o ?? currentPrice;
  }, []);

  const upsertLiveCandle = useCallback(
    (bars: CandleBar[], price: number, ts: number, bucketMs: number, maxLen: number): CandleBar[] => {
      if (!Number.isFinite(price) || price <= 0) return bars;
      const p = +price.toFixed(2);
      const bucket = Math.floor(ts / bucketMs) * bucketMs;
      if (!bars.length) {
        return [{ t: bucket, o: p, h: p, l: p, c: p, v: 1 }];
      }
      const last = bars[bars.length - 1];
      // Guard against huge outlier jump (>8%) corrupting chart range
      if (last.c > 0 && Math.abs(p - last.c) / last.c > 0.08) return bars;
      const lastBucket = Math.floor(last.t / bucketMs) * bucketMs;
      if (bucket <= lastBucket) {
        const nextLast: CandleBar = {
          ...last,
          h: +Math.max(last.h, p).toFixed(2),
          l: +Math.min(last.l, p).toFixed(2),
          c: p,
          v: (last.v || 0) + 1,
        };
        return [...bars.slice(0, -1), nextLast];
      }
      // Roll over cleanly into a new live candle bucket
      const gapMs = bucket - lastBucket;
      const open = gapMs <= 2 * bucketMs ? last.c : p;
      const nextBar: CandleBar = {
        t: bucket,
        o: +open.toFixed(2),
        h: +Math.max(open, p).toFixed(2),
        l: +Math.min(open, p).toFixed(2),
        c: p,
        v: 1,
      };
      return [...bars, nextBar].slice(-maxLen);
    },
    []
  );

  const mergeCandleSeries = useCallback(
    (prevBars: CandleBar[], incomingBars: CandleBar[], maxLen: number): CandleBar[] => {
      if (!incomingBars.length) return prevBars;
      if (!prevBars.length) return incomingBars.slice(-maxLen);
      const lastIncomingT = incomingBars[incomingBars.length - 1].t;
      const newerLive = prevBars.filter((b) => b.t > lastIncomingT);
      if (!newerLive.length) return incomingBars.slice(-maxLen);
      return [...incomingBars, ...newerLive].slice(-maxLen);
    },
    []
  );

  const spotInFlightRef = useRef(false);
  const repoInFlightRef = useRef(false);

  const refreshSpot = useCallback(async () => {
    if (spotInFlightRef.current) return false;
    spotInFlightRef.current = true;
    try {
      const q = quotesRef.current;
      const c = candlesRef.current;
      const prevCloseG =
        (q.gold.prevClose && q.gold.prevClose !== q.gold.price ? q.gold.prevClose : null) ??
        pick24hPrevClose(c.gold, q.gold.price) ??
        null;
      const prevCloseS =
        (q.silver.prevClose && q.silver.prevClose !== q.silver.price ? q.silver.prevClose : null) ??
        pick24hPrevClose(c.silver, q.silver.price) ??
        null;

      const res = await fetchLiveSpotQuorum(prevCloseG, prevCloseS, q.gold.price);
      if (res) {
        setQuotes({ gold: res.gold, silver: res.silver });
        syncFuturesFromBasis(res.gold.price, res.silver.price, outlookRef.current);
        setMode('live');
        setLastUpdated(res.ts);
        setFeedHealth((prev) => ({ ...prev, spotAt: res.ts, spotSource: res.source }));
        setFeedTrust((prev) => ({
          ...prev,
          status: res.trustStatus,
          lastSpreadPct: res.spreadPct,
          checksCount: prev.checksCount + 1,
          lastVerifiedAt: res.ts,
          lastEventNote: res.note,
        }));
        setHistory((prev) => ({
          gold: [...prev.gold.slice(-59), { ts: res.ts, price: res.gold.price! }],
          silver: [...prev.silver.slice(-59), { ts: res.ts, price: res.silver.price! }],
        }));
        // Append/update live 1m & 5m ticker candles every 15s so the candlestick chart ticks smoothly
        if (res.gold.price != null && res.silver.price != null) {
          const gp = res.gold.price;
          const sp = res.silver.price;
          setCandles1m((prev) => ({
            gold: upsertLiveCandle(prev.gold, gp, res.ts, CANDLE_1M_MS, 240),
            silver: upsertLiveCandle(prev.silver, sp, res.ts, CANDLE_1M_MS, 240),
          }));
          setCandles((prev) => ({
            gold: upsertLiveCandle(prev.gold, gp, res.ts, CANDLE_INTERVAL_MS, 288),
            silver: upsertLiveCandle(prev.silver, sp, res.ts, CANDLE_INTERVAL_MS, 288),
          }));
        }
        evaluateAlerts(res.gold, res.silver);
        return true;
      }
      return false;
    } finally {
      spotInFlightRef.current = false;
    }
  }, [evaluateAlerts, pick24hPrevClose, syncFuturesFromBasis, upsertLiveCandle]);

  const refreshRepoAndMacro = useCallback(async () => {
    if (repoInFlightRef.current) return;
    repoInFlightRef.current = true;
    try {
      const [bundle, liveFx] = await Promise.all([fetchAllRepoData(), fetchLiveFxRates()]);
      const now = Date.now();
      if (liveFx) {
        setFxRates((prev) => {
          const changed = (Object.keys(liveFx) as CurrencyCode[]).some((k) => prev[k] !== liveFx[k]);
          return changed ? liveFx : prev;
        });
      }
      if (bundle.outlook) setOutlook(bundle.outlook);
      if (bundle.shanghai) setShanghai(bundle.shanghai);
      if (bundle.comex) setComex(bundle.comex);
      if (bundle.accuracyLog) setAccuracyLog(bundle.accuracyLog);
      if (Object.keys(bundle.timeframes).length) setTimeframes(bundle.timeframes);
      // Merge incoming 10m repo candles without ever wiping out newer 15s live bars
      if (bundle.candles.gold.length || bundle.candles.silver.length) {
        setCandles((prev) => ({
          gold: mergeCandleSeries(prev.gold, bundle.candles.gold, 288),
          silver: mergeCandleSeries(prev.silver, bundle.candles.silver, 288),
        }));
      }
      if (bundle.candles1m.gold.length || bundle.candles1m.silver.length) {
        setCandles1m((prev) => ({
          gold: mergeCandleSeries(prev.gold, bundle.candles1m.gold, 240),
          silver: mergeCandleSeries(prev.silver, bundle.candles1m.silver, 240),
        }));
      }

      // Seed spot prices from outlook.json / candles if live spot hasn't landed yet
      const oGold = Number(bundle.outlook?.gold?.spot) || bundle.candles.gold[bundle.candles.gold.length - 1]?.c;
      const oSilver = Number(bundle.outlook?.silver?.spot) || bundle.candles.silver[bundle.candles.silver.length - 1]?.c;
      if (oGold && oSilver) {
        setQuotes((prev) => {
          if (prev.gold.price != null && prev.silver.price != null) return prev;
          const gPrev = pick24hPrevClose(bundle.candles.gold, oGold) || oGold;
          const sPrev = pick24hPrevClose(bundle.candles.silver, oSilver) || oSilver;
          return {
            gold: {
              price: +oGold.toFixed(2),
              prevClose: +gPrev.toFixed(2),
              chg: +(oGold - gPrev).toFixed(2),
              pct: gPrev > 0 ? +(((oGold - gPrev) / gPrev) * 100).toFixed(2) : 0,
            },
            silver: {
              price: +oSilver.toFixed(2),
              prevClose: +sPrev.toFixed(2),
              chg: +(oSilver - sPrev).toFixed(2),
              pct: sPrev > 0 ? +(((oSilver - sPrev) / sPrev) * 100).toFixed(2) : 0,
            },
          };
        });
      }

      syncFuturesFromBasis(
        quotesRef.current.gold.price ?? oGold ?? null,
        quotesRef.current.silver.price ?? oSilver ?? null,
        bundle.outlook
      );

      setFeedHealth((prev) => ({
        ...prev,
        outlookAt: bundle.outlook ? now : prev.outlookAt,
        sgeAt: bundle.shanghai ? now : prev.sgeAt,
        comexAt: bundle.comex ? now : prev.comexAt,
        comexLive: Boolean(bundle.comex?.liveFetched),
        futuresAt: now,
      }));

      const sw = await fetchLiveNoaaSpaceWeather(bundle.outlook?.spaceWeather);
      setSpaceWeather(sw);
    } finally {
      repoInFlightRef.current = false;
    }
  }, [mergeCandleSeries, pick24hPrevClose, syncFuturesFromBasis]);

  const refreshSpotRef = useRef(refreshSpot);
  refreshSpotRef.current = refreshSpot;
  const refreshRepoRef = useRef(refreshRepoAndMacro);
  refreshRepoRef.current = refreshRepoAndMacro;

  const refreshNow = useCallback(async () => {
    await Promise.all([refreshRepoRef.current(), refreshSpotRef.current()]);
  }, []);

  // Initial load + visibility-aware polling (strictly mount-once [] so timers NEVER tear down or loop!)
  useEffect(() => {
    let active = true;
    const boot = async () => {
      await refreshRepoRef.current();
      if (!active) return;
      const gotLive = await refreshSpotRef.current();
      if (active && !gotLive) {
        setMode((prev) => (prev === 'connecting' ? 'demo' : prev));
        setFeedTrust((prev) =>
          prev.status === 'connecting'
            ? {
                ...prev,
                status: 'demo',
                lastEventNote: 'Using synced 10m repo snapshot — retrying live 15s feed automatically',
              }
            : prev
        );
      }
    };
    void boot();

    // Live ticker & candlestick chart poll strictly every 15 seconds (REFRESH_MS)
    const spotTimer = setInterval(() => {
      if (!document.hidden) void refreshSpotRef.current();
    }, REFRESH_MS);

    // Rest of application (news, outlook, COMEX, Shanghai, FX, NOAA) refreshes strictly every 10 minutes (SLOW_REFRESH_MS)
    let lastSlowRefresh = Date.now();
    const slowTimer = setInterval(() => {
      if (!document.hidden) {
        lastSlowRefresh = Date.now();
        void refreshRepoRef.current();
      }
    }, SLOW_REFRESH_MS);

    const onVis = () => {
      if (!document.hidden) {
        void refreshSpotRef.current();
        if (Date.now() - lastSlowRefresh >= SLOW_REFRESH_MS) {
          lastSlowRefresh = Date.now();
          void refreshRepoRef.current();
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      active = false;
      clearInterval(spotTimer);
      clearInterval(slowTimer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Stack calculations (combining base fields + lot ledger)
  const stackSummary = useMemo<StackSummary>(() => {
    const gSpot = quotes.gold.price ?? 0;
    const sSpot = quotes.silver.price ?? 0;

    let goldOz = parseFloat(settings.stack.goldOz) || 0;
    let silverOz = parseFloat(settings.stack.silverOz) || 0;
    let goldCostTotal = goldOz * (parseFloat(settings.stack.goldCost) || 0);
    let silverCostTotal = silverOz * (parseFloat(settings.stack.silverCost) || 0);

    if (settings.stackLots.length > 0) {
      goldOz = 0;
      silverOz = 0;
      goldCostTotal = 0;
      silverCostTotal = 0;
      for (const lot of settings.stackLots) {
        if (lot.metal === 'gold') {
          goldOz += lot.oz;
          goldCostTotal += lot.oz * lot.cost;
        } else {
          silverOz += lot.oz;
          silverCostTotal += lot.oz * lot.cost;
        }
      }
    }

    const goldMeltUsd = goldOz * gSpot;
    const silverMeltUsd = silverOz * sSpot;
    const totalMeltUsd = goldMeltUsd + silverMeltUsd;
    const totalCostUsd = goldCostTotal + silverCostTotal;
    const totalPnlUsd = totalCostUsd > 0 ? totalMeltUsd - totalCostUsd : 0;
    const totalPnlPct = totalCostUsd > 0 ? (totalPnlUsd / totalCostUsd) * 100 : 0;
    const netLiquidationUsd =
      goldMeltUsd * (1 + settings.stack.goldSpreadPct / 100) +
      silverMeltUsd * (1 + settings.stack.silverSpreadPct / 100);

    return {
      goldOz,
      silverOz,
      goldCostAvg: goldOz > 0 ? goldCostTotal / goldOz : 0,
      silverCostAvg: silverOz > 0 ? silverCostTotal / silverOz : 0,
      goldMeltUsd,
      silverMeltUsd,
      totalMeltUsd,
      totalCostUsd,
      totalPnlUsd,
      totalPnlPct,
      netLiquidationUsd,
      hasHoldings: goldOz > 0 || silverOz > 0,
    };
  }, [quotes.gold.price, quotes.silver.price, settings.stack, settings.stackLots]);

  // Full Quantitative Suite (single source of truth shared with monitor/*.mjs)
  const quant = useMemo<FullQuantModelOutput>(
    () =>
      computeFullQuantSuite({
        metal: settings.selectedMetal,
        timeframe: settings.chartTimeframe,
        goldQuote: quotes.gold,
        silverQuote: quotes.silver,
        outlook,
        shanghai,
        comex,
        timeframes,
        candles,
        spaceWeather,
        dealerQuotes: settings.dealerQuotes,
        fxRates,
        aiSimDelta,
        whisperCpi,
        whisperFed,
        whisperScenarioId,
      }),
    [
      settings.selectedMetal,
      settings.chartTimeframe,
      settings.dealerQuotes,
      quotes.gold,
      quotes.silver,
      outlook,
      shanghai,
      comex,
      timeframes,
      candles,
      spaceWeather,
      fxRates,
      aiSimDelta,
      whisperCpi,
      whisperFed,
      whisperScenarioId,
    ]
  );

  const sendTestNtfy = useCallback(async () => {
    const res = await publishToNtfy({
      topic: settings.ntfyTopic,
      title: 'Bullion Pulse — Test Push Verified',
      message: `Gold ${formatMoney(quotes.gold.price, 2, settings.currency, fxRates)} · Silver ${formatMoney(quotes.silver.price, 2, settings.currency, fxRates)}`,
      priority: 3,
      tags: ['white_check_mark'],
    });
    if (res.ok) {
      showToast('📱 Test notification sent to ntfy!');
    } else {
      showToast(`⚠️ ${res.error || 'Push failed'}`);
    }
    return res;
  }, [fxRates, quotes.gold.price, quotes.silver.price, settings.currency, settings.ntfyTopic, showToast]);

  const addStackLot = useCallback(
    (lot: Omit<StackLot, 'id'>) => {
      const id = `lot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      updateSettings((prev) => ({
        ...prev,
        stackLots: [
          {
            ...lot,
            id,
            form: sanitizeShortText(lot.form || 'Bullion', 60) || 'Bullion',
            note: sanitizeShortText(lot.note || '', 120),
            date: sanitizeShortText(lot.date || todayKey(), 24),
          },
          ...prev.stackLots,
        ].slice(0, 100),
      }));
      showToast('✓ Purchase lot added to your stack');
    },
    [showToast, updateSettings]
  );

  const deleteStackLot = useCallback(
    (id: string) => {
      updateSettings((prev) => ({
        ...prev,
        stackLots: prev.stackLots.filter((l) => l.id !== id),
      }));
      showToast('Removed purchase lot');
    },
    [showToast, updateSettings]
  );

  const addForecastEntry = useCallback(
    (metal: MetalKey, userDir: 'up' | 'down') => {
      const price = metal === 'gold' ? quotes.gold.price : quotes.silver.price;
      if (!price || price <= 0) return;
      const aiScore = Number(outlook?.[metal]?.score ?? 0);
      const aiDir: ForecastJournalEntry['aiDir'] =
        aiScore > 0.08 ? 'up' : aiScore < -0.08 ? 'down' : 'neutral';
      const entry: ForecastJournalEntry = {
        id: `fj_${Date.now()}`,
        date: todayKey(),
        metal,
        userDir,
        aiDir,
        entryPrice: +price.toFixed(2),
        settledPrice: null,
        settledAt: '',
      };
      updateSettings((prev) => ({
        ...prev,
        forecastJournal: [entry, ...prev.forecastJournal].slice(0, 60),
      }));
      showToast(`✓ Logged ${metal.toUpperCase()} ${userDir.toUpperCase()} call`);
    },
    [outlook, quotes.gold.price, quotes.silver.price, showToast, updateSettings]
  );

  const settleForecastEntry = useCallback(
    (id: string) => {
      updateSettings((prev) => ({
        ...prev,
        forecastJournal: prev.forecastJournal.map((item) => {
          if (item.id !== id) return item;
          const liveP = item.metal === 'gold' ? quotes.gold.price : quotes.silver.price;
          if (!liveP) return item;
          return { ...item, settledPrice: +liveP.toFixed(2), settledAt: todayKey() };
        }),
      }));
      showToast('✓ Settled forecast call against live spot');
    },
    [quotes.gold.price, quotes.silver.price, showToast, updateSettings]
  );

  const exportBackup = useCallback(() => {
    const json = buildBackupJson(settings, alertLog);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bullion-pulse-backup-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast('💾 Backup exported (ntfy channel redacted)');
  }, [alertLog, settings, showToast]);

  const importBackup = useCallback(
    (rawText: string) => {
      const parsed = parseBackupJson(rawText, settings.ntfyTopic);
      if (!parsed) {
        showToast('⚠️ Invalid or oversized backup file');
        return false;
      }
      setSettings(parsed.settings);
      setAlertLog(parsed.alertLog);
      showToast('✓ Backup restored safely');
      return true;
    },
    [settings.ntfyTopic, showToast]
  );

  const clearAlertLog = useCallback(() => {
    setAlertLog([]);
    showToast('Alert log cleared');
  }, [showToast]);

  const dismissBanner = useCallback(() => {
    setAlertBanner((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleLanguageChange = useCallback(
    (lang: AppSettings['language']) => {
      updateSettings({ language: lang });
    },
    [updateSettings]
  );

  const ctxValue: BullionContextValue = {
    settings,
    updateSettings,
    activeView,
    lastMainView,
    setActiveView,
    setSubView,
    resolvedDeskLayout,
    setDeskLayout,
    quotes,
    futures,
    fxRates,
    outlook,
    shanghai,
    comex,
    accuracyLog,
    timeframes,
    candles,
    candles1m,
    spaceWeather,
    feedHealth,
    feedTrust,
    mode,
    lastUpdated,
    alertLog,
    alertBanner,
    dismissBanner,
    toastMsg,
    showToast,
    cycleTheme,
    selectTheme,
    togglePrivacyMode,
    refreshNow,
    sendTestNtfy,
    stackSummary,
    addStackLot,
    deleteStackLot,
    addForecastEntry,
    settleForecastEntry,
    exportBackup,
    importBackup,
    clearAlertLog,
    quant,
    aiSimDelta,
    setAiSimDelta,
    whisperCpi,
    setWhisperCpi,
    whisperFed,
    setWhisperFed,
    whisperScenarioId,
    setWhisperScenarioId,
    isLightTheme,
  };

  return (
    <I18nProvider lang={settings.language} onLanguageChange={handleLanguageChange}>
      <BullionContext.Provider value={ctxValue}>{children}</BullionContext.Provider>
    </I18nProvider>
  );
};

export function useBullion(): BullionContextValue {
  const ctx = useContext(BullionContext);
  if (!ctx) throw new Error('useBullion must be used inside BullionProvider');
  return ctx;
}
