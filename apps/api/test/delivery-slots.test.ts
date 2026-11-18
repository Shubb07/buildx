import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { seedUser, seedSupplier, seedProduct, newKey, SITE, startDb, stopDb, clearDb, makeApp, acceptOffer } from './helpers';
import { Category } from '../src/infrastructure/database/models/Category.model';
import { CatalogItem } from '../src/infrastructure/database/models/CatalogItem.model';
import { Order } from '../src/infrastructure/database/models/Order.model';
import { checkSlot, istDayPlus, slotLabel } from '../src/features/orders/delivery-slots';
import { offerAlert } from '../src/features/orders/offer-alert';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

let buyer: Awaited<ReturnType<typeof seedUser>>;
let s1: Awaited<ReturnType<typeof seedSupplier>>;
let s2: Awaited<ReturnType<typeof seedSupplier>>;
let cat: Types.ObjectId;
let item: Types.ObjectId;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  buyer = await seedUser('buyer');
  s1 = await seedSupplier('s1');
  s2 = await seedSupplier('s2');
  cat = (await Category.create({ name: 'Cement', slug: 'cement', commission: { platformDeliveryPercent: 0 } }))._id;
  item = (await CatalogItem.create({ name: 'PPC 50kg', slug: 'ppc', categoryId: cat, unit: 'BAG', createdBy: { role: 'ADMIN' } }))._id;
});

const listing = (s: typeof s1, extra: Record<string, unknown> = {}) =>
  seedProduct(s.profile._id, { categoryId: cat, catalogItemId: item, gstRate: 0, isGstInclusive: false, deliveryDays: 1, ...extra });
const slot = (days: number, window = 'MORNING') => ({ date: istDayPlus(days), window });
const order = (productId: unknown, deliverySlot?: object) => request(app).post(api('/orders')).set(buyer.headers).set('Idempotency-Key', newKey())
  .send({ items: [{ productId: String(productId), quantity: 2 }], deliveryAddress: SITE, ...(deliverySlot ? { deliverySlot } : {}) });
const quote = (productId: unknown, deliverySlot?: object) => request(app).post(api('/orders/quote')).set(buyer.headers)
  .send({ items: [{ productId: String(productId), quantity: 2 }], deliveryPincode: SITE.pincode, ...(deliverySlot ? { deliverySlot } : {}) });

describe('slot rules', () => {
  it('from tomorrow up to 14 days, a real date and a known window', () => {
    expect(checkSlot({ date: istDayPlus(0), window: 'MORNING' })).toMatch(/from tomorrow/);
    expect(checkSlot({ date: istDayPlus(15), window: 'MORNING' })).toMatch(/14 days/);
    expect(checkSlot({ date: '2026-02-30', window: 'MORNING' })).toMatch(/valid/);
    expect(checkSlot({ date: istDayPlus(2), window: 'NIGHT' as never })).toMatch(/time/);
    expect(checkSlot({ date: istDayPlus(2), window: 'EVENING' })).toBeNull();
    expect(slotLabel({ date: '2026-11-25', window: 'MORNING' })).toBe('Wed, 25 Nov, Morning (7 to 11 am)');
  });
});

describe('ordering with a delivery slot', () => {
  it('the quote says whether slots are possible and from which day', async () => {
    const p = await listing(s1);
    expect((await quote(p._id)).body.data.slots).toEqual({ available: false });
    await listing(s2, { slotDelivery: true, deliveryDays: 3 });
    const q = await quote(p._id);
    expect(q.body.data.slots).toMatchObject({ available: true, earliest: istDayPlus(3), latest: istDayPlus(14) });
  });

  it('a slot order goes only to a seller who offers slots and can make the date', async () => {
    const cheap = await listing(s1, { basePrice: 300 });              // cheaper, no slots
    await listing(s2, { basePrice: 400, slotDelivery: true });         // slots, next-day
    const res = await order(cheap._id, slot(2, 'EVENING'));
    expect(res.status).toBe(201);
    const o = (await Order.findById(res.body.data.orderId).lean())!;
    expect(o.supplierId.toString()).toBe(s2.profile._id.toString());
    expect(o.deliverySlot).toEqual({ date: istDayPlus(2), window: 'EVENING' });

    // Without a slot the cheaper seller still wins
    const plain = await order(cheap._id);
    expect((await Order.findById(plain.body.data.orderId).lean())!.supplierId.toString()).toBe(s1.profile._id.toString());
  });

  it('refuses a slot nobody can make, with a clear message', async () => {
    const p = await listing(s1, { slotDelivery: true, deliveryDays: 4 });
    const tooSoon = await order(p._id, slot(2));
    expect(tooSoon.status).toBe(409);
    expect(tooSoon.body.error.message).toMatch(/in that slot/);
    expect((await order(p._id, slot(0))).status).toBe(400);
  });

  it('accepting confirms the slot date; the seller cannot move it', async () => {
    const p = await listing(s1, { slotDelivery: true });
    const res = await order(p._id, slot(3, 'MIDDAY'));
    const id = res.body.data.orderId;
    await acceptOffer(app, s1, id);
    const o = (await Order.findById(id).lean())!;
    expect(o.status).toBe('CONFIRMED');
    expect(o.deliveryDate).toBe(istDayPlus(3));
    const move = await request(app).patch(api(`/suppliers/me/orders/${id}/delivery-date`)).set(s1.headers).send({ deliveryDate: istDayPlus(5) });
    expect(move.status).toBe(409);
    expect(move.body.error.message).toMatch(/delivery slot/);
  });

  it('a rejected slot order moves only to another slot seller', async () => {
    const a = await listing(s1, { basePrice: 300, slotDelivery: true });
    await listing(s2, { basePrice: 310 }); // no slots: must not get it
    const res = await order(a._id, slot(2));
    const id = res.body.data.orderId;
    await request(app).post(api(`/suppliers/me/orders/${id}/reject`)).set(s1.headers).send({ reason: 'Truck under repair' });
    const o = (await Order.findById(id).lean())!;
    expect(o.allocation?.state).toBe('NEEDS_OPS');
  });

  it('the seller alert names the slot', () => {
    const a = offerAlert({
      orderNumber: 'STV-9', total: 800, deliveryCharge: 0, items: [{ name: 'PPC 50kg', unit: 'BAG', quantity: 2, lineTotal: 800 }],
      deliverySlot: { date: '2026-11-25', window: 'MORNING' },
    }, { canDeliver: false, minutes: 10 });
    expect(a.push.body).toContain('delivery slot Wed, 25 Nov, Morning (7 to 11 am)');
  });
});
