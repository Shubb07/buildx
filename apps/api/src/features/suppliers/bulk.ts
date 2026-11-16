// Bulk price and stock by Excel (owner decision 2026-11-16, modelled on Amazon's seller feeds):
//   GET  /suppliers/me/bulk.xlsx   the seller's listings as a sheet
//   POST /suppliers/me/bulk        the edited sheet back (multipart "file"; apply=true to save)
// Without apply the answer is a preview: every change and every mistake, row by row. Saving is all
// or nothing and only when no row has a mistake. A sheet that covers every listed item also counts
// as the Monday check (features/suppliers/weekly.ts), because it confirms the whole list.

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import { ok } from '@sthiva/shared';
import { Product, ON_ORDER_STOCK } from '../../infrastructure/database/models/Product.model';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import { HSN_RE } from '../../shared/hsn';
import { bulkPricingProblem } from './product-rules';

const MAX_ROWS = 2000;
const LISTED = ['ACTIVE', 'OUT_OF_STOCK'];
const IN_SHEET = ['ACTIVE', 'OUT_OF_STOCK', 'INACTIVE', 'DRAFT'];
// In the sheet the seller only chooses Live or Paused (stock decides out of stock)
const STATUS_WORD: Record<string, string> = { ACTIVE: 'Live', OUT_OF_STOCK: 'Live', INACTIVE: 'Paused', DRAFT: 'Draft' };
// In the preview of changes, what buyers will actually see
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Live', OUT_OF_STOCK: 'Out of stock', INACTIVE: 'Paused', DRAFT: 'Draft' };
const UNIT_WORD: Record<string, string> = {
  KG: 'kg', TON: 'tonne', PIECE: 'piece', BAG: 'bag', BUNDLE: 'bundle', CUBIC_METER: 'cubic metre', SQUARE_METER: 'square metre',
  LITER: 'litre', METER: 'metre', BOX: 'box', SHEET: 'sheet',
};

// Column headers are how the upload finds each value, so the seller may reorder or add columns
export const COLUMNS = {
  id: 'Listing ID (do not change)',
  name: 'Item',
  unit: 'Sold per',
  price: 'Your price (Rs)',
  gst: 'GST',
  stock: 'Stock',
  minOrder: 'Minimum order',
  hsn: 'HSN code',
  status: 'Show to buyers (Live or Paused)',
  tiers: 'Bulk prices (change on the website)',
} as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okType = /\.(xlsx|csv)$/i.test(file.originalname);
    if (!okType) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    cb(null, true);
  },
});

export function bulkUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return next(AppError.badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'The file must be 2 MB or smaller' : 'Upload the .xlsx sheet you downloaded (or a .csv)'));
    }
    next(err);
  });
}

type Listing = {
  _id: Types.ObjectId; name: string; unit: string; basePrice: number; gstRate?: number; isGstInclusive?: boolean;
  stockQuantity: number; minOrderQuantity?: number; hsn?: string; status: string; supply?: string;
  bulkPricing?: { minQty: number; price: number }[];
};

const tiersText = (l: Listing) => (l.bulkPricing ?? []).slice().sort((a, b) => a.minQty - b.minQty).map((t) => `${t.minQty}+ at ${t.price}`).join(', ');

