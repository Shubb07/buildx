import { Schema, model, Document, Types } from 'mongoose';

export interface ISupplierProfile extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  businessName: string;
  description?: string;
  // How the business sells, as Indian trade knows it
  businessType?: 'RETAILER' | 'DEALER' | 'DISTRIBUTOR' | 'MANUFACTURER';
  gstin?: string; // 15-character GST identification number, optional (small traders may be unregistered)
  address?: string; // shop or yard address
  categories: string[]; // category slugs the supplier sells in
  brands: string[]; // brands the supplier deals in (dealership / stockist)
  deliveryRadiusKm: number;
  // Has their own vehicle and can deliver orders themselves (else Sthiva's delivery partners do)
  canDeliver: boolean;
  // Where goods are picked up (shop or yard); needed to price delivery by distance
  location?: { lat: number; lng: number };
  serviceAreas: string[];   // free-text town names, display only (mobile shows them)
  // PIN codes this supplier delivers to; each validated against the India Post directory when
  // added (features/serviceability). Empty = serves nowhere — never "everywhere".
  servicePincodes: string[];
  logoUrl?: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  // Verification papers (owner decision 2026-11-05: GST certificate if registered, and a shop licence or
  // Udyam certificate). Private Cloudinary files: only publicId is kept, never a public URL. One per type.
  kycDocuments: {
    type: 'GST' | 'SHOP_LICENSE' | 'UDYAM' | 'AADHAAR' | 'BANK_STATEMENT';
    publicId: string;
    format?: string;
    status?: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
    note?: string;
    uploadedAt?: Date;
    reviewedAt?: Date;
    // Last day the paper is valid (shop licences expire; GST and Udyam usually do not). Optional.
    expiresOn?: Date;
    // Last expiry notice sent for this paper (features/suppliers/document-expiry.ts)
    expiryNotice?: 'D30' | 'D7' | 'EXPIRED';
    url?: string;      // legacy field, never set by current code
    verified: boolean; // kept in step with status === 'ACCEPTED'
  }[];
  // Verification audit trail (newest last, capped at 100): who did what and when
  verificationLog: {
    at: Date;
    by?: Types.ObjectId; // user who acted; empty for automatic entries
    actor: 'SUPPLIER' | 'OPS' | 'SYSTEM';
    action: string; // e.g. VERIFIED, REJECTED, DOC_ACCEPTED, GSTIN_CHANGED, RE_REVIEW
    note?: string;
  }[];
  // Weekly availability check (features/suppliers/weekly.ts)
  // Sthiva balance in paise (features/wallet): topped up through Razorpay, commission taken on accept.
  // Changed only by wallet.service.ts, always together with a WalletEntry.
  walletBalancePaise: number;
  // Where Sthiva sends this seller's money (features/suppliers/payout-account.ts). The full account
  // number or UPI ID is encrypted (shared/secret-box.ts); it and the proof file are never selected
  // unless asked for with "+payoutAccount.secret".
  payoutAccount?: {
    method: 'BANK' | 'UPI';
    holderName: string;
    secret: string;          // sealed account number or UPI ID
    masked: string;          // e.g. "•••• 1234" or "ra••••@okhdfcbank", safe to show
    ifsc?: string;           // BANK only
    proofPublicId?: string;  // private photo or PDF of a cancelled cheque or passbook page (BANK)
    proofFormat?: string;
    status: 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
    note?: string;
    submittedAt: Date;
    reviewedAt?: Date;
    reviewedBy?: Types.ObjectId;
    holdUntil?: Date;        // payouts paused until then, after a verified account was changed
  };
  // The seller agreement version they accepted, when, and from where (features/suppliers/go-live.ts)
  termsAcceptance?: { version: string; at: Date; ip?: string; userAgent?: string };
  weeklyConfirmedAt?: Date;
  weeklyReminderFor?: Date; // week start of the last Monday reminder sent
  weeklyHiddenNoticeFor?: Date; // week start of the last "your items are hidden" notice
  avgRating: number;
  totalReviews: number;
  totalDeliveries: number;
  whatsappOnly: boolean;
  whatsappNumber: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const supplierProfileSchema = new Schema<ISupplierProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    businessName: { type: String, required: true, trim: true },
    description: String,
    businessType: { type: String, enum: ['RETAILER', 'DEALER', 'DISTRIBUTOR', 'MANUFACTURER'] },
    gstin: { type: String, uppercase: true, trim: true, match: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/ },
    address: { type: String, trim: true, maxlength: 300 },
    categories: [{ type: String }],
    brands: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    deliveryRadiusKm: { type: Number, default: 30 },
    canDeliver: { type: Boolean, default: false },
    location: { _id: false, lat: { type: Number, min: -90, max: 90 }, lng: { type: Number, min: -180, max: 180 } },
    serviceAreas: [String],
    servicePincodes: {
      type: [{ type: String, match: /^[1-9]\d{5}$/ }],
      default: [],
    },
    logoUrl: String,
    verificationStatus: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
    kycDocuments: [
      {
        _id: false,
        type: { type: String, enum: ['GST', 'SHOP_LICENSE', 'UDYAM', 'AADHAAR', 'BANK_STATEMENT'] },
        url: String,
        publicId: String,
        format: String,
        status: { type: String, enum: ['SUBMITTED', 'ACCEPTED', 'REJECTED'], default: 'SUBMITTED' },
        note: { type: String, trim: true, maxlength: 300 },
        uploadedAt: Date,
        reviewedAt: Date,
        expiresOn: Date,
        expiryNotice: { type: String, enum: ['D30', 'D7', 'EXPIRED'] },
        verified: { type: Boolean, default: false },
      },
    ],
    verificationLog: {
      type: [{
        _id: false,
        at: { type: Date, required: true },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        actor: { type: String, enum: ['SUPPLIER', 'OPS', 'SYSTEM'], required: true },
        action: { type: String, required: true, maxlength: 40 },
        note: { type: String, trim: true, maxlength: 300 },
      }],
      default: [],
    },
    walletBalancePaise: { type: Number, default: 0, min: 0 },
    payoutAccount: {
      type: new Schema({
        method: { type: String, enum: ['BANK', 'UPI'], required: true },
        holderName: { type: String, required: true, trim: true, maxlength: 100 },
        secret: { type: String, required: true, select: false },
        masked: { type: String, required: true },
        ifsc: { type: String, uppercase: true, match: /^[A-Z]{4}0[A-Z0-9]{6}$/ },
        proofPublicId: { type: String, select: false },
        proofFormat: String,
        status: { type: String, enum: ['SUBMITTED', 'VERIFIED', 'REJECTED'], required: true },
        note: { type: String, trim: true, maxlength: 300 },
        submittedAt: { type: Date, required: true },
        reviewedAt: Date,
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        holdUntil: Date,
      }, { _id: false }),
      required: false,
    },
    termsAcceptance: {
      _id: false,
      version: String,
      at: Date,
      ip: String,
      userAgent: String,
    },
    weeklyConfirmedAt: Date,
    weeklyReminderFor: Date,
    weeklyHiddenNoticeFor: Date,
    avgRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    totalDeliveries: { type: Number, default: 0 },
    whatsappOnly: { type: Boolean, default: false },
    whatsappNumber: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Which suppliers serve a PIN (multikey)
supplierProfileSchema.index({ servicePincodes: 1, verificationStatus: 1, isActive: 1 });
// One GSTIN per seller is enforced in features/suppliers/verification.ts (a clear message beats a
// duplicate-key error); this index only makes that lookup fast.
supplierProfileSchema.index({ gstin: 1 }, { sparse: true });
// Expiry reminders look for papers running out soon
supplierProfileSchema.index({ 'kycDocuments.expiresOn': 1 }, { sparse: true });

export const SupplierProfile = model<ISupplierProfile>('SupplierProfile', supplierProfileSchema);
