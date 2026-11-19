'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApiClient } from '@sthiva/web-core';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ErrorNote, PageHead } from '@/components/account/AccountUI';
import { clearCart } from '@/lib/cart';
import { rupees } from '@/lib/format';
import { acceptQuoteReply, cancelQuoteRequest, fetchQuoteRequest, type QuoteReply, type QuoteRequestView } from '@/lib/quotes';

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function Reply({ r, best, canAccept, onAccept, busy }: { r: QuoteReply; best: boolean; canAccept: boolean; onAccept: () => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`card flex flex-col gap-3 p-5 ${best ? 'ring-2 ring-lime' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{r.seller.name} {best && <span className="ml-1 rounded-full bg-lime px-2 py-0.5 text-[12px]">Lowest total</span>}</p>
          <p className="text-[13px] text-stone">
            Verified seller{r.seller.reviews > 0 ? ` · ★ ${r.seller.rating.toFixed(1)} (${r.seller.reviews})` : ''}{r.seller.distanceKm !== null ? ` · about ${r.seller.distanceKm} km away` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-bold tabular-nums">{rupees.format(r.total)}</p>
          <p className="text-[13px] text-stone">incl. GST{r.deliveryCharge > 0 ? ` and ${rupees.format(r.deliveryCharge)} delivery` : ', free delivery'}</p>
        </div>
      </div>
      <p className="text-[14px]">Delivers on <span className="font-semibold">{day(r.deliveryDate)}</span>{r.note ? <span className="text-stone"> · “{r.note}”</span> : null}</p>
      <button type="button" onClick={() => setOpen((v) => !v)} className="self-start text-[14px] font-medium text-cobalt hover:underline">{open ? 'Hide' : 'Show'} prices per item</button>
      {open && (
        <ul className="divide-y divide-sand-4 rounded-xl border border-sand-4 text-[14px]">
          {r.lines.map((l) => (
            <li key={l.name} className="flex justify-between gap-3 px-3 py-2">
              <span>{l.name} <span className="text-stone">× {l.quantity} {l.unit.toLowerCase()}</span></span>
              <span className="tabular-nums">{rupees.format(l.unitPrice)} each · {rupees.format(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
      )}
      {canAccept && r.status === 'ACTIVE' && (
        <button type="button" disabled={busy} onClick={onAccept} className="btn-ink self-start px-6">Accept this quote</button>
      )}
      {r.status === 'ACCEPTED' && <p className="text-[14px] font-semibold text-tertiary">Accepted</p>}
    </li>
  );
}

function View({ id }: { id: string }) {
  const client = useApiClient();
  const router = useRouter();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ok'; data: QuoteRequestView }>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<QuoteReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetchQuoteRequest(client, id).then((data) => setState({ status: 'ok', data })).catch(() => setState({ status: 'error' }));
  }, [client, id]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  if (state.status === 'loading') return <div className="skeleton h-60" role="status" aria-label="Loading" />;
  if (state.status === 'error') return <ErrorNote>Could not load this request. Try again.</ErrorNote>;
  const d = state.data;
  const open = d.status === 'OPEN';

  async function accept(r: QuoteReply) {
    setBusy(true);
    setError(null);
    try {
      const o = await acceptQuoteReply(client, id, r.quoteId, r.total);
      clearCart();
      router.push(`/orders/${o.orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept. Try again.');
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-2 p-5 sm:p-6">
        <p className="font-mono text-[14px]">{d.number}</p>
        <p className="text-[15px]">{d.lines.map((l) => `${l.quantity} ${l.unit.toLowerCase()} ${l.name}`).join(', ')}</p>
        <p className="text-[14px] text-stone">
          Needed by {day(d.neededBy)} · sent to {d.invited} nearby seller{d.invited === 1 ? '' : 's'}
          {open && (d.repliesOpen ? ` · replies close ${new Date(d.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}` : ' · replies closed, you can still accept one')}
        </p>
        {d.status === 'ACCEPTED' && d.orderId && <Link href={`/orders/${d.orderId}`} className="self-start font-medium text-cobalt hover:underline">See the order</Link>}
        {d.status === 'CANCELLED' && <p className="text-[14px] text-stone">You closed this request.</p>}
        {d.status === 'EXPIRED' && <p className="text-[14px] text-stone">The needed-by date has passed.</p>}
      </section>

      {error && <ErrorNote>{error}</ErrorNote>}
      <h2 className="font-display text-xl font-semibold">Replies ({d.replies.length})</h2>
      {d.replies.length === 0 ? (
        <p className="rounded-xl bg-sand-3 px-4 py-6 text-center text-[15px] text-stone">{open ? 'No replies yet. Sellers usually reply within a day; this page updates by itself.' : 'No seller replied.'}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {d.replies.map((r, i) => <Reply key={r.quoteId} r={r} best={i === 0 && d.replies.length > 1} canAccept={open} busy={busy} onAccept={() => setConfirm(r)} />)}
        </ul>
      )}

      {confirm && (
        <div role="alertdialog" aria-label="Accept this quote?" className="card flex flex-col gap-3 border-2 border-ink p-5">
          <p className="text-[15px]">Accept <span className="font-semibold">{confirm.seller.name}</span>&apos;s quote for <span className="font-semibold">{rupees.format(confirm.total)}</span>, delivered on {day(confirm.deliveryDate)}? It becomes a confirmed order, paid on delivery. The other sellers are told.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => accept(confirm)} className="btn-lime px-6">{busy ? 'Confirming' : 'Yes, place the order'}</button>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)} className="btn-ghost">Back</button>
          </div>
        </div>
      )}

      {open && (
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await cancelQuoteRequest(client, id); load(); } finally { setBusy(false); } }} className="self-start text-[14px] font-medium text-stone hover:underline">
          Close this request
        </button>
      )}
    </div>
  );
}

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <>
      <Header />
      <main id="main" className="container-x min-h-[70vh] max-w-3xl pb-32 pt-[calc(var(--header-h)+40px)]">
        <PageHead eyebrow="Bulk quote" title="Compare" accent="replies" />
        <div className="mt-8"><RequireAuth><View id={id} /></RequireAuth></div>
      </main>
      <BottomNav />
    </>
  );
}
