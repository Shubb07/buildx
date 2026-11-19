import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createHmac } from 'crypto';
import { seedUser, seedSupplier, seedOrder, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Order } from '../src/infrastructure/database/models/Order.model';
import { SupplierProfile } from '../src/infrastructure/database/models/SupplierProfile.model';
import { WalletEntry } from '../src/infrastructure/database/models/WalletEntry.model';
import { PlatformSettings } from '../src/infrastructure/database/models/PlatformSettings.model';
import { setRazorpayCaller } from '../src/shared/services/razorpay';
import { orderAmounts } from '../src/features/settlements/settlement.service';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

let buyer: Awaited<ReturnType<typeof seedUser>>;
let seller: Awaited<ReturnType<typeof seedSupplier>>;
let operator: Awaited<ReturnType<typeof seedUser>>;
let admin: Awaited<ReturnType<typeof seedUser>>;

// Seller asks 1000; buyer pays 1100. Commission 100 if Sthiva delivers (10%), 50 if the seller does (5%).
const line = {
  name: 'Cement', imageUrl: '', unit: 'BAG', quantity: 1, pricePerUnit: 1100, listPrice: 1100,
  gstRate: 0, isGstInclusive: true, subtotal: 1100, taxableValue: 1100, gstAmount: 0, lineTotal: 1100,
  supplierUnitPrice: 1000, supplierLineTotal: 1000, commissionPercent: 10, supplierDeliveryPercent: 5,
};

const offered = () => seedOrder(buyer.user._id, seller.profile._id, {
  items: [line], subtotal: 1100, gstAmount: 0, total: 1100, status: 'PENDING', inventoryState: 'DEDUCTED',
  allocation: { state: 'OFFERED', attempts: [{ supplierId: seller.profile._id, offeredAt: new Date() }] },
});

const accept = (id: unknown) => request(app).post(api(`/suppliers/me/orders/${id}/accept`)).set(seller.headers).send({});
const wallet = async () => (await request(app).get(api('/suppliers/me/wallet')).set(seller.headers)).body.data;
const setBalance = (rupees: number) => SupplierProfile.updateOne({ _id: seller.profile._id }, { $set: { walletBalancePaise: rupees * 100 } });
const turnOn = () => PlatformSettings.updateOne({ key: 'default' }, { $set: { sellerWalletEnabled: true } }, { upsert: true });
const waitFor = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 50; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 20)); }
  throw new Error('timed out');
};

// A pretend Razorpay: orders and payments kept in memory
type Pay = { id: string; order_id: string; amount: number; currency: string; status: string; method: string };
let rzpOrders: Map<string, number>;
let rzpPayments: Map<string, Pay>;
let calls: string[];
function fakeRazorpay() {
  let n = 0;
  rzpOrders = new Map(); rzpPayments = new Map(); calls = [];
  setRazorpayCaller(async (method, path, body) => {
    calls.push(`${method} ${path}`);
    if (method === 'POST' && path === '/orders') {
      const id = `order_${++n}`;
      rzpOrders.set(id, (body as { amount: number }).amount);
      return { id, amount: (body as { amount: number }).amount, currency: 'INR' };
    }
    const m = path.match(/^\/payments\/([^/]+)(\/capture)?$/);
    if (m) {
      const p = rzpPayments.get(m[1]);
      if (!p) throw new Error('no such payment');
      if (m[2]) p.status = 'captured';
      return p;
    }
    throw new Error(`unexpected ${method} ${path}`);
  });
}
/** The buyer of a top-up pays it on Razorpay; returns what Checkout hands back to the browser. */
function pay(orderId: string, status = 'captured', amount?: number) {
  const id = `pay_${orderId}`;
  rzpPayments.set(id, { id, order_id: orderId, amount: amount ?? rzpOrders.get(orderId)!, currency: 'INR', status, method: 'upi' });
  const signature = createHmac('sha256', 'test-secret-not-real').update(`${orderId}|${id}`).digest('hex');
  return { razorpayOrderId: orderId, razorpayPaymentId: id, razorpaySignature: signature };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  fakeRazorpay();
  buyer = await seedUser('buyer');
  seller = await seedSupplier('seller');
  operator = await seedUser('operator', { role: 'OPERATOR' });
  admin = await seedUser('admin', { role: 'ADMIN' });
});
afterEach(() => setRazorpayCaller(null));

