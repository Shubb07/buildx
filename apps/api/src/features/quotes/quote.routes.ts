import { Router, Request, Response, NextFunction } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { ok } from '@sthiva/shared';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { AppError } from '../../shared/errors/AppError';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import {
  createRequest, createCustomRequest, listBuyerRequests, getBuyerRequest, cancelRequest, acceptQuote,
  sellerRequests, submitQuote, withdrawQuote,
} from './quote.service';

// Bulk quotes (features/quotes/quote.service.ts). Buyers: /quotes. Sellers: /suppliers/me/quotes.

const objectId = z.string().refine((v) => isValidObjectId(v), 'Invalid ID');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');

export const createQuoteSchema = z.object({
  items: z.array(z.object({ productId: objectId, quantity: z.number().finite().positive().max(1_000_000) }).strict()).min(1, 'Add at least one item').max(50),
  deliveryAddress: z.object({
    label: z.string().trim().min(1).max(50),
    fullAddress: z.string().trim().min(5).max(500),
    pincode: z.string().trim().max(10),
    contactPhone: z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number').transform((v) => v.slice(-10)),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  }).strict(),
  neededBy: date,
  notes: z.string().trim().max(500).optional(),
}).strict();

const addressSchema = createQuoteSchema.shape.deliveryAddress;

// Made to measure: the work type comes from the shared catalogue's made-to-order items
export const customQuoteSchema = z.object({
  work: z.object({
    type: z.string().trim().regex(/^[a-z0-9-]{2,60}$/),
    name: z.string().trim().min(2).max(80),
    categorySlug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/),
  }).strict(),
  pieces: z.array(z.object({
    label: z.string().trim().min(1, 'Name each piece, e.g. Bedroom window').max(60),
    widthMm: z.number().int('Width in whole millimetres').min(50, 'Width looks too small').max(20_000),
    heightMm: z.number().int('Height in whole millimetres').min(50, 'Height looks too small').max(20_000),
    quantity: z.number().int().min(1).max(500),
  }).strict()).min(1, 'Add at least one piece').max(30),
  spec: z.string().trim().min(3, 'Describe the material, e.g. 10 mm toughened fluted glass').max(500),
  siteVisit: z.boolean().default(false),
  deliveryAddress: addressSchema,
  neededBy: date,
  notes: z.string().trim().max(500).optional(),
}).strict();

export const acceptQuoteSchema = z.object({ quoteId: objectId, expectedTotal: z.number().finite().nonnegative().optional() }).strict();

export const submitQuoteSchema = z.object({
  prices: z.array(z.number().finite().positive('Every price must be more than 0').max(10_000_000)).min(1).max(50),
  isGstInclusive: z.boolean().default(true),
  deliveryCharge: z.number().finite().min(0).max(1_000_000).default(0),
  deliveryDate: date,
  note: z.string().trim().max(300).optional(),
}).strict();

const id = (req: Request) => {
  const v = String(req.params.id);
  if (!isValidObjectId(v)) throw AppError.badRequest('Invalid request ID');
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

export const buyerQuoteRoutes = Router();
buyerQuoteRoutes.use(requireAuth, requireRole('BUYER'));
buyerQuoteRoutes.post('/', validate(createQuoteSchema), wrap((req) => createRequest({ buyerId: req.auth!.userId, ...req.body }), 201));
buyerQuoteRoutes.post('/custom', validate(customQuoteSchema), wrap((req) => createCustomRequest({ buyerId: req.auth!.userId, ...req.body }), 201));
buyerQuoteRoutes.get('/', wrap((req) => listBuyerRequests(req.auth!.userId)));
buyerQuoteRoutes.get('/:id', wrap((req) => getBuyerRequest(req.auth!.userId, id(req))));
buyerQuoteRoutes.post('/:id/accept', validate(acceptQuoteSchema), wrap((req) => acceptQuote({ buyerId: req.auth!.userId, id: id(req), ...req.body }), 201));
buyerQuoteRoutes.post('/:id/cancel', wrap((req) => cancelRequest(req.auth!.userId, id(req))));

export const sellerQuoteRoutes = Router();
sellerQuoteRoutes.get('/', wrap(async (req) => sellerRequests(await myProfileId(req))));
sellerQuoteRoutes.post('/:id', validate(submitQuoteSchema), wrap(async (req) => submitQuote({ supplierId: await myProfileId(req), id: id(req), ...req.body })));
sellerQuoteRoutes.post('/:id/withdraw', wrap(async (req) => withdrawQuote(await myProfileId(req), id(req))));
