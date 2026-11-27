import React from 'react';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { convertUnit, formatMoney, formatSignedPct } from '../../utils/format';

export const ForecastTab: React.FC = () => {
  const { settings, updateSettings, quotes, fxRates, outlook, quant, spaceWeather } = useBullion();
  const { t } = useI18n();

  const metal = settings.selectedMetal;
  const fc = quant.interactiveForecast;
  const h7 = fc.horizon7d;
  const h30 = fc.horizon30d;
  const setup = quant.setupQuality || {};
  const phys = quant.physicalPremiums?.[metal] || {};
  const twins = quant.twins;
  const seasonal = quant.seasonality;

  const stanceColor = /bullish|buy|up/i.test(fc.signal)
    ? 'var(--up)'
    : /bearish|sell|down/i.test(fc.signal)
      ? 'var(--down)'
      : 'var(--gold, #d4a843)';

  const dec = metal === 'silver' ? 2 : 0;

  return (
    <div className="sub-tab-stack">
      {/* 1. Headline Precision 7D & 30D 4-Model Ensemble */}
      <section className="panel" aria-label="Precision 30-Day Ensemble Forecast">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 className="panel-title">
              {`${t('Precision Forecast')} · ${t(metal === 'gold' ? 'Gold' : 'Silver')}`}
            </h2>
            <p className="panel-subtitle">
              {t('4-model quantitative ensemble anchored to live spot — Macro & Vaults, Lead-Lag Alpha, Hurst/RSI & Seasonality/Twins')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {fc.interactiveActive && (
              <span className="badge-pill bullish">What-If Active</span>
            )}
            <button
              type="button"
              className={`chip-toggle${metal === 'gold' ? ' active' : ''}`}
              onClick={() => updateSettings({ selectedMetal: 'gold', chartMode: 'gold' })}
            >
              {t('Gold')}
            </button>
            <button
              type="button"
              className={`chip-toggle${metal === 'silver' ? ' active' : ''}`}
              onClick={() => updateSettings({ selectedMetal: 'silver', chartMode: 'silver' })}
            >
              {t('Silver')}
            </button>
          </div>
        </div>

        <div className="stats-row" style={{ marginBottom: 12 }}>
          <div className="stat-box">
            <div className="stat-label">{t('Outlook Stance')}</div>
            <div className="stat-value" style={{ color: stanceColor }}>
              {fc.signal}
            </div>
            <div className="panel-subtitle mono">
              {`Score ${fc.score >= 0 ? '+' : ''}${fc.score}/100 · Conf ${fc.confidence}%`}
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-label">{t('7-Day Base Target')}</div>
            <div className="stat-value mono">
              {formatMoney(convertUnit(h7.base, settings.unit), 2, settings.currency, fxRates)}
            </div>
            <div className="panel-subtitle mono" style={{ color: h7.expectedPct >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {`${formatSignedPct(h7.expectedPct, 2)} (${formatMoney(convertUnit(h7.bear, settings.unit), dec, settings.currency, fxRates)}–${formatMoney(convertUnit(h7.bull, settings.unit), dec, settings.currency, fxRates)})`}
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-label">{t('30-Day Ensemble Target')}</div>
            <div className="stat-value mono">
              {formatMoney(convertUnit(h30.base, settings.unit), 2, settings.currency, fxRates)}
            </div>
            <div className="panel-subtitle mono" style={{ color: h30.expectedPct >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {`${formatSignedPct(h30.expectedPct, 2)} (${formatMoney(convertUnit(h30.bear, settings.unit), dec, settings.currency, fxRates)}–${formatMoney(convertUnit(h30.bull, settings.unit), dec, settings.currency, fxRates)})`}
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-label">{t('Setup Quality')}</div>
            <div className="stat-value mono">{`${setup.score ?? 65}/100`}</div>
            <div className="panel-subtitle">{String(setup.label || 'Balanced Setup')}</div>
          </div>
        </div>

        {/* Cross-Horizon Alignment & GARCH/GVZ Volatility Regime Strip (v61) */}
        <div
          className="stat-box"
          id="horizon-alignment-strip"
          style={{
            marginBottom: 12,
            borderColor:
              fc.horizonAlignment.tone === 'bullish'
                ? 'rgba(34, 197, 94, 0.35)'
                : fc.horizonAlignment.tone === 'bearish'
                  ? 'rgba(239, 68, 68, 0.35)'
                  : undefined,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <strong style={{ fontSize: 12.5 }}>{t('Cross-Horizon Alignment & Volatility Regime')}</strong>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={`badge-pill ${fc.horizonAlignment.tone}`}>
                {fc.horizonAlignment.label}
              </span>
              <span className="badge-pill neutral mono" style={{ fontSize: 10.5 }}>
                {`${fc.volRegime.label} (${fc.volRegime.blendedAnnVolPct.toFixed(1)}% ann)`}
              </span>
              {fc.horizonAlignment.upcomingCatalysts7d > 0 && (
                <span className="badge-pill bearish mono" style={{ fontSize: 10.5 }}>
                  {`${fc.horizonAlignment.upcomingCatalysts7d} High-Impact Catalyst${fc.horizonAlignment.upcomingCatalysts7d > 1 ? 's' : ''} ≤7d`}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <div>
              <div className="stat-label">+12H Tactical</div>
              <div
                className="mono"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: fc.horizonAlignment.tactical12hPct >= 0 ? 'var(--up)' : 'var(--down)',
                }}
              >
                {formatSignedPct(fc.horizonAlignment.tactical12hPct, 2)}
              </div>
            </div>
            <div>
              <div className="stat-label">7D Swing</div>
              <div
                className="mono"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: fc.horizonAlignment.swing7dPct >= 0 ? 'var(--up)' : 'var(--down)',
                }}
              >
                {formatSignedPct(fc.horizonAlignment.swing7dPct, 2)}
              </div>
            </div>
            <div>
              <div className="stat-label">30D Macro</div>
              <div
                className="mono"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: fc.horizonAlignment.macro30dPct >= 0 ? 'var(--up)' : 'var(--down)',
                }}
              >
                {formatSignedPct(fc.horizonAlignment.macro30dPct, 2)}
              </div>
            </div>
            <div>
              <div className="stat-label">GARCH / GVZ Vol</div>
              <div className="mono" style={{ fontSize: 12.5, fontWeight: 700 }}>
                {fc.volRegime.gvzAnnPct != null
                  ? `EWMA ${fc.volRegime.ewmaAnnVolPct.toFixed(1)}% · IV ${fc.volRegime.gvzAnnPct.toFixed(1)}%`
                  : `EWMA ${fc.volRegime.ewmaAnnVolPct.toFixed(1)}% ann`}
              </div>
            </div>
          </div>
          <div className="panel-subtitle" style={{ marginTop: 6 }}>
            {fc.horizonAlignment.summary}
          </div>
        </div>

        {/* 30-Day 4-Checkpoint Trajectory Roadmap */}
        <div style={{ marginBottom: 12 }}>
          <div className="stat-label" style={{ marginBottom: 6 }}>
            {`30-Day Predicted Roadmap · Hurst ${h30.hurst.toFixed(2)} (${h30.hurstLabel}) · ${h30.agreeCount}/4 Models Agree (${h30.agreementPct}%)`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            {h30.milestones.map((ms) => (
              <div key={ms.day} className="stat-box" style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ms.label}</div>
                <div className="mono" style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}>
                  {formatMoney(convertUnit(ms.price, settings.unit), 2, settings.currency, fxRates)}
                </div>
                <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: ms.pct >= 0 ? 'var(--up)' : 'var(--down)' }}>
                  {formatSignedPct(ms.pct, 2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 4-Specialist Individual Model Votes */}
        {h30.modelVotes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="stat-label" style={{ marginBottom: 6 }}>{t('4-Model Specialist Votes')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 8 }}>
              {h30.modelVotes.map((mv: Record<string, unknown>) => {
                const id = String(mv.id || '');
                const weightLookup: Record<string, number> = {
                  macro: 0.46,
                  leadlag: 0.22,
                  hurst: 0.16,
                  seasonal: 0.16,
                };
                const rawWeight = Number(mv.weight ?? weightLookup[id] ?? 0.25);
                const sigScore =
                  mv.score != null && Number.isFinite(Number(mv.score))
                    ? Math.round(Number(mv.score))
                    : Math.round(Number(mv.unit ?? 0) * 100);
                const rawDir = String(mv.dir || '');
                const dir =
                  rawDir === 'up' || sigScore >= 8
                    ? 'Bullish'
                    : rawDir === 'down' || sigScore <= -8
                      ? 'Bearish'
                      : 'Neutral';
                const tone = dir === 'Bullish' ? 'bullish' : dir === 'Bearish' ? 'bearish' : 'neutral';
                return (
                  <div key={id || String(mv.label)} className="stat-box" style={{ padding: '8px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <strong style={{ fontSize: 12 }}>{String(mv.label || id)}</strong>
                      <span className={`badge-pill ${tone}`} style={{ fontSize: 10 }}>
                        {dir}
                      </span>
                    </div>
                    <div className="panel-subtitle mono" style={{ marginTop: 4 }}>
                      {`Weight ${Math.round(rawWeight * 100)}% · Signal ${sigScore >= 0 ? '+' : ''}${sigScore}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {outlook?.narrative && <p className="panel-note">{String(outlook.narrative)}</p>}
      </section>

      {/* 2. World & Space Pulse + Historical Twins & Seasonality */}
      <section className="panel" aria-label="World and Space Weather Pulse">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('World, Space Weather & Historical Twins')}</h2>
            <p className="panel-subtitle">{t('Live NOAA SWPC solar storm overlay, 20-year seasonality & empirical nearest-neighbor twins')}</p>
          </div>
          <span className={`badge-pill ${spaceWeather.peakScale >= 3 ? 'bearish' : 'bullish'}`}>
            {spaceWeather.status}
          </span>
        </div>
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-label">NOAA Solar Scales</div>
            <div className="stat-value mono">{`G${spaceWeather.gScale} · S${spaceWeather.sScale} · R${spaceWeather.rScale}`}</div>
            <div className="panel-subtitle">Geomagnetic / Solar / Radio</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Empirical Twins</div>
            <div className="stat-value mono">
              {twins?.matchPct != null ? `${twins.matchPct}% match` : 'Calibrated'}
            </div>
            <div className="panel-subtitle mono">
              {twins?.avgReturnPct != null
                ? `Avg ${formatSignedPct(twins.avgReturnPct, 2)} · ${twins.upPct ?? 50}% Up`
                : '6-mo daily scan'}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-label">20-Yr Seasonality</div>
            <div className="stat-value mono" style={{ color: Number(seasonal?.blendedPct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {formatSignedPct(Number(seasonal?.blendedPct ?? 0), 2)}
            </div>
            <div className="panel-subtitle">{String(seasonal?.windowLabel || 'Next 30d window')}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Chart Forecast Calibration</div>
            <div className="stat-value">
              {String(quant.precisionLine?.calibration?.mode || '4-Specialist Stacked')}
            </div>
            <div className="panel-subtitle mono">
              {quant.precisionLine?.calibration?.dirHitPct != null
                ? `${quant.precisionLine.calibration.dirHitPct}% Dir · ±${quant.precisionLine.calibration.avgErrPct}%`
                : 'Causal Walk-Forward'}
            </div>
          </div>
        </div>
        {spaceWeather.summary && <p className="panel-note" style={{ marginTop: 8 }}>{spaceWeather.summary}</p>}
      </section>

      {/* 3. Physical Dealer Street Premium Override */}
      <section className="panel" aria-label="Physical Dealer Premium Tracker">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('Physical Street Premiums & Local Override')}</h2>
            <p className="panel-subtitle">
              {t('Compare live paper spot against real physical dealer coins & bars')}
            </p>
          </div>
          <span className={`badge-pill ${phys.tone === 'bullish' ? 'bullish' : phys.tone === 'bearish' ? 'bearish' : 'neutral'}`}>
            {phys.premiumPct != null ? `+${Number(phys.premiumPct).toFixed(1)}% street` : String(phys.label || 'Normal Retail')}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <label className="field-group">
            <span>{t('My Local 1 oz Gold Street Price (USD)')}</span>
            <input
              type="number"
              className="text-input"
              step="1"
              min="100"
              max="50000"
              placeholder={quotes.gold.price ? String(Math.round(quotes.gold.price * 1.04)) : '3780'}
              value={settings.dealerQuotes.goldStreetOz ?? ''}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                updateSettings((prev) => ({
                  ...prev,
                  dealerQuotes: { ...prev.dealerQuotes, goldStreetOz: v },
                }));
              }}
            />
          </label>

          <label className="field-group">
            <span>{t('My Local 1 oz Silver Street Price (USD)')}</span>
            <input
              type="number"
              className="text-input"
              step="0.1"
              min="5"
              max="1000"
              placeholder={quotes.silver.price ? String((quotes.silver.price * 1.1).toFixed(2)) : '48'}
              value={settings.dealerQuotes.silverStreetOz ?? ''}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                updateSettings((prev) => ({
                  ...prev,
                  dealerQuotes: { ...prev.dealerQuotes, silverStreetOz: v },
                }));
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
};
