import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { acceptOffer, deliveryCode, offerJobTo, seedDriver, seedProduct, seedSupplier, seedUser, newKey, SITE, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Order } from '../src/infrastructure/database/models/Order.model';
import { clearFinishedLocations } from '../src/features/delivery/tracking';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

async function onTheWay() {
  const buyer = await seedUser('tb1');
  const supplier = await seedSupplier('ts1');
  const driver = await seedDriver('td1');
  const product = await seedProduct(supplier.profile._id);
  const placed = await request(app).post(api('/orders')).set(buyer.headers).set('Idempotency-Key', newKey())
    .send({ items: [{ productId: product._id.toString(), quantity: 2 }], deliveryAddress: SITE });
  const id = placed.body.data.orderId as string;
  await acceptOffer(app, supplier, id);
  await request(app).patch(api(`/suppliers/me/orders/${id}/status`)).set(supplier.headers).send({ status: 'READY_FOR_PICKUP' });
  await offerJobTo(id, driver.user._id);
  expect((await request(app).post(api(`/delivery/orders/${id}/assign`)).set(driver.headers)).status).toBe(200);
  const share = (lat: number, lng: number) => request(app).post(api(`/delivery/orders/${id}/location`)).set(driver.headers).send({ lat, lng, accuracy: 12.4 });
  const track = (who = buyer) => request(app).get(api(`/orders/${id}/tracking`)).set(who.headers);
  const driverStatus = async (status: string) => request(app).patch(api(`/delivery/orders/${id}/status`)).set(driver.headers)
    .send({ status, ...(status === 'DELIVERED' ? { otp: await deliveryCode(id) } : {}) });
  return { id, buyer, driver, share, track, driverStatus };
}

describe('live delivery tracking', () => {
  it('shares the driver position only after pickup, with the distance to the site', async () => {
    const { share, track, driverStatus } = await onTheWay();
    // Assigned but not picked up yet: nothing is shared
    expect((await share(13.3, 77.1)).status).toBe(409);
    expect((await track()).body.data).toMatchObject({ status: 'ASSIGNED', sharing: false });

    await driverStatus('PICKED_UP');
    expect((await share(13.30, 77.10)).body.data).toEqual({ shared: true });
    const t = (await track()).body.data;
    expect(t).toMatchObject({ status: 'PICKED_UP', sharing: true, location: { lat: 13.3, lng: 77.1, accuracy: 12 }, stale: false });
    // SITE is at 13.34, 77.1: about 4.4 km north
    expect(t.distanceKm).toBeGreaterThan(4);
    expect(t.distanceKm).toBeLessThan(5);

    // A second position within 10 seconds is not written
    expect((await share(13.31, 77.10)).body.data).toEqual({ shared: false });
    expect((await track()).body.data.location.lat).toBe(13.3);
  });

  it('is only for the order\'s buyer and driver, and never in the normal order details', async () => {
    const { id, share, track, driverStatus } = await onTheWay();
    await driverStatus('PICKED_UP');
    await share(13.3, 77.1);
    const stranger = await seedUser('tb2');
    expect((await track(stranger)).status).toBe(404);
    const otherDriver = await seedDriver('td2');
    expect((await request(app).post(api(`/delivery/orders/${id}/location`)).set(otherDriver.headers).send({ lat: 13, lng: 77 })).status).toBe(404);
    // Outside India is a broken reading
    expect((await share(51.5, -0.1)).status).toBe(400);
  });

  it('erases the position when the order is delivered', async () => {
    const { id, buyer, share, track, driverStatus } = await onTheWay();
    await driverStatus('PICKED_UP');
    await share(13.3, 77.1);
    expect((await request(app).get(api(`/orders/${id}`)).set(buyer.headers)).body.data.liveLocation).toBeUndefined();
    expect((await driverStatus('DELIVERED')).status).toBe(200);
    expect((await Order.findById(id).lean())!.liveLocation).toBeUndefined();
    expect((await track()).body.data).toMatchObject({ status: 'DELIVERED', sharing: false });
    expect((await share(13.3, 77.1)).status).toBe(409);
  });

  it('sweeps away any position left on an order that is not on the way', async () => {
    const { id } = await onTheWay();
    await Order.updateOne({ _id: id }, { $set: { liveLocation: { lat: 13, lng: 77, at: new Date() } } });
    expect(await clearFinishedLocations()).toBe(1);
    expect((await Order.findById(id).lean())!.liveLocation).toBeUndefined();
  });
});
