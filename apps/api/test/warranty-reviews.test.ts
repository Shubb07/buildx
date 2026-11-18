import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { seedUser, seedSupplier, seedProduct, seedOrder, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Category } from '../src/infrastructure/database/models/Category.model';
import { CatalogItem } from '../src/infrastructure/database/models/CatalogItem.model';
import { Product } from '../src/infrastructure/database/models/Product.model';
import { SupplierProfile } from '../src/infrastructure/database/models/SupplierProfile.model';
import { publicName } from '../src/features/reviews/review.controller';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

let buyer: Awaited<ReturnType<typeof seedUser>>;
let s1: Awaited<ReturnType<typeof seedSupplier>>;
let s2: Awaited<ReturnType<typeof seedSupplier>>;
let item: Types.ObjectId;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  buyer = await seedUser('buyer', { name: 'Ravi Kumar' });
  s1 = await seedSupplier('s1');
  s2 = await seedSupplier('s2');
  const cat = await Category.create({ name: 'Plumbing', slug: 'plumbing', commission: { platformDeliveryPercent: 0 } });
  item = (await CatalogItem.create({ name: 'Basin tap', slug: 'basin-tap', categoryId: cat._id, unit: 'PIECE', createdBy: { role: 'ADMIN' } }))._id;
});

describe('warranty on listings', () => {
  it('can be added, shown to buyers, and removed', async () => {
    const p = await seedProduct(s1.profile._id);
    const edit = (body: object) => request(app).patch(api(`/suppliers/me/products/${p._id}`)).set(s1.headers).send(body);
    expect((await edit({ warranty: { months: 0, by: 'SELLER' } })).status).toBe(400);
    expect((await edit({ warranty: { months: 12, by: 'NOBODY' } })).status).toBe(400);
    const res = await edit({ warranty: { months: 12, by: 'MANUFACTURER', note: 'Bill and box needed for claims' } });
    expect(res.status).toBe(200);
    expect(res.body.data.warranty).toEqual({ months: 12, by: 'MANUFACTURER', note: 'Bill and box needed for claims' });
    expect((await request(app).get(api(`/products/${p._id}`))).body.warranty).toMatchObject({ months: 12, by: 'MANUFACTURER' });
    await edit({ warranty: null });
    expect((await Product.findById(p._id).lean())!.warranty).toBeUndefined();
  });
});

describe('buyer reviews', () => {
  async function delivered(supplier: typeof s1, productId: Types.ObjectId) {
    return seedOrder(buyer.user._id, supplier.profile._id, {
      status: 'DELIVERED',
      items: [{ productId, catalogItemId: item, name: 'Basin tap', imageUrl: '', unit: 'PIECE', quantity: 2, pricePerUnit: 500, listPrice: 500, gstRate: 18, isGstInclusive: true, subtotal: 1000, taxableValue: 847.46, gstAmount: 152.54, lineTotal: 1000 }],
    });
  }
  const review = (orderId: unknown, body: object) => request(app).post(api(`/reviews/orders/${orderId}`)).set(buyer.headers).send(body);

  it('shows names as first name and initial', () => {
    expect(publicName('Ravi Kumar')).toBe('Ravi K.');
    expect(publicName('Ravi')).toBe('Ravi');
    expect(publicName('')).toBe('Buyer');
  });

  it('a delivered order can be reviewed once; it rates the seller and the item for every seller', async () => {
    const a = await seedProduct(s1.profile._id, { catalogItemId: item });
    const b = await seedProduct(s2.profile._id, { catalogItemId: item });
    const order = await delivered(s1, a._id);

    expect((await review(order._id, { rating: 6 })).status).toBe(400);
    expect((await review(order._id, { rating: 4, comment: 'x'.repeat(501) })).status).toBe(400);
    const res = await review(order._id, { rating: 4, comment: 'Good taps, on time', onTime: true, asListed: true });
    expect(res.status).toBe(201);
    expect((await review(order._id, { rating: 5 })).status).toBe(409);

    expect((await SupplierProfile.findById(s1.profile._id).lean())!).toMatchObject({ avgRating: 4, totalReviews: 1 });
    // The other seller's listing of the same item shows the item's rating too
    expect((await Product.findById(b._id).lean())!).toMatchObject({ avgRating: 4, totalReviews: 1 });

    const page = await request(app).get(api(`/reviews/products/${b._id}`));
    expect(page.body.data.summary).toEqual({ average: 4, count: 1, onTimePercent: 100, asListedPercent: 100 });
    expect(page.body.data.reviews[0]).toMatchObject({ name: 'Ravi K.', rating: 4, comment: 'Good taps, on time' });
    expect(JSON.stringify(page.body)).not.toContain('Kumar');

    const mine = await request(app).get(api(`/reviews/orders/${order._id}`)).set(buyer.headers);
    expect(mine.body.data).toMatchObject({ rating: 4, onTime: true });
  });

  it('an order that is not delivered, or not yours, cannot be reviewed', async () => {
    const a = await seedProduct(s1.profile._id, { catalogItemId: item });
    const open = await seedOrder(buyer.user._id, s1.profile._id, { status: 'CONFIRMED' });
    expect((await review(open._id, { rating: 5 })).status).toBe(404);
    const other = await seedUser('other');
    const theirs = await seedOrder(other.user._id, s1.profile._id, { status: 'DELIVERED', items: [{ productId: a._id, name: 'x', imageUrl: '', unit: 'PIECE', quantity: 1, pricePerUnit: 1, listPrice: 1, gstRate: 0, isGstInclusive: true, subtotal: 1, taxableValue: 1, gstAmount: 0, lineTotal: 1 }] });
    expect((await review(theirs._id, { rating: 5 })).status).toBe(404);
  });
});
