'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { useApiClient, useT, tx } from '@sthiva/web-core';
import { EmptyState, ErrorNote, PageHead, Pill, rupees, unitLabel } from '../../../components/ui';

// Buyer problem reports on your delivered orders (API features/problems). Look at the photos and
// reply: agree (you will replace, collect or accept the refund) or say why not. Sthiva's team then
// decides. When you are at fault, the refund (less Sthiva's commission) and the return trip are
// taken from your next payout, as the seller agreement says.

const KIND: Record<string, string> = {
  DAMAGED: tx('Damaged'), SHORT: tx('Fewer than ordered'), WRONG_ITEM: tx('Wrong item'), DEFECTIVE: tx('Not working or faulty'), CHANGE_OF_MIND: tx('Change of mind (sealed items)'),
};

const problemSchema = z.object({
  _id: z.string(), number: z.string(), orderNumber: z.string(), kind: z.string(),
  status: z.enum(['OPEN', 'SELLER_REPLIED', 'RESOLVED', 'REJECTED', 'WITHDRAWN']),
  lines: z.array(z.object({ name: z.string(), unit: z.string(), quantity: z.number(), orderedQuantity: z.number() }).passthrough()),
  description: z.string(), photos: z.array(z.string()), want: z.enum(['REFUND', 'REPLACEMENT']), claimValue: z.number(),
  sellerReply: z.object({ agrees: z.boolean(), note: z.string().optional() }).passthrough().optional(),
  resolution: z.object({ outcome: z.string(), atFault: z.string(), sellerCharge: z.number(), note: z.string() }).passthrough().optional(),
  createdAt: z.string(),
});
type Problem = z.infer<typeof problemSchema>;

function ProblemCard({ p, onChanged }: { p: Problem; onChanged: () => void }) {
  const t = useT();
  const client = useApiClient();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reply(agrees: boolean) {
    setBusy(true);
    setError(null);
    try {
      await client.request(`/suppliers/me/problems/${p._id}/reply`, {
        method: 'POST', auth: true, envelope: true, schema: z.unknown(), body: { agrees, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not send. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const tag = p.status === 'OPEN' ? <Pill tone="wait">{t('Reply needed')}</Pill>
    : p.status === 'SELLER_REPLIED' ? <Pill tone="live">{t('Sthiva is deciding')}</Pill>
    : p.status === 'RESOLVED' ? <Pill tone="done">{t('Closed')}</Pill>
    : <Pill tone="muted">{t('Not accepted')}</Pill>;

  return (
    <li className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {tag}
        <span className="font-semibold">{KIND[p.kind] ? t(KIND[p.kind]) : p.kind}</span>
        <span className="ml-auto font-mono text-[13px] text-stone">{p.number} · order {p.orderNumber}</span>
      </div>
      <ul className="text-[15px]">
        {p.lines.map((l, i) => (
          <li key={i}>{l.quantity.toLocaleString('en-IN')} of {l.orderedQuantity.toLocaleString('en-IN')} {unitLabel(l.unit, l.orderedQuantity)} · {l.name}</li>
        ))}
      </ul>
      <p className="rounded-xl bg-sand-2 px-3 py-2 text-[14px]">Buyer says: {p.description}</p>
      {p.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {p.photos.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" aria-label={t('Open photo full size')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={t("Buyer's photo of the problem")} className="h-24 w-24 rounded-lg object-cover" />
            </a>
          ))}
        </div>
      )}
      <p className="text-[14px] text-stone">
        Buyer wants: {p.want === 'REFUND' ? t('a refund') : t('the items replaced')} · items worth {rupees.format(p.claimValue)} at the buyer&apos;s price
      </p>

      {p.status === 'OPEN' && (
        <div className="flex flex-col gap-3">
          <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} className="field"
            placeholder={t('Your reply, e.g. we will bring 2 new sheets tomorrow, or why you disagree')} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => reply(true)} className="btn-ink px-5">{t('I agree, I will sort it out')}</button>
            <button type="button" disabled={busy || note.trim().length < 5} onClick={() => reply(false)} className="btn-ghost">{t('I disagree')}</button>
          </div>
          <p className="text-[12px] text-stone">To disagree, say why in your reply. If you are at fault, the refund (without Sthiva&apos;s commission) and any return trip come from your next payout.</p>
        </div>
      )}
      {p.sellerReply && <p className="text-[14px]">{p.sellerReply.agrees ? t('You replied: agreed') : t('You replied: disagreed')}{p.sellerReply.note ? `, "${p.sellerReply.note}"` : ''}</p>}
      {p.resolution && (
        <p className="text-[14px]">
          Sthiva decided: {p.resolution.note}
          {p.resolution.sellerCharge > 0 && <span className="font-semibold"> {rupees.format(p.resolution.sellerCharge)} comes off your next payout.</span>}
        </p>
      )}
      {error && <ErrorNote>{t(error)}</ErrorNote>}
    </li>
  );
}

export default function ProblemsPage() {
  const t = useT();
  const client = useApiClient();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ok'; rows: Problem[] }>({ status: 'loading' });
  const load = useCallback(() => {
    client.request('/suppliers/me/problems', { auth: true, envelope: true, schema: z.array(problemSchema) })
      .then((rows) => setState({ status: 'ok', rows }))
      .catch(() => setState({ status: 'error' }));
  }, [client]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHead eyebrow="After delivery" title="Problems reported">
        <p className="max-w-sm text-[15px] text-stone">{t('When a buyer reports damaged, short or wrong items, reply the same day. Fast, fair replies keep your rating up.')}</p>
      </PageHead>
      {state.status === 'loading' && <div className="skeleton h-48" role="status" aria-label={t('Loading')} />}
      {state.status === 'error' && <ErrorNote>{t("Couldn't load problem reports. Check your connection and try again.")}</ErrorNote>}
      {state.status === 'ok' && state.rows.length === 0 && (
        <EmptyState icon="verified" title="No problems reported" body="If a buyer reports a problem with a delivery, it shows here and you get an alert." />
      )}
      {state.status === 'ok' && state.rows.length > 0 && (
        <ul className="flex flex-col gap-4">{state.rows.map((p) => <ProblemCard key={`${p._id}-${p.status}`} p={p} onChanged={load} />)}</ul>
      )}
    </div>
  );
}
