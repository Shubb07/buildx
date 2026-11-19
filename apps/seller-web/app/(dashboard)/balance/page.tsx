'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useApiClient } from '@sthiva/web-core';
import { EmptyState, ErrorNote, PageHead, Pager, rupees, shortDate } from '../../../components/ui';
import { useAuth } from '../../../components/auth/AuthProvider';
import { fetchWallet, topUp, PaymentClosed, useWallet, type Wallet, type WalletEntry } from '../../../lib/wallet';

// Sthiva balance: the seller tops it up through Razorpay; commission is taken from it when they accept
// an order (apps/api features/wallet). Money page, so it stays in English (owner rule).

const QUICK = [1000, 2000, 5000, 10000];

const TYPE: Record<WalletEntry['type'], { label: string; icon: string }> = {
  TOPUP: { label: 'Top-up', icon: 'add_card' },
  COMMISSION: { label: 'Commission', icon: 'receipt_long' },
  COMMISSION_RETURN: { label: 'Commission returned', icon: 'undo' },
  ADJUSTMENT: { label: 'Adjusted by Sthiva', icon: 'tune' },
};

function Entry({ e }: { e: WalletEntry }) {
  const type = TYPE[e.type];
  const plus = e.amount > 0;
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={`material-symbols-outlined mt-0.5 text-[22px] ${plus ? 'text-tertiary' : 'text-stone'}`} aria-hidden="true">{type.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">
          {type.label}
          {e.orderNumber && <> · {e.orderId ? <Link href="/orders" className="font-mono text-cobalt hover:underline">{e.orderNumber}</Link> : <span className="font-mono">{e.orderNumber}</span>}</>}
        </p>
        {e.note && <p className="text-[14px] text-stone">{e.note}</p>}
        <p className="font-mono text-[12px] text-stone">{shortDate.format(new Date(e.at))}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`font-semibold tabular-nums ${plus ? 'text-tertiary' : ''}`}>{plus ? '+' : '−'}{rupees.format(Math.abs(e.amount))}</p>
        <p className="text-[12px] tabular-nums text-stone">Balance {rupees.format(e.balanceAfter)}</p>
      </div>
    </li>
  );
}

