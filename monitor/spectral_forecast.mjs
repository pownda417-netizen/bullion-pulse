/**
 * Bullion Pulse — Frequency-Domain & Spectral Cycle Forecasting Engine (v62)
 * Pure ES module, zero external dependencies (runs in Node.js, GitHub Actions & browser).
 *
 * Pipeline:
 *   1. Log-linear OLS detrending to remove non-stationary secular trend & Gibbs edge artifacts
 *   2. Hann-windowed high-resolution real DFT across candidate cycle periods (4d–75d)
 *   3. Spectral Entropy & Fisher Peak-to-Median SNR noise-gating (prevents random-walk overfitting)
 *   4. Non-overlapping dominant cycle peak extraction (Weekly Fix, Bi-Weekly, COMEX Monthly, FOMC 6-Wk, Roll)
 *   5. Exact phase-locked multi-harmonic Ridge/OLS regression on unwindowed residuals
 *   6. Causal walk-forward out-of-sample validation + exponentially damped harmonic projection
 */

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Solve small dense linear system A * x = b using Gaussian elimination with partial pivoting */
function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col]);
      if (v > maxAbs) {
        maxAbs = v;
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-12) return null;
    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }
    const pivot = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (Math.abs(factor) < 1e-15) continue;
      for (let j = col; j <= n; j++) {
        M[r][j] -= factor * M[col][j];
      }
    }
  }
  return M.map((row) => row[n]);
}

function classifyBullionCycleLabel(period, sampleLabel = 'days') {
  if (sampleLabel !== 'days') {
    if (period <= 8) return 'Fast Intraday Wave';
    if (period <= 20) return 'Session Swing Cycle';
    return 'Multi-Session Wave';
  }
  if (period <= 6.5) return 'Weekly Fix / OpEx';
  if (period <= 14.5) return 'Bi-Weekly Macro';
  if (period <= 26.5) return 'COMEX Monthly';
  if (period <= 48) return 'FOMC 6-Week';
  return 'Quarterly Roll';
}

function classifyPhaseLabel(deg) {
  const d = ((deg % 360) + 360) % 360;
  if (d < 30 || d >= 330) return 'Crest / Peaking';
  if (d < 150) return 'Descending';
  if (d < 210) return 'Trough / Bottoming';
  return 'Ascending';
}

/**
 * Core deterministic spectral fit on a clean log-price slice (used both for live fit and causal OOS walk-forward).
 */
