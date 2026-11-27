import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MetalKey, MonteCarloSummary } from '../../types/bullion';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { formatMoney, formatSignedPct } from '../../utils/format';
import { runMonteCarloAsync, runMonteCarloSync, type MonteCarloRequest } from '../../engines/monteCarlo';
import { SelfLearningReplayChart } from './SelfLearningReplayChart';

export const OddsTab: React.FC = () => {
  const {
    settings,
    quotes,
    fxRates,
    outlook,
    timeframes,
    spaceWeather,
    addForecastEntry,
    settleForecastEntry,
    isLightTheme,
    whisperCpi,
    whisperFed,
    aiSimDelta,
  } = useBullion();
  const { t } = useI18n();

  const [oddsMetal, setOddsMetal] = useState<MetalKey>(settings.selectedMetal);
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [mc, setMc] = useState<MonteCarloSummary | null>(null);
  const [hoverStep, setHoverStep] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stepXRef = useRef<number[]>([]);

  useEffect(() => {
    setOddsMetal(settings.selectedMetal);
  }, [settings.selectedMetal]);

  const goldSpot = quotes.gold.price ?? Number(outlook?.gold?.spot) ?? 3630;
  const silverSpot = quotes.silver.price ?? Number(outlook?.silver?.spot) ?? 43.5;
  const macro = outlook?.macroSnapshot || {};
  const sl = outlook?.selfLearning || {};

  // Build parameter-accurate Monte Carlo request for either Gold or Silver
  const buildReq = (m: MetalKey, pathsCount: number): MonteCarloRequest => {
    const isSilver = m === 'silver';
    const spot = isSilver ? silverSpot : goldSpot;
    const mOut = outlook?.[m] || {};
    // outlook[m].score is on -100..+100 scale -> convert to -1..+1 unitScore!
    const baseUnit = Number(mOut.score ?? 0) / 100;
    const interactiveTilt = whisperCpi * 0.06 - whisperFed * 0.08 + aiSimDelta * (isSilver ? 0.08 : 0.03);
    const unitScore = Math.max(-1, Math.min(1, baseUnit + interactiveTilt));

    const annualVolPct = isSilver
      ? Number(macro.silverVolAnnPct ?? 36)
      : Number(macro.goldVolAnnPct ?? 20);

    // Derive exact ensemble expected % move for 7D / 30D / 90D
    const exp7 = Number(mOut.horizon7d?.expectedPct ?? 0);
    const exp30 = Number(mOut.horizon30d?.expectedPct ?? 0);
    const ensembleTargetPct =
      horizonDays <= 7
        ? exp7 + interactiveTilt * 2.2
        : horizonDays <= 30
          ? exp30 + interactiveTilt * 4.5
          : exp30 * 2.1 + interactiveTilt * 8.0;

    // Use true 1-day daily closes ('1m' timeframe has 1-day bars; '6m'/'1y' are resampled weekly/bi-weekly)
    const dailyBars = timeframes['1m']?.[m] || [];
    const dailyCloses = dailyBars.length >= 10 ? dailyBars.map((b) => b.c) : [];
    const gvzRaw = Number(outlook?.institutionalSignals?.impliedVol?.gvz);
    const expandedEvents = Array.isArray(outlook?.institutionalSignals?.eventRisk?.expandedEvents)
      ? outlook.institutionalSignals.eventRisk.expandedEvents
      : Array.isArray(outlook?.institutionalSignals?.eventRisk?.upcoming)
        ? outlook.institutionalSignals.eventRisk.upcoming
        : [];

    return {
      metal: m,
      spot,
      horizonDays,
      annualVolPct,
      unitScore,
      vix: Number(macro.vix ?? 18),
      gvz: Number.isFinite(gvzRaw) && gvzRaw > 4 ? gvzRaw : null,
      dailyCloses,
      expandedEvents,
      coneMultiplier: Number(sl.coneMultiplier ?? outlook?.coneMultiplier ?? 1.0),
      lambdaMult: Number(sl.jumpCalibration?.lambdaMult ?? 1.0),
      sigmaJMult: Number(sl.jumpCalibration?.sigmaJMult ?? 1.0),
      regime: mOut.regime || null,
      rsi14: Number(isSilver ? macro.silverRsi14 : macro.goldRsi14) || null,
      spaceJumpBoost: spaceWeather.jumpBoost,
      ensembleTargetPct,
      hurst: Number(mOut.hurst ?? 0.5),
      precomputedJumpParams: Math.abs(interactiveTilt) < 0.001 ? mOut.jumpParams || null : null,
      pathsCount,
    };
  };

  // Instant side-by-side Gold & Silver real Merton Jump-Diffusion comparison (exact same 1,500-path count so top card & canvas match 100%)
  const goldQuickMc = useMemo(
    () => runMonteCarloSync(buildReq('gold', 1500)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goldSpot, horizonDays, outlook, timeframes, spaceWeather.jumpBoost, whisperCpi, whisperFed, aiSimDelta]
  );

  const silverQuickMc = useMemo(
    () => runMonteCarloSync(buildReq('silver', 1500)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [silverSpot, horizonDays, outlook, timeframes, spaceWeather.jumpBoost, whisperCpi, whisperFed, aiSimDelta]
  );

  const goldDisplayMc = oddsMetal === 'gold' && mc?.metal === 'gold' ? mc : goldQuickMc;
  const silverDisplayMc = oddsMetal === 'silver' && mc?.metal === 'silver' ? mc : silverQuickMc;

  // Full 1,500-path off-thread simulation for active metal
  useEffect(() => {
    let active = true;
    setHoverStep(null);
    setMc(oddsMetal === 'gold' ? goldQuickMc : silverQuickMc);

    void runMonteCarloAsync(buildReq(oddsMetal, 1500)).then((res) => {
      if (active) setMc(res);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oddsMetal, horizonDays, goldQuickMc, silverQuickMc]);

  // Render Jump-Diffusion Canvas with HIGHLIGHTED Most Logical Path
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mc || mc.p50.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const w = Math.max(280, Math.round(canvas.clientWidth || 620));
      const h = 232;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const padL = 12;
      const padR = 76;
      const padT = 24;
      const padB = 24;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const steps = mc.p50.length;

      const minP = Math.min(...mc.p10, ...mc.logicalPath) * 0.992;
      const maxP = Math.max(...mc.p90, ...mc.logicalPath) * 1.008;
      const xOf = (i: number) => padL + (i / Math.max(1, steps - 1)) * plotW;
      const yOf = (p: number) => padT + ((maxP - p) / Math.max(0.01, maxP - minP)) * plotH;
      stepXRef.current = Array.from({ length: steps }, (_, i) => xOf(i));

      const isBullLogical = mc.logicalEnd >= mc.spot;
      const logicalCol = isBullLogical ? '#34d399' : '#f87171';
      const logicalGlow = isBullLogical ? 'rgba(52, 211, 153, 0.28)' : 'rgba(248, 113, 113, 0.28)';
      const medianCol = oddsMetal === 'silver' ? '#cbd5e1' : '#d4a843';
      const outerBand = oddsMetal === 'silver' ? 'rgba(148, 163, 184, 0.11)' : 'rgba(212, 168, 67, 0.10)';
      const coreBand = oddsMetal === 'silver' ? 'rgba(148, 163, 184, 0.21)' : 'rgba(212, 168, 67, 0.19)';
      const gridCol = isLightTheme ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
      const textCol = isLightTheme ? '#3f3f46' : '#9ca3af';

      // Horizontal spot reference line
      const ySpot = yOf(mc.spot);
      ctx.save();
      ctx.strokeStyle = gridCol;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, ySpot);
      ctx.lineTo(w - padR, ySpot);
      ctx.stroke();
      ctx.restore();

      // 1. P10–P90 Outer 80% Probability Band
      ctx.fillStyle = outerBand;
      ctx.beginPath();
      mc.p90.forEach((v, i) => (i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v))));
      for (let i = steps - 1; i >= 0; i--) ctx.lineTo(xOf(i), yOf(mc.p10[i]));
      ctx.closePath();
      ctx.fill();

      // 2. P25–P75 Core 50% High-Density Band
      ctx.fillStyle = coreBand;
      ctx.beginPath();
      mc.p75.forEach((v, i) => (i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v))));
      for (let i = steps - 1; i >= 0; i--) ctx.lineTo(xOf(i), yOf(mc.p25[i]));
      ctx.closePath();
      ctx.fill();

      // 3. Faint stochastic jump-diffusion sample cloud
      ctx.strokeStyle = isLightTheme ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      for (const path of mc.samplePaths.slice(0, 14)) {
        if (!Array.isArray(path) || path.length !== steps) continue;
        ctx.beginPath();
        path.forEach((v, i) => (i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v))));
        ctx.stroke();
      }

      // 4. Closest realized stochastic jump path (subtle echo)
      if (mc.closestSamplePath.length === steps) {
        ctx.save();
        ctx.strokeStyle = logicalGlow;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        mc.closestSamplePath.forEach((v, i) => (i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v))));
        ctx.stroke();
        ctx.restore();
      }

      // 5. P50 Pure Median reference line (thin dashed metallic)
      ctx.save();
      ctx.strokeStyle = medianCol;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      mc.p50.forEach((v, i) => (i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v))));
      ctx.stroke();
      ctx.restore();

      // 5b. Scheduled Macro / COMEX Catalyst Event Pins (FOMC / CPI / NFP / FND jump windows)
      if (Array.isArray(mc.eventPins) && mc.eventPins.length > 0) {
        let lastPinRightX = -Infinity;
        ctx.save();
        ctx.font = '700 8.5px "JetBrains Mono", monospace';
        for (const pin of mc.eventPins) {
          const stepIdx = Math.max(1, Math.min(steps - 1, Number(pin.stepIdx) || 1));
          const px = xOf(stepIdx);
          const isHigh = pin.impact === 'high';
          ctx.strokeStyle = isHigh
            ? isLightTheme
              ? 'rgba(217, 119, 6, 0.55)'
              : 'rgba(245, 158, 11, 0.52)'
            : isLightTheme
              ? 'rgba(100, 116, 139, 0.35)'
              : 'rgba(148, 163, 184, 0.34)';
          ctx.lineWidth = isHigh ? 1.2 : 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(px, padT);
          ctx.lineTo(px, h - padB);
          ctx.stroke();

          // Top catalyst label pill (skip pill if overlapping prior pill to keep canvas spotless)
          const txt = String(pin.shortLabel || 'Event');
          const tw = Math.ceil(ctx.measureText(txt).width) + 8;
          const bx = Math.max(padL, Math.min(w - padR - tw, px - tw / 2));
          if (bx > lastPinRightX + 4) {
            ctx.setLineDash([]);
            ctx.fillStyle = isHigh
              ? isLightTheme
                ? 'rgba(217, 119, 6, 0.16)'
                : 'rgba(245, 158, 11, 0.22)'
              : isLightTheme
                ? 'rgba(100, 116, 139, 0.14)'
                : 'rgba(148, 163, 184, 0.18)';
            ctx.beginPath();
            ctx.roundRect(bx, 4, tw, 14, 3);
            ctx.fill();
            ctx.fillStyle = isHigh ? (isLightTheme ? '#b45309' : '#fbbf24') : textCol;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(txt, bx + tw / 2, 11);
            lastPinRightX = bx + tw;
          }
        }
        ctx.restore();
      }

      // 6. HIGHLIGHTED MOST LOGICAL PREDICTION PATH (luminous halo + crisp bold line + checkpoints)
      ctx.save();
      ctx.strokeStyle = logicalGlow;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      mc.logicalPath.forEach((v, i) => (i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v))));
      ctx.stroke();

      ctx.strokeStyle = logicalCol;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      mc.logicalPath.forEach((v, i) => (i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v))));
      ctx.stroke();

      // Start, Midway & Terminal dots on the Most Logical Path
      const midIdx = Math.floor((steps - 1) / 2);
      for (const ptIdx of [0, midIdx, steps - 1]) {
        const px = xOf(ptIdx);
        const py = yOf(mc.logicalPath[ptIdx]);
        ctx.fillStyle = logicalCol;
        ctx.beginPath();
        ctx.arc(px, py, ptIdx === steps - 1 ? 4.8 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isLightTheme ? '#ffffff' : '#0d0e11';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.restore();

      // Hover vertical guide
      if (hoverStep != null && hoverStep >= 0 && hoverStep < steps) {
        const hx = xOf(hoverStep);
        ctx.save();
        ctx.strokeStyle = logicalCol;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(hx, padT);
        ctx.lineTo(hx, h - padB);
        ctx.stroke();
        ctx.restore();
      }

      // 7. Right-axis labels (P90, Highlighted Most Logical Pill, P10)
      const dec = oddsMetal === 'silver' ? 2 : 0;
      ctx.font = '500 9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = textCol;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`P90 ${formatMoney(mc.p90End, dec, settings.currency, fxRates)}`, w - padR + 4, yOf(mc.p90End));
      ctx.fillText(`P10 ${formatMoney(mc.p10End, dec, settings.currency, fxRates)}`, w - padR + 4, yOf(mc.p10End));

      // Highlighted Logical Target Pill on right Y-axis
      const logY = Math.max(padT + 10, Math.min(h - padB - 10, yOf(mc.logicalEnd)));
      const pillX = w - padR + 2;
      const pillW = padR - 4;
      const pillH = 18;
      ctx.save();
      ctx.fillStyle = logicalCol;
      ctx.beginPath();
      ctx.roundRect(pillX, logY - pillH / 2, pillW, pillH, 4);
      ctx.fill();
      ctx.fillStyle = '#0d0e11';
      ctx.font = '700 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(formatMoney(mc.logicalEnd, dec, settings.currency, fxRates), pillX + pillW / 2, logY + 0.5);
      ctx.restore();

      // Bottom time axis (Now, Midpoint, Horizon End)
      ctx.font = '500 9.5px "JetBrains Mono", monospace';
      ctx.fillStyle = textCol;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      ctx.fillText('Today', padL, h - 4);
      ctx.textAlign = 'center';
      ctx.fillText(`Day ${Math.round(mc.horizonDays / 2)}`, xOf(midIdx), h - 4);
      ctx.textAlign = 'right';
      ctx.fillText(`Day ${mc.horizonDays}`, w - padR, h - 4);
    };

    const raf = requestAnimationFrame(draw);
    window.addEventListener('resize', draw, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', draw);
    };
  }, [fxRates, hoverStep, isLightTheme, mc, oddsMetal, settings.currency]);

  const handleMcHover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const xs = stepXRef.current;
    if (!canvas || !xs.length) return;
    const rect = canvas.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - relX);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    setHoverStep(bestI);
  };

  const dec = oddsMetal === 'silver' ? 2 : 0;
  const hovDay =
    mc && hoverStep != null
      ? Math.round((hoverStep / Math.max(1, mc.p50.length - 1)) * mc.horizonDays)
      : null;
  const hovEvent =
    mc && hoverStep != null && Array.isArray(mc.eventPins)
      ? mc.eventPins.find((p) => p.stepIdx === hoverStep) || null
      : null;

  return (
    <div className="sub-tab-stack">
      {/* 1. Merton Jump-Diffusion Monte Carlo Simulator — BOTH Gold & Silver + Highlighted Most Logical Path */}
      <section className="panel" aria-label="Monte Carlo Jump-Diffusion Odds">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 className="panel-title">
              {`${t('Merton Jump-Diffusion Odds')} · ${t(oddsMetal === 'gold' ? 'Gold' : 'Silver')}`}
            </h2>
            <p className="panel-subtitle">
              {t('1,500 stochastic jump-diffusion paths highlighting the highest-probability Most Logical Path inside P25–P75')}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Monte Carlo metal">
              <button
                type="button"
                id="mc-metal-gold"
                className={`chip-toggle${oddsMetal === 'gold' ? ' active' : ''}`}
                onClick={() => setOddsMetal('gold')}
              >
                {t('Gold')}
              </button>
              <button
                type="button"
                id="mc-metal-silver"
                className={`chip-toggle${oddsMetal === 'silver' ? ' active' : ''}`}
                onClick={() => setOddsMetal('silver')}
              >
                {t('Silver')}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="Monte Carlo horizon">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`chip-toggle${horizonDays === d ? ' active' : ''}`}
                  onClick={() => setHorizonDays(d)}
                >
                  {`${d}D`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Side-by-Side Gold & Silver At-a-Glance Comparison Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            className="stat-box"
            onClick={() => setOddsMetal('gold')}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              color: 'var(--text)',
              borderColor: oddsMetal === 'gold' ? 'var(--gold, #d4a843)' : undefined,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12.5, color: 'var(--gold, #d4a843)' }}>{`Gold (XAU) · ${horizonDays}D Odds`}</strong>
              <span className={`badge-pill ${goldDisplayMc.probUp >= 50 ? 'bullish' : 'bearish'} mono`}>{`${goldDisplayMc.probUp}% Up`}</span>
            </div>
            <div className="mono" style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>
              {`Logical ${formatMoney(goldDisplayMc.logicalEnd, 0, settings.currency, fxRates)} (${formatSignedPct(goldDisplayMc.logicalMovePct, 2)})`}
            </div>
            <div className="panel-subtitle mono" style={{ marginTop: 2 }}>
              {`+5% Touch: ${goldDisplayMc.probPlus5}% · −5% Touch: ${goldDisplayMc.probMinus5}% · Vol ${goldDisplayMc.annualVolPct}%`}
            </div>
          </button>

          <button
            type="button"
            className="stat-box"
            onClick={() => setOddsMetal('silver')}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              color: 'var(--text)',
              borderColor: oddsMetal === 'silver' ? '#cbd5e1' : undefined,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12.5, color: '#cbd5e1' }}>{`Silver (XAG) · ${horizonDays}D Odds`}</strong>
              <span className={`badge-pill ${silverDisplayMc.probUp >= 50 ? 'bullish' : 'bearish'} mono`}>{`${silverDisplayMc.probUp}% Up`}</span>
            </div>
            <div className="mono" style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>
              {`Logical ${formatMoney(silverDisplayMc.logicalEnd, 2, settings.currency, fxRates)} (${formatSignedPct(silverDisplayMc.logicalMovePct, 2)})`}
            </div>
            <div className="panel-subtitle mono" style={{ marginTop: 2 }}>
              {`+5% Touch: ${silverDisplayMc.probPlus5}% · −5% Touch: ${silverDisplayMc.probMinus5}% · Vol ${silverDisplayMc.annualVolPct}%`}
            </div>
          </button>
        </div>

        {/* Fixed single-line interactive hover strip (deltaY = 0) */}
        <div className="chart-ohlc-bar" style={{ marginTop: 0, marginBottom: 6 }} aria-live="polite">
          <span className="chart-ohlc-text mono" id="mc-hover-readout">
            {mc && hoverStep != null && hovDay != null
              ? `Day ${hovDay}${hovEvent ? ` ⚡ ${hovEvent.shortLabel}` : ''} · Logical ${formatMoney(mc.logicalPath[hoverStep], dec, settings.currency, fxRates)} · Median ${formatMoney(mc.p50[hoverStep], dec, settings.currency, fxRates)} · Core ${formatMoney(mc.p25[hoverStep], dec, settings.currency, fxRates)}–${formatMoney(mc.p75[hoverStep], dec, settings.currency, fxRates)}`
              : mc
                ? `Most Logical Path: ${formatMoney(mc.spot, dec, settings.currency, fxRates)} → ${formatMoney(mc.logicalEnd, dec, settings.currency, fxRates)} (${formatSignedPct(mc.logicalMovePct, 2)})${mc.eventPins?.length ? ` · ${mc.eventPins.length} Catalyst Pin${mc.eventPins.length > 1 ? 's' : ''}` : ''} · Hover to inspect`
                : 'Calculating 1,500 jump-diffusion paths…'}
          </span>
          {mc && (
            <span className={`badge-pill ${mc.logicalMovePct >= 0 ? 'bullish' : 'bearish'}`} style={{ flexShrink: 0 }}>
              {mc.volRegime ? `${mc.jumpRegime} · ${mc.volRegime}` : mc.jumpRegime}
            </span>
          )}
        </div>

        <canvas
          ref={canvasRef}
          id="mc-canvas"
          style={{ width: '100%', height: 232, display: 'block', touchAction: 'pan-y', marginBottom: 10 }}
          onPointerMove={handleMcHover}
          onPointerDown={handleMcHover}
          onPointerLeave={() => setHoverStep(null)}
        />

        {/* Legend + Highlighted Most Logical Path Explanation Callout */}
        {mc && (
          <>
            <div
              className="stat-box"
              id="mc-logical-callout"
              style={{
                marginBottom: 12,
                borderColor: mc.logicalMovePct >= 0 ? 'rgba(52, 211, 153, 0.45)' : 'rgba(248, 113, 113, 0.45)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 12.5, color: mc.logicalMovePct >= 0 ? '#34d399' : '#f87171' }}>
                  {`★ Highlighted Most Logical Path (${horizonDays}D): ${formatMoney(mc.logicalEnd, 2, settings.currency, fxRates)} (${formatSignedPct(mc.logicalMovePct, 2)})`}
                </strong>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {`Core 50% Band: ${formatMoney(mc.p25End, dec, settings.currency, fxRates)} – ${formatMoney(mc.p75End, dec, settings.currency, fxRates)}`}
                </span>
              </div>
              <p className="panel-subtitle" style={{ marginTop: 4, lineHeight: 1.45 }}>
                {mc.logicalReason}
              </p>
            </div>

            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-label">{t('Odds Higher')}</div>
                <div className="stat-value mono" style={{ color: mc.probUp >= 50 ? 'var(--up)' : 'var(--down)' }}>
                  {`${mc.probUp}%`}
                </div>
                <div className="panel-subtitle">{`${mc.pathsCount.toLocaleString()} paths`}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">{t('Odds +5% Rally')}</div>
                <div className="stat-value mono" style={{ color: 'var(--up)' }}>{`${mc.probPlus5}%`}</div>
                <div className="panel-subtitle">
                  {mc.milestones?.upside
                    ? `Touch ${formatMoney(mc.milestones.upside.target, dec, settings.currency, fxRates)}: ${mc.milestones.upside.touchPct}%`
                    : 'Anytime touch'}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-label">{t('Odds -5% Pullback')}</div>
                <div className="stat-value mono" style={{ color: 'var(--down)' }}>{`${mc.probMinus5}%`}</div>
                <div className="panel-subtitle">
                  {mc.milestones?.downside
                    ? `Touch ${formatMoney(mc.milestones.downside.target, dec, settings.currency, fxRates)}: ${mc.milestones.downside.touchPct}%`
                    : 'Anytime touch'}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-label">{t('Median Target (P50)')}</div>
                <div className="stat-value mono">
                  {formatMoney(mc.medianEnd, 2, settings.currency, fxRates)}
                </div>
                <div className="panel-subtitle mono">
                  {`P10–P90: ${formatMoney(mc.p10End, dec, settings.currency, fxRates)}–${formatMoney(mc.p90End, dec, settings.currency, fxRates)}`}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* 2. Daily Self-Learning Engine & Interactive Predicted vs Actual Replay Chart */}
      <SelfLearningReplayChart />

      {/* 3. Personal Forecast Journal — Log BOTH Gold & Silver */}
      <section className="panel" aria-label="Personal Forecast Journal">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 className="panel-title">{t('Personal Forecast Journal (You vs. AI)')}</h2>
            <p className="panel-subtitle">
              {t('Log your directional call at live spot for Gold or Silver and grade your win rate against the quant model')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="chip-toggle" onClick={() => addForecastEntry('gold', 'up')}>
              📈 Gold UP
            </button>
            <button type="button" className="chip-toggle" onClick={() => addForecastEntry('gold', 'down')}>
              📉 Gold DOWN
            </button>
            <button type="button" className="chip-toggle" onClick={() => addForecastEntry('silver', 'up')}>
              📈 Silver UP
            </button>
            <button type="button" className="chip-toggle" onClick={() => addForecastEntry('silver', 'down')}>
              📉 Silver DOWN
            </button>
          </div>
        </div>

        {settings.forecastJournal.length === 0 ? (
          <p className="panel-note">{t('No personal calls logged yet. Click Gold or Silver UP/DOWN above to start tracking.')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {settings.forecastJournal.slice(0, 8).map((entry) => {
              const liveP = entry.metal === 'gold' ? quotes.gold.price : quotes.silver.price;
              const refP = entry.settledPrice ?? liveP ?? entry.entryPrice;
              const movePct = entry.entryPrice > 0 ? ((refP - entry.entryPrice) / entry.entryPrice) * 100 : 0;
              const won = (entry.userDir === 'up' && movePct >= 0) || (entry.userDir === 'down' && movePct < 0);
              return (
                <div
                  key={entry.id}
                  className="stat-box"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                >
                  <div>
                    <strong>{`${entry.date} · ${entry.metal.toUpperCase()} ${entry.userDir.toUpperCase()} (AI: ${entry.aiDir.toUpperCase()})`}</strong>
                    <div className="panel-subtitle mono">
                      {`Entry ${formatMoney(entry.entryPrice, 2, settings.currency, fxRates)} → ${formatSignedPct(movePct, 2)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className={`badge-pill ${won ? 'bullish' : 'bearish'}`}>
                      {entry.settledPrice != null ? (won ? 'RIGHT' : 'WRONG') : 'OPEN'}
                    </span>
                    {entry.settledPrice == null && (
                      <button
                        type="button"
                        className="chip-toggle"
                        onClick={() => settleForecastEntry(entry.id)}
                      >
                        Settle
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
