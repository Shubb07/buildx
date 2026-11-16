import { Schema, model, Types } from 'mongoose';

// GST invoice issued by the SUPPLIER to the buyer (owner decision 2026-11-16: marketplace model).
// Everything printed is copied here when the invoice is issued, so later edits to the supplier's
// profile, the listing or the order never change an invoice that was already given.
// TAX_INVOICE when the supplier has a GSTIN, BILL_OF_SUPPLY when they are not GST-registered.

export type InvoiceLine = {
  name: string;
  hsn?: string;
  quantity: number;
  unit: string;
  rate: number;        // taxable value per unit
  taxable: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export interface IInvoice {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  orderNumber: string;
  supplierId: Types.ObjectId;
  buyerId: Types.ObjectId;
  kind: 'TAX_INVOICE' | 'BILL_OF_SUPPLY';
  number: string;          // e.g. INV/2627/00001, one series per supplier, kind and financial year
  financialYear: string;   // '2627' = April 2026 to March 2027
  issuedAt: Date;
  seller: { name: string; gstin?: string; address?: string; state?: string; stateCode?: string };
  buyer: { name: string; gstin?: string; businessName?: string; address: string; pincode?: string; state?: string; phone?: string };
  placeOfSupply: { state?: string; stateCode?: string };
  interState: boolean;     // IGST when true, CGST + SGST when false
  lines: InvoiceLine[];
  totals: { taxable: number; cgst: number; sgst: number; igst: number; total: number };
  deliveryCharge: number;  // shown as a note: not part of the supplier's invoice
  createdAt: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    orderNumber: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'SupplierProfile', required: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['TAX_INVOICE', 'BILL_OF_SUPPLY'], required: true },
    number: { type: String, required: true },
    financialYear: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    seller: { _id: false, name: String, gstin: String, address: String, state: String, stateCode: String },
    buyer: { _id: false, name: String, gstin: String, businessName: String, address: String, pincode: String, state: String, phone: String },
    placeOfSupply: { _id: false, state: String, stateCode: String },
    interState: { type: Boolean, required: true },
    lines: [{
      _id: false, name: String, hsn: String, quantity: Number, unit: String, rate: Number, taxable: Number,
      gstRate: Number, cgst: Number, sgst: Number, igst: Number, total: Number,
    }],
    totals: { _id: false, taxable: Number, cgst: Number, sgst: Number, igst: Number, total: Number },
    deliveryCharge: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// A number is never used twice by the same supplier
invoiceSchema.index({ supplierId: 1, number: 1 }, { unique: true });

export const Invoice = model<IInvoice>('Invoice', invoiceSchema);

// Gap-free running number per supplier, kind and financial year (GST rules want consecutive numbers)
const counterSchema = new Schema<{ supplierId: Types.ObjectId; series: string; seq: number }>({
  supplierId: { type: Schema.Types.ObjectId, required: true },
  series: { type: String, required: true }, // e.g. INV/2627
  seq: { type: Number, required: true, default: 0 },
});
counterSchema.index({ supplierId: 1, series: 1 }, { unique: true });
export const InvoiceCounter = model('InvoiceCounter', counterSchema);