describe('commission from the seller balance', () => {
  it('is not used while the switch is off: accepting works with no balance', async () => {
    const o = await offered();
    expect((await accept(o._id)).status).toBe(200);
    expect((await Order.findById(o._id).lean())!.walletCommissionPaise).toBeUndefined();
    expect(await WalletEntry.countDocuments()).toBe(0);
  });

  it('takes the Sthiva-delivers commission on accept', async () => {
    await turnOn();
    await setBalance(1000);
    const o = await offered();
    expect((await accept(o._id)).status).toBe(200);
    expect((await Order.findById(o._id).lean())!.walletCommissionPaise).toBe(10000);
    const w = await wallet();
    expect(w).toMatchObject({ balance: 900, enabled: true });
    expect(w.entries[0]).toMatchObject({ type: 'COMMISSION', amount: -100, balanceAfter: 900, orderNumber: o.orderNumber });
  });

  it('with too little balance the order is not accepted and the seller is told how much to add', async () => {
    await turnOn();
    await setBalance(40);
    const o = await offered();
    const res = await accept(o._id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(res.body.error.details).toEqual({ commission: 100, balance: 40, shortBy: 60 });
    // Untouched: still offered to them, nothing taken
    const after = (await Order.findById(o._id).lean())!;
    expect(after).toMatchObject({ status: 'PENDING', allocation: { state: 'OFFERED' } });
    expect((await wallet()).balance).toBe(40);
    // Top up, then accept the same offer
    await setBalance(140);
    expect((await accept(o._id)).status).toBe(200);
    expect((await wallet()).balance).toBe(40);
  });

  it('accepting twice takes the commission once', async () => {
    await turnOn();
    await setBalance(1000);
    const o = await offered();
    await Promise.all([accept(o._id), accept(o._id)]);
    expect((await accept(o._id)).status).toBe(200);
    expect((await wallet()).balance).toBe(900);
    expect(await WalletEntry.countDocuments({ type: 'COMMISSION' })).toBe(1);
  });

  it('gives back the difference when the seller delivers themselves, once', async () => {
    await turnOn();
    await setBalance(1000);
    const o = await offered();
    await accept(o._id);
    const dispatch = await request(app).patch(api(`/suppliers/me/orders/${o._id}/status`)).set(seller.headers).send({ status: 'IN_TRANSIT' });
    expect(dispatch.status).toBe(200);
    await waitFor(async () => (await Order.findById(o._id).lean())!.walletCommissionPaise === 5000);
    expect((await wallet()).balance).toBe(950);
    expect(await WalletEntry.countDocuments({ type: 'COMMISSION_RETURN' })).toBe(1);
    // Settlement: commission already paid, so the seller earns the full line
    const order = (await Order.findById(o._id).lean())!;
    expect(orderAmounts({ ...order, deliveryMode: 'SUPPLIER' } as never).supplier.earned).toBe(110000);
  });

  it('comes back in full when the buyer cancels, but not when the seller cancels', async () => {
    await turnOn();
    await setBalance(1000);
    const a = await offered();
    await accept(a._id);
    expect((await request(app).post(api(`/orders/${a._id}/cancel`)).set(buyer.headers).send({ reason: 'Changed plans' })).status).toBe(200);
    expect((await wallet()).balance).toBe(1000);
    expect((await Order.findById(a._id).lean())!.walletCommissionPaise).toBe(0);

    const b = await offered();
    await accept(b._id);
    const res = await request(app).patch(api(`/suppliers/me/orders/${b._id}/status`)).set(seller.headers).send({ status: 'CANCELLED', reason: 'Out of stock' });
    expect(res.status).toBe(200);
    expect((await wallet()).balance).toBe(900);
  });

  it('settlement with a Sthiva driver: earns the full line when commission was paid from the balance', async () => {
    const order = await seedOrder(buyer.user._id, seller.profile._id, {
      items: [line], subtotal: 1100, gstAmount: 0, total: 1100, status: 'DELIVERED', deliveryMode: 'PLATFORM', walletCommissionPaise: 10000,
    });
    expect(orderAmounts(order.toObject() as never).supplier.earned).toBe(110000);
    // Without the balance (old orders), commission comes off the payout as before
    const old = await seedOrder(buyer.user._id, seller.profile._id, { items: [line], subtotal: 1100, gstAmount: 0, total: 1100, status: 'DELIVERED', deliveryMode: 'PLATFORM' });
    expect(orderAmounts(old.toObject() as never).supplier.earned).toBe(100000);
  });
});

describe('top-ups', () => {
  const start = (amount: number) => request(app).post(api('/suppliers/me/wallet/topups')).set(seller.headers).send({ amount });
  const verify = (body: object) => request(app).post(api('/suppliers/me/wallet/topups/verify')).set(seller.headers).send(body);

  it('has a minimum from settings (Rs 1,000)', async () => {
    const res = await start(500);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('1,000');
  });

  it('credits the full amount once Razorpay confirms it, only once', async () => {
    const s = await start(2000);
    expect(s.status).toBe(201);
    expect(s.body.data).toMatchObject({ keyId: 'rzp_test_notreal', amount: 200000, currency: 'INR' });
    const paid = pay(s.body.data.razorpayOrderId);
    const v = await verify(paid);
    expect(v.status).toBe(200);
    expect(v.body.data).toMatchObject({ credited: true, amount: 2000, wallet: { balance: 2000 } });
    expect(v.body.data.wallet.entries[0]).toMatchObject({ type: 'TOPUP', amount: 2000 });
    // Browser retries and the webhook arriving later don't add it again
    expect((await verify(paid)).body.data.credited).toBe(false);
    const event = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paid.razorpayPaymentId, order_id: paid.razorpayOrderId } } } });
    const sig = createHmac('sha256', 'test-webhook-secret').update(event).digest('hex');
    expect((await request(app).post(api('/payments/webhook')).set('Content-Type', 'application/json').set('x-razorpay-signature', sig).send(event)).status).toBe(200);
    expect((await wallet()).balance).toBe(2000);
  });

  it('the webhook alone credits it when the browser never comes back', async () => {
    const s = await start(1000);
    const paid = pay(s.body.data.razorpayOrderId);
    const event = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paid.razorpayPaymentId, order_id: paid.razorpayOrderId } } } });
    const bad = await request(app).post(api('/payments/webhook')).set('Content-Type', 'application/json').set('x-razorpay-signature', 'nope').send(event);
    expect(bad.status).toBe(400);
    const sig = createHmac('sha256', 'test-webhook-secret').update(event).digest('hex');
    expect((await request(app).post(api('/payments/webhook')).set('Content-Type', 'application/json').set('x-razorpay-signature', sig).send(event)).status).toBe(200);
    expect((await wallet()).balance).toBe(1000);
  });

  it('refuses a forged signature, a wrong amount, or an unfinished payment', async () => {
    const s = await start(1000);
    const id = s.body.data.razorpayOrderId;
    const paid = pay(id);
    expect((await verify({ ...paid, razorpaySignature: 'f'.repeat(64) })).status).toBe(400);
    pay(id, 'captured', 100); // paid only Rs 1
    expect((await verify(paid)).status).toBe(400);
    pay(id, 'failed');
    expect((await verify(paid)).status).toBe(409);
    expect((await wallet()).balance).toBe(0);
    // An authorized payment is captured, then credited
    pay(id, 'authorized');
    expect((await verify(paid)).body.data.credited).toBe(true);
    expect(calls).toContain(`POST /payments/${paid.razorpayPaymentId}/capture`);
  });

  it("can't complete another seller's top-up", async () => {
    const s = await start(1000);
    const paid = pay(s.body.data.razorpayOrderId);
    const other = await seedSupplier('other');
    expect((await request(app).post(api('/suppliers/me/wallet/topups/verify')).set(other.headers).send(paid)).status).toBe(404);
  });
});

