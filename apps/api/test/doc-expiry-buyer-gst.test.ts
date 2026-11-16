import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { acceptOffer, seedUser, seedSupplier, seedProduct, newKey, SITE, startDb, stopDb, clearDb, makeApp } from './helpers';
import { SupplierProfile } from '../src/infrastructure/database/models/SupplierProfile.model';
import { User } from '../src/infrastructure/database/models/User.model';
import { dueStage, sendDocumentExpiryReminders } from '../src/features/suppliers/document-expiry';

let seq = 0;
const mocks = vi.hoisted(() => ({
  uploadPrivate: vi.fn(async (_file: string, folder: string) => ({ publicId: `buildx/${folder}/doc${++seq}`, format: 'pdf', bytes: 1000 })),
  privateViewUrl: vi.fn((publicId: string) => `https://example.test/${publicId}`),
  deletePrivate: vi.fn(async () => undefined),
}));
vi.mock('../src/infrastructure/storage/cloudinary.client', () => ({ StorageService: mocks }));

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;
const pdf = Buffer.from('%PDF-1.4\n%test\n');
const DAY = 86400000;
const istDay = (d: Date) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  vi.clearAllMocks();
  await clearDb();
});

describe('document expiry', () => {
  it('stores an optional expiry date on upload and refuses past dates', async () => {
    const s = await seedSupplier('e1');
    const up = (expiresOn?: string) => {
      const r = request(app).post(api('/suppliers/me/documents')).set(s.headers).field('type', 'SHOP_LICENSE');
      if (expiresOn !== undefined) r.field('expiresOn', expiresOn);
      return r.attach('file', pdf, { filename: 'l.pdf', contentType: 'application/pdf' });
    };
    expect((await up(istDay(new Date(Date.now() - 2 * DAY)))).status).toBe(400);
    expect((await up('2027-02-30')).status).toBe(400);
    const future = istDay(new Date(Date.now() + 200 * DAY));
    const res = await up(future);
    expect(res.status).toBe(201);
    expect(res.body.data.documents[0]).toMatchObject({ type: 'SHOP_LICENSE', expiresOn: future });
    expect((await up()).body.data.documents[0].expiresOn).toBeUndefined();
  });

  it('lets ops record the date read on the paper', async () => {
    const s = await seedSupplier('e2', { verificationStatus: 'PENDING' });
    const op = await seedUser('op2', { role: 'OPERATOR' });
    await SupplierProfile.updateOne({ _id: s.profile._id }, { kycDocuments: [{ type: 'SHOP_LICENSE', publicId: 'p', status: 'SUBMITTED' }] });
    const date = istDay(new Date(Date.now() + 100 * DAY));
    const res = await request(app).patch(api(`/ops/suppliers/${s.profile._id}/documents/SHOP_LICENSE`)).set(op.headers).send({ status: 'ACCEPTED', expiresOn: date });
    expect(res.status).toBe(200);
    expect(res.body.data.documents[0].expiresOn).toBe(date);
    const cleared = await request(app).patch(api(`/ops/suppliers/${s.profile._id}/documents/SHOP_LICENSE`)).set(op.headers).send({ status: 'ACCEPTED', expiresOn: null });
    expect(cleared.body.data.documents[0].expiresOn).toBeUndefined();
  });

  it('picks the right notice', () => {
    const now = new Date('2026-11-16T06:00:00Z');
    expect(dueStage(new Date(now.getTime() + 40 * DAY), now)).toBeNull();
    expect(dueStage(new Date(now.getTime() + 20 * DAY), now)).toBe('D30');
    expect(dueStage(new Date(now.getTime() + 3 * DAY), now)).toBe('D7');
    expect(dueStage(new Date(now.getTime() - DAY), now)).toBe('EXPIRED');
  });

  it('sends each notice once, skips stages already passed, and logs expiry', async () => {
    const s = await seedSupplier('e3');
    const now = new Date();
    await SupplierProfile.updateOne({ _id: s.profile._id }, {
      kycDocuments: [
        { type: 'SHOP_LICENSE', publicId: 'a', status: 'ACCEPTED', verified: true, expiresOn: new Date(now.getTime() + 20 * DAY) },
        { type: 'UDYAM', publicId: 'b', status: 'ACCEPTED', verified: true, expiresOn: new Date(now.getTime() + 400 * DAY) },
      ],
    });
    expect(await sendDocumentExpiryReminders(now, { force: true })).toBe(1);
    expect(await sendDocumentExpiryReminders(now, { force: true })).toBe(0);
    // 3 days left: the 7-day notice
    expect(await sendDocumentExpiryReminders(new Date(now.getTime() + 17 * DAY), { force: true })).toBe(1);
    // expired
    expect(await sendDocumentExpiryReminders(new Date(now.getTime() + 21 * DAY), { force: true })).toBe(1);
    const p = await SupplierProfile.findById(s.profile._id).lean();
    expect(p!.kycDocuments.map((d) => d.expiryNotice)).toEqual(['EXPIRED', undefined]);
    expect(p!.verificationLog.at(-1)).toMatchObject({ actor: 'SYSTEM', action: 'DOC_EXPIRED' });
    // Expiry alone does not unverify
    expect(p!.verificationStatus).toBe('VERIFIED');
  });

  it('is throttled to once an hour unless forced', async () => {
    const s = await seedSupplier('e4');
    await SupplierProfile.updateOne({ _id: s.profile._id }, {
      kycDocuments: [{ type: 'SHOP_LICENSE', publicId: 'a', status: 'ACCEPTED', expiresOn: new Date(Date.now() + 5 * DAY) }],
    });
    const t = new Date();
    await sendDocumentExpiryReminders(t, { force: true });
    await SupplierProfile.updateOne({ _id: s.profile._id }, { $unset: { 'kycDocuments.0.expiryNotice': '' } });
    expect(await sendDocumentExpiryReminders(new Date(t.getTime() + 60_000))).toBe(0);
  });
});

