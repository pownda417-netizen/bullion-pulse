import React, { useMemo, useState } from 'react';
import type { TradeSubView } from '../../types/bullion';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { DEAL_PRESETS, formatMoney } from '../../utils/format';
import { computeBuyTheDipLadder, evaluateDealGrade } from '../../engines/outlookEngine';
import { SubNav, type SubTabOption } from '../layout/SubNav';

const TRADE_TABS: readonly SubTabOption<TradeSubView>[] = [
  { id: 'swap', label: 'Ratio & Swap' },
  { id: 'ladder', label: 'Buy-the-Dip' },
  { id: 'grader', label: 'Deal Grader' },
];

export const TradeView: React.FC<{ active: boolean }> = ({ active }) => {
  const {
    settings,
    updateSettings,
    setSubView,
    quotes,
    fxRates,
    quant,
    whisperCpi,
    setWhisperCpi,
    whisperFed,
    setWhisperFed,
  } = useBullion();
  const { t } = useI18n();

  const sub = settings.subViews.trade;
  const gSpot = quotes.gold.price ?? 3500;
  const sSpot = quotes.silver.price ?? 40;
  const liveRatio = sSpot > 0 ? gSpot / sSpot : 85;

  // Ratio Swap local controls
  const [swapDir, setSwapDir] = useState<'g2s' | 's2g'>('g2s');
  const [swapOz, setSwapOz] = useState<number>(1);
  const [targetRatio, setTargetRatio] = useState<number>(65);
  const [frictionPct, setFrictionPct] = useState<number>(4);

  const swapResult = useMemo(() => {
    const netFactor = 1 - frictionPct / 100;
    if (swapDir === 'g2s') {
      const silverReceived = swapOz * liveRatio * netFactor;
      const goldBackAtTarget = targetRatio > 0 ? (silverReceived / targetRatio) * netFactor : 0;
      const freeGainOz = goldBackAtTarget - swapOz;
      return {
        receiveLabel: `${silverReceived.toFixed(2)} oz Silver`,
        roundTripLabel: `${goldBackAtTarget.toFixed(3)} oz Gold @ ${targetRatio}:1`,
        gainText: `${freeGainOz >= 0 ? '+' : ''}${freeGainOz.toFixed(3)} oz Gold`,
        positive: freeGainOz > 0,
      };
    }
    const goldReceived = (swapOz / Math.max(1, liveRatio)) * netFactor;
    const silverBackAtTarget = goldReceived * targetRatio * netFactor;
    const freeGainOz = silverBackAtTarget - swapOz;
    return {
      receiveLabel: `${goldReceived.toFixed(3)} oz Gold`,
      roundTripLabel: `${silverBackAtTarget.toFixed(2)} oz Silver @ ${targetRatio}:1`,
      gainText: `${freeGainOz >= 0 ? '+' : ''}${freeGainOz.toFixed(2)} oz Silver`,
      positive: freeGainOz > 0,
    };
  }, [frictionPct, liveRatio, swapDir, swapOz, targetRatio]);

  // Buy-the-Dip Ladder
  const ladderMetal =
    settings.ladder.metal === 'auto'
      ? liveRatio >= 80
        ? 'silver'
        : 'gold'
      : settings.ladder.metal === 'split'
        ? settings.selectedMetal
        : settings.ladder.metal;

  const ladderTiers = useMemo(
    () =>
      computeBuyTheDipLadder(
        ladderMetal,
        ladderMetal === 'gold' ? gSpot : sSpot,
        settings.ladder.budget,
        Number(quant.setupQuality?.support || 0) || null
      ),
    [gSpot, ladderMetal, quant.setupQuality?.support, sSpot, settings.ladder.budget]
  );

  // Deal Grader
  const activeFx = fxRates[settings.currency] || 1;
  const dealResult = useMemo(
    () =>
      evaluateDealGrade(
        settings.dealGrader.preset,
        settings.dealGrader.qty,
        settings.dealGrader.ask,
        gSpot,
        sSpot,
        activeFx
      ),
    [activeFx, gSpot, sSpot, settings.dealGrader]
  );

  return (
    <section
      className={`view-panel${active ? ' active' : ''}`}
      id="view-trade"
      aria-label="Bullion trading tools"
    >
      <SubNav
        ariaLabel="Trade tools"
        tabs={TRADE_TABS}
        activeTab={sub}
        onSelect={(next) => setSubView('trade', next)}
      />

      {sub === 'swap' && (
        <div className="sub-tab-stack">
          <section className="panel" aria-label="Gold/Silver Ratio Swap Calculator">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('Gold / Silver Ratio Swap Calculator')}</h2>
                <p className="panel-subtitle">
                  {t('Calculate free ounce growth when rotating between Gold & Silver across ratio extremes')}
                </p>
              </div>
              <span className="badge-pill neutral mono">{`Live ${liveRatio.toFixed(1)} : 1`}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                className={`chip-toggle${swapDir === 'g2s' ? ' active' : ''}`}
                onClick={() => setSwapDir('g2s')}
              >
                Gold → Silver
              </button>
              <button
                type="button"
                className={`chip-toggle${swapDir === 's2g' ? ' active' : ''}`}
                onClick={() => setSwapDir('s2g')}
              >
                Silver → Gold
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
              <label className="field-group">
                <span>{swapDir === 'g2s' ? 'Gold to Swap (oz)' : 'Silver to Swap (oz)'}</span>
                <input
                  type="number"
                  className="text-input"
                  min="0.1"
                  step="0.5"
                  value={swapOz}
                  onChange={(e) => setSwapOz(Math.max(0.01, Number(e.target.value) || 0))}
                />
              </label>
              <label className="field-group">
                <span>Target Re-Swap Ratio</span>
                <input
                  type="number"
                  className="text-input"
                  min="20"
                  max="140"
                  value={targetRatio}
                  onChange={(e) => setTargetRatio(Math.max(10, Number(e.target.value) || 65))}
                />
              </label>
              <label className="field-group">
                <span>Dealer Spread Friction (%)</span>
                <input
                  type="number"
                  className="text-input"
                  min="0"
                  max="20"
                  step="0.5"
                  value={frictionPct}
                  onChange={(e) => setFrictionPct(Math.max(0, Math.min(25, Number(e.target.value) || 0)))}
                />
              </label>
            </div>

            <div className="stats-row">
              <div className="stat-box">
                <div className="stat-label">You Receive Now</div>
                <div className="stat-value mono">{swapResult.receiveLabel}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">At Target Ratio</div>
                <div className="stat-value mono">{swapResult.roundTripLabel}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Net Free Metal</div>
                <div className="stat-value mono" style={{ color: swapResult.positive ? 'var(--up)' : 'var(--down)' }}>
                  {swapResult.gainText}
                </div>
              </div>
            </div>
          </section>

          {/* CPI & Fed Whisper Sliders */}
          <section className="panel" aria-label="CPI and Fed Whisper Sliders">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('CPI & Fed Rate Whisper Simulator')}</h2>
                <p className="panel-subtitle">
                  {t('Slide inflation or Fed surprises to stress-test the live 30-day Precision Forecast')}
                </p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label className="field-group">
                <span>{`CPI Inflation Surprise: ${whisperCpi >= 0 ? '+' : ''}${whisperCpi.toFixed(1)}σ`}</span>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.5"
                  value={whisperCpi}
                  onChange={(e) => setWhisperCpi(Number(e.target.value))}
                />
              </label>
              <label className="field-group">
                <span>{`Fed Hawkish/Dovish Shift: ${whisperFed >= 0 ? '+' : ''}${whisperFed.toFixed(1)}σ`}</span>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.5"
                  value={whisperFed}
                  onChange={(e) => setWhisperFed(Number(e.target.value))}
                />
              </label>
            </div>
          </section>
        </div>
      )}

      {sub === 'ladder' && (
        <section className="panel" aria-label="Buy-the-Dip Staggered Ladder">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{t('Buy-the-Dip Staggered Entry Ladder')}</h2>
              <p className="panel-subtitle">
                {t('Split your dry powder across 4 disciplined pullback tiers anchored to live support')}
              </p>
            </div>
            <span className="badge-pill bullish">{ladderMetal.toUpperCase()}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
            <label className="field-group">
              <span>Budget (USD)</span>
              <input
                type="number"
                className="text-input"
                min="10"
                step="100"
                value={settings.ladder.budget}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    ladder: { ...prev.ladder, budget: Math.max(10, Number(e.target.value) || 1000) },
                  }))
                }
              />
            </label>
            <label className="field-group">
              <span>Target Metal</span>
              <select
                className="text-input"
                value={settings.ladder.metal}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    ladder: {
                      ...prev.ladder,
                      metal: e.target.value as 'auto' | 'gold' | 'silver' | 'split',
                    },
                  }))
                }
              >
                <option value="auto">Auto (Best Value by Ratio)</option>
                <option value="gold">Gold (XAU)</option>
                <option value="silver">Silver (XAG)</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {ladderTiers.map((tier) => (
              <div key={tier.label} className="stat-box">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 12.5 }}>{tier.label}</strong>
                  <span className="badge-pill neutral">{`${tier.allocationPct}%`}</span>
                </div>
                <div className="stat-value mono" style={{ marginTop: 6 }}>
                  {formatMoney(tier.targetPriceUsd, 2, settings.currency, fxRates)}
                </div>
                <div className="panel-subtitle mono" style={{ marginTop: 4 }}>
                  {`−${tier.dropPct}% · ${formatMoney(tier.budgetUsd, 0, settings.currency, fxRates)} · ~${tier.estOz} oz`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {sub === 'grader' && (
        <section className="panel" aria-label="Physical Bullion Deal Grader">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{t('Coin Shop & Online Deal Grader')}</h2>
              <p className="panel-subtitle">
                {t('Instantly grade any coin, bar, junk silver or karat jewelry quote against live melt')}
              </p>
            </div>
            <span className={`badge-pill ${dealResult.tone}`}>{dealResult.gradeLabel}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
            <label className="field-group">
              <span>Product Type</span>
              <select
                className="text-input"
                value={settings.dealGrader.preset}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    dealGrader: { ...prev.dealGrader, preset: e.target.value },
                  }))
                }
              >
                {Object.entries(DEAL_PRESETS).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-group">
              <span>{DEAL_PRESETS[settings.dealGrader.preset]?.qtyLabel || 'Quantity'}</span>
              <input
                type="number"
                className="text-input"
                min="0.1"
                step="1"
                value={settings.dealGrader.qty}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    dealGrader: { ...prev.dealGrader, qty: Math.max(0.01, Number(e.target.value) || 1) },
                  }))
                }
              />
            </label>

            <label className="field-group">
              <span>{`Total Ask Price (${settings.currency})`}</span>
              <input
                type="number"
                className="text-input"
                placeholder="e.g. 46.50"
                value={settings.dealGrader.ask}
                onChange={(e) =>
                  updateSettings((prev) => ({
                    ...prev,
                    dealGrader: { ...prev.dealGrader, ask: e.target.value },
                  }))
                }
              />
            </label>
          </div>

          <div className="stats-row" style={{ marginBottom: 10 }}>
            <div className="stat-box">
              <div className="stat-label">Pure Metal Weight</div>
              <div className="stat-value mono">{`${dealResult.pureOz} oz`}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Live Melt Value</div>
              <div className="stat-value mono">
                {formatMoney(dealResult.meltUsd, 2, settings.currency, fxRates)}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Markup Over Spot</div>
              <div className="stat-value mono">
                {dealResult.markupPct != null ? `+${dealResult.markupPct.toFixed(2)}%` : '—'}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Typical Dealer Range</div>
              <div className="stat-value">{dealResult.typicalRangeText}</div>
            </div>
          </div>
          <p className="panel-note">{dealResult.advice}</p>
        </section>
      )}
    </section>
  );
};
