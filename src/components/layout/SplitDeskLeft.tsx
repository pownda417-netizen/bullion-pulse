import React from 'react';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { MarketsLiveTab } from '../markets/MarketsLiveTab';

export const SplitDeskLeft: React.FC = () => {
  const { setDeskLayout } = useBullion();
  const { t } = useI18n();

  return (
    <aside className="split-desk-left" id="split-desk-left" aria-label="Pinned live prices and chart">
      <div className="split-pinned-bar">
        <span className="split-pinned-label">{t('Pinned Live Chart · Split-Desk')}</span>
        <button
          type="button"
          className="chip-toggle"
          id="btn-exit-split-desk"
          onClick={() => setDeskLayout('single')}
        >
          {t('Exit Split')}
        </button>
      </div>
      <div className="split-desk-chart-slot" id="split-desk-chart-slot">
        <MarketsLiveTab inSplitPane />
      </div>
    </aside>
  );
};
