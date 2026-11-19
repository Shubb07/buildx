'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchProducts, useApiClient, useSelectedLocation, type ProductSummary } from '@sthiva/web-core';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { useCategories } from '@/lib/categories';
import { addToCart, useCart } from '@/lib/cart';
import { rupees } from '@/lib/format';

// Order by list: a carpenter, mason or contractor enters a whole job's material in one go, like
// picking items in a laundry app. Pick a category, set a quantity on each item with - and +, switch
// categories without losing anything, then add everything to the cart at once. Prices are the
// best price from verified sellers near the buyer's PIN (same as the product pages).

const UNIT_LABEL: Record<string, [string, string]> = {
  KG: ['kg', 'kg'], TON: ['tonne', 'tonnes'], PIECE: ['piece', 'pieces'], BAG: ['bag', 'bags'], BUNDLE: ['bundle', 'bundles'],
  CUBIC_METER: ['m³', 'm³'], SQUARE_METER: ['m²', 'm²'], LITER: ['litre', 'litres'], METER: ['metre', 'metres'], BOX: ['box', 'boxes'], SHEET: ['sheet', 'sheets'],
};
const unitWord = (u: string, n: number) => (UNIT_LABEL[u] ?? [u.toLowerCase(), u.toLowerCase()])[n === 1 ? 0 : 1];

type Row = ProductSummary & {
  images?: { url: string; isPrimary?: boolean }[];
  minOrderQuantity?: number;
  stockQuantity?: number;
  bulkPricing?: { minQty: number; price: number }[];
  supplierId?: { _id?: string; businessName?: string } | string;
};
type Picked = { row: Row; qty: number };

function priceFor(row: Row, qty: number) {
  const tier = (row.bulkPricing ?? []).filter((t) => qty >= t.minQty).sort((a, b) => b.minQty - a.minQty)[0];
  return tier ? tier.price : row.basePrice;
}

function Counter({ row, qty, onChange }: { row: Row; qty: number; onChange: (n: number) => void }) {
  const min = Math.max(1, row.minOrderQuantity ?? 1);
  const max = row.stockQuantity && row.stockQuantity > 0 ? row.stockQuantity : 1_000_000;
  const set = (n: number) => onChange(n <= 0 ? 0 : Math.min(max, Math.max(min, n)));
  return (
    <div className="flex items-center rounded-xl border border-sand-4 bg-sand-2" role="group" aria-label={`Quantity of ${row.name}`}>
      <button type="button" onClick={() => set(qty - 1 < min ? 0 : qty - 1)} disabled={qty <= 0} className="grid h-11 w-11 place-items-center rounded-l-xl hover:bg-sand-3 disabled:opacity-30" aria-label="One less">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">remove</span>
      </button>
      <input
        value={qty || ''}
        placeholder="0"
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, '') || 0))}
        inputMode="numeric"
        className="w-14 bg-transparent text-center font-mono text-[15px] outline-none"
        aria-label={`Quantity in ${unitWord(row.unit, 2)}`}
      />
      <button type="button" onClick={() => set(qty === 0 ? min : qty + 1)} className="grid h-11 w-11 place-items-center rounded-r-xl hover:bg-sand-3" aria-label="One more">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
      </button>
    </div>
  );
}

