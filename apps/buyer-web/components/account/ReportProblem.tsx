'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useApiClient } from '@sthiva/web-core';
import {
  PROBLEM_KINDS, fetchOrderProblems, reportProblem, uploadProblemPhoto, withdrawProblem,
  type OrderProblems, type ProblemKind, type ProblemReport,
} from '@/lib/problems';
import { SITE } from '@/lib/site';
import { rupees } from '@/lib/format';

// On a delivered order: report damaged, wrong, short or faulty items with photos, or return sealed
// items for a change of mind where the product allows it. Each item's time limit was promised when
// it was ordered and shown on the product page. Refunds go to the buyer's UPI in 3 working days.

const until = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const KIND_LABEL: Record<string, string> = Object.fromEntries(PROBLEM_KINDS.map((k) => [k.id, k.label]));

function ReportStatus({ r, onWithdraw, busy }: { r: ProblemReport; onWithdraw: () => void; busy: boolean }) {
  const open = r.status === 'OPEN' || r.status === 'SELLER_REPLIED';
  const res = r.resolution;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-sand-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{KIND_LABEL[r.kind] ?? r.kind}</span>
        <span className="font-mono text-[12px] text-stone">{r.number}</span>
        <span className={`ml-auto rounded-full px-3 py-0.5 text-[12px] font-semibold ${open ? 'bg-[#FFF3D6] text-ink' : r.status === 'RESOLVED' ? 'bg-[#E3F4E4] text-ink' : 'bg-sand-3 text-stone'}`}>
          {open ? 'We are looking into it' : r.status === 'RESOLVED' ? 'Resolved' : r.status === 'REJECTED' ? 'Not accepted' : 'Withdrawn'}
        </span>
      </div>
      <p className="text-[14px] text-stone">{r.lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')}</p>
      {open && (
        <p className="text-[14px]">
          {r.status === 'SELLER_REPLIED' ? 'The seller has replied. ' : 'We have asked the seller. '}
          Sthiva&apos;s team will decide and tell you, usually within a day.
        </p>
      )}
      {res?.outcome === 'REFUND' && (
        <p className="text-[14px]">
          Refund of <span className="font-semibold">{rupees.format(res.refundAmount)}</span> to {r.upiId}
          {r.refundPaidAt ? ', sent.' : res.refundDueBy ? `, by ${day(res.refundDueBy)}.` : '.'}
        </p>
      )}
      {res?.outcome === 'REPLACEMENT' && <p className="text-[14px]">The seller will replace the items. We will tell you the delivery date.</p>}
      {res && <p className="text-[14px] text-stone">{res.note}</p>}
      {open && (
        <button type="button" disabled={busy} onClick={onWithdraw} className="self-start text-[13px] font-medium text-stone hover:underline">
          Withdraw this report
        </button>
      )}
    </li>
  );
}

