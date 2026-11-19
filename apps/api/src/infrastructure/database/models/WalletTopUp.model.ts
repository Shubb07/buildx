import { Schema, model, Document, Types } from 'mongoose';

// A seller's top-up attempt: one Razorpay order. CREATED until Razorpay confirms the payment, then PAID
// (the balance is credited exactly once, see features/wallet/wallet.service.ts). Payments that never
// finish simply stay CREATED; nothing is credited for them.
export interface IWalletTopUp extends Document {
  _id: Types.ObjectId;
  supplierId: Types.ObjectId;
  userId: Types.ObjectId;
  amountPaise: number;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  status: 'CREATED' | 'PAID';
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const walletTopUpSchema = new Schema<IWalletTopUp>(
  {
    supplierId: { type: Schema.Types.ObjectId, ref: 'SupplierProfile', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amountPaise: { type: Number, required: true, min: 100 },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: String,
    status: { type: String, enum: ['CREATED', 'PAID'], default: 'CREATED' },
    paidAt: Date,
  },
  { timestamps: true }
);

export const WalletTopUp = model<IWalletTopUp>('WalletTopUp', walletTopUpSchema);
