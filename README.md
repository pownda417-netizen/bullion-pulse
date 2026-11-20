# Bullion Pulse — Spot Gold & Silver Mobile PWA + Macro Pattern Outlook

A zero-cost mobile web app (PWA) that tracks live **Spot Gold (XAU/USD)** and **Spot Silver (XAG/USD)**, sends instant phone push alerts on big daily moves via `ntfy.sh`, and provides a transparent **News + Historical Pattern Outlook** tab.

> **Disclaimer:** Financial markets cannot be predicted with certainty. The Outlook engine models probabilistic scenario ranges from world/metals news catalysts, cross-market indicators, and documented historical episodes — for informational and educational use only, not financial advice.

## What's Included

1. **Mobile PWA (`index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`)**:
   - **Markets Tab**: Live spot Gold & Silver (troy oz / grams), daily `$` and `%` change, Gold/Silver ratio, stock-market-style **multi-timeframe OHLC candlestick chart (`1D`, `7D`, `1M`, `6M`, `1Y`, `5Y`, `10Y`, `ALL` 1975–2026)** with a **Jump-Diffusion P10–P90 / P25–P75 fat-tail forecast cone** (`1D` auto-refreshes 5m candles), Daily Move Threshold Gauges, plus **Shanghai Gold Exchange (SGE)** `Au99.99` & `Ag(T+D)` with live **Shanghai–West premium spreads** (incl. ex-13% China VAT parity) and `SHAU` / `SHAG` benchmarks.
   - **Outlook Tab**:
     - **7-Day & 30-Day Probabilistic Range Cards** (Bear / Base / Bull envelopes scaled by forward-looking `^GVZ` blended volatility).
     - **COMEX Paper vs. Physical (`monitor/comex.mjs`)**: Pulls fresh COMEX `GC` Gold & `SI` Silver open interest (paper contracts & paper ounces) vs. registered deliverable warehouse stocks on every prediction run and on-device via **Fetch Fresh**.
     - **Institutional Pulse (`monitor/institutional_signals.mjs`)**: Live **Event-Risk Volatility Calendar** (FOMC, US CPI, NFP, COMEX Silver First Notice Days), **CBOE `^GVZ` Options Implied Volatility**, **GLD/SLV/PSLV Physical ETF Flows**, **Copper (`HG=F`) & USD/JPY Carry Stress**, and **COMEX Spot-to-Futures EFP Basis (Backwardation/Contango)**.
     - **Merton Jump-Diffusion Monte Carlo Engine (`monitor/jump_diffusion.mjs` + on-device runner)**: Simulates 1,500 continuous-diffusion + Poisson fat-tail jump paths across **`1D`–`ALL` (15Y)** horizons, with a live **Custom Target Hit Probability Calculator** (*Touch Anytime %* vs. *Finish Beyond %*).
     - **9 Macro & Quant Drivers** scored separately for Gold & Silver, **Interactive What-If Event Simulator** (incl. *COMEX Delivery Squeeze*), **Closest Historical Analogs**, **Walk-Forward & Daily 5:10 PM ET Self-Learning Log**, and **Recency-Weighted News Clusters**.
   - **Alerts Tab**: Custom daily move thresholds (`±1.5%` Gold, `±3.0%` Silver, `±$35/oz` Shanghai Gold Premium), direction filter, anonymous `ntfy.sh` test push button, big-move & SGE premium simulators, and Alert History.
2. **24/7 Background Price & SGE Monitor (`monitor/check_metals.mjs` + `.github/workflows/metal-alerts.yml`)**:
   - Zero dependencies (Node.js 20+); checks live spot XAU/XAG and Shanghai Gold Premium every 5 minutes during trading hours with daily deduplication & escalation.
3. **Automated News, Pro Quant, COMEX & Jump-Diffusion Pipeline (`monitor/analyze_outlook.mjs` + `.github/workflows/update-outlook.yml`)**:
   - Runs every 2 hours on GitHub Actions' free tier with shared concurrency lock & rebase push safety, ingests 6 RSS feeds, 14 Yahoo macro/ETF/vol/FX/metals tickers, FRED TIPS yields, CFTC COT + fresh COMEX paper open interest & vault stocks, SGE quotes, and 8-timeframe OHLC candles split into lightweight `data/candles_1d.json` (96% smaller 5m refresh) and lazy-loaded `data/candles_hist.json`. Runs Jump-Diffusion Monte Carlo off the main UI thread via `mc_worker.js`.
4. **Optimized Daily Post-Close Self-Learning Engine (`monitor/self_learn.mjs` + `.github/workflows/daily-self-learn.yml`)**:
   - Runs strictly **once per trading day at 5:10 PM ET** (10 minutes after the 5:00 PM ET US/COMEX metals close, DST-safe across EDT/EST, skipping weekends, **US/COMEX holidays**, and stale closes).
   - **Multi-Horizon Grading (`1D` 25% + `5D` 45% + `20D` 30%)** with **Huber `>2.5σ` outlier clipping**, **Dual-Regime (`calm` vs. `stress`)** learned weights, **Champion–Challenger Pinball Loss auto-rollback** safety net, and **Jump-Diffusion tail calibration (`λ` & `σJ`)** targeting ~20% `P10`–`P90` tail coverage.

## 5-Minute Phone Setup

1. **Install the free `ntfy` app** on iOS or Android and subscribe to a unique, private topic name (e.g. `bullion-pulse-9k2m7x4q`).
2. **Push `bullion-pulse/` to a GitHub repository** and enable **Settings → Pages → Source: GitHub Actions**.
3. **Add GitHub Actions Secrets & Variables** (**Settings → Secrets and variables → Actions**):
   - **Secret** `NTFY_TOPIC` = your private topic name
   - **Secret (optional)** `GEMINI_API_KEY` = optional Gemini API key for AI-written daily market summaries
   - **Variables (optional)**: `GOLD_THRESHOLD_PCT` (`1.5`), `SILVER_THRESHOLD_PCT` (`3.0`), `ALERT_DIRECTION` (`both`), `CATALYST_ALERTS` (`true` to also push on major macro regime shifts), `APP_URL` (your GitHub Pages URL)
4. **Add to Phone Home Screen**:
   - **iPhone (Safari):** Open your GitHub Pages URL → **Share** → **Add to Home Screen**.
   - **Android (Chrome):** Open your GitHub Pages URL → **⋮** → **Install app**.

## Local Verification

```bash
node monitor/test_monitor.mjs
node monitor/test_outlook.mjs
node monitor/check_metals.mjs --dry-run
node monitor/analyze_outlook.mjs
```
