import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import {
  generatePrivateNtfyTopic,
  sanitizeHttpUrl,
  sanitizeNtfyTopic,
  sanitizePersistedSettings,
} from '../utils/security';
import { buildBackupJson, parseBackupJson } from '../utils/storage';
import { translateText } from '../i18n/I18nContext';
import { computeFullQuantSuite, projectEquirectangular } from '../engines/outlookEngine';
import {
  buildExtendedChartForecast,
  CHART_FORECAST_HALF_SPECS,
  detectMarketSessionMarkers,
  resampleBarsForDisplay,
} from '../engines/chartEngine';
import { runMonteCarloSync } from '../engines/monteCarlo';
import { DEFAULT_FX_RATES } from '../utils/format';
import { defaultSpaceWeather } from '../utils/security';
import { BullionProvider } from '../context/BullionContext';
import App from '../App';

describe('Bullion Pulse React v60 — Security Hardening & Sanitizers', () => {
  it('blocks SSRF, javascript:, HTTP, private IPs, and embedded credentials in URLs', () => {
    expect(sanitizeHttpUrl('https://kitco.com/news/gold')).toBe('https://kitco.com/news/gold');
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeHttpUrl('http://example.com')).toBeNull();
    expect(sanitizeHttpUrl('https://127.0.0.1/admin')).toBeNull();
    expect(sanitizeHttpUrl('https://169.254.169.254/latest/meta-data')).toBeNull();
    expect(sanitizeHttpUrl('https://[::1]/secret')).toBeNull();
    expect(sanitizeHttpUrl('https://user:pass@example.com/feed')).toBeNull();
  });

  it('rejects dot-traversal ntfy topics and generates 128-bit cryptographic private channels', () => {
    expect(sanitizeNtfyTopic('.')).toBe('');
    expect(sanitizeNtfyTopic('..')).toBe('');
    expect(sanitizeNtfyTopic('...')).toBe('');
    expect(sanitizeNtfyTopic('foo..bar')).toBe('');
    expect(sanitizeNtfyTopic('.hidden')).toBe('');
    expect(sanitizeNtfyTopic('my-gold_topic.1')).toBe('my-gold_topic.1');

    const gen = generatePrivateNtfyTopic();
    expect(gen).toMatch(/^bp-[0-9a-f]{32}$/);
    expect(sanitizeNtfyTopic(gen)).toBe(gen);
  });

  it('redacts private ntfyTopic in exported backups and preserves existing channel on import', () => {
    const settings = sanitizePersistedSettings({
      ntfyTopic: 'bp-0123456789abcdef0123456789abcdef',
      goldThreshold: 2.5,
      theme: 'swiss-gold',
    });
    const exported = buildBackupJson(settings, []);
    expect(exported).not.toContain('bp-0123456789abcdef0123456789abcdef');

    const restored = parseBackupJson(exported, 'bp-0123456789abcdef0123456789abcdef');
    expect(restored).not.toBeNull();
    expect(restored?.settings.ntfyTopic).toBe('bp-0123456789abcdef0123456789abcdef');
    expect(restored?.settings.goldThreshold).toBe(2.5);
    expect(restored?.settings.theme).toBe('swiss-gold');
  });
});

