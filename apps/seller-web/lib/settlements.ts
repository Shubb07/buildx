import { z } from 'zod';
import type { ApiClient } from '@sthiva/web-core';

// Money between Sthiva and the supplier. Shapes mirror apps/api settlement.service.ts (myView).
const lineSchema = z.object({ orderId: z.string(), orderNumber: z.string(), deliveredAt: z.string().optional(), earned: z.number(), cashHeld: z.number() });
export const statementSchema = z
  .object({
    _id: z.string(), number: z.string(), orders: z.array(lineSchema),
    earned: z.number(), cashHeld: z.number(), net: z.number(),
    // Charges for buyer problems you were at fault for (features/problems)
    deductions: z.array(z.object({ number: z.string(), orderNumber: z.string(), amount: z.number() }).passthrough()).optional(), deducted: z.number().optional(),
    status: z.enum(['PENDING', 'PAID', 'CANCELLED']), reference: z.string().optional(), paidTo: z.string().optional(), paidAt: z.string().optional(), createdAt: z.string(),
  })
  .passthrough();
export type Statement = z.infer<typeof statementSchema>;
export const payoutsSchema = z.object({
  balance: z.object({ orders: z.number(), earned: z.number(), cashHeld: z.number(), deducted: z.number().optional(), net: z.number(), waitingForCash: z.number() }).passthrough(),
  settlements: z.array(statementSchema),
});
export type Payouts = z.infer<typeof payoutsSchema>;

export async function fetchPayouts(client: ApiClient): Promise<Payouts> {
  return client.request('/suppliers/me/settlements', { auth: true, envelope: true, schema: payoutsSchema });
}

// ─── Payout account: where Sthiva sends the money (apps/api features/suppliers/payout-account.ts) ───
export const payoutAccountSchema = z.object({
  method: z.enum(['BANK', 'UPI']),
  holderName: z.string(),
  masked: z.string(),
  ifsc: z.string().optional(),
  status: z.enum(['SUBMITTED', 'VERIFIED', 'REJECTED']),
  note: z.string().optional(),
  submittedAt: z.string(),
  reviewedAt: z.string().optional(),
  holdUntil: z.string().optional(),
});
export type PayoutAccount = z.infer<typeof payoutAccountSchema>;
const payoutAccountResponse = z.object({ account: payoutAccountSchema.nullable(), holdHours: z.number().optional() });

export async function fetchPayoutAccount(client: ApiClient): Promise<PayoutAccount | null> {
  return (await client.request('/suppliers/me/payout-account', { auth: true, envelope: true, schema: payoutAccountResponse })).account;
}

/** Multipart, so it goes through fetch directly with the same base URL and token */
export async function savePayoutAccount(baseUrl: string, token: string, fields: Record<string, string>, proof: File | null): Promise<PayoutAccount> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (proof) form.append('file', proof);
  const res = await fetch(`${baseUrl}/suppliers/me/payout-account`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success !== true) throw new Error(json?.error?.message ?? 'Could not save. Check your connection and try again.');
  const account = payoutAccountResponse.parse(json.data).account;
  if (!account) throw new Error('Could not save. Try again.');
  return account;
}
