import React, { useRef, useState } from 'react';
import type { AlertsSubView, CurrencyCode, DeskLayoutMode, DirectionPref } from '../../types/bullion';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { CURRENCY_META, LANGUAGES, VAULT_THEMES } from '../../utils/format';
import { generatePrivateNtfyTopic, sanitizeNtfyTopic } from '../../utils/security';
import { SubNav, type SubTabOption } from '../layout/SubNav';

const SETTINGS_TABS: readonly SubTabOption<AlertsSubView>[] = [
  { id: 'display', label: 'Display' },
  { id: 'rules', label: 'Alert Rules' },
  { id: 'phone', label: 'Phone & Log' },
  { id: 'setup', label: 'Install' },
];

export const SettingsView: React.FC<{ active: boolean }> = ({ active }) => {
  const {
    settings,
    updateSettings,
    setSubView,
    setActiveView,
    lastMainView,
    selectTheme,
    setDeskLayout,
    alertLog,
    clearAlertLog,
    sendTestNtfy,
    exportBackup,
    importBackup,
    showToast,
  } = useBullion();
  const { t, setLanguage } = useI18n();

  const sub = settings.subViews.alerts;
  const [revealNtfy, setRevealNtfy] = useState(false);
  const [ntfyDraft, setNtfyDraft] = useState(settings.ntfyTopic);
  const [testBusy, setTestBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveNtfy = (raw: string) => {
    setNtfyDraft(raw);
    const cleaned = sanitizeNtfyTopic(raw);
    updateSettings({ ntfyTopic: cleaned });
  };

  const handleGenerateTopic = () => {
    const fresh = generatePrivateNtfyTopic();
    setNtfyDraft(fresh);
    setRevealNtfy(true);
    updateSettings({ ntfyTopic: fresh });
    showToast('🔐 Generated 128-bit private ntfy channel');
  };

  const handleCopyConfig = async () => {
    const snippet = [
      `NTFY_TOPIC=${settings.ntfyTopic ? '<your-private-channel>' : 'your-private-topic'}`,
      `GOLD_THRESHOLD_PCT=${settings.goldThreshold}`,
      `SILVER_THRESHOLD_PCT=${settings.silverThreshold}`,
      `SHANGHAI_PREMIUM_USD=${settings.shanghaiThreshold}`,
      'CATALYST_ALERTS=true',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(snippet);
      showToast('✓ Copied GitHub Actions config snippet');
    } catch {
      showToast('Copy failed — select text manually');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      showToast('⚠️ Backup file exceeds 512KB limit');
      e.target.value = '';
      return;
    }
    const text = await file.text();
    importBackup(text);
    e.target.value = '';
  };

  return (
    <section
      className={`view-panel${active ? ' active' : ''}`}
      id="view-alerts"
      aria-label="Settings and alerts"
    >
      <div className="toolbar-row">
        <button
          type="button"
          className="chip-toggle"
          onClick={() => setActiveView(lastMainView)}
        >
          {t('← Back')}
        </button>
        <span className="section-label">{t('Settings, Display & Alerts')}</span>
      </div>

      <SubNav
        ariaLabel="Settings sections"
        tabs={SETTINGS_TABS}
        activeTab={sub}
        onSelect={(next) => setSubView('alerts', next)}
      />

      {sub === 'display' && (
        <div className="sub-tab-stack">
          {/* 7 Vault Themes Gallery */}
          <section className="panel" aria-label="Vault Themes">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('7 Designer Vault Themes')}</h2>
                <p className="panel-subtitle">
                  {t('Instant theme switching across OLED, Swiss Gold, Mint Silver, Retro Terminal & Paper')}
                </p>
              </div>
            </div>
            <div className="vault-theme-grid" id="vault-theme-grid">
              {VAULT_THEMES.map((th) => {
                const isActive = settings.theme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    className={`vault-theme-card${isActive ? ' active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => selectTheme(th.id, true)}
                  >
                    <div className="vt-swatches">
                      {th.swatches.map((hex) => (
                        <span key={hex} className="vt-swatch" style={{ backgroundColor: hex }} />
                      ))}
                    </div>
                    <strong className="vt-name">{th.name}</strong>
                    <span className="vt-desc">{th.desc}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 7 Languages + Currency + Layout + OLED Pixel-Shift */}
          <section className="panel" aria-label="Language, Currency and Desk Mode">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('Language, Currency & Wide-Screen Desk')}</h2>
                <p className="panel-subtitle">
                  {t('7 full languages, 21 global currencies, Split-Desk & OLED burn-in protection')}
                </p>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div className="stat-label" style={{ marginBottom: 6 }}>{t('App Language')}</div>
              <div id="settings-lang-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    className={`chip-toggle${settings.language === l.code ? ' active' : ''}`}
                    aria-pressed={settings.language === l.code}
                    onClick={() => setLanguage(l.code)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <label className="field-group">
                <span>Display Currency</span>
                <select
                  className="text-input"
                  value={settings.currency}
                  onChange={(e) => updateSettings({ currency: e.target.value as CurrencyCode })}
                >
                  {Object.keys(CURRENCY_META).map((c) => (
                    <option key={c} value={c}>
                      {`${c} (${CURRENCY_META[c as CurrencyCode].symbol.trim()})`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-group">
                <span>Wide-Screen Desk Layout</span>
                <select
                  className="text-input"
                  value={settings.deskLayout}
                  onChange={(e) => setDeskLayout(e.target.value as DeskLayoutMode)}
                >
                  <option value="auto">Auto (Split on 1440px+)</option>
                  <option value="single">Single Column</option>
                  <option value="split">Split-Desk (Pin Live &amp; Chart Left)</option>
                  <option value="ultrawide">3-Column Ultrawide Desk</option>
                </select>
              </label>

              <label className="field-group" style={{ justifyContent: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settings.oledPixelShift}
                    onChange={(e) => updateSettings({ oledPixelShift: e.target.checked })}
                  />
                  OLED Pixel-Shift Burn-In Protection
                </span>
              </label>
            </div>
          </section>
        </div>
      )}

      {sub === 'rules' && (
        <div className="sub-tab-stack">
          <section className="panel" aria-label="Move Alert Thresholds">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('Big Daily Move & Smart Alert Rules')}</h2>
                <p className="panel-subtitle">
                  {t('Customize percentage thresholds, exact price targets, smart regime alerts & quiet hours')}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 10, marginBottom: 14 }}>
              <label className="field-group">
                <span>Gold Alert Threshold (%)</span>
                <input
                  type="number"
                  className="text-input"
                  min="0.25"
                  max="25"
                  step="0.25"
                  value={settings.goldThreshold}
                  onChange={(e) => updateSettings({ goldThreshold: Number(e.target.value) })}
                />
              </label>
              <label className="field-group">
                <span>Silver Alert Threshold (%)</span>
                <input
                  type="number"
                  className="text-input"
                  min="0.5"
                  max="40"
                  step="0.25"
                  value={settings.silverThreshold}
                  onChange={(e) => updateSettings({ silverThreshold: Number(e.target.value) })}
                />
              </label>
              <label className="field-group">
                <span>Shanghai Premium Alert (USD)</span>
                <input
                  type="number"
                  className="text-input"
                  min="5"
                  max="500"
                  step="5"
                  value={settings.shanghaiThreshold}
                  onChange={(e) => updateSettings({ shanghaiThreshold: Number(e.target.value) })}
                />
              </label>
              <label className="field-group">
                <span>Alert Direction</span>
                <select
                  className="text-input"
                  value={settings.direction}
                  onChange={(e) => updateSettings({ direction: e.target.value as DirectionPref })}
                >
                  <option value="both">Both Up &amp; Down</option>
                  <option value="up">Surges Only (Up)</option>
                  <option value="down">Dips Only (Down)</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={settings.smartAlerts.backwardation}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      smartAlerts: { ...prev.smartAlerts, backwardation: e.target.checked },
                    }))
                  }
                />
                Backwardation Shortage Alert
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={settings.smartAlerts.shortSqueeze}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      smartAlerts: { ...prev.smartAlerts, shortSqueeze: e.target.checked },
                    }))
                  }
                />
                COMEX Squeeze Alert
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={settings.quietHours.enabled}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      quietHours: { ...prev.quietHours, enabled: e.target.checked },
                    }))
                  }
                />
                Quiet Hours ({`${settings.quietHours.start}:00 – ${settings.quietHours.end}:00`})
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              <label className="field-group">
                <span>Gold Above (USD)</span>
                <input
                  type="number"
                  className="text-input"
                  placeholder="e.g. 3800"
                  value={settings.targets.goldAbove}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      targets: { ...prev.targets, goldAbove: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="field-group">
                <span>Gold Below (USD)</span>
                <input
                  type="number"
                  className="text-input"
                  placeholder="e.g. 3300"
                  value={settings.targets.goldBelow}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      targets: { ...prev.targets, goldBelow: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="field-group">
                <span>Silver Above (USD)</span>
                <input
                  type="number"
                  className="text-input"
                  placeholder="e.g. 48"
                  value={settings.targets.silverAbove}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      targets: { ...prev.targets, silverAbove: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="field-group">
                <span>Silver Below (USD)</span>
                <input
                  type="number"
                  className="text-input"
                  placeholder="e.g. 35"
                  value={settings.targets.silverBelow}
                  onChange={(e) =>
                    updateSettings((prev) => ({
                      ...prev,
                      targets: { ...prev.targets, silverBelow: e.target.value },
                    }))
                  }
                />
              </label>
            </div>
          </section>
        </div>
      )}

      {sub === 'phone' && (
        <div className="sub-tab-stack">
          {/* Hardened Masked ntfy Channel + 128-bit Generator */}
          <section className="panel" aria-label="Phone Push Alerts via ntfy">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('Private Phone Push (ntfy.sh)')}</h2>
                <p className="panel-subtitle">
                  {t('Masked private topic sent inside JSON POST body (never exposed in URL paths)')}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <input
                type={revealNtfy ? 'text' : 'password'}
                id="input-ntfy-topic"
                className="text-input"
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
                placeholder="Click Generate for a private 128-bit channel…"
                value={ntfyDraft}
                onChange={(e) => handleSaveNtfy(e.target.value)}
                style={{ flex: '1 1 240px' }}
              />
              <button
                type="button"
                className="chip-toggle"
                id="btn-toggle-ntfy-visibility"
                onClick={() => setRevealNtfy((v) => !v)}
              >
                {revealNtfy ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="chip-toggle"
                id="btn-generate-ntfy"
                onClick={handleGenerateTopic}
              >
                🔐 Generate Private Channel
              </button>
              <button
                type="button"
                className="btn"
                disabled={testBusy || !settings.ntfyTopic}
                onClick={async () => {
                  setTestBusy(true);
                  try {
                    await sendTestNtfy();
                  } finally {
                    setTestBusy(false);
                  }
                }}
              >
                {testBusy ? 'Sending…' : 'Send Test Push'}
              </button>
            </div>
          </section>

          {/* Recent Alert Log */}
          <section className="panel" aria-label="Recent Alert History">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('Recent Alert Log')}</h2>
                <p className="panel-subtitle">{`${alertLog.length} recent notifications stored locally`}</p>
              </div>
              {alertLog.length > 0 && (
                <button type="button" className="chip-toggle" onClick={clearAlertLog}>
                  Clear Log
                </button>
              )}
            </div>

            {alertLog.length === 0 ? (
              <p className="panel-note">{t('No alerts triggered yet in this browser.')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alertLog.map((item, idx) => (
                  <div key={idx} className="stat-box" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <strong>{item.title}</strong>
                      <div className="panel-subtitle">{item.body}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {item.time}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {sub === 'setup' && (
        <div className="sub-tab-stack">
          <section className="panel" aria-label="Local Backup Export and Import">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{t('Encrypted-Safe Local Backup & Restore')}</h2>
                <p className="panel-subtitle">
                  {t('Export your stack lots, goals & settings (private ntfy channel is automatically redacted)')}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="btn" onClick={exportBackup}>
                💾 Export Backup JSON
              </button>
              <button
                type="button"
                className="chip-toggle"
                onClick={() => fileInputRef.current?.click()}
              >
                📂 Import Backup JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => void handleImportFile(e)}
              />
            </div>
          </section>

          <section className="panel" aria-label="GitHub Actions Background Setup">
            <div className="panel-header">
              <h2 className="panel-title">2. Free Phone Push &amp; News Engine</h2>
            </div>
            <div className="code-block">
              {`NTFY_TOPIC=<your-private-channel>\nGOLD_THRESHOLD_PCT=${settings.goldThreshold}\nSILVER_THRESHOLD_PCT=${settings.silverThreshold}\nSHANGHAI_PREMIUM_USD=${settings.shanghaiThreshold}\nCATALYST_ALERTS=true`}
            </div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 12 }}
              onClick={() => void handleCopyConfig()}
            >
              Copy Alert Config Snippet
            </button>
          </section>
        </div>
      )}
    </section>
  );
};
