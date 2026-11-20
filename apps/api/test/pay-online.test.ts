import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createHmac } from 'crypto';
import { seedUser, seedSupplier, seedProduct, SITE, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Category } from '../src/infrastructure/database/models/Category.model';
import { CatalogItem } from '../src/infrastructure/database/models/CatalogItem.model';
import { Order } from '../src/infrastructure/database/models/Order.model';
import { Product } from '../src/infrastructure/database/models/Product.model';
import { SupplierProfile } from '../src/infrastructure/database/models/SupplierProfile.model';
import { VehicleType } from '../src/infrastructure/database/models/VehicleType.model';
import { PlatformSettings } from '../src/infrastructure/database/models/PlatformSettings.model';
import { OnlinePayment } from '../src/infrastructure/database/models/OnlinePayment.model';
import { setRazorpayCaller } from '../src/shared/services/razorpay';
import { orderAmounts } from '../src/features/settlements/settlement.service';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

let buyer: Awaited<ReturnType<typeof seedUser>>;
let seller: Awaited<ReturnType<typeof seedSupplier>>;
let productId: string;

// Pretend Razorpay: orders, payments and refunds in memory
type Pay = { id: string; order_id: string; amount: number; currency: string; status: string; method: string };
let rzpOrders: Map<string, number>;
let rzpPayments: Map<string, Pay>;
let refunds: { paymentId: string; amount: number }[];
let refundsFail = false;
function fakeRazorpay() {
  let n = 0;
  rzpOrders = new Map(); rzpPayments = new Map(); refunds = []; refundsFail = false;
  setRazorpayCaller(async (method, path, body) => {
    if (method === 'POST' && path === '/orders') {
      const id = `order_${++n}`;
      rzpOrders.set(id, (body as { amount: number }).amount);
      return { id, amount: (body as { amount: number }).amount, currency: 'INR' };
    }
    const refund = path.match(/^\/payments\/([^/]+)\/refund$/);
    if (refund) {
      if (refundsFail) throw new Error('Payment service: refund refused');
      refunds.push({ paymentId: refund[1], amount: (body as { amount: number }).amount });
      return { id: `rfnd_${refunds.length}`, status: 'processed' };
    }
    const m = path.match(/^\/payments\/([^/]+)$/);
    if (m && rzpPayments.has(m[1])) return rzpPayments.get(m[1]);
    throw new Error(`unexpected ${method} ${path}`);
  });
}
function pay(orderId: string) {
  const id = `pay_${orderId}`;
  rzpPayments.set(id, { id, order_id: orderId, amount: rzpOrders.get(orderId)!, currency: 'INR', status: 'captured', method: 'upi' });
  const signature = createHmac('sha256', 'test-secret-not-real').update(`${orderId}|${id}`).digest('hex');
  return { razorpayOrderId: orderId, razorpayPaymentId: id, razorpaySignature: signature };
}

const cart = () => ({ items: [{ productId, quantity: 10 }], deliveryAddress: SITE });
const quote = () => request(app).post(api('/orders/quote')).set(buyer.headers).send({ items: cart().items, deliveryLat: SITE.lat, deliveryLng: SITE.lng });
const start = (body: object = cart()) => request(app).post(api('/orders/pay-online')).set(buyer.headers).send(body);
const complete = (body: object) => request(app).post(api('/orders/pay-online/complete')).set(buyer.headers).send(body);
const switchOn = () => PlatformSettings.updateOne({ key: 'default' }, { $set: { onlinePaymentsEnabled: true, driverSharePercent: 80 } }, { upsert: true });
const waitFor = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 50; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 20)); }
  throw new Error('timed out');
};

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  fakeRazorpay();
  buyer = await seedUser('buyer');
  seller = await seedSupplier('seller');
  // Seller at the site itself: distance 0, so delivery is exactly the auto's base fare, Rs 200
  await SupplierProfile.updateOne({ _id: seller.profile._id }, { location: { lat: SITE.lat, lng: SITE.lng } });
  await VehicleType.create({ code: 'AUTO', name: 'Auto', maxLoadKg: 5000, baseFare: 200, perKmRate: 10 });
  const cat = await Category.create({ name: 'Cement', slug: 'cement', commission: { platformDeliveryPercent: 0 } });
  const item = await CatalogItem.create({ name: 'PPC 50kg', slug: 'ppc', categoryId: cat._id, unit: 'BAG', weightKgPerUnit: 50, createdBy: { role: 'ADMIN' } });
  productId = (await seedProduct(seller.profile._id, { categoryId: cat._id, catalogItemId: item._id, basePrice: 400, gstRate: 0, isGstInclusive: false })).id;
});
afterEach(() => setRazorpayCaller(null));

