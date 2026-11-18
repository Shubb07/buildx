import { Schema, model, Document, Types } from 'mongoose';

// A buyer's review of a delivered order (features/reviews). Counts for the seller who delivered it and
// for every item in the order: buyers don't choose the seller (Sthiva picks one per order), so the
// product page shows reviews of the item from all sellers.
export interface IReview extends Document {
  _id: Types.ObjectId;
  reviewerId: Types.ObjectId;
  reviewerName?: string;       // shown publicly as first name and initial, e.g. "Ravi K."
  supplierId: Types.ObjectId;
  productId: Types.ObjectId;   // first item's listing (older reviews have only this)
  catalogItemIds: Types.ObjectId[];
  orderId: Types.ObjectId;
  rating: number;
  comment?: string;
  onTime?: boolean;            // delivered on the promised date?
  asListed?: boolean;          // quality and quantity as listed?
  images: string[];
  isVerifiedPurchase: boolean;
  createdAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewerName: { type: String, maxlength: 40 },
    supplierId: { type: Schema.Types.ObjectId, ref: 'SupplierProfile', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    catalogItemIds: { type: [{ type: Schema.Types.ObjectId, ref: 'CatalogItem' }], default: [], index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500 },
    onTime: Boolean,
    asListed: Boolean,
    images: [String],
    isVerifiedPurchase: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Review = model<IReview>('Review', reviewSchema);