describe('optional buyer GSTIN at checkout', () => {
  it('saves the GSTIN on the order, remembers it, and shows it to the seller', async () => {
    const buyer = await seedUser('gb1');
    const supplier = await seedSupplier('gs1');
    const product = await seedProduct(supplier.profile._id);
    const place = (buyerGst?: object) => request(app).post(api('/orders')).set(buyer.headers).set('Idempotency-Key', newKey())
      .send({ items: [{ productId: product._id.toString(), quantity: 2 }], deliveryAddress: SITE, ...(buyerGst ? { buyerGst } : {}) });

    const bad = await place({ gstin: '29ABCDE1234F1Z5', businessName: 'Gowda Builders' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].message).toMatch(/typing mistake/);

    const res = await place({ gstin: '29abcde1234f1zw', businessName: 'Gowda Builders' });
    expect(res.status).toBe(201);
    const id = res.body.data.orderId;
    expect((await request(app).get(api(`/orders/${id}`)).set(buyer.headers)).body.data.buyerGst)
      .toEqual({ gstin: '29ABCDE1234F1ZW', businessName: 'Gowda Builders' });
    const user = await User.findById(buyer.user._id).lean();
    expect(user).toMatchObject({ gstNumber: '29ABCDE1234F1ZW', gstBusinessName: 'Gowda Builders' });

    await acceptOffer(app, supplier, id);
    const seller = await request(app).get(api('/suppliers/me/orders')).set(supplier.headers);
    const listed = (seller.body.data.orders ?? seller.body.data).find((o: { _id: string }) => o._id === id);
    expect(listed.buyerGst).toEqual({ gstin: '29ABCDE1234F1ZW', businessName: 'Gowda Builders' });

    // Without it, nothing is stored
    const plain = await place();
    expect(plain.status).toBe(201);
    expect((await request(app).get(api(`/orders/${plain.body.data.orderId}`)).set(buyer.headers)).body.data.buyerGst).toBeUndefined();
  });
});
