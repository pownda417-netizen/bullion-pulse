import React from 'react';
import type { CurrencyCode, LangCode, MarketsSubView } from '../../types/bullion';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { CURRENCY_META, LANGUAGES } from '../../utils/format';
import { SubNav, type SubTabOption } from '../layout/SubNav';
import { MarketsLiveTab } from './MarketsLiveTab';
import { GlobalMapsTab } from './GlobalMapsTab';
import { DeepChartsTab } from './DeepChartsTab';
import { NewsTab } from './NewsTab';

const MARKETS_TABS: readonly SubTabOption<MarketsSubView>[] = [
  { id: 'live', label: 'Live & Chart' },
  { id: 'global', label: 'Global & Maps' },
  { id: 'charts', label: 'Deep Charts' },
  { id: 'news', label: 'News' },
];

export const MarketsView: React.FC<{ active: boolean }> = ({ active }) => {
  const { settings, updateSettings, setSubView, resolvedDeskLayout } = useBullion();
  const { t } = useI18n();
  const sub = settings.subViews.markets;
  const isSplit = resolvedDeskLayout === 'split';
  const curLangLabel = LANGUAGES.find((l) => l.code === settings.language)?.label || 'EN · English';
  const curCurrMeta = CURRENCY_META[settings.currency] || CURRENCY_META.USD;
  const curCurrLabel = `${curCurrMeta.label} ${curCurrMeta.symbol.trim()}`;

  return (
    <section
      className={`view-panel${active ? ' active' : ''}`}
      id="view-markets"
      aria-label="Spot metal markets"
    >
      <div className="toolbar-row">
        <span className="section-label">{t('Live Gold & Silver Prices')}</span>
        <div className="toolbar-controls">
          <div className="bp-select-wrap">
            <div className="bp-select-face lang-face" aria-hidden="true">
              <span className="bp-select-label">{curLangLabel}</span>
              <svg className="bp-select-arrow" viewBox="0 0 12 12" width="11" height="11">
                <path d="M2.5 4.25L6 7.75L9.5 4.25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <select
              id="select-language"
              className="bp-select-native"
              aria-label="App language"
              value={settings.language}
              onChange={(e) => updateSettings({ language: e.target.value as LangCode })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bp-select-wrap">
            <div className="bp-select-face currency-face mono" aria-hidden="true">
              <span className="bp-select-label">{curCurrLabel}</span>
              <svg className="bp-select-arrow" viewBox="0 0 12 12" width="11" height="11">
                <path d="M2.5 4.25L6 7.75L9.5 4.25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <select
              id="select-currency"
              className="bp-select-native"
              aria-label="Display currency"
              value={settings.currency}
              onChange={(e) => updateSettings({ currency: e.target.value as CurrencyCode })}
            >
              <optgroup label="Americas & Europe">
                <option value="USD">USD $ · US</option>
                <option value="CAD">CAD C$ · Canada</option>
                <option value="EUR">EUR € · Europe</option>
                <option value="GBP">GBP £ · UK</option>
                <option value="CHF">CHF Fr · Switzerland</option>
                <option value="AUD">AUD A$ · Australia</option>
                <option value="MXN">MXN MX$ · Mexico</option>
              </optgroup>
              <optgroup label="Asia & Bullion Hubs">
                <option value="INR">INR ₹ · India</option>
                <option value="CNY">CNY CN¥ · China</option>
                <option value="JPY">JPY ¥ · Japan</option>
                <option value="THB">THB ฿ · Thailand</option>
                <option value="LAK">LAK ₭ · Laos</option>
                <option value="SGD">SGD S$ · Singapore</option>
                <option value="HKD">HKD HK$ · Hong Kong</option>
                <option value="KRW">KRW ₩ · South Korea</option>
                <option value="VND">VND ₫ · Vietnam</option>
                <option value="IDR">IDR Rp · Indonesia</option>
              </optgroup>
              <optgroup label="Middle East & Africa">
                <option value="AED">AED DH · Dubai / UAE</option>
                <option value="SAR">SAR SR · Saudi Arabia</option>
                <option value="TRY">TRY ₺ · Turkey</option>
                <option value="ZAR">ZAR R · South Africa</option>
              </optgroup>
            </select>
          </div>

          <div className="segmented" role="group" aria-label="Weight unit">
            <button
              type="button"
              id="unit-oz"
              className={settings.unit === 'oz' ? 'active' : ''}
              onClick={() => updateSettings({ unit: 'oz' })}
            >
              {t('Troy oz')}
            </button>
            <button
              type="button"
              id="unit-g"
              className={settings.unit === 'g' ? 'active' : ''}
              onClick={() => updateSettings({ unit: 'g' })}
            >
              {t('Gram')}
            </button>
          </div>
        </div>
      </div>

      <SubNav
        ariaLabel="Markets sections"
        tabs={MARKETS_TABS}
        activeTab={sub}
        onSelect={(next) => setSubView('markets', next)}
      />

      {sub === 'live' &&
        (isSplit ? (
          <div className="panel split-pinned-placeholder">
            <strong>{t('Live & Chart is pinned on the left pane')}</strong>
            <p className="panel-subtitle" style={{ marginTop: 6 }}>
              {t(
                'Spot prices, Futures, the live Precision Chart & key ratios stay open on the left while you browse Global & Maps, Deep Charts, News, Outlook, Trade, or Stack on this side.'
              )}
            </p>
          </div>
        ) : (
          <MarketsLiveTab />
        ))}

      {sub === 'global' && <GlobalMapsTab />}
      {sub === 'charts' && <DeepChartsTab />}
      {sub === 'news' && <NewsTab />}
    </section>
  );
};
