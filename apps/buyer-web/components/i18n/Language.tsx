'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { LANGUAGES, languageInfo, saveLangCookie, useApiClient, useI18n, type Lang } from '@sthiva/web-core';
import { useAuth } from '../auth/AuthProvider';

// Kannada, Hindi or English (owner decision 2026-11-20). Buyers choose before creating an account
// (LanguageChooser on the sign-in page) and can change it any time (LanguageSwitcher in the header).

/** Saves the language (cookie, and the account when signed in), then reloads in that language. */
function useChooseLanguage() {
  const client = useApiClient();
  const { status } = useAuth();
  return async (lang: Lang) => {
    saveLangCookie(lang);
    if (status === 'signed-in') {
      await client.request('/users/me', { method: 'PATCH', auth: true, envelope: true, schema: z.unknown(), body: { preferredLanguage: lang } }).catch(() => {});
    }
    window.location.reload();
  };
}

/** The full-screen step: "Choose your language", written in all three so everyone can read it. */
export function LanguageChooser() {
  const choose = useChooseLanguage();
  const [busy, setBusy] = useState<Lang | null>(null);
  return (
    <div className="animate-fade-up">
      <span className="mb-6 inline-grid h-14 w-14 place-items-center rounded-2xl bg-lime text-ink">
        <span className="material-symbols-outlined text-[28px]" aria-hidden="true">translate</span>
      </span>
      <h1 className="font-display text-[clamp(1.9rem,5vw,2.6rem)] font-bold leading-tight">
        <span className="block">ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ</span>
        <span className="block">अपनी भाषा चुनें</span>
        <span className="block">Choose your language</span>
      </h1>
      <ul className="mt-8 flex flex-col gap-3" role="radiogroup" aria-label="Language">
        {LANGUAGES.map((l) => (
          <li key={l.code}>
            <button
              type="button"
              role="radio"
              aria-checked={false}
              disabled={busy !== null}
              onClick={() => { setBusy(l.code); void choose(l.code); }}
              lang={l.htmlLang}
              className="flex h-16 w-full items-center gap-4 rounded-2xl border border-sand-4 bg-white px-5 text-left transition-[border-color,box-shadow] hover:border-ink focus-visible:shadow-[0_0_0_4px_rgba(243,184,6,0.55)] focus-visible:outline-none disabled:opacity-60"
            >
              <span className="text-[20px] font-semibold text-ink">{l.name}</span>
              {l.code !== 'en' && <span className="text-[14px] text-stone" lang="en">{l.english}</span>}
              <span className="material-symbols-outlined ml-auto text-[22px] text-stone" aria-hidden="true">
                {busy === l.code ? 'progress_activity' : 'arrow_forward'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[13px] text-stone">
        ನೀವು ಇದನ್ನು ನಂತರವೂ ಬದಲಾಯಿಸಬಹುದು · आप इसे बाद में भी बदल सकते हैं · You can change it later
      </p>
    </div>
  );
}

/** Header control: shows the current language; opens a short list to switch. */
export function LanguageSwitcher({ compact = false, tone = 'light' }: { compact?: boolean; tone?: 'light' | 'dark' }) {
  const { lang } = useI18n();
  const choose = useChooseLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  const current = languageInfo(lang);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Language: ${current.english}`}
        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[14px] font-semibold ${tone === 'dark' ? 'text-sand/80 hover:bg-white/10' : 'text-ink hover:bg-ink/5'}`}
      >
        <span className="material-symbols-outlined text-[22px]" aria-hidden="true">translate</span>
        {!compact && <span lang={current.htmlLang}>{current.name}</span>}
      </button>
      {open && (
        <ul role="listbox" aria-label="Language" className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-ink/10 bg-sand py-1 text-ink shadow-[0_24px_48px_-24px_rgba(11,12,10,0.45)]">
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === lang}
                lang={l.htmlLang}
                onClick={() => { setOpen(false); if (l.code !== lang) void choose(l.code); }}
                className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-[15px] hover:bg-ink/5 ${l.code === lang ? 'font-semibold' : ''}`}
              >
                {l.name}
                {l.code !== 'en' && <span className="text-[12px] text-stone" lang="en">{l.english}</span>}
                {l.code === lang && <span className="material-symbols-outlined ml-auto text-[18px]" aria-hidden="true">check</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
