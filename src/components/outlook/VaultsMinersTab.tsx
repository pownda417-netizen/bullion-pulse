import React from 'react';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { formatSignedPct } from '../../utils/format';

export const VaultsMinersTab: React.FC = () => {
  const { comex, outlook, quant } = useBullion();
  const { t } = useI18n();

  const gComex = comex?.gold || {};
  const sComex = comex?.silver || {};
  const inst = outlook?.institutionalSignals || {};
  const etf = inst.etfFlows || {};
  const iv = inst.impliedVol || {};
  const miners = outlook?.proSignals?.miners || {};
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