describe('ops', () => {
  it('sees balances; only an admin adjusts, with a reason, never below zero', async () => {
    await setBalance(300);
    const list = await request(app).get(api('/ops/wallets')).set(operator.headers);
    expect(list.body.data[0]).toMatchObject({ supplierId: String(seller.profile._id), balance: 300 });
    const path = api(`/ops/wallets/${seller.profile._id}/adjust`);
    expect((await request(app).post(path).set(operator.headers).send({ amount: 500, note: 'Paid by bank transfer' })).status).toBe(403);
    expect((await request(app).post(path).set(admin.headers).send({ amount: 500, note: 'x' })).status).toBe(400);
    const add = await request(app).post(path).set(admin.headers).send({ amount: 500, note: 'Paid Rs 500 by bank transfer' });
    expect(add.body.data).toMatchObject({ balance: 800 });
    expect(add.body.data.entries[0]).toMatchObject({ type: 'ADJUSTMENT', amount: 500, note: 'Paid Rs 500 by bank transfer' });
    const tooMuch = await request(app).post(path).set(admin.headers).send({ amount: -900, note: 'Correction of a mistake' });
    expect(tooMuch.status).toBe(409);
    expect((await wallet()).balance).toBe(800);
  });

  it('settings show and change the payment switches', async () => {
    const get = await request(app).get(api('/ops/settings')).set(admin.headers);
    expect(get.body.data).toMatchObject({ sellerWalletEnabled: false, minTopUpRupees: 1000, onlinePaymentsEnabled: false, prepayDeliveryDiscountPercent: 25, paymentsReady: true });
    const set = await request(app).patch(api('/ops/settings/general')).set(admin.headers).send({ sellerWalletEnabled: true, minTopUpRupees: 2000 });
    expect(set.body.data).toMatchObject({ sellerWalletEnabled: true, minTopUpRupees: 2000 });
  });
});
