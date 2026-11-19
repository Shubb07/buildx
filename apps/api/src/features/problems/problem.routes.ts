import { Router, Request, Response, NextFunction } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { ok } from '@sthiva/shared';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { AppError } from '../../shared/errors/AppError';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import {
  buyerOrderProblems, reportProblem, withdrawProblem, sellerProblems, sellerReply, opsProblems, resolveProblem, markRefundPaid,
} from './problem.service';

// Problems after delivery (problem.service.ts). Buyers: /problems. Sellers: /suppliers/me/problems.
// Sthiva's team: /ops/problems.

// Photos must be ones uploaded through Sthiva (POST /upload/image), not links to anywhere
const photoUrl = z.string().trim().url().max(500)
  .refine((v) => /^https:\/\/res\.cloudinary\.com\//.test(v), 'Upload the photo here instead of pasting a link');

export const reportSchema = z.object({
  kind: z.enum(['DAMAGED', 'WRONG_ITEM', 'SHORT', 'DEFECTIVE', 'CHANGE_OF_MIND']),
  lines: z.array(z.object({
    index: z.number().int().min(0).max(200),
    quantity: z.number().finite().positive('Say how many are affected').max(1_000_000),
  }).strict()).min(1, 'Choose the items with the problem').max(50),
  description: z.string().trim().min(10, 'Tell us what is wrong in a few words').max(1000),
  photos: z.array(photoUrl).max(6, 'Up to 6 photos').default([]),
  want: z.enum(['REFUND', 'REPLACEMENT']),
  // name@bank style UPI ID
  upiId: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/, 'Enter a UPI ID like name@okbank').optional(),
}).strict();

export const replySchema = z.object({
  agrees: z.boolean(),
  note: z.string().trim().max(500).optional(),
}).strict().refine((v) => v.agrees || (v.note ?? '').length >= 5, { message: 'Say why you disagree', path: ['note'] });

export const resolveSchema = z.object({
  outcome: z.enum(['REFUND', 'REPLACEMENT', 'REJECTED']),
  atFault: z.enum(['SELLER', 'BUYER', 'NONE']),
  refundAmount: z.number().finite().min(0).max(10_000_000).optional(),
  returnTripCharge: z.number().finite().min(0).max(1_000_000).optional(),
  // Leave out to use the standard rule (seller's share of the refund, plus the trip when at fault)
  sellerCharge: z.number().finite().min(0).max(10_000_000).optional(),
  note: z.string().trim().min(5, 'Write what was decided, for the buyer and seller').max(500),
}).strict();

export const refundPaidSchema = z.object({ reference: z.string().trim().min(4, 'Enter the UPI reference').max(100) }).strict();

const param = (req: Request, name: string, what: string) => {
  const v = String(req.params[name]);
  if (!isValidObjectId(v)) throw AppError.badRequest(`Invalid ${what} ID`);
  return v;
};
const wrap = (fn: (req: Request) => Promise<unknown>, status = 200) => (req: Request, res: Response, next: NextFunction) => {
  fn(req).then((data) => res.status(status).json(ok(data))).catch(next);
};
async function myProfileId(req: Request) {
  const p = await SupplierProfile.findOne({ userId: req.auth!.userId }).select('_id').lean();
  if (!p) throw AppError.notFound('Supplier profile');
  return p._id;
}

export const buyerProblemRoutes = Router();
buyerProblemRoutes.use(requireAuth, requireRole('BUYER'));
buyerProblemRoutes.get('/orders/:orderId', wrap((req) => buyerOrderProblems(req.auth!.userId, param(req, 'orderId', 'order'))));
buyerProblemRoutes.post('/orders/:orderId', validate(reportSchema), wrap((req) => reportProblem({ buyerId: req.auth!.userId, orderId: param(req, 'orderId', 'order'), ...req.body }), 201));
buyerProblemRoutes.post('/:id/withdraw', wrap((req) => withdrawProblem(req.auth!.userId, param(req, 'id', 'report'))));

export const sellerProblemRoutes = Router();
sellerProblemRoutes.get('/', wrap(async (req) => sellerProblems(await myProfileId(req))));
sellerProblemRoutes.post('/:id/reply', validate(replySchema), wrap(async (req) => sellerReply(await myProfileId(req), param(req, 'id', 'report'), req.body.agrees, req.body.note)));

export const opsProblemRoutes = Router();
opsProblemRoutes.get('/', wrap((req) => opsProblems(typeof req.query.status === 'string' ? req.query.status : undefined)));
opsProblemRoutes.post('/:id/resolve', validate(resolveSchema), wrap((req) => resolveProblem({ id: param(req, 'id', 'report'), byUserId: req.auth!.userId, ...req.body })));
opsProblemRoutes.post('/:id/refund-paid', validate(refundPaidSchema), wrap((req) => markRefundPaid(param(req, 'id', 'report'), req.auth!.userId, req.body.reference)));
