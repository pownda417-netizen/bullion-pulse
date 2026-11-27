import React from 'react';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { formatMoney, formatSignedPct, formatTime } from '../../utils/format';
import { SEASONAL_20Y_MONTHLY } from '../../engines/outlookEngine';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const DeepChartsTab: React.FC = () => {
  const { quotes, outlook, settings, fxRates, feedHealth, feedTrust, quant, timeframes } = useBullion();
  const { t } = useI18n();

  const macro = outlook?.macroSnapshot || {};
  const ratio =
    quotes.gold.price && quotes.silver.price ? quotes.gold.price / quotes.silver.price : null;
  const g10y = timeframes['10y']?.gold || timeframes['all']?.gold || [];
  const s10y = timeframes['10y']?.silver || timeframes['all']?.silver || [];
  const athGold = Math.max(quotes.gold.price || 0, ...g10y.map((b) => b.h), 3550);
  const athSilver = Math.max(quotes.silver.price || 0, ...s10y.map((b) => b.h), 49.5);
  const goldDistPct = quotes.gold.price && athGold > 0 ? ((quotes.gold.price - athGold) / athGold) * 100 : 0;
  const silverDistPct = quotes.silver.price && athSilver > 0 ? ((quotes.silver.price - athSilver) / athSilver) * 100 : 0;

  const seasonalArr = SEASONAL_20Y_MONTHLY[settings.selectedMetal] || SEASONAL_20Y_MONTHLY.gold;
  const currentMonth = new Date().getMonth();

  return (
    <div className="sub-tab-stack">
      {/* 1. Macro Strip + Feed Health + Tick Trust & Quorum (merged from More & Trust) */}
      <section className="panel" aria-label="Macro backdrop and feed trust">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('Macro Backdrop & Tick Trust Quorum')}</h2>
            <p className="panel-subtitle">
              {t('Live cross-market macro drivers, multi-source sanity quorum, and feed timestamps')}
            </p>
          </div>
          <span
            className={`badge-pill ${
              feedTrust.status === 'verified' || feedTrust.status === 'single' ? 'bullish' : 'neutral'
            }`}
          >
            {feedTrust.status === 'verified'
              ? t('Verified · 15s')
              : feedTrust.status === 'single'
                ? t('Live · 15s')
                : feedTrust.status === 'auto-healed'
                  ? t('Auto-Healed · 15s')
                  : feedTrust.status === 'demo'
                    ? t('Synced · 10m')
                    : t('Connecting…')}
          </span>
        </div>

        <div className="stats-row" style={{ marginBottom: 12 }}>
          <div className="stat-box">
            <div className="stat-label">US Dollar (DXY)</div>
            <div className="stat-value mono">{macro.dxy != null ? Number(macro.dxy).toFixed(2) : '—'}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">10Y Real Yield</div>
            {(() => {
              const ry = outlook?.proSignals?.realYields;
              const ryVal = ry?.realYield10yPct ?? ry?.value;
              const ryBps = ry?.realDelta5dBps;
              return (
                <>
                  <div className="stat-value mono">
                    {ryVal != null ? `${Number(ryVal).toFixed(2)}%` : '—'}
                  </div>
                  {ryBps != null && (
                    <div className="panel-subtitle mono" style={{ fontSize: 10.5, marginTop: 2 }}>
                      {`${Number(ryBps) >= 0 ? '+' : ''}${Number(ryBps)} bps 5d`}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <div className="stat-box">
            <div className="stat-label">VIX Volatility</div>
            <div className="stat-value mono">{macro.vix != null ? Number(macro.vix).toFixed(1) : '—'}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Quorum Spread</div>
            <div className="stat-value mono">
              {feedTrust.lastSpreadPct != null ? `${feedTrust.lastSpreadPct.toFixed(2)}%` : 'Single'}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Spot Updated</div>
            <div className="stat-value mono">{formatTime(feedHealth.spotAt)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Checks Run</div>
            <div className="stat-value mono">{feedTrust.checksCount}</div>
          </div>
        </div>
        <p className="panel-note">{feedTrust.lastEventNote}</p>
      </section>

      {/* 2. Ratio Analytics & Dollar Purchasing Power */}
      <section className="panel" aria-label="Gold/Silver Ratio & Purchasing Power">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('Gold / Silver Ratio & Real Purchasing Power')}</h2>
            <p className="panel-subtitle">
              {t('Historical z-score valuation bands and All-Time High (ATH) radar')}
            </p>
          </div>
          <span className="badge-pill neutral mono">{ratio ? `${ratio.toFixed(1)} : 1` : '—'}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
          <div className="stat-box">
            <div className="stat-label">Ratio Signal</div>
            <div className="stat-value">{String(quant.ratioAnalytics?.signal || 'Balanced Range')}</div>
            <div className="panel-subtitle" style={{ marginTop: 4 }}>
              {String(
                quant.ratioAnalytics?.summary ||
                  'Above 80× historically favors accumulating Silver; below 60× favors rotating to Gold.'
              )}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Gold ATH Radar</div>
            <div className="stat-value mono">
              {formatMoney(athGold, 0, settings.currency, fxRates)}
            </div>
            <div className="panel-subtitle" style={{ marginTop: 4 }}>
              {`${formatSignedPct(goldDistPct, 2)} from peak`}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Silver ATH Radar</div>
            <div className="stat-value mono">
              {formatMoney(athSilver, 2, settings.currency, fxRates)}
            </div>
            <div className="panel-subtitle" style={{ marginTop: 4 }}>
              {`${formatSignedPct(silverDistPct, 2)} from peak`}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Market Regime (Hurst)</div>
            <div className="stat-value">
              {quant.hurst?.hurst != null ? `H = ${Number(quant.hurst.hurst).toFixed(2)}` : 'Balanced'}
            </div>
            <div className="panel-subtitle" style={{ marginTop: 4 }}>
              {Number(quant.hurst?.hurst ?? 0.5) > 0.55
                ? 'Persistent trending regime'
                : Number(quant.hurst?.hurst ?? 0.5) < 0.45
                  ? 'Mean-reverting chop regime'
                  : 'Random-walk balanced flow'}
            </div>
          </div>
        </div>
      </section>

      {/* 3. 20-Year Seasonality Heatmap */}
      <section className="panel" aria-label="20-Year Monthly Seasonality Heatmap">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              {`${t('20-Year Seasonality Heatmap')} · ${t(settings.selectedMetal === 'gold' ? 'Gold' : 'Silver')}`}
            </h2>
            <p className="panel-subtitle">
              {t('Average historical monthly returns over 20 years (current month highlighted)')}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 6 }}>
          {MONTHS.map((m, i) => {
            const val = Number(seasonalArr[i] ?? 0);
            const isNow = i === currentMonth;
            const bg =
              val > 1.2
                ? 'rgba(34,197,94,0.28)'
                : val > 0
                  ? 'rgba(34,197,94,0.13)'
                  : val < -1.0
                    ? 'rgba(239,68,68,0.26)'
                    : 'rgba(239,68,68,0.12)';
            return (
              <div
                key={m}
                style={{
                  background: bg,
                  border: isNow ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 6px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: isNow ? 700 : 500 }}>
                  {m}
                  {isNow ? ' ★' : ''}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginTop: 3,
                    color: val >= 0 ? 'var(--up)' : 'var(--down)',
                  }}
                >
                  {formatSignedPct(val, 1)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Market Gaps & Liquidity Magnet */}
      <section className="panel" aria-label="Market Gap Analyzer">
        {(() => {
          const allGaps: Array<Record<string, unknown>> = Array.isArray(quant.gaps?.gaps) ? quant.gaps.gaps : [];
          const openGaps = allGaps.filter((g) => !g.isFilled);
          const displayGaps = openGaps.length > 0 ? openGaps : allGaps;
          return (
            <>
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">{t('Unfilled Price Gaps & Magnets')}</h2>
                  <p className="panel-subtitle">
                    {t('Session & weekend open gaps that price historically tends to retest')}
                  </p>
                </div>
                <span className={`badge-pill ${openGaps.length > 0 ? 'bullish' : 'neutral'}`}>
                  {openGaps.length > 0
                    ? `${openGaps.length} open`
                    : allGaps.length > 0
                      ? `${allGaps.length} filled ✓`
                      : '0 open'}
                </span>
              </div>
              {displayGaps.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {displayGaps.slice(0, 4).map((g, idx) => {
                    const isUp = g.dir === 'up';
                    const isFilled = Boolean(g.isFilled);
                    const pct = Number(g.gapPct ?? 0);
                    return (
                      <div key={idx} className="stat-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div>
                          <strong style={{ color: isUp ? 'var(--up)' : 'var(--down)' }}>
                            {`${String(g.kind || (isUp ? 'Gap Up' : 'Gap Down'))} (${isUp ? '↑' : '↓'})`}
                          </strong>
                          <div className="panel-subtitle">
                            {`Zone ${formatMoney(Number(g.zoneLow), 2, settings.currency, fxRates)} – ${formatMoney(Number(g.zoneHigh), 2, settings.currency, fxRates)} · Fill target ${formatMoney(Number(g.fillTarget), 2, settings.currency, fxRates)} (${isFilled ? 'Filled ✓' : `${Number(g.fillPct ?? 0)}% filled`})`}
                          </div>
                        </div>
                        <span
                          className="mono"
                          style={{ fontWeight: 700, color: isUp ? 'var(--up)' : 'var(--down)', whiteSpace: 'nowrap' }}
                        >
                          {`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="panel-note">{t('No significant unfilled price gaps on the active timeframe.')}</p>
              )}
            </>
          );
        })()}
      </section>
    </div>
  );
};
