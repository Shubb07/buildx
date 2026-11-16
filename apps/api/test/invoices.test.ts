import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { acceptOffer, seedUser, seedSupplier, seedProduct, newKey, SITE, startDb, stopDb, clearDb, makeApp } from './helpers';
import { SupplierProfile } from '../src/infrastructure/database/models/SupplierProfile.model';
import { CatalogItem } from '../src/infrastructure/database/models/CatalogItem.model';
import { Invoice } from '../src/infrastructure/database/models/Invoice.model';
import { Order } from '../src/infrastructure/database/models/Order.model';
import { financialYear, invoiceLines, stateCodeFor } from '../src/features/invoices/invoice.service';
import { amountInWords } from '../src/features/invoices/invoice.pdf';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;
const KA = '29ABCDE1234F1ZW'; // Karnataka
const TN = '33AAACH7409R1Z8'; // Tamil Nadu

// Collects a binary response body (supertest gives no buffer for application/pdf otherwise)
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe('invoice maths', () => {
  it('names the Indian financial year (April to March, IST)', () => {
    expect(financialYear(new Date('2026-11-16T10:00:00+05:30'))).toBe('2627');
    expect(financialYear(new Date('2027-03-31T23:59:00+05:30'))).toBe('2627');
    expect(financialYear(new Date('2027-04-01T00:01:00+05:30'))).toBe('2728');
  });

  it('matches postal state names to GST state codes', () => {
    expect(stateCodeFor('KARNATAKA')).toBe('29');
    expect(stateCodeFor('Andhra Pradesh')).toBe('37');
    expect(stateCodeFor('Nowhere')).toBeUndefined();
  });

  it('splits GST into CGST and SGST to the paisa, or IGST across states', () => {
    const item = { name: 'Cement', quantity: 3, unit: 'BAG', taxableValue: 1000, gstRate: 28, gstAmount: 280.01, lineTotal: 1280.01 };
    const [same] = invoiceLines([item], false, true);
    expect(same).toMatchObject({ taxable: 1000, cgst: 140, sgst: 140.01, igst: 0, total: 1280.01 });
    const [across] = invoiceLines([item], true, true);
    expect(across).toMatchObject({ cgst: 0, sgst: 0, igst: 280.01, total: 1280.01 });
    const [bill] = invoiceLines([item], false, false);
    expect(bill).toMatchObject({ taxable: 1280.01, gstRate: 0, cgst: 0, igst: 0, total: 1280.01 });
  });

  it('writes amounts in words the Indian way', () => {
    expect(amountInWords(3800)).toBe('Rupees Three Thousand Eight Hundred only');
    expect(amountInWords(12345678.5)).toBe('Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise only');
    expect(amountInWords(100000)).toBe('Rupees One Lakh only');
  });
});

