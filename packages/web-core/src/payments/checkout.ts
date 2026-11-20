// Razorpay Checkout, shared by the buyer and seller sites
// (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
//
// The server creates the Razorpay order and checks the payment afterwards; this only opens the payment
// window (UPI, card, net banking) and hands back what Razorpay returns, for the server to verify.

export type CheckoutOrder = {
  keyId: string;
  razorpayOrderId: string;
  amount: number; // paise
  currency: string;
  name: string;
  description: string;
};

/** What Checkout returns after a payment; send all three to the server to verify. */
export type CheckoutResult = { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string };

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: Record<string, unknown>) => {
  open: () => void;
  on: (event: string, fn: (e: { error?: { description?: string } }) => void) => void;
};
declare global {
  interface Window { Razorpay?: RazorpayCtor }
}

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<RazorpayCtor> | null = null;

/** Loads checkout.js once. Call it early (e.g. when the payment step opens) so the window opens fast. */
export function loadRazorpayCheckout(): Promise<RazorpayCtor> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Payments need a browser'));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Could not open the payment window. Try again.')));
    s.onerror = () => { loading = null; s.remove(); reject(new Error('Could not open the payment window. Check your connection and try again.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/** The person closed the payment window without paying. Nothing was charged; not an error to show. */
export class PaymentClosed extends Error {
  constructor() {
    super('Payment window closed');
    this.name = 'PaymentClosed';
  }
}

/** Opens Checkout for a server-made order. Resolves once Razorpay says it is paid. */
export async function openRazorpayCheckout(order: CheckoutOrder, prefill: { name?: string; contact?: string; email?: string } = {}): Promise<CheckoutResult> {
  const Razorpay = await loadRazorpayCheckout();
  return new Promise<CheckoutResult>((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.razorpayOrderId,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: order.description,
      prefill,
      theme: { color: '#1B1B1B' },
      handler: (r: RazorpayResponse) => resolve({ razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature }),
      modal: { ondismiss: () => reject(new PaymentClosed()) },
    });
    // A failed attempt keeps the window open so the person can try another way; only closing ends it
    rzp.on('payment.failed', () => undefined);
    rzp.open();
  });
}