// GET /suppliers/me/bulk.xlsx
export async function downloadSheet(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await SupplierProfile.findOne({ userId: req.auth!.userId }).select('_id businessName').lean();
    if (!profile) throw AppError.notFound('Supplier profile');
    const listings = await Product.find({ supplierId: profile._id, status: { $in: IN_SHEET } })
      .select('name unit basePrice gstRate isGstInclusive stockQuantity minOrderQuantity hsn status supply bulkPricing')
      .sort({ name: 1 }).lean<Listing[]>();

    const book = new ExcelJS.Workbook();
    book.creator = 'Sthiva';
    const sheet = book.addWorksheet('Your items', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
    sheet.columns = [
      { header: COLUMNS.id, key: 'id', width: 27 },
      { header: COLUMNS.name, key: 'name', width: 40 },
      { header: COLUMNS.unit, key: 'unit', width: 12 },
      { header: COLUMNS.price, key: 'price', width: 15 },
      { header: COLUMNS.gst, key: 'gst', width: 20 },
      { header: COLUMNS.stock, key: 'stock', width: 12 },
      { header: COLUMNS.minOrder, key: 'minOrder', width: 15 },
      { header: COLUMNS.hsn, key: 'hsn', width: 12 },
      { header: COLUMNS.status, key: 'status', width: 22 },
      { header: COLUMNS.tiers, key: 'tiers', width: 34 },
    ];
    for (const l of listings) {
      sheet.addRow({
        id: String(l._id),
        name: l.name,
        unit: UNIT_WORD[l.unit] ?? l.unit.toLowerCase(),
        price: l.basePrice,
        gst: `${l.gstRate ?? 18}% ${l.isGstInclusive ? 'included' : 'added on top'}`,
        stock: l.supply === 'ON_ORDER' ? 'On order' : l.stockQuantity,
        minOrder: l.minOrderQuantity ?? 1,
        hsn: l.hsn ?? '',
        status: STATUS_WORD[l.status] ?? l.status,
        tiers: tiersText(l),
      });
    }
    // Editable columns white, the rest grey; dropdown for Live / Paused
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.height = 32;
    const grey = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EFE8' } } as const;
    for (const key of ['id', 'name', 'unit', 'gst', 'tiers']) sheet.getColumn(key).eachCell((c) => { c.fill = grey; });
    sheet.getColumn('hsn').numFmt = '@';
    for (let r = 2; r <= listings.length + 1; r++) {
      const cell = sheet.getCell(`I${r}`);
      if (cell.value === 'Draft') continue;
      cell.dataValidation = { type: 'list', allowBlank: false, formulae: ['"Live,Paused"'] };
    }

    const name = `Sthiva-items-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    await book.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
}

export type SheetRow = { row: number; values: Partial<Record<keyof typeof COLUMNS, string>> };

/** Reads the uploaded sheet (first worksheet, header row found by name). */
export async function readSheet(file: { buffer: Buffer; originalname: string }): Promise<SheetRow[]> {
  const book = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet | undefined;
  try {
    if (/\.csv$/i.test(file.originalname)) {
      const { Readable } = await import('stream');
      sheet = await book.csv.read(Readable.from(file.buffer));
    } else {
      await book.xlsx.load(file.buffer as unknown as ArrayBuffer);
      sheet = book.worksheets[0];
    }
  } catch {
    throw AppError.badRequest('This file could not be read. Download a fresh sheet from Sthiva and edit that.');
  }
  if (!sheet) throw AppError.badRequest('The file has no sheet in it');

  const text = (v: ExcelJS.CellValue): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      if ('result' in v && v.result !== undefined) return text(v.result as ExcelJS.CellValue);
      if ('text' in v) return String(v.text);
      if ('richText' in v) return v.richText.map((t) => t.text).join('');
      if (v instanceof Date) return v.toISOString();
    }
    return String(v).trim();
  };

  // Find the header row (normally row 1) and map each known header to its column
  const wanted = Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][];
  let headerRow = 0;
  const colOf: Partial<Record<keyof typeof COLUMNS, number>> = {};
  for (let r = 1; r <= Math.min(sheet.rowCount, 5) && !headerRow; r++) {
    sheet.getRow(r).eachCell((cell, col) => {
      const h = text(cell.value).toLowerCase();
      const hit = wanted.find(([, label]) => label.toLowerCase() === h);
      if (hit) { colOf[hit[0]] = col; headerRow = r; }
    });
  }
  if (!headerRow || !colOf.id) throw AppError.badRequest(`The column "${COLUMNS.id}" is missing. Download a fresh sheet from Sthiva and edit that.`);

  const rows: SheetRow[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values: SheetRow['values'] = {};
    for (const [key] of wanted) {
      const col = colOf[key];
      if (col) values[key] = text(row.getCell(col).value);
    }
    if (Object.values(values).every((v) => !v)) continue; // empty line
    rows.push({ row: r, values });
    if (rows.length > MAX_ROWS) throw AppError.badRequest(`Up to ${MAX_ROWS} items per file`);
  }
  return rows;
}

const num = (s: string | undefined) => {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s.replace(/[₹,\s]|Rs\.?/gi, ''));
  return Number.isFinite(n) ? n : NaN;
};

export type RowResult = {
  row: number;
  productId?: string;
  name?: string;
  changes: { field: string; from: string; to: string }[];
  errors: string[];
  update?: Record<string, unknown>;
};

/** Checks every row against the seller's own listings and works out what would change. */
export function planRows(rows: SheetRow[], listings: Listing[]): RowResult[] {
  const byId = new Map(listings.map((l) => [String(l._id), l]));
  const seen = new Set<string>();
  return rows.map(({ row, values: v }) => {
    const out: RowResult = { row, changes: [], errors: [] };
    const id = (v.id ?? '').trim();
    const l = byId.get(id);
    if (!l) {
      out.name = v.name;
      out.errors.push(id ? 'This listing ID is not one of your items. Do not change the ID column.' : 'The listing ID is empty. Do not change the ID column.');
      return out;
    }
    out.productId = id;
    out.name = l.name;
    if (seen.has(id)) { out.errors.push('This item appears twice in the file'); return out; }
    seen.add(id);

    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    const change = (field: string, from: unknown, to: unknown) => out.changes.push({ field, from: String(from ?? ''), to: String(to ?? '') });

    const price = num(v.price);
    if (price === undefined || Number.isNaN(price) || price <= 0 || price > 10_000_000) out.errors.push('Price must be a number above 0');
    else if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) out.errors.push('Price can have at most 2 decimals');
    else if (price !== l.basePrice) { set.basePrice = Math.round(price * 100) / 100; change('Price', l.basePrice, set.basePrice); }

    const minOrder = num(v.minOrder);
    if (minOrder === undefined || Number.isNaN(minOrder) || !Number.isInteger(minOrder) || minOrder < 1 || minOrder > 100_000) out.errors.push('Minimum order must be a whole number, 1 or more');
    else if (minOrder !== (l.minOrderQuantity ?? 1)) { set.minOrderQuantity = minOrder; change('Minimum order', l.minOrderQuantity ?? 1, minOrder); }

    let stock = l.stockQuantity;
    if (l.supply === 'ON_ORDER') {
      stock = ON_ORDER_STOCK; // never runs out; whatever is typed is ignored
    } else {
      const s = num(v.stock);
      if (s === undefined || Number.isNaN(s) || !Number.isInteger(s) || s < 0 || s > 10_000_000) out.errors.push('Stock must be a whole number, 0 or more');
      else { stock = s; if (s !== l.stockQuantity) { set.stockQuantity = s; change('Stock', l.stockQuantity, s); } }
    }

    const hsn = (v.hsn ?? '').replace(/\s/g, '');
    if (hsn && !HSN_RE.test(hsn)) out.errors.push('HSN code must have 4, 6 or 8 digits');
    else if (hsn !== (l.hsn ?? '')) { if (hsn) set.hsn = hsn; else unset.hsn = ''; change('HSN code', l.hsn ?? 'none', hsn || 'none'); }

    // Live / Paused; drafts are finished on the website
    const wantStatus = (v.status ?? '').trim().toLowerCase();
    let status = l.status;
    if (l.status === 'DRAFT') {
      if (wantStatus && wantStatus !== 'draft') out.errors.push('Drafts are published on the website, not in the sheet');
    } else if (wantStatus === 'paused') {
      status = 'INACTIVE';
    } else if (wantStatus === 'live') {
      status = l.status === 'INACTIVE' ? 'ACTIVE' : l.status;
    } else {
      out.errors.push('Show to buyers must be Live or Paused');
    }
    // Stock drives availability, as everywhere else: 0 is out of stock, restocking brings it back
    if (status === 'ACTIVE' && stock <= 0) status = 'OUT_OF_STOCK';
    if (status === 'OUT_OF_STOCK' && stock > 0) status = 'ACTIVE';
    if (status !== l.status) { set.status = status; change('Status', STATUS_LABEL[l.status] ?? l.status, STATUS_LABEL[status] ?? status); }

    // A new price or minimum must still sit above the bulk prices
    if (!out.errors.length && (set.basePrice !== undefined || set.minOrderQuantity !== undefined)) {
      const problem = bulkPricingProblem(l.bulkPricing ?? [], (set.basePrice ?? l.basePrice) as number, (set.minOrderQuantity ?? l.minOrderQuantity ?? 1) as number);
      if (problem) out.errors.push(`${problem} Change the bulk prices on the website first.`);
    }

    if (!out.errors.length) out.update = { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) };
    return out;
  });
}

// POST /suppliers/me/bulk (multipart: file, apply)
export async function uploadSheet(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw AppError.badRequest('Attach the sheet (field name: "file")');
    const apply = String(req.body?.apply ?? '') === 'true';
    const profile = await SupplierProfile.findOne({ userId: req.auth!.userId }).select('_id').lean();
    if (!profile) throw AppError.notFound('Supplier profile');

    const rows = await readSheet(req.file);
    if (!rows.length) throw AppError.badRequest('The sheet has no items in it');
    const listings = await Product.find({ supplierId: profile._id, status: { $in: IN_SHEET } })
      .select('name unit basePrice gstRate isGstInclusive stockQuantity minOrderQuantity hsn status supply bulkPricing')
      .lean<Listing[]>();
    const results = planRows(rows, listings);

    const errors = results.filter((r) => r.errors.length).length;
    const changed = results.filter((r) => r.changes.length && !r.errors.length).length;
    const inFile = new Set(results.filter((r) => r.productId && !r.errors.length).map((r) => r.productId));
    const listed = listings.filter((l) => LISTED.includes(l.status));
    // Every listed item confirmed in one file = this week's Monday check
    const coversAll = listed.length > 0 && listed.every((l) => inFile.has(String(l._id)));

    let applied = false;
    let weeklyConfirmed = false;
    if (apply) {
      if (errors) throw AppError.badRequest(`Fix the ${errors} row${errors === 1 ? '' : 's'} with mistakes first. Nothing was saved.`);
      const now = new Date();
      await Product.bulkWrite(results.filter((r) => r.productId).map((r) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(r.productId), supplierId: profile._id, status: { $in: IN_SHEET } },
          update: { ...(r.update ?? {}), $set: { ...((r.update?.$set as object) ?? {}), availabilityConfirmedAt: now } },
        },
      })));
      if (coversAll) {
        await SupplierProfile.updateOne({ _id: profile._id }, { $set: { weeklyConfirmedAt: now } });
        weeklyConfirmed = true;
      }
      applied = true;
      logger.info('[bulk] applied', { supplierId: String(profile._id), rows: results.length, changed, weeklyConfirmed });
    }

    res.json(ok({
      applied,
      weeklyConfirmed,
      coversAll,
      summary: { rows: results.length, changed, unchanged: results.length - changed - errors, errors },
      rows: results.map(({ update: _u, ...r }) => r),
    }));
  } catch (err) { next(err); }
}
