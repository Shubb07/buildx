import { Schema, model, Types } from 'mongoose';

// A buyer's request for a bulk quote (features/quotes): a list of catalogue items with quantities,
// the site PIN and a needed-by date. Verified sellers near the site reply with their price per item
// and a delivery date; the buyer accepts one, which becomes a confirmed order at those prices.

export type QuoteLine = { catalogItemId: Types.ObjectId; categoryId: Types.ObjectId; name: string; unit: string; quantity: number; gstRate: number };
export type SellerQuote = {
  _id: Types.ObjectId;
  supplierId: Types.ObjectId;
  prices: number[];            // seller's price per unit for each line, in rupees, same order as lines
  isGstInclusive: boolean;     // are those prices including GST?
  deliveryCharge: number;      // rupees, 0 = free
  deliveryDate: string;        // YYYY-MM-DD, India time, on or before neededBy
  note?: string;
  at: Date;
  status: 'ACTIVE' | 'WITHDRAWN' | 'ACCEPTED' | 'NOT_CHOSEN';
};

export interface IQuoteRequest {
  _id: Types.ObjectId;
  number: string;              // RQ-XXXXXX
  buyerId: Types.ObjectId;
  lines: QuoteLine[];
  deliveryAddress: { label: string; fullAddress: string; pincode: string; district?: string; state?: string; contactPhone: string; lat?: number; lng?: number };
  neededBy: string;            // YYYY-MM-DD
  notes?: string;
  status: 'OPEN' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';
  expiresAt: Date;             // sellers can reply until then
  invitedSupplierIds: Types.ObjectId[];
  quotes: SellerQuote[];
  acceptedQuoteId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const quoteRequestSchema = new Schema<IQuoteRequest>(
  {
    number: { type: String, required: true, unique: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lines: [{
      _id: false,
      catalogItemId: { type: Schema.Types.ObjectId, ref: 'CatalogItem', required: true },
      categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
      name: { type: String, required: true },
      unit: { type: String, required: true },
      quantity: { type: Number, required: true, min: 0.001 },
      gstRate: { type: Number, required: true },
    }],
    deliveryAddress: {
      _id: false,
      label: String, fullAddress: String, pincode: { type: String, required: true }, district: String, state: String,
      contactPhone: String, lat: Number, lng: Number,
    },
    neededBy: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    notes: { type: String, maxlength: 500 },
    status: { type: String, enum: ['OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED'], default: 'OPEN', index: true },
    expiresAt: { type: Date, required: true },
    invitedSupplierIds: { type: [{ type: Schema.Types.ObjectId, ref: 'SupplierProfile' }], index: true, default: [] },
    quotes: [{
      supplierId: { type: Schema.Types.ObjectId, ref: 'SupplierProfile', required: true },
      prices: [Number],
      isGstInclusive: { type: Boolean, default: true },
      deliveryCharge: { type: Number, default: 0, min: 0 },
      deliveryDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
      note: { type: String, maxlength: 300 },
      at: Date,
      status: { type: String, enum: ['ACTIVE', 'WITHDRAWN', 'ACCEPTED', 'NOT_CHOSEN'], default: 'ACTIVE' },
    }],
    acceptedQuoteId: Schema.Types.ObjectId,
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  },
  { timestamps: true }
);

export const QuoteRequest = model<IQuoteRequest>('QuoteRequest', quoteRequestSchema);
