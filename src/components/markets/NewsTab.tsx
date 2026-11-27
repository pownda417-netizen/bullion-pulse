import React, { useEffect, useMemo, useState } from 'react';
import type { NewsFilterMode, NewsTopicKey } from '../../types/bullion';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { sanitizeHttpUrl } from '../../utils/security';

const TOPIC_OPTIONS: readonly { id: NewsTopicKey; label: string }[] = [
  { id: 'all', label: 'All Topics' },
  { id: 'central_banks', label: 'Central Banks' },
  { id: 'tech_solar_ai', label: 'AI & Solar Tech' },
  { id: 'vaults_physical', label: 'Vaults & Physical' },
  { id: 'asia_retail', label: 'Asia & Retail' },
  { id: 'geo_space', label: 'Geopolitics & Space' },
  { id: 'macro_debt', label: 'Macro & Debt' },
  { id: 'miners_supply', label: 'Miners & Supply' },
];

export const NewsTab: React.FC = () => {
  const { outlook, settings, updateSettings } = useBullion();
  const { t } = useI18n();

  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [limit, setLimit] = useState(25);

  // 160ms debounced search (instant restore when cleared to empty)
  useEffect(() => {
    const trimmed = rawQuery.trim().toLowerCase();
    if (!trimmed) {
      setDebouncedQuery('');
      return;
    }
    const id = setTimeout(() => setDebouncedQuery(trimmed), 160);
    return () => clearTimeout(id);
  }, [rawQuery]);

  const rawHeadlines = useMemo(() => {
    const arr = Array.isArray(outlook?.headlines)
      ? outlook.headlines
      : Array.isArray(outlook?.news)
        ? outlook.news
        : [];
    return arr as Array<Record<string, unknown>>;
  }, [outlook]);

  const filtered = useMemo(() => {
    return rawHeadlines.filter((item) => {
      const title = String(item.title || '');
      const source = String(item.source || '');
      const driver = String(item.driver || item.topic || '').toLowerCase();
      const gImp = Math.abs(Number(item.goldImpact ?? 0));
      const sImp = Math.abs(Number(item.silverImpact ?? 0));
      const isHype = Boolean(item.isHype) || (gImp < 0.15 && sImp < 0.15);

      if (settings.newsFilter === 'signal' && Math.max(gImp, sImp) < 0.3) return false;
      if (settings.newsFilter === 'nohype' && isHype) return false;

      if (settings.newsTopic !== 'all') {
        const topicMatch =
          String(item.topic || '') === settings.newsTopic ||
          (settings.newsTopic === 'geo_space' && /geo|war|space|conflict/.test(driver + title.toLowerCase())) ||
          (settings.newsTopic === 'central_banks' && /central|fed|ecb|pboc|rate/.test(driver + title.toLowerCase())) ||
          (settings.newsTopic === 'tech_solar_ai' && /ai|solar|chip|data|ev|nvidia/.test(driver + title.toLowerCase())) ||
          (settings.newsTopic === 'vaults_physical' && /comex|vault|sge|shanghai|bullion|physical/.test(driver + title.toLowerCase())) ||
          (settings.newsTopic === 'asia_retail' && /china|india|asia|thai|japan/.test(driver + title.toLowerCase())) ||
          (settings.newsTopic === 'macro_debt' && /inflat|debt|dollar|dxy|yield|cpi/.test(driver + title.toLowerCase())) ||
          (settings.newsTopic === 'miners_supply' && /mine|supply|output|deficit/.test(driver + title.toLowerCase()));
        if (!topicMatch) return false;
      }

      if (debouncedQuery) {
        const hay = `${title} ${source} ${driver}`.toLowerCase();
        if (!hay.includes(debouncedQuery)) return false;
      }
      return true;
    });
  }, [debouncedQuery, rawHeadlines, settings.newsFilter, settings.newsTopic]);

  const visible = filtered.slice(0, limit);

  return (
    <section className="panel" aria-label="Bullion Market News Desk">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('Live Gold & Silver News Desk')}</h2>
          <p className="panel-subtitle">
            {`${filtered.length} ${t('articles')} · ${t('Scored for Au & Ag directional impact')}`}
          </p>
        </div>
      </div>

      {/* Search + Signal Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <input
          type="search"
          className="text-input"
          id="news-search-input"
          maxLength={120}
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value.slice(0, 120))}
          placeholder={t('Search headlines, central banks, miners, AI…')}
          aria-label={t('Search news headlines')}
          style={{ flex: '1 1 220px', minWidth: 180 }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Signal filter">
          {([
            { id: 'all', label: 'All' },
            { id: 'signal', label: 'Real Signal' },
            { id: 'nohype', label: 'Hide Hype' },
          ] as const).map((f: { id: NewsFilterMode; label: string }) => (
            <button
              key={f.id}
              type="button"
              className={`chip-toggle${settings.newsFilter === f.id ? ' active' : ''}`}
              aria-pressed={settings.newsFilter === f.id}
              onClick={() => updateSettings({ newsFilter: f.id })}
            >
              {t(f.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Topic Pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }} role="group" aria-label="News topics">
        {TOPIC_OPTIONS.map((tp) => (
          <button
            key={tp.id}
            type="button"
            className={`chip-toggle${settings.newsTopic === tp.id ? ' active' : ''}`}
            aria-pressed={settings.newsTopic === tp.id}
            onClick={() => {
              updateSettings({ newsTopic: tp.id });
              setLimit(25);
            }}
          >
            {t(tp.label)}
          </button>
        ))}
      </div>

      {/* Articles List — Pure React JSX with sanitized https:// URLs only */}
      {visible.length === 0 ? (
        <p className="panel-note">{t('No headlines match your current search or topic filter.')}</p>
      ) : (
        <div className="news-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((item, idx) => {
            const title = String(item.title || 'Untitled update');
            const source = String(item.source || 'Market Wire');
            const safeUrl = sanitizeHttpUrl(item.url || item.link);
            const gImp = Number(item.goldImpact ?? 0);
            const sImp = Number(item.silverImpact ?? 0);
            const driverLbl = String(item.driverLabel || item.topicLabel || 'Macro');
            const pub = item.publishedAt ? new Date(String(item.publishedAt)).toLocaleDateString() : '';

            return (
              <article
                key={`${idx}-${title.slice(0, 24)}`}
                className="stat-box"
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  {safeUrl ? (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--text)', fontWeight: 600, fontSize: 13.5, textDecoration: 'none', lineHeight: 1.35 }}
                    >
                      {title}
                    </a>
                  ) : (
                    <strong style={{ fontSize: 13.5, lineHeight: 1.35 }}>{title}</strong>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11.5 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{source}</span>
                  {pub && <span style={{ color: 'var(--text-muted)' }}>{`· ${pub}`}</span>}
                  <span className="badge-pill neutral" style={{ fontSize: 10.5 }}>{driverLbl}</span>
                  <span
                    className={`badge-pill ${gImp >= 0.05 ? 'bullish' : gImp <= -0.05 ? 'bearish' : 'neutral'}`}
                    style={{ fontSize: 10.5 }}
                  >
                    {`Au ${gImp >= 0 ? '+' : ''}${Math.round(gImp * 100)}`}
                  </span>
                  <span
                    className={`badge-pill ${sImp >= 0.05 ? 'bullish' : sImp <= -0.05 ? 'bearish' : 'neutral'}`}
                    style={{ fontSize: 10.5 }}
                  >
                    {`Ag ${sImp >= 0 ? '+' : ''}${Math.round(sImp * 100)}`}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {visible.length < filtered.length && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => setLimit((n) => n + 25)}>
            {t('Load +25 More')}
          </button>
          <button type="button" className="chip-toggle" onClick={() => setLimit(filtered.length)}>
            {`${t('Show All')} (${filtered.length})`}
          </button>
        </div>
      )}
    </section>
  );
};
