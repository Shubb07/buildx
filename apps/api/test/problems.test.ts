import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { seedUser, seedSupplier, seedOrder, startDb, stopDb, clearDb, makeApp } from './helpers';
import { ProblemReport } from '../src/infrastructure/database/models/ProblemReport.model';
import { addWorkingDays, suggestedSellerCharge } from '../src/features/problems/problem.service';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;
const HOUR = 3_600_000;
const PHOTO = 'https://res.cloudinary.com/demo/image/upload/v1/buildx/problems/crack.jpg';

let buyer: Awaited<ReturnType<typeof seedUser>>;
let other: Awaited<ReturnType<typeof seedUser>>;
let seller: Awaited<ReturnType<typeof seedSupplier>>;
let seller2: Awaited<ReturnType<typeof seedSupplier>>;
let operator: Awaited<ReturnType<typeof seedUser>>;
let admin: Awaited<ReturnType<typeof seedUser>>;

// 10 sheets: seller asks 1000 each, buyer pays 1100 each
const sheet = (returnPolicy?: { problemWindow: string; changeOfMind: string }) => ({
  name: 'BWP plywood 18 mm', imageUrl: '', unit: 'SHEET', quantity: 10, pricePerUnit: 1100, listPrice: 1100,
  gstRate: 0, isGstInclusive: true, subtotal: 11000, taxableValue: 11000, gstAmount: 0, lineTotal: 11000,
  supplierUnitPrice: 1000, supplierLineTotal: 10000, commissionPercent: 10, supplierDeliveryPercent: 5,
  ...(returnPolicy ? { returnPolicy } : {}),
});

function delivered(hoursAgo: number, items = [sheet({ problemWindow: 'H48', changeOfMind: 'UNOPENED_1D' })], extra: Record<string, unknown> = {}) {
  return seedOrder(buyer.user._id, seller.profile._id, {
    items, subtotal: 11000, gstAmount: 0, total: 11000, status: 'DELIVERED', deliveryMode: 'SUPPLIER',
    deliveredAt: new Date(Date.now() - hoursAgo * HOUR), ...extra,
  });
}

const report = (orderId: unknown, body: Record<string, unknown>, who = buyer) =>
  request(app).post(api(`/problems/orders/${orderId}`)).set(who.headers).send({
    kind: 'DAMAGED', lines: [{ index: 0, quantity: 2 }], description: 'Two sheets have cracked corners', photos: [PHOTO], want: 'REFUND', upiId: 'ravi@okaxis',
    ...body,
  });

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  buyer = await seedUser('buyer');
  other = await seedUser('other');
  seller = await seedSupplier('seller');
  seller2 = await seedSupplier('seller2');
  operator = await seedUser('operator', { role: 'OPERATOR' });
  admin = await seedUser('admin', { role: 'ADMIN' });
});

describe('reporting a problem, within what the product promised', () => {
  it('shows the windows per item and takes a report with photos', async () => {
    const o = await delivered(5);
    const view = (await request(app).get(api(`/problems/orders/${o._id}`)).set(buyer.headers)).body.data;
    expect(view.delivered).toBe(true);
    expect(view.lines[0].problemUntil).toBeTruthy();       // 48 hours
    expect(view.lines[0].changeOfMindUntil).toBeTruthy();  // 1 day

    const res = await report(o._id, {});
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'OPEN', claimValue: 2200, kind: 'DAMAGED' });
    expect(res.body.data.lines[0].sellerShare).toBeUndefined();
    // Only one open report per order at a time
    expect((await report(o._id, {})).status).toBe(409);
  });

  it('refuses reports outside the window, before delivery, without photos, or on someone else’s order', async () => {
    expect((await report((await delivered(50))._id, {})).status).toBe(409); // 48 hours passed
    expect((await report((await delivered(1, [sheet({ problemWindow: 'H48', changeOfMind: 'NONE' })], { status: 'IN_TRANSIT' }))._id, {})).status).toBe(409);
    const o = await delivered(1);
    expect((await report(o._id, { photos: [] })).status).toBe(400);
    expect((await report(o._id, { photos: ['https://example.com/x.jpg'] })).status).toBe(400);
    expect((await report(o._id, { lines: [{ index: 0, quantity: 11 }] })).status).toBe(400);
    expect((await report(o._id, { upiId: undefined })).status).toBe(400);
    expect((await report(o._id, {}, other)).status).toBe(404);
  });

  it('"note it at delivery" items can be put on record for 2 hours only; old orders count as that', async () => {
    const strict = [sheet()]; // no returnPolicy on the line: the strict default
    expect((await report((await delivered(1, strict))._id, {})).status).toBe(201);
    const late = await report((await delivered(3, strict))._id, {});
    expect(late.status).toBe(409);
    expect(late.body.error?.message ?? late.body.message).toMatch(/checked at delivery/);
  });

  it('change of mind only where the product allows it, refunded not replaced', async () => {
    const o = await delivered(5);
    const com = { kind: 'CHANGE_OF_MIND', photos: [], description: 'Ordered too many sheets, these are unopened' };
    expect((await report(o._id, { ...com, want: 'REPLACEMENT' })).status).toBe(400);
    expect((await report(o._id, com)).status).toBe(201);
    expect((await report((await delivered(30))._id, com)).status).toBe(409); // 1 day passed
    expect((await report((await delivered(1, [sheet({ problemWindow: 'H48', changeOfMind: 'NONE' })]))._id, com)).status).toBe(409);
  });
});

