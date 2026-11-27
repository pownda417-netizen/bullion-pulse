import React, { useState } from 'react';
import type { MetalKey } from '../../types/bullion';
import { useBullion } from '../../context/BullionContext';
import { useI18n } from '../../i18n/I18nContext';
import {
  AI_COMPUTE_META,
  AI_POWER_META,
  CHINA_AI_EV_META,
  PRIVATE_AI_SPACE_LABS,
  SCENARIO_PRESETS,
  WORLD_AI_TECH_META,
} from '../../engines/outlookEngine';

const LAB_DESCRIPTIONS: Record<string, { region: string; thesis: string }> = {
  openai: { region: 'US · Frontier AI', thesis: 'Stargate multi-GW AI campuses driving massive switchgear & silver busbar buildouts' },
  anthropic: { region: 'US · Frontier AI', thesis: 'Hyperscale Claude training clusters accelerating server connector gold & grid silver draw' },
  spacex: { region: 'US · Orbital Space', thesis: 'Starlink satellite solar arrays & Starship launch cadence consuming aerospace silver/gold' },
  deepseek: { region: 'CN · Efficiency AI', thesis: 'Open-weight AI surge spurring widespread enterprise GPU server & edge hardware adoption' },
  huawei: { region: 'CN · Ascend AI', thesis: 'Domestic Ascend AI clusters & telecom power infrastructure expanding Chinese metal pull' },
  catl: { region: 'CN · Batteries', thesis: 'Solid-state & EV battery gigafactories tightening industrial silver conductivity demand' },
  mistral: { region: 'EU · Sovereign AI', thesis: 'European sovereign AI data centers boosting Schneider/Siemens grid switchgear orders' },
};

type AiRegionTab = 'all' | 'us' | 'china' | 'world' | 'power';

