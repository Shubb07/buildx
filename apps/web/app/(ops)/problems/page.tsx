'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApiClient } from '@sthiva/web-core';
import { Chip, ChipRow, EmptyState, ErrorNote, PageHead, Pill, rupees, shortDate } from '../../../components/ui';
import { errorText, problemApi, useLoad, type Problem, type ProblemDecision } from '../../../lib/ops';

// Buyer problem reports after delivery (API features/problems). Look at the photos and the seller's
// reply, then decide: refund (to the buyer's UPI within 3 working days), replacement, or not accepted.
// When the seller is at fault, the charge comes off their next payout statement (Payouts page).

const KIND: Record<string, string> = {
  DAMAGED: 'Damaged', SHORT: 'Fewer than ordered', WRONG_ITEM: 'Wrong item', DEFECTIVE: 'Not working or faulty', CHANGE_OF_MIND: 'Change of mind',
};
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Same rule as the API (problem.service.ts suggestedSellerCharge) */
function suggested(p: Problem, outcome: string, atFault: string, refund: number, trip: number) {
  if (outcome === 'REJECTED' || atFault === 'NONE') return 0;
  const weight = p.claimValue > 0 ? p.lines.reduce((s, l) => s + l.quantity * l.buyerUnitPrice * l.sellerShare, 0) / p.claimValue : 1;
  const share = round2(refund * weight);
  return atFault === 'SELLER' ? round2(share + trip) : share;
}

