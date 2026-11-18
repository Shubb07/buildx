// Seller payout account: where Sthiva sends a seller's money (bank account or UPI ID).
//
// Rules (2026-11-19, the free version; a paid "penny drop" name check can be added later):
//   - The full account number or UPI ID is encrypted (shared/secret-box.ts). The seller and ops lists
//     only ever see a masked form; the full value is shown to ops on one screen, and each view is logged.
//   - A bank account needs a photo or PDF of a cancelled cheque or passbook page (stored privately,
//     like verification documents), so ops can match the name and number by eye.
//   - Ops verifies the account it actually looked at: the review carries the submittedAt it saw, so an
//     account changed in the meantime cannot be approved unseen.
//   - Changing an account that was already verified pauses payouts for 48 hours and alerts the seller.
//     That stops the common fraud of quietly redirecting a seller's money.
//   - A supplier settlement where Sthiva pays the seller can only be marked paid to a verified account
//     outside that pause (features/settlements/settlement.service.ts), and the statement records where.

import { Request, Response, NextFunction } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { ok } from '@sthiva/shared';
import { SupplierProfile, type ISupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { StorageService } from '../../infrastructure/storage/cloudinary.client';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import { notifyUser } from '../../shared/services/notification.service';
import { seal, unseal, secretBoxReady } from '../../shared/secret-box';
import { logEntry, pushLog } from './verification';

export const PAYOUT_HOLD_HOURS = 48;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9]{1,63}$/;

type Account = NonNullable<ISupplierProfile['payoutAccount']>;

const holderName = z.string().trim().min(3, 'Enter the account holder’s name as the bank shows it').max(100);
const bankInput = z.object({
  method: z.literal('BANK'),
  holderName,
  accountNumber: z.string().trim().regex(/^\d{9,18}$/, 'An account number has 9 to 18 digits'),
  confirmAccountNumber: z.string().trim().optional(),
  ifsc: z.string().trim().toUpperCase().regex(IFSC_RE, 'An IFSC code has 11 characters, like SBIN0001234'),
}).refine((v) => v.confirmAccountNumber === undefined || v.confirmAccountNumber === v.accountNumber,
  { path: ['confirmAccountNumber'], message: 'The two account numbers do not match' });
const upiInput = z.object({
  method: z.literal('UPI'),
  holderName,
  upiId: z.string().trim().toLowerCase().regex(UPI_RE, 'Enter a UPI ID like name@okhdfcbank'),
});

export const payoutReviewSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  note: z.string().trim().max(300).optional(),
  // The submittedAt the reviewer saw (GET /ops/suppliers/:id/payout-account)
  submittedAt: z.string().datetime(),
}).strict().refine((v) => v.status !== 'REJECTED' || (v.note ?? '').length >= 3,
  { path: ['note'], message: 'Tell the seller what is wrong' });

const ist = (d: Date) => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

export function maskAccount(method: 'BANK' | 'UPI', value: string) {
  if (method === 'BANK') return `•••• ${value.slice(-4)}`;
  const [handle, provider] = value.split('@');
  return `${handle.slice(0, 2)}••••@${provider}`;
}

/** One line for statements and logs, never the full number */
export const describeAccount = (a: Pick<Account, 'method' | 'masked' | 'ifsc' | 'holderName'>) =>
  [a.method === 'BANK' ? `Bank ${a.masked}` : `UPI ${a.masked}`, a.ifsc, a.holderName].filter(Boolean).join(' · ');

/** What the seller (and ops lists) may see */
function view(a?: Account | null) {
  if (!a) return null;
  const onHold = !!a.holdUntil && new Date(a.holdUntil).getTime() > Date.now();
  return {
    method: a.method, holderName: a.holderName, masked: a.masked, ifsc: a.ifsc, status: a.status, note: a.note,
    submittedAt: a.submittedAt, reviewedAt: a.reviewedAt, ...(onHold ? { holdUntil: a.holdUntil } : {}),
  };
}

function parseInput(body: unknown) {
  const method = (body as { method?: string } | undefined)?.method;
  const parsed = method === 'BANK' ? bankInput.safeParse(body) : method === 'UPI' ? upiInput.safeParse(body) : null;
  if (!parsed) throw AppError.badRequest('Choose bank account or UPI', { field: 'method' });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw AppError.badRequest(issue.message, { field: issue.path.join('.') });
  }
  return parsed.data;
}

const notReady = () => new AppError('Payout details cannot be saved right now. Please try again later.', 'SERVICE_UNAVAILABLE', 503);

// GET /suppliers/me/payout-account
export async function myPayoutAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await SupplierProfile.findOne({ userId: req.auth!.userId }).select('payoutAccount').lean();
    if (!profile) throw AppError.notFound('Supplier profile');
    res.json(ok({ account: view(profile.payoutAccount), holdHours: PAYOUT_HOLD_HOURS }));
  } catch (err) { next(err); }
}

