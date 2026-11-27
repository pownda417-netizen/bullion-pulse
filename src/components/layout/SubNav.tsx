import React from 'react';
import { useI18n } from '../../i18n/I18nContext';

export interface SubTabOption<T extends string> {
  id: T;
  label: string;
}

interface SubNavProps<T extends string> {
  ariaLabel: string;
  tabs: readonly SubTabOption<T>[];
  activeTab: T;
  onSelect: (tab: T) => void;
}

export function SubNav<T extends string>({
  ariaLabel,
  tabs,
  activeTab,
  onSelect,
}: SubNavProps<T>): React.ReactElement {
  const { t } = useI18n();

  return (
    <div className="sub-nav" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`sub-tab-btn${isActive ? ' active' : ''}`}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
          >
            {t(tab.label)}
          </button>
        );
      })}
    </div>
  );
}
