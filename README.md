# Bullion Pulse — React + Vite + TypeScript Edition (v60)

A high-precision, installable **Progressive Web App (PWA)** for real-time **Gold (`XAU`) & Silver (`XAG`)** tracking, quantitative forecasting, global bullion premiums, macro/AI demand analytics, and personal stack management — rebuilt with **React 19, Vite 6, and TypeScript 5** while preserving 100% `v60` feature parity, ASM security hardening, and all 55 Node.js backend monitor test suites.

## Architecture
- **Frontend (`src/`)**: Modular React 19 + TypeScript 5 (`strict: true`), zero `dangerouslySetInnerHTML`, native React `I18nProvider` (7 languages: `en`, `th`, `lo`, `es`, `zh`, `ja`, `hi`), 60fps dual-canvas Candlestick Chart (with live current price line, 10 overlays, and single Precision Forecast Line), Web Worker (`mc_worker.js` Merton Jump-Diffusion Odds with Highlighted Most Logical Path for Gold & Silver), Daily Self-Learning Engine & Accuracy Replay Chart, 6-Engine Hidden Alpha Suite, 36-Ticker 6-Continent AI/Space/EV Demand Race, exact GPS Global Vault World Map, 7 Vault Themes, Split-Desk (`1440px+`) & 3-Col Ultrawide layouts, Privacy Mode, and masked `ntfy` + 128-bit channel generator.
- **Backend (`monitor/`)**: Zero-dependency Node.js 22 ESM pipelines (`analyze_outlook.mjs`, `check_metals.mjs`, `self_learn.mjs`, `net_security.mjs`) with live Swissquote interbank spot vs. COMEX futures separation, generating `data/*.json` via SHA-pinned GitHub Actions.

## Commands
```bash
npm install          # Install React, Vite, TypeScript, and Vitest
npm run dev          # Local dev server on http://127.0.0.1:4174
npm run typecheck    # Strict TypeScript check (tsc --noEmit)
npm run build        # Production static bundle in dist/ (GitHub Pages ready)
npm run preview      # Preview production dist/ build on http://127.0.0.1:4174
npm run test:frontend # Run Vitest + React Testing Library suite
npm run test:backend  # Run all 55 backend Node.js monitor/ & outlook suites
npm test             # Run typecheck + frontend tests + all 55 backend tests
```

## GitHub Pages Deployment
`.github/workflows/deploy-pages.yml` automatically runs `npm ci`, `npm run typecheck`, `npm run test:frontend`, `npm run build`, validates and copies `data/*.json` into `dist/data/`, and publishes `dist/` to GitHub Pages on every push to `main` and every 30-minute `update-outlook.yml` cron commit.
