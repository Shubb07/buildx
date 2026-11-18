'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApiClient } from '@sthiva/web-core';
import { Chip, ChipRow, EmptyState, ErrorNote, PageHead, Pill, rupees, unitLabel } from '../../../../components/ui';
import { isSetupComplete, useSupplierProfile } from '../../../../lib/setup';
import { fetchQuickAdd, saveQuickAdd, type QuickItem, type QuickList } from '../../../../lib/quick-add';

// Quick add, like picking items in a laundry app: one list of Sthiva's standard items for a
// category, each with a price box and a stock counter, saved together. New listings take the
// name, brand, photo and GST rate from the Sthiva catalogue; details can be added later.

// How far one tap on - or + moves the stock: bags and pieces by 10, everything else by 1
const STEP: Record<string, number> = { BAG: 10, PIECE: 10, BOX: 5, SHEET: 5 };

type Draft = { price: string; stock: number };

function Stepper({ value, step, unit, onChange, label }: { value: number; step: number; unit: string; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center rounded-xl border border-sand-4 bg-sand-2" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(0, value - step))} disabled={value <= 0} className="grid h-11 w-11 place-items-center rounded-l-xl hover:bg-sand-3 disabled:opacity-30" aria-label={`${step} fewer`}>
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">remove</span>
      </button>
      <input
        value={value}
        onChange={(e) => onChange(Math.min(10_000_000, Number(e.target.value.replace(/\D/g, '') || 0)))}
        inputMode="numeric"
        className="w-16 bg-transparent text-center font-mono text-[15px] outline-none"
        aria-label={`Stock in ${unitLabel(unit, 2)}`}
      />
      <button type="button" onClick={() => onChange(value + step)} className="grid h-11 w-11 place-items-center rounded-r-xl hover:bg-sand-3" aria-label={`${step} more`}>
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
      </button>
    </div>
  );
}

function Row({ item, draft, onChange }: { item: QuickItem; draft: Draft; onChange: (d: Draft) => void }) {
  const step = STEP[item.unit] ?? 1;
  const one = unitLabel(item.unit, 1);
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-sand-3">
          {item.image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={item.image} alt="" className="h-full w-full object-cover" />
            : <span className="material-symbols-outlined text-stone" aria-hidden="true">inventory_2</span>}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{item.brand ? <span className="text-stone">{item.brand} · </span> : null}{item.name}</p>
          <p className="text-[13px] text-stone">
            Per {one}{item.weightKgPerUnit ? ` · approx ${item.weightKgPerUnit} kg/${one}` : ''}{item.gstRate != null ? ` · GST ${item.gstRate}%` : ''}
          </p>
          {item.mine && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px]">
              <Pill tone={item.mine.status === 'ACTIVE' ? 'live' : 'muted'}>{item.mine.status === 'ACTIVE' ? 'Listed' : item.mine.status === 'OUT_OF_STOCK' ? 'Out of stock' : item.mine.status === 'INACTIVE' ? 'Paused' : 'Draft'}</Pill>
              <span className="text-stone">now {rupees.format(item.mine.price)}{item.mine.onOrder ? ', on order' : `, ${item.mine.stock.toLocaleString('en-IN')} in stock`}</span>
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        <label className="flex items-center rounded-xl border border-sand-4 bg-sand-2 pl-3">
          <span className="text-[14px] text-stone">₹</span>
          <input
            value={draft.price}
            onChange={(e) => onChange({ ...draft, price: e.target.value.replace(/[^\d.]/g, '').slice(0, 10) })}
            inputMode="decimal"
            placeholder="Price"
            className="h-11 w-24 bg-transparent px-2 font-mono text-[15px] outline-none"
            aria-label={`Your price per ${one} for ${item.name}`}
          />
        </label>
        {item.mine?.onOrder
          ? <span className="w-[136px] text-center text-[13px] text-stone">On order</span>
          : <Stepper value={draft.stock} step={step} unit={item.unit} onChange={(stock) => onChange({ ...draft, stock })} label={`Stock of ${item.name}`} />}
      </div>
    </li>
  );
}

const startDraft = (i: QuickItem): Draft => ({ price: i.mine ? String(i.mine.price) : '', stock: i.mine?.stock ?? 0 });
const changed = (i: QuickItem, d: Draft) => {
  const price = Number(d.price);
  if (!(price > 0)) return false;
  return !i.mine || price !== i.mine.price || (!i.mine.onOrder && d.stock !== i.mine.stock) || i.mine.status === 'DISCONTINUED' || i.mine.status === 'DRAFT';
};

