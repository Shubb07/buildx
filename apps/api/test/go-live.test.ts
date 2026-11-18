import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { seedUser, seedSupplier, seedProduct, startDb, stopDb, clearDb, makeApp } from './helpers';
import { SupplierProfile } from '../src/infrastructure/database/models/SupplierProfile.model';
import { SELLER_TERMS_VERSION } from '../src/features/suppliers/go-live';
import { seal } from '../src/shared/secret-box';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

let supplier: Awaited<ReturnType<typeof seedSupplier>>;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  supplier = await seedSupplier('s1', { verificationStatus: 'PENDING' });
});

const goLive = async () => (await request(app).get(api('/suppliers/me/go-live')).set(supplier.headers)).body.data;
const step = (data: { steps: { key: string; status: string }[] }, key: string) => data.steps.find((s) => s.key === key)!.status;

describe('go-live checklist', () => {
  it('lists the seven steps with their state', async () => {
    const d = await goLive();
    expect(d.steps.map((s: { key: string }) => s.key)).toEqual(['business', 'area', 'range', 'papers', 'payout', 'agreement', 'products']);
    expect(step(d, 'papers')).toBe('TODO');
    expect(step(d, 'payout')).toBe('TODO');
    expect(step(d, 'agreement')).toBe('TODO');
    expect(step(d, 'products')).toBe('TODO');
    expect(d.review.status).toBe('PENDING');
    expect(d.total).toBe(7);
  });

  it('papers and payout move from waiting to done as ops accept them', async () => {
    await SupplierProfile.updateOne({ _id: supplier.profile._id }, { $set: {
      kycDocuments: [{ type: 'SHOP_LICENSE', publicId: 'kyc/x', status: 'SUBMITTED', verified: false }],
      payoutAccount: { method: 'UPI', holderName: 'S', secret: seal('s@okaxis'), masked: 's••••@okaxis', status: 'SUBMITTED', submittedAt: new Date() },
    } });
    let d = await goLive();
    expect(step(d, 'papers')).toBe('WAITING');
    expect(step(d, 'payout')).toBe('WAITING');
    await SupplierProfile.updateOne({ _id: supplier.profile._id }, { $set: { 'kycDocuments.0.status': 'ACCEPTED', 'payoutAccount.status': 'VERIFIED' } });
    d = await goLive();
    expect(step(d, 'papers')).toBe('DONE');
    expect(step(d, 'payout')).toBe('DONE');
  });

  it('a GSTIN also needs the GST certificate', async () => {
    await SupplierProfile.updateOne({ _id: supplier.profile._id }, { $set: {
      gstin: '29ABCDE1234F1Z5',
      kycDocuments: [{ type: 'UDYAM', publicId: 'kyc/u', status: 'ACCEPTED', verified: true }],
    } });
    expect(step(await goLive(), 'papers')).toBe('TODO');
  });

  it('records the accepted agreement version, and asks again when it changes', async () => {
    expect((await request(app).post(api('/suppliers/me/agreement')).set(supplier.headers).send({ version: '2020-01-01' })).status).toBe(409);
    const ok = await request(app).post(api('/suppliers/me/agreement')).set(supplier.headers).send({ version: SELLER_TERMS_VERSION });
    expect(ok.status).toBe(200);
    expect(step(await goLive(), 'agreement')).toBe('DONE');
    const p = (await SupplierProfile.findById(supplier.profile._id).lean())!;
    expect(p.termsAcceptance).toMatchObject({ version: SELLER_TERMS_VERSION });
    expect(p.verificationLog.map((e) => e.action)).toContain('TERMS_ACCEPTED');
    await SupplierProfile.updateOne({ _id: supplier.profile._id }, { $set: { 'termsAcceptance.version': '2026-01-01' } });
    expect(step(await goLive(), 'agreement')).toBe('TODO');
  });

  it('counts listed products and shows the list to ops', async () => {
    await seedProduct(supplier.profile._id);
    expect(step(await goLive(), 'products')).toBe('DONE');
    const ops = await seedUser('ops', { role: 'OPERATOR' });
    const list = await request(app).get(api('/ops/suppliers')).set(ops.headers);
    const mine = list.body.data.find((s: { _id: string }) => s._id === String(supplier.profile._id));
    expect(mine.goLive.find((s: { key: string }) => s.key === 'products').status).toBe('DONE');
    // Buyers and other roles cannot read it
    const buyer = await seedUser('b');
    expect((await request(app).get(api('/suppliers/me/go-live')).set(buyer.headers)).status).toBe(403);
  });
});
