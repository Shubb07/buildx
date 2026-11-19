'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CATALOG_CATEGORIES, catalogItems, useApiClient, useSelectedLocation, useT } from '@sthiva/web-core';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { useAuth } from '@/components/auth/AuthProvider';
import { ErrorNote, PageHead } from '@/components/account/AccountUI';
import { createCustomQuoteRequest } from '@/lib/quotes';

// Made to measure (market study step 6): glass, windows, doors, kitchens and other work cut to your
// site's sizes, which online stores can't sell. Pick the work, add each piece with its size, describe
// the material, and verified local makers reply with a price and a date (a site visit if you want).

const IST_MS = 330 * 60 * 1000;
const dayPlus = (n: number) => new Date(Date.now() + IST_MS + n * 86_400_000).toISOString().slice(0, 10);

// Every made-to-order item in the shared catalogue is a kind of work
const WORK = CATALOG_CATEGORIES.flatMap((c) => catalogItems(c.slug).filter((i) => i.madeToOrder).map((i) => ({ type: i.id, name: i.name, categorySlug: c.slug })));

// Material examples stay in English: they are trade specifications, as sellers write them
const SPEC_HINTS: Record<string, string> = {
  glass: 'e.g. 10 mm toughened, clear, polished edges',
  'fluted-glass': 'e.g. 8 mm toughened fluted glass, reeded pattern',
  'upvc-windows': 'e.g. white uPVC sliding window, 5 mm glass, with mosquito mesh',
  'aluminium-windows': 'e.g. 3-track aluminium sliding, bronze finish, 5 mm glass',
  'main-doors': 'e.g. teak wood main door with frame, polished',
  'shower-partitions': 'e.g. 10 mm toughened glass, fixed panel with door, chrome fittings',
  'modular-kitchen': 'e.g. L-shape, BWP ply carcass, laminate shutters, soft-close',
  wardrobes: 'e.g. 3-door sliding, BWP ply, laminate finish, loft on top',
  'mosquito-mesh': 'e.g. pleated mesh for sliding windows, white frame',
};

type Unit = 'mm' | 'ft' | 'in';
const TO_MM: Record<Unit, number> = { mm: 1, ft: 304.8, in: 25.4 };
type Piece = { label: string; width: string; height: string; quantity: number };

