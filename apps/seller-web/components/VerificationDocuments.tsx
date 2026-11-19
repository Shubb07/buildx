'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useApiClient, useT, tx } from '@sthiva/web-core';
import { getFirebaseAuth } from '../lib/firebase';
import { Pill, shortDate } from './ui';

// Papers Sthiva checks before verifying a supplier: GST certificate (if GST-registered) and a shop
// licence or Udyam certificate. Files are kept private; only Sthiva's team can open them.

const docSchema = z.object({
  type: z.enum(['GST', 'SHOP_LICENSE', 'UDYAM']).or(z.string()),
  label: z.string(),
  status: z.enum(['SUBMITTED', 'ACCEPTED', 'REJECTED']),
  note: z.string().optional(),
  uploadedAt: z.string().optional(),
  expiresOn: z.string().optional(), // YYYY-MM-DD
});
type Doc = z.infer<typeof docSchema>;

const SLOTS = [
  { type: 'GST', title: 'GST certificate', hint: 'Only if your business is GST-registered.' },
  { type: 'SHOP_LICENSE', title: tx('Shop licence'), hint: tx('Shop and establishment or trade licence. Or upload a Udyam certificate below.') },
  { type: 'UDYAM', title: tx('Udyam certificate'), hint: tx('If you have Udyam (MSME) registration instead of a shop licence.') },
] as const;

const STATUS = {
  SUBMITTED: { label: tx('Waiting for Sthiva'), tone: 'wait' as const },
  ACCEPTED: { label: tx('Accepted'), tone: 'done' as const },
  REJECTED: { label: tx('Please upload again'), tone: 'bad' as const },
};

async function call(baseUrl: string, init?: RequestInit) {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error(tx('Sign in again to continue'));
  const res = await fetch(`${baseUrl}/suppliers/me/documents`, { ...init, headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success !== true) throw new Error(json?.error?.message ?? tx('Something went wrong. Try again.'));
  return z.array(docSchema).parse(json.data.documents);
}

const dayDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const STATUS_STEP = {
  PENDING: { label: tx('Being checked'), tone: 'wait' as const, text: tx('Sthiva checks your details and papers, usually within one working day. Buyers see your items once you are verified.') },
  VERIFIED: { label: tx('Verified'), tone: 'done' as const, text: 'Buyers see the Verified badge on your items. Changing your GSTIN means a fresh check.' },
  REJECTED: { label: tx('Not approved'), tone: 'bad' as const, text: tx('Fix what Sthiva asked for below and upload again, or write to support@sthiva.com.') },
};

export function VerificationDocuments({ status, hasGstin }: { status?: 'PENDING' | 'VERIFIED' | 'REJECTED'; hasGstin?: boolean }) {
  const t = useT();
  const client = useApiClient();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Optional "valid until" per paper, sent with the next upload
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

  useEffect(() => {
    call(client.baseUrl).then(setDocs).catch((e) => setError(e instanceof Error ? e.message : t('Couldn’t load your documents.')));
  }, [client]);

  async function upload(type: string, file: File | undefined) {
    if (!file) return;
    setBusy(type);
    setError(null);
    const form = new FormData();
    form.append('type', type);
    if (expiry[type]) form.append('expiresOn', expiry[type]);
    form.append('file', file);
    try {
      setDocs(await call(client.baseUrl, { method: 'POST', body: form }));
      setExpiry((e) => ({ ...e, [type]: '' }));
    }
    catch (e) { setError(e instanceof Error ? e.message : t('Upload failed. Try again.')); }
    finally { setBusy(null); }
  }

  return (
    <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby="docs-title">
      <div>
        <h2 id="docs-title" className="text-[18px] font-semibold">{t('Verification documents')}</h2>
        <p className="mt-1 text-[14px] text-stone">
          {t("Sthiva checks these before giving you the Verified badge. If a paper has an expiry date, Sthiva reminds you a month and a week before it runs out. They are kept private: only Sthiva's team can open them. JPEG, PNG or PDF, up to 5 MB.")}
        </p>
      </div>
      {status && (
        <ol className="grid gap-2 sm:grid-cols-3" aria-label={t('How verification works')}>
          {[
            { n: 1, title: t('Your business'), text: hasGstin ? 'GSTIN added and checked.' : 'Add your GSTIN above if you are GST-registered.', done: true },
            { n: 2, title: t('Your papers'), text: 'GST certificate if registered, and a shop licence or Udyam certificate.', done: docs !== null && docs.some((d) => d.type !== 'GST' && d.status !== 'REJECTED') },
            { n: 3, title: t('Sthiva checks'), text: STATUS_STEP[status].text, done: status === 'VERIFIED' },
          ].map((s) => (
            <li key={s.n} className="rounded-xl border border-sand-4 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-full font-mono text-[12px] ${s.done ? 'bg-lime text-ink' : 'bg-sand-3 text-ink'}`}>{s.n}</span>
                <p className="font-semibold">{t(s.title)}</p>
                {s.n === 3 && <Pill tone={STATUS_STEP[status].tone}>{t(STATUS_STEP[status].label)}</Pill>}
              </div>
              <p className="mt-1 text-[13px] text-stone">{t(s.text)}</p>
            </li>
          ))}
        </ol>
      )}
      {error && <p role="alert" className="text-[14px] text-error">{t(error)}</p>}
      <ul className="flex flex-col gap-3">
        {SLOTS.map((slot) => {
          const doc = docs?.find((d) => d.type === slot.type);
          const st = doc ? STATUS[doc.status] : null;
          return (
            <li key={slot.type} className="flex flex-col gap-2 rounded-xl border border-sand-4 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{t(slot.title)}</p>
                  {st && <Pill tone={st.tone}>{t(st.label)}</Pill>}
                </div>
                <p className="text-[14px] text-stone">
                  {doc?.status === 'REJECTED' && doc.note ? `${t('Sthiva says:')} ${doc.note}` : doc?.uploadedAt ? t('Uploaded {date}', { date: shortDate.format(new Date(doc.uploadedAt)) }) : t(slot.hint)}
                </p>
                {doc?.expiresOn && (() => {
                  const days = Math.round((Date.parse(`${doc.expiresOn}T00:00:00+05:30`) - Date.parse(`${today}T00:00:00+05:30`)) / 86400000);
                  const when = dayDate.format(new Date(`${doc.expiresOn}T00:00:00+05:30`));
                  return (
                    <p className={`text-[14px] ${days <= 30 ? 'font-semibold text-error' : 'text-stone'}`}>
                      {days < 0 ? `Expired on ${when}. Upload the renewed one.` : days <= 30 ? `Valid until ${when}: upload the renewed one soon.` : `Valid until ${when}`}
                    </p>
                  );
                })()}
                {slot.type === 'SHOP_LICENSE' && (
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-[14px]">
                    <span className="text-stone">{t('Valid until (if printed on it)')}</span>
                    <input
                      type="date"
                      min={today}
                      value={expiry[slot.type] ?? ''}
                      onChange={(e) => setExpiry((x) => ({ ...x, [slot.type]: e.target.value }))}
                      className="field h-10 w-auto py-0"
                    />
                  </label>
                )}
              </div>
              <label className={`btn-ghost cursor-pointer self-start ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                {busy === slot.type ? t('Uploading') : doc ? t('Replace') : t('Upload')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  className="sr-only"
                  disabled={!!busy}
                  onChange={(e) => { upload(slot.type, e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
