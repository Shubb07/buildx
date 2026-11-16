'use client';

import { useState } from 'react';
import { downloadFile, useApiClient } from '@sthiva/web-core';

// The GST invoice Sthiva makes in the supplier's name when the goods are sent (supplier bills buyer)
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
          try { await downloadFile(client, `/suppliers/me/orders/${orderId}/invoice`, `Invoice-${orderNumber}.pdf`); }
          catch (err) { setError(err instanceof Error ? err.message : 'Could not download the invoice.'); }
          finally { setBusy(false); }
        }}
        className="btn-ghost h-10 px-3 text-[14px]"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">receipt_long</span>
        {busy ? 'Preparing' : 'Invoice PDF'}
      </button>
      {error && <span role="alert" className="text-[13px] text-error">{error}</span>}
    </span>
  );
}