describe('GST invoice for an order', () => {
  async function setup(gstin?: string) {
    const buyer = await seedUser('ib1', { name: 'Ravi Kumar' });
    const supplier = await seedSupplier('is1');
    if (gstin) await SupplierProfile.updateOne({ _id: supplier.profile._id }, { gstin, address: 'Yard 4, BH Road, Tumakuru' });
    const item = await CatalogItem.create({ name: 'PPC cement', slug: 'ppc-cement', categoryId: (await seedProduct(supplier.profile._id)).categoryId, unit: 'BAG', createdBy: { role: 'ADMIN' } });
    const cement = await seedProduct(supplier.profile._id, { catalogItemId: item._id, basePrice: 380, gstRate: 28, isGstInclusive: false, stockQuantity: 1000 });
    const steel = await seedProduct(supplier.profile._id, { name: 'TMT 12 mm', unit: 'KG', basePrice: 70, gstRate: 18, isGstInclusive: false, hsn: '72142090', stockQuantity: 1000 });
    const place = (extra: object = {}) => request(app).post(api('/orders')).set(buyer.headers).set('Idempotency-Key', newKey()).send({
      items: [{ productId: cement._id.toString(), quantity: 10 }, { productId: steel._id.toString(), quantity: 100 }],
      deliveryAddress: SITE, ...extra,
    });
    const dispatch = async (id: string) => {
      await acceptOffer(app, supplier, id);
      return request(app).patch(api(`/suppliers/me/orders/${id}/status`)).set(supplier.headers).send({ status: 'IN_TRANSIT' });
    };
    return { buyer, supplier, place, dispatch };
  }

  it('is issued on dispatch with HSN codes, numbered in sequence, and downloadable by buyer and supplier only', async () => {
    const { buyer, supplier, place, dispatch } = await setup(KA);
    const res = await place();
    expect(res.status).toBe(201);
    const id = res.body.data.orderId;

    // HSN copied onto the order lines: the catalogue suggestion, or the seller's own code
    const order = await Order.findById(id).lean();
    expect(order!.items.map((i) => i.hsn)).toEqual(['2523', '72142090']);

    // Not dispatched yet: no invoice
    expect((await request(app).get(api(`/orders/${id}/invoice`)).set(buyer.headers)).status).toBe(404);

    expect((await dispatch(id)).status).toBe(200);
    const pdf = await request(app).get(api(`/orders/${id}/invoice`)).set(buyer.headers).buffer(true).parse(binary);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await request(app).get(api(`/suppliers/me/orders/${id}/invoice`)).set(supplier.headers).buffer(true).parse(binary)).status).toBe(200);
    const stranger = await seedUser('ib2');
    expect((await request(app).get(api(`/orders/${id}/invoice`)).set(stranger.headers)).status).toBe(404);

    const inv = await Invoice.findOne({ orderId: id }).lean();
    expect(inv).toMatchObject({
      kind: 'TAX_INVOICE',
      number: expect.stringMatching(/^INV\/\d{4}\/00001$/),
      seller: { gstin: KA, state: 'Karnataka', stateCode: '29' },
      buyer: { name: 'Ravi Kumar' },
      interState: false,
    });
    // 10 bags x 380 at 28%, 100 kg x 70 at 18%
    expect(inv!.totals).toEqual({ taxable: 10800, cgst: 1162, sgst: 1162, igst: 0, total: 13124 });

    // Downloading again never issues a second invoice; the next order gets the next number
    await request(app).get(api(`/orders/${id}/invoice`)).set(buyer.headers);
    const second = (await place()).body.data.orderId;
    await dispatch(second);
    await request(app).get(api(`/orders/${second}/invoice`)).set(buyer.headers);
    expect((await Invoice.find({ supplierId: supplier.profile._id }).sort({ number: 1 }).lean()).map((i) => i.number.slice(-5))).toEqual(['00001', '00002']);
  });

  it('uses IGST when the buyer is in another state, and shows the buyer GSTIN', async () => {
    const { buyer, place, dispatch } = await setup(KA);
    const id = (await place({ buyerGst: { gstin: TN, businessName: 'Chennai Builders' } })).body.data.orderId;
    await dispatch(id);
    await request(app).get(api(`/orders/${id}/invoice`)).set(buyer.headers);
    const inv = await Invoice.findOne({ orderId: id }).lean();
    expect(inv).toMatchObject({ interState: true, placeOfSupply: { stateCode: '33' }, buyer: { gstin: TN, businessName: 'Chennai Builders' } });
    expect(inv!.totals).toMatchObject({ cgst: 0, sgst: 0, igst: 2324 });
  });

  it('gives a bill of supply when the supplier has no GSTIN', async () => {
    const { buyer, place, dispatch } = await setup();
    const id = (await place()).body.data.orderId;
    await dispatch(id);
    const res = await request(app).get(api(`/orders/${id}/invoice`)).set(buyer.headers);
    expect(res.status).toBe(200);
    const inv = await Invoice.findOne({ orderId: id }).lean();
    expect(inv).toMatchObject({ kind: 'BILL_OF_SUPPLY', number: expect.stringMatching(/^BOS\//), totals: { cgst: 0, sgst: 0, igst: 0, total: 13124 } });
  });
});

describe('HSN code on a listing', () => {
  it('is checked, saved and can be cleared', async () => {
    const s = await seedSupplier('ih1');
    const p = await seedProduct(s.profile._id);
    const patch = (hsn: string) => request(app).patch(api(`/suppliers/me/products/${p._id}`)).set(s.headers).send({ hsn });
    expect((await patch('25A3')).status).toBe(400);
    expect((await patch('25231')).status).toBe(400);
    expect((await patch('252329')).body.data.hsn).toBe('252329');
    expect((await patch('')).body.data.hsn).toBeUndefined();
  });
});
