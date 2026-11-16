import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { seedSupplier, seedProduct, startDb, stopDb, clearDb, makeApp } from './helpers';
import { Product } from '../src/infrastructure/database/models/Product.model';
import { SupplierProfile } from '../src/infrastructure/database/models/SupplierProfile.model';
import { COLUMNS } from '../src/features/suppliers/bulk';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

async function setup() {
  const s = await seedSupplier('bulk1', { weeklyConfirmed: false });
  const cement = await seedProduct(s.profile._id, { name: 'PPC cement', basePrice: 380, stockQuantity: 100, bulkPricing: [{ minQty: 50, price: 370 }] });
  const steel = await seedProduct(s.profile._id, { name: 'TMT 12 mm', unit: 'KG', basePrice: 70, stockQuantity: 0, status: 'OUT_OF_STOCK' });
  const download = async () => {
    const res = await request(app).get(api('/suppliers/me/bulk.xlsx')).set(s.headers).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body);
    return book;
  };
  const upload = async (book: ExcelJS.Workbook, apply = false) => {
    const buf = Buffer.from(await book.xlsx.writeBuffer());
    return request(app).post(api('/suppliers/me/bulk')).set(s.headers).field('apply', String(apply))
      .attach('file', buf, { filename: 'items.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };
  // Row of a listing in the sheet, by name
  const rowOf = (book: ExcelJS.Workbook, name: string) => {
    const sheet = book.worksheets[0];
    const header = sheet.getRow(1).values as string[];
    const col = (label: string) => header.indexOf(label);
    let found = 0;
    sheet.eachRow((row, n) => { if (row.getCell(col(COLUMNS.name)).value === name) found = n; });
    return { set: (label: string, value: ExcelJS.CellValue) => { sheet.getRow(found).getCell(col(label)).value = value; } };
  };
  return { s, cement, steel, download, upload, rowOf };
}

describe('bulk price and stock by Excel', () => {
  it('downloads every listing with the editable columns', async () => {
    const { download } = await setup();
    const book = await download();
    const sheet = book.worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe(COLUMNS.id);
    expect(sheet.rowCount).toBe(3);
    const names = [sheet.getRow(2).getCell(2).value, sheet.getRow(3).getCell(2).value];
    expect(names).toEqual(['PPC cement', 'TMT 12 mm']);
  });

  it('previews changes without saving, then saves them and counts as the Monday check', async () => {
    const { s, cement, steel, download, upload, rowOf } = await setup();
    const book = await download();
    rowOf(book, 'PPC cement').set(COLUMNS.price, 395);
    rowOf(book, 'PPC cement').set(COLUMNS.hsn, '2523');
    rowOf(book, 'TMT 12 mm').set(COLUMNS.stock, 800);

    const preview = await upload(book);
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ applied: false, coversAll: true, summary: { rows: 2, changed: 2, errors: 0 } });
    const steelRow = preview.body.data.rows.find((r: { name: string }) => r.name === 'TMT 12 mm');
    expect(steelRow.changes).toEqual([
      { field: 'Stock', from: '0', to: '800' },
      { field: 'Status', from: 'Out of stock', to: 'Live' },
    ]);
    expect((await Product.findById(cement._id).lean())!.basePrice).toBe(380);

    const saved = await upload(book, true);
    expect(saved.body.data).toMatchObject({ applied: true, weeklyConfirmed: true });
    const [c, t] = await Promise.all([Product.findById(cement._id).lean(), Product.findById(steel._id).lean()]);
    expect(c).toMatchObject({ basePrice: 395, hsn: '2523' });
    expect(t).toMatchObject({ stockQuantity: 800, status: 'ACTIVE' });
    expect((await SupplierProfile.findById(s.profile._id).lean())!.weeklyConfirmedAt).toBeTruthy();
  });

  it('shows every mistake by row and saves nothing while any row is wrong', async () => {
    const { cement, download, upload, rowOf } = await setup();
    const book = await download();
    rowOf(book, 'PPC cement').set(COLUMNS.price, 360); // below the 50+ bulk price of 370
    rowOf(book, 'TMT 12 mm').set(COLUMNS.stock, 'lots');
    const preview = await upload(book);
    expect(preview.body.data.summary).toMatchObject({ errors: 2 });
    const errs = preview.body.data.rows.map((r: { row: number; errors: string[] }) => [r.row, r.errors[0]]);
    expect(errs[0][0]).toBe(2);
    expect(errs[0][1]).toMatch(/bulk price/i);
    expect(errs[1][1]).toMatch(/whole number/);

    const refused = await upload(book, true);
    expect(refused.status).toBe(400);
    expect((await Product.findById(cement._id).lean())!.basePrice).toBe(380);
  });

  it('refuses another seller\'s listing and a sheet without the ID column', async () => {
    const { download, upload, rowOf } = await setup();
    const other = await seedSupplier('bulk2');
    const theirs = await seedProduct(other.profile._id, { name: 'Their item' });
    const book = await download();
    rowOf(book, 'PPC cement').set(COLUMNS.id, String(theirs._id));
    const res = await upload(book);
    expect(res.body.data.rows[0].errors[0]).toMatch(/not one of your items/);

    const blank = new ExcelJS.Workbook();
    blank.addWorksheet('x').addRow(['Item', 'Price']);
    const bad = await upload(blank);
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/Listing ID/);
  });

  it('reads a CSV saved from the sheet', async () => {
    const { s, cement } = await setup();
    const head = [COLUMNS.id, COLUMNS.name, COLUMNS.price, COLUMNS.stock, COLUMNS.minOrder, COLUMNS.hsn, COLUMNS.status].map((h) => `"${h}"`).join(',');
    const csv = `${head}
${cement._id},PPC cement,"Rs 1,390.50",120,1,2523,Live
`;
    const res = await request(app).post(api('/suppliers/me/bulk')).set(s.headers).field('apply', 'false')
      .attach('file', Buffer.from(csv), { filename: 'items.csv', contentType: 'text/csv' });
    expect(res.status).toBe(200);
    expect(res.body.data.rows[0].changes).toEqual(expect.arrayContaining([{ field: 'Price', from: '380', to: '1390.5' }, { field: 'Stock', from: '100', to: '120' }]));
  });

  it('pauses and restarts a listing from the sheet', async () => {
    const { cement, download, upload, rowOf } = await setup();
    let book = await download();
    rowOf(book, 'PPC cement').set(COLUMNS.status, 'Paused');
    await upload(book, true);
    expect((await Product.findById(cement._id).lean())!.status).toBe('INACTIVE');
    book = await download();
    rowOf(book, 'PPC cement').set(COLUMNS.status, 'Live');
    await upload(book, true);
    expect((await Product.findById(cement._id).lean())!.status).toBe('ACTIVE');
  });
});
