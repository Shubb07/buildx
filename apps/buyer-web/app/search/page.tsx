'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { searchCatalog, useI18n, useProductsForLocation, useSelectedLocation, tx } from '@sthiva/web-core';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ProductListCard } from '@/components/ProductListCard';
import { MaterialCard } from '@/components/catalog/MaterialCard';

const SUGGESTIONS = [tx('Cement'), tx('TMT bar'), tx('M-sand'), tx('Red bricks'), tx('Plywood'), tx('PVC pipe')];

function SearchResults() {
  const router = useRouter();
  const typed = useSearchParams().get('q')?.trim() ?? '';
  const { t, toEnglish } = useI18n();
  // Kannada or Hindi words for a material (ಸಿಮೆಂಟ್, सरिया) are searched as their English names
  const q = typed ? toEnglish(typed) : '';
  const [input, setInput] = useState(typed);
  const location = useSelectedLocation();
  // Typos and trade words are fixed before asking the API, and matching material guides are shown
  // even when no supplier has listed that material yet
  const catalog = useMemo(() => searchCatalog(q), [q]);
  const products = useProductsForLocation({ q: catalog.query || undefined, limit: 24 });

  useEffect(() => setInput(typed), [typed]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = input.trim();
    router.push(v ? `/search?q=${encodeURIComponent(v)}` : '/search');
  }

  return (
    <main id="main" className="container-x min-h-[70vh] pb-24 pt-[calc(var(--header-h)+40px)]">
      <p className="eyebrow text-stone">{t('Search')}</p>
      <h1 className="mt-3 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[0.95] tracking-tightest">
        {typed ? <>{t('Results for')} <span className="font-serif font-normal italic">&ldquo;{typed}&rdquo;</span></> : t('Find materials')}
      </h1>

      <form onSubmit={submit} role="search" className="mt-8 flex max-w-2xl gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t('Search materials')}</span>
          <span className="material-symbols-outlined pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-stone" aria-hidden="true">search</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            type="search"
            autoFocus={!q}
            placeholder={t('Cement, TMT bars, bricks, tiles...')}
            className="field h-14 rounded-full pl-14 text-[16px]"
          />
        </label>
        <button type="submit" className="btn-ink h-14 px-7">{t('Search')}</button>
      </form>

      {location && (
        <p className="mt-4 flex items-center gap-1.5 text-[14px] text-stone">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">location_on</span>
          {t('Showing products that deliver to {pin}', { pin: location.pincode })}
        </p>
      )}

      {!q && (
        <div className="mt-10">
          <p className="text-[14px] font-medium text-stone">{t('Popular searches')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => router.push(`/search?q=${encodeURIComponent(s)}`)}
                className="rounded-full border border-sand-4 bg-sand-2 px-4 py-2.5 text-[14px] font-medium transition-colors hover:border-ink hover:bg-ink hover:text-sand"
              >
                {t(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      {q && catalog.corrected && (
        <p className="mt-4 text-[14px] text-stone">
          {t('Showing results for')} <span className="font-semibold text-ink">{catalog.query}</span>
        </p>
      )}

      {q && catalog.items.length > 0 && (
        <section className="mt-12" aria-labelledby="materials-title">
          <h2 id="materials-title" className="font-display text-xl font-semibold tracking-tight">{t('Materials')}</h2>
          <p className="mt-1 text-[14px] text-stone">{t('Specs, sizes and how each is sold. Open one to see offers that deliver to you.')}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.items.map((item) => (
              <MaterialCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {q && (
        <div className="mt-12">
          {catalog.items.length > 0 && <h2 className="mb-5 font-display text-xl font-semibold tracking-tight">{t('Supplier listings')}</h2>}
          {products.status === 'loading' && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={t('Searching')}>
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-[420px]" />)}
            </div>
          )}
          {products.status === 'error' && (
            <p role="alert" className="card px-6 py-12 text-center text-[15px] text-error">
              {t('Search is not responding right now. Please try again in a moment.')}
            </p>
          )}
          {products.status === 'success' && products.data.products.length === 0 && (
            <div className="card flex flex-col items-center gap-2 px-6 py-16 text-center">
              <span className="material-symbols-outlined text-4xl text-stone" aria-hidden="true">search_off</span>
              <p className="font-display text-xl font-semibold">
                {catalog.items.length > 0 ? t('No supplier has listed this yet') : t('Nothing matches "{q}"', { q: typed })}
              </p>
              <p className="max-w-sm text-[15px] text-stone">
                {catalog.items.length > 0
                  ? t('The material guides above show the specs and how it is sold.')
                  : location ? t('Try a simpler word, like "cement" or "steel", or a different delivery PIN.') : t('Try a simpler word, like "cement" or "steel".')}
              </p>
            </div>
          )}
          {products.status === 'success' && products.data.products.length > 0 && (
            <>
              <p className="mb-6 text-[14px] text-stone">
                {t('{n} products', { n: products.data.pagination?.total ?? products.data.products.length })}
              </p>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {products.data.products.map((p) => (
                  <ProductListCard key={p._id} product={p} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <>
      <Header />
      <Suspense>
        <SearchResults />
      </Suspense>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
