import { z } from 'zod';
import { loadRazorpayCheckout, openRazorpayCheckout, type ApiClient, type PaginationMeta } from '@sthiva/web-core';

const quoteLineSchema = z.object({
  productId: z.string(),
  name: z.string(),
  imageUrl: z.string().optional(),
  unit: z.string(),
  quantity: z.number(),
  pricePerUnit: z.number(),
  listPrice: z.number(),
  tierMinQty: z.number().optional(),
  lineTotal: z.number(),
  inStock: z.boolean(),
  stockQuantity: z.number(),
  // Which delivery this line is in, when the cart is split across sellers
  part: z.number().optional(),
});

export const quoteSchema = z.object({
  supplierId: z.string(),
  delivery: z.object({ pincode: z.string(), district: z.string(), state: z.string(), serviceable: z.boolean() }).nullable(),
  items: z.array(quoteLineSchema),
  subtotal: z.number(),
  gstAmount: z.number(),
  deliveryCharge: z.number(),
  // OFF: no delivery charges yet. PRICED: vehicle, weight, distance. UNPRICED: can't order yet, message says why.
  deliveryPricing: z.object({
    status: z.enum(['OFF', 'PRICED', 'UNPRICED']),
    vehicle: z.string().optional(), weightKg: z.number().optional(), distanceKm: z.number().optional(), message: z.string().optional(),
  }).passthrough().optional(),
  total: z.number(),
  // Pay online now and save on delivery (null: only cash on delivery). available false: delivery is
  // confirmed later, so this order can only be paid on delivery.
  payOnline: z.object({ discountPercent: z.number(), deliveryDiscount: z.number(), total: z.number(), available: z.boolean() }).nullable().optional(),
  // Usual delivery time of the listings (days after the supplier accepts)
  expectedDelivery: z.object({ minDays: z.number(), maxDays: z.number() }).optional(),
  // In process until confirmed: something is ordered from the company / made, or no supplier serves the PIN yet
  onOrder: z.boolean().optional(),
  outOfArea: z.boolean().optional(),
  // Can the cart be delivered in a booked slot near this PIN, and from which day
  slots: z.object({ available: z.boolean(), earliest: z.string().optional(), latest: z.string().optional() }).passthrough().optional(),
  // No single seller has everything: one order (and one delivery) per part
  parts: z.array(z.object({
    part: z.number(), items: z.number(), goods: z.number(), deliveryCharge: z.number(), total: z.number(),
    expectedDelivery: z.object({ minDays: z.number(), maxDays: z.number() }).optional(),
  }).passthrough()).optional(),
});
export type Quote = z.infer<typeof quoteSchema>;
export type DeliverySlotInput = { date: string; window: 'MORNING' | 'MIDDAY' | 'EVENING' };

export async function quoteCart(
  client: ApiClient,
  items: { productId: string; quantity: number }[],
  deliveryPincode?: string,
  deliverySlot?: DeliverySlotInput | null
): Promise<Quote> {
  return client.request('/orders/quote', {
    method: 'POST',
    auth: true,
    envelope: true,
    schema: quoteSchema,
    body: { items, deliveryPincode, ...(deliverySlot ? { deliverySlot } : {}) },
  });
}

export type DeliveryAddressInput = {
  label: string;
  fullAddress: string;
  pincode?: string;
  contactPhone: string;
};

const placeOrderResultSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  subtotal: z.number(),
  gstAmount: z.number(),
  total: z.number(),
  status: z.string(),
  replayed: z.boolean(),
  // Present when the cart became several orders (one per seller)
  orders: z.array(z.object({ orderId: z.string(), orderNumber: z.string(), total: z.number(), part: z.number().optional() })).optional(),
});
export type PlaceOrderResult = z.infer<typeof placeOrderResultSchema>;

export async function placeOrder(
  client: ApiClient,
  input: {
    items: { productId: string; quantity: number }[];
    deliveryAddress: DeliveryAddressInput;
    expectedTotal?: number;
    notes?: string;
    // Optional GST invoice: the supplier bills this GSTIN
    buyerGst?: { gstin: string; businessName: string };
    // Optional booked delivery slot (only sellers who offer slots get the order)
    deliverySlot?: DeliverySlotInput;
  },
  idempotencyKey: string
): Promise<PlaceOrderResult> {
  return client.request('/orders', {
    method: 'POST',
    auth: true,
    envelope: true,
    schema: placeOrderResultSchema,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: input,
  });
}

const payStartSchema = z.object({
  keyId: z.string(), razorpayOrderId: z.string(), amount: z.number(), currency: z.string(), name: z.string(), description: z.string(),
  total: z.number(), deliveryDiscount: z.number(), contact: z.string().optional(),
});

/**
 * Pays online first, then the order is placed (apps/api features/payments/online.service.ts): the server
 * prices the checkout, Razorpay Checkout takes the payment, the server confirms it with Razorpay and makes
 * the order. If the order can't be made after paying, the server refunds it and the error says so.
 * Rejects with PaymentClosed (from @sthiva/web-core) if the buyer closes the payment window.
 */
export async function payOnlineAndPlace(
  client: ApiClient,
  input: Parameters<typeof placeOrder>[1],
  prefill: { name?: string; email?: string }
): Promise<PlaceOrderResult> {
  void loadRazorpayCheckout().catch(() => undefined); // start loading while the server prices the order
  const order = await client.request('/orders/pay-online', { method: 'POST', auth: true, envelope: true, schema: payStartSchema, body: input });
  const paid = await openRazorpayCheckout(order, { ...prefill, contact: order.contact });
  return client.request('/orders/pay-online/complete', {
    method: 'POST', auth: true, envelope: true,
    schema: placeOrderResultSchema.partial({ subtotal: true, gstAmount: true }),
    body: paid,
  }) as Promise<PlaceOrderResult>;
}

