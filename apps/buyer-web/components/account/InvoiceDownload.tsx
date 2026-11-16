'use client';

import { useState } from 'react';
import { downloadFile, useApiClient } from '@sthiva/web-core';

// The supplier's GST invoice (or bill of supply) for an order, once the goods have been sent
export function InvoiceDownload({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const client = useApiClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      await downloadFile(client, `/orders/${orderId}/invoice`, `Sthiva-invoice-${orderNumber}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the invoice. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:p-6">
      <span className="material-symbols-outlined text-stone" aria-hidden="true">receipt_long</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Invoice</p>
        <p className="text-[14px] text-stone">Issued by the supplier when your materials were sent. PDF, for your records and GST.</p>
        {error && <p role="alert" className="mt-1 text-[14px] text-error">{error}</p>}
      </div>
      <button type="button" onClick={download} disabled={busy} className="btn-ghost shrink-0">
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">download</span>
        {busy ? 'Preparing' : 'Download invoice'}
      </button>
    </section>
  );
}
