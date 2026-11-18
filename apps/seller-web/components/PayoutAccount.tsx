'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useApiClient } from '@sthiva/web-core';
import { Chip, ErrorNote, Pill } from './ui';
import { getFirebaseAuth } from '../lib/firebase';
import { fetchPayoutAccount, savePayoutAccount, type PayoutAccount } from '../lib/settlements';

// Where Sthiva sends this seller's money. The full number is never shown back: it is stored encrypted
// and only Sthiva's payout team sees it. API: apps/api features/suppliers/payout-account.ts.

const longDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const MAX_BYTES = 5 * 1024 * 1024;

const STATUS = {
  SUBMITTED: { label: 'Being checked', tone: 'wait' },
  VERIFIED: { label: 'Verified', tone: 'done' },
  REJECTED: { label: 'Not accepted', tone: 'bad' },
} as const;

function Form({ current, onSaved, onCancel }: { current: PayoutAccount | null; onSaved: (a: PayoutAccount) => void; onCancel?: () => void }) {
  const client = useApiClient();
  const [method, setMethod] = useState<'BANK' | 'UPI'>(current?.method ?? 'BANK');
  const [holderName, setHolderName] = useState(current?.holderName ?? '');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ifsc, setIfsc] = useState(current?.ifsc ?? '');
  const [upiId, setUpiId] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (method === 'BANK') {
      if (accountNumber !== confirm) return setError('The two account numbers do not match.');
      if (!proof) return setError('Add a photo of a cancelled cheque or your passbook’s first page.');
    }
    if (proof && proof.size > MAX_BYTES) return setError('The photo must be 5 MB or smaller.');
    setSaving(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      if (!token) throw new Error('Sign in again to continue.');
      const fields: Record<string, string> = method === 'BANK'
        ? { method, holderName, accountNumber, confirmAccountNumber: confirm, ifsc }
        : { method, holderName, upiId };
      onSaved(await savePayoutAccount(client.baseUrl, token, fields, method === 'BANK' ? proof : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-wrap gap-2" role="group" aria-label="How should Sthiva pay you?">
        <Chip active={method === 'BANK'} onClick={() => setMethod('BANK')}>Bank account</Chip>
        <Chip active={method === 'UPI'} onClick={() => setMethod('UPI')}>UPI ID</Chip>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-[15px] font-semibold">Account holder’s name</span>
        <input value={holderName} onChange={(e) => setHolderName(e.target.value)} className="field" maxLength={100} autoComplete="off" required placeholder="As the bank shows it" />
      </label>

      {method === 'BANK' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">Account number</span>
              <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={18} className="field font-mono" autoComplete="off" required />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold">Type it again</span>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} onPaste={(e) => e.preventDefault()} inputMode="numeric" maxLength={18} className="field font-mono" autoComplete="off" required />
            </label>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold">IFSC code</span>
            <input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={11} className="field font-mono sm:w-60" placeholder="SBIN0001234" autoComplete="off" required />
            <span className="text-[13px] text-stone">Printed on your cheque book and passbook.</span>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold">Cancelled cheque or passbook first page</span>
            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)} className="text-[14px]" required />
            <span className="text-[13px] text-stone">A clear photo or PDF, up to 5 MB, showing the name and account number. Only Sthiva’s payout team sees it.</span>
          </label>
        </>
      ) : (
        <label className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold">UPI ID</span>
          <input value={upiId} onChange={(e) => setUpiId(e.target.value.trim())} className="field font-mono" placeholder="name@okhdfcbank" autoComplete="off" required />
        </label>
      )}

      {current?.status === 'VERIFIED' && (
        <p className="rounded-xl bg-[#FFF4D6] p-3 text-[14px] text-[#5C4300]">
          For your safety, payouts pause for 48 hours after a verified account is changed, and you get an alert.
        </p>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>}
        <button type="submit" disabled={saving} className="btn-ink px-7">{saving ? 'Saving…' : 'Save payout account'}</button>
      </div>
    </form>
  );
}

export function PayoutAccountCard() {
  const client = useApiClient();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; account: PayoutAccount | null }>({ status: 'loading' });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let live = true;
    fetchPayoutAccount(client).then((account) => live && setState({ status: 'ready', account })).catch(() => live && setState({ status: 'error' }));
    return () => { live = false; };
  }, [client]);

  const saved = (account: PayoutAccount) => { setState({ status: 'ready', account }); setEditing(false); };

  return (
    <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="payout-account-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="payout-account-title" className="font-display text-xl font-semibold tracking-tight">Where we pay you</h2>
        {state.status === 'ready' && state.account && !editing && (
          <Pill tone={STATUS[state.account.status].tone}>{STATUS[state.account.status].label}</Pill>
        )}
      </div>

      {state.status === 'loading' && <div className="skeleton h-20" role="status" aria-label="Loading payout account" />}
      {state.status === 'error' && <ErrorNote>Couldn’t load your payout account. Check your connection and try again.</ErrorNote>}

      {state.status === 'ready' && (!state.account || editing) && (
        <>
          {!state.account && (
            <p className="text-[15px] text-stone">Add the bank account or UPI ID where Sthiva should send your earnings. We check it once before the first payout.</p>
          )}
          <Form current={state.account} onSaved={saved} onCancel={state.account ? () => setEditing(false) : undefined} />
        </>
      )}

      {state.status === 'ready' && state.account && !editing && (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-[16px] font-semibold">
              {state.account.method === 'BANK' ? 'Bank account' : 'UPI'} <span className="font-mono">{state.account.masked}</span>
            </p>
            <p className="text-[14px] text-stone">
              {state.account.holderName}{state.account.ifsc && <> · <span className="font-mono">{state.account.ifsc}</span></>}
            </p>
          </div>
          {state.account.status === 'SUBMITTED' && <p className="text-[14px] text-stone">Sthiva’s team checks new accounts within one working day.</p>}
          {state.account.status === 'REJECTED' && (
            <ErrorNote>Sthiva could not verify this account.{state.account.note ? ` ${state.account.note}` : ''} Please add it again.</ErrorNote>
          )}
          {state.account.holdUntil && (
            <p className="rounded-xl bg-[#FFF4D6] p-3 text-[14px] text-[#5C4300]">
              This account was changed recently, so payouts are paused until {longDate.format(new Date(state.account.holdUntil))}. If you did not change it, contact Sthiva support now.
            </p>
          )}
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost self-start">Change account</button>
        </>
      )}
    </section>
  );
}
