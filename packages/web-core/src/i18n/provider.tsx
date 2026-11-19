'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_LANG, saveLangCookie, translate, type Dictionaries, type Lang, type Vars } from './core';

type I18nValue = {
  lang: Lang;
  /** True once the visitor has picked a language (the cookie exists) */
  chosen: boolean;
  t: (text: string, vars?: Vars) => string;
  /** Saves the choice and reloads, so every part of the page (server parts too) switches */
  setLang: (lang: Lang, opts?: { reload?: boolean }) => void;
  /** Kannada or Hindi words that are translations of English texts turned back into English (for search) */
  toEnglish: (text: string) => string;
};

const I18nContext = createContext<I18nValue>({
  lang: DEFAULT_LANG,
  chosen: false,
  t: (text, vars) => translate({}, 'en', text, vars),
  setLang: () => {},
  toEnglish: (text) => text,
});

/** Replaces translated words in `text` with their English originals, longest first. */
export function reverseTranslate(dict: Record<string, string> | undefined, text: string): string {
  if (!dict) return text;
  const pairs = Object.entries(dict)
    .filter(([en, tr]) => tr && tr !== en && !/\{\w+\}/.test(en) && en.length <= 40)
    .sort((a, b) => b[1].length - a[1].length);
  let out = text.trim();
  for (const [en, tr] of pairs) {
    if (out.includes(tr)) out = out.split(tr).join(en);
  }
  return out;
}

export function I18nProvider({ lang, chosen, dictionaries, children }: { lang: Lang; chosen: boolean; dictionaries: Dictionaries; children: ReactNode }) {
  const t = useCallback((text: string, vars?: Vars) => translate(dictionaries, lang, text, vars), [dictionaries, lang]);
  const setLang = useCallback((next: Lang, opts?: { reload?: boolean }) => {
    saveLangCookie(next);
    if (opts?.reload !== false) window.location.reload();
  }, []);
  const toEnglish = useCallback((text: string) => (lang === 'en' ? text : reverseTranslate(dictionaries[lang], text)), [dictionaries, lang]);
  const value = useMemo(() => ({ lang, chosen, t, setLang, toEnglish }), [lang, chosen, t, setLang, toEnglish]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** The translate function for the current language: t('Add to cart'), t('Get it by {date}', { date }) */
export function useT() {
  return useContext(I18nContext).t;
}