export function ReportProblem({ orderId }: { orderId: string }) {
  const client = useApiClient();
  const [data, setData] = useState<OrderProblems | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<ProblemKind | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');
  const [want, setWant] = useState<'REFUND' | 'REPLACEMENT'>('REPLACEMENT');
  const [upiId, setUpiId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchOrderProblems(client, orderId).then(setData).catch(() => setData(null));
  }, [client, orderId]);
  useEffect(() => { load(); }, [load]);

  const changeOfMind = kind === 'CHANGE_OF_MIND';
  // Items that can be reported for the chosen kind, right now
  const eligible = useMemo(() => (data?.lines ?? []).filter((l) => (changeOfMind ? l.changeOfMindUntil : l.problemUntil)), [data, changeOfMind]);
  const anyProblem = (data?.lines ?? []).some((l) => l.problemUntil);
  const anyChangeOfMind = (data?.lines ?? []).some((l) => l.changeOfMindUntil);

  if (!data || !data.delivered) return null;

  const chosen = eligible
    .map((l) => ({ index: l.index, quantity: Number(qty[l.index] ?? '') }))
    .filter((l) => l.quantity > 0);
  const tooMany = eligible.some((l) => Number(qty[l.index] ?? 0) > l.quantity);
  const refund = changeOfMind || want === 'REFUND';
  const upiOk = !refund || /^[a-zA-Z0-9._-]{2,}@[a-zA-Z][a-zA-Z0-9.-]{1,}$/.test(upiId.trim());
  const valid = kind && chosen.length > 0 && !tooMany && description.trim().length >= 10 && (changeOfMind || photos.length > 0) && upiOk && !uploading;

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of Array.from(files).slice(0, 6 - photos.length)) {
        const url = await uploadProblemPhoto(client.baseUrl, f);
        setPhotos((p) => [...p, url]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The photo could not be added');
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      await reportProblem(client, orderId, {
        kind, lines: chosen, description: description.trim(), photos,
        want: changeOfMind ? 'REFUND' : want, ...(refund ? { upiId: upiId.trim() } : {}),
      });
      setFormOpen(false);
      setKind(null); setQty({}); setPhotos([]); setDescription('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    setBusy(true);
    try { await withdrawProblem(client, id); load(); } catch { /* the list reloads anyway */ } finally { setBusy(false); }
  }

  const canReport = !data.hasOpenReport && (anyProblem || anyChangeOfMind);

  return (
    <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="problem-title">
      <div>
        <h2 id="problem-title" className="font-display text-xl font-semibold tracking-tight">Problem with this order?</h2>
        <p className="text-[14px] text-stone">
          Each item has its own time to report, shown when you ordered. <Link href="/refunds" className="underline">How returns work</Link>
        </p>
      </div>

      {data.reports.length > 0 && (
        <ul className="flex flex-col gap-3">
          {data.reports.map((r) => <ReportStatus key={r._id} r={r} busy={busy} onWithdraw={() => withdraw(r._id)} />)}
        </ul>
      )}

      {!canReport && !data.hasOpenReport && (
        <p className="text-[14px] text-stone">
          The time to report problems on this order online has passed.
          {SITE.supportPhone ? <> If you told the driver about a problem at delivery, call us on <a href={`tel:${SITE.supportPhone}`} className="font-medium text-ink underline">{SITE.supportPhone}</a>.</> : ' If you told the driver about a problem at delivery, contact us.'}
        </p>
      )}

      {canReport && !formOpen && (
        <button type="button" onClick={() => setFormOpen(true)} className="btn-ghost self-start">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">report</span>
          Report a problem
        </button>
      )}

      {canReport && formOpen && (
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-[15px] font-semibold">What is wrong?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROBLEM_KINDS.filter((k) => (k.id === 'CHANGE_OF_MIND' ? anyChangeOfMind : anyProblem)).map((k) => (
                <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => { setKind(k.id); setQty({}); }}
                  className={`rounded-xl border p-3 text-left ${kind === k.id ? 'border-ink bg-sand-3' : 'border-sand-4 hover:border-ink'}`}>
                  <span className="block text-[15px] font-semibold">{k.label}</span>
                  <span className="text-[13px] text-stone">{k.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {kind && (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[15px] font-semibold">Which items, and how many?</legend>
                {eligible.length === 0 && <p className="text-[14px] text-stone">No item in this order can be reported for this now.</p>}
                {eligible.map((l) => {
                  const end = changeOfMind ? l.changeOfMindUntil : l.problemUntil;
                  const over = Number(qty[l.index] ?? 0) > l.quantity;
                  return (
                    <div key={l.index} className="flex flex-wrap items-center gap-3 rounded-xl border border-sand-4 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium">{l.name}</p>
                        <p className="text-[13px] text-stone">
                          You got {l.quantity} · report by {end ? until(end) : ''}
                          {l.atDeliveryOnly && !changeOfMind ? ' (to put on record what you saw at delivery)' : ''}
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-[13px]">
                        How many
                        <input value={qty[l.index] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [l.index]: e.target.value.replace(/[^\d.]/g, '').slice(0, 8) }))}
                          inputMode="decimal" placeholder="0" className={`field h-10 w-24 font-mono ${over ? 'border-error' : ''}`} aria-label={`How many ${l.name}`} />
                      </label>
                    </div>
                  );
                })}
              </fieldset>

              <div className="flex flex-col gap-2">
                <p className="text-[15px] font-semibold">Photos {changeOfMind ? '(optional)' : '(at least one)'}</p>
                <p className="text-[13px] text-stone">{changeOfMind ? 'A photo of the sealed items helps.' : 'Show the problem clearly, with the brand or label in view if you can.'}</p>
                <div className="flex flex-wrap gap-2">
                  {photos.map((p) => (
                    <div key={p} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt="Photo of the problem" className="h-20 w-20 rounded-lg object-cover" />
                      <button type="button" onClick={() => setPhotos((x) => x.filter((y) => y !== p))} aria-label="Remove photo"
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-sand">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
                      </button>
                    </div>
                  ))}
                  {photos.length < 6 && (
                    <label className={`flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-sand-4 text-[12px] text-stone hover:border-ink ${uploading ? 'opacity-60' : ''}`}>
                      <span className="material-symbols-outlined text-[22px]" aria-hidden="true">{uploading ? 'progress_activity' : 'add_a_photo'}</span>
                      {uploading ? 'Adding' : 'Add'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" className="sr-only" disabled={uploading} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              </div>

              <label className="flex flex-col gap-1.5 text-[15px] font-semibold">
                Tell us what happened
                <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 1000))} rows={3} className="field font-normal"
                  placeholder={changeOfMind ? 'e.g. Ordered 2 boxes too many, both still sealed' : 'e.g. 2 sheets have broken corners, noticed while unloading'} />
              </label>

              {changeOfMind ? (
                <p className="rounded-xl bg-sand-3 px-3 py-2 text-[14px]">For a change of mind, the items must be sealed and unused. You get a refund, less the cost of the return trip.</p>
              ) : (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-[15px] font-semibold">What would you like?</legend>
                  <div className="flex flex-wrap gap-2">
                    {([['REPLACEMENT', 'Replace the items'], ['REFUND', 'Refund my money']] as const).map(([v, l]) => (
                      <button key={v} type="button" role="radio" aria-checked={want === v} onClick={() => setWant(v)}
                        className={`rounded-full px-4 py-2 text-[14px] font-medium ${want === v ? 'bg-ink text-sand' : 'border border-sand-4 hover:border-ink'}`}>{l}</button>
                    ))}
                  </div>
                </fieldset>
              )}

              {refund && (
                <label className="flex flex-col gap-1.5 text-[15px] font-semibold">
                  Your UPI ID for the refund
                  <input value={upiId} onChange={(e) => setUpiId(e.target.value.slice(0, 80))} className="field font-normal" placeholder="name@okbank" autoComplete="off" inputMode="email" />
                  <span className="text-[13px] font-normal text-stone">If the refund is approved, it reaches this UPI ID within 3 working days.</span>
                </label>
              )}

              {error && <p role="alert" className="text-[14px] text-error">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setFormOpen(false)} className="btn-ghost">Cancel</button>
                <button type="button" disabled={!valid || busy} onClick={send} className="btn-ink px-6">{busy ? 'Sending' : 'Send report'}</button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
