import React from 'react';
import type { OutlookSubView } from '../../types/bullion';
import { useBullion } from '../../context/BullionContext';
import { SubNav, type SubTabOption } from '../layout/SubNav';
import { ForecastTab } from './ForecastTab';
import { WhatMovesItTab } from './WhatMovesItTab';
import { VaultsMinersTab } from './VaultsMinersTab';
import { OddsTab } from './OddsTab';

const OUTLOOK_TABS: readonly SubTabOption<OutlookSubView>[] = [
  { id: 'forecast', label: 'Forecast' },
  { id: 'drivers', label: 'What Moves It' },
  { id: 'vaults', label: 'Vaults & Miners' },
  { id: 'sim', label: 'Odds' },
];

export const OutlookView: React.FC<{ active: boolean }> = ({ active }) => {
  const { settings, setSubView } = useBullion();
  const sub = settings.subViews.outlook;

  return (
    <section
      className={`view-panel${active ? ' active' : ''}`}
      id="view-outlook"
      aria-label="Quantitative outlook and drivers"
    >
      <SubNav
        ariaLabel="Outlook sections"
        tabs={OUTLOOK_TABS}
        activeTab={sub}
        onSelect={(next) => setSubView('outlook', next)}
      />

      {sub === 'forecast' && <ForecastTab />}
      {sub === 'drivers' && <WhatMovesItTab />}
      {sub === 'vaults' && <VaultsMinersTab />}
      {sub === 'sim' && <OddsTab />}
    </section>
  );
};
