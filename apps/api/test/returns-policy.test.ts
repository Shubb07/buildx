import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { seedUser, seedSupplier, seedProduct, newKey, SITE, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Order } from '../src/infrastructure/database/models/Order.model';
import { Product } from '../src/infrastructure/database/models/Product.model';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

let buyer: Awaited<ReturnType<typeof seedUser>>;
let s1: Awaited<ReturnType<typeof seedSupplier>>;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  buyer = await seedUser('buyer');
  s1 = await seedSupplier('s1');
});

describe('returns set per product by the seller', () => {
  it('the seller sets it, buyers see it, and the order keeps what was promised', async () => {
    const p = await seedProduct(s1.profile._id);
    const edit = (body: object) => request(app).patch(api(`/suppliers/me/products/${p._id}`)).set(s1.headers).send(body);
    expect((await edit({ returnPolicy: { problemWindow: 'H72', changeOfMind: 'NONE' } })).status).toBe(400);
    expect((await edit({ returnPolicy: { problemWindow: 'H48', changeOfMind: 'UNOPENED_7D' } })).status).toBe(200);
    expect((await request(app).get(api(`/products/${p._id}`))).body.returnPolicy).toEqual({ problemWindow: 'H48', changeOfMind: 'UNOPENED_7D' });

    const res = await request(app).post(api('/orders')).set(buyer.headers).set('Idempotency-Key', newKey())
      .send({ items: [{ productId: String(p._id), quantity: 2 }], deliveryAddress: SITE });
    expect(res.status).toBe(201);
    // The seller tightens it later: the order still has the returns promised when ordered
    await edit({ returnPolicy: { problemWindow: 'AT_DELIVERY', changeOfMind: 'NONE' } });
    const o = (await Order.findById(res.body.data.orderId).lean())!;
    expect(o.items[0].returnPolicy).toEqual({ problemWindow: 'H48', changeOfMind: 'UNOPENED_7D' });
  });

  it('new listings start at the strict default: note problems at delivery, no change-of-mind returns', async () => {
    const p = await seedProduct(s1.profile._id);
    expect((await Product.findById(p._id).lean())!.returnPolicy).toEqual({ problemWindow: 'AT_DELIVERY', changeOfMind: 'NONE' });
  });
});
