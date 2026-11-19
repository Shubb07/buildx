'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { useApiClient, useT, tx } from '@sthiva/web-core';
import { EmptyState, ErrorNote, PageHead, Pill, rupees, unitLabel } from '../../../components/ui';

// Bulk quote requests from buyers near you (API features/quotes). Price every item, give a delivery
// date on or before the buyer's date, and send. You can change your reply until the buyer chooses.
// If they accept yours, it becomes a confirmed order at your prices; the buyer's contact appears then.

const lineSchema = z.object({
  name: z.string(), unit: z.string(), quantity: z.number(), gstRate: z.number(),
  yourListing: z.object({ price: z.number(), isGstInclusive: z.boolean(), stock: z.number().nullable() }).nullable(),
});
const requestSchema = z.object({
  _id: z.string(), number: z.string(), status: z.string(), repliesOpen: z.boolean(), expiresAt: z.string(),
  kind: z.enum(['LIST', 'CUSTOM']).optional(),
  custom: z.object({ workName: z.string(), spec: z.string(), siteVisit: z.boolean() }).passthrough().optional(),
  neededBy: z.string(), notes: z.string().optional(),
  area: z.object({ pincode: z.string(), district: z.string().optional() }),
  lines: z.array(lineSchema),
  yourQuote: z.object({
    prices: z.array(z.number()), isGstInclusive: z.boolean(), deliveryCharge: z.number(), deliveryDate: z.string(), note: z.string().optional(), status: z.string(),
  }).nullable(),
  orderId: z.string().optional(),
});
type Req = z.infer<typeof requestSchema>;

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const IST_MS = 330 * 60 * 1000;
const today = () => new Date(Date.now() + IST_MS).toISOString().slice(0, 10);

function errText(err: unknown) {
  return err instanceof Error ? err.message : tx('Could not save. Try again.');
}

