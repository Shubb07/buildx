import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Geist, Geist_Mono, Instrument_Serif, Noto_Sans_Kannada, Noto_Sans_Devanagari } from 'next/font/google';
import { cookies } from 'next/headers';
import { LANG_COOKIE, languageInfo, parseLang } from '@sthiva/web-core';
import { DICTIONARIES } from '@/lib/i18n';
import './globals.css';
import { Providers } from './providers';

// Same type system as the storefront (apps/buyer-web): all SIL Open Font License, self-hosted by next/font
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });
// Kannada and Hindi (SIL Open Font License); fetched only when a page has those letters
const kannada = Noto_Sans_Kannada({ subsets: ['kannada'], variable: '--font-kn', display: 'swap', preload: false });
const devanagari = Noto_Sans_Devanagari({ subsets: ['devanagari'], variable: '--font-hi', display: 'swap', preload: false });

export const metadata: Metadata = {
  title: {
    default: 'Sthiva for suppliers | Catalogue and orders',
    template: '%s | Sthiva Seller',
  },
  description: 'Manage your Sthiva product catalog, stock and incoming orders.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0B0C0A',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Kannada, Hindi or English, chosen before signing up; the cookie is shared with sthiva.com
  const chosen = parseLang((await cookies()).get(LANG_COOKIE)?.value);
  const lang = chosen ?? 'en';
  return (
    <html lang={languageInfo(lang).htmlLang} suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable} ${serif.variable} ${kannada.variable} ${devanagari.variable}`}>
      <head>
        {/* Icon font: the used icons only, self-hosted at build time; Google's stylesheet if that failed */}
        {process.env.ICON_CSS ? (
          <>
            <link rel="preload" href={process.env.ICON_FONT} as="font" type="font/woff2" crossOrigin="" />
            <style dangerouslySetInnerHTML={{ __html: process.env.ICON_CSS }} />
          </>
        ) : (
          <link href={process.env.ICON_STYLESHEET} rel="stylesheet" />
        )}
      </head>
      <body className="min-h-screen">
        {/* Only the chosen language's words are sent to the browser */}
        <Providers lang={lang} chosen={chosen !== null} dictionaries={lang === 'en' ? {} : { [lang]: DICTIONARIES[lang] }}>{children}</Providers>
      </body>
    </html>
  );
}