describe('Bullion Pulse React v60 — 7-Language Native i18n Engine', () => {
  it('translates core UI strings across Thai, Lao, Spanish, Chinese, Japanese, and Hindi', () => {
    expect(translateText('Gold Spot', 'th')).toBe('ราคาทองคำสด');
    expect(translateText('Gold Spot', 'lo')).toBe('ລາຄາຄຳສົດ');
    expect(translateText('Gold Spot', 'es')).toBe('Oro al Contado');
    expect(translateText('Gold Spot', 'zh')).toBe('现货黄金');
    expect(translateText('Gold Spot', 'ja')).toBe('金スポット');
    expect(translateText('Gold Spot', 'hi')).toBe('सोना स्पॉट');
    expect(translateText('AI Race 78/100', 'th')).toBe('ศึก AI 78/100');
  });

  it('guards against ReDoS on long external strings (>320 chars)', () => {
    const huge = 'A'.repeat(1200) + ' (123)';
    const t0 = performance.now();
    expect(translateText(huge, 'th')).toBe(huge);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('projects Global Vault World Map hubs onto exact 1000x500 NASA equirectangular coordinates', () => {
    expect(projectEquirectangular(40.71, -74.01)).toEqual({ x: 294.4, y: 136.9 }); // New York
    expect(projectEquirectangular(51.51, -0.13)).toEqual({ x: 499.6, y: 106.9 }); // London
    expect(projectEquirectangular(31.23, 121.47)).toEqual({ x: 837.4, y: 163.2 }); // Shanghai
    expect(projectEquirectangular(-33.87, 151.21)).toEqual({ x: 920, y: 344.1 }); // Sydney
  });
});

describe('Bullion Pulse React v60 — Quant Forecast & Jump-Diffusion Math Coherence', () => {
  it('computes realistic non-hardcoded Merton Jump-Diffusion odds and keeps Most Logical Path inside P25–P75', () => {
    const goldMc = runMonteCarloSync({
      metal: 'gold',
      spot: 3633.82,
      horizonDays: 30,
      annualVolPct: 32.8,
      unitScore: 0.18,
      vix: 25.1,
      ensembleTargetPct: 0.67,
      hurst: 0.44,
      pathsCount: 1000,
    });
    const silverMc = runMonteCarloSync({
      metal: 'silver',
      spot: 43.59,
      horizonDays: 30,
      annualVolPct: 52.8,
      unitScore: 0.25,
      vix: 25.1,
      ensembleTargetPct: 1.7,
      hurst: 0.44,
      pathsCount: 1000,
    });

    // Strict quantile monotonicity & Most Logical Path bounded inside high-density P25..P75 corridor
    expect(goldMc.p10End).toBeLessThan(goldMc.p25End);
    expect(goldMc.logicalEnd).toBeGreaterThanOrEqual(goldMc.p25End);
    expect(goldMc.logicalEnd).toBeLessThanOrEqual(goldMc.p75End);
    expect(goldMc.p75End).toBeLessThan(goldMc.p90End);
    expect(goldMc.logicalPath[0]).toBeCloseTo(3633.82, 1);

    // Silver higher volatility MUST yield higher ±5% touch odds than Gold (proves real simulation, not placeholders!)
    expect(silverMc.probPlus5).toBeGreaterThan(goldMc.probPlus5);
    expect(silverMc.probMinus5).toBeGreaterThan(goldMc.probMinus5);
    expect(silverMc.expectedJumpsPerMonth).toBeGreaterThan(goldMc.expectedJumpsPerMonth);

    // Bullish drift (+0.6) MUST yield higher ProbUp than Bearish drift (-0.6)
    const bullMc = runMonteCarloSync({ metal: 'gold', spot: 3600, horizonDays: 30, annualVolPct: 20, unitScore: 0.65, pathsCount: 1000 });
    const bearMc = runMonteCarloSync({ metal: 'gold', spot: 3600, horizonDays: 30, annualVolPct: 20, unitScore: -0.65, pathsCount: 1000 });
    expect(bullMc.probUp).toBeGreaterThan(bearMc.probUp);
    expect(bullMc.logicalEnd).toBeGreaterThan(bearMc.logicalEnd);
  });

  it('normalizes -100..+100 scores to -1..+1 cleanly and keeps 7D/30D bear < base < bull coherent', () => {
    const mockBars = Array.from({ length: 40 }, (_, i) => ({
      t: Date.now() - (40 - i) * 3600_000,
      o: 3600 + i * 0.8,
      h: 3605 + i * 0.8,
      l: 3595 + i * 0.8,
      c: 3601 + i * 0.8,
    }));
    const q = computeFullQuantSuite({
      metal: 'gold',
      timeframe: '1d',
      goldQuote: { price: 3633.82, prevClose: 3620.4, chg: 13.42, pct: 0.37 },
      silverQuote: { price: 43.59, prevClose: 42.08, chg: 1.51, pct: 3.59 },
      outlook: {
        confidence: 82,
        gold: {
          spot: 3633.82,
          score: 18,
          signal: 'Bullish',
          horizon7d: { bear: 3500, base: 3652, bull: 3800, bearPct: -3.7, expectedPct: 0.51, bullPct: 4.6 },
          horizon30d: { bear: 3330, base: 3658, bull: 3940, bearPct: -8.4, expectedPct: 0.67, bullPct: 8.4 },
        },
        silver: { spot: 43.59, score: 25, signal: 'Bullish' },
        macroSnapshot: { goldVolAnnPct: 32.8, silverVolAnnPct: 52.8, vix: 25.1 },
      },
      shanghai: null,
      comex: null,
      timeframes: { '1d': { gold: mockBars, silver: mockBars } },
      candles: { gold: mockBars, silver: mockBars },
      spaceWeather: defaultSpaceWeather(),
      dealerQuotes: { goldStreetOz: null, silverStreetOz: null },
      fxRates: DEFAULT_FX_RATES,
    });

    // Score 18 -> unitScore 0.18 (NOT clamped to 1.0!)
    expect(q.interactiveForecast.unitScore).toBeCloseTo(0.18, 2);
    expect(q.interactiveForecast.score).toBe(18);
    expect(q.interactiveForecast.signal).toBe('Bullish');
    expect(q.interactiveForecast.horizon7d.bear).toBeLessThan(q.interactiveForecast.horizon7d.base);
    expect(q.interactiveForecast.horizon7d.base).toBeLessThan(q.interactiveForecast.horizon7d.bull);
    expect(q.interactiveForecast.horizon30d.bear).toBeLessThan(q.interactiveForecast.horizon30d.base);
    expect(q.interactiveForecast.horizon30d.base).toBeLessThan(q.interactiveForecast.horizon30d.bull);
    expect(q.interactiveForecast.horizon30d.milestones).toHaveLength(4);
    expect(q.precisionLine?.points?.length).toBeGreaterThan(2);
  });
});

describe('Bullion Pulse React v60 — Full 5-View UI Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('goldprice.org')) {
          return new Response(
            JSON.stringify({
              items: [{ xauPrice: 3520, xauClose: 3490, chgXau: 30, pcXau: 0.86, xagPrice: 41.2, xagClose: 40.5, chgXag: 0.7, pcXag: 1.73 }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders Markets, switches to Outlook, Trade, Stack, and Settings with Privacy Mode & 128-bit ntfy generator', () => {
    render(
      <BullionProvider>
        <App />
      </BullionProvider>
    );

    expect(screen.getByText('Bullion Pulse')).toBeInTheDocument();
    expect(screen.getByText('Gold Spot')).toBeInTheDocument();
    expect(screen.getByText('Silver Spot')).toBeInTheDocument();
    expect(document.getElementById('btn-listen-brief')).toBeNull();
    // Chart overlays: Gaps, Squeeze Risk & Market Hours present; My Buys & News Pins removed
    expect(screen.getByRole('button', { name: 'Gaps' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Squeeze Risk' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Market Hours' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'My Buys' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'News Pins' })).toBeNull();

    // Navigate to Outlook -> What Moves It (All 6 Hidden Alpha Engines + Detailed 36-Ticker AI Race)
    fireEvent.click(document.getElementById('top-nav-outlook')!);
    fireEvent.click(screen.getByRole('tab', { name: 'What Moves It' }));
    expect(screen.getByText(/1\. Session Flow Divergence/i)).toBeInTheDocument();
    expect(screen.getByText(/6\. COMEX OpEx & Delivery Magnet/i)).toBeInTheDocument();
    expect(screen.getByText(/Global AI, Space & EV Demand Race/i)).toBeInTheDocument();
    expect(screen.getByText(/Est\. AI \/ Grid Silver Draw/i)).toBeInTheDocument();

    // Check BOTH Gold & Silver Odds + Self-Learning Accuracy Replay chart inside Outlook -> Odds
    fireEvent.click(screen.getByRole('tab', { name: 'Odds' }));
    expect(screen.getByText(/Gold \(XAU\) · 30D Odds/i)).toBeInTheDocument();
    expect(screen.getByText(/Silver \(XAG\) · 30D Odds/i)).toBeInTheDocument();
    fireEvent.click(document.getElementById('mc-metal-silver')!);
    expect(screen.getByText(/Merton Jump-Diffusion Odds · Silver/i)).toBeInTheDocument();
    expect(document.getElementById('accuracy-replay-chart')).toBeInTheDocument();
    fireEvent.click(document.getElementById('acc-hz-7d')!);
    fireEvent.click(document.getElementById('acc-chart-silver')!);
    expect(screen.getByText(/Daily Self-Learning Engine & Accuracy Replay · Silver/i)).toBeInTheDocument();

    // Navigate to Trade -> Deal Grader
    fireEvent.click(document.getElementById('top-nav-trade')!);
    fireEvent.click(screen.getByRole('tab', { name: 'Deal Grader' }));
    expect(screen.getByText('Coin Shop & Online Deal Grader')).toBeInTheDocument();

    // Toggle Privacy Mode and check Stack redaction
    fireEvent.click(screen.getByLabelText(/Hide or show my stack balance/i));
    expect(document.body.classList.contains('privacy-mode')).toBe(true);
    fireEvent.click(screen.getByLabelText(/Open My Stack/i));
    expect(screen.getByText('🔒 Privacy ON')).toBeInTheDocument();

    // Open Settings -> Phone & Log -> Generate 128-bit Private Channel
    fireEvent.click(screen.getByLabelText(/Open settings and alerts/i));
    fireEvent.click(screen.getByRole('tab', { name: 'Phone & Log' }));
    const ntfyInput = document.getElementById('input-ntfy-topic') as HTMLInputElement;
    expect(ntfyInput.type).toBe('password');
    fireEvent.click(document.getElementById('btn-generate-ntfy')!);
    expect(ntfyInput.value).toMatch(/^bp-[0-9a-f]{32}$/);

    // Switch back to Markets and test instant Thai language switch
    fireEvent.click(document.getElementById('top-nav-markets')!);
    const langSelect = document.getElementById('select-language') as HTMLSelectElement;
    fireEvent.change(langSelect, { target: { value: 'th' } });
    expect(screen.getByText('ราคาทองคำสด')).toBeInTheDocument();
    fireEvent.change(langSelect, { target: { value: 'en' } });
    expect(screen.getByText('Gold Spot')).toBeInTheDocument();
  });

  it('boots strictly once without an infinite fxRates polling loop', async () => {
    let fxCalls = 0;
    let bvCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('open.er-api.com')) {
          fxCalls += 1;
          return new Response(JSON.stringify({ rates: { USD: 1, EUR: 0.92, THB: 34.1 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('bullionvault.com')) {
          bvCalls += 1;
          return new Response(
            JSON.stringify({
              market: {
                pitches: [
                  { securityId: 'AUXLN', securityClassNarrative: 'GOLD', considerationCurrency: 'USD', buyPrices: [{ limit: 117000 }], sellPrices: [{ limit: 117100 }] },
                  { securityId: 'AGXZU', securityClassNarrative: 'SILVER', considerationCurrency: 'USD', buyPrices: [{ limit: 1400 }], sellPrices: [{ limit: 1410 }] },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
      })
    );

    render(
      <BullionProvider>
        <App />
      </BullionProvider>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(fxCalls).toBe(1);
    expect(bvCalls).toBe(1);
  });

  it('detects Market Open, Market Close, NY Open, and Weekend Closed markers accurately', () => {
    // 2026-11-25 (Wednesday) 08:15 ET -> 08:25 ET (crosses NY Open 8:20 ET), then 16:50/16:55 ET -> 18:05 ET (daily close/open break)
    const bars = [
      { t: Date.parse('2026-11-25T13:15:00Z'), o: 3600, h: 3605, l: 3598, c: 3602 },
      { t: Date.parse('2026-11-25T13:25:00Z'), o: 3602, h: 3610, l: 3601, c: 3608 }, // NY Open (08:20 ET)
      { t: Date.parse('2026-11-25T21:50:00Z'), o: 3607, h: 3610, l: 3605, c: 3608 },
      { t: Date.parse('2026-11-25T21:55:00Z'), o: 3608, h: 3612, l: 3606, c: 3610 }, // Mkt Close before 5-6 PM ET break
      { t: Date.parse('2026-11-25T23:05:00Z'), o: 3611, h: 3615, l: 3610, c: 3614 }, // Mkt Open after break
    ];
    // Test during Saturday weekend close (2026-11-28T16:00:00Z)
    const markers = detectMarketSessionMarkers(bars, '1d', Date.parse('2026-11-28T16:00:00Z'));
    const labels = markers.map((m) => m.label);
    expect(labels).toContain('NY Open');
    expect(labels).toContain('Mkt Close');
    expect(labels).toContain('Mkt Open');
    expect(labels).toContain('Mkt Closed');
  });

  it('extends chart forecast by +50% per timeframe and resamples dense bars cleanly', () => {
    expect(CHART_FORECAST_HALF_SPECS['1d'].label).toBe('+12H');
    expect(CHART_FORECAST_HALF_SPECS['7d'].label).toBe('+3.5D');
    expect(CHART_FORECAST_HALF_SPECS['1m'].label).toBe('+15D');
    expect(CHART_FORECAST_HALF_SPECS['1y'].label).toBe('+6M');

    const dense = Array.from({ length: 288 }, (_, i) => ({
      t: 1795700000000 + i * 300_000,
      o: 3600 + i * 0.1,
      h: 3605 + i * 0.1,
      l: 3595 + i * 0.1,
      c: 3602 + i * 0.1,
    }));
    const agg = resampleBarsForDisplay(dense, 48);
    expect(agg.length).toBeLessThanOrEqual(48);
    expect(agg.length).toBeGreaterThanOrEqual(24);
    expect(agg[0].o).toBe(dense[0].o);
    expect(agg[agg.length - 1].c).toBe(dense[dense.length - 1].c);
    expect(Math.max(...agg.map((b) => b.h))).toBeCloseTo(Math.max(...dense.map((b) => b.h)), 4);
    expect(Math.min(...agg.map((b) => b.l))).toBeCloseTo(Math.min(...dense.map((b) => b.l)), 4);

    const fc = buildExtendedChartForecast(
      { points: [{ price: 3650 }, { price: 3670 }, { price: 3700 }] },
      '7d',
      3650,
      16
    );
    expect(fc.horizonLabel).toBe('+3.5D');
    expect(fc.points).toHaveLength(16);
    expect(fc.points[15]).toBeCloseTo(3670, 1);
  });
});