function fitSpectralCore(
  closes,
  { minPeriod = 4, maxPeriod = 75, maxHarmonics = 3, gridPoints = 64 } = {}
) {
  const n = closes.length;
  const logs = closes.map((p) => Math.log(p));

  // 1. Log-linear OLS detrending
  const meanT = (n - 1) / 2;
  let meanZ = 0;
  for (let i = 0; i < n; i++) meanZ += logs[i];
  meanZ /= n;

  let covTZ = 0;
  let varT = 0;
  for (let i = 0; i < n; i++) {
    const dt = i - meanT;
    covTZ += dt * (logs[i] - meanZ);
    varT += dt * dt;
  }
  const slope = varT > 1e-12 ? covTZ / varT : 0;
  const intercept = meanZ - slope * meanT;

  const residuals = new Array(n);
  let resSq = 0;
  for (let i = 0; i < n; i++) {
    const r = logs[i] - (intercept + slope * i);
    residuals[i] = r;
    resSq += r * r;
  }
  const residualStd = Math.sqrt(resSq / Math.max(1, n));

  // 2. Hann-windowed high-resolution real DFT across log-spaced candidate periods
  const effMin = Math.max(3.5, minPeriod);
  const effMax = Math.max(effMin + 1.5, Math.min(maxPeriod, n / 2.05));
  const bins = Math.max(24, gridPoints);

  const hann = new Array(n);
  let wSum = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
    hann[i] = w;
    wSum += w;
  }
  let wMean = 0;
  for (let i = 0; i < n; i++) wMean += hann[i] * residuals[i];
  wMean /= Math.max(wSum, 1e-12);

  const windowed = new Array(n);
  for (let i = 0; i < n; i++) {
    windowed[i] = hann[i] * (residuals[i] - wMean);
  }

  // Compute lag-1 autocorrelation rho1 of detrended residuals for AR(1) red-noise baseline
  // (Torrence & Compo significance test: prevents 1/f^2 random-walk drift from masquerading as a 70d cycle!)
  let acNum = 0;
  let acDen = 0;
  for (let i = 1; i < n; i++) {
    acNum += residuals[i] * residuals[i - 1];
    acDen += residuals[i - 1] * residuals[i - 1];
  }
  const rho1 = clamp(acDen > 1e-12 ? acNum / acDen : 0, 0, 0.96);

  const rawSpectrum = [];
  const logMin = Math.log(effMin);
  const logMax = Math.log(effMax);
  const normDen = Math.max(wSum * wSum * 0.25, 1e-12);

  for (let j = 0; j < bins; j++) {
    const frac = bins > 1 ? j / (bins - 1) : 0;
    const period = Math.exp(logMin + frac * (logMax - logMin));
    const omega = (2 * Math.PI) / period;
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const ang = omega * t;
      const v = windowed[t];
      re += v * Math.cos(ang);
      im += v * Math.sin(ang);
    }
    const power = (re * re + im * im) / normDen;
    // Theoretical AR(1) red-noise spectral shape at frequency omega
    const redShape = (1 - rho1 * rho1) / Math.max(1e-6, 1 - 2 * rho1 * Math.cos(omega) + rho1 * rho1);
    rawSpectrum.push({ period, omega, power, redShape });
  }

  // Scale red-noise continuum to match observed spectrum median ratio so SNR = 1.0 on pure random walk
  const rawRatios = rawSpectrum.map((b) => b.power / Math.max(b.redShape, 1e-12));
  const medScale = Math.max(median(rawRatios), 1e-12);
  for (const b of rawSpectrum) {
    b.redBaseline = b.redShape * medScale;
    b.whitenedPower = b.power / Math.max(b.redBaseline, 1e-12); // AR(1) red-noise-adjusted SNR
  }

  const totalWhite = rawSpectrum.reduce((s, b) => s + b.whitenedPower, 0) || 1e-12;
  const maxWhite = Math.max(...rawSpectrum.map((b) => b.whitenedPower), 1e-12);
  const peakSnr = maxWhite;

  // Normalized Shannon Spectral Entropy on the AR(1)-whitened spectrum (0 = pure tone, 1 = pure red/white noise)
  let entropyNum = 0;
  for (const b of rawSpectrum) {
    const p = b.whitenedPower / totalWhite;
    if (p > 1e-12) entropyNum -= p * Math.log(p);
  }
  const spectralEntropy = clamp(entropyNum / Math.log(Math.max(2, rawSpectrum.length)), 0, 1);

  // 3. Extract non-overlapping local peaks ABOVE the AR(1) red-noise continuum
  const localPeaks = [];
  for (let j = 0; j < rawSpectrum.length; j++) {
    const cur = rawSpectrum[j].whitenedPower;
    const prev = j > 0 ? rawSpectrum[j - 1].whitenedPower : -1;
    const next = j < rawSpectrum.length - 1 ? rawSpectrum[j + 1].whitenedPower : -1;
    if (cur >= prev && cur >= next) {
      localPeaks.push({ ...rawSpectrum[j], idx: j, snr: cur });
    }
  }
  localPeaks.sort((a, b) => b.snr - a.snr);

  const selected = [];
  for (const pk of localPeaks) {
    if (selected.length >= maxHarmonics) break;
    if (selected.length > 0 && pk.snr < 1.85) continue;
    const tooClose = selected.some(
      (s) => Math.abs(Math.log(pk.period / s.period)) < 0.24
    );
    if (tooClose) continue;
    selected.push(pk);
  }
  if (!selected.length && rawSpectrum.length) {
    const best = [...rawSpectrum].sort((a, b) => b.whitenedPower - a.whitenedPower)[0];
    selected.push({ ...best, snr: best.whitenedPower });
  }

  // 4. Phase-locked multi-harmonic Ridge/OLS regression on UNWINDOWED residuals
  const kCount = selected.length;
  const pCols = 1 + 2 * kCount;
  const XtX = Array.from({ length: pCols }, () => new Array(pCols).fill(0));
  const Xty = new Array(pCols).fill(0);
  const rowBuf = new Array(pCols);

  for (let t = 0; t < n; t++) {
    rowBuf[0] = 1;
    for (let k = 0; k < kCount; k++) {
      const ang = selected[k].omega * t;
      rowBuf[1 + 2 * k] = Math.cos(ang);
      rowBuf[2 + 2 * k] = Math.sin(ang);
    }
    const y = residuals[t];
    for (let r = 0; r < pCols; r++) {
      const xr = rowBuf[r];
      Xty[r] += xr * y;
      for (let c = r; c < pCols; c++) {
        XtX[r][c] += xr * rowBuf[c];
      }
    }
  }
  for (let r = 0; r < pCols; r++) {
    for (let c = 0; c < r; c++) XtX[r][c] = XtX[c][r];
    // Mild ridge regularization on harmonic terms prevents collinearity spikes
    XtX[r][r] += r === 0 ? 1e-6 : Math.max(0.08, n * 0.0025);
  }

  const coeffs = solveLinearSystem(XtX, Xty) || new Array(pCols).fill(0);
  const bias = coeffs[0] || 0;
  const harmonics = selected.map((pk, k) => {
    const a = coeffs[1 + 2 * k] || 0;
    const b = coeffs[2 + 2 * k] || 0;
    const amp = Math.sqrt(a * a + b * b);
    const phi = Math.atan2(b, a);
    const nowRad = ((pk.omega * (n - 1) - phi) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const phaseDeg = (nowRad * 180) / Math.PI;
    const radToPeak = nowRad < 0.04 ? 0 : (2 * Math.PI - nowRad) % (2 * Math.PI);
    const radToTrough = ((Math.PI - nowRad) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const daysToPeak = radToPeak / pk.omega;
    const daysToTrough = radToTrough / pk.omega;
    // Instantaneous slope of a*cos(wt) + b*sin(wt) = A*cos(wt - phi) is -A*w*sin(nowRad)
    const slopeSign = -Math.sin(nowRad);
    return {
      period: +pk.period.toFixed(1),
      omega: pk.omega,
      a,
      b,
      amp,
      ampPct: +(amp * 100).toFixed(2),
      power: pk.power,
      snr: +pk.snr.toFixed(2),
      phaseDeg: Math.round(phaseDeg),
      phaseLabel: classifyPhaseLabel(phaseDeg),
      daysToPeak: +daysToPeak.toFixed(1),
      daysToTrough: +daysToTrough.toFixed(1),
      direction: slopeSign >= 0.12 ? 'rising' : slopeSign <= -0.12 ? 'falling' : 'turning',
    };
  });

  // Evaluate in-sample R² of the harmonic fit on detrended residuals
  const fitted = new Array(n);
  let sse = 0;
  for (let t = 0; t < n; t++) {
    let val = bias;
    for (const h of harmonics) {
      const ang = h.omega * t;
      val += h.a * Math.cos(ang) + h.b * Math.sin(ang);
    }
    fitted[t] = val;
    const err = residuals[t] - val;
    sse += err * err;
  }
  const rSquared = resSq > 1e-12 ? clamp(1 - sse / resSq, 0, 0.95) : 0;

  // Excess-power share among top AR(1)-whitened harmonics (guarantees #1 peak has highest share)
  const topSnrSum = harmonics.reduce((s, h) => s + Math.max(0.1, h.snr), 0) || 1;
  for (const h of harmonics) {
    h.powerSharePct = Math.round((Math.max(0.1, h.snr) / topSnrSum) * 100);
  }

  return {
    n,
    slope,
    intercept,
    residuals,
    fitted,
    residualStd,
    rawSpectrum,
    maxWhite,
    peakSnr,
    spectralEntropy,
    rSquared,
    harmonics,
  };
}

/**
 * Computes full frequency-domain / spectral forecast from a price series.
 */
export function computeSpectralForecast(
  closes = [],
  {
    horizonDays = 21,
    minPeriod = 4,
    maxPeriod = 75,
    maxHarmonics = 3,
    sampleLabel = 'days',
    runWalkForward = true,
  } = {}
) {
  const clean = Array.isArray(closes)
    ? closes.filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0)
    : [];

  if (clean.length < 16) {
    return {
      available: false,
      samples: clean.length,
      spectralUnitScore: 0,
      expected7dPct: 0,
      expected30dPct: 0,
      clarityScore: 0,
      clarityLabel: 'Insufficient History',
      confidence: 0,
      spectralEntropy: 1,
      peakSnr: 1,
      rSquared: 0,
      oosDirHitPct: null,
      oosSamples: 0,
      dominantCycles: [],
      spectrum: [],
      historicalWave: [],
      projectionWave: [],
      nextPeakStep: null,
      nextTroughStep: null,
      summary: 'Need at least 16 bars for frequency-domain cycle extraction.',
    };
  }

  const core = fitSpectralCore(clean, {
    minPeriod,
    maxPeriod,
    maxHarmonics,
    gridPoints: 64,
  });

  // Causal walk-forward out-of-sample verification (zero lookahead)
  let oosDirHitPct = null;
  let oosSamples = 0;
  if (runWalkForward && clean.length >= 42) {
    const evalH = Math.min(5, Math.max(3, Math.round(horizonDays / 4)));
    const maxChecks = Math.min(10, Math.floor((clean.length - 30) / 3));
    let hits = 0;
    for (let m = 1; m <= maxChecks; m++) {
      const cut = clean.length - evalH - (m - 1) * 3;
      if (cut < 28) break;
      const pastSlice = clean.slice(0, cut);
      const pastFit = fitSpectralCore(pastSlice, {
        minPeriod,
        maxPeriod: Math.min(maxPeriod, cut / 2.1),
        maxHarmonics,
        gridPoints: 40,
      });
      // Predicted harmonic delta over next evalH bars
      let predDelta = 0;
      for (const h of pastFit.harmonics) {
        const nowV = h.a * Math.cos(h.omega * (cut - 1)) + h.b * Math.sin(h.omega * (cut - 1));
        const futV = h.a * Math.cos(h.omega * (cut - 1 + evalH)) + h.b * Math.sin(h.omega * (cut - 1 + evalH));
        predDelta += (futV - nowV) * Math.exp(-evalH / Math.max(8, h.period * 1.1));
      }
      const actualLogRet = Math.log(clean[cut - 1 + evalH] / clean[cut - 1]) - pastFit.slope * evalH;
      if (Math.abs(actualLogRet) < 0.0015 || predDelta * actualLogRet >= 0) {
        hits++;
      }
      oosSamples++;
    }
    if (oosSamples >= 3) {
      oosDirHitPct = Math.round((hits / oosSamples) * 100);
    }
  }

  // Noise-gated spectral clarity & confidence (0..1) using AR(1) whitened SNR + Entropy + R² + causal OOS gate
  const snrNorm = clamp((core.peakSnr - 2.0) / 7.5, 0, 1);
  const entNorm = clamp((0.92 - core.spectralEntropy) / 0.38, 0, 1);
  const r2Norm = clamp((core.rSquared - 0.10) / 0.50, 0, 1);
  const rawClarity = clamp(snrNorm * 0.50 + entNorm * 0.28 + r2Norm * 0.22, 0, 1);

  // If causal OOS walk-forward hit rate is below random (<45%), dampen BOTH clarity and confidence honestly
  const oosMult =
    oosDirHitPct == null
      ? 0.85
      : oosDirHitPct >= 65
        ? 1.12
        : oosDirHitPct >= 50
          ? 0.95
          : 0.55;
  const clarityScore = +clamp(rawClarity * (oosDirHitPct != null && oosDirHitPct < 45 ? 0.65 : 1), 0, 1).toFixed(2);
  const confidence = +clamp(rawClarity * oosMult, 0.10, 0.92).toFixed(2);

  const clarityLabel =
    clarityScore >= 0.60
      ? 'Strong Cycle Signal'
      : clarityScore >= 0.34
        ? 'Moderate Cycle'
        : 'Weak / Drift-Dominated';

  const spot = clean[clean.length - 1];
  const steps = Math.max(5, Math.round(horizonDays));
  const ampScale = clamp(0.22 + confidence * 0.68, 0.18, 0.88);
  const nowIdx = core.n - 1;

  // Baseline harmonic value at t = nowIdx so forward curve anchors smoothly to today's spot
  const nowHarmVals = core.harmonics.map(
    (h) => h.a * Math.cos(h.omega * nowIdx) + h.b * Math.sin(h.omega * nowIdx)
  );
  const nowCompositeRes = core.fitted[nowIdx] || 0;

  const projectionWave = [
    {
      step: 0,
      dayApprox: 0,
      cyclePct: +(nowCompositeRes * 100).toFixed(2),
      deltaCyclePct: 0,
      price: +spot.toFixed(2),
    },
  ];

  let peakVal = -Infinity;
  let peakStep = null;
  let troughVal = Infinity;
  let troughStep = null;

  for (let k = 1; k <= steps; k++) {
    let deltaH = 0;
    for (let j = 0; j < core.harmonics.length; j++) {
      const h = core.harmonics[j];
      const futV = h.a * Math.cos(h.omega * (nowIdx + k)) + h.b * Math.sin(h.omega * (nowIdx + k));
      const tau = Math.max(8, h.period * 1.15) * (0.55 + 0.65 * confidence);
      deltaH += (futV - nowHarmVals[j]) * Math.exp(-k / tau);
    }
    const scaledDeltaH = clamp(deltaH * ampScale, -0.14, 0.14);
    const trendDelta = clamp(core.slope, -0.004, 0.004) * k * Math.exp(-k / 28) * 0.30;
    const totalLogMove = clamp(scaledDeltaH + trendDelta, -0.20, 0.20);
    const wavePosPct = +((nowCompositeRes + scaledDeltaH) * 100).toFixed(2);
    const deltaCyclePct = +((Math.exp(scaledDeltaH) - 1) * 100).toFixed(2);
    const projPrice = +(spot * Math.exp(totalLogMove)).toFixed(2);

    if (k >= 1 && wavePosPct > peakVal) {
      peakVal = wavePosPct;
      peakStep = k;
    }
    if (k >= 1 && wavePosPct < troughVal) {
      troughVal = wavePosPct;
      troughStep = k;
    }

    projectionWave.push({
      step: k,
      dayApprox: sampleLabel === 'days' ? Math.round((k / 21) * 30) : k,
      cyclePct: wavePosPct,
      deltaCyclePct,
      price: projPrice,
    });
  }

  const idx7 = Math.min(steps, 5);
  const idx30 = Math.min(steps, 21);
  const expected7dPct = projectionWave[idx7]?.deltaCyclePct ?? 0;
  const expected30dPct = projectionWave[idx30]?.deltaCyclePct ?? 0;

  // Normalized ensemble specialist vote (-1..+1), scaled smoothly by cycle clarity & OOS confidence
  const volNorm = Math.max(core.residualStd * 100 * 1.45, 1.5);
  const rawScore = (expected7dPct * 0.45 + expected30dPct * 0.55) / volNorm;
  const spectralUnitScore = +clamp(rawScore * (0.35 + confidence * 0.75), -1, 1).toFixed(3);

  const dominantCycles = core.harmonics.map((h, i) => ({
    rank: i + 1,
    period: h.period,
    marketLabel: classifyBullionCycleLabel(h.period, sampleLabel),
    ampPct: h.ampPct,
    powerSharePct: h.powerSharePct,
    snr: h.snr,
    phaseDeg: h.phaseDeg,
    phaseLabel: h.phaseLabel,
    direction: h.direction,
    daysToPeak: h.daysToPeak,
    daysToTrough: h.daysToTrough,
  }));

  // Compact PSD bins (~36 points) normalized on AR(1)-whitened excess power for clean Power Spectrum visualization
  const peakPeriods = new Set(core.harmonics.map((h) => h.period));
  const stride = Math.max(1, Math.floor(core.rawSpectrum.length / 36));
  const spectrum = [];
  for (let i = 0; i < core.rawSpectrum.length; i += stride) {
    const b = core.rawSpectrum[i];
    const pRound = +b.period.toFixed(1);
    const isPeak = [...peakPeriods].some((pp) => Math.abs(Math.log(pp / b.period)) < 0.08);
    spectrum.push({
      period: pRound,
      powerNorm: +clamp(b.whitenedPower / Math.max(core.maxWhite, 1e-12), 0, 1).toFixed(3),
      isPeak,
    });
  }

  // Last 45 bars of detrended actual vs harmonic reconstruction (in % around secular trend)
  const histStart = Math.max(0, core.n - 45);
  const historicalWave = [];
  for (let t = histStart; t < core.n; t++) {
    historicalWave.push({
      offset: t - (core.n - 1),
      actualPct: +(core.residuals[t] * 100).toFixed(2),
      fitPct: +(core.fitted[t] * 100).toFixed(2),
    });
  }

  const primary = dominantCycles[0] || null;
  const unitWord = sampleLabel === 'days' ? 'd' : ' bars';
  const summary = primary
    ? `Dominant ${primary.period}${unitWord} ${primary.marketLabel} cycle is ${primary.phaseLabel.toLowerCase()} (${primary.phaseDeg}°, next crest ~${primary.daysToPeak}${unitWord}, trough ~${primary.daysToTrough}${unitWord}) · SNR ${core.peakSnr.toFixed(1)}× · ${clarityLabel}.`
    : 'No dominant harmonic cycle detected above the noise floor.';

  return {
    available: true,
    samples: core.n,
    sampleLabel,
    spectralUnitScore,
    expected7dPct: +expected7dPct.toFixed(2),
    expected30dPct: +expected30dPct.toFixed(2),
    clarityScore,
    clarityLabel,
    confidence,
    spectralEntropy: +core.spectralEntropy.toFixed(2),
    peakSnr: +core.peakSnr.toFixed(2),
    rSquared: +core.rSquared.toFixed(2),
    oosDirHitPct,
    oosSamples,
    dominantCycles,
    spectrum,
    historicalWave,
    projectionWave,
    nextPeakStep: peakStep,
    nextTroughStep: troughStep,
    summary,
  };
}
