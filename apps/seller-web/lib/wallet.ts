'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { useApiClient, loadRazorpayCheckout, openRazorpayCheckout, PaymentClosed, type ApiClient } from '@sthiva/web-core';

// Sthiva balance: commission is taken from it when the seller accepts an order (apps/api features/wallet).
// Money text stays in English (owner rule).

const entrySchema = z.object({
  id: z.string(),
  type: z.enum(['TOPUP', 'COMMISSION', 'COMMISSION_RETURN', 'ADJUSTMENT']),
  amount: z.number(),
  balanceAfter: z.number(),
  orderId: z.string().optional(),
  orderNumber: z.string().optional(),
  note: z.string().optional(),
  at: z.string(),
});
export type WalletEntry = z.infer<typeof entrySchema>;

export const walletSchema = z.object({
  balance: z.number(),
  enabled: z.boolean(),
  canTopUp: z.boolean(),
  minTopUp: z.number(),
  maxTopUp: z.number(),
  entries: z.array(entrySchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
});
export type Wallet = z.infer<typeof walletSchema>;

export async function fetchWallet(client: ApiClient, page = 1): Promise<Wallet> {
  return client.request(`/suppliers/me/wallet?page=${page}`, { auth: true, envelope: true, schema: walletSchema });
}

const topUpSchema = z.object({
  keyId: z.string(), razorpayOrderId: z.string(), amount: z.number(), currency: z.string(),
  name: z.string(), description: z.string(), businessName: z.string().optional(),
});

/** Tells every balance shown on the site to reload (after accepting an order or topping up). */
export const WALLET_CHANGED = 'sthiva:wallet-changed';
export const walletChanged = () => window.dispatchEvent(new Event(WALLET_CHANGED));

/** The balance, kept fresh: reloads on WALLET_CHANGED and when the tab comes back into view. */
export function useWallet() {
  const client = useApiClient();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    fetchWallet(client).then((w) => { setWallet(w); setError(false); }).catch(() => setError(true));
  }, [client]);
  useEffect(() => {
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener(WALLET_CHANGED, load);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener(WALLET_CHANGED, load); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);
  return { wallet, error, reload: load };
}

// ─── Top-up through Razorpay Checkout (shared with the buyer site: @sthiva/web-core payments) ───

export { PaymentClosed };

/**
 * Tops up the balance: the server creates the Razorpay order, Checkout takes the payment (UPI, card,
 * net banking), then the server confirms it with Razorpay before crediting. Resolves with the new
 * wallet. Rejects with PaymentClosed if the seller closes the window without paying.
 */
export async function topUp(client: ApiClient, amount: number, prefill: { name?: string; contact?: string }): Promise<Wallet> {
  void loadRazorpayCheckout().catch(() => undefined); // start loading while the server makes the order
  const order = await client.request('/suppliers/me/wallet/topups', { method: 'POST', auth: true, envelope: true, schema: topUpSchema, body: { amount } });
  const paid = await openRazorpayCheckout(order, { name: prefill.name ?? order.businessName, contact: prefill.contact });
  const result = await client.request('/suppliers/me/wallet/topups/verify', {
    method: 'POST', auth: true, envelope: true,
    schema: z.object({ credited: z.boolean(), amount: z.number(), wallet: walletSchema }),
    body: paid,
  });
  walletChanged();
  return result.wallet;
}

/** What the wallet rule means for one offer: commission to be taken, and how much is missing. */
export function offerCheck(wallet: Wallet | null, commission: number | undefined) {
  if (!wallet?.enabled || commission === undefined) return null;
  const shortBy = Math.max(0, Math.round((commission - wallet.balance) * 100) / 100);
  return { commission, balance: wallet.balance, shortBy, enough: shortBy === 0 };
}
