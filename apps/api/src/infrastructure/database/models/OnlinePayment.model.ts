import { Schema, model, Document, Types } from 'mongoose';

// A buyer paying for a checkout online (features/payments/online.service.ts). The order is created only
// after Razorpay confirms the payment, from the cart saved here, so sellers never get unpaid orders.
//
//   CREATED ──payment confirmed──▶ ORDERED (orderIds set)
//      └──────payment confirmed, but the order could not be made──▶ REFUNDED (whole amount back)
export interface IOnlinePayment extends Document {
  _id: Types.ObjectId;
  buyerId: Types.ObjectId;
  // The checkout as the buyer sent it (validated CreateOrderInput)
  input: Record<string, unknown>;
  amountPaise: number;
  discountPercent: number;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  status: 'CREATED' | 'ORDERED' | 'REFUNDING' | 'REFUNDED';
  orderIds: Types.ObjectId[];
  refund?: { razorpayRefundId?: string; reason: string; error?: string };
  createdAt: Date;
  updatedAt: Date;
}

const onlinePaymentSchema = new Schema<IOnlinePayment>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    input: { type: Schema.Types.Mixed, required: true },
    amountPaise: { type: Number, required: true, min: 100 },
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: String,
    status: { type: String, enum: ['CREATED', 'ORDERED', 'REFUNDING', 'REFUNDED'], default: 'CREATED' },
    orderIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Order' }], default: [] },
    refund: { _id: false, razorpayRefundId: String, reason: String, error: String },
  },
  { timestamps: true, minimize: false }
);

export const OnlinePayment = model<IOnlinePayment>('OnlinePayment', onlinePaymentSchema);
