import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { seedUser, seedSupplier, seedProduct, newKey, SITE, startDb, stopDb, clearDb, makeApp } from './helpers';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe('saved delivery addresses', () => {
  it('remembers each order address once, newest first, five at most, and can forget one', async () => {
    const buyer = await seedUser('sa1');
    const supplier = await seedSupplier('ss1');
    const product = await seedProduct(supplier.profile._id, { stockQuantity: 1000 });
    const place = (fullAddress: string, label = 'Site') => request(app).post(api('/orders')).set(buyer.headers).set('Idempotency-Key', newKey())
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }], deliveryAddress: { ...SITE, label, fullAddress } });

    for (const a of ['Plot 1, SIT Road', 'Plot 2, SIT Road', 'Plot 1, SIT Road']) expect((await place(a)).status).toBe(201);
    let me = (await request(app).get(api('/users/me')).set(buyer.headers)).body.data;
    expect(me.addresses.map((x: { fullAddress: string }) => x.fullAddress)).toEqual(['Plot 1, SIT Road', 'Plot 2, SIT Road']);
    expect(me.addresses[0]).toMatchObject({ label: 'Site', contactPhone: '9876500000', lat: 13.34, lng: 77.1 });

    for (const n of [3, 4, 5, 6, 7]) await place(`Plot ${n}, SIT Road`);
    me = (await request(app).get(api('/users/me')).set(buyer.headers)).body.data;
    expect(me.addresses).toHaveLength(5);
    expect(me.addresses[0].fullAddress).toBe('Plot 7, SIT Road');

    const del = await request(app).delete(api(`/users/me/addresses/${me.addresses[0]._id}`)).set(buyer.headers);
    expect(del.status).toBe(200);
    expect(del.body.data).toHaveLength(4);
    expect(del.body.data[0].fullAddress).toBe('Plot 6, SIT Road');
  });
});