const orderItemSchema = z.object({ name: z.string(), unit: z.string(), quantity: z.number(), lineTotal: z.number() }).passthrough();

export const orderStatusSchema = z.enum([
  'PENDING', 'CONFIRMED', 'READY_FOR_PICKUP', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'DISPUTED',
]);

const statusEventSchema = z.object({
  status: orderStatusSchema,
  at: z.string(),
  byRole: z.enum(['BUYER', 'SUPPLIER', 'DELIVERY_PARTNER', 'OPERATOR', 'ADMIN', 'SYSTEM']),
  note: z.string().optional(),
});

export const orderSchema = z
  .object({
    _id: z.string(),
    orderNumber: z.string(),
    items: z.array(orderItemSchema),
    deliveryAddress: z.object({ label: z.string(), fullAddress: z.string(), contactPhone: z.string() }).passthrough(),
    subtotal: z.number(),
    gstAmount: z.number(),
    total: z.number(),
    status: orderStatusSchema,
    deliveryMode: z.enum(['PLATFORM', 'SUPPLIER']).optional(),
    statusHistory: z.array(statusEventSchema).optional(),
    // Given to whoever delivers; the API sends it only until the order is delivered or cancelled
    deliveryOtp: z.string().optional(),
    // Usual delivery time, then the date the supplier confirmed (YYYY-MM-DD) once they accept
    expectedDelivery: z.object({ minDays: z.number(), maxDays: z.number() }).optional(),
    deliveryDate: z.string().optional(),
    // The slot the buyer booked at checkout, if any
    deliverySlot: z.object({ date: z.string(), window: z.enum(['MORNING', 'MIDDAY', 'EVENING']) }).optional(),
    // Part of a cart split across sellers
    orderGroup: z.object({ id: z.string(), part: z.number(), parts: z.number() }).optional(),
    onOrder: z.boolean().optional(),
    outOfArea: z.boolean().optional(),
    buyerGst: z.object({ gstin: z.string(), businessName: z.string() }).optional(),
    // How it is paid; ONLINE orders are paid already, with any delivery saving shown
    paymentMethod: z.string().optional(),
    paymentStatus: z.string().optional(),
    deliveryDiscount: z.number().optional(),
    refund: z.object({ status: z.enum(['PENDING', 'DONE', 'FAILED']), amount: z.number() }).passthrough().optional(),
    createdAt: z.string(),
  })
  .passthrough();
export type BuyerOrder = z.infer<typeof orderSchema>;

export async function fetchOrders(client: ApiClient, page = 1): Promise<{ data: BuyerOrder[]; meta: PaginationMeta }> {
  return client.requestPage('/orders', { auth: true, envelope: true, schema: z.array(orderSchema), query: { page } });
}

export async function fetchOrder(client: ApiClient, id: string): Promise<BuyerOrder> {
  return client.request(`/orders/${id}`, { auth: true, envelope: true, schema: orderSchema });
}

export async function cancelBuyerOrder(client: ApiClient, id: string, reason?: string): Promise<BuyerOrder> {
  return client.request(`/orders/${id}/cancel`, { method: 'POST', auth: true, envelope: true, schema: orderSchema, body: { reason } });
}

const savedAddressSchema = z.object({
  _id: z.string(), label: z.string(), fullAddress: z.string(), contactPhone: z.string(), pincode: z.string().optional(),
}).passthrough();
export type SavedAddress = z.infer<typeof savedAddressSchema>;

// Checkout prefill from the account (GET /users/me): addresses of earlier orders (newest first)
// and the GSTIN of the last GST invoice order
export async function checkoutPrefill(client: ApiClient): Promise<{ addresses: SavedAddress[]; gst: { gstin: string; businessName: string } | null }> {
  const me = await client.request('/users/me', {
    auth: true, envelope: true,
    schema: z.object({
      gstNumber: z.string().optional(), gstBusinessName: z.string().optional(),
      addresses: z.array(z.unknown()).optional(),
    }).passthrough(),
  });
  // Older entries (mobile app) may lack fields: keep only usable ones
  const addresses = (me.addresses ?? []).flatMap((a) => {
    const r = savedAddressSchema.safeParse(a);
    return r.success && r.data.fullAddress.trim().length >= 5 ? [{ ...r.data, contactPhone: r.data.contactPhone.slice(-10) }] : [];
  });
  return { addresses, gst: me.gstNumber ? { gstin: me.gstNumber, businessName: me.gstBusinessName ?? '' } : null };
}

export async function forgetAddress(client: ApiClient, id: string): Promise<SavedAddress[]> {
  const list = await client.request(`/users/me/addresses/${id}`, { method: 'DELETE', auth: true, envelope: true, schema: z.array(z.unknown()) });
  return list.flatMap((a) => { const r = savedAddressSchema.safeParse(a); return r.success ? [r.data] : []; });
}

// Live tracking (GET /orders/:id/tracking): the driver's latest position while the order is on the way
const trackingSchema = z.object({
  status: z.string(),
  sharing: z.boolean(),
  location: z.object({ lat: z.number(), lng: z.number(), accuracy: z.number().optional(), at: z.string() }).optional(),
  distanceKm: z.number().optional(),
  site: z.object({ lat: z.number(), lng: z.number() }).optional(),
  stale: z.boolean().optional(),
});
export type Tracking = z.infer<typeof trackingSchema>;

export function fetchTracking(client: ApiClient, orderId: string): Promise<Tracking> {
  return client.request(`/orders/${orderId}/tracking`, { auth: true, envelope: true, schema: trackingSchema, cache: 'no-store' });
}
