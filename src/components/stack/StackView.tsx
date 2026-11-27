import React, { useState } from 'react';
import type { MetalKey, StackSubView } from '../../types/bullion';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { clampNum, formatMoney, formatSignedMoney, formatSignedPct, todayKey } from '../../utils/format';
import { SubNav, type SubTabOption } from '../layout/SubNav';

const STACK_TABS: readonly SubTabOption<StackSubView>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'goals', label: 'Goals & What-If' },
  { id: 'lots', label: 'My Purchases' },
];

export const StackView: React.FC<{ active: boolean }> = ({ active }) => {
  const {
    settings,
    updateSettings,
    setSubView,
    setActiveView,
    lastMainView,
    quotes,
    fxRates,
    stackSummary,
    addStackLot,
    deleteStackLot,
  } = useBullion();
  const { t } = useI18n();

  const sub = settings.subViews.stack;
  const hide = settings.privacyMode;
  const gSpot = quotes.gold.price ?? 3500;
  const sSpot = quotes.silver.price ?? 40;

  // What-If sliders
  const [whatIfGold, setWhatIfGold] = useState<number>(Math.round(gSpot * 1.15));
  const [whatIfSilver, setWhatIfSilver] = useState<number>(Math.round(sSpot * 1.25));

  // New Lot form
  const [lotMetal, setLotMetal] = useState<MetalKey>('gold');
  const [lotOz, setLotOz] = useState<string>('');
  const [lotCost, setLotCost] = useState<string>('');
  const [lotForm, setLotForm] = useState<string>('1 oz Coin');
  const [lotDate, setLotDate] = useState<string>(todayKey());
  const [lotNote, setLotNote] = useState<string>('');

  const handleAddLot = (e: React.FormEvent) => {
    e.preventDefault();
    const oz = Number(lotOz);
    const cost = Number(lotCost);
    if (!Number.isFinite(oz) || oz <= 0 || !Number.isFinite(cost) || cost < 0) return;
    addStackLot({ metal: lotMetal, oz, cost, form: lotForm, date: lotDate, note: lotNote });
    setLotOz('');
    setLotCost('');
    setLotNote('');
  };

  // Goals progress
  const goldGoalOz = parseFloat(settings.stackGoals.goldOz) || 0;
  const silverGoalOz = parseFloat(settings.stackGoals.silverOz) || 0;
  const usdGoal = parseFloat(settings.stackGoals.targetUsd) || 0;
  const goldGoalPct = goldGoalOz > 0 ? clampNum((stackSummary.goldOz / goldGoalOz) * 100, 0, 100) : 0;
  const silverGoalPct = silverGoalOz > 0 ? clampNum((stackSummary.silverOz / silverGoalOz) * 100, 0, 100) : 0;
  const usdGoalPct = usdGoal > 0 ? clampNum((stackSummary.totalMeltUsd / usdGoal) * 100, 0, 100) : 0;
  const whatIfTotalUsd = stackSummary.goldOz * whatIfGold + stackSummary.silverOz * whatIfSilver;

  return (
    <section
      className={`view-panel${active ? ' active' : ''}`}
      id="view-stack"
      aria-label="Personal bullion stack portfolio"
    >
      <div className="toolbar-row">
        <button
          type="button"
          className="chip-toggle"
          onClick={() => setActiveView(lastMainView)}
        >
          {t('← Back')}
        </button>
        <span className="section-label">{t('My Physical Bullion Stack')}</span>
      </div>

      <SubNav
        ariaLabel="Stack sections"
        tabs={STACK_TABS}
        activeTab={sub}
        onSelect={(next) => setSubView('stack', next)}
      />

      {sub === 'overview' && (
        <div className="sub-tab-stack">
          <section className="panel" aria-label="Stack Portfolio Summary">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('Live Stack Valuation')}</h2>
                <p className="panel-subtitle">
                  {t('100% private & stored locally on your device — never uploaded')}
                </p>
              </div>
              <span className="badge-pill neutral">
                {hide ? '🔒 Privacy ON' : `${settings.stackLots.length} lots`}
              </span>
            </div>

            <div className="stats-row" style={{ marginBottom: 14 }}>
              <div className="stat-box">
                <div className="stat-label">{t('Total Melt Value')}</div>
                <div className="stat-value mono">
                  {hide ? '••••••' : formatMoney(stackSummary.totalMeltUsd, 2, settings.currency, fxRates)}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-label">{t('Unrealized P/L')}</div>
                <div
                  className="stat-value mono"
                  style={{ color: stackSummary.totalPnlUsd >= 0 ? 'var(--up)' : 'var(--down)' }}
                >
                  {hide
                    ? '••••••'
                    : `${formatSignedMoney(stackSummary.totalPnlUsd, 2, settings.currency, fxRates)} (${formatSignedPct(stackSummary.totalPnlPct, 1)})`}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-label">{t('Dealer Cash-Out Est.')}</div>
                <div className="stat-value mono">
                  {hide ? '••••••' : formatMoney(stackSummary.netLiquidationUsd, 2, settings.currency, fxRates)}
                </div>
              </div>
              <div className="stat-box">
                <div className="stat-label">{t('Total Ounces')}</div>
                <div className="stat-value mono">
                  {hide
                    ? '•• oz Au · •• oz Ag'
                    : `${stackSummary.goldOz.toFixed(2)} oz Au · ${stackSummary.silverOz.toFixed(1)} oz Ag`}
                </div>
              </div>
            </div>

            {settings.stackLots.length === 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                <label className="field-group">
                  <span>Gold Owned (troy oz)</span>
                  <input
                    type="number"
                    className="text-input"
                    min="0"
                    step="0.1"
                    value={settings.stack.goldOz}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        stack: { ...prev.stack, goldOz: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="field-group">
                  <span>Gold Avg Cost (USD/oz)</span>
                  <input
                    type="number"
                    className="text-input"
                    min="0"
                    step="1"
                    value={settings.stack.goldCost}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        stack: { ...prev.stack, goldCost: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="field-group">
                  <span>Silver Owned (troy oz)</span>
                  <input
                    type="number"
                    className="text-input"
                    min="0"
                    step="1"
                    value={settings.stack.silverOz}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        stack: { ...prev.stack, silverOz: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="field-group">
                  <span>Silver Avg Cost (USD/oz)</span>
                  <input
                    type="number"
                    className="text-input"
                    min="0"
                    step="0.1"
                    value={settings.stack.silverCost}
                    onChange={(e) =>
                      updateSettings((prev) => ({
                        ...prev,
                        stack: { ...prev.stack, silverCost: e.target.value },
                      }))
                    }
                  />
                </label>
              </div>
            )}
          </section>
        </div>
      )}

      {sub === 'goals' && (
        <div className="sub-tab-stack">
          <section className="panel" aria-label="Stacking Goals">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('Stacking Goals')}</h2>
                <p className="panel-subtitle">
                  {t('Track ounce and dollar milestones (auto-redacted in Privacy Mode)')}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
              <label className="field-group">
                <span>Gold Goal (oz)</span>
                <input
                  type="number"
                  className="text-input"
                  value={settings.stackGoals.goldOz}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      stackGoals: { ...prev.stackGoals, goldOz: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="field-group">
                <span>Silver Goal (oz)</span>
                <input
                  type="number"
                  className="text-input"
                  value={settings.stackGoals.silverOz}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      stackGoals: { ...prev.stackGoals, silverOz: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="field-group">
                <span>Portfolio Goal (USD)</span>
                <input
                  type="number"
                  className="text-input"
                  value={settings.stackGoals.targetUsd}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      stackGoals: { ...prev.stackGoals, targetUsd: e.target.value },
                    }))
                  }
                />
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div className="threshold-meta">
                  <span>{`Gold Goal: ${hide ? '•• / •• oz' : `${stackSummary.goldOz.toFixed(2)} / ${goldGoalOz || 0} oz`}`}</span>
                  <span>{hide ? '(••%)' : `${Math.round(goldGoalPct)}%`}</span>
                </div>
                <div className="threshold-track">
                  <div className="threshold-fill up" style={{ width: `${hide ? 0 : goldGoalPct}%` }} />
                </div>
              </div>
              <div>
                <div className="threshold-meta">
                  <span>{`Silver Goal: ${hide ? '•• / •• oz' : `${stackSummary.silverOz.toFixed(1)} / ${silverGoalOz || 0} oz`}`}</span>
                  <span>{hide ? '(••%)' : `${Math.round(silverGoalPct)}%`}</span>
                </div>
                <div className="threshold-track">
                  <div className="threshold-fill up" style={{ width: `${hide ? 0 : silverGoalPct}%` }} />
                </div>
              </div>
              <div>
                <div className="threshold-meta">
                  <span>{`Value Goal: ${hide ? '••••••' : formatMoney(stackSummary.totalMeltUsd, 0, settings.currency, fxRates)}`}</span>
                  <span>{hide ? '(••%)' : `${Math.round(usdGoalPct)}%`}</span>
                </div>
                <div className="threshold-track">
                  <div className="threshold-fill up" style={{ width: `${hide ? 0 : usdGoalPct}%` }} />
                </div>
              </div>
            </div>
          </section>

          <section className="panel" aria-label="What-If Price Simulator">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('What-If Price Simulator')}</h2>
                <p className="panel-subtitle">{t('See what your stack would be worth at future Gold & Silver prices')}</p>
              </div>
              <strong className="mono" style={{ fontSize: 16 }}>
                {hide ? '••••••' : formatMoney(whatIfTotalUsd, 2, settings.currency, fxRates)}
              </strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label className="field-group">
                <span>{`Simulated Gold: ${formatMoney(whatIfGold, 0, settings.currency, fxRates)} / oz`}</span>
                <input
                  type="range"
                  min="1500"
                  max="10000"
                  step="50"
                  value={whatIfGold}
                  onChange={(e) => setWhatIfGold(Number(e.target.value))}
                />
              </label>
              <label className="field-group">
                <span>{`Simulated Silver: ${formatMoney(whatIfSilver, 0, settings.currency, fxRates)} / oz`}</span>
                <input
                  type="range"
                  min="20"
                  max="200"
                  step="1"
                  value={whatIfSilver}
                  onChange={(e) => setWhatIfSilver(Number(e.target.value))}
                />
              </label>
            </div>
          </section>
        </div>
      )}

      {sub === 'lots' && (
        <section className="panel" aria-label="Purchase Lot Ledger">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">{t('Dated Purchase Lot Ledger')}</h2>
              <p className="panel-subtitle">
                {t('Log individual coins & bars to plot your entry lines directly on the candlestick chart')}
              </p>
            </div>
          </div>

          <form
            onSubmit={handleAddLot}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}
          >
            <select
              className="text-input"
              value={lotMetal}
              onChange={(e) => setLotMetal(e.target.value as MetalKey)}
              aria-label="Lot metal"
            >
              <option value="gold">Gold (XAU)</option>
              <option value="silver">Silver (XAG)</option>
            </select>
            <input
              type="number"
              className="text-input"
              placeholder="Ounces (oz)"
              step="0.01"
              min="0.01"
              required
              value={lotOz}
              onChange={(e) => setLotOz(e.target.value)}
            />
            <input
              type="number"
              className="text-input"
              placeholder="Cost USD / oz"
              step="0.01"
              min="0"
              required
              value={lotCost}
              onChange={(e) => setLotCost(e.target.value)}
            />
            <input
              type="text"
              className="text-input"
              placeholder="Form (e.g. Eagle)"
              maxLength={60}
              value={lotForm}
              onChange={(e) => setLotForm(e.target.value)}
            />
            <input
              type="date"
              className="text-input"
              value={lotDate}
              onChange={(e) => setLotDate(e.target.value)}
            />
            <button type="submit" className="btn">
              + Add Lot
            </button>
          </form>

          {settings.stackLots.length === 0 ? (
            <p className="panel-note">{t('No individual purchase lots logged yet.')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {settings.stackLots.map((lot) => {
                const liveP = lot.metal === 'gold' ? gSpot : sSpot;
                const valUsd = lot.oz * liveP;
                const costUsd = lot.oz * lot.cost;
                const pnlUsd = valUsd - costUsd;
                return (
                  <div
                    key={lot.id}
                    className="stat-box"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                  >
                    <div>
                      <strong>{`${lot.metal.toUpperCase()} · ${hide ? '•• oz' : `${lot.oz} oz`} · ${lot.form}`}</strong>
                      <div className="panel-subtitle mono">
                        {`${lot.date} · Cost ${hide ? '••••' : formatMoney(lot.cost, 2, settings.currency, fxRates)}/oz · P/L ${hide ? '••••' : formatSignedMoney(pnlUsd, 2, settings.currency, fxRates)}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="chip-toggle"
                      onClick={() => deleteStackLot(lot.id)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </section>
  );
};