function QuickAdd() {
  const client = useApiClient();
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'success'; data: QuickList }>({ status: 'loading' });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [inclusive, setInclusive] = useState(true);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback((slug?: string) => {
    setState({ status: 'loading' });
    fetchQuickAdd(client, slug)
      .then((data) => {
        setState({ status: 'success', data });
        setDrafts(Object.fromEntries(data.items.map((i) => [i._id, startDraft(i)])));
      })
      .catch(() => setState({ status: 'error' }));
  }, [client]);

  useEffect(() => { load(category); }, [load, category]);

  const items = state.status === 'success' ? state.data.items : [];
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => words.every((w) => `${i.brand ?? ''} ${i.name}`.toLowerCase().includes(w)));
  }, [items, q]);
  const ready = items.filter((i) => drafts[i._id] && changed(i, drafts[i._id]));

  async function saveAll() {
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const r = await saveQuickAdd(client, {
        isGstInclusive: inclusive,
        items: ready.map((i) => ({ catalogItemId: i._id, price: Number(drafts[i._id].price), stock: drafts[i._id].stock })),
      });
      setSaved([r.created && `${r.created} new listing${r.created === 1 ? '' : 's'}`, r.updated && `${r.updated} updated`].filter(Boolean).join(', ') + '.');
      load(state.status === 'success' ? state.data.category ?? undefined : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHead eyebrow="Catalogue" title="Quick add">
        <p className="max-w-sm text-[15px] text-stone">Type your price and stock for everything you sell in one list, then save once. Add photos and details later.</p>
      </PageHead>

      {state.status === 'success' && (
        <>
          <ChipRow label="Category">
            {state.data.categories.map((c) => (
              <Chip key={c.slug} active={state.data.category === c.slug} onClick={() => setCategory(c.slug)}>
                {c.name} <span className="ml-1 text-[12px] opacity-60">{c.items}</span>
              </Chip>
            ))}
          </ChipRow>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand or item" className="field sm:max-w-xs" aria-label="Search items" />
            <label className="flex cursor-pointer items-center gap-2 text-[15px]">
              <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} className="h-5 w-5 accent-ink" />
              My prices include GST
            </label>
          </div>
        </>
      )}

      {saved && <p role="status" className="rounded-xl bg-[#E3F4E8] px-4 py-3 text-[15px] text-tertiary">Saved: {saved} <Link href="/products" className="font-medium underline">See your products</Link></p>}
      {state.status === 'loading' && <div className="skeleton h-72" role="status" aria-label="Loading items" />}
      {state.status === 'error' && <ErrorNote>Couldn&apos;t load the items. Check your connection and try again.</ErrorNote>}
      {state.status === 'success' && shown.length === 0 && (
        <EmptyState icon="search_off" title="No items here" body={q ? 'Nothing matches your search in this category.' : 'This category has no Sthiva items yet. Use the full form to list a new item.'} cta={{ href: '/products/new', label: 'List a new item' }} />
      )}
      {state.status === 'success' && shown.length > 0 && (
        <ul className="card divide-y divide-sand-4 px-4 sm:px-6">
          {shown.map((i) => (
            <Row key={i._id} item={i} draft={drafts[i._id] ?? startDraft(i)} onChange={(d) => setDrafts((all) => ({ ...all, [i._id]: d }))} />
          ))}
        </ul>
      )}
      <p className="text-[14px] text-stone">
        Can&apos;t find an item? <Link href="/products/new" className="font-medium text-cobalt hover:underline">List it with the full form</Link>.
      </p>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-4 bg-sand/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <p className="flex-1 text-[15px]">
            {ready.length ? <><span className="font-semibold">{ready.length}</span> item{ready.length === 1 ? '' : 's'} ready to save</> : <span className="text-stone">Type a price to add an item</span>}
          </p>
          {error && <p className="w-full text-[14px] text-error sm:w-auto">{error}</p>}
          <button type="button" disabled={!ready.length || saving} onClick={saveAll} className="btn-ink px-7">
            {saving ? 'Saving' : `Save all${ready.length ? ` (${ready.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function QuickAddPage() {
  const profile = useSupplierProfile();
  if (profile.status === 'loading') return <div className="skeleton h-64" role="status" aria-label="Loading" />;
  if (profile.status === 'error') return <ErrorNote>Couldn&apos;t load your profile. Check your connection and refresh.</ErrorNote>;
  if (!isSetupComplete(profile.profile)) {
    return (
      <div className="card flex flex-col items-start gap-4 p-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Finish your business setup first</h1>
        <p className="max-w-xl text-[15px] text-stone">Tell us your business type, the PIN codes you deliver to and what you sell. Then you can add products here in one go.</p>
        <Link href="/setup" className="btn-ink px-6">Go to setup</Link>
      </div>
    );
  }
  return <QuickAdd />;
}
