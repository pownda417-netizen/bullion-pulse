import React, { useEffect, useMemo, useState } from 'react';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import { CURRENCY_META, formatMoney, formatSignedMoney } from '../../utils/format';
import { computeWorldGoldBoard, computeWorldHubs } from '../../engines/outlookEngine';

export const GlobalMapsTab: React.FC = () => {
  const { quotes, shanghai, fxRates, settings } = useBullion();
  const { t } = useI18n();
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const world = useMemo(() => computeWorldHubs(new Date(tick)), [tick]);
  const sgeGoldPrem = Number(shanghai?.gold?.premiumUsd ?? 18);
  const sgeSilverPrem = Number(shanghai?.silver?.premiumUsd ?? 1.85);
  const goldSpot = quotes.gold.price ?? 3500;
  const board = useMemo(
    () => computeWorldGoldBoard(goldSpot, fxRates, sgeGoldPrem),
    [fxRates, goldSpot, sgeGoldPrem]
  );

  return (
    <div className="sub-tab-stack">
      {/* 1. Live Global Vault World Map */}
      <section className="panel" aria-label="Live Global Vault World Map">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('Live Global Vault World Map')}</h2>
            <p className="panel-subtitle">
              {t('Glowing green dots show which major gold & silver markets are open right now')}
            </p>
          </div>
          <span className={`badge-pill ${world.activeCount > 0 ? 'bullish' : 'neutral'}`}>
            {t(world.bannerTitle)}
          </span>
        </div>

        <p className="panel-note" style={{ marginBottom: 12 }}>
          {t(world.bannerDesc)}
        </p>

        <div className="vault-map-wrap" id="vault-map-svg-wrap" style={{ marginBottom: 14 }}>
          {(() => {
            const byId = Object.fromEntries(world.hubs.map((h) => [h.id, h]));
            const arc = (aId: string, bId: string, lift: number) => {
              const a = byId[aId];
              const b = byId[bId];
              if (!a || !b) return '';
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2 - lift;
              return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
            };
            return (
              <svg
                viewBox="0 32 1000 388"
                preserveAspectRatio="xMidYMid slice"
                className="vault-map-svg"
                role="img"
                aria-label="Real satellite Earth-at-night map showing live global bullion centers"
              >
                <defs>
                  <radialGradient id="bp-map-vignette" cx="50%" cy="50%" r="65%">
                    <stop offset="65%" stopColor="rgba(7,11,22,0)" />
                    <stop offset="100%" stopColor="rgba(7,11,22,0.52)" />
                  </radialGradient>
                </defs>
                <image
                  href="./icons/world-map-night.jpg"
                  x="0"
                  y="0"
                  width="1000"
                  height="500"
                  preserveAspectRatio="none"
                />
                <rect x="0" y="32" width="1000" height="388" fill="url(#bp-map-vignette)" />
                {/* Subtle Equator & Prime Meridian guides */}
                <line x1="0" y1="250" x2="1000" y2="250" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 6" strokeWidth="0.8" />
                <line x1="500" y1="32" x2="500" y2="420" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 6" strokeWidth="0.8" />
                {/* Bullion flow routes connecting Western & Asian hubs */}
                <path d={arc('ny', 'lon', 34)} fill="none" stroke="rgba(212,168,67,0.6)" strokeWidth="1.6" strokeDasharray="4 4" />
                <path d={arc('lon', 'zur', 8)} fill="none" stroke="rgba(212,168,67,0.65)" strokeWidth="1.6" />
                <path d={arc('zur', 'dxb', 24)} fill="none" stroke="rgba(212,168,67,0.6)" strokeWidth="1.6" strokeDasharray="4 4" />
                <path d={arc('dxb', 'bom', 12)} fill="none" stroke="rgba(212,168,67,0.65)" strokeWidth="1.6" strokeDasharray="4 4" />
                <path d={arc('bom', 'sha', 24)} fill="none" stroke="rgba(212,168,67,0.65)" strokeWidth="1.6" strokeDasharray="4 4" />
                <path d={arc('sha', 'tyo', 10)} fill="none" stroke="rgba(212,168,67,0.55)" strokeWidth="1.4" strokeDasharray="3 4" />
                <path d={arc('sha', 'sgp', 12)} fill="none" stroke="rgba(212,168,67,0.5)" strokeWidth="1.3" strokeDasharray="3 4" />
                <path d={arc('sgp', 'syd', 18)} fill="none" stroke="rgba(212,168,67,0.5)" strokeWidth="1.3" strokeDasharray="3 4" />

                {world.hubs.map((hub) => {
                  const col = hub.open ? '#22C55E' : '#EAB308';
                  const ringCol = hub.open ? 'rgba(34,197,94,0.34)' : 'rgba(234,179,8,0.22)';
                  const isLeft = hub.lblSide === 'left';
                  const textAnchor = isLeft ? 'end' : 'start';
                  const lx = hub.x + (isLeft ? -11 : 11);
                  const ly = hub.y + hub.dy;
                  const pillW = Math.max(54, hub.city.length * 7.2 + 14);
                  const pillX = isLeft ? lx - pillW + 4 : lx - 5;
                  return (
                    <g key={hub.id}>
                      <title>{`${hub.city} (${hub.exchange}) · ${hub.localTime} · ${hub.statusText}`}</title>
                      <circle
                        cx={hub.x}
                        cy={hub.y}
                        r={hub.open ? 15 : 10}
                        fill={ringCol}
                        className={hub.open ? 'vault-pulse-ring' : undefined}
                      />
                      <circle cx={hub.x} cy={hub.y} r={5.2} fill={col} stroke="#070B16" strokeWidth={1.8} />
                      <rect
                        x={pillX}
                        y={ly - 10}
                        width={pillW}
                        height={18}
                        rx={5}
                        fill="rgba(7,11,22,0.84)"
                        stroke={hub.open ? 'rgba(34,197,94,0.55)' : 'rgba(212,168,67,0.45)'}
                        strokeWidth={0.9}
                      />
                      <text
                        x={lx}
                        y={ly + 2.5}
                        fill="#F8FAFC"
                        fontSize={11.5}
                        fontWeight={700}
                        textAnchor={textAnchor}
                        fontFamily="Inter, sans-serif"
                      >
                        {hub.city}
                      </text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
        </div>

        <div className="hub-clock-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {world.hubs.map((hub) => (
            <div
              key={hub.id}
              className="stat-box"
              style={{ borderColor: hub.open ? 'rgba(34,197,94,0.45)' : undefined }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 12.5 }}>{hub.city}</strong>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {hub.localTime}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hub.exchange}</div>
              <div style={{ fontSize: 11, marginTop: 4, color: hub.open ? 'var(--up)' : 'var(--text-muted)', fontWeight: 600 }}>
                {hub.statusText}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Shanghai SGE Physical Premium */}
      <section className="panel" aria-label="Shanghai SGE Physical Premium">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('Shanghai SGE Physical Premium')}</h2>
            <p className="panel-subtitle">
              {t('East vs. West physical bullion arbitrage (Shanghai Gold Exchange vs. London/NY spot)')}
            </p>
          </div>
          <span className="badge-pill neutral">
            {shanghai?.usdCny ? `USD/CNY ${Number(shanghai.usdCny).toFixed(2)}` : 'SGE Live Feed'}
          </span>
        </div>

        <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div className="stat-box">
            <div className="stat-label">{t('Shanghai Gold Premium (Au99.99)')}</div>
            <div className="stat-value mono" style={{ color: sgeGoldPrem >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {`${formatSignedMoney(sgeGoldPrem, 2, settings.currency, fxRates)} / oz`}
            </div>
            <div className="panel-subtitle" style={{ marginTop: 4 }}>
              {sgeGoldPrem >= settings.shanghaiThreshold
                ? 'Elevated Eastern physical buying pull'
                : 'Normal East-West physical spread'}
            </div>
          </div>

          <div className="stat-box">
            <div className="stat-label">{t('Shanghai Silver Premium (Ag T+D)')}</div>
            <div className="stat-value mono" style={{ color: sgeSilverPrem >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {`${formatSignedMoney(sgeSilverPrem, 2, settings.currency, fxRates)} / oz`}
            </div>
            <div className="panel-subtitle" style={{ marginTop: 4 }}>
              {sgeSilverPrem >= 2.5
                ? 'Strong solar & industrial physical pull in Asia'
                : 'Balanced industrial warehouse premium'}
            </div>
          </div>
        </div>
      </section>

      {/* 3. World Gold Board */}
      <section className="panel" aria-label="World Gold Board">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('World Gold Board')}</h2>
            <p className="panel-subtitle">
              {t('Local retail & bullion benchmark pricing converted live across 9 global hubs')}
            </p>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '6px 8px' }}>{t('Hub')}</th>
                <th style={{ padding: '6px 8px' }}>{t('Local Unit')}</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('Local Price')}</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('Equiv / oz')}</th>
              </tr>
            </thead>
            <tbody>
              {board.map((row) => {
                const cMeta = CURRENCY_META[row.currency];
                const dec = cMeta.zeroDecimals ? 0 : 2;
                return (
                  <tr key={row.city} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 600 }}>{row.city}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--text-muted)' }}>{row.unitLabel}</td>
                    <td className="mono" style={{ padding: '7px 8px', textAlign: 'right' }}>
                      {`${cMeta.symbol}${row.localPrice.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`}
                    </td>
                    <td className="mono" style={{ padding: '7px 8px', textAlign: 'right' }}>
                      {formatMoney(row.usdPerOz, 0, settings.currency, fxRates)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
