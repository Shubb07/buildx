import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { seedUser, seedSupplier, startDb, stopDb, clearDb, makeApp } from './helpers';
import { SupplierProfile } from '../src/infrastructure/database/models/SupplierProfile.model';
import { Settlement } from '../src/infrastructure/database/models/Settlement.model';

let seq = 0;
const mocks = vi.hoisted(() => ({
  uploadPrivate: vi.fn(async (_file: string, folder: string) => ({ publicId: `buildx/${folder}/proof${++seq}`, format: 'jpg', bytes: 1000 })),
  privateViewUrl: vi.fn((publicId: string) => `https://api.cloudinary.com/download?public_id=${publicId}&signature=x`),
  deletePrivate: vi.fn(async () => undefined),
}));
vi.mock('../src/infrastructure/storage/cloudinary.client', () => ({ StorageService: mocks }));

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

let supplier: Awaited<ReturnType<typeof seedSupplier>>;
let operator: Awaited<ReturnType<typeof seedUser>>;
let admin: Awaited<ReturnType<typeof seedUser>>;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  vi.clearAllMocks();
  await clearDb();
  supplier = await seedSupplier('supplier');
  operator = await seedUser('operator', { role: 'OPERATOR' });
  admin = await seedUser('admin', { role: 'ADMIN' });
});

const BANK = { method: 'BANK', holderName: 'Sri Ganesh Traders', accountNumber: '123456789012', confirmAccountNumber: '123456789012', ifsc: 'sbin0001234' };

function saveBank(fields: Record<string, string> = BANK, withProof = true) {
  let r = request(app).put(api('/suppliers/me/payout-account')).set(supplier.headers);
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return withProof ? r.attach('file', jpg, { filename: 'cheque.jpg', contentType: 'image/jpeg' }) : r;
}
const saveUpi = (upiId = 'Ganesh.T@okhdfcbank') =>
  request(app).put(api('/suppliers/me/payout-account')).set(supplier.headers).field('method', 'UPI').field('holderName', 'Ganesh T').field('upiId', upiId);
const opsView = () => request(app).get(api(`/ops/suppliers/${supplier.profile._id}/payout-account`)).set(operator.headers);
const review = (body: object) => request(app).patch(api(`/ops/suppliers/${supplier.profile._id}/payout-account`)).set(operator.headers).send(body);

async function verify() {
  const seen = await opsView();
  const res = await review({ status: 'VERIFIED', submittedAt: seen.body.data.account.submittedAt });
  expect(res.status).toBe(200);
}

describe('seller payout account', () => {
  it('stores a bank account encrypted and only ever shows the seller a masked number', async () => {
    const res = await saveBank();
    expect(res.status).toBe(200);
    expect(res.body.data.account).toMatchObject({ method: 'BANK', masked: '•••• 9012', ifsc: 'SBIN0001234', status: 'SUBMITTED' });
    expect(JSON.stringify(res.body)).not.toContain('123456789012');
    expect(mocks.uploadPrivate).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/jpeg;base64,/), `payout/${supplier.profile._id}`);

    // Not readable in the database, and not leaked through the profile endpoint
    const raw = await SupplierProfile.collection.findOne({ _id: supplier.profile._id });
    expect(raw?.payoutAccount.secret).toMatch(/^v1\./);
    expect(JSON.stringify(raw)).not.toContain('123456789012');
    const profile = await request(app).get(api('/suppliers/me')).set(supplier.headers);
    expect(JSON.stringify(profile.body)).not.toMatch(/123456789012|secret|proofPublicId/);
  });

  it('checks the details and needs a cheque or passbook photo for a bank account', async () => {
    expect((await saveBank({ ...BANK, accountNumber: '12AB' })).status).toBe(400);
    expect((await saveBank({ ...BANK, confirmAccountNumber: '999999999999' })).body.error.message).toMatch(/do not match/);
    expect((await saveBank({ ...BANK, ifsc: 'SBIN1234' })).status).toBe(400);
    expect((await saveBank(BANK, false)).body.error.message).toMatch(/cancelled cheque/);
    expect((await saveUpi('not-a-upi')).status).toBe(400);
    const upi = await saveUpi();
    expect(upi.status).toBe(200);
    expect(upi.body.data.account).toMatchObject({ method: 'UPI', masked: 'ga••••@okhdfcbank' });
  });

  it('ops see the full details with a short-lived proof link; buyers and sellers cannot', async () => {
    await saveBank();
    const seen = await opsView();
    expect(seen.body.data.account).toMatchObject({ accountNumber: '123456789012', ifsc: 'SBIN0001234', holderName: 'Sri Ganesh Traders' });
    expect(seen.body.data.account.proofUrl).toContain('signature');
    expect((await request(app).get(api(`/ops/suppliers/${supplier.profile._id}/payout-account`)).set(supplier.headers)).status).toBe(403);
  });

  it('ops cannot approve an account that changed after they opened it', async () => {
    await saveBank();
    const seen = await opsView();
    await saveUpi();
    const stale = await review({ status: 'VERIFIED', submittedAt: seen.body.data.account.submittedAt });
    expect(stale.status).toBe(409);
    expect((await review({ status: 'REJECTED', submittedAt: new Date().toISOString() })).status).toBe(400); // needs a reason
  });

  it('changing a verified account pauses payouts for 48 hours', async () => {
    await saveBank();
    await verify();
    const changed = await saveUpi();
    expect(changed.body.data.account.status).toBe('SUBMITTED');
    const hold = new Date(changed.body.data.account.holdUntil).getTime();
    expect(hold - Date.now()).toBeGreaterThan(47 * 3600_000);
    const log = (await SupplierProfile.findById(supplier.profile._id).lean())!.verificationLog.map((e) => e.action);
    expect(log).toEqual(expect.arrayContaining(['PAYOUT_ADDED', 'PAYOUT_VERIFIED', 'PAYOUT_CHANGED']));
  });

  it('a supplier payout can only be marked paid to a verified account outside the pause', async () => {
    const statement = await Settlement.create({
      number: 'ST-TEST-0001', party: 'SUPPLIER', supplierId: supplier.profile._id, partyName: 'Test',
      orders: [], earned: 1000, cashHeld: 0, net: 1000, status: 'PENDING', createdBy: admin.user._id,
    });
    const pay = () => request(app).post(api(`/ops/settlements/${statement._id}/paid`)).set(admin.headers).send({ reference: 'UTR123456' });

    expect((await pay()).body.error.message).toMatch(/not added a payout account/);
    await saveBank();
    expect((await pay()).body.error.message).toMatch(/Verify the seller/);
    await verify();
    const paid = await pay();
    expect(paid.status).toBe(200);
    expect(paid.body.data.paidTo).toBe('Bank •••• 9012 · SBIN0001234 · Sri Ganesh Traders');

    // After a change, the next payout waits for the pause even once the new account is verified
    const next = await Settlement.create({
      number: 'ST-TEST-0002', party: 'SUPPLIER', supplierId: supplier.profile._id, partyName: 'Test',
      orders: [], earned: 500, cashHeld: 0, net: 500, status: 'PENDING', createdBy: admin.user._id,
    });
    await saveUpi();
    await verify();
    const held = await request(app).post(api(`/ops/settlements/${next._id}/paid`)).set(admin.headers).send({ reference: 'UTR999999' });
    expect(held.status).toBe(409);
    expect(held.body.error.message).toMatch(/paused until/);
  });
});
