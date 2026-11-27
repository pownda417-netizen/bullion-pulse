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
  const miners = outlook?.proSignals?.miners || {};
  const eventRisk = quant.eventRisk || inst.eventRisk || {};
  const upcomingEvents: Array<Record<string, unknown>> = Array.isArray(eventRisk.upcoming)
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
              {t('GLD/SLV institutional flow balance, GVZ implied volatility & GDX/SIL miner confirmation')}
            </p>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-label">ETF Flow Balance</div>
            <div className="stat-value">{String(inst.etfFlows?.label || 'Steady Inflow')}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Gold Vol (GVZ)</div>
            <div className="stat-value mono">
              {inst.impliedVol?.gvz != null ? Number(inst.impliedVol.gvz).toFixed(1) : '18.2'}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Miners (GDX/SIL)</div>
            <div className="stat-value mono">
              {miners.gdxPct != null ? formatSignedPct(Number(miners.gdxPct), 2) : String(miners.label || 'Confirming')}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-label">COT Managed Money</div>
            <div className="stat-value">
              {String(outlook?.proSignals?.cot?.gold?.label || 'Net Long')}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Macro & OpEx Event Calendar */}
      <section className="panel" aria-label="Upcoming Macro and OpEx Events">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('Macro Catalyst & COMEX OpEx Calendar')}</h2>
            <p className="panel-subtitle">
              {t('FOMC, CPI, NFP & COMEX options expiration windows that trigger short-term bullion swings')}
            </p>
          </div>
          <span className="badge-pill neutral">{String(eventRisk.riskLevel || 'Normal Window')}</span>
        </div>

        {upcomingEvents.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcomingEvents.slice(0, 6).map((ev, idx) => (
              <div
                key={idx}
                className="stat-box"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <strong>{String(ev.name || ev.title || 'Macro Catalyst')}</strong>
                  <div className="panel-subtitle">{String(ev.date || ev.when || '')}</div>
                </div>
                <span className="badge-pill neutral">
                  {ev.daysAway != null ? `in ${ev.daysAway}d` : String(ev.impact || 'High')}
                </span>
              </div>
            ))}
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
