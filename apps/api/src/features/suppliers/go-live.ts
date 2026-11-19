// The seller's road to going live, like a food-delivery partner's onboarding: every thing a seller
// must hand over, in order, each with its status. One list, worked out here, so the seller website
// and the ops console show exactly the same thing.
//
//   1 Business details       2 Delivery area        3 What you sell
//   4 Verification papers    5 Payout account       6 Seller agreement
//   7 First products         then: Sthiva checks the seller (verificationStatus)

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ok } from '@sthiva/shared';
import { SupplierProfile, type ISupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { Product } from '../../infrastructure/database/models/Product.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import { logEntry, pushLog } from './verification';

/** Bump when the seller agreement text changes (seller-web app/(dashboard)/agreement): everyone accepts again */
export const SELLER_TERMS_VERSION = '2026-11-20.2';

export type StepStatus = 'TODO' | 'WAITING' | 'DONE' | 'PROBLEM';
export type GoLiveStep = { key: string; label: string; status: StepStatus; detail: string; href: string };

type Profile = Pick<ISupplierProfile, 'businessType' | 'servicePincodes' | 'categories' | 'gstin' | 'kycDocuments' | 'payoutAccount' | 'termsAcceptance' | 'verificationStatus'>;

export function goLiveSteps(p: Profile, listedProducts: number): GoLiveStep[] {
  const docs = (p.kycDocuments ?? []).filter((d) => d.publicId);
  const docStatus = (type: string) => {
    const d = docs.find((x) => x.type === type);
    return d ? (d.status ?? (d.verified ? 'ACCEPTED' : 'SUBMITTED')) : null;
  };
  // Papers: a shop licence or Udyam certificate, plus the GST certificate when a GSTIN is given
  const needed = [p.gstin ? ['GST'] : [], ['SHOP_LICENSE', 'UDYAM']] as string[][];
  const groups = needed.filter((g) => g.length).map((g) => g.map(docStatus).filter(Boolean) as string[]);
  const papers: StepStatus = groups.some((g) => g.length === 0) ? 'TODO'
    : groups.some((g) => g.every((s) => s === 'REJECTED')) ? 'PROBLEM'
    : groups.every((g) => g.includes('ACCEPTED')) ? 'DONE' : 'WAITING';

  const pay = p.payoutAccount;
  const terms = p.termsAcceptance?.version === SELLER_TERMS_VERSION;

  return [
    { key: 'business', label: 'Business details', href: '/setup', status: p.businessType ? 'DONE' : 'TODO',
      detail: p.businessType ? 'Name, type, address and shop location saved.' : 'Your business name, type, address and where your shop is.' },
    { key: 'area', label: 'Delivery area', href: '/setup', status: (p.servicePincodes ?? []).length ? 'DONE' : 'TODO',
      detail: (p.servicePincodes ?? []).length ? `${p.servicePincodes.length} PIN code${p.servicePincodes.length === 1 ? '' : 's'} added.` : 'The PIN codes you deliver to.' },
    { key: 'range', label: 'What you sell', href: '/setup', status: (p.categories ?? []).length ? 'DONE' : 'TODO',
      detail: (p.categories ?? []).length ? 'Categories and brands saved.' : 'Your categories and the brands you deal in.' },
    { key: 'papers', label: 'Verification papers', href: '/setup', status: papers,
      detail: papers === 'DONE' ? 'Accepted by Sthiva.'
        : papers === 'WAITING' ? 'Uploaded. Sthiva is checking them.'
        : papers === 'PROBLEM' ? 'A paper was not accepted. Upload a clear copy again.'
        : p.gstin ? 'GST certificate, and a shop licence or Udyam certificate.' : 'A shop licence or Udyam certificate (and the GST certificate if you have a GSTIN).' },
    { key: 'payout', label: 'Payout account', href: '/payouts',
      status: !pay ? 'TODO' : pay.status === 'VERIFIED' ? 'DONE' : pay.status === 'REJECTED' ? 'PROBLEM' : 'WAITING',
      detail: !pay ? 'The bank account or UPI ID where Sthiva pays you.'
        : pay.status === 'VERIFIED' ? `Verified: ${pay.masked}.`
        : pay.status === 'REJECTED' ? 'Not accepted. Add it again.' : `Added (${pay.masked}). Sthiva is checking it.` },
    { key: 'agreement', label: 'Seller agreement', href: '/agreement', status: terms ? 'DONE' : 'TODO',
      detail: terms ? 'Accepted.' : p.termsAcceptance ? 'The agreement was updated. Read and accept the new version.' : 'Read and accept how selling on Sthiva works.' },
    { key: 'products', label: 'Your products', href: '/products/quick', status: listedProducts > 0 ? 'DONE' : 'TODO',
      detail: listedProducts > 0 ? `${listedProducts} listed.` : 'List what you sell, with your price and stock.' },
  ];
}

export function reviewState(p: Profile, steps: GoLiveStep[]) {
  const ready = steps.every((s) => s.status === 'DONE' || s.status === 'WAITING');
  return {
    status: p.verificationStatus,
    detail: p.verificationStatus === 'VERIFIED' ? 'You are live. Buyers can order your products.'
      : p.verificationStatus === 'REJECTED' ? 'Verification was not approved. Contact Sthiva support.'
      : ready ? 'Everything is in. Sthiva checks your details, usually within one working day.'
      : 'Finish the steps above. Sthiva checks your details once they are in.',
  };
}

const LISTED = { status: { $in: ['ACTIVE', 'OUT_OF_STOCK', 'INACTIVE'] } };

// GET /suppliers/me/go-live
export async function myGoLive(req: Request, res: Response, next: NextFunction) {
  try {
    const p = await SupplierProfile.findOne({ userId: req.auth!.userId })
      .select('businessType servicePincodes categories gstin kycDocuments payoutAccount termsAcceptance verificationStatus').lean();
    if (!p) throw AppError.notFound('Supplier profile');
    const listed = await Product.countDocuments({ supplierId: p._id, ...LISTED });
    const steps = goLiveSteps(p, listed);
    res.json(ok({ steps, done: steps.filter((s) => s.status === 'DONE').length, total: steps.length, review: reviewState(p, steps), termsVersion: SELLER_TERMS_VERSION }));
  } catch (err) { next(err); }
}

/** Go-live steps for many sellers at once (ops list): one count query */
export async function goLiveFor(profiles: (Profile & { _id: unknown })[]) {
  const counts = await Product.aggregate<{ _id: unknown; n: number }>([
    { $match: { supplierId: { $in: profiles.map((p) => p._id) }, ...LISTED } },
    { $group: { _id: '$supplierId', n: { $sum: 1 } } },
  ]);
  const by = new Map(counts.map((c) => [String(c._id), c.n]));
  return new Map(profiles.map((p) => [String(p._id), goLiveSteps(p, by.get(String(p._id)) ?? 0)]));
}

export const agreementSchema = z.object({ version: z.string().max(20) }).strict();

// POST /suppliers/me/agreement { version } — the seller accepts the agreement they were shown
export async function acceptAgreement(req: Request, res: Response, next: NextFunction) {
  try {
    const { version } = req.body as z.infer<typeof agreementSchema>;
    if (version !== SELLER_TERMS_VERSION) throw AppError.conflict('The agreement was updated. Reload the page and read the new version.');
    const at = new Date();
    const p = await SupplierProfile.findOneAndUpdate(
      { userId: req.auth!.userId },
      {
        $set: { termsAcceptance: { version, at, ip: req.ip?.slice(0, 64), userAgent: String(req.get('user-agent') ?? '').slice(0, 200) } },
        $push: pushLog(logEntry('SUPPLIER', 'TERMS_ACCEPTED', req.auth!.userId, `Seller agreement ${version}`)),
      },
      { new: true }
    ).select('termsAcceptance').lean();
    if (!p) throw AppError.notFound('Supplier profile');
    logger.info('[agreement] accepted', { userId: req.auth!.userId, version });
    res.json(ok({ version: p.termsAcceptance!.version, at: p.termsAcceptance!.at }));
  } catch (err) { next(err); }
}