function Form() {
  const client = useApiClient();
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const location = useSelectedLocation();
  const [type, setType] = useState(WORK.find((w) => w.type === params.get('type'))?.type ?? '');
  const [unit, setUnit] = useState<Unit>('ft');
  const [pieces, setPieces] = useState<Piece[]>([{ label: '', width: '', height: '', quantity: 1 }]);
  const [spec, setSpec] = useState('');
  const [siteVisit, setSiteVisit] = useState(true);
  const [fullAddress, setFullAddress] = useState('');
  const [pincode, setPincode] = useState(location?.pincode ?? '');
  const [phone, setPhone] = useState(user?.phone?.replace(/\D/g, '').slice(-10) ?? '');
  const [neededBy, setNeededBy] = useState(dayPlus(14));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const work = WORK.find((w) => w.type === type);

  const mm = (v: string) => Math.round(Number(v) * TO_MM[unit]);
  const piecesOk = pieces.every((p) => p.label.trim() && mm(p.width) >= 50 && mm(p.height) >= 50 && p.quantity >= 1);
  const ready = !!work && piecesOk && spec.trim().length >= 3 && fullAddress.trim().length >= 5 && /^[1-9]\d{5}$/.test(pincode) && /^[6-9]\d{9}$/.test(phone);
  const set = (i: number, patch: Partial<Piece>) => setPieces((all) => all.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const groups = useMemo(() => CATALOG_CATEGORIES.map((c) => ({ name: c.name, items: WORK.filter((w) => w.categorySlug === c.slug) })).filter((g) => g.items.length), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !work) return;
    setBusy(true);
    setError(null);
    try {
      const r = await createCustomQuoteRequest(client, {
        work,
        pieces: pieces.map((p) => ({ label: p.label.trim(), widthMm: mm(p.width), heightMm: mm(p.height), quantity: p.quantity })),
        spec: spec.trim(),
        siteVisit,
        deliveryAddress: { label: 'Site', fullAddress: fullAddress.trim(), pincode, contactPhone: phone },
        neededBy,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      router.push(`/quotes/${r._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not send. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section className="card flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">1. {t('What do you need made?')}</h2>
        {groups.map((g) => (
          <div key={g.name}>
            <p className="text-[13px] font-medium text-stone">{t(g.name)}</p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t(g.name)}>
              {g.items.map((w) => (
                <button key={w.type} type="button" role="radio" aria-checked={type === w.type} onClick={() => setType(w.type)}
                  className={`rounded-full px-4 py-2 text-[14px] font-medium ${type === w.type ? 'bg-ink text-sand' : 'border border-sand-4 bg-sand-2 hover:border-ink'}`}>
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">2. {t('Pieces and sizes')}</h2>
          <div className="flex gap-1 rounded-full bg-sand-3 p-1" role="radiogroup" aria-label={t('Measuring in')}>
            {(['ft', 'in', 'mm'] as const).map((u) => (
              <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} className={`rounded-full px-3 py-1 text-[13px] font-medium ${unit === u ? 'bg-ink text-sand' : ''}`}>{u === 'ft' ? t('feet') : u === 'in' ? t('inches') : 'mm'}</button>
            ))}
          </div>
        </div>
        <ul className="flex flex-col gap-3">
          {pieces.map((p, i) => (
            <li key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-sand-4 p-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto] sm:items-end">
              <label className="col-span-2 flex flex-col gap-1 text-[13px] text-stone sm:col-span-1">{t('Piece')}
                <input value={p.label} onChange={(e) => set(i, { label: e.target.value.slice(0, 60) })} placeholder={t('e.g. Bedroom window')} className="field h-11" />
              </label>
              <label className="flex flex-col gap-1 text-[13px] text-stone">{t('Width ({unit})', { unit })}
                <input value={p.width} onChange={(e) => set(i, { width: e.target.value.replace(/[^\d.]/g, '').slice(0, 8) })} inputMode="decimal" className="field h-11 font-mono" />
              </label>
              <label className="flex flex-col gap-1 text-[13px] text-stone">{t('Height ({unit})', { unit })}
                <input value={p.height} onChange={(e) => set(i, { height: e.target.value.replace(/[^\d.]/g, '').slice(0, 8) })} inputMode="decimal" className="field h-11 font-mono" />
              </label>
              <label className="flex flex-col gap-1 text-[13px] text-stone">{t('How many')}
                <input value={p.quantity} onChange={(e) => set(i, { quantity: Math.max(1, Math.min(500, Number(e.target.value.replace(/\D/g, '')) || 1)) })} inputMode="numeric" className="field h-11 w-20 font-mono" />
              </label>
              <button type="button" disabled={pieces.length === 1} onClick={() => setPieces((all) => all.filter((_, k) => k !== i))} className="grid h-11 w-11 place-items-center rounded-full text-stone hover:bg-sand-3 disabled:opacity-30" aria-label={`Remove ${p.label || 'piece'}`}>
                <span className="material-symbols-outlined text-[20px]">delete</span>
              </button>
            </li>
          ))}
        </ul>
        {pieces.length < 30 && <button type="button" onClick={() => setPieces((all) => [...all, { label: '', width: '', height: '', quantity: 1 }])} className="btn-ghost self-start">{t('Add a piece')}</button>}
        <p className="text-[13px] text-stone">{t('Rough sizes are fine. The maker confirms exact measurements, on a site visit if you ask for one.')}</p>
      </section>

      <section className="card flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">3. {t('Material and finish')}</h2>
        <textarea value={spec} onChange={(e) => setSpec(e.target.value.slice(0, 500))} rows={2} className="field resize-none" placeholder={SPEC_HINTS[type] ?? t('Describe the material, thickness, colour and finish')} />
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={siteVisit} onChange={(e) => setSiteVisit(e.target.checked)} className="mt-1 h-5 w-5 accent-ink" />
          <span><span className="block font-semibold">{t('I want a site visit to measure')}</span><span className="block text-[14px] text-stone">{t('Makers say when they can come, in their reply.')}</span></span>
        </label>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <h2 className="font-display text-lg font-semibold sm:col-span-2">4. {t('Site and date')}</h2>
        <label className="flex flex-col gap-2 sm:col-span-2"><span className="text-[14px] font-medium text-stone">{t('Site address')}</span>
          <textarea value={fullAddress} onChange={(e) => setFullAddress(e.target.value.slice(0, 500))} rows={2} className="field resize-none" />
        </label>
        <label className="flex flex-col gap-2"><span className="text-[14px] font-medium text-stone">{t('Site PIN code')}</span>
          <input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="field font-mono" />
        </label>
        <label className="flex flex-col gap-2"><span className="text-[14px] font-medium text-stone">{t('Phone')}</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(-10))} inputMode="tel" className="field font-mono" />
        </label>
        <label className="flex flex-col gap-2"><span className="text-[14px] font-medium text-stone">{t('Fitted by')}</span>
          <input type="date" value={neededBy} min={dayPlus(1)} max={dayPlus(60)} onChange={(e) => setNeededBy(e.target.value)} className="field" />
        </label>
        <label className="flex flex-col gap-2"><span className="text-[14px] font-medium text-stone">{t('Anything else? (optional)')}</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} className="field" placeholder={t('e.g. second floor, no lift')} />
        </label>
        <p className="text-[13px] text-stone sm:col-span-2">{t('Makers see your PIN and area, not your phone or full address, until you accept their quote.')}</p>
      </section>

      {error && <ErrorNote>{error}</ErrorNote>}
      <button type="submit" disabled={!ready || busy} className="btn-lime self-start px-8 py-4 text-[16px]">{busy ? t('Sending') : t('Ask local makers for a price')}</button>
    </form>
  );
}

export default function MadeToMeasurePage() {
  const t = useT();
  return (
    <>
      <Header />
      <main id="main" className="container-x min-h-[70vh] max-w-3xl pb-32 pt-[calc(var(--header-h)+40px)]">
        <PageHead eyebrow="Made to measure" title="Made for" accent="your site" />
        <p className="mt-3 max-w-2xl text-[15px] text-stone">
          {t('Glass, windows, doors, kitchens and wardrobes cut to your sizes by verified local makers. Add your pieces, and they reply within 48 hours with a price and a date. Accept one and it becomes a confirmed order, paid on delivery.')} <Link href="/quotes" className="font-medium text-cobalt hover:underline">Your requests</Link>
        </p>
        <div className="mt-8"><RequireAuth><Suspense fallback={null}><Form /></Suspense></RequireAuth></div>
      </main>
      <BottomNav />
    </>
  );
}
