import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { seedUser, seedSupplier, seedProduct, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Category } from '../src/infrastructure/database/models/Category.model';
import { CatalogItem } from '../src/infrastructure/database/models/CatalogItem.model';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

let s1: Awaited<ReturnType<typeof seedSupplier>>;
let s2: Awaited<ReturnType<typeof seedSupplier>>;
let ops: Awaited<ReturnType<typeof seedUser>>;
let cat: Types.ObjectId;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  s1 = await seedSupplier('s1');
  s2 = await seedSupplier('s2');
  ops = await seedUser('ops', { role: 'OPERATOR' });
  cat = (await Category.create({ name: 'Plywood', slug: 'plywood', commission: { platformDeliveryPercent: 0 } }))._id;
});

const item = (name: string, extra: Record<string, unknown> = {}) =>
  CatalogItem.create({ name, slug: name.toLowerCase().replace(/\W+/g, '-'), categoryId: cat, unit: 'SHEET', brand: 'Century', createdBy: { role: 'ADMIN' }, ...extra });
const listing = (s: typeof s1, itemId: Types.ObjectId, price: number) =>
  seedProduct(s.profile._id, { categoryId: cat, catalogItemId: itemId, unit: 'SHEET', gstRate: 0, isGstInclusive: true, basePrice: price });

describe('sizes of one product on one page', () => {
  it('ops group items into a family with details; the page lists every size at its best price', async () => {
    const t18 = await item('Sainik MR 18 mm 8x4');
    const t12 = await item('Sainik MR 12 mm 8x4');
    const t6 = await item('Sainik MR 6 mm 8x4');
    const set = (id: unknown, body: object) => request(app).patch(api(`/ops/catalog/${id}`)).set(ops.headers).send(body);
    expect((await set(t18._id, { family: 'x' })).status).toBe(400);
    expect((await set(t18._id, { variant: { a: '1', b: '2', c: '3', d: '4' } })).status).toBe(400);
    for (const [it, th] of [[t18, '18 mm'], [t12, '12 mm'], [t6, '6 mm']] as const) {
      expect((await set(it._id, { family: 'century-sainik-mr', variant: { Thickness: th, Size: '8 x 4 ft' } })).status).toBe(200);
    }
    const p18 = await listing(s1, t18._id, 2400);
    await listing(s2, t18._id, 2300);
    const p12 = await listing(s1, t12._id, 1900);
    // 6 mm: nobody sells it yet

    const page = await request(app).get(api(`/products/${p18._id}`));
    expect(page.body.variants.keys).toEqual(['Thickness', 'Size']);
    const byTh = Object.fromEntries(page.body.variants.options.map((o: { details: { Thickness: string } }) => [o.details.Thickness, o]));
    expect(byTh['18 mm']).toMatchObject({ price: 2300, current: true });
    expect(byTh['12 mm']).toMatchObject({ productId: String(p12._id), price: 1900, current: false });
    expect(byTh['6 mm']).toMatchObject({ productId: null, price: null });
  });

  it('items without a family, or alone in one, have no size options', async () => {
    const a = await item('Plain board');
    const p = await listing(s1, a._id, 1000);
    expect((await request(app).get(api(`/products/${p._id}`))).body.variants).toBeUndefined();
    await CatalogItem.updateOne({ _id: a._id }, { $set: { family: 'only-one' } });
    expect((await request(app).get(api(`/products/${p._id}`))).body.variants).toBeUndefined();
    // and ops can remove a family
    expect((await request(app).patch(api(`/ops/catalog/${a._id}`)).set(ops.headers).send({ family: null, variant: null })).status).toBe(200);
    expect((await CatalogItem.findById(a._id).lean())!.family).toBeUndefined();
  });
});
