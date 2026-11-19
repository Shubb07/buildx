'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { downloadFile, useApiClient, useT, tx } from '@sthiva/web-core';
import { ErrorNote, PageHead, Pill } from '../../../components/ui';
import { getFirebaseAuth } from '../../../lib/firebase';

// Prices and stock for many items at once: download the sheet, edit it in Excel or Google Sheets,
// upload it, check the changes, save. API: features/suppliers/bulk.ts.

const resultSchema = z.object({
  applied: z.boolean(),
  weeklyConfirmed: z.boolean(),
  coversAll: z.boolean(),
  summary: z.object({ rows: z.number(), changed: z.number(), unchanged: z.number(), errors: z.number() }),
  rows: z.array(z.object({
    row: z.number(),
    productId: z.string().optional(),
    name: z.string().optional(),
    changes: z.array(z.object({ field: z.string(), from: z.string(), to: z.string() })),
    errors: z.array(z.string()),
  })),
});
type Result = z.infer<typeof resultSchema>;

async function sendSheet(baseUrl: string, file: File, apply: boolean): Promise<Result> {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error(tx('Sign in again to continue'));
  const form = new FormData();
  form.append('apply', String(apply));
  form.append('file', file);
  const res = await fetch(`${baseUrl}/suppliers/me/bulk`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success !== true) throw new Error(json?.error?.message ?? tx('Something went wrong. Try again.'));
  return resultSchema.parse(json.data);
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-labelledby={`bulk-step-${n}`}>
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink font-mono text-[13px] text-lime">{n}</span>
        <h2 id={`bulk-step-${n}`} className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function BulkPage() {
  const t = useT();
  const client = useApiClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<'download' | 'check' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'download' | 'check' | 'save', action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : t('Something went wrong. Try again.')); } finally { setBusy(null); }
  }

  const download = () => run('download', () => downloadFile(client, '/suppliers/me/bulk.xlsx', `Sthiva-items-${new Date().toISOString().slice(0, 10)}.xlsx`));
  const check = (f: File) => run('check', async () => { setResult(null); setResult(await sendSheet(client.baseUrl, f, false)); });
  const save = () => file && run('save', async () => setResult(await sendSheet(client.baseUrl, file, true)));

  const changedRows = result?.rows.filter((r) => r.changes.length && !r.errors.length) ?? [];
  const wrongRows = result?.rows.filter((r) => r.errors.length) ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHead eyebrow="Many items at once" title="Excel sheet">
        <Link href="/stock" className="btn-ghost self-start sm:self-auto">{t('One by one instead')}</Link>
      </PageHead>
      <p className="-mt-2 text-[16px] text-stone">
        Change prices, stock, minimum order, HSN codes, or pause items, for all your items in one go. Works with Excel or Google Sheets.
      </p>

      <Step n={1} title={t('Download your items')}>
        <p className="text-[15px] text-stone">{t('The sheet lists everything you sell. Only change the white columns. Leave the Listing ID as it is.')}</p>
        <button type="button" onClick={download} disabled={!!busy} className="btn-ink self-start px-6">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">download</span>
          {busy === 'download' ? t('Preparing') : t('Download sheet')}
        </button>
      </Step>

      <Step n={2} title={t('Upload the edited sheet')}>
        <p className="text-[15px] text-stone">{t('Save it as .xlsx (or .csv) and choose it here. Nothing changes yet: you will see every change first.')}</p>
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setFile(f); check(f); } }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => input.current?.click()} disabled={!!busy} className="btn-ghost px-6">
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">upload_file</span>
            {busy === 'check' ? t('Checking') : file ? t('Choose another file') : t('Choose file')}
          </button>
          {file && <span className="truncate text-[14px] text-stone">{file.name}</span>}
        </div>
      </Step>

      {error && <ErrorNote>{t(error)}</ErrorNote>}

      {result && (
        <Step n={3} title={result.applied ? t('Saved') : t('Check and save')}>
          {result.applied ? (
            <div role="status" className="flex flex-col gap-2 rounded-xl bg-lime/40 p-4 text-[15px]">
              <p className="font-semibold">{result.summary.changed ? `${result.summary.changed} item${result.summary.changed === 1 ? '' : 's'} updated.` : t('Everything was already up to date.')}</p>
              {result.weeklyConfirmed && <p>{t('This also counts as your weekly check for this week.')}</p>}
              <Link href="/products" className="font-semibold text-cobalt hover:underline">{t('See your products')}</Link>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Pill tone={result.summary.changed ? 'active' : 'muted'}>{result.summary.changed} to change</Pill>
                <Pill tone="muted">{result.summary.unchanged} unchanged</Pill>
                {result.summary.errors > 0 && <Pill tone="bad">{result.summary.errors} with mistakes</Pill>}
              </div>

              {wrongRows.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-[15px] font-semibold text-error">{t('Fix these rows in the sheet, then upload it again')}</h3>
                  <ul className="flex flex-col divide-y divide-sand-4 rounded-xl border border-error/40">
                    {wrongRows.map((r) => (
                      <li key={r.row} className="p-3 text-[14px]">
                        <p><span className="font-mono text-stone">Row {r.row}</span> · <span className="font-semibold">{r.name || t('Unknown item')}</span></p>
                        <ul className="mt-1 list-disc pl-5 text-error">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {changedRows.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-[15px] font-semibold">{t('Changes')}</h3>
                  <ul className="flex flex-col divide-y divide-sand-4 rounded-xl border border-sand-4">
                    {changedRows.map((r) => (
                      <li key={r.row} className="p-3 text-[14px]">
                        <p className="font-semibold">{r.name}</p>
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {r.changes.map((c) => (
                            <li key={c.field}>
                              <span className="text-stone">{c.field}:</span> <s className="text-stone">{c.from}</s> <span aria-hidden="true">→</span><span className="sr-only">to</span> <span className="font-semibold">{c.to}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.coversAll && !wrongRows.length && (
                <p className="text-[14px] text-stone">{t('Every item you list is in this sheet, so saving it also counts as your weekly check.')}</p>
              )}
              <button type="button" onClick={save} disabled={!!busy || wrongRows.length > 0} className="btn-lime self-start px-7">
                {busy === 'save' ? t('Saving') : wrongRows.length ? t('Fix the mistakes first') : result.summary.changed ? `Save ${result.summary.changed} change${result.summary.changed === 1 ? '' : 's'}` : t('Confirm, nothing changed')}
              </button>
            </>
          )}
        </Step>
      )}
    </div>
  );
}
