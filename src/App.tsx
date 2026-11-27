import React from 'react';
import { useBullion } from './context/BullionContext';
import { useI18n } from './i18n/I18nContext';
import { TopBar } from './components/layout/TopBar';
import { SplitDeskLeft } from './components/layout/SplitDeskLeft';
import { BottomNav } from './components/layout/BottomNav';
import { MarketsView } from './components/markets/MarketsView';
import { OutlookView } from './components/outlook/OutlookView';
import { TradeView } from './components/trade/TradeView';
import { StackView } from './components/stack/StackView';
import { SettingsView } from './components/settings/SettingsView';

export const App: React.FC = () => {
  const {
    activeView,
    resolvedDeskLayout,
    alertBanner,
    dismissBanner,
    toastMsg,
  } = useBullion();
  const { t } = useI18n();

  const isSplit = resolvedDeskLayout === 'split';
  const isUltrawide = resolvedDeskLayout === 'ultrawide';

  return (
    <div className="app-shell">
      <TopBar />

      <main className="main-content">
        {alertBanner.visible && (
          <section className="alert-banner" id="alert-banner" role="alert">
            <div>
              <div className="alert-banner-title">{alertBanner.title}</div>
              <div className="alert-banner-body">{alertBanner.body}</div>
            </div>
            <button
              type="button"
              className="alert-dismiss"
              aria-label="Dismiss alert"
              onClick={dismissBanner}
            >
              &times;
            </button>
          </section>
        )}

        <div className="desk-workspace" id="desk-workspace">
          {isSplit && <SplitDeskLeft />}

          <div className="desk-views-wrap" id="desk-views-wrap">
            {isUltrawide ? (
              <>
                <MarketsView active />
                <OutlookView active />
                {activeView === 'stack' ? (
                  <StackView active />
                ) : activeView === 'alerts' ? (
                  <SettingsView active />
                ) : (
                  <TradeView active />
                )}
              </>
            ) : (
              <>
                {activeView === 'markets' && <MarketsView active />}
                {activeView === 'outlook' && <OutlookView active />}
                {activeView === 'trade' && <TradeView active />}
                {activeView === 'stack' && <StackView active />}
                {activeView === 'alerts' && <SettingsView active />}
              </>
            )}
          </div>
        </div>
      </main>

      {toastMsg && (
        <div id="display-toast" className="display-toast show" role="status" aria-live="polite">
          {t(toastMsg)}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default App;