function TopUpCard({ wallet, need }: { wallet: Wallet; need: number }) {
  const client = useApiClient();
  const { user } = useAuth();
  const start = Math.max(wallet.minTopUp, Math.ceil(need / 100) * 100);
  const [amount, setAmount] = useState(String(start));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const value = Number(amount);
  const problem = !amount || !Number.isInteger(value) ? 'Enter a whole number of rupees'
    : value < wallet.minTopUp ? `The smallest top-up is ${rupees.format(wallet.minTopUp)}`
    : value > wallet.maxTopUp ? `Top up at most ${rupees.format(wallet.maxTopUp)} at a time` : null;

  async function pay() {
    setBusy(true); setError(null); setDone(null);
    try {
      await topUp(client, value, { name: user?.name, contact: user?.phone });
      setDone(value);
    } catch (err) {
      if (!(err instanceof PaymentClosed)) setError(err instanceof Error && err.message ? err.message : 'The top-up did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!wallet.canTopUp) {
    return (
      <section className="card flex flex-col gap-2 p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold tracking-tight">Add balance</h2>
        <p className="text-[15px]">Online top-up is not set up yet. To add balance, write to <a href="mailto:support@sthiva.com" className="font-medium text-cobalt hover:underline">support@sthiva.com</a> and Sthiva&apos;s team will add it after your bank transfer.</p>
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="topup-title">
      <div>
        <h2 id="topup-title" className="font-display text-xl font-semibold tracking-tight">Add balance</h2>
        <p className="mt-1 text-[14px] text-stone">Pay by UPI, card or net banking through Razorpay. The full amount is added: Sthiva pays the payment fee.</p>
      </div>
      {need > 0 && (
        <p className="rounded-lg bg-[#FFF4D6] px-3 py-2 text-[14px] text-[#5C4300]">You need at least {rupees.format(need)} more to accept the order waiting for you.</p>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
        {QUICK.filter((q) => q >= wallet.minTopUp && q <= wallet.maxTopUp).map((q) => (
          <button key={q} type="button" onClick={() => setAmount(String(q))} aria-pressed={value === q}
            className={`rounded-full px-4 py-2 text-[14px] font-semibold tabular-nums ${value === q ? 'bg-ink text-sand' : 'border border-sand-4 bg-sand'}`}>
            {rupees.format(q)}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium">Amount (Rs)</span>
        <input type="number" inputMode="numeric" min={wallet.minTopUp} max={wallet.maxTopUp} step={1} value={amount}
          onChange={(e) => setAmount(e.target.value)} className="field max-w-[220px] tabular-nums" aria-invalid={!!problem} />
        {problem && amount !== '' && <span className="text-[13px] text-error">{problem}</span>}
      </label>
      {error && <p role="alert" className="text-[14px] text-error">{error}</p>}
      {done !== null && <p role="status" className="text-[14px] font-medium text-tertiary">{rupees.format(done)} added to your balance.</p>}
      <button type="button" onClick={pay} disabled={busy || !!problem} className="btn-lime self-start">
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_card</span>
        {busy ? 'Opening payment' : `Top up ${problem ? '' : rupees.format(value)}`}
      </button>
    </section>
  );
}

export default function BalancePage() {
  const client = useApiClient();
  const params = useSearchParams();
  const need = Math.max(0, Number(params.get('need')) || 0);
  const { wallet, error } = useWallet();
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<Wallet | null>(null);

  // First page comes with the balance; later pages are loaded on their own
  useEffect(() => {
    if (page === 1) { setHistory(wallet); return; }
    let live = true;
    fetchWallet(client, page).then((w) => live && setHistory(w)).catch(() => undefined);
    return () => { live = false; };
  }, [client, page, wallet]);

  const totalPages = history ? Math.max(1, Math.ceil(history.total / history.limit)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHead eyebrow="Money" title="Sthiva balance">
        <p className="max-w-sm text-[15px] text-stone">Sthiva&apos;s commission is taken from this balance when you accept an order.</p>
      </PageHead>

      {!wallet && !error && <div className="skeleton h-40" role="status" aria-label="Loading your balance" />}
      {error && !wallet && <ErrorNote>Couldn’t load your balance. Check your connection and try again.</ErrorNote>}

      {wallet && (
        <>
          <section className="card flex flex-col gap-2 p-5 sm:p-6">
            <p className="eyebrow text-stone">Your balance</p>
            <p className="font-display text-4xl font-bold tabular-nums">{rupees.format(wallet.balance)}</p>
            {wallet.enabled ? (
              <ul className="mt-2 flex flex-col gap-1.5 text-[14px] text-stone">
                <li>• The commission for an order is taken when you accept it, at the rate for a Sthiva driver.</li>
                <li>• If you deliver it yourself, the difference to your lower rate comes back to this balance.</li>
                <li>• If the buyer or Sthiva cancels, the commission comes back in full. If you cancel, it does not.</li>
                <li>• With too little balance you can&apos;t accept new orders, so keep it topped up.</li>
              </ul>
            ) : (
              <p className="text-[14px] text-stone">Commission is not taken from your balance yet. Sthiva will tell you before it starts.</p>
            )}
          </section>

          <TopUpCard wallet={wallet} need={need} />

          <section aria-labelledby="history-title" className="flex flex-col gap-2">
            <h2 id="history-title" className="font-display text-xl font-semibold tracking-tight">History</h2>
            {history && history.entries.length === 0 ? (
              <EmptyState icon="account_balance_wallet" title="Nothing yet" body="Top-ups and commission for your orders will show here." />
            ) : history ? (
              <>
                <ul className="card divide-y divide-sand-4 px-5">{history.entries.map((e) => <Entry key={e.id} e={e} />)}</ul>
                <Pager page={page} totalPages={totalPages} hasPrev={page > 1} hasNext={page < totalPages} onPage={setPage} />
              </>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