describe('seller reply and Sthiva’s decision', () => {
  it('seller sees and answers; ops refunds within 3 working days and charges the seller at fault', async () => {
    const o = await delivered(5);
    const id = (await report(o._id, {})).body.data._id;

    const list = (await request(app).get(api('/suppliers/me/problems')).set(seller.headers)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0].upiId).toBeUndefined();
    expect((await request(app).get(api('/suppliers/me/problems')).set(seller2.headers)).body.data).toHaveLength(0);
    expect((await request(app).post(api(`/suppliers/me/problems/${id}/reply`)).set(seller2.headers).send({ agrees: true })).status).toBe(404);
    expect((await request(app).post(api(`/suppliers/me/problems/${id}/reply`)).set(seller.headers).send({ agrees: false })).status).toBe(400);
    expect((await request(app).post(api(`/suppliers/me/problems/${id}/reply`)).set(seller.headers).send({ agrees: true, note: 'Will collect them' })).status).toBe(200);

    // Buyers and sellers cannot decide
    expect((await request(app).post(api(`/ops/problems/${id}/resolve`)).set(seller.headers).send({ outcome: 'REFUND', atFault: 'SELLER', refundAmount: 2200, note: 'ok ok' })).status).toBe(403);
    const tooMuch = await request(app).post(api(`/ops/problems/${id}/resolve`)).set(operator.headers)
      .send({ outcome: 'REFUND', atFault: 'SELLER', refundAmount: 20000, note: 'Cracked on arrival' });
    expect(tooMuch.status).toBe(400);
    const res = await request(app).post(api(`/ops/problems/${id}/resolve`)).set(operator.headers)
      .send({ outcome: 'REFUND', atFault: 'SELLER', refundAmount: 2200, returnTripCharge: 150, note: 'Cracked on arrival, photos clear' });
    expect(res.status).toBe(200);
    // Seller's share of 2200 is 2000 (Sthiva gives back its 200), plus the 150 trip
    expect(res.body.data.resolution).toMatchObject({ outcome: 'REFUND', sellerCharge: 2150, refundAmount: 2200 });
    expect(res.body.data.resolution.refundDueBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await request(app).post(api(`/ops/problems/${id}/resolve`)).set(operator.headers).send({ outcome: 'REJECTED', atFault: 'NONE', note: 'again' })).status).toBe(409);

    const due = (await request(app).get(api('/ops/problems?status=REFUND_DUE')).set(operator.headers)).body.data;
    expect(due).toHaveLength(1);
    expect(due[0].seller.name).toBe('seller Traders');
    expect((await request(app).post(api(`/ops/problems/${id}/refund-paid`)).set(operator.headers).send({ reference: 'UPI 412345678901' })).status).toBe(200);
    expect((await request(app).post(api(`/ops/problems/${id}/refund-paid`)).set(operator.headers).send({ reference: 'UPI 412345678901' })).status).toBe(409);

    const mine = (await request(app).get(api(`/problems/orders/${o._id}`)).set(buyer.headers)).body.data;
    expect(mine.reports[0]).toMatchObject({ status: 'RESOLVED', resolution: { outcome: 'REFUND', refundAmount: 2200 } });
    expect(mine.reports[0].refundPaidAt).toBeTruthy();
    expect(mine.hasOpenReport).toBe(false);
  });

  it('the buyer can withdraw an open report', async () => {
    const id = (await report((await delivered(1))._id, {})).body.data._id;
    expect((await request(app).post(api(`/problems/${id}/withdraw`)).set(other.headers)).status).toBe(404);
    expect((await request(app).post(api(`/problems/${id}/withdraw`)).set(buyer.headers)).body.data.status).toBe('WITHDRAWN');
    expect((await request(app).post(api(`/problems/${id}/withdraw`)).set(buyer.headers)).status).toBe(409);
  });
});

