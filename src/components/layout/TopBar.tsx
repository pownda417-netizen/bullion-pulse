import React, { useState } from 'react';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { formatCompactMoney, formatTime, THEME_MAP } from '../../utils/format';

export const TopBar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    settings,
    resolvedDeskLayout,
    setDeskLayout,
    mode,
    lastUpdated,
    stackSummary,
    fxRates,
    togglePrivacyMode,
    refreshNow,
    cycleTheme,
  } = useBullion();
  const { t } = useI18n();
  const [spinning, setSpinning] = useState(false);

  const statusText =
    mode === 'live'
      ? `Live 15s · ${formatTime(lastUpdated)}`
      : mode === 'demo'
        ? 'Synced Snapshot · 10m Refresh'
        : t('Connecting to spot feed…');

  const dotClass = `status-dot${mode === 'live' ? ' live' : mode === 'demo' ? ' demo' : ''}`;
  const themeMeta = THEME_MAP[settings.theme] || THEME_MAP.dark;

  const handleRefresh = async () => {
    setSpinning(true);
    try {
      await refreshNow();
    } finally {
      setTimeout(() => setSpinning(false), 350);
    }
  };

  return (
    <header className="top-bar">
      <div className="brand">
        <img
          src="./icons/icon-192.png"
          alt="Bullion Pulse icon"
          className="brand-icon"
          width={34}
          height={34}
        />
        <div className="brand-text">
          <h1 className="brand-title">Bullion Pulse</h1>
          <div className="status-line">
            <span className={dotClass} id="status-dot" aria-hidden="true" />
            <span id="status-text">{statusText}</span>
          </div>
        </div>
      </div>

      <nav className="top-nav" aria-label="Primary navigation">
        <button
          type="button"
          className={`nav-btn${activeView === 'markets' ? ' active' : ''}`}
          id="top-nav-markets"
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
          id="top-nav-outlook"
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
          id="top-nav-trade"
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

      <div className="header-actions">
        <div className="desk-mode-bar" id="desk-mode-bar" role="group" aria-label="Wide-screen desk layout">
          <button
            type="button"
            id="desk-mode-single"
            className={`desk-pill-btn${resolvedDeskLayout === 'single' ? ' active' : ''}`}
            aria-pressed={resolvedDeskLayout === 'single'}
            title={t('Standard single view')}
            onClick={() => setDeskLayout('single')}
          >
            {t('Single')}
          </button>
          <button
            type="button"
            id="desk-mode-split"
            className={`desk-pill-btn${resolvedDeskLayout === 'split' ? ' active' : ''}`}
            aria-pressed={resolvedDeskLayout === 'split'}
            title={t('Split-Desk: pin live chart on the left')}
            onClick={() => setDeskLayout('split')}
          >
            {t('Split')}
          </button>
          <button
            type="button"
            id="desk-mode-3col"
            className={`desk-pill-btn${resolvedDeskLayout === 'ultrawide' ? ' active' : ''}`}
            aria-pressed={resolvedDeskLayout === 'ultrawide'}
            title={t('3-Column Desk: Markets, Outlook & Trade side-by-side')}
            onClick={() => setDeskLayout('ultrawide')}
          >
            {t('3-Col')}
          </button>
        </div>

        <button
          type="button"
          className={`header-melt-btn${activeView === 'stack' ? ' active' : ''}`}
          id="btn-header-melt"
          aria-label={t('Open My Stack')}
          title={t('My Stack Total — click to open My Stack')}
          onClick={() => setActiveView('stack')}
        >
          <span className="header-melt-k">{t('Stack')}</span>
          <strong className="header-melt-v" id="header-melt-val">
            {settings.privacyMode
              ? '••••••'
              : formatCompactMoney(stackSummary.totalMeltUsd, settings.currency, fxRates)}
          </strong>
        </button>

        <button
          type="button"
          className={`icon-btn${settings.privacyMode ? ' active' : ''}`}
          id="btn-privacy-toggle"
          aria-label={t('Hide or show my stack balance')}
          aria-pressed={settings.privacyMode}
          title={
            settings.privacyMode
              ? 'Privacy Mode ON — click to show your stack amounts'
              : 'Privacy Mode — hide your stack amounts'
          }
          onClick={togglePrivacyMode}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {settings.privacyMode ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>

        <button
          type="button"
          className={`icon-btn${spinning ? ' spinning' : ''}`}
          id="btn-refresh"
          aria-label={t('Refresh spot prices')}
          title={t('Refresh spot prices')}
          onClick={() => void handleRefresh()}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
        </button>

        <button
          type="button"
          className="icon-btn"
          id="btn-theme"
          aria-label={`Current theme ${themeMeta.name}. Click to cycle vault themes`}
          title={`Theme: ${themeMeta.name} — click to switch`}
          onClick={cycleTheme}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        </button>

        <button
          type="button"
          className={`icon-btn${activeView === 'alerts' ? ' active' : ''}`}
          id="btn-settings"
          aria-label={t('Open settings and alerts')}
          aria-pressed={activeView === 'alerts'}
          title={t('Settings & Alerts')}
          onClick={() => setActiveView(activeView === 'alerts' ? 'markets' : 'alerts')}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
};
