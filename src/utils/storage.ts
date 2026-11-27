import type { AlertLogItem, AppSettings, HistoryPoint, SessionAlertedState } from '../types/bullion';
import { MAX_BACKUP_BYTES, STORAGE_KEY } from './format';
import {
  cloneDefaultSettings,
  createEmptySessionAlerted,
  isPlainObject,
  sanitizeAlertLog,
  sanitizeHistorySeries,
  sanitizePersistedSettings,
  sanitizeSessionAlerted,
} from './security';

export interface PersistedPayload {
  settings: AppSettings;
  alertLog: AlertLogItem[];
  history: {
    gold: HistoryPoint[];
    silver: HistoryPoint[];
  };
  sessionAlerted: SessionAlertedState;
}

export function loadPersistedState(): PersistedPayload {
  const fallback: PersistedPayload = {
    settings: cloneDefaultSettings(),
    alertLog: [],
    history: { gold: [], silver: [] },
    sessionAlerted: createEmptySessionAlerted(),
  };
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    if (raw.length > MAX_BACKUP_BYTES) {
      localStorage.removeItem(STORAGE_KEY);
      return fallback;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return fallback;
    }
    return {
      settings: isPlainObject(parsed.settings)
        ? sanitizePersistedSettings(parsed.settings)
        : fallback.settings,
      alertLog: Array.isArray(parsed.alertLog) ? sanitizeAlertLog(parsed.alertLog) : [],
      history: isPlainObject(parsed.history)
        ? {
            gold: sanitizeHistorySeries(parsed.history.gold),
            silver: sanitizeHistorySeries(parsed.history.silver),
          }
        : fallback.history,
      sessionAlerted: isPlainObject(parsed.sessionAlerted)
        ? sanitizeSessionAlerted(parsed.sessionAlerted)
        : fallback.sessionAlerted,
    };
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

export function savePersistedState(payload: PersistedPayload): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const safePayload: PersistedPayload = {
      settings: sanitizePersistedSettings(payload.settings),
      alertLog: payload.alertLog.slice(0, 25),
      history: {
        gold: payload.history.gold.slice(-60),
        silver: payload.history.silver.slice(-60),
      },
      sessionAlerted: sanitizeSessionAlerted(payload.sessionAlerted),
    };
    const serialized = JSON.stringify(safePayload);
    if (serialized.length <= MAX_BACKUP_BYTES) {
      localStorage.setItem(STORAGE_KEY, serialized);
    }
  } catch {
    // Ignore quota/private-browsing errors
  }
}

export function buildBackupJson(settings: AppSettings, alertLog: AlertLogItem[]): string {
  const safe = sanitizePersistedSettings(settings);
  // v60 ASM hardening: redact private ntfy topic in exported backups by default
  const exported = {
    app: 'Bullion Pulse',
    version: 'v60-react',
    exportedAt: new Date().toISOString(),
    settings: {
      ...safe,
      ntfyTopic: '',
    },
    alertLog: sanitizeAlertLog(alertLog),
  };
  return JSON.stringify(exported, null, 2);
}

export function parseBackupJson(
  rawText: string,
  existingNtfyTopic: string
): { settings: AppSettings; alertLog: AlertLogItem[] } | null {
  if (!rawText || rawText.length > MAX_BACKUP_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (!isPlainObject(parsed) || !isPlainObject(parsed.settings)) return null;
    const nextSettings = sanitizePersistedSettings(parsed.settings);
    // Preserve existing private ntfy topic if backup redacted it
    if (!nextSettings.ntfyTopic && existingNtfyTopic) {
      nextSettings.ntfyTopic = existingNtfyTopic;
    }
    const nextLog = Array.isArray(parsed.alertLog) ? sanitizeAlertLog(parsed.alertLog) : [];
    return { settings: nextSettings, alertLog: nextLog };
  } catch {
    return null;
  }
}
