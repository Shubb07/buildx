import { Schema, model, Document, Types } from 'mongoose';

// One document (key 'default') holding platform rules an admin controls.
export interface IPlatformSettings extends Document {
  _id: Types.ObjectId;
  key: 'default';
  // How long a supplier has to accept an order offer before it moves to the next supplier.
  // null = offers never expire on their own; ops moves them by hand.
  offerTimeoutMinutes: number | null;
  // Share of the delivery charge a Sthiva delivery partner earns (percent). null = not set yet.
  driverSharePercent: number | null;
  // Minutes a driver has to accept a delivery job before it goes to the next driver. null = no limit.
  driverOfferTimeoutMinutes: number | null;
  // Seller balance (features/wallet): when on, a seller needs enough balance to accept an order and the
  // commission is taken from it. Off until Razorpay is live, so no seller is blocked by a missing gateway.
  sellerWalletEnabled: boolean;
  // Smallest top-up a seller can make, in rupees (owner decision 2026-11-21: Rs 1,000)
  minTopUpRupees: number;
  // Buyers may pay online at checkout (features/payments). Off until Razorpay is live.
  onlinePaymentsEnabled: boolean;
  // Percent off the delivery charge when the buyer pays online (owner decision 2026-11-21: 25). Sthiva pays it.
  prepayDeliveryDiscountPercent: number;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const platformSettingsSchema = new Schema<IPlatformSettings>(
  {
    key: { type: String, enum: ['default'], default: 'default', unique: true },
    offerTimeoutMinutes: { type: Number, min: 1, max: 1440, default: null },
    driverSharePercent: { type: Number, min: 0, max: 100, default: null },
    driverOfferTimeoutMinutes: { type: Number, min: 1, max: 1440, default: null },
    sellerWalletEnabled: { type: Boolean, default: false },
    minTopUpRupees: { type: Number, min: 1, max: 1_00_000, default: 1000 },
    onlinePaymentsEnabled: { type: Boolean, default: false },
    prepayDeliveryDiscountPercent: { type: Number, min: 0, max: 100, default: 25 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const PlatformSettings = model<IPlatformSettings>('PlatformSettings', platformSettingsSchema);

/** The settings document, created empty on first use. */
export async function getPlatformSettings() {
  return PlatformSettings.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default' } },
    { upsert: true, new: true }
  ).lean();
}