describe('the seller pays from their next payout', () => {
  it('a charge comes off the next statement once, and returns if that statement is cancelled', async () => {
    // One delivered, cash-confirmed order the seller delivered and got paid 1000 for (Sthiva delivered)
    await seedOrder(buyer.user._id, seller.profile._id, {
      items: [{ ...sheet(), quantity: 1, subtotal: 1100, taxableValue: 1100, lineTotal: 1100, supplierLineTotal: 1000 }],
      subtotal: 1100, gstAmount: 0, total: 1100, status: 'DELIVERED', deliveryMode: 'PLATFORM', deliveredAt: new Date(), paymentStatus: 'CAPTURED',
    });
    const o = await delivered(5);
    const id = (await report(o._id, {})).body.data._id;
    await request(app).post(api(`/ops/problems/${id}/resolve`)).set(operator.headers)
      .send({ outcome: 'REFUND', atFault: 'SELLER', refundAmount: 1100, sellerCharge: 300, note: 'One sheet cracked, agreed amount' });

    const balance = async () => (await request(app).get(api('/ops/settlements/balances?party=SUPPLIER')).set(operator.headers)).body.data
      .find((b: { partyId: string }) => b.partyId === String(seller.profile._id));
    expect(await balance()).toMatchObject({ earned: 1000, deducted: 300, net: 700 });

    const st = await request(app).post(api('/ops/settlements')).set(admin.headers).send({ party: 'SUPPLIER', partyId: String(seller.profile._id) });
    expect(st.status).toBe(201);
    expect(st.body.data).toMatchObject({ deducted: 300, net: 700 });
    expect(st.body.data.deductions[0]).toMatchObject({ amount: 300 });
    expect((await ProblemReport.findById(id).lean())!.settlementId).toBeTruthy();
    // Nothing left to settle; the reported order still waits for its cash to be confirmed
    expect(await balance()).toMatchObject({ orders: 0, deducted: 0, net: 0, waitingForCash: 1 });

    await request(app).post(api(`/ops/settlements/${st.body.data._id}/cancel`)).set(admin.headers).send({ reason: 'Wrong amounts' });
    expect((await ProblemReport.findById(id).lean())!.settlementId).toBeUndefined();
    expect(await balance()).toMatchObject({ deducted: 300 });
  });
});

describe('rules', () => {
  it('3 working days skips the weekend', () => {
    // Thursday 20 Nov 2026, 10:00 India time -> Tuesday 25 Nov
    expect(addWorkingDays(new Date('2026-11-20T04:30:00Z'), 3)).toBe('2026-11-25');
    // Monday -> Thursday
    expect(addWorkingDays(new Date('2026-11-23T04:30:00Z'), 3)).toBe('2026-11-26');
  });

  it('a buyer change of mind costs the seller only their share of the refund, no trip', () => {
    const r = { claimValue: 1100, lines: [{ index: 0, name: 'x', unit: 'SHEET', quantity: 1, orderedQuantity: 1, buyerUnitPrice: 1100, sellerShare: 10 / 11 }] };
    expect(suggestedSellerCharge(r, 'REFUND', 'BUYER', 1000, 100)).toBe(909.09);
    expect(suggestedSellerCharge(r, 'REFUND', 'SELLER', 1100, 100)).toBe(1100);
    expect(suggestedSellerCharge(r, 'REJECTED', 'SELLER', 0, 0)).toBe(0);
  });
});
