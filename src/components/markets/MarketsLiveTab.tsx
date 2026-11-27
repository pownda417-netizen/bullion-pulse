import React from 'react';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { convertUnit, formatMoney } from '../../utils/format';
import { SpotCard } from './SpotCard';
import { CandlestickChart } from './CandlestickChart';

interface MarketsLiveTabProps {
  inSplitPane?: boolean;
}

export const MarketsLiveTab: React.FC<MarketsLiveTabProps> = ({ inSplitPane = false }) => {
  const { quotes, settings, fxRates, candles, feedTrust } = useBullion();
  const { t } = useI18n();

  const ratio =
    quotes.gold.price != null && quotes.silver.price != null && quotes.silver.price > 0
      ? `${(quotes.gold.price / quotes.silver.price).toFixed(1)} : 1`
      : '—';

  const activeBars = candles[settings.selectedMetal] || [];
  const todayHigh = activeBars.length ? Math.max(...activeBars.map((b) => b.h)) : null;
  const todayLow = activeBars.length ? Math.min(...activeBars.map((b) => b.l)) : null;

  return (
    <div className={inSplitPane ? 'split-live-stack' : 'markets-live-stack'}>
      <div className={inSplitPane ? 'split-spot-pair' : 'spot-cards-grid'}>
        <SpotCard metal="gold" />
        <SpotCard metal="silver" />
      </div>

      <CandlestickChart />

      <section className="stats-row" aria-label="Key daily market metrics">
        <div className="stat-box">
          <div className="stat-label">{t('Gold / Silver Ratio')}</div>
          <div className="stat-value mono">{ratio}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">{t('Gold Yesterday')}</div>
          <div className="stat-value mono">
            {formatMoney(convertUnit(quotes.gold.prevClose, settings.unit), 2, settings.currency, fxRates)}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">{t('Silver Yesterday')}</div>
          <div className="stat-value mono">
            {formatMoney(convertUnit(quotes.silver.prevClose, settings.unit), 2, settings.currency, fxRates)}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">{t("Today's High")}</div>
          <div className="stat-value mono">
            {formatMoney(convertUnit(todayHigh, settings.unit), 2, settings.currency, fxRates)}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">{t("Today's Low")}</div>
          <div className="stat-value mono">
            {formatMoney(convertUnit(todayLow, settings.unit), 2, settings.currency, fxRates)}
          </div>
        </div>
        <div className="stat-box">
          <div className="stat-label">{t('Feed Trust')}</div>
          <div className="stat-value">
            {feedTrust.status === 'verified' ? t('Verified · 15s') : feedTrust.status}
          </div>
        </div>
      </section>
    </div>
  );
};
