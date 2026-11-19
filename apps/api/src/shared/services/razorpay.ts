// Razorpay, called over its REST API (https://razorpay.com/docs/api/). No SDK: four calls and two
// signature checks are all Sthiva needs, and fewer packages means fewer supply-chain risks.
//
// Keys: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (test keys start rzp_test_, live keys rzp_live_) and
// RAZORPAY_WEBHOOK_SECRET, set only in the server's environment, never in git.

import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import { AppError } from '../errors/AppError';

const BASE = 'https://api.razorpay.com/v1';

export function razorpayReady(): boolean {
  return !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export function razorpayKeyId(): string {
  return env.RAZORPAY_KEY_ID;
}

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number; // paise
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method?: string;
};

// Tests swap this out; production uses fetch
type Caller = (method: 'GET' | 'POST', path: string, body?: unknown) => Promise<unknown>;

const httpCaller: Caller = async (method, path, body) => {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
  if (!res.ok) {
    throw new AppError(`Payment service: ${json.error?.description ?? `HTTP ${res.status}`}`, 'SERVICE_UNAVAILABLE', 502);
  }
  return json;
};

let caller: Caller = httpCaller;

/** For tests only. */
export function setRazorpayCaller(c: Caller | null) {
  caller = c ?? httpCaller;
}

function ensureReady() {
  if (!razorpayReady()) throw new AppError('Online payment is not set up yet', 'SERVICE_UNAVAILABLE', 503);
}

/** A Razorpay order for `amountPaise`. Payments made against it are captured automatically. */
export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  ensureReady();
  return (await caller('POST', '/orders', {
    amount: amountPaise, currency: 'INR', receipt: receipt.slice(0, 40), notes, payment_capture: 1,
  })) as { id: string; amount: number; currency: string };
}

export async function fetchPayment(paymentId: string) {
  ensureReady();
  return (await caller('GET', `/payments/${encodeURIComponent(paymentId)}`)) as RazorpayPayment;
}

/** Captures an authorized payment (needed only if the account does not capture automatically). */
export async function capturePayment(paymentId: string, amountPaise: number) {
  ensureReady();
  return (await caller('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: 'INR' })) as RazorpayPayment;
}

/** Refunds part or all of a captured payment back to where it came from. */
export async function refundPayment(paymentId: string, amountPaise: number, notes: Record<string, string>) {
  ensureReady();
  return (await caller('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes })) as { id: string; status: string };
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The signature Checkout returns after a payment: HMAC-SHA256(order_id|payment_id, key secret). */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
export function webhookSignatureValid(rawBody: Buffer, signature: string | undefined): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

/**
 * The payment, captured, checked against what we expected. Returns it, or throws if it is not a
 * finished payment of exactly `amountPaise` for `orderId`.
 */
export async function confirmPayment(paymentId: string, orderId: string, amountPaise: number): Promise<RazorpayPayment> {
  let p = await fetchPayment(paymentId);
  if (p.order_id !== orderId || p.amount !== amountPaise || p.currency !== 'INR') {
    throw AppError.badRequest('This payment does not match the order');
  }
  if (p.status === 'authorized') p = await capturePayment(paymentId, amountPaise);
  if (p.status !== 'captured') throw AppError.conflict('The payment has not gone through yet');
  return p;
}
