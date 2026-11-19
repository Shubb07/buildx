'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { useApiClient, type ApiClient } from '@sthiva/web-core';

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

// ─── Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/) ───

type CheckoutResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void; on: (event: string, fn: (e: { error?: { description?: string } }) => void) => void };
declare global { interface Window { Razorpay?: RazorpayCtor } }

let loading: Promise<RazorpayCtor> | null = null;
function loadCheckout(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Payment window did not load')));
    s.onerror = () => { loading = null; reject(new Error('Could not open the payment window. Check your connection and try again.')); };
    document.head.appendChild(s);
  });
  return loading;
}

export class PaymentClosed extends Error {
  constructor() { super('Payment window closed'); }
}

/**
 * Tops up the balance: creates the Razorpay order on the server, opens Checkout (UPI, card, net
 * banking), then has the server confirm the payment with Razorpay before crediting. Resolves with the
 * new wallet. Rejects with PaymentClosed if the seller closes the window without paying.
 */
export async function topUp(client: ApiClient, amount: number, prefill: { name?: string; contact?: string }): Promise<Wallet> {
  const [Razorpay, order] = await Promise.all([
    loadCheckout(),
    client.request('/suppliers/me/wallet/topups', { method: 'POST', auth: true, envelope: true, schema: topUpSchema, body: { amount } }),
  ]);
  const paid = await new Promise<CheckoutResponse>((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.razorpayOrderId,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      prefill: { name: prefill.name ?? order.businessName, contact: prefill.contact },
      theme: { color: '#1B1B1B' },
      handler: (r: CheckoutResponse) => resolve(r),
      modal: { ondismiss: () => reject(new PaymentClosed()) },
    });
    rzp.on('payment.failed', (e) => reject(new Error(e.error?.description ?? 'The payment did not go through. No money was taken, or it will come back to you.')));
    rzp.open();
  });
  const result = await client.request('/suppliers/me/wallet/topups/verify', {
    method: 'POST', auth: true, envelope: true,
    schema: z.object({ credited: z.boolean(), amount: z.number(), wallet: walletSchema }),
    body: { razorpayOrderId: paid.razorpay_order_id, razorpayPaymentId: paid.razorpay_payment_id, razorpaySignature: paid.razorpay_signature },
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
