import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartMode, TimeframeKey } from '../../types/bullion';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { convertUnit, formatMoney, MIN_ZOOM_BARS } from '../../utils/format';
import { buildRatioBars, renderCandlestickChart, type ChartGeometry } from '../../engines/chartEngine';

const TIMEFRAME_BUTTONS: readonly { id: TimeframeKey; label: string }[] = [
  { id: '15min', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
  { id: '7d', label: '7D' },
  { id: '1m', label: '1M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
  { id: '5y', label: '5Y' },
  { id: '10y', label: '10Y' },
  { id: 'all', label: 'ALL' },
];

export const CandlestickChart: React.FC = () => {
  const {
    settings,
    updateSettings,
    quotes,
    fxRates,
    timeframes,
    candles,
    candles1m,
    outlook,
    quant,
    isLightTheme,
  } = useBullion();
  const { t } = useI18n();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rsiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const geomRef = useRef<ChartGeometry | null>(null);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [zoomStart, setZoomStart] = useState<number | null>(null);
  const [zoomCount, setZoomCount] = useState<number | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [replayStep, setReplayStep] = useState<number | null>(null);

  const mode = settings.chartMode;
  const tf = settings.chartTimeframe;

  const activeBars = useMemo(() => {
    const getSeries = (m: 'gold' | 'silver') => {
      if (tf === '15min') return (candles1m[m].length >= 15 ? candles1m[m].slice(-15) : candles[m].slice(-15));
      if (tf === '1h') return (candles1m[m].length >= 60 ? candles1m[m].slice(-60) : candles[m].slice(-24));
      if (tf === '4h') return candles[m].slice(-48);
      if (tf === '1d') return candles[m].length ? candles[m] : timeframes['1d']?.[m] || [];
      return timeframes[tf]?.[m] || candles[m] || [];
    };
    if (mode === 'ratio') {
      return buildRatioBars(getSeries('gold'), getSeries('silver'));
    }
    return getSeries(mode);
  }, [candles, candles1m, mode, tf, timeframes]);

  // Reset zoom when switching mode or timeframe
  useEffect(() => {
    setZoomStart(null);
    setZoomCount(null);
    setHoverIdx(null);
    setReplaying(false);
    setReplayStep(null);
  }, [mode, tf]);

  // Replay animation loop
  useEffect(() => {
    if (!replaying || activeBars.length < 10) return;
    let cur = Math.max(8, Math.floor(activeBars.length * 0.35));
    setReplayStep(cur);
    const id = setInterval(() => {
      cur += 1;
      if (cur >= activeBars.length) {
        setReplaying(false);
        setReplayStep(null);
        clearInterval(id);
      } else {
        setReplayStep(cur);
      }
    }, 110);
    return () => clearInterval(id);
  }, [activeBars.length, replaying]);

  const livePrice = useMemo(() => {
    if (mode === 'ratio') {
      return quotes.gold.price && quotes.silver.price ? quotes.gold.price / quotes.silver.price : null;
    }
    return quotes[mode].price;
  }, [mode, quotes]);

  const barsToDraw = useMemo(() => {
    const base = replayStep != null && replayStep > 0 ? activeBars.slice(0, replayStep) : activeBars;
    // Sync newest bar close/high/low with live spot (when not replaying) so chart & live line stay seamless
    if (replayStep == null && base.length > 0 && livePrice != null && Number.isFinite(livePrice) && livePrice > 0) {
      const cloned = base.map((b) => ({ ...b }));
      const last = cloned[cloned.length - 1];
      if (Math.abs(livePrice - last.c) / Math.max(1, last.c) < 0.08) {
        last.c = +livePrice.toFixed(2);
        last.h = +Math.max(last.h, livePrice).toFixed(2);
        last.l = +Math.min(last.l, livePrice).toFixed(2);
      }
      return cloned;
    }
    return base;
  }, [activeBars, livePrice, replayStep]);

  const fairValueUsd = useMemo(() => {
    if (mode === 'ratio') return null;
    const base30 = Number(outlook?.[mode]?.horizon30d?.base);
    return Number.isFinite(base30) && base30 > 0 ? base30 : null;
  }, [mode, outlook]);

  const squeezeLevelUsd = useMemo(() => {
    if (mode === 'ratio') return null;
    const res = Number(quant.setupQuality?.resistance);
    return Number.isFinite(res) && res > 0 ? res : null;
  }, [mode, quant.setupQuality]);

  // 60fps Canvas Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId = 0;
    const draw = () => {
      geomRef.current = renderCandlestickChart({
        canvas,
        rsiCanvas: settings.showRsi ? rsiCanvasRef.current : null,
        bars: barsToDraw,
        mode,
        timeframe: tf,
        unit: settings.unit,
        currency: settings.currency,
        fxRates,
        livePrice,
        hoverIdx,
        zoomStart,
        zoomCount,
        overlays: {
          showForecast: settings.showForecast,
          showDiscovery: settings.showDiscovery,
          showSqueeze: settings.showSqueeze,
          showFib: settings.showFib,
          showSma: settings.showSma,
          showRsi: settings.showRsi,
          showMyBuys: settings.showMyBuys,
          showPatterns: settings.showPatterns,
          showGaps: settings.showGaps,
          showNewsDots: settings.showNewsDots,
        },
        precisionLine: quant.precisionLine,
        fairValueUsd,
        squeezeLevelUsd,
        gaps: quant.gaps,
        lots: settings.stackLots,
        news: Array.isArray(outlook?.headlines) ? outlook.headlines : [],
        isLightTheme,
      });
    };
    rafId = requestAnimationFrame(draw);
    const onResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(draw);
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [
    barsToDraw,
    fairValueUsd,
    fxRates,
    hoverIdx,
    isLightTheme,
    livePrice,
    mode,
    outlook?.headlines,
    quant.gaps,
    quant.precisionLine,
    settings,
    squeezeLevelUsd,
    tf,
    zoomCount,
    zoomStart,
  ]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = geomRef.current;
    const canvas = canvasRef.current;
    if (!g || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rel = Math.floor((x - g.padL) / Math.max(1, g.slotW));
    if (rel >= 0 && rel < g.visibleCount) {
      setHoverIdx(rel);
    } else {
      setHoverIdx(null);
    }
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (barsToDraw.length <= MIN_ZOOM_BARS) return;
    const curCount = zoomCount ?? barsToDraw.length;
    const delta = e.deltaY > 0 ? Math.ceil(curCount * 0.15) : -Math.ceil(curCount * 0.15);
    const nextCount = Math.max(MIN_ZOOM_BARS, Math.min(barsToDraw.length, curCount + delta));
    const nextStart = Math.max(0, barsToDraw.length - nextCount);
    setZoomCount(nextCount);
    setZoomStart(nextStart);
  };

  const inspectedBar = useMemo(() => {
    const g = geomRef.current;
    if (hoverIdx == null || !g) return null;
    return barsToDraw[g.startIdx + hoverIdx] || null;
  }, [barsToDraw, hoverIdx]);

  const fmtVal = (v: number) =>
    mode === 'ratio'
      ? `${v.toFixed(2)}×`
      : formatMoney(convertUnit(v, settings.unit), mode === 'silver' ? 2 : 2, settings.currency, fxRates);

  const toggleOverlay = (
    key:
      | 'showForecast'
      | 'showDiscovery'
      | 'showSqueeze'
      | 'showFib'
      | 'showSma'
      | 'showRsi'
      | 'showMyBuys'
      | 'showPatterns'
      | 'showGaps'
      | 'showNewsDots'
  ) => {
    updateSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const overlayButtons: ReadonlyArray<{
    key:
      | 'showForecast'
      | 'showDiscovery'
      | 'showSqueeze'
      | 'showFib'
      | 'showSma'
      | 'showRsi'
      | 'showMyBuys'
      | 'showPatterns'
      | 'showGaps'
      | 'showNewsDots';
    label: string;
  }> = [
    { key: 'showForecast', label: 'Forecast' },
    { key: 'showDiscovery', label: 'Fair Value' },
    { key: 'showSqueeze', label: 'Squeeze Risk' },
    { key: 'showFib', label: 'Key Levels' },
    { key: 'showSma', label: 'Avg Trend' },
    { key: 'showRsi', label: 'Momentum' },
    { key: 'showMyBuys', label: 'My Buys' },
    { key: 'showPatterns', label: 'Patterns' },
    { key: 'showGaps', label: 'Gaps' },
    { key: 'showNewsDots', label: 'News Pins' },
  ];

  const handleModeChange = (nextMode: ChartMode) => {
    updateSettings({
      chartMode: nextMode,
      ...(nextMode === 'gold' || nextMode === 'silver' ? { selectedMetal: nextMode } : {}),
    });
  };

  return (
    <section className="panel chart-panel" id="chart-panel" aria-label="Interactive candlestick chart">
      <div className="panel-header chart-header-row">
        <div className="chart-mode-pills" role="group" aria-label="Chart instrument">
          {(['gold', 'silver', 'ratio'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`chip-toggle${mode === m ? ' active' : ''}`}
              aria-pressed={mode === m}
              onClick={() => handleModeChange(m)}
            >
              {t(m === 'gold' ? 'Gold' : m === 'silver' ? 'Silver' : 'Ratio')}
            </button>
          ))}
        </div>

        <div className="chart-tf-pills" role="group" aria-label="Chart timeframe">
          {TIMEFRAME_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              type="button"
              className={`tf-btn${tf === btn.id ? ' active' : ''}`}
              aria-pressed={tf === btn.id}
              onClick={() => updateSettings({ chartTimeframe: btn.id })}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* OHLC Inspect Strip (fixed single-line height — zero chart jump on hover) */}
      <div className="chart-ohlc-bar" aria-live="polite">
        <span className={inspectedBar ? 'chart-ohlc-text mono' : 'chart-ohlc-text'}>
          {replaying
            ? t('Replaying market highlight reel…')
            : inspectedBar
              ? `${new Date(inspectedBar.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · O ${fmtVal(inspectedBar.o)} · H ${fmtVal(inspectedBar.h)} · L ${fmtVal(inspectedBar.l)} · C ${fmtVal(inspectedBar.c)}`
              : t('Tap or drag on the chart to inspect any price bar')}
        </span>
        <div className="chart-ohlc-actions">
          {zoomCount != null && (
            <button
              type="button"
              className="chip-toggle"
              onClick={() => {
                setZoomStart(null);
                setZoomCount(null);
              }}
            >
              Reset Zoom
            </button>
          )}
          <button
            type="button"
            className={`chip-toggle${replaying ? ' active' : ''}`}
            onClick={() => {
              if (replaying) {
                setReplaying(false);
                setReplayStep(null);
              } else {
                setReplaying(true);
              }
            }}
          >
            {replaying ? t('⏹ Stop') : t('▶ Replay')}
          </button>
        </div>
      </div>

      <div className="chart-canvas-wrap">
        <canvas
          ref={canvasRef}
          id="price-chart"
          className="price-chart-canvas"
          style={{ width: '100%', height: 290, display: 'block', touchAction: 'pan-y' }}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIdx(null)}
          onWheel={handleWheelZoom}
        />
      </div>

      {settings.showRsi && (
        <div className="rsi-pane-wrap">
          <div className="rsi-pane-label">{t('Momentum (70+ Overheated · 30− Oversold)')}</div>
          <canvas
            ref={rsiCanvasRef}
            id="rsi-chart"
            style={{ width: '100%', height: 74, display: 'block' }}
          />
        </div>
      )}

      {/* All 10 Overlay Pills positioned cleanly beneath the chart */}
      <div className="chart-overlay-bar" role="group" aria-label="Chart overlays">
        {overlayButtons.map((ov) => (
          <button
            key={ov.key}
            type="button"
            className={`chip-toggle${settings[ov.key] ? ' active' : ''}`}
            aria-pressed={settings[ov.key]}
            onClick={() => toggleOverlay(ov.key)}
          >
            {t(ov.label)}
          </button>
        ))}
      </div>
    </section>
  );
};
