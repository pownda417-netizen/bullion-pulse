import React from 'react';
import type { MetalKey } from '../../types/bullion';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { clampNum, convertUnit, formatMoney, formatSignedMoney, formatSignedPct } from '../../utils/format';

interface SpotCardProps {
  metal: MetalKey;
}

export const SpotCard: React.FC<SpotCardProps> = ({ metal }) => {
  const { settings, updateSettings, quotes, futures, fxRates } = useBullion();
  const { t } = useI18n();

  const quote = quotes[metal];
  const fut = futures[metal];
  const isGold = metal === 'gold';
  const selected = settings.selectedMetal === metal;
  const threshold = isGold ? settings.goldThreshold : settings.silverThreshold;
  const unitLabel = `${settings.currency} / ${settings.unit === 'g' ? t('Gram') : t('Troy oz')}`;

  const dispPrice = convertUnit(quote.price, settings.unit);
  const dispChg = convertUnit(quote.chg, settings.unit);
  const absPct = Math.abs(quote.pct || 0);
  const meterPct = clampNum((absPct / Math.max(0.25, threshold)) * 100, 0, 100);
  const dirClass = quote.pct > 0.005 ? 'up' : quote.pct < -0.005 ? 'down' : 'flat';

  const futPriceDisp = convertUnit(fut?.price, settings.unit);
  const basisUsd = fut?.price != null && quote.price != null ? fut.price - quote.price : null;
  const basisPct = basisUsd != null && quote.price ? (basisUsd / quote.price) * 100 : null;
  const curveLabel =
    basisPct == null
      ? t('Normal')
      : basisPct < -0.15
        ? t('Supply Shortage')
        : basisPct < 0.1
          ? t('Tight Supply')
          : t('Normal');
  const curveTone = basisPct != null && basisPct < -0.15 ? 'shortage' : basisPct != null && basisPct < 0.1 ? 'tight' : 'normal';

  const handleSelect = () => {
    updateSettings({ selectedMetal: metal, chartMode: metal });
  };

  return (
    <article
      className={`metal-card${selected ? ' selected' : ''}`}
      id={`card-${metal}`}
      data-metal={metal}
      tabIndex={0}
      aria-label={`${isGold ? 'Gold' : 'Silver'} spot price card`}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      }}
    >
      <div className="metal-header">
        <div className="metal-identity">
          <div className={`metal-badge ${metal}`}>{isGold ? 'XAU' : 'XAG'}</div>
          <div>
            <div className="metal-name">{t(isGold ? 'Gold Spot' : 'Silver Spot')}</div>
            <div className="metal-sub">{unitLabel}</div>
          </div>
        </div>
        <div className={`change-pill ${dirClass}`}>{formatSignedPct(quote.pct, 2)}</div>
      </div>

      <div className="metal-price-row">
        <div className="metal-price">
          {formatMoney(dispPrice, 2, settings.currency, fxRates)}
        </div>
        <div className={`metal-delta-usd ${dirClass}`}>
          {formatSignedMoney(dispChg, 2, settings.currency, fxRates)}
        </div>
      </div>

      <div className="threshold-meter">
        <div className="threshold-meta">
          <span>{`${t("Today's move vs")} ±${threshold}%`}</span>
          <span>{`${Math.round(meterPct)}%`}</span>
        </div>
        <div className="threshold-track">
          <div
            className={`threshold-fill ${dirClass}`}
            style={{ width: `${meterPct}%` }}
          />
        </div>
      </div>

      <div className="metal-futures-strip" aria-label={`${isGold ? 'Gold' : 'Silver'} Futures`}>
        <div className="metal-futures-row">
          <div className="metal-futures-left">
            <span className="metal-futures-k">{t(isGold ? 'Gold Futures' : 'Silver Futures')}</span>
            <strong className="metal-futures-price">
              {formatMoney(futPriceDisp, 2, settings.currency, fxRates)}
            </strong>
          </div>
          <div className="metal-futures-right">
            <span className="futures-basis">
              {basisUsd != null
                ? `vs Spot ${formatSignedMoney(convertUnit(basisUsd, settings.unit), 2, settings.currency, fxRates)}`
                : t('Diff vs Spot —')}
            </span>
            <span className={`futures-curve-pill ${curveTone}`}>{curveLabel}</span>
          </div>
        </div>
      </div>
    </article>
  );
};
