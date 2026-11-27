import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/styles.css';
import './styles/react-overrides.css';
import { BullionProvider } from './context/BullionContext';
import App from './App';

// v60 ASM hardening: runtime cross-origin clickjacking frame-busting guard
if (typeof window !== 'undefined' && window.top && window.top !== window.self) {
  try {
    // Same-origin test — throws SecurityError if cross-origin
    void window.top.location.href;
  } catch {
    if (document.documentElement) {
      document.documentElement.style.display = 'none';
    }
  }
}

// Register hardened Service Worker in production browser context with auto-upgrade reload
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' || window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
) {
  let swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swReloaded) return;
    swReloaded = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
      })
      .catch(() => {});
  });
}

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BullionProvider>
        <App />
      </BullionProvider>
    </React.StrictMode>
  );
}
