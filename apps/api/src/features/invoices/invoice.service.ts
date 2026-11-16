// GST invoices (owner decision 2026-11-16): the supplier bills the buyer; Sthiva is the marketplace.
// An invoice is issued once, when the goods leave the supplier (first of PICKED_UP, IN_TRANSIT or
// DELIVERED), and never changes afterwards. Prices on the invoice are the ones the buyer pays.
//
// Tax split: same state for supplier (GSTIN state) and place of supply (delivery state) -> CGST +
// SGST, half each; different states -> IGST. A supplier without a GSTIN issues a bill of supply.

import mongoose, { Types } from 'mongoose';
import { Invoice, InvoiceCounter, type IInvoice, type InvoiceLine } from '../../infrastructure/database/models/Invoice.model';
import { Order } from '../../infrastructure/database/models/Order.model';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { User } from '../../infrastructure/database/models/User.model';
import { GST_STATES, checkGstin, sameGstState } from '../../shared/gstin';
import { logger } from '../../shared/logger/logger';

/** Statuses that mean the goods have left the supplier */
export const DISPATCHED = ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] as const;

/** Indian financial year of a date, as '2627' for April 2026 to March 2027 (IST) */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + 330 * 60000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start % 100).padStart(2, '0')}${String((start + 1) % 100).padStart(2, '0')}`;
}

/** GST state code for a state name from the postal directory, if it can be matched */
export function stateCodeFor(stateName?: string): string | undefined {
  if (!stateName) return undefined;
  // Prefer the current codes (37 Andhra Pradesh, 26 Dadra and Nagar Haveli and Daman and Diu)
  const order = Object.keys(GST_STATES).sort((a, b) => (a === '37' || a === '26' ? -1 : b === '37' || b === '26' ? 1 : 0));
  return order.find((code) => sameGstState(code, stateName));
}

const paise = (r: number) => Math.round(r * 100);
const rupees = (p: number) => p / 100;

/** Splits each line's GST into CGST + SGST (same state) or IGST, to the paisa */
export function invoiceLines(
  items: { name: string; hsn?: string; quantity: number; unit: string; taxableValue: number; gstRate: number; gstAmount: number; lineTotal: number }[],
  interState: boolean,
  taxed: boolean
): InvoiceLine[] {
  return items.map((i) => {
    const gst = taxed ? paise(i.gstAmount) : 0;
    const cgst = interState ? 0 : Math.floor(gst / 2);
    const sgst = interState ? 0 : gst - cgst;
    // A bill of supply has no tax lines: the whole amount is the value of the goods
    const taxable = taxed ? paise(i.taxableValue) : paise(i.lineTotal);
    return {
      name: i.name,
      ...(i.hsn ? { hsn: i.hsn } : {}),
      quantity: i.quantity,
      unit: i.unit,
      rate: rupees(Math.round(taxable / Math.max(i.quantity, 1))),
      taxable: rupees(taxable),
      gstRate: taxed ? i.gstRate : 0,
      cgst: rupees(cgst),
      sgst: rupees(sgst),
      igst: rupees(interState ? gst : 0),
      total: rupees(taxable + gst),
    };
  });
}

/**
 * Issues the invoice for a dispatched order, once. Safe to call again: returns the existing one.
 * Returns null when the order is not dispatched yet (or does not exist).
 */
export async function issueInvoice(orderId: string | Types.ObjectId): Promise<IInvoice | null> {
  const existing = await Invoice.findOne({ orderId }).lean<IInvoice>();
  if (existing) return existing;

  const order = await Order.findById(orderId).lean();
  if (!order || !(DISPATCHED as readonly string[]).includes(order.status)) return null;

  const [supplier, buyer] = await Promise.all([
    SupplierProfile.findById(order.supplierId).select('businessName gstin address').lean(),
    User.findById(order.buyerId).select('name').lean(),
  ]);
  if (!supplier) return null;

  const g = supplier.gstin ? checkGstin(supplier.gstin) : null;
  const taxed = !!g?.ok;
  const sellerStateCode = g?.ok ? g.stateCode : undefined;
  const a = order.deliveryAddress as { fullAddress: string; pincode?: string; state?: string; contactPhone?: string };
  const buyerGst = (order as { buyerGst?: { gstin: string; businessName: string } }).buyerGst;
  // Place of supply: where the goods are delivered; else the buyer's GSTIN state; else the supplier's
  const posCode = stateCodeFor(a.state) ?? (buyerGst ? buyerGst.gstin.slice(0, 2) : undefined) ?? sellerStateCode;
  const interState = taxed && !!posCode && !!sellerStateCode && posCode !== sellerStateCode;

  const lines = invoiceLines(order.items as Parameters<typeof invoiceLines>[0], interState, taxed);
  const sum = (f: (l: InvoiceLine) => number) => rupees(lines.reduce((s, l) => s + paise(f(l)), 0));
  const issuedAt = new Date();
  const fy = financialYear(issuedAt);
  const series = `${taxed ? 'INV' : 'BOS'}/${fy}`;

  const session = await mongoose.startSession();
  try {
    let created: IInvoice | null = null;
    await session.withTransaction(async () => {
      // Another request may have issued it meanwhile
      const again = await Invoice.findOne({ orderId: order._id }).session(session).lean<IInvoice>();
      if (again) { created = again; return; }
      const counter = await InvoiceCounter.findOneAndUpdate(
        { supplierId: supplier._id, series },
        { $inc: { seq: 1 } },
        { upsert: true, new: true, session }
      );
      const [doc] = await Invoice.create([{
        orderId: order._id,
        orderNumber: order.orderNumber,
        supplierId: supplier._id,
        buyerId: order.buyerId,
        kind: taxed ? 'TAX_INVOICE' : 'BILL_OF_SUPPLY',
        number: `${series}/${String(counter.seq).padStart(5, '0')}`,
        financialYear: fy,
        issuedAt,
        seller: {
          name: supplier.businessName,
          ...(taxed ? { gstin: supplier.gstin } : {}),
          ...(supplier.address ? { address: supplier.address } : {}),
          ...(sellerStateCode ? { state: GST_STATES[sellerStateCode], stateCode: sellerStateCode } : {}),
        },
        buyer: {
          name: buyer?.name ?? 'Buyer',
          ...(buyerGst ? { gstin: buyerGst.gstin, businessName: buyerGst.businessName } : {}),
          address: a.fullAddress,
          ...(a.pincode ? { pincode: a.pincode } : {}),
          ...(a.state ? { state: a.state } : {}),
          ...(a.contactPhone ? { phone: a.contactPhone } : {}),
        },
        placeOfSupply: posCode ? { state: GST_STATES[posCode], stateCode: posCode } : {},
        interState,
        lines,
        totals: { taxable: sum((l) => l.taxable), cgst: sum((l) => l.cgst), sgst: sum((l) => l.sgst), igst: sum((l) => l.igst), total: sum((l) => l.total) },
        deliveryCharge: order.deliveryCharge ?? 0,
      }], { session });
      created = doc.toObject() as IInvoice;
    });
    if (created) logger.info('[invoices] issued', { orderId: String(order._id), number: (created as IInvoice).number });
    return created;
  } catch (err: any) {
    // Issued at the same moment by another request (one invoice per order): use that one
    if (err?.code === 11000 || err?.codeName === 'WriteConflict' || err?.code === 112) {
      const done = await Invoice.findOne({ orderId: order._id }).lean<IInvoice>();
      if (done) return done;
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

/** Best effort after a status change: an invoice problem must never block the delivery */
export function issueInvoiceInBackground(orderId: string | Types.ObjectId) {
  issueInvoice(orderId).catch((err) => logger.error('[invoices] issue failed', { orderId: String(orderId), error: err?.message }));
}
