import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { seedUser, seedSupplier, seedProduct, newKey, SITE, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Category } from '../src/infrastructure/database/models/Category.model';
import { CatalogItem } from '../src/infrastructure/database/models/CatalogItem.model';
import { Order } from '../src/infrastructure/database/models/Order.model';
import { Product } from '../src/infrastructure/database/models/Product.model';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

let buyer: Awaited<ReturnType<typeof seedUser>>;
let s1: Awaited<ReturnType<typeof seedSupplier>>;
let s2: Awaited<ReturnType<typeof seedSupplier>>;
let cat: Types.ObjectId;
let ply: Types.ObjectId;
let hinge: Types.ObjectId;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  buyer = await seedUser('buyer');
  s1 = await seedSupplier('s1');
  s2 = await seedSupplier('s2');
  cat = (await Category.create({ name: 'Interiors', slug: 'interiors', commission: { platformDeliveryPercent: 0 } }))._id;
  const by = { role: 'ADMIN' as const };
  ply = (await CatalogItem.create({ name: 'Plywood 18 mm', slug: 'ply-18', categoryId: cat, unit: 'SHEET', createdBy: by }))._id;
  hinge = (await CatalogItem.create({ name: 'Soft-close hinge', slug: 'hinge', categoryId: cat, unit: 'PIECE', createdBy: by }))._id;
});

const listing = (s: typeof s1, item: Types.ObjectId, extra: Record<string, unknown> = {}) =>
  seedProduct(s.profile._id, { categoryId: cat, catalogItemId: item, gstRate: 0, isGstInclusive: false, ...extra });
const cart = (a: unknown, b: unknown) => [{ productId: String(a), quantity: 20 }, { productId: String(b), quantity: 10 }];
const quote = (items: object[]) => request(app).post(api('/orders/quote')).set(buyer.headers).send({ items });
const place = (items: object[], key = newKey(), extra: object = {}) =>
  request(app).post(api('/orders')).set(buyer.headers).set('Idempotency-Key', key).send({ items, deliveryAddress: SITE, ...extra });

describe('one cart, several sellers', () => {
  it('when nobody has the whole list, the quote splits it into parts with one total', async () => {
    const p = await listing(s1, ply, { basePrice: 2000 });
    const h = await listing(s2, hinge, { basePrice: 150 });
    const q = await quote(cart(p._id, h._id));
    expect(q.status).toBe(200);
    expect(q.body.data.parts).toHaveLength(2);
    expect(q.body.data.parts.map((x: { lines: number[] }) => x.lines)).toEqual([[0], [1]]);
    expect(q.body.data.items.map((i: { part: number }) => i.part)).toEqual([1, 2]);
    expect(q.body.data.total).toBe(20 * 2000 + 10 * 150);
  });

  it('placing it makes one order per seller in a group, takes stock from each, offers each', async () => {
    const p = await listing(s1, ply, { basePrice: 2000, stockQuantity: 50 });
    const h = await listing(s2, hinge, { basePrice: 150, stockQuantity: 40 });
    const key = newKey();
    const res = await place(cart(p._id, h._id), key, { expectedTotal: 41500 });
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(41500);
    expect(res.body.data.orders).toHaveLength(2);

    const orders = await Order.find({ buyerId: buyer.user._id }).sort({ 'orderGroup.part': 1 }).lean();
    expect(orders).toHaveLength(2);
    expect(orders[0].orderGroup).toMatchObject({ part: 1, parts: 2 });
    expect(orders[1].orderGroup!.id).toBe(orders[0].orderGroup!.id);
    expect(orders.map((o) => String(o.supplierId))).toEqual([String(s1.profile._id), String(s2.profile._id)]);
    expect(orders.map((o) => o.allocation?.state)).toEqual(['OFFERED', 'OFFERED']);
    expect((await Product.findById(p._id).lean())!.stockQuantity).toBe(30);
    expect((await Product.findById(h._id).lean())!.stockQuantity).toBe(30);

    // A retry with the same key returns the same group, no new orders or stock taken
    const again = await place(cart(p._id, h._id), key, { expectedTotal: 41500 });
    expect(again.status).toBe(200);
    expect(again.body.data.orders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual(res.body.data.orders.map((o: { orderNumber: string }) => o.orderNumber));
    expect(await Order.countDocuments()).toBe(2);
    expect((await Product.findById(p._id).lean())!.stockQuantity).toBe(30);
  });

  it('a seller who has everything still gets the whole order, not split', async () => {
    const p = await listing(s1, ply, { basePrice: 2000 });
    await listing(s1, hinge, { basePrice: 150 });
    const h2 = await listing(s2, hinge, { basePrice: 140 });
    const res = await place(cart(p._id, h2._id));
    expect(res.status).toBe(201);
    expect(res.body.data.orders).toBeUndefined();
    const o = (await Order.findOne({ buyerId: buyer.user._id }).lean())!;
    expect(o.orderGroup).toBeUndefined();
    expect(String(o.supplierId)).toBe(String(s1.profile._id));
  });

  it('nothing is created if any part fails, and impossible lists are refused clearly', async () => {
    const p = await listing(s1, ply, { basePrice: 2000, stockQuantity: 50 });
    const h = await listing(s2, hinge, { basePrice: 150, stockQuantity: 5 }); // not enough hinges anywhere
    const res = await place(cart(p._id, h._id));
    expect(res.status).toBe(409);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Product.findById(p._id).lean())!.stockQuantity).toBe(50);
    // Price changed since the buyer looked: nothing is made
    await Product.updateOne({ _id: h._id }, { $set: { stockQuantity: 40 } });
    expect((await place(cart(p._id, h._id), newKey(), { expectedTotal: 1 })).status).toBe(409);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('each part moves on its own when its seller rejects', async () => {
    const p = await listing(s1, ply, { basePrice: 2000 });
    const h = await listing(s2, hinge, { basePrice: 150 });
    const res = await place(cart(p._id, h._id));
    const [first, second] = res.body.data.orders;
    const reject = await request(app).post(api(`/suppliers/me/orders/${first.orderId}/reject`)).set(s1.headers).send({ reason: 'No stock today' });
    expect(reject.status).toBe(200);
    expect((await Order.findById(first.orderId).lean())!.allocation?.state).toBe('NEEDS_OPS');
    expect((await Order.findById(second.orderId).lean())!.allocation?.state).toBe('OFFERED');
  });
});
