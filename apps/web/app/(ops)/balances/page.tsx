'use client';

import { useEffect, useState } from 'react';
import { useApiClient } from '@sthiva/web-core';
import { EmptyState, ErrorNote, PageHead, Pager, Pill, rupees, shortDate } from '../../../components/ui';
import { useAuth } from '../../../components/auth/AuthProvider';
import { errorText, refundsApi, useLoad, walletApi, type SellerWallet, type WalletEntry, type WalletRow } from '../../../lib/ops';

// Seller Sthiva balances (apps/api features/wallet) and online-payment refunds that failed
// (features/payments). Only an admin may add or take balance, always with a reason, or retry a refund.

const TYPE: Record<WalletEntry['type'], string> = {
  TOPUP: 'Top-up', COMMISSION: 'Commission', COMMISSION_RETURN: 'Commission returned', ADJUSTMENT: 'Adjusted by Sthiva',
};

function Refunds({ canEdit }: { canEdit: boolean }) {
  const client = useApiClient();
  const { state, reload } = useLoad(refundsApi.list, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (state.status !== 'success') return null;
  const { orders, checkouts } = state.data;
  if (orders.length === 0 && checkouts.length === 0) return null;

  async function retry(orderId: string) {
    setBusy(orderId); setError(null);
    try {
      const r = await refundsApi.retry(client, orderId);
      if (!r.ok) setError('Razorpay refused the refund again. Check the payment in the Razorpay dashboard.');
      reload();
    } catch (err) { setError(errorText(err, 'Could not retry. Try again.')); } finally { setBusy(null); }
  }

  return (
    <section className="card flex flex-col gap-3 border-error/40 p-5 sm:p-6" aria-labelledby="refunds-title">
      <h2 id="refunds-title" className="flex items-center gap-2 text-[18px] font-semibold text-error">
        <span className="material-symbols-outlined" aria-hidden="true">error</span>
        Refunds that need attention
      </h2>
      <p className="text-[14px] text-stone">A buyer paid online and should get money back, but the refund did not go through. Retry it, or refund it in the Razorpay dashboard and tell the buyer.</p>
      {error && <p role="alert" className="text-[14px] text-error">{error}</p>}
      <ul className="flex flex-col divide-y divide-black/5">
        {orders.map((o) => (
          <li key={o.orderId} className="flex flex-wrap items-center gap-3 py-3">
            <span className="font-mono">{o.orderNumber}</span>
            <span className="font-semibold tabular-nums">{rupees.format(o.amount)}</span>
            <Pill tone={o.status === 'FAILED' ? 'bad' : 'wait'}>{o.status === 'FAILED' ? 'Failed' : 'Stuck'}</Pill>
            {o.error && <span className="text-[13px] text-stone">{o.error}</span>}
            {o.razorpayPaymentId && <span className="font-mono text-[12px] text-stone">{o.razorpayPaymentId}</span>}
            {canEdit && o.status === 'FAILED' && (
              <button type="button" disabled={busy === o.orderId} onClick={() => retry(o.orderId)} className="btn-lime ml-auto px-4">Try again</button>
            )}
          </li>
        ))}
        {checkouts.map((c) => (
          <li key={c.razorpayOrderId} className="flex flex-wrap items-center gap-3 py-3">
            <span>Paid, but the order could not be placed</span>
            <span className="font-semibold tabular-nums">{rupees.format(c.amount)}</span>
            <Pill tone="bad">Refund failed</Pill>
            {c.reason && <span className="text-[13px] text-stone">{c.reason}</span>}
            {c.razorpayPaymentId && <span className="font-mono text-[12px] text-stone">{c.razorpayPaymentId}</span>}
            <span className="w-full text-[13px] text-stone">Refund this payment in the Razorpay dashboard.</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Adjust({ supplierId, onDone }: { supplierId: string; onDone: (w: SellerWallet) => void }) {
  const client = useApiClient();
  const [way, setWay] = useState<'ADD' | 'TAKE'>('ADD');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(amount);
  const ready = amount !== '' && value > 0 && note.trim().length >= 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setError(null);
    try {
      const w = await walletApi.adjust(client, supplierId, { amount: way === 'ADD' ? value : -value, note: note.trim() });
      setAmount(''); setNote('');
      onDone(w);
    } catch (err) { setError(errorText(err, 'Could not change the balance.')); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl bg-black/[0.03] p-4">
      <p className="text-[14px] font-medium">Add or take balance by hand</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Add or take">
        {(['ADD', 'TAKE'] as const).map((w) => (
          <button key={w} type="button" role="radio" aria-checked={way === w} onClick={() => setWay(w)}
            className={`rounded-full px-4 py-1.5 text-[14px] font-medium ${way === w ? 'bg-ink text-sand' : 'border border-black/10'}`}>
            {w === 'ADD' ? 'Add' : 'Take'}
          </button>
        ))}
        <input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Rupees" aria-label="Amount in rupees" className="field w-36" />
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} aria-label="Reason"
        placeholder='Reason the seller will see, e.g. "Paid Rs 2,000 by bank transfer on 21 Nov"' className="field" />
      {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
      <button type="submit" disabled={!ready || busy} className="btn-lime self-start px-4">
        {way === 'ADD' ? `Add ${ready ? rupees.format(value) : ''}` : `Take ${ready ? rupees.format(value) : ''}`}
      </button>
    </form>
  );
}

function SellerWalletPanel({ row, canEdit, onChanged }: { row: WalletRow; canEdit: boolean; onChanged: () => void }) {
  const client = useApiClient();
  const [page, setPage] = useState(1);
  const [wallet, setWallet] = useState<SellerWallet | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    walletApi.get(client, row.supplierId, page).then((w) => live && setWallet(w)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [client, row.supplierId, page]);
  const totalPages = wallet ? Math.max(1, Math.ceil(wallet.total / wallet.limit)) : 1;

  return (
    <div className="flex flex-col gap-3 border-t border-black/5 pt-3">
      {error && <ErrorNote>Couldn’t load this balance.</ErrorNote>}
      {wallet && wallet.entries.length === 0 && <p className="text-[14px] text-stone">No top-ups or commission yet.</p>}
      {wallet && wallet.entries.length > 0 && (
        <ul className="flex flex-col divide-y divide-black/5 text-[14px]">
          {wallet.entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <span className="font-medium">{TYPE[e.type]}</span>
              {e.orderNumber && <span className="font-mono">{e.orderNumber}</span>}
              {e.note && <span className="text-stone">{e.note}</span>}
              <span className="ml-auto font-semibold tabular-nums">{e.amount > 0 ? '+' : '−'}{rupees.format(Math.abs(e.amount))}</span>
              <span className="w-full text-[12px] text-stone">{shortDate.format(new Date(e.at))} · balance after {rupees.format(e.balanceAfter)}</span>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} totalPages={totalPages} hasPrev={page > 1} hasNext={page < totalPages} onPage={setPage} />
      {canEdit && <Adjust supplierId={row.supplierId} onDone={(w) => { setPage(1); setWallet(w); onChanged(); }} />}
    </div>
  );
}

export default function BalancesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN';
  const { state, reload } = useLoad(walletApi.list, []);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const rows = state.status === 'success' ? state.data.filter((r) => r.businessName.toLowerCase().includes(q.trim().toLowerCase())) : [];
  const total = state.status === 'success' ? state.data.reduce((s, r) => s + r.balance, 0) : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHead eyebrow="Money" title="Seller balances">
        <p className="max-w-sm text-[15px] text-stone">Prepaid balances sellers top up through Razorpay. Commission is taken from them when they accept orders (once switched on in Settings).</p>
      </PageHead>

      <Refunds canEdit={canEdit} />

      {state.status === 'loading' && <div className="skeleton h-48" role="status" aria-label="Loading balances" />}
      {state.status === 'error' && <ErrorNote>{errorText(state.error, 'Couldn’t load balances.')}</ErrorNote>}
      {state.status === 'success' && (
        <>
          <p className="text-[15px]">All sellers together hold <span className="font-semibold tabular-nums">{rupees.format(total)}</span> with Sthiva.</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a seller" aria-label="Find a seller" className="field max-w-sm" />
          {rows.length === 0 ? (
            <EmptyState icon="account_balance_wallet" title="No sellers" body="Sellers appear here once they sign up." />
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map((r) => (
                <li key={r.supplierId} className="card flex flex-col gap-2 p-4">
                  <button type="button" onClick={() => setOpen(open === r.supplierId ? null : r.supplierId)} aria-expanded={open === r.supplierId}
                    className="flex flex-wrap items-center gap-3 text-left">
                    <span className="font-medium">{r.businessName}</span>
                    {r.verificationStatus && r.verificationStatus !== 'VERIFIED' && <Pill tone="muted">{r.verificationStatus.toLowerCase()}</Pill>}
                    <span className="ml-auto font-display text-lg font-bold tabular-nums">{rupees.format(r.balance)}</span>
                    <span className="material-symbols-outlined text-[20px] text-stone" aria-hidden="true">{open === r.supplierId ? 'expand_less' : 'expand_more'}</span>
                  </button>
                  {open === r.supplierId && <SellerWalletPanel row={r} canEdit={canEdit} onChanged={reload} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
