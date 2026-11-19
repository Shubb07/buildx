import { Schema, model, Document, Types } from 'mongoose';

// A buyer's report of a problem with a delivered order (features/problems). Returns rules come from
// each order line's returnPolicy, as promised when ordered (owner decision 2026-11-20):
//   problems (damaged, wrong, short, defective): noted at delivery, or within the line's window;
//   change of mind: sealed items only, within the line's window, the buyer paying the return trip.
// Flow: OPEN (seller asked) -> SELLER_REPLIED -> RESOLVED or REJECTED by Sthiva's team; the buyer can
// withdraw it while it is open. A refund is paid to the buyer's UPI within 3 working days. When the
// seller is at fault, sellerCharge is taken from their next payout statement (settlementId).

export type ProblemKind = 'DAMAGED' | 'WRONG_ITEM' | 'SHORT' | 'DEFECTIVE' | 'CHANGE_OF_MIND';
export type ProblemStatus = 'OPEN' | 'SELLER_REPLIED' | 'RESOLVED' | 'REJECTED' | 'WITHDRAWN';

export interface IProblemLine {
  index: number;          // position in order.items
  name: string;
  unit: string;
  quantity: number;       // how many are affected
  orderedQuantity: number;
  buyerUnitPrice: number; // what the buyer paid per unit, GST included (lineTotal / quantity)
  sellerShare: number;    // seller's part of the buyer price, 0..1 (supplierLineTotal / lineTotal)
}

export interface IProblemReport extends Document {
  _id: Types.ObjectId;
  number: string;          // PR-261120-3F9A1C
  orderId: Types.ObjectId;
  orderNumber: string;
  buyerId: Types.ObjectId;
  supplierId: Types.ObjectId;
  kind: ProblemKind;
  lines: IProblemLine[];
  description: string;
  photos: string[];
  want: 'REFUND' | 'REPLACEMENT';
  upiId?: string;          // where a refund goes
  claimValue: number;      // Σ affected quantity × buyer unit price, rupees
  status: ProblemStatus;
  sellerReply?: { agrees: boolean; note?: string; at: Date };
  resolution?: {
    outcome: 'REFUND' | 'REPLACEMENT' | 'REJECTED';
    atFault: 'SELLER' | 'BUYER' | 'NONE';
    refundAmount: number;      // to the buyer
    returnTripCharge: number;  // cost of collecting the goods
    sellerCharge: number;      // taken from the seller's next payout
    note: string;
    refundDueBy?: string;      // YYYY-MM-DD, 3 working days
    by: Types.ObjectId;
    at: Date;
  };
  refund?: { paidAt: Date; reference: string; by: Types.ObjectId };
  settlementId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const problemSchema = new Schema<IProblemReport>(
  {
    number: { type: String, required: true, unique: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'SupplierProfile', required: true, index: true },
    kind: { type: String, enum: ['DAMAGED', 'WRONG_ITEM', 'SHORT', 'DEFECTIVE', 'CHANGE_OF_MIND'], required: true },
    lines: [{
      _id: false,
      index: { type: Number, required: true },
      name: { type: String, required: true },
      unit: { type: String, required: true },
      quantity: { type: Number, required: true },
      orderedQuantity: { type: Number, required: true },
      buyerUnitPrice: { type: Number, required: true },
      sellerShare: { type: Number, required: true },
    }],
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    photos: [{ type: String }],
    want: { type: String, enum: ['REFUND', 'REPLACEMENT'], required: true },
    upiId: { type: String, trim: true, maxlength: 60 },
    claimValue: { type: Number, required: true },
    status: { type: String, enum: ['OPEN', 'SELLER_REPLIED', 'RESOLVED', 'REJECTED', 'WITHDRAWN'], default: 'OPEN', index: true },
    sellerReply: { _id: false, agrees: Boolean, note: String, at: Date },
    resolution: {
      _id: false,
      outcome: { type: String, enum: ['REFUND', 'REPLACEMENT', 'REJECTED'] },
      atFault: { type: String, enum: ['SELLER', 'BUYER', 'NONE'] },
      refundAmount: Number,
      returnTripCharge: Number,
      sellerCharge: Number,
      note: String,
      refundDueBy: String,
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
    },
    refund: { _id: false, paidAt: Date, reference: String, by: { type: Schema.Types.ObjectId, ref: 'User' } },
    settlementId: { type: Schema.Types.ObjectId, ref: 'Settlement', index: true },
  },
  { timestamps: true }
);

problemSchema.index({ supplierId: 1, status: 1, settlementId: 1 });

export const ProblemReport = model<IProblemReport>('ProblemReport', problemSchema);
