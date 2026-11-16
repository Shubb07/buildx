import type { ApiClient } from './client';

/**
 * Downloads a signed-in file (an invoice PDF) and saves it with `filename`. A plain link cannot
 * be used because the API needs the bearer token. Errors are ApiClientError with the API's message.
 */
export async function downloadFile(client: ApiClient, path: string, filename: string): Promise<void> {
  const blob = await client.requestFile(path);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Give the browser time to start the download before the link is released
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** Order statuses after which the supplier's GST invoice exists (the goods have left the supplier) */
export const INVOICE_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] as const;
export const hasInvoice = (status: string) => (INVOICE_STATUSES as readonly string[]).includes(status);
