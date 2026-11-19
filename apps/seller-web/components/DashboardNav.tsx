'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth/AuthProvider';
import { Logo } from './brand/Logo';
import { tx, useT } from '@sthiva/web-core';
import { LanguageSwitcher } from './i18n/Language';

const TABS = [
  { href: '/', label: tx('Overview'), icon: 'space_dashboard' },
  { href: '/orders', label: tx('Orders'), icon: 'receipt_long' },
  { href: '/quotes', label: tx('Quotes'), icon: 'request_quote' },
  { href: '/problems', label: tx('Problems'), icon: 'report' },
  { href: '/products', label: tx('Products'), icon: 'inventory_2' },
  { href: '/stock', label: tx('Stock'), icon: 'stacks' },
  { href: '/weekly', label: tx('Weekly check'), icon: 'event_available' },
  { href: '/balance', label: tx('Balance'), icon: 'account_balance_wallet' },
  { href: '/payouts', label: tx('Payouts'), icon: 'payments' },
  { href: '/setup', label: tx('Business'), icon: 'storefront' },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function DashboardNav() {
  const pathname = usePathname();
  const { signOut, user } = useAuth();
  const t = useT();

  return (
    <>
      <header className="on-ink sticky top-0 z-50 bg-ink text-sand">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo tone="sand" />
            <span className="rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-lime">{t('Supplier')}</span>
          </div>
          <nav className="hidden min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] sm:flex" aria-label={t('Main')}>
            {TABS.map((tab) => {
              const active = isActive(pathname, tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] font-medium transition-colors ${
                    active ? 'bg-lime text-ink' : 'text-sand/70 hover:bg-white/10 hover:text-sand'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{tab.icon}</span>
                  {t(tab.label)}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <LanguageSwitcher compact tone="dark" />
            {user && (
              <span className="hidden items-center gap-2 text-[14px] text-sand/70 md:flex">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 font-semibold text-sand">{user.name?.[0]?.toUpperCase() ?? 'S'}</span>
                {user.name}
              </span>
            )}
            <button
              type="button"
              onClick={() => signOut()}
              className="flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-sand/70 transition-colors hover:bg-white/10 hover:text-sand"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">logout</span>
              <span className="hidden whitespace-nowrap sm:inline">{t('Sign out')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* phone: floating pill tab bar, same as the storefront */}
      <nav className="on-ink fixed inset-x-3 bottom-3 z-50 flex items-center justify-between rounded-full bg-ink p-1.5 shadow-[0_20px_50px_-20px_rgba(11,12,10,0.6)] sm:hidden" aria-label={t('Main')}>
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-2 transition-colors ${active ? 'bg-lime text-ink' : 'text-sand/70'}`}
            >
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true">{tab.icon}</span>
              <span className="max-w-full truncate px-0.5 text-[11px] font-semibold">{t(tab.label)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