describe('pay online and save on delivery', () => {
  it('is offered only when ops turns it on', async () => {
    expect((await quote()).body.data.payOnline).toBeNull();
    expect((await start()).status).toBe(503);
    await switchOn();
    const q = (await quote()).body.data;
    expect(q).toMatchObject({ deliveryCharge: 200, total: 4200 });
    expect(q.payOnline).toEqual({ discountPercent: 25, deliveryDiscount: 50, total: 4150, available: true });
  });

  it('creates the order only after Razorpay confirms the payment, paid and discounted', async () => {
    await switchOn();
    const s = await start({ ...cart(), expectedTotal: 4150 });
    expect(s.status).toBe(201);
    expect(s.body.data).toMatchObject({ amount: 415000, currency: 'INR', total: 4150, deliveryDiscount: 50 });
    expect(await Order.countDocuments()).toBe(0); // nothing until paid
    expect((await Product.findById(productId).lean())!.stockQuantity).toBe(100);

    const c = await complete(pay(s.body.data.razorpayOrderId));
    expect(c.status).toBe(201);
    const o = (await Order.findById(c.body.data.orderId).lean())!;
    expect(o).toMatchObject({
      paymentMethod: 'ONLINE', paymentStatus: 'CAPTURED', status: 'PENDING', allocation: { state: 'OFFERED' },
      deliveryCharge: 200, deliveryDiscount: 50, total: 4150, razorpayPaymentId: `pay_${s.body.data.razorpayOrderId}`,
    });
    expect((await Product.findById(productId).lean())!.stockQuantity).toBe(90);

    // Sthiva pays the discount: seller and driver are worked out on the full Rs 200
    const mine = await request(app).get(api('/suppliers/me/orders')).set(seller.headers);
    expect(mine.body.data[0].earnings).toMatchObject({ payoutIfYouDeliver: 4200, driverPayout: 160 });
    // Nobody holds the buyer's cash: Sthiva has it
    expect(orderAmounts({ ...o, status: 'DELIVERED', deliveryMode: 'SUPPLIER' } as never).supplier).toEqual({ earned: 420000, cashHeld: 0 });
  });

  it('browser retries and the webhook make one order', async () => {
    await switchOn();
    const s = await start();
    const paid = pay(s.body.data.razorpayOrderId);
    const [a, b] = await Promise.all([complete(paid), complete(paid)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    const event = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paid.razorpayPaymentId, order_id: paid.razorpayOrderId } } } });
    const sig = createHmac('sha256', 'test-webhook-secret').update(event).digest('hex');
    expect((await request(app).post(api('/payments/webhook')).set('Content-Type', 'application/json').set('x-razorpay-signature', sig).send(event)).status).toBe(200);
    expect(await Order.countDocuments()).toBe(1);
    expect((await OnlinePayment.findOne().lean())!.status).toBe('ORDERED');
  });

  it('the webhook makes the order when the buyer never comes back', async () => {
    await switchOn();
    const s = await start();
    const paid = pay(s.body.data.razorpayOrderId);
    const event = JSON.stringify({ event: 'order.paid', payload: { payment: { entity: { id: paid.razorpayPaymentId, order_id: paid.razorpayOrderId } } } });
    const sig = createHmac('sha256', 'test-webhook-secret').update(event).digest('hex');
    expect((await request(app).post(api('/payments/webhook')).set('Content-Type', 'application/json').set('x-razorpay-signature', sig).send(event)).status).toBe(200);
    expect(await Order.countDocuments({ paymentMethod: 'ONLINE', paymentStatus: 'CAPTURED' })).toBe(1);
  });

  it('refunds everything at once when the order cannot be made after paying', async () => {
    await switchOn();
    const s = await start();
    await Product.updateOne({ _id: productId }, { $set: { stockQuantity: 3 } }); // sold out meanwhile
    const c = await complete(pay(s.body.data.razorpayOrderId));
    expect(c.status).toBe(409);
    expect(c.body.error.message).toMatch(/Rs 4,150 is being refunded/);
    expect(refunds).toEqual([{ paymentId: `pay_${s.body.data.razorpayOrderId}`, amount: 415000 }]);
    expect((await OnlinePayment.findOne().lean())!.status).toBe('REFUNDED');
    expect(await Order.countDocuments()).toBe(0);
    // Asking again doesn't refund twice
    expect((await complete(pay(s.body.data.razorpayOrderId))).status).toBe(409);
    expect(refunds).toHaveLength(1);
  });

  it('refuses a forged signature and another buyer', async () => {
    await switchOn();
    const s = await start();
    const paid = pay(s.body.data.razorpayOrderId);
    expect((await complete({ ...paid, razorpaySignature: 'a'.repeat(64) })).status).toBe(400);
    const other = await seedUser('other');
    expect((await request(app).post(api('/orders/pay-online/complete')).set(other.headers).send(paid)).status).toBe(404);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('a cancelled online order is refunded once; a failed refund stays visible for ops', async () => {
    await switchOn();
    const s = await start();
    const c = await complete(pay(s.body.data.razorpayOrderId));
    const id = c.body.data.orderId;
    expect((await request(app).post(api(`/orders/${id}/cancel`)).set(buyer.headers).send({ reason: 'Changed plans' })).status).toBe(200);
    await waitFor(async () => (await Order.findById(id).lean())!.refund?.status === 'DONE');
    expect((await Order.findById(id).lean())!).toMatchObject({ paymentStatus: 'REFUNDED', refund: { amount: 4150, razorpayRefundId: 'rfnd_1' } });
    expect(refunds).toEqual([{ paymentId: `pay_${s.body.data.razorpayOrderId}`, amount: 415000 }]);

    refundsFail = true;
    const s2 = await start();
    const c2 = await complete(pay(s2.body.data.razorpayOrderId));
    await request(app).post(api(`/orders/${c2.body.data.orderId}/cancel`)).set(buyer.headers).send({ reason: 'Changed plans' });
    await waitFor(async () => (await Order.findById(c2.body.data.orderId).lean())!.refund?.status === 'FAILED');
  });

  it('is not available when delivery is not priced yet; only cash on delivery', async () => {
    await switchOn();
    await CatalogItem.updateMany({}, { $unset: { weightKgPerUnit: '' } }); // weight unknown: can't price delivery
    const q = (await quote()).body.data;
    expect(q.deliveryPricing.status).toBe('UNPRICED');
    expect(q.payOnline.available).toBe(false);
    expect((await start()).status).toBe(409);
    expect(await OnlinePayment.countDocuments()).toBe(0);
  });

  it('ops sees failed refunds; only an admin retries, and a good retry clears it', async () => {
    await switchOn();
    refundsFail = true;
    const s = await start();
    const c = await complete(pay(s.body.data.razorpayOrderId));
    const id = c.body.data.orderId;
    await request(app).post(api(`/orders/${id}/cancel`)).set(buyer.headers).send({ reason: 'Changed plans' });
    await waitFor(async () => (await Order.findById(id).lean())!.refund?.status === 'FAILED');
    const operator = await seedUser('operator', { role: 'OPERATOR' });
    const admin = await seedUser('admin', { role: 'ADMIN' });
    const list = await request(app).get(api('/ops/refunds')).set(operator.headers);
    expect(list.body.data.orders).toEqual([expect.objectContaining({ orderId: id, amount: 4150, status: 'FAILED' })]);
    expect((await request(app).post(api(`/ops/orders/${id}/refund-retry`)).set(operator.headers)).status).toBe(403);
    refundsFail = false;
    const retry = await request(app).post(api(`/ops/orders/${id}/refund-retry`)).set(admin.headers);
    expect(retry.body.data).toMatchObject({ ok: true, refund: { status: 'DONE' } });
    expect(refunds).toHaveLength(1);
    expect((await request(app).get(api('/ops/refunds')).set(operator.headers)).body.data.orders).toEqual([]);
    expect((await request(app).post(api(`/ops/orders/${id}/refund-retry`)).set(admin.headers)).status).toBe(409);
  });
});
