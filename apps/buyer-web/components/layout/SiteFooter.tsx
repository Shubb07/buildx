'use client';

import Link from 'next/link';
import { ProductHuntBadge } from './ProductHuntBadge';
import { SthivaLogo, useT, tx } from '@sthiva/web-core';
import { LanguageSwitcher } from '../i18n/Language';
import { SITE } from '@/lib/site';

export function SiteFooter() {
  const year = new Date().getFullYear();
  const t = useT();
  return (
    <footer className="on-ink relative overflow-hidden bg-ink text-sand">
      <div className="container-x relative z-10 grid gap-12 py-16 md:grid-cols-12 md:py-20">
        <div className="md:col-span-5">
          <div className="flex items-center gap-3">
            <SthivaLogo onDark height={44} />
          </div>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-sand/60">
            {t('The construction materials marketplace. Verified suppliers, honest prices, delivery checked against your PIN code.')}
          </p>
          <p className="mt-6 text-[13px] text-sand/65">{SITE.city}</p>
          <div className="mt-4 -ml-2"><LanguageSwitcher tone="dark" /></div>
          {(SITE.supportEmail || SITE.supportPhone) && (
            <ul className="mt-2 space-y-1 text-[13px] text-sand/60">
              {SITE.supportEmail && (
                <li>
                  <a className="hover:text-lime" href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
                </li>
              )}
              {SITE.supportPhone && (
                <li>
                  <a className="hover:text-lime" href={`tel:${SITE.supportPhone.replace(/\s/g, '')}`}>{SITE.supportPhone}</a>
                </li>
              )}
            </ul>
          )}
        </div>

        <FooterCol
          title={tx('Shop')}
          links={[
            { href: '/#categories', label: tx('All materials') },
            { href: '/search', label: tx('Search') },
            { href: '/cart', label: tx('Cart') },
            { href: '/orders', label: tx('Track orders') },
          ]}
        />
        <FooterCol
          title={tx('Company')}
          links={[
            { href: '/#how-it-works', label: tx('How it works') },
            { href: '/#suppliers', label: tx('Sell on Sthiva') },
            { href: '/signin', label: tx('Sign in') },
          ]}
        />
        <FooterCol
          title={tx('Legal')}
          links={[
            { href: '/terms', label: tx('Terms of service') },
            { href: '/privacy', label: tx('Privacy policy') },
            { href: '/refunds', label: tx('Cancellations and refunds') },
            { href: '/cookies', label: tx('Cookie policy and settings') },
            { href: '/account-deletion', label: tx('Delete your account') },
          ]}
        />
      </div>

      <div className="container-x relative z-10 flex flex-col gap-3 border-t border-white/10 py-6 text-[12px] text-sand/65 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {year} {SITE.legalName}. {t('All rights reserved.')}
        </p>
        <ProductHuntBadge />
        <p className="font-mono uppercase tracking-[0.16em]">{t('Made in India · Cash on delivery')}</p>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[0.18em] left-1/2 -translate-x-1/2 select-none whitespace-nowrap font-display text-[26vw] font-extrabold leading-none tracking-[-0.06em] text-white/[0.03]"
      >
        Sthiva
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  const t = useT();
  return (
    <div className="md:col-span-2 lg:col-span-2 [&:nth-child(2)]:md:col-start-7">
      <h2 className="eyebrow text-sand/65">{t(title)}</h2>
      <ul className="mt-5 space-y-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-[14px] text-sand/75 transition-colors hover:text-lime">
              {t(l.label)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
