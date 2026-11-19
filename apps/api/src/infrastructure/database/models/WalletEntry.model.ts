import { Schema, model, Document, Types } from 'mongoose';

// One line in a seller's Sthiva balance (features/wallet/wallet.service.ts). The balance itself lives on
// SupplierProfile.walletBalancePaise; every change to it writes exactly one entry in the same transaction.
//
// key makes each money movement happen at most once, however often it is retried:
//   topup:<razorpay order id>, hold:<order id>, mode:<order id>, cancel:<order id>, adjust:<random>
export type WalletEntryType =
  | 'TOPUP' // seller paid through Razorpay
  | 'COMMISSION' // taken when the seller accepted an order
  | 'COMMISSION_RETURN' // given back: seller delivers themselves (lower rate) or order cancelled, not their fault
  | 'ADJUSTMENT'; // added or taken by ops, with a reason (e.g. paid by bank transfer)

export interface IWalletEntry extends Document {
  _id: Types.ObjectId;
  supplierId: Types.ObjectId;
  type: WalletEntryType;
  amountPaise: number; // + adds to the balance, - takes from it
  balanceAfterPaise: number;
  key: string;
  orderId?: Types.ObjectId;
  orderNumber?: string;
  razorpayPaymentId?: string;
  note?: string;
  byUserId?: Types.ObjectId;
  createdAt: Date;
}

const walletEntrySchema = new Schema<IWalletEntry>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: 'SupplierProfile', required: true },
    type: { type: String, enum: ['TOPUP', 'COMMISSION', 'COMMISSION_RETURN', 'ADJUSTMENT'], required: true },
    amountPaise: { type: Number, required: true },
    balanceAfterPaise: { type: Number, required: true },
    key: { type: String, required: true, unique: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: String,
    razorpayPaymentId: String,
    note: { type: String, maxlength: 300 },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
walletEntrySchema.index({ supplierId: 1, createdAt: -1 });

export const WalletEntry = model<IWalletEntry>('WalletEntry', walletEntrySchema);
