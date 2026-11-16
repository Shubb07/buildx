import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { seedSupplier, seedUser, startDb, stopDb, clearDb, makeApp } from './helpers';
import { SupplierProfile } from '../src/infrastructure/database/models/SupplierProfile.model';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;
const ME = api('/suppliers/me');

// Real-shaped GSTINs with correct check characters
const G1 = '29ABCDE1234F1ZW';
const G2 = '29PQRST6789K1ZS';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe('GSTIN check on the seller profile', () => {
  it('explains a typing mistake (wrong check character)', async () => {
    const { headers } = await seedSupplier('v1');
    const res = await request(app).patch(ME).set(headers).send({ gstin: '29ABCDE1234F1Z5' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ field: 'gstin', message: expect.stringMatching(/typing mistake/) });
  });

  it('rejects an unknown state code', async () => {
    const { headers } = await seedSupplier('v2');
    const res = await request(app).patch(ME).set(headers).send({ gstin: '45ABCDE1234F1ZW' });
    expect(res.status).toBe(400);
  });

  it('allows one GSTIN per seller', async () => {
    const a = await seedSupplier('v3', { verificationStatus: 'PENDING' });
    const b = await seedSupplier('v4', { verificationStatus: 'PENDING' });
    expect((await request(app).patch(ME).set(a.headers).send({ gstin: G1 })).status).toBe(200);
    const res = await request(app).patch(ME).set(b.headers).send({ gstin: G1.toLowerCase() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GSTIN_TAKEN');
    // saving your own GSTIN again is fine
    expect((await request(app).patch(ME).set(a.headers).send({ gstin: G1, address: 'Yard 2' })).status).toBe(200);
  });
});

describe('re-review and audit trail', () => {
  it('sends a verified seller back to review when GSTIN or name changes', async () => {
    const s = await seedSupplier('v5');
    await SupplierProfile.updateOne({ _id: s.profile._id }, {
      gstin: G1,
      kycDocuments: [{ type: 'GST', publicId: 'p1', status: 'ACCEPTED', verified: true }],
    });

    // Other edits keep the seller verified
    let res = await request(app).patch(ME).set(s.headers).send({ address: 'New yard', businessName: 'V5 TRADERS' });
    expect(res.body.data.verificationStatus).toBe('VERIFIED');

    res = await request(app).patch(ME).set(s.headers).send({ gstin: G2 });
    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('PENDING');
    expect(res.body.data.kycDocuments[0]).toMatchObject({ type: 'GST', status: 'SUBMITTED', verified: false });
    const actions = res.body.data.verificationLog.map((e: { action: string }) => e.action);
    // the case-only name change is recorded but did not need a review
    expect(actions).toEqual(['NAME_CHANGED', 'GSTIN_CHANGED', 'RE_REVIEW']);
    expect(res.body.data.verificationLog[1].note).toBe(`${G1} -> ${G2}`);
  });

  it('records ops decisions and document reviews', async () => {
    const s = await seedSupplier('v6', { verificationStatus: 'PENDING' });
    const op = await seedUser('op6', { role: 'OPERATOR' });
    await SupplierProfile.updateOne({ _id: s.profile._id }, { kycDocuments: [{ type: 'SHOP_LICENSE', publicId: 'p', status: 'SUBMITTED' }] });

    await request(app).patch(api(`/ops/suppliers/${s.profile._id}/documents/SHOP_LICENSE`)).set(op.headers).send({ status: 'ACCEPTED' });
    const res = await request(app).patch(api(`/ops/suppliers/${s.profile._id}/verification`)).set(op.headers).send({ status: 'VERIFIED', note: 'Called the shop' });
    expect(res.status).toBe(200);
    expect(res.body.data.verificationLog.map((e: { action: string; actor: string }) => `${e.actor}:${e.action}`))
      .toEqual(['OPS:DOC_ACCEPTED', 'OPS:VERIFIED']);
    expect(res.body.data.verificationLog[1]).toMatchObject({ note: 'Called the shop', by: String(op.user._id) });
  });

  it('will not verify a seller whose stored GSTIN is wrong or used twice', async () => {
    const op = await seedUser('op7', { role: 'OPERATOR' });
    const a = await seedSupplier('v7', { verificationStatus: 'PENDING' });
    const b = await seedSupplier('v8', { verificationStatus: 'PENDING' });
    // Saved before this check existed
    await SupplierProfile.collection.updateOne({ _id: a.profile._id }, { $set: { gstin: '29ABCDE1234F1Z5' } });
    let res = await request(app).patch(api(`/ops/suppliers/${a.profile._id}/verification`)).set(op.headers).send({ status: 'VERIFIED' });
    expect(res.status).toBe(400);

    await SupplierProfile.collection.updateMany({ _id: { $in: [a.profile._id, b.profile._id] } }, { $set: { gstin: G1 } });
    res = await request(app).patch(api(`/ops/suppliers/${a.profile._id}/verification`)).set(op.headers).send({ status: 'VERIFIED' });
    expect(res.status).toBe(409);
    // rejecting is always possible
    res = await request(app).patch(api(`/ops/suppliers/${a.profile._id}/verification`)).set(op.headers).send({ status: 'REJECTED', note: 'Duplicate GSTIN' });
    expect(res.status).toBe(200);
  });

  it('shows ops the checks for each seller', async () => {
    const op = await seedUser('op9', { role: 'OPERATOR' });
    const a = await seedSupplier('v9', { verificationStatus: 'PENDING', servicePincodes: ['560001'] });
    await SupplierProfile.updateOne({ _id: a.profile._id }, { gstin: G1, kycDocuments: [{ type: 'GST', publicId: 'p', status: 'SUBMITTED' }] });
    await seedSupplier('v10', { verificationStatus: 'PENDING' });

    const res = await request(app).get(api('/ops/suppliers?verification=PENDING')).set(op.headers);
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.data.map((s: { businessName: string; checks: unknown }) => [s.businessName, s.checks]));
    expect(byName['v9 Traders']).toMatchObject({
      gstin: { status: 'OK', state: 'Karnataka', pan: 'ABCDE1234F' },
      duplicateGstin: false,
      documents: { accepted: [], waiting: ['GST'], rejected: [] },
    });
    expect(byName['v10 Traders']).toMatchObject({ gstin: { status: 'NONE' }, otherStates: [] });
  });
});
