// Languages on the Sthiva websites (owner decision 2026-11-20: Kannada, Hindi, English; launch city
// Chitradurga). The site is written in English; each app keeps a dictionary per language keyed by the
// English text, so anything not translated yet simply shows in English instead of breaking.
//
// The choice lives in a cookie shared by sthiva.com and seller.sthiva.com, so the server renders pages
// straight in the chosen language (no flash of English), and on the account (User.language) for
// messages we send later.

export const LANGUAGES = [
  { code: 'kn', name: 'ಕನ್ನಡ', english: 'Kannada', htmlLang: 'kn-IN', hint: 'ಕನ್ನಡದಲ್ಲಿ ನೋಡಿ' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi', htmlLang: 'hi-IN', hint: 'हिन्दी में देखें' },
  { code: 'en', name: 'English', english: 'English', htmlLang: 'en-IN', hint: 'See it in English' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['code'];
export const DEFAULT_LANG: Lang = 'en';
export const LANG_COOKIE = 'sthiva_lang';

/** A dictionary for one language: English text -> translated text. Use {name} for values. */
export type Dictionary = Record<string, string>;
export type Dictionaries = Partial<Record<Exclude<Lang, 'en'>, Dictionary>>;
export type Vars = Record<string, string | number>;

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && LANGUAGES.some((l) => l.code === v);
}

/** The language in a cookie value, or null when none was chosen yet. */
export function parseLang(v: string | null | undefined): Lang | null {
  return isLang(v) ? v : null;
}

export function languageInfo(code: Lang) {
  return LANGUAGES.find((l) => l.code === code)!;
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Translate outside React (server components, metadata). Missing text falls back to English. */
export function translate(dicts: Dictionaries, lang: Lang, text: string, vars?: Vars): string {
  const hit = lang === 'en' ? undefined : dicts[lang]?.[text];
  return fill(hit ?? text, vars);
}

/** Saves the choice for this site and its sub-sites (sthiva.com and seller.sthiva.com share it). */
export function saveLangCookie(lang: Lang) {
  if (typeof document === 'undefined') return;
  const host = window.location.hostname;
  const domain = host === 'sthiva.com' || host.endsWith('.sthiva.com') ? '; domain=.sthiva.com' : '';
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax${domain}${secure}`;
}

/**
 * Marks English text kept in a list or constant that is translated later with t(label). It returns
 * the text unchanged; the translation tests look for tx('...') as well as t('...').
 */
export function tx<T extends string>(text: T): T {
  return text;
}
