import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { seedUser, seedSupplier, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Category } from '../src/infrastructure/database/models/Category.model';
import { CatalogItem } from '../src/infrastructure/database/models/CatalogItem.model';
import { Product } from '../src/infrastructure/database/models/Product.model';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

let supplier: Awaited<ReturnType<typeof seedSupplier>>;
let ppc: Types.ObjectId;
let opc: Types.ObjectId;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  supplier = await seedSupplier('s1');
  const cement = await Category.create({ name: 'Cement', slug: 'cement', commission: { platformDeliveryPercent: 0 } });
  await Category.create({ name: 'Steel', slug: 'steel' });
  const by = { role: 'ADMIN' as const };
  ppc = (await CatalogItem.create({ name: 'PPC 50 kg', brand: 'UltraTech', slug: 'ultratech-ppc', categoryId: cement._id, unit: 'BAG', gstRate: 28, weightKgPerUnit: 50,
    images: [{ url: 'https://res.cloudinary.com/x/ppc.jpg', publicId: 'x/ppc' }], createdBy: by }))._id;
  opc = (await CatalogItem.create({ name: 'OPC 53 50 kg', brand: 'ACC', slug: 'acc-opc', categoryId: cement._id, unit: 'BAG', gstRate: 28, createdBy: by }))._id;
});

const list = (category?: string) => request(app).get(api(`/suppliers/me/quick-add${category ? `?category=${category}` : ''}`)).set(supplier.headers);
const save = (body: object) => request(app).post(api('/suppliers/me/quick-add')).set(supplier.headers).send(body);

describe('quick add', () => {
  it('lists categories with items, and the chosen category\'s items with weight and photo', async () => {
    const res = await list('cement');
    expect(res.status).toBe(200);
    expect(res.body.data.categories.map((c: { slug: string }) => c.slug)).toEqual(['cement']); // Steel has no items
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items.find((i: { _id: string }) => i._id === String(ppc))).toMatchObject({ brand: 'UltraTech', weightKgPerUnit: 50, image: expect.stringContaining('ppc.jpg'), mine: null });
  });

  it('creates many listings at once from the catalogue, live when in stock', async () => {
    const res = await save({ items: [{ catalogItemId: String(ppc), price: 380, stock: 200 }, { catalogItemId: String(opc), price: 410, stock: 0 }] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ created: 2, updated: 0 });
    const a = (await Product.findOne({ catalogItemId: ppc }).lean())!;
    expect(a).toMatchObject({ name: 'PPC 50 kg', unit: 'BAG', basePrice: 380, stockQuantity: 200, gstRate: 28, isGstInclusive: true, status: 'ACTIVE' });
    expect(a.specifications).toMatchObject({ Brand: 'UltraTech' });
    expect(a.images[0]).toMatchObject({ url: expect.stringContaining('ppc.jpg'), isPrimary: true });
    expect((await Product.findOne({ catalogItemId: opc }).lean())!.status).toBe('OUT_OF_STOCK');

    const again = await list('cement');
    expect(again.body.data.items.find((i: { _id: string }) => i._id === String(ppc)).mine).toMatchObject({ price: 380, stock: 200 });
  });

  it('updates price and stock of items already listed, and revives a discontinued one', async () => {
    await save({ items: [{ catalogItemId: String(ppc), price: 380, stock: 200 }] });
    await Product.updateOne({ catalogItemId: ppc }, { $set: { status: 'DISCONTINUED' } });
    const res = await save({ items: [{ catalogItemId: String(ppc), price: 375, stock: 50 }] });
    expect(res.body.data).toEqual({ created: 0, updated: 1 });
    expect(await Product.countDocuments({ catalogItemId: ppc })).toBe(1);
    expect((await Product.findOne({ catalogItemId: ppc }).lean())!).toMatchObject({ basePrice: 375, stockQuantity: 50, status: 'ACTIVE' });
  });

  it('checks input, saves all or nothing, and is for sellers only', async () => {
    expect((await save({ items: [] })).status).toBe(400);
    expect((await save({ items: [{ catalogItemId: String(ppc), price: 0, stock: 1 }] })).status).toBe(400);
    expect((await save({ items: [{ catalogItemId: String(ppc), price: 380, stock: 1.5 }] })).status).toBe(400);
    expect((await save({ items: [{ catalogItemId: String(ppc), price: 1, stock: 1 }, { catalogItemId: String(ppc), price: 2, stock: 1 }] })).status).toBe(400);
    const bad = await save({ items: [{ catalogItemId: String(ppc), price: 380, stock: 5 }, { catalogItemId: String(new Types.ObjectId()), price: 1, stock: 1 }] });
    expect(bad.status).toBe(400);
    expect(await Product.countDocuments()).toBe(0);
    const buyer = await seedUser('b');
    expect((await request(app).get(api('/suppliers/me/quick-add')).set(buyer.headers)).status).toBe(403);
  });
});
