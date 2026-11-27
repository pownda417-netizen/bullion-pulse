import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { LangCode, LanguageMeta } from '../types/bullion';
import { LANGUAGES } from '../utils/format';
import { EXACT, PATTERNS, type NonEnLang } from './packs.js';

const PURE_NUM_RE = /^[\d\s$€£¥₹฿₭.,%+\-—–·:×±/()•…|]+$/;
const MAX_I18N_CACHE = 1000;
const MAX_I18N_PATTERN_LEN = 320;

const i18nCache = new Map<string, string | null>();

export function translateText(raw: string, lang: LangCode): string {
  if (!raw || lang === 'en') return raw;
  const targetLang = lang as NonEnLang;

  // Linear O(N) leading/trailing whitespace extraction (avoids ReDoS backtracking)
  const trimmedStart = raw.trimStart();
  if (!trimmedStart) return raw;
  const lead = raw.slice(0, raw.length - trimmedStart.length);
  const trimmed = trimmedStart.trimEnd();
  const trail = trimmedStart.slice(trimmed.length);
  const norm = trimmed.replace(/\s+/g, ' ');
  if (!norm || PURE_NUM_RE.test(norm)) return raw;

  const cacheKey = `${targetLang}\u0000${norm}`;
  if (i18nCache.has(cacheKey)) {
    const hit = i18nCache.get(cacheKey);
    return hit == null ? raw : `${lead}${hit}${trail}`;
  }

  const exact = Object.hasOwn(EXACT, norm) ? EXACT[norm]?.[targetLang] : null;
  if (exact) {
    if (i18nCache.size >= MAX_I18N_CACHE) {
      const oldest = i18nCache.keys().next().value;
      if (oldest !== undefined) i18nCache.delete(oldest);
    }
    i18nCache.set(cacheKey, exact);
    return `${lead}${exact}${trail}`;
  }

  // Bound pattern scanning length to prevent client-side ReDoS on long external text
  if (norm.length <= MAX_I18N_PATTERN_LEN) {
    for (let i = 0; i < PATTERNS.length; i++) {
      const [re, fn] = PATTERNS[i];
      const m = norm.match(re);
      if (m) {
        const out = fn(m, targetLang);
        if (out) {
          if (i18nCache.size >= MAX_I18N_CACHE) {
            const oldest = i18nCache.keys().next().value;
            if (oldest !== undefined) i18nCache.delete(oldest);
          }
          i18nCache.set(cacheKey, out);
          return `${lead}${out}${trail}`;
        }
      }
    }
  }

  if (i18nCache.size >= MAX_I18N_CACHE) {
    const oldest = i18nCache.keys().next().value;
    if (oldest !== undefined) i18nCache.delete(oldest);
  }
  i18nCache.set(cacheKey, null);
  return raw;
}

export interface I18nContextValue {
  lang: LangCode;
  setLanguage: (next: LangCode) => void;
  t: (enText: string) => string;
  languages: readonly LanguageMeta[];
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLanguage: () => {},
  t: (s) => s,
  languages: LANGUAGES,
});

export const I18nProvider: React.FC<{
  lang: LangCode;
  onLanguageChange: (next: LangCode) => void;
  children: React.ReactNode;
}> = ({ lang, onLanguageChange, children }) => {
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const t = useCallback((enText: string) => translateText(enText, lang), [lang]);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLanguage: onLanguageChange,
      t,
      languages: LANGUAGES,
    }),
    [lang, onLanguageChange, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