export default function OrderByListPage() {
  const client = useApiClient();
  const location = useSelectedLocation();
  const cats = useCategories();
  const categories = cats.status === 'success' ? cats.data : [];
  const [category, setCategory] = useState<string | null>(null);
  const [rows, setRows] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; items: Row[] }>({ status: 'loading' });
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const [q, setQ] = useState('');
  const [added, setAdded] = useState<number | null>(null);
  const cart = useCart();

  const active = category ?? categories[0]?.slug ?? null;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setRows({ status: 'loading' });
    // Up to 150 items in a category, cheapest seller per item, near the PIN when one is set
    (async () => {
      const all: Row[] = [];
      for (let page = 1; page <= 3; page++) {
        const list = await fetchProducts(client, { category: active, limit: 50, page, sort: 'price_asc', pincode: location?.pincode ?? null }, controller.signal);
        all.push(...(list.products as Row[]));
        if (page >= list.pagination.pages) break;
      }
      return all.sort((a, b) => a.name.localeCompare(b.name));
    })()
      .then((items) => setRows({ status: 'ready', items }))
      .catch(() => { if (!controller.signal.aborted) setRows({ status: 'error' }); });
    return () => controller.abort();
  }, [client, active, location?.pincode]);

  const shown = useMemo(() => {
    if (rows.status !== 'ready') return [];
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.items.filter((r) => words.every((w) => r.name.toLowerCase().includes(w)));
  }, [rows, q]);

  const list = Object.values(picked).filter((p) => p.qty > 0);
  const total = list.reduce((sum, p) => sum + priceFor(p.row, p.qty) * p.qty, 0);

  function setQty(row: Row, qty: number) {
    setAdded(null);
    setPicked((all) => ({ ...all, [row._id]: { row, qty } }));
  }

  function addAll() {
    for (const { row, qty } of list) {
      const supplier = typeof row.supplierId === 'object' ? row.supplierId : undefined;
      addToCart(supplier?._id ?? String(row.supplierId ?? 'unknown'), supplier?.businessName ?? 'Supplier', {
        productId: row._id,
        name: row.name,
        imageUrl: row.images?.find((i) => i.isPrimary)?.url ?? row.images?.[0]?.url,
        unit: row.unit,
        basePrice: priceFor(row, qty),
        quantity: qty,
        minOrderQuantity: Math.max(1, row.minOrderQuantity ?? 1),
      });
    }
    setAdded(list.length);
    setPicked({});
  }

  return (
    <>
      <Header />
      <main id="main" className="pb-40 pt-[var(--header-h)]">
        <section className="border-b border-ink/10 bg-sand-2">
          <div className="container-x py-5 md:py-7">
            <nav aria-label="Breadcrumb" className="text-[13px] text-stone">
              <Link href="/" className="hover:text-ink">Home</Link> <span aria-hidden="true">›</span> <span className="text-ink">Order by list</span>
            </nav>
            <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-[-0.02em] md:text-[40px]">Order by list</h1>
            <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-stone">
              Your whole job in one go: set how many of each item you need, across any categories, then add everything to the cart.
              {location?.pincode ? ` Prices for PIN ${location.pincode}.` : ' Set your site PIN at the top for prices that deliver there.'}
            </p>
          </div>
        </section>

        <div className="container-x flex flex-col gap-4 py-5">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Category">
            {categories.map((c) => (
              <button key={c.slug} type="button" role="tab" aria-selected={active === c.slug} onClick={() => { setCategory(c.slug); setQ(''); }}
                className={`h-10 shrink-0 rounded-full border px-4 text-[14px] font-medium ${active === c.slug ? 'border-ink bg-ink text-sand' : 'border-sand-4 bg-sand-2 hover:border-ink'}`}>
                {c.name}
                {list.some((p) => (p.row as { categoryId?: { slug?: string } }).categoryId?.slug === c.slug) && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-lime align-middle" aria-label="has items" />}
              </button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in this category, e.g. 18 mm" className="field md:max-w-sm" aria-label="Search items" />

          {added !== null && (
            <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl bg-[#E3F4E8] px-4 py-3 text-[15px] text-tertiary">
              {added} item{added === 1 ? '' : 's'} added to your cart.
              <Link href="/cart" className="font-semibold underline">Go to cart ({cart?.items.length ?? 0})</Link>
            </p>
          )}

          {rows.status === 'loading' && <div className="skeleton h-72" role="status" aria-label="Loading items" />}
          {rows.status === 'error' && <p role="alert" className="text-[15px] text-error">Couldn&apos;t load items. Check your connection and try again.</p>}
          {rows.status === 'ready' && shown.length === 0 && (
            <p className="rounded-xl bg-sand-3 px-4 py-6 text-center text-[15px] text-stone">
              {q ? 'Nothing matches your search here.' : location?.pincode ? `Nothing in this category delivers to ${location.pincode} yet.` : 'Nothing listed in this category yet.'}
            </p>
          )}
          {rows.status === 'ready' && shown.length > 0 && (
            <ul className="card divide-y divide-sand-4 px-4 sm:px-6">
              {shown.map((row) => {
                const qty = picked[row._id]?.qty ?? 0;
                const tiers = [...(row.bulkPricing ?? [])].sort((a, b) => a.minQty - b.minQty);
                const image = row.images?.find((i) => i.isPrimary)?.url ?? row.images?.[0]?.url;
                const outOfStock = row.stockQuantity !== undefined && row.stockQuantity <= 0;
                return (
                  <li key={row._id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-sand-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <span className="material-symbols-outlined text-stone" aria-hidden="true">inventory_2</span>}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/product/${row._id}`} className="block truncate text-[15px] font-semibold hover:underline">{row.name}</Link>
                        <p className="text-[13px] text-stone">
                          <span className="font-semibold text-ink tabular-nums">{rupees.format(priceFor(row, Math.max(qty, 1)))}</span> per {unitWord(row.unit, 1)}
                          {tiers.length > 0 && ` · ${tiers[tiers.length - 1].minQty}+ at ${rupees.format(tiers[tiers.length - 1].price)}`}
                          {(row.minOrderQuantity ?? 1) > 1 && ` · min ${row.minOrderQuantity}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      {qty > 0 && <span className="text-[14px] tabular-nums text-stone">{rupees.format(priceFor(row, qty) * qty)}</span>}
                      {outOfStock ? <span className="text-[13px] text-error">Out of stock</span> : <Counter row={row} qty={qty} onChange={(n) => setQty(row, n)} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="fixed inset-x-0 bottom-[84px] z-30 border-t border-sand-4 bg-sand/95 backdrop-blur md:bottom-0">
          <div className="container-x flex flex-wrap items-center gap-3 py-3">
            <p className="flex-1 text-[15px]">
              {list.length
                ? <><span className="font-semibold">{list.length}</span> item{list.length === 1 ? '' : 's'} · about <span className="font-semibold tabular-nums">{rupees.format(total)}</span> <span className="text-stone">before delivery</span></>
                : <span className="text-stone">Tap + to add items from any category</span>}
            </p>
            <button type="button" disabled={!list.length} onClick={addAll} className="btn-lime px-7">
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_shopping_cart</span>
              Add all to cart
            </button>
          </div>
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
