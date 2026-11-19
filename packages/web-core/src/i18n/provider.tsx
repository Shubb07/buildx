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
};

const I18nContext = createContext<I18nValue>({
  lang: DEFAULT_LANG,
  chosen: false,
  t: (text, vars) => translate({}, 'en', text, vars),
  setLang: () => {},
});

export function I18nProvider({ lang, chosen, dictionaries, children }: { lang: Lang; chosen: boolean; dictionaries: Dictionaries; children: ReactNode }) {
  const t = useCallback((text: string, vars?: Vars) => translate(dictionaries, lang, text, vars), [dictionaries, lang]);
  const setLang = useCallback((next: Lang, opts?: { reload?: boolean }) => {
    saveLangCookie(next);
    if (opts?.reload !== false) window.location.reload();
  }, []);
  const value = useMemo(() => ({ lang, chosen, t, setLang }), [lang, chosen, t, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** The translate function for the current language: t('Add to cart'), t('Get it by {date}', { date }) */
export function useT() {
  return useContext(I18nContext).t;
}
