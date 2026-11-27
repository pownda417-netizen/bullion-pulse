import type { LangCode } from '../types/bullion';

export type NonEnLang = Exclude<LangCode, 'en'>;
export type ExactLangMap = Record<NonEnLang, string>;
export type PatternRule = readonly [RegExp, (match: RegExpMatchArray, lang: NonEnLang) => string | null];

export interface I18nPacksBundle {
  readonly EXACT: Readonly<Record<string, ExactLangMap>>;
  readonly PATTERNS: readonly PatternRule[];
  readonly LANG_KEYS: readonly NonEnLang[];
}

export declare const I18N_PACKS: I18nPacksBundle;
export declare const EXACT: Readonly<Record<string, ExactLangMap>>;
export declare const PATTERNS: readonly PatternRule[];
