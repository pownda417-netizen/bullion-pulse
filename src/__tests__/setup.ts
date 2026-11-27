import '@testing-library/jest-dom';
import { vi } from 'vitest';

// In-memory Storage shim so Node 26's ExperimentalWarning stub never shadows jsdom localStorage
const memStore = new Map<string, string>();
const storageShim: Storage = {
  get length() {
    return memStore.size;
  },
  clear() {
    memStore.clear();
  },
  getItem(key: string) {
    return memStore.has(key) ? memStore.get(key)! : null;
  },
  key(index: number) {
    return Array.from(memStore.keys())[index] ?? null;
  },
  removeItem(key: string) {
    memStore.delete(key);
  },
  setItem(key: string, value: string) {
    memStore.set(key, String(value));
  },
};
Object.defineProperty(globalThis, 'localStorage', { value: storageShim, configurable: true, writable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: storageShim, configurable: true, writable: true });
}

// Mock HTMLCanvasElement.getContext for jsdom canvas charts
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn(() => ({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    roundRect: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    measureText: () => ({ width: 20 }),
  })),
});

if (typeof window !== 'undefined' && !window.requestAnimationFrame) {
  window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
  window.cancelAnimationFrame = (id: number) => clearTimeout(id);
}
