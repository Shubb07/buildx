'use client';

import { useState } from 'react';
import { downloadFile, useApiClient } from '@sthiva/web-core';

// The supplier's GST invoice for an order (issued when the goods left the supplier)
export function InvoiceButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const client = useApiClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try { await downloadFile(client, `/ops/orders/${orderId}/invoice`, `Invoice-${orderNumber}.pdf`); }
          catch (err) { setError(err instanceof Error ? err.message : 'Could not download the invoice.'); }
          finally { setBusy(false); }
        }}
        className="btn h-10 bg-sand/10 px-4 text-[14px] text-sand hover:bg-sand/20"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">receipt_long</span>
        {busy ? 'Preparing' : 'Invoice PDF'}
      </button>
      {error && <span role="alert" className="text-[13px] text-[#FFB4B6]">{error}</span>}
    </span>
  );
}
