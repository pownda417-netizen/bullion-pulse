import React from 'react';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';

export const BottomNav: React.FC = () => {
  const { activeView, setActiveView } = useBullion();
  const { t } = useI18n();

  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      <button
        type="button"
        className={`nav-btn${activeView === 'markets' ? ' active' : ''}`}
        id="nav-markets"
        aria-current={activeView === 'markets' ? 'page' : undefined}
        onClick={() => setActiveView('markets')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
        <span>{t('Markets')}</span>
      </button>

      <button
        type="button"
        className={`nav-btn${activeView === 'outlook' ? ' active' : ''}`}
        id="nav-outlook"
        aria-current={activeView === 'outlook' ? 'page' : undefined}
        onClick={() => setActiveView('outlook')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
        <span>{t('Outlook')}</span>
      </button>

      <button
        type="button"
        className={`nav-btn${activeView === 'trade' ? ' active' : ''}`}
        id="nav-trade"
        aria-current={activeView === 'trade' ? 'page' : undefined}
        onClick={() => setActiveView('trade')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
        <span>{t('Trade')}</span>
      </button>
    </nav>
  );
};
