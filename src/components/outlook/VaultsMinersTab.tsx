import React from 'react';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { formatMoney, formatSignedPct } from '../../utils/format';

export const VaultsMinersTab: React.FC = () => {
  const { comex, outlook, quant, settings, fxRates } = useBullion();
  const { t } = useI18n();

  const gComex = comex?.gold || {};
  const sComex = comex?.silver || {};
  const inst = outlook?.institutionalSignals || {};
  const etf = inst.etfFlows || {};
  const iv = inst.impliedVol || {};
  const miners = outlook?.proSignals?.miners || {};
  const yc = outlook?.proSignals?.yieldCurve || null;
  const spxGold = outlook?.proSignals?.spxGoldRatio || null;
  const cotGold = outlook?.proSignals?.cot?.gold || {};
  const cotSilver = outlook?.proSignals?.cot?.silver || {};
  const minerLeaders: Array<Record<string, unknown>> = Array.isArray(miners.sectorLeaders)
    ? miners.sectorLeaders
    : [];
  const eventRisk = quant.eventRisk || inst.eventRisk || {};
  const upcomingEvents: Array<Record<string, unknown>> = Array.isArray(eventRisk.expandedEvents) && eventRisk.expandedEvents.length
    ? eventRisk.expandedEvents
    : Array.isArray(eventRisk.upcoming)
      ? eventRisk.upcoming
      : Array.isArray(eventRisk.events)
        ? eventRisk.events
        : [];

  return (
    <div className="sub-tab-stack">
      {/* 1. COMEX Paper-to-Physical & Vault Inventory */}
      <section className="panel" aria-label="COMEX Vault Stocks & Paper Ratio">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('COMEX Vault Stocks & Paper Squeeze')}</h2>
            <p className="panel-subtitle">
              {t('Registered vs. Eligible warehouse inventory & paper open interest coverage')}
            </p>
          </div>
          <span className="badge-pill neutral">
            {comex?.liveFetched ? 'Live CFTC / CME' : 'Baseline Snapshot'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div className="stat-box">
            <div className="stat-label">{t('COMEX Gold Coverage')}</div>
            <div className="stat-value mono">
              {gComex.paperToRegisteredRatio != null
                ? `${Number(gComex.paperToRegisteredRatio).toFixed(2)}× paper/oz`
                : 'Normal'}
            </div>
            <div className="panel-subtitle" style={{ marginTop: 4 }}>
              {`Squeeze tension: ${gComex.squeezeScore ?? 50}/100`}
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-label">{t('COMEX Silver Coverage')}</div>
            <div className="stat-value mono">
              {sComex.paperToRegisteredRatio != null
                ? `${Number(sComex.paperToRegisteredRatio).toFixed(2)}× paper/oz`
                : 'Elevated'}
            </div>
            <div className="panel-subtitle" style={{ marginTop: 4 }}>
              {`Squeeze tension: ${sComex.squeezeScore ?? 72}/100`}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Institutional Flows & Miners Lead-Lag */}
      <section className="panel" aria-label="Institutional Flows and Miners">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('Institutional Flows, ETFs & Miners Lead-Lag')}</h2>
            <p className="panel-subtitle">
              {t('GLD/SLV/PHYS/PSLV physical ETF flows, GVZ implied volatility, 9-miner basket & CFTC COT')}
            </p>
          </div>
          <span
            className={`badge-pill ${
              Number(etf.goldSignal ?? 0) > 0.1
                ? 'bullish'
                : Number(etf.goldSignal ?? 0) < -0.1
                  ? 'bearish'
                  : 'neutral'
            }`}
          >
            {String(etf.regime || etf.label || 'Balanced ETF Flows')}
          </span>
        </div>

        <div className="stats-row" style={{ marginBottom: minerLeaders.length ? 12 : 0 }}>
          <div className="stat-box">
            <div className="stat-label">ETF Flows (GLD/SLV/PHYS)</div>
            <div
              className="stat-value"
              style={{
                color:
                  Number(etf.goldSignal ?? 0) > 0.1
                    ? 'var(--up)'
                    : Number(etf.goldSignal ?? 0) < -0.1
                      ? 'var(--down)'
                      : undefined,
              }}
            >
              {String(etf.regime || etf.label || 'Balanced Flows')}
            </div>
            <div className="panel-subtitle mono" style={{ marginTop: 3 }}>
              {etf.gldRet5dPct != null
                ? `GLD ${formatSignedPct(Number(etf.gldRet5dPct), 1)} · SLV ${formatSignedPct(Number(etf.slvRet5dPct ?? 0), 1)} (5d)`
                : `GLD ${Number(etf.gldVolRatio ?? 1).toFixed(2)}× · SLV ${Number(etf.slvVolRatio ?? 1).toFixed(2)}× vol`}
            </div>
            {etf.physVsGld10dPct != null && (
              <div className="panel-subtitle mono" style={{ fontSize: 10.5, marginTop: 1 }}>
                {`PHYS/GLD ${formatSignedPct(Number(etf.physVsGld10dPct), 1)} · PSLV/SLV ${formatSignedPct(Number(etf.pslvVsSlv10dPct ?? 0), 1)}`}
              </div>
            )}
          </div>
          <div className="stat-box">
            <div className="stat-label">Gold Implied Vol (GVZ)</div>
            <div className="stat-value mono">
              {iv.gvz != null ? Number(iv.gvz).toFixed(1) : '18.2'}
            </div>
            <div className="panel-subtitle mono" style={{ marginTop: 3 }}>
              {iv.ivMinusRv != null
                ? `IV−RV ${formatSignedPct(Number(iv.ivMinusRv), 1)} · ${String(iv.regime || 'Normal')}`
                : String(iv.regime || 'Implied Vol')}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Miners Lead-Lag (GDX/SIL)</div>
            <div
              className="stat-value mono"
              style={{
                color:
                  Number(miners.gdxVsGold10dPct ?? miners.gdxPct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)',
              }}
            >
              {miners.gdxVsGold10dPct != null
                ? `${formatSignedPct(Number(miners.gdxVsGold10dPct), 2)} vs Au`
                : miners.gdxPct != null
                  ? formatSignedPct(Number(miners.gdxPct), 2)
                  : String(miners.regime || miners.label || 'Confirming')}
            </div>
            <div className="panel-subtitle mono" style={{ marginTop: 3 }}>
              {miners.silVsSilver10dPct != null
                ? `SIL ${formatSignedPct(Number(miners.silVsSilver10dPct), 1)} vs Ag · Breadth ${miners.goldBreadthPct ?? 50}%`
                : String(miners.regime || miners.label || 'Sector confirmation')}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-label">CFTC COT Positioning</div>
            <div className="stat-value">
              {String(cotGold.regime || cotGold.label || 'Net Long')}
            </div>
            <div className="panel-subtitle mono" style={{ marginTop: 3 }}>
              {`Au ${cotGold.percentile52w != null ? `${Math.round(Number(cotGold.percentile52w))}th` : '—'} · Ag ${cotSilver.percentile52w != null ? `${Math.round(Number(cotSilver.percentile52w))}th` : '—'} 52w %ile`}
            </div>
          </div>
        </div>

        {minerLeaders.length > 0 && (
          <div>
            <div className="stat-label" style={{ marginBottom: 6 }}>
              {t('9-Miner Basket (5-Day Performance)')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {minerLeaders.map((m) => {
                const sym = String(m.symbol || '');
                const pct5 = Number(m.pct5d ?? 0);
                return (
                  <span
                    key={sym}
                    className={`badge-pill ${pct5 >= 0 ? 'bullish' : 'bearish'} mono`}
                    style={{ fontSize: 11 }}
                    title={`${String(m.name || sym)} ($${Number(m.last ?? 0).toFixed(2)})`}
                  >
                    {`${sym} ${formatSignedPct(pct5, 1)}`}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 2b. Macro Fundamentals Guardrail: 10Y-2Y Yield Curve & S&P 500 / Gold Capital Rotation (v63) */}
      <section className="panel" id="panel-macro-guardrail" aria-label="Macro Fundamentals Guardrail">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 className="panel-title">{t('Macro Fundamentals Guardrail (Yield Curve & S&P 500 / Gold)')}</h2>
            <p className="panel-subtitle">
              {t('Tracks Fed-pivot curve steepening (FRED T10Y2Y/DGS2) and real-terms equity-to-gold capital rotation (40m & 80m MAs)')}
            </p>
          </div>
          <span
            className={`badge-pill ${
              Number(yc?.goldSignal ?? 0) + Number(spxGold?.goldSignal ?? 0) > 0.2
                ? 'bullish'
                : Number(yc?.goldSignal ?? 0) + Number(spxGold?.goldSignal ?? 0) < -0.2
                  ? 'bearish'
                  : 'neutral'
            }`}
          >
            {Number(yc?.goldSignal ?? 0) + Number(spxGold?.goldSignal ?? 0) > 0.2
              ? 'Macro Tailwind'
              : Number(yc?.goldSignal ?? 0) + Number(spxGold?.goldSignal ?? 0) < -0.2
                ? 'Macro Headwind'
                : 'Transition / Mixed'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10 }}>
          {/* Left: 10Y-2Y Yield Curve & 2Y Fed Proxy */}
          <div className="stat-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="stat-label" style={{ margin: 0 }}>10Y–2Y Yield Curve &amp; 2Y Yield</span>
              <span
                className={`badge-pill ${
                  Number(yc?.goldSignal ?? 0) > 0.1
                    ? 'bullish'
                    : Number(yc?.goldSignal ?? 0) < -0.1
                      ? 'bearish'
                      : 'neutral'
                }`}
                style={{ fontSize: 10 }}
              >
                {String(yc?.regime || 'Syncing FRED')}
              </span>
            </div>
            <div className="stat-value mono" style={{ marginTop: 6 }}>
              {yc?.spread10y2yPct != null
                ? `${Number(yc.spread10y2yPct) >= 0 ? '+' : ''}${Number(yc.spread10y2yPct).toFixed(2)}% spread · 2Y ${Number(yc.yield2yPct ?? 0).toFixed(2)}%`
                : 'Awaiting FRED T10Y2Y / DGS2'}
            </div>
            <div className="panel-subtitle mono" style={{ marginTop: 4 }}>
              {yc?.spread10y2yPct != null
                ? `Curve 5d ${Number(yc.spreadDelta5dBps) >= 0 ? '+' : ''}${yc.spreadDelta5dBps}bp · 20d ${Number(yc.spreadDelta20dBps) >= 0 ? '+' : ''}${yc.spreadDelta20dBps}bp · 2Y 20d ${Number(yc.yield2yDelta20dBps) >= 0 ? '+' : ''}${yc.yield2yDelta20dBps}bp`
                : 'Bull steepening (falling 2Y + rising 10Y−2Y) historically ignites secular Gold legs.'}
            </div>
          </div>

          {/* Right: S&P 500 / Gold Ratio vs 40m & 80m MAs + 48-month SVG sparkline */}
          <div className="stat-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="stat-label" style={{ margin: 0 }}>S&amp;P 500 / Gold Capital Rotation</span>
              <span
                className={`badge-pill ${
                  Number(spxGold?.goldSignal ?? 0) > 0.1
                    ? 'bullish'
                    : Number(spxGold?.goldSignal ?? 0) < -0.1
                      ? 'bearish'
                      : 'neutral'
                }`}
                style={{ fontSize: 10 }}
              >
                {String(spxGold?.regime || 'Syncing Ratio')}
              </span>
            </div>
            <div className="stat-value mono" style={{ marginTop: 6 }}>
              {spxGold?.ratio != null
                ? `${Number(spxGold.ratio).toFixed(2)}× (${formatSignedPct(Number(spxGold.chg5dPct ?? 0), 1)} 5d)`
                : 'Awaiting ^GSPC / GC=F'}
            </div>
            <div className="panel-subtitle mono" style={{ marginTop: 4 }}>
              {spxGold?.ma40m != null
                ? `40m MA ${Number(spxGold.ma40m).toFixed(2)} (${formatSignedPct(Number(spxGold.vsMa40mPct ?? 0), 1)})${spxGold.ma80m != null ? ` · 80m MA ${Number(spxGold.ma80m).toFixed(2)}` : ''}`
                : 'Below 40m & 80m MAs signals capital rotating out of stocks into bullion.'}
            </div>
            {spxGold?.goldMa40m != null && (
              <div className="panel-subtitle mono" style={{ fontSize: 10.5, marginTop: 2 }}>
                {`Gold 40-Mo MA Support: ${formatMoney(Number(spxGold.goldMa40m), 0, settings.currency, fxRates)} (${formatSignedPct(Number(spxGold.goldVsMa40mPct ?? 0), 1)} above)`}
              </div>
            )}
            {Array.isArray(spxGold?.history48m) && spxGold.history48m.length >= 6 && (() => {
              const pts = spxGold.history48m as Array<{ ym: string; ratio: number; ma40m: number }>;
              const vals = pts.flatMap((p) => [p.ratio, p.ma40m]);
              const lo = Math.min(...vals);
              const hi = Math.max(...vals);
              const span = Math.max(0.05, hi - lo);
              const W = 240;
              const H = 38;
              const xAt = (i: number) => ((i / Math.max(1, pts.length - 1)) * (W - 4) + 2).toFixed(1);
              const yAt = (v: number) => (H - 3 - ((v - lo) / span) * (H - 6)).toFixed(1);
              const ratioPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(p.ratio)}`).join(' ');
              const maPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(p.ma40m)}`).join(' ');
              return (
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  width="100%"
                  height="38"
                  style={{ display: 'block', marginTop: 6, overflow: 'visible' }}
                  aria-label="48-month S&P 500 to Gold ratio versus 40-month moving average"
                >
                  <path d={maPath} fill="none" stroke="rgba(148,163,184,0.55)" strokeWidth="1.2" strokeDasharray="3 2" />
                  <path d={ratioPath} fill="none" stroke="#d4a843" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              );
            })()}
          </div>
        </div>
      </section>

      {/* 3. Macro & OpEx Event Calendar */}
      <section className="panel" aria-label="Upcoming Macro and OpEx Events">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('Macro Catalyst & COMEX OpEx Calendar')}</h2>
            <p className="panel-subtitle">
              {t('FOMC, CPI, NFP, PCE & COMEX First Notice Day catalysts wired directly into Jump-Diffusion Odds')}
            </p>
          </div>
          <span
            className={`badge-pill ${
              Number(eventRisk.jumpBoost ?? 0) >= 0.12 ? 'bearish' : 'neutral'
            }`}
          >
            {String(eventRisk.regime || eventRisk.riskLevel || 'Normal Window')}
          </span>
        </div>

        {upcomingEvents.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcomingEvents.slice(0, 7).map((ev, idx) => {
              const daysVal = ev.daysUntil ?? ev.daysAway;
              const daysNum = daysVal != null && Number.isFinite(Number(daysVal)) ? Number(daysVal) : null;
              const isImminentHigh = String(ev.impact || '').toLowerCase() === 'high' && daysNum != null && daysNum <= 3;
              return (
                <div
                  key={idx}
                  className="stat-box"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                >
                  <div>
                    <strong>{String(ev.title || ev.name || 'Macro Catalyst')}</strong>
                    <div className="panel-subtitle">
                      {`${String(ev.date || ev.when || '')}${ev.impact ? ` · ${String(ev.impact).toUpperCase()} impact` : ''}`}
                    </div>
                  </div>
                  <span className={`badge-pill ${isImminentHigh ? 'bearish' : 'neutral'} mono`}>
                    {daysNum === 0 ? 'Today' : daysNum != null ? `in ${daysNum}d` : String(ev.impact || 'High')}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="panel-note">
            {String(eventRisk.summary || 'No imminent high-impact FOMC/CPI/OpEx shock window in the next 48 hours.')}
          </p>
        )}
      </section>
    </div>
  );
};
