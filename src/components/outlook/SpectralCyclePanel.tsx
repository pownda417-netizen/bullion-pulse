import React, { useEffect, useRef, useState } from 'react';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { convertUnit, formatMoney, formatSignedPct } from '../../utils/format';

type SpectralView = 'wave' | 'psd';

interface DominantCycle {
  rank: number;
  period: number;
  marketLabel: string;
  ampPct: number;
  powerSharePct: number;
  snr: number;
  phaseDeg: number;
  phaseLabel: string;
  direction: string;
  daysToPeak: number;
  daysToTrough: number;
}

interface HistPoint {
  offset: number;
  actualPct: number;
  fitPct: number;
}

interface ProjPoint {
  step: number;
  dayApprox: number;
  cyclePct: number;
  deltaCyclePct: number;
  price: number;
}

interface PsdBin {
  period: number;
  powerNorm: number;
  isPeak: boolean;
}

export const SpectralCyclePanel: React.FC = () => {
  const { settings, fxRates, quant, isLightTheme } = useBullion();
  const { t } = useI18n();

  const [view, setView] = useState<SpectralView>('wave');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const xCoordsRef = useRef<number[]>([]);

  const metal = settings.selectedMetal;
  const spec = quant.spectral;

  useEffect(() => {
    setHoverIdx(null);
  }, [metal, view]);

  const hist: HistPoint[] = Array.isArray(spec?.historicalWave) ? spec.historicalWave : [];
  const proj: ProjPoint[] = Array.isArray(spec?.projectionWave) ? spec.projectionWave : [];
  const spectrum: PsdBin[] = Array.isArray(spec?.spectrum) ? spec.spectrum : [];
  const cycles: DominantCycle[] = Array.isArray(spec?.dominantCycles) ? spec.dominantCycles : [];
  const primary = cycles[0] || null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spec?.available) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const w = Math.max(260, Math.round(canvas.clientWidth || 620));
      const h = 200;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const metalCol = metal === 'silver' ? '#cbd5e1' : '#d4a843';
      const metalGlow = metal === 'silver' ? 'rgba(203,213,225,0.22)' : 'rgba(212,168,67,0.24)';
      const isBullProj = Number(spec.expected30dPct ?? 0) >= 0;
      const projCol = isBullProj ? '#34d399' : '#f87171';
      const projGlow = isBullProj ? 'rgba(52,211,153,0.26)' : 'rgba(248,113,113,0.26)';
      const mutedCol = isLightTheme ? '#52525b' : '#9ca3af';
      const gridCol = isLightTheme ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

      const padL = 10;
      const padR = 48;
      const padT = 20;
      const padB = 22;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;

      if (view === 'wave' && hist.length >= 2 && proj.length >= 2) {
        // Combine historical points (0..hist.length-1) + future steps (proj[1..end])
        const totalPts = hist.length + Math.max(0, proj.length - 1);
        const allVals = [
          ...hist.flatMap((p) => [p.actualPct, p.fitPct]),
          ...proj.map((p) => p.cyclePct),
          0,
        ];
        let minV = Math.min(...allVals);
        let maxV = Math.max(...allVals);
        const span = Math.max(1.5, maxV - minV);
        minV -= span * 0.16;
        maxV += span * 0.18;

        const xOf = (idx: number) => padL + (idx / Math.max(1, totalPts - 1)) * plotW;
        const yOf = (v: number) => padT + (1 - (v - minV) / (maxV - minV)) * plotH;
        xCoordsRef.current = Array.from({ length: totalPts }, (_, i) => xOf(i));

        const splitIdx = hist.length - 1;
        const splitX = xOf(splitIdx);

        // Forecast zone subtle tint
        ctx.fillStyle = isBullProj
          ? isLightTheme
            ? 'rgba(34,197,94,0.06)'
            : 'rgba(52,211,153,0.05)'
          : isLightTheme
            ? 'rgba(239,68,68,0.06)'
            : 'rgba(248,113,113,0.05)';
        ctx.fillRect(splitX, padT, w - padR - splitX, plotH);

        // Horizontal grid & 0% trend baseline
        ctx.font = '500 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        [maxV, 0, minV].forEach((val, i) => {
          const y = yOf(val);
          ctx.save();
          ctx.strokeStyle =
            i === 1 ? (isLightTheme ? 'rgba(15,23,42,0.26)' : 'rgba(255,255,255,0.22)') : gridCol;
          if (i === 1) ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(padL + plotW, y);
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = mutedCol;
          ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, w - 2, y);
        });

        // Vertical "Today" divider
        ctx.save();
        ctx.strokeStyle = isLightTheme ? 'rgba(15,23,42,0.34)' : 'rgba(255,255,255,0.30)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(splitX, padT);
        ctx.lineTo(splitX, h - padB);
        ctx.stroke();
        ctx.restore();

        // 1. Detrended actual oscillation (crisp thin solid line)
        ctx.save();
        ctx.strokeStyle = isLightTheme ? 'rgba(15,23,42,0.45)' : 'rgba(244,245,247,0.42)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        hist.forEach((p, i) => {
          const x = xOf(i);
          const y = yOf(p.actualPct);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();

        // 2. Historical reconstructed harmonic wave (glowing metallic)
        ctx.save();
        ctx.strokeStyle = metalGlow;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        hist.forEach((p, i) => {
          const x = xOf(i);
          const y = yOf(p.fitPct);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.strokeStyle = metalCol;
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        hist.forEach((p, i) => {
          const x = xOf(i);
          const y = yOf(p.fitPct);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();

        // 3. Forward 30D damped harmonic projection (luminous green/coral)
        ctx.save();
        ctx.strokeStyle = projGlow;
        ctx.lineWidth = 6.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        proj.forEach((p, k) => {
          const x = xOf(splitIdx + k);
          const y = yOf(p.cyclePct);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.strokeStyle = projCol;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        proj.forEach((p, k) => {
          const x = xOf(splitIdx + k);
          const y = yOf(p.cyclePct);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();

        // Next Peak & Next Trough markers on projected wave
        const peakStep = spec.nextPeakStep;
        const troughStep = spec.nextTroughStep;
        const drawTurningPt = (step: number | null, label: string, col: string, above: boolean) => {
          if (step == null || !proj[step]) return;
          const px = xOf(splitIdx + step);
          const py = yOf(proj[step].cyclePct);
          ctx.save();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(px, py, 3.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = isLightTheme ? '#fff' : '#0d0e11';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.font = '700 8.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = above ? 'bottom' : 'top';
          const ty = above ? Math.max(padT + 10, py - 6) : Math.min(h - padB - 10, py + 6);
          ctx.fillText(label, Math.max(splitX + 18, Math.min(w - padR - 18, px)), ty);
          ctx.restore();
        };
        if (peakStep != null && proj[peakStep]) {
          drawTurningPt(peakStep, `▲ +${proj[peakStep].dayApprox}d`, '#22c55e', true);
        }
        if (troughStep != null && proj[troughStep] && troughStep !== peakStep) {
          drawTurningPt(troughStep, `▼ +${proj[troughStep].dayApprox}d`, '#f59e0b', false);
        }

        // Hover guide
        if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < totalPts) {
          const hx = xOf(hoverIdx);
          ctx.save();
          ctx.strokeStyle = hoverIdx > splitIdx ? projCol : metalCol;
          ctx.globalAlpha = 0.55;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(hx, padT);
          ctx.lineTo(hx, h - padB);
          ctx.stroke();
          ctx.restore();
        }

        // Top tags + bottom x-axis labels
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.fillStyle = mutedCol;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText('Historical Cycle Fit (Detrended)', padL, 4);
        ctx.textAlign = 'right';
        ctx.fillStyle = projCol;
        ctx.fillText('30D Harmonic Projection →', w - padR, 4);

        ctx.font = '500 9.5px "JetBrains Mono", monospace';
        ctx.fillStyle = mutedCol;
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'left';
        ctx.fillText(`-${hist.length - 1}d`, padL, h - 3);
        ctx.textAlign = 'center';
        ctx.fillText('Today', splitX, h - 3);
        ctx.textAlign = 'right';
        ctx.fillText('+30D', w - padR, h - 3);
      } else if (view === 'psd' && spectrum.length >= 4) {
        const nBins = spectrum.length;
        const barSlot = plotW / nBins;
        const barW = Math.max(3, barSlot * 0.68);
        xCoordsRef.current = spectrum.map((_, i) => padL + (i + 0.5) * barSlot);

        // Horizontal PSD grid
        ctx.font = '500 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        [1.0, 0.5, 0].forEach((lvl) => {
          const y = padT + (1 - lvl) * plotH;
          ctx.strokeStyle = gridCol;
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(padL + plotW, y);
          ctx.stroke();
          ctx.fillStyle = mutedCol;
          ctx.fillText(`${Math.round(lvl * 100)}%`, w - 2, y);
        });

        let lastPeakLabelX = -Infinity;
        spectrum.forEach((b, i) => {
          const cx = padL + (i + 0.5) * barSlot;
          const bh = Math.max(2, b.powerNorm * plotH);
          const bx = cx - barW / 2;
          const by = padT + plotH - bh;
          const isHov = i === hoverIdx;
          ctx.fillStyle = b.isPeak
            ? metalCol
            : isHov
              ? projCol
              : isLightTheme
                ? 'rgba(100,116,139,0.34)'
                : 'rgba(148,163,184,0.28)';
          ctx.beginPath();
          ctx.roundRect(bx, by, barW, bh, [3, 3, 0, 0]);
          ctx.fill();

          if (b.isPeak && cx - lastPeakLabelX > 42) {
            ctx.fillStyle = metalCol;
            ctx.font = '700 9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`${b.period}d`, cx, Math.max(padT + 9, by - 3));
            lastPeakLabelX = cx;
          }
        });

        // Bottom period ticks
        ctx.font = '500 9.5px "JetBrains Mono", monospace';
        ctx.fillStyle = mutedCol;
        ctx.textBaseline = 'bottom';
        const tickIdxs = [0, Math.floor(nBins * 0.25), Math.floor(nBins * 0.5), Math.floor(nBins * 0.75), nBins - 1];
        tickIdxs.forEach((ti, k) => {
          const cx = xCoordsRef.current[ti];
          ctx.textAlign = k === 0 ? 'left' : k === tickIdxs.length - 1 ? 'right' : 'center';
          ctx.fillText(`${spectrum[ti].period}d`, cx, h - 3);
        });
      }
    };

    const raf = requestAnimationFrame(draw);
    window.addEventListener('resize', draw, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', draw);
    };
  }, [hist, hoverIdx, isLightTheme, metal, proj, spec, spectrum, view]);

  if (!spec?.available) return null;

  const handleInspect = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const xs = xCoordsRef.current;
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
    setHoverIdx(bestI);
  };

  // Build fixed single-line hover readout (deltaY = 0)
  let readoutText = spec.summary;
  if (hoverIdx != null) {
    if (view === 'wave') {
      const splitIdx = hist.length - 1;
      if (hoverIdx <= splitIdx && hist[hoverIdx]) {
        const hp = hist[hoverIdx];
        readoutText = `${hp.offset === 0 ? 'Today' : `${hp.offset}d`} · Actual Cycle ${formatSignedPct(hp.actualPct, 2)} vs Harmonic Fit ${formatSignedPct(hp.fitPct, 2)}`;
      } else {
        const pIdx = hoverIdx - splitIdx;
        const pp = proj[pIdx];
        if (pp) {
          readoutText = `+${pp.dayApprox}d Projection · Harmonic Swing ${formatSignedPct(pp.deltaCyclePct, 2)} · Implied ${formatMoney(convertUnit(pp.price, settings.unit), metal === 'silver' ? 2 : 0, settings.currency, fxRates)}`;
        }
      }
    } else if (view === 'psd' && spectrum[hoverIdx]) {
      const sb = spectrum[hoverIdx];
      readoutText = `Period ${sb.period} trading days · Relative Spectral Power ${Math.round(sb.powerNorm * 100)}%${sb.isPeak ? ' ★ Dominant Peak' : ''}`;
    }
  }

  const clarityTone =
    spec.clarityScore >= 0.62 ? 'bullish' : spec.clarityScore >= 0.38 ? 'neutral' : 'bearish';

  return (
    <section className="panel" id="panel-spectral-cycles" aria-label="Frequency-Domain Spectral Forecasting">
      <div className="panel-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 className="panel-title">
            {`${t('Frequency-Domain Spectral Cycles (DFT)')} · ${t(metal === 'gold' ? 'Gold' : 'Silver')}`}
          </h2>
          <p className="panel-subtitle">
            {t('Hann-windowed DFT power spectrum & phase-locked harmonic extrapolation on 1-year daily futures')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            id="spectral-view-wave"
            className={`chip-toggle${view === 'wave' ? ' active' : ''}`}
            onClick={() => setView('wave')}
          >
            {t('Cycle Wave + 30D')}
          </button>
          <button
            type="button"
            id="spectral-view-psd"
            className={`chip-toggle${view === 'psd' ? ' active' : ''}`}
            onClick={() => setView('psd')}
          >
            {t('Power Spectrum (PSD)')}
          </button>
        </div>
      </div>

      {/* Fixed single-line interactive hover strip (deltaY = 0) */}
      <div className="chart-ohlc-bar" style={{ marginTop: 0, marginBottom: 6 }} aria-live="polite">
        <span className="chart-ohlc-text mono" id="spectral-hover-readout">
          {readoutText}
        </span>
        <span className={`badge-pill ${clarityTone} mono`} style={{ flexShrink: 0 }}>
          {`${spec.clarityLabel} · SNR ${Number(spec.peakSnr ?? 1).toFixed(1)}×`}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        id="spectral-canvas"
        style={{ width: '100%', height: 200, display: 'block', touchAction: 'pan-y', marginBottom: 10 }}
        onPointerMove={handleInspect}
        onPointerDown={handleInspect}
        onPointerLeave={() => setHoverIdx(null)}
      />

      {/* 4 Spectral Telemetry Cards */}
      <div className="stats-row" style={{ marginBottom: cycles.length ? 10 : 0 }}>
        <div className="stat-box">
          <div className="stat-label">{t('Dominant Cycle')}</div>
          <div className="stat-value mono">
            {primary ? `${primary.period}d · ${primary.marketLabel}` : 'None'}
          </div>
          <div className="panel-subtitle mono">
            {primary ? `Power ${primary.powerSharePct}% · Amp ±${primary.ampPct}%` : `${spec.samples} daily bars`}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">{t('Cycle Phase')}</div>
          <div
            className="stat-value"
            style={{
              color:
                primary?.direction === 'rising'
                  ? 'var(--up)'
                  : primary?.direction === 'falling'
                    ? 'var(--down)'
                    : undefined,
            }}
          >
            {primary ? `${primary.phaseLabel} (${primary.phaseDeg}°)` : 'Neutral'}
          </div>
          <div className="panel-subtitle mono">
            {primary ? `Peak ~${primary.daysToPeak}d · Trough ~${primary.daysToTrough}d` : 'Phase-locked OLS'}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">{t('Spectral Entropy & Fit')}</div>
          <div className="stat-value mono">{`H = ${Number(spec.spectralEntropy ?? 1).toFixed(2)}`}</div>
          <div className="panel-subtitle mono">
            {`R² ${Math.round(Number(spec.rSquared ?? 0) * 100)}% · ${spec.samples}d DFT`}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">{t('Harmonic 7D / 30D Tilt')}</div>
          <div
            className="stat-value mono"
            style={{ color: Number(spec.expected30dPct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}
          >
            {`${formatSignedPct(Number(spec.expected7dPct ?? 0), 2)} / ${formatSignedPct(Number(spec.expected30dPct ?? 0), 2)}`}
          </div>
          <div className="panel-subtitle mono">
            {spec.oosDirHitPct != null
              ? `OOS Walk-Forward ${spec.oosDirHitPct}% (${spec.oosSamples}chk)`
              : `Confidence ${Math.round(Number(spec.confidence ?? 0) * 100)}%`}
          </div>
        </div>
      </div>

      {/* Top 3 Detected Harmonics Pill Strip */}
      {cycles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {cycles.map((c) => (
            <span
              key={c.rank}
              className={`badge-pill ${
                c.direction === 'rising' ? 'bullish' : c.direction === 'falling' ? 'bearish' : 'neutral'
              } mono`}
              style={{ fontSize: 11 }}
            >
              {`#${c.rank} ${c.period}d ${c.marketLabel} (${c.phaseLabel.split(' ')[0]} · ${c.powerSharePct}%)`}
            </span>
          ))}
        </div>
      )}
    </section>
  );
};