// PUT /suppliers/me/payout-account (multipart: method, holderName, accountNumber + confirmAccountNumber
// + ifsc, or upiId; file = cancelled cheque or passbook page, needed for a bank account)
export async function savePayoutAccount(req: Request, res: Response, next: NextFunction) {
  try {
    if (!secretBoxReady()) throw notReady();
    const input = parseInput(req.body);
    if (input.method === 'BANK' && !req.file) {
      throw AppError.badRequest('Add a photo of a cancelled cheque or your passbook’s first page', { field: 'file' });
    }
    const profile = await SupplierProfile.findOne({ userId: req.auth!.userId }).select('+payoutAccount.proofPublicId').lean();
    if (!profile) throw AppError.notFound('Supplier profile');

    const value = input.method === 'BANK' ? input.accountNumber : input.upiId;
    const proof = req.file
      ? await StorageService.uploadPrivate(`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`, `payout/${profile._id}`)
      : null;

    const previous = profile.payoutAccount;
    const now = new Date();
    const runningHold = previous?.holdUntil && new Date(previous.holdUntil) > now ? new Date(previous.holdUntil) : undefined;
    const holdUntil = previous?.status === 'VERIFIED' ? new Date(now.getTime() + PAYOUT_HOLD_HOURS * 3600_000) : runningHold;
    const account: Account = {
      method: input.method,
      holderName: input.holderName,
      secret: seal(value),
      masked: maskAccount(input.method, value),
      ...(input.method === 'BANK' ? { ifsc: input.ifsc } : {}),
      ...(proof ? { proofPublicId: proof.publicId, proofFormat: proof.format } : {}),
      status: 'SUBMITTED',
      submittedAt: now,
      ...(holdUntil ? { holdUntil } : {}),
    };

    const updated = await SupplierProfile.findOneAndUpdate(
      { _id: profile._id },
      { $set: { payoutAccount: account }, $push: pushLog(logEntry('SUPPLIER', previous ? 'PAYOUT_CHANGED' : 'PAYOUT_ADDED', req.auth!.userId, describeAccount(account))) },
      { new: true }
    ).select('payoutAccount').lean();

    if (previous?.proofPublicId && previous.proofPublicId !== proof?.publicId) await StorageService.deletePrivate(previous.proofPublicId);
    logger.info('[payout] account saved', { supplierId: String(profile._id), method: input.method, wasVerified: previous?.status === 'VERIFIED' });

    if (previous?.status === 'VERIFIED') {
      notifyUser(req.auth!.userId, {
        title: 'Your payout account was changed',
        body: `Payouts are paused until ${ist(holdUntil!)} while Sthiva checks the new account. If you did not make this change, contact Sthiva support now.`,
        data: { screen: 'supplier_payouts' },
      });
    }
    res.json(ok({ account: view(updated?.payoutAccount), holdHours: PAYOUT_HOLD_HOURS }));
  } catch (err) { next(err); }
}

// GET /ops/suppliers/:id/payout-account: the full details and a 10-minute proof link. Every view is logged.
export async function opsPayoutAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    if (!isValidObjectId(id)) throw AppError.badRequest('Invalid supplier ID');
    if (!secretBoxReady()) throw notReady();
    const profile = await SupplierProfile.findById(id).select('+payoutAccount.secret +payoutAccount.proofPublicId').lean();
    if (!profile) throw AppError.notFound('Supplier');
    const a = profile.payoutAccount;
    logger.info('[payout] account viewed by ops', { opsUserId: req.auth!.userId, supplierId: id });
    res.json(ok({
      businessName: profile.businessName,
      gstin: profile.gstin ?? null,
      account: a ? {
        ...view(a),
        holdUntil: a.holdUntil,
        ...(a.method === 'BANK' ? { accountNumber: unseal(a.secret) } : { upiId: unseal(a.secret) }),
        proofUrl: a.proofPublicId ? StorageService.privateViewUrl(a.proofPublicId, a.proofFormat ?? 'jpg') : null,
      } : null,
    }));
  } catch (err) { next(err); }
}

// PATCH /ops/suppliers/:id/payout-account { status, note?, submittedAt }
export async function reviewPayoutAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    if (!isValidObjectId(id)) throw AppError.badRequest('Invalid supplier ID');
    const { status, note, submittedAt } = req.body as z.infer<typeof payoutReviewSchema>;
    const profile = await SupplierProfile.findOneAndUpdate(
      { _id: id, 'payoutAccount.submittedAt': new Date(submittedAt) },
      {
        $set: { 'payoutAccount.status': status, 'payoutAccount.note': note ?? '', 'payoutAccount.reviewedAt': new Date(), 'payoutAccount.reviewedBy': req.auth!.userId },
        $push: pushLog(logEntry('OPS', status === 'VERIFIED' ? 'PAYOUT_VERIFIED' : 'PAYOUT_REJECTED', req.auth!.userId, note)),
      },
      { new: true }
    ).select('payoutAccount userId').lean();
    if (!profile) {
      const exists = await SupplierProfile.exists({ _id: id, payoutAccount: { $exists: true } });
      if (!exists) throw AppError.notFound('Payout account');
      throw AppError.conflict('The seller changed this account while you were checking it. Open it again.');
    }
    logger.info('[payout] account reviewed', { opsUserId: req.auth!.userId, supplierId: id, status });
    notifyUser(profile.userId.toString(), status === 'VERIFIED'
      ? { title: 'Payout account verified', body: 'Sthiva will send your payouts to this account.', data: { screen: 'supplier_payouts' } }
      : { title: 'Please check your payout account', body: `Sthiva could not verify it. ${note}`, data: { screen: 'supplier_payouts' } });
    res.json(ok({ account: view(profile.payoutAccount) }));
  } catch (err) { next(err); }
}

/**
 * Where a supplier payout may be sent, as one line for the statement. Throws a clear 409 when the
 * account is missing, not verified, or paused after a change.
 */
export async function payoutDestination(supplierId: string): Promise<string> {
  const profile = await SupplierProfile.findById(supplierId).select('payoutAccount').lean();
  const a = profile?.payoutAccount;
  if (!a) throw AppError.conflict('This seller has not added a payout account yet.');
  if (a.status !== 'VERIFIED') throw AppError.conflict('Verify the seller’s payout account before paying.');
  if (a.holdUntil && new Date(a.holdUntil) > new Date()) {
    throw AppError.conflict(`The seller changed their payout account recently. Payouts are paused until ${ist(new Date(a.holdUntil))}.`);
  }
  return describeAccount(a);
}
