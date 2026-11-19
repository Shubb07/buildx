import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { seedUser, seedSupplier, seedProduct, SITE, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Category } from '../src/infrastructure/database/models/Category.model';
import { CatalogItem } from '../src/infrastructure/database/models/CatalogItem.model';
import { Order } from '../src/infrastructure/database/models/Order.model';
import { QuoteRequest } from '../src/infrastructure/database/models/QuoteRequest.model';
import { SupplierProfile } from '../src/infrastructure/database/models/SupplierProfile.model';
import { istToday } from '../src/features/orders/delivery-window';
import { importPostalDirectory } from '../src/features/locations/postal-import';
import { HEADER_RECENT, ROWS_RECENT, csv, chunked } from './fixtures/postal';

const PIN = '572103'; // in the sample postal data

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;
const dayPlus = (n: number) => new Date(Date.parse(`${istToday()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

let buyer: Awaited<ReturnType<typeof seedUser>>;
let s1: Awaited<ReturnType<typeof seedSupplier>>;
let s2: Awaited<ReturnType<typeof seedSupplier>>;
let ply: Types.ObjectId;
let hinge: Types.ObjectId;
let plyListing: Types.ObjectId;
let hingeListing: Types.ObjectId;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  await importPostalDirectory({ source: chunked(csv(HEADER_RECENT, ROWS_RECENT), 100), sourceFile: 'test.csv', version: 'test-1' });
  buyer = await seedUser('buyer');
  s1 = await seedSupplier('s1', { servicePincodes: [PIN] });
  s2 = await seedSupplier('s2', { servicePincodes: [PIN] });
  const cat = await Category.create({ name: 'Interiors', slug: 'interiors', commission: { platformDeliveryPercent: 10 } });
  const by = { role: 'ADMIN' as const };
  ply = (await CatalogItem.create({ name: 'Plywood 18 mm', slug: 'ply-18', categoryId: cat._id, unit: 'SHEET', gstRate: 18, createdBy: by }))._id;
  hinge = (await CatalogItem.create({ name: 'Hinge', slug: 'hinge', categoryId: cat._id, unit: 'PIECE', gstRate: 18, createdBy: by }))._id;
  plyListing = (await seedProduct(s1.profile._id, { categoryId: cat._id, catalogItemId: ply, gstRate: 18, isGstInclusive: true, basePrice: 2500 }))._id;
  hingeListing = (await seedProduct(s2.profile._id, { categoryId: cat._id, catalogItemId: hinge, gstRate: 18, isGstInclusive: true, basePrice: 120 }))._id;
});

const ask = (body: object = {}) => request(app).post(api('/quotes')).set(buyer.headers).send({
  items: [{ productId: String(plyListing), quantity: 200 }, { productId: String(hingeListing), quantity: 400 }],
  deliveryAddress: { ...SITE, pincode: PIN }, neededBy: dayPlus(10), notes: 'Apartment, 12 flats', ...body,
});
const reply = (s: typeof s1, id: string, body: object) => request(app).post(api(`/suppliers/me/quotes/${id}`)).set(s.headers).send(body);

describe('bulk quotes', () => {
  it('a request invites nearby sellers of those items; sellers see the area, not the buyer contact', async () => {
    const res = await ask();
    expect(res.status).toBe(201);
    expect(res.body.data.invitedSupplierIds).toHaveLength(2);
    const seen = await request(app).get(api('/suppliers/me/quotes')).set(s1.headers);
    expect(seen.body.data[0]).toMatchObject({ status: 'OPEN', repliesOpen: true, lines: [{ name: 'Plywood 18 mm', quantity: 200, yourListing: { price: 2500 } }, { name: 'Hinge', yourListing: null }] });
    expect(JSON.stringify(seen.body)).not.toContain('9876500000');
    expect(JSON.stringify(seen.body)).not.toContain(SITE.fullAddress);
    expect((await ask({ neededBy: dayPlus(0) })).status).toBe(400);
  });

  it('replies are compared with commission and GST added; accepting makes a confirmed order', async () => {
    const id = (await ask()).body.data._id;
    expect((await reply(s1, id, { prices: [2300], deliveryDate: dayPlus(5) })).status).toBe(400); // every line
    expect((await reply(s1, id, { prices: [2300, 100], deliveryDate: dayPlus(11) })).status).toBe(400); // after needed-by
    expect((await reply(s1, id, { prices: [2300, 100], deliveryDate: dayPlus(5), deliveryCharge: 1500 })).status).toBe(200);
    expect((await reply(s2, id, { prices: [2400, 90], deliveryDate: dayPlus(7) })).status).toBe(200);

    const view = (await request(app).get(api(`/quotes/${id}`)).set(buyer.headers)).body.data;
    expect(view.replies).toHaveLength(2);
    // s1: (2300 x 1.10 x 200) + (100 x 1.10 x 400) + 1500 = 506000 + 44000 + 1500
    const r1 = view.replies.find((r: { deliveryCharge: number }) => r.deliveryCharge === 1500);
    expect(r1.total).toBe(551500);
    expect(view.replies[0].total).toBeLessThanOrEqual(view.replies[1].total);

    const acc = await request(app).post(api(`/quotes/${id}/accept`)).set(buyer.headers).send({ quoteId: r1.quoteId, expectedTotal: 551500 });
    expect(acc.status).toBe(201);
    const order = (await Order.findById(acc.body.data.orderId).lean())!;
    expect(order).toMatchObject({ status: 'CONFIRMED', total: 551500, deliveryCharge: 1500, deliveryDate: dayPlus(5), inventoryState: 'NONE' });
    expect(String(order.supplierId)).toBe(String(s1.profile._id));
    expect(order.items[0]).toMatchObject({ supplierUnitPrice: 2300, pricePerUnit: 2530, commissionPercent: 10, productId: plyListing });
    expect(order.deliveryAddress.contactPhone).toBe('9876500000');

    const r = (await QuoteRequest.findById(id).lean())!;
    expect(r.status).toBe('ACCEPTED');
    expect(r.quotes.map((q) => q.status).sort()).toEqual(['ACCEPTED', 'NOT_CHOSEN']);
    // Only once
    expect((await request(app).post(api(`/quotes/${id}/accept`)).set(buyer.headers).send({ quoteId: r1.quoteId })).status).toBe(409);
  });

  it('replies close after 48 hours; withdrawn or cancelled requests cannot be accepted', async () => {
    const id = (await ask()).body.data._id;
    await reply(s1, id, { prices: [2300, 100], deliveryDate: dayPlus(5) });
    const q = (await QuoteRequest.findById(id).lean())!.quotes[0];
    expect((await request(app).post(api(`/suppliers/me/quotes/${id}/withdraw`)).set(s1.headers)).status).toBe(200);
    expect((await request(app).post(api(`/quotes/${id}/accept`)).set(buyer.headers).send({ quoteId: String(q._id) })).status).toBe(409);

    await QuoteRequest.updateOne({ _id: id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await reply(s2, id, { prices: [2400, 90], deliveryDate: dayPlus(7) })).status).toBe(409);

    expect((await request(app).post(api(`/quotes/${id}/cancel`)).set(buyer.headers)).status).toBe(200);
    expect((await request(app).get(api('/quotes')).set(buyer.headers)).body.data[0].status).toBe('CANCELLED');
  });

  it('only invited sellers can reply, and only buyers ask', async () => {
    const id = (await ask()).body.data._id;
    const outsider = await seedSupplier('far', { servicePincodes: ['110001'] });
    expect((await reply(outsider, id, { prices: [1, 1], deliveryDate: dayPlus(3) })).status).toBe(404);
    expect((await request(app).post(api('/quotes')).set(s1.headers).send({})).status).toBe(403);
  });
});

describe('made to measure', () => {
  const custom = (body: object = {}) => request(app).post(api('/quotes/custom')).set(buyer.headers).send({
    work: { type: 'fluted-glass', name: 'Fluted and decorative glass', categorySlug: 'glass' },
    pieces: [
      { label: 'Bedroom window', widthMm: 1200, heightMm: 1500, quantity: 2 },
      { label: 'Kitchen partition', widthMm: 900, heightMm: 2100, quantity: 1 },
    ],
    spec: '10 mm toughened fluted glass, clear',
    siteVisit: true,
    deliveryAddress: { ...SITE, pincode: PIN },
    neededBy: dayPlus(14),
    ...body,
  });

  it('goes only to sellers near the site who do that work, with sizes and the site visit flag', async () => {
    expect((await custom()).status).toBe(400); // no such work type
    await Category.create({ name: 'Glass', slug: 'glass', commission: { platformDeliveryPercent: 10 } });
    expect((await custom()).status).toBe(409); // nobody near the site does glass yet
    const glazier = await seedSupplier('glazier', { servicePincodes: [PIN] });
    await SupplierProfile.updateOne({ _id: glazier.profile._id }, { $set: { categories: ['glass'] } });
    expect((await custom({ pieces: [{ label: 'x', widthMm: 10, heightMm: 1500, quantity: 1 }] })).status).toBe(400);

    const res = await custom();
    expect(res.status).toBe(201);
    expect(res.body.data.invitedSupplierIds).toEqual([String(glazier.profile._id)]);
    const seen = (await request(app).get(api('/suppliers/me/quotes')).set(glazier.headers)).body.data[0];
    expect(seen).toMatchObject({ kind: 'CUSTOM', custom: { workName: 'Fluted and decorative glass', siteVisit: true, spec: '10 mm toughened fluted glass, clear' } });
    expect(seen.lines[0]).toMatchObject({ name: 'Fluted and decorative glass: Bedroom window (1200 x 1500 mm)', quantity: 2, widthMm: 1200, heightMm: 1500, unit: 'PIECE' });

    // Price per piece, then the buyer accepts: a confirmed order with the sizes in the item names
    const id = res.body.data._id;
    expect((await request(app).post(api(`/suppliers/me/quotes/${id}`)).set(glazier.headers).send({ prices: [4200, 5600], deliveryDate: dayPlus(10), note: 'Visit on Saturday to measure' })).status).toBe(200);
    const view = (await request(app).get(api(`/quotes/${id}`)).set(buyer.headers)).body.data;
    expect(view.kind).toBe('CUSTOM');
    const reply0 = view.replies[0];
    // (4200 x 2 + 5600) x 1.10 = 15400, GST included
    expect(reply0.total).toBe(15400);
    const acc = await request(app).post(api(`/quotes/${id}/accept`)).set(buyer.headers).send({ quoteId: reply0.quoteId, expectedTotal: 15400 });
    expect(acc.status).toBe(201);
    const order = (await Order.findById(acc.body.data.orderId).lean())!;
    expect(order.status).toBe('CONFIRMED');
    expect(order.items[0].catalogItemId).toBeUndefined();
    expect(order.items.map((i) => i.name)).toEqual(['Fluted and decorative glass: Bedroom window (1200 x 1500 mm)', 'Fluted and decorative glass: Kitchen partition (900 x 2100 mm)']);
    expect(order.notes).toContain('10 mm toughened fluted glass');
  });
});