function RequestCard({ r, onChanged }: { r: Req; onChanged: () => void }) {
  const t = useT();
  const client = useApiClient();
  const mine = r.yourQuote;
  const [editing, setEditing] = useState(false);
  const [prices, setPrices] = useState<string[]>(r.lines.map((l, i) => String(mine?.prices[i] ?? l.yourListing?.price ?? '')));
  const [inclusive, setInclusive] = useState(mine?.isGstInclusive ?? true);
  const [charge, setCharge] = useState(String(mine?.deliveryCharge ?? 0));
  const [date, setDate] = useState(mine?.deliveryDate ?? r.neededBy);
  const [note, setNote] = useState(mine?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nums = prices.map(Number);
  const valid = nums.every((n) => n > 0) && Number(charge) >= 0 && date >= today() && date <= r.neededBy;
  const yourTotal = r.lines.reduce((s, l, i) => s + (nums[i] || 0) * l.quantity, 0) + (Number(charge) || 0);
  const canReply = r.status === 'OPEN' && r.repliesOpen;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await client.request(`/suppliers/me/quotes/${r._id}`, {
        method: 'POST', auth: true, envelope: true, schema: z.unknown(),
        body: { prices: nums, isGstInclusive: inclusive, deliveryCharge: Number(charge) || 0, deliveryDate: date, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      setEditing(false);
      onChanged();
    } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  }
  async function withdraw() {
    setBusy(true);
    setError(null);
    try { await client.request(`/suppliers/me/quotes/${r._id}/withdraw`, { method: 'POST', auth: true, envelope: true, schema: z.unknown() }); onChanged(); }
    catch (err) { setError(errText(err)); } finally { setBusy(false); }
  }

  const tag = mine?.status === 'ACCEPTED' ? <Pill tone="done">{t('You won this order')}</Pill>
    : mine?.status === 'NOT_CHOSEN' ? <Pill tone="muted">{t('Buyer chose another reply')}</Pill>
    : r.status !== 'OPEN' ? <Pill tone="muted">{t('Closed')}</Pill>
    : mine?.status === 'ACTIVE' ? <Pill tone="live">{t('Reply sent')}</Pill>
    : canReply ? <Pill tone="wait">Waiting for your price</Pill> : <Pill tone="muted">{t('Replies closed')}</Pill>;

  return (
    <li className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {tag}
        <span className="font-mono text-[13px] text-stone">{r.number}</span>
        <span className="ml-auto text-[13px] text-stone">
          PIN {r.area.pincode}{r.area.district ? `, ${r.area.district}` : ''} · needed by {day(r.neededBy)}
        </span>
      </div>
      {canReply && <p className="text-[13px] text-stone">Replies close {new Date(r.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}.</p>}
      {r.kind === 'CUSTOM' && r.custom && (
        <div className="rounded-xl bg-[#E7F1FB] px-3 py-2 text-[14px]">
          <p className="font-semibold">Made to measure: {r.custom.workName}</p>
          <p>Material: {r.custom.spec}</p>
          {r.custom.siteVisit && <p className="font-medium">{t('The buyer wants a site visit to measure. Say when you can come in your note.')}</p>}
          <p className="text-stone">Quote a price per piece, including fitting if you fit it.</p>
        </div>
      )}
      {r.notes && <p className="rounded-xl bg-sand-2 px-3 py-2 text-[14px]">Buyer&apos;s note: {r.notes}</p>}

      <ul className="divide-y divide-sand-4">
        {r.lines.map((l, i) => (
          <li key={i} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{l.name}</p>
              <p className="text-[13px] text-stone">
                {l.quantity.toLocaleString('en-IN')} {unitLabel(l.unit, l.quantity)} · GST {l.gstRate}%
                {r.kind === 'CUSTOM' ? '' : l.yourListing ? ` · you list it at ${rupees.format(l.yourListing.price)}${l.yourListing.stock !== null ? `, ${l.yourListing.stock} in stock` : t(', on order')}` : t(' · not in your listings (you can still quote)')}
              </p>
            </div>
            {(editing || (!mine && canReply)) ? (
              <label className="flex items-center rounded-xl border border-sand-4 bg-sand-2 pl-3">
                <span className="text-[14px] text-stone">₹</span>
                <input value={prices[i]} onChange={(e) => setPrices((p) => p.map((v, k) => (k === i ? e.target.value.replace(/[^\d.]/g, '').slice(0, 10) : v)))} inputMode="decimal" className="h-11 w-28 bg-transparent px-2 font-mono outline-none" aria-label={`Your price per ${unitLabel(l.unit, 1)} for ${l.name}`} />
                <span className="pr-3 text-[13px] text-stone">/{unitLabel(l.unit, 1)}</span>
              </label>
            ) : mine ? <span className="font-mono text-[15px]">{rupees.format(mine.prices[i])}/{unitLabel(l.unit, 1)}</span> : null}
          </li>
        ))}
      </ul>

      {(editing || (!mine && canReply)) && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">Delivery charge (₹, 0 = free)
            <input value={charge} onChange={(e) => setCharge(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className="field h-11 font-mono" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">You deliver on
            <input type="date" value={date} min={today()} max={r.neededBy} onChange={(e) => setDate(e.target.value)} className="field h-11" />
          </label>
          <label className="flex items-center gap-2 pt-5 text-[14px]">
            <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} className="h-5 w-5 accent-ink" />
            My prices include GST
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder={t('Note to the buyer (optional), e.g. brand, delivery in two lots')} className="field sm:col-span-3" />
          <p className="text-[14px] sm:col-span-2">Your total: <span className="font-semibold tabular-nums">{rupees.format(yourTotal)}</span> <span className="text-stone">(buyers see it with Sthiva&apos;s commission{inclusive ? '' : ' and GST'} added)</span></p>
          <div className="flex justify-end gap-2">
            {editing && <button type="button" onClick={() => setEditing(false)} className="btn-ghost">{t('Cancel')}</button>}
            <button type="button" disabled={!valid || busy} onClick={send} className="btn-ink px-6">{busy ? t('Sending') : mine ? t('Update reply') : t('Send quote')}</button>
          </div>
        </div>
      )}

      {mine && !editing && (
        <div className="flex flex-wrap items-center gap-3 text-[14px]">
          <span className="text-stone">Delivery {mine.deliveryCharge > 0 ? rupees.format(mine.deliveryCharge) : 'free'} · on {day(mine.deliveryDate)}{mine.note ? ` · “${mine.note}”` : ''}</span>
          {canReply && mine.status === 'ACTIVE' && (
            <>
              <button type="button" onClick={() => setEditing(true)} className="font-medium text-cobalt hover:underline">{t('Change')}</button>
              <button type="button" disabled={busy} onClick={withdraw} className="font-medium text-stone hover:underline">{t('Withdraw')}</button>
            </>
          )}
          {canReply && mine.status === 'WITHDRAWN' && <button type="button" onClick={() => setEditing(true)} className="font-medium text-cobalt hover:underline">{t('Quote again')}</button>}
          {r.orderId && <Link href="/orders" className="font-medium text-cobalt hover:underline">{t('Go to the order')}</Link>}
        </div>
      )}
      {error && <ErrorNote>{t(error)}</ErrorNote>}
    </li>
  );
}

export default function QuotesPage() {
  const t = useT();
  const client = useApiClient();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ok'; rows: Req[] }>({ status: 'loading' });
  const load = useCallback(() => {
    client.request('/suppliers/me/quotes', { auth: true, envelope: true, schema: z.array(requestSchema) })
      .then((rows) => setState({ status: 'ok', rows }))
      .catch(() => setState({ status: 'error' }));
  }, [client]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHead eyebrow="Bulk jobs" title="Quote requests">
        <p className="max-w-sm text-[15px] text-stone">Buyers near you ask for one price for a big list. Reply with your best price and a date; if they accept, it is a confirmed order.</p>
      </PageHead>
      {state.status === 'loading' && <div className="skeleton h-48" role="status" aria-label={t('Loading')} />}
      {state.status === 'error' && <ErrorNote>{t("Couldn't load quote requests. Check your connection and try again.")}</ErrorNote>}
      {state.status === 'ok' && state.rows.length === 0 && (
        <EmptyState icon="request_quote" title="No requests yet" body="When a buyer near you asks for a bulk quote on items you sell, it shows here and you get an alert." />
      )}
      {state.status === 'ok' && state.rows.length > 0 && (
        <ul className="flex flex-col gap-4">{state.rows.map((r) => <RequestCard key={`${r._id}-${r.yourQuote?.status ?? 'none'}`} r={r} onChanged={load} />)}</ul>
      )}
    </div>
  );
}