export const WhatMovesItTab: React.FC = () => {
  const {
    outlook,
    quant,
    settings,
    aiSimDelta,
    setAiSimDelta,
    whisperScenarioId,
    setWhisperScenarioId,
  } = useBullion();
  const { t } = useI18n();

  const [alphaMetal, setAlphaMetal] = useState<MetalKey>(settings.selectedMetal);
  const [aiBasketTab, setAiBasketTab] = useState<AiRegionTab>('all');

  const metal = settings.selectedMetal;
  const drivers = Array.isArray(outlook?.drivers) ? (outlook.drivers as Array<Record<string, unknown>>) : [];

  // Extract all 6 Hidden Alpha engines for the selected metal
  const alphaPack = quant.hiddenAlpha?.[alphaMetal] || {};
  const sf = alphaPack.sessionFlow || {};
  const fx = alphaPack.currencyBreadth || {};
  const sc = alphaPack.springCoiling || {};
  const liq = alphaPack.liquidityCompass || {};
  const cb = alphaPack.crowdingBrake || {};
  const op = alphaPack.opexMagnet || {};
  const netPts = Number(alphaPack.netPts ?? 0);

  const hiddenEngineCards = [
    {
      id: 'sessionFlow',
      num: '1',
      name: 'Session Flow Divergence',
      whatItDoes: 'Compares Asia/Shanghai physical session returns against London & New York paper hours to spot stealth Eastern accumulation.',
      status: String(sf.regime || 'Balanced Flow'),
      metric: `Asia ${Number(sf.asiaPct ?? 0) >= 0 ? '+' : ''}${Number(sf.asiaPct ?? 0).toFixed(2)}% vs NY ${Number(sf.nyPct ?? 0) >= 0 ? '+' : ''}${Number(sf.nyPct ?? 0).toFixed(2)}%`,
      signal: Number(sf.signal ?? 0),
      note: String(sf.note || 'Monitoring intraday regional buying balance across Asia, London & New York.'),
    },
    {
      id: 'currencyBreadth',
      num: '2',
      name: 'Global FX Breakout Breadth',
      whatItDoes: 'Measures how many major world currencies (EUR, JPY, CNY, INR, GBP, AUD, CHF, THB) are pricing bullion near highs — catching stealth global bull runs even when USD looks flat.',
      status: fx.stealthBull ? 'Stealth Global Breakout ↑' : String(fx.regime || 'Normal Breadth'),
      metric: `${Math.round(Number(fx.breadthPct ?? 50))}% of world FX strong`,
      signal: Number(fx.signal ?? 0),
      note: String(fx.note || 'Tracks synchronized global demand across non-USD bullion buyers.'),
    },
    {
      id: 'springCoiling',
      num: '3',
      name: 'Spring Coiling Volatility Index',
      whatItDoes: 'Detects compressed price volatility combined with tight COMEX vault coverage or futures backwardation — signaling pent-up breakout energy.',
      status: String(sc.regime || (Number(sc.coilingScore ?? 50) >= 70 ? 'Tightly Coiled' : 'Normal Energy')),
      metric: `Coil ${Math.round(Number(sc.coilingScore ?? 50))}/100 · ${Number(sc.breakoutEnergyMult ?? 1).toFixed(2)}× energy`,
      signal: (Number(sc.coilingScore ?? 50) - 50) / 50,
      note: String(sc.note || 'Measures whether tight price compression is storing energy for an outsized move.'),
    },
    {
      id: 'liquidityCompass',
      num: '4',
      name: 'Cross-Asset Liquidity Compass',
      whatItDoes: 'Reads US Dollar (DXY), real Treasury yields, and VIX stress together to detect global liquidity tailwinds vs. macro tightening headwinds.',
      status: String(liq.regime || 'Neutral Liquidity'),
      metric: `Signal ${Number(liq.signal ?? 0) >= 0 ? '+' : ''}${Math.round(Number(liq.signal ?? 0) * 100)}`,
      signal: Number(liq.signal ?? 0),
      note: String(liq.note || 'Synthesizes macro liquidity pressure driving institutional bullion allocation.'),
    },
    {
      id: 'crowdingBrake',
      num: '5',
      name: 'Contrarian Crowding Brake',
      whatItDoes: 'Watches RSI extremes, COT speculative crowding, and euphoric/panic headline ratios to guard against chasing overheated spikes or selling washout lows.',
      status: String(cb.regime || 'Un-crowded / Healthy'),
      metric: `Nudge ${Number(cb.contrarianNudge ?? 0) >= 0 ? '+' : ''}${Math.round(Number(cb.contrarianNudge ?? 0) * 100)} pts`,
      signal: Number(cb.contrarianNudge ?? 0) * 5,
      note: String(cb.note || 'Applies a discipline brake when sentiment or momentum becomes one-sided.'),
    },
    {
      id: 'opexMagnet',
      num: '6',
      name: 'COMEX OpEx & Delivery Magnet',
      whatItDoes: 'Tracks monthly COMEX options expiration & first-notice physical delivery windows where dealer gamma hedging pins price or triggers post-expiry rallies.',
      status: String(op.phase || 'Open Runway'),
      metric: `Pin Strength ${Math.round(Number(op.pinStrength ?? 0) * 100)}%`,
      signal: Number(op.signal ?? 0),
      note: String(op.note || 'Monitors COMEX expiry calendar windows affecting short-term futures pinning.'),
    },
  ];

  // Extract rich AI / Space / EV Race details
  const ai = quant.aiRace || {};
  const raceIndex = Number(ai.raceIndex ?? 64);
  const raceStatus = String(ai.status || 'Active Global Buildout ↑');
  const raceTone = ai.tone === 'bearish' ? 'bearish' : ai.tone === 'bullish' ? 'bullish' : 'neutral';
  const estSilverMoz = Number(ai.estSilverMozYr ?? 32);
  const silverImpact = ai.silver || {};
  const goldImpact = ai.gold || {};
  const labMentionMap = new Map<string, number>(
    Array.isArray(ai.privateLabs)
      ? ai.privateLabs.map((l: Record<string, unknown>) => [String(l.id), Number(l.mentions ?? 0)])
      : []
  );

  const basketGroups = [
    { id: 'us' as const, title: 'US & Taiwan AI Compute (8)', items: AI_COMPUTE_META },
    { id: 'china' as const, title: 'China AI, Chips & EVs (8)', items: CHINA_AI_EV_META },
    { id: 'world' as const, title: 'Europe, Japan, Korea, SEA, CA, LatAm & India (17)', items: WORLD_AI_TECH_META },
    { id: 'power' as const, title: 'AI Grid & Nuclear Power (3)', items: AI_POWER_META },
  ];

  const visibleGroups =
    aiBasketTab === 'all' ? basketGroups : basketGroups.filter((g) => g.id === aiBasketTab);

  return (
    <div className="sub-tab-stack">
      {/* 1. 6-Engine Hidden Alpha Suite — ALL 6 engines explained with live telemetry */}
      <section className="panel" id="panel-hidden-alpha" aria-label="6-Engine Hidden Alpha Suite">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 className="panel-title">
              {`${t('6-Engine Hidden Alpha Suite')} · ${t(alphaMetal === 'gold' ? 'Gold' : 'Silver')}`}
            </h2>
            <p className="panel-subtitle">
              {t('6 proprietary microstructure & positioning engines that adjust the 30-day Precision Forecast')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`chip-toggle${alphaMetal === 'gold' ? ' active' : ''}`}
              onClick={() => setAlphaMetal('gold')}
            >
              {t('Gold')}
            </button>
            <button
              type="button"
              className={`chip-toggle${alphaMetal === 'silver' ? ' active' : ''}`}
              onClick={() => setAlphaMetal('silver')}
            >
              {t('Silver')}
            </button>
            <span className={`badge-pill ${netPts > 0 ? 'bullish' : netPts < 0 ? 'bearish' : 'neutral'} mono`}>
              {`Net Edge ${netPts >= 0 ? '+' : ''}${netPts} pts`}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          {hiddenEngineCards.map((eng) => {
            const toneClass = eng.signal > 0.08 ? 'bullish' : eng.signal < -0.08 ? 'bearish' : 'neutral';
            return (
              <article key={eng.id} className="stat-box" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <strong style={{ fontSize: 13 }}>{`${eng.num}. ${eng.name}`}</strong>
                  <span className={`badge-pill ${toneClass}`} style={{ fontSize: 10.5 }}>
                    {eng.status}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 11.8, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--text)' }}>What it does: </strong>
                  {eng.whatItDoes}
                </p>
                <div
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: eng.signal > 0.08 ? 'var(--up)' : eng.signal < -0.08 ? 'var(--down)' : 'var(--gold, #d4a843)',
                  }}
                >
                  {`Live Reading: ${eng.metric}`}
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {eng.note}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* 2. Global AI, Space & EV Demand Race (36 Tickers · 6 Continents) — Full Detail */}
      <section className="panel" id="panel-ai-race" aria-label="Global AI, Space & EV Demand Race">
        <div className="panel-header" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 className="panel-title">{t('Global AI, Space & EV Demand Race (36 Tickers · 6 Continents)')}</h2>
            <p className="panel-subtitle">
              {t('Tracks non-thriftable industrial Silver & Gold bonding demand from gigawatt AI clusters, EVs & orbital launch')}
            </p>
          </div>
          <span className={`badge-pill ${raceTone} mono`}>{`AI Race ${Math.round(raceIndex)}/100 · ${raceStatus}`}</span>
        </div>

        {/* Simulation Controls */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            className={`chip-toggle${aiSimDelta > 0 ? ' active' : ''}`}
            onClick={() => setAiSimDelta((v) => (v > 0 ? 0 : 1))}
          >
            ⚡ Simulate +GW AI Boom
          </button>
          <button
            type="button"
            className={`chip-toggle${aiSimDelta < 0 ? ' active' : ''}`}
            onClick={() => setAiSimDelta((v) => (v < 0 ? 0 : -1))}
          >
            ⏸ Simulate CapEx Pause
          </button>
          {aiSimDelta !== 0 && (
            <button type="button" className="chip-toggle" onClick={() => setAiSimDelta(0)}>
              Reset Simulation
            </button>
          )}
        </div>

        {/* Structural Metal Demand KPI Row */}
        <div className="stats-row" style={{ marginBottom: 12 }}>
          <div className="stat-box">
            <div className="stat-label">Est. AI / Grid Silver Draw</div>
            <div className="stat-value mono">{`~${estSilverMoz} Moz / yr`}</div>
            <div className="panel-subtitle">{`${ai.deficitYears ?? 6}-yr consecutive deficit`}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">2030 DC Power Growth</div>
            <div className="stat-value mono">{`+${ai.dcPowerGrowth2030Pct ?? 165}%`}</div>
            <div className="panel-subtitle">Hyperscale grid buildout</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Silver Supply Inelasticity</div>
            <div className="stat-value mono">{String(ai.byproductSilverSharePct || '70–80%')}</div>
            <div className="panel-subtitle">{`Tightness mult ${Number(ai.supplyTightMult ?? 1).toFixed(2)}×`}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Forecast Model Impact</div>
            <div className="stat-value mono" style={{ color: Number(silverImpact.pts ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {`Ag ${Number(silverImpact.pts ?? 0) >= 0 ? '+' : ''}${Number(silverImpact.pts ?? 0)} · Au ${Number(goldImpact.pts ?? 0) >= 0 ? '+' : ''}${Number(goldImpact.pts ?? 0)} pts`}
            </div>
            <div className="panel-subtitle">{`${ai.news?.matchedCount ?? 0} AI/EV headlines scored`}</div>
          </div>
        </div>

        {/* Dedicated Silver vs Gold Industrial Role Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div className="stat-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12.5 }}>Silver (XAG) — Primary AI, EV &amp; Space Metal</strong>
              <span className="badge-pill bullish mono">
                {`${Number(silverImpact.pts ?? 0) >= 0 ? '+' : ''}${Number(silverImpact.pts ?? 0)} pts`}
              </span>
            </div>
            <p className="panel-subtitle" style={{ marginTop: 4 }}>
              {String(
                silverImpact.role ||
                  'Highest electrical & thermal conductivity: essential in AI data-center switchgear, busbars, EVs (BYD/Tesla/Toyota), solid-state Ag-C batteries & Starlink solar.'
              )}
            </p>
          </div>
          <div className="stat-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12.5 }}>Gold (XAU) — High-Reliability Bonding Layer</strong>
              <span className="badge-pill bullish mono">
                {`${Number(goldImpact.pts ?? 0) >= 0 ? '+' : ''}${Number(goldImpact.pts ?? 0)} pts`}
              </span>
            </div>
            <p className="panel-subtitle" style={{ marginTop: 4 }}>
              {String(
                goldImpact.role ||
                  'Zero-corrosion microscopic wire bonding in TSMC/Inari AI GPU packages, HBM memory interconnects, server pins & orbital satellite contacts.'
              )}
            </p>
          </div>
        </div>

        {ai.summary && (
          <p className="panel-note" style={{ marginBottom: 12 }}>
            {String(ai.summary)}
          </p>
        )}

        {/* Regional Basket Filter Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }} role="group" aria-label="AI race region filter">
          {([
            { id: 'all', label: 'All 36 Tickers (6 Continents)' },
            { id: 'us', label: 'US & TW Compute (8)' },
            { id: 'china', label: 'China AI & EV (8)' },
            { id: 'world', label: 'EU / JP / KR / SEA / CA / SA / IN (17)' },
            { id: 'power', label: 'Grid Power (3)' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`chip-toggle${aiBasketTab === tab.id ? ' active' : ''}`}
              onClick={() => setAiBasketTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Grouped Ticker Cards with Company Name, Region & Exact Metal/Hardware Role */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
          {visibleGroups.map((group) => (
            <div key={group.id}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold, #d4a843)', marginBottom: 6 }}>
                {group.title}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: 7 }}>
                {group.items.map((tk: Record<string, unknown>) => {
                  const sym = String(tk.ticker || tk.key);
                  return (
                    <div key={String(tk.key || sym)} className="stat-box" style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <strong style={{ fontSize: 12 }}>{String(tk.name || sym)}</strong>
                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                          {`${sym} · ${String(tk.region || '')}`}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.35 }}>
                        {String(tk.role || '')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 7 Private Frontier AI & Space Labs with Mentions & Metal Thesis */}
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-muted)' }}>
          {t('7 Private Frontier AI & Space Labs (News & CapEx Pulse)')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
          {PRIVATE_AI_SPACE_LABS.map((lab: Record<string, unknown>) => {
            const id = String(lab.id || lab.name);
            const meta = LAB_DESCRIPTIONS[id];
            const mentions = labMentionMap.get(id) ?? 0;
            return (
              <div key={id} className="stat-box" style={{ padding: '9px 11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <strong style={{ fontSize: 12.5 }}>{String(lab.name)}</strong>
                  <span className={`badge-pill ${mentions > 0 ? 'bullish' : 'neutral'} mono`} style={{ fontSize: 10 }}>
                    {mentions > 0 ? `${mentions} news` : meta?.region || 'Frontier'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.35 }}>
                  {meta?.thesis || 'Frontier compute & energy infrastructure catalyst.'}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Macro Drivers & Interactive Scenario Simulator */}
      <section className="panel" aria-label="Macro Drivers and What-If Scenarios">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('Macro Drivers & Scenario Stress Test')}</h2>
            <p className="panel-subtitle">
              {t('Live driver scorecards + instant stress-test scenarios applied to the 30-day forecast')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          <button
            type="button"
            className={`chip-toggle${whisperScenarioId === 'none' ? ' active' : ''}`}
            onClick={() => setWhisperScenarioId('none')}
          >
            Baseline Live
          </button>
          {SCENARIO_PRESETS.slice(0, 6).map((scPreset: Record<string, unknown>) => (
            <button
              key={String(scPreset.id)}
              type="button"
              className={`chip-toggle${whisperScenarioId === scPreset.id ? ' active' : ''}`}
              onClick={() => setWhisperScenarioId(String(scPreset.id))}
            >
              {String(scPreset.label || scPreset.name)}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
          {drivers.map((d) => {
            const val = Number(metal === 'gold' ? d.gold : d.silver) || 0;
            const pct = Math.min(100, Math.abs(val) * 100);
            return (
              <div key={String(d.id)} className="stat-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 12.5 }}>{String(d.label || d.shortLabel)}</strong>
                  <span className="mono" style={{ fontSize: 11.5, color: val >= 0 ? 'var(--up)' : 'var(--down)' }}>
                    {`${val >= 0 ? '+' : ''}${Math.round(val * 100)}`}
                  </span>
                </div>
                <div className="threshold-track" style={{ marginTop: 6 }}>
                  <div
                    className={`threshold-fill ${val >= 0 ? 'up' : 'down'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