function Decide({ p, onDone }: { p: Problem; onDone: () => void }) {
  const client = useApiClient();
  const changeOfMind = p.kind === 'CHANGE_OF_MIND';
  const [outcome, setOutcome] = useState<ProblemDecision['outcome']>(p.want);
  const [atFault, setAtFault] = useState<ProblemDecision['atFault']>(changeOfMind ? 'BUYER' : 'SELLER');
  const [refund, setRefund] = useState(String(p.claimValue));
  const [trip, setTrip] = useState('0');
  const [ownCharge, setOwnCharge] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refundN = outcome === 'REFUND' ? Number(refund) || 0 : 0;
  const tripN = outcome === 'REJECTED' ? 0 : Number(trip) || 0;
  const charge = ownCharge !== null ? Number(ownCharge) || 0 : suggested(p, outcome, atFault, refundN, tripN);
  const valid = note.trim().length >= 5 && (outcome !== 'REFUND' || (refundN > 0 && !!p.upiId));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await problemApi.resolve(client, p._id, {
        outcome, atFault: outcome === 'REJECTED' ? 'NONE' : atFault, note: note.trim(),
        ...(outcome === 'REFUND' ? { refundAmount: refundN } : {}),
        ...(outcome !== 'REJECTED' ? { returnTripCharge: tripN } : {}),
        ...(ownCharge !== null && outcome !== 'REJECTED' ? { sellerCharge: Number(ownCharge) || 0 } : {}),
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-sand-4 pt-3">
      <ChipRow label="Decision">
        <Chip active={outcome === 'REFUND'} onClick={() => setOutcome('REFUND')}>Refund</Chip>
        {!changeOfMind && <Chip active={outcome === 'REPLACEMENT'} onClick={() => setOutcome('REPLACEMENT')}>Replace</Chip>}
        <Chip active={outcome === 'REJECTED'} onClick={() => setOutcome('REJECTED')}>Not accepted</Chip>
      </ChipRow>
      {outcome !== 'REJECTED' && (
        <ChipRow label="Who pays">
          <Chip active={atFault === 'SELLER'} onClick={() => setAtFault('SELLER')}>Seller at fault</Chip>
          <Chip active={atFault === 'BUYER'} onClick={() => setAtFault('BUYER')}>Buyer (change of mind)</Chip>
          <Chip active={atFault === 'NONE'} onClick={() => setAtFault('NONE')}>Sthiva absorbs</Chip>
        </ChipRow>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {outcome === 'REFUND' && (
          <label className="flex flex-col gap-1 text-[13px] font-medium">Refund to buyer (₹)
            <input value={refund} onChange={(e) => setRefund(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className="field h-10 font-mono" />
          </label>
        )}
        {outcome !== 'REJECTED' && (
          <label className="flex flex-col gap-1 text-[13px] font-medium">Return trip cost (₹)
            <input value={trip} onChange={(e) => setTrip(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className="field h-10 font-mono" />
          </label>
        )}
        {outcome !== 'REJECTED' && (
          <label className="flex flex-col gap-1 text-[13px] font-medium">Charge to seller (₹)
            <input value={ownCharge ?? String(charge)} onChange={(e) => setOwnCharge(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className="field h-10 font-mono" />
            <span className="font-normal text-stone">
              {ownCharge === null ? 'Standard: their share of the refund, plus the trip if at fault' : <button type="button" onClick={() => setOwnCharge(null)} className="text-cobalt hover:underline">Use the standard amount</button>}
            </span>
          </label>
        )}
      </div>
      {outcome === 'REFUND' && !p.upiId && <p className="text-[13px] text-error">The buyer gave no UPI ID. Call them for one first.</p>}
      {outcome === 'REFUND' && changeOfMind && <p className="text-[13px] text-stone">Change of mind: take the return trip off the refund (the buyer pays it).</p>}
      <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} className="field"
        placeholder="What was decided, shown to the buyer and seller, e.g. 2 sheets cracked on arrival, refund approved" />
      <button type="button" disabled={!valid || busy} onClick={submit} className="btn-lime self-start px-4">{busy ? 'Saving' : 'Save decision'}</button>
      {error && <p className="text-[13px] text-error">{error}</p>}
    </div>
  );
}

function RefundPaid({ p, onDone }: { p: Problem; onDone: () => void }) {
  const client = useApiClient();
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    try { await problemApi.refundPaid(client, p._id, ref.trim()); onDone(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-2 border-t border-sand-4 pt-3">
      <p className="text-[14px]">
        Send <span className="font-semibold">{rupees.format(p.resolution!.refundAmount)}</span> to <span className="font-mono">{p.upiId}</span>
        {p.resolution!.refundDueBy && <> by <span className="font-semibold">{day(p.resolution!.refundDueBy)}</span></>}, then enter the UPI reference.
      </p>
      <div className="flex flex-wrap gap-2">
        <input value={ref} onChange={(e) => setRef(e.target.value.slice(0, 100))} className="field h-10 flex-1" placeholder="UPI reference number" />
        <button type="button" disabled={busy || ref.trim().length < 4} onClick={submit} className="btn-lime px-4">Refund sent</button>
      </div>
      {error && <p className="text-[13px] text-error">{error}</p>}
    </div>
  );
}

function ProblemCard({ p, onDone }: { p: Problem; onDone: () => void }) {
  const open = p.status === 'OPEN' || p.status === 'SELLER_REPLIED';
  const refundDue = p.status === 'RESOLVED' && (p.resolution?.refundAmount ?? 0) > 0 && !p.refund;
  const tag = p.status === 'OPEN' ? <Pill tone="wait">Seller not replied</Pill>
    : p.status === 'SELLER_REPLIED' ? <Pill tone="live">Ready to decide</Pill>
    : refundDue ? <Pill tone="bad">Refund to send</Pill>
    : p.status === 'RESOLVED' ? <Pill tone="done">Resolved</Pill>
    : <Pill tone="muted">{p.status === 'REJECTED' ? 'Not accepted' : 'Withdrawn'}</Pill>;
  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {tag}
        <span className="font-semibold">{KIND[p.kind] ?? p.kind}</span>
        <span className="ml-auto font-mono text-[12px] text-stone">{p.number}</span>
      </div>
      <p className="text-[13px] text-stone">
        <Link href={`/orders/${p.orderId}`} className="font-mono text-cobalt hover:underline">{p.orderNumber}</Link>
        {' '}· buyer {p.buyer.name}{p.buyer.phone ? ` (${p.buyer.phone})` : ''} · seller {p.seller.name}{p.seller.phone ? ` (${p.seller.phone})` : ''} · {shortDate.format(new Date(p.createdAt))}
      </p>
      <ul className="text-[14px]">
        {p.lines.map((l) => <li key={l.index}>{l.quantity} of {l.orderedQuantity} · {l.name} · {rupees.format(l.buyerUnitPrice)} each</li>)}
      </ul>
      <p className="rounded-xl bg-sand-2 px-3 py-2 text-[14px]">{p.description}</p>
      {p.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {p.photos.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" aria-label="Open photo full size">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="Buyer's photo" className="h-20 w-20 rounded-lg object-cover" />
            </a>
          ))}
        </div>
      )}
      <p className="text-[13px] text-stone">Buyer wants {p.want === 'REFUND' ? `a refund${p.upiId ? ` to ${p.upiId}` : ''}` : 'a replacement'} · claim {rupees.format(p.claimValue)}</p>
      {p.sellerReply && (
        <p className="text-[14px]">Seller {p.sellerReply.agrees ? 'agrees' : 'disagrees'}{p.sellerReply.note ? `: "${p.sellerReply.note}"` : ''}</p>
      )}
      {p.resolution && (
        <p className="text-[14px]">
          Decided: {p.resolution.outcome === 'REFUND' ? `refund ${rupees.format(p.resolution.refundAmount)}` : p.resolution.outcome === 'REPLACEMENT' ? 'replace' : 'not accepted'}
          {p.resolution.sellerCharge > 0 && <> · seller pays {rupees.format(p.resolution.sellerCharge)}{p.settlementId ? ' (in a statement)' : ' (next statement)'}</>}
          {p.refund && <> · refund sent, ref <span className="font-mono">{p.refund.reference}</span></>}
          <span className="block text-stone">{p.resolution.note}</span>
        </p>
      )}
      {open && <Decide p={p} onDone={onDone} />}
      {refundDue && <RefundPaid p={p} onDone={onDone} />}
    </li>
  );
}

const FILTERS = [
  ['OPEN', 'To decide'], ['REFUND_DUE', 'Refunds to send'], ['RESOLVED', 'Resolved'], ['REJECTED', 'Not accepted'],
] as const;

export default function ProblemsPage() {
  const [status, setStatus] = useState<(typeof FILTERS)[number][0]>('OPEN');
  const list = useLoad((c) => problemApi.list(c, status), [status]);

  return (
    <div className="flex flex-col gap-6">
      <PageHead eyebrow="After delivery" title="Problems">
        <p className="max-w-sm text-[15px] text-stone">
          Damaged, short or wrong items reported by buyers. Decide within a day; refunds reach the buyer&apos;s UPI within 3 working days.
        </p>
      </PageHead>
      <ChipRow label="Show">
        {FILTERS.map(([v, l]) => <Chip key={v} active={status === v} onClick={() => setStatus(v)}>{l}</Chip>)}
      </ChipRow>
      {list.state.status === 'loading' && <div className="skeleton h-40" role="status" aria-label="Loading" />}
      {list.state.status === 'error' && <ErrorNote>{errorText(list.state.error, 'Couldn’t load problem reports.')}</ErrorNote>}
      {list.state.status === 'success' && (list.state.data.length === 0 ? (
        <EmptyState icon="task_alt" title="Nothing here" body="Problem reports from buyers show up here." />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.state.data.map((p) => <ProblemCard key={`${p._id}-${p.status}-${p.refund ? 1 : 0}`} p={p} onDone={list.reload} />)}
        </ul>
      ))}
    </div>
  );
}
