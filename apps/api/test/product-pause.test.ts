import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { seedUser, seedSupplier, seedProduct, newKey, SITE, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Category } from '../src/infrastructure/database/models/Category.model';
import { CatalogItem } from '../src/infrastructure/database/models/CatalogItem.model';
import { Order } from '../src/infrastructure/database/models/Order.model';
import { Product } from '../src/infrastructure/database/models/Product.model';
import { istToday } from '../src/features/orders/delivery-window';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;
const dayPlus = (n: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

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
  seedProduct(s.profile._id, { categoryId: cat, catalogItemId: item, gstRate: 0, isGstInclusive: false, ...extra });
const pause = (s: typeof s1, id: unknown, until: string | null) =>
  request(app).post(api(`/suppliers/me/products/${id}/pause`)).set(s.headers).send({ until });
const order = (productId: unknown) => request(app).post(api('/orders')).set(buyer.headers).set('Idempotency-Key', newKey())
  .send({ items: [{ productId: String(productId), quantity: 2 }], deliveryAddress: SITE });

describe('pausing one listing', () => {
  it('checks the date: tomorrow up to 90 days, a real date, own listings only', async () => {
    const p = await listing(s1);
    expect((await pause(s1, p._id, dayPlus(0))).status).toBe(400);
    expect((await pause(s1, p._id, dayPlus(91))).status).toBe(400);
    expect((await pause(s1, p._id, '2026-02-30')).status).toBe(400);
    expect((await pause(s2, p._id, dayPlus(3))).status).toBe(404);
    const ok = await pause(s1, p._id, dayPlus(3));
    expect(ok.status).toBe(200);
    // Back at the start of that day in India
    expect(new Date(ok.body.data.pausedUntil).toISOString()).toBe(new Date(`${dayPlus(3)}T00:00:00+05:30`).toISOString());
  });

  it('a paused listing is hidden; orders go to a seller who can take them', async () => {
    const cheap = await listing(s1, { basePrice: 380 });
    const dear = await listing(s2, { basePrice: 400 });
    await pause(s1, cheap._id, dayPlus(2));

    const list = await request(app).get(api('/products'));
    expect(list.body.products.map((p: { _id: string }) => p._id)).toEqual([dear._id.toString()]);
    expect((await request(app).get(api(`/products/${dear._id}`))).body.sellerCount).toBe(1);

    // Even through the paused seller's own link, the order goes to the other seller
    const res = await order(cheap._id);
    expect(res.status).toBe(201);
    expect((await Order.findById(res.body.data.orderId).lean())!.supplierId.toString()).toBe(s2.profile._id.toString());
    expect((await Product.findById(cheap._id).lean())!.stockQuantity).toBe(100);
  });

  it('when nobody else has it, the page says when it is back and the order is refused clearly', async () => {
    const only = await listing(s1);
    await pause(s1, only._id, dayPlus(4));
    const page = await request(app).get(api(`/products/${only._id}`));
    expect(page.status).toBe(200);
    expect(new Date(page.body.backOn).toISOString()).toBe(new Date(`${dayPlus(4)}T00:00:00+05:30`).toISOString());
    const res = await order(only._id);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/is not available until/);
  });

  it('comes back by itself on the date, and can be resumed early', async () => {
    const p = await listing(s1);
    // A pause that has run out: orderable again without anyone doing anything
    await Product.updateOne({ _id: p._id }, { $set: { pausedUntil: new Date(Date.now() - 60_000) } });
    expect((await order(p._id)).status).toBe(201);

    const q = await listing(s2);
    await pause(s2, q._id, dayPlus(5));
    const resumed = await pause(s2, q._id, null);
    expect(resumed.body.data.pausedUntil).toBeUndefined();
    expect((await request(app).get(api(`/products/${q._id}`))).body.backOn).toBeUndefined();
  });
});
