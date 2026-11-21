import { Request, Response, NextFunction } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { Review } from '../../infrastructure/database/models/Review.model';
import { Order } from '../../infrastructure/database/models/Order.model';
import { Product } from '../../infrastructure/database/models/Product.model';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { User } from '../../infrastructure/database/models/User.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import { ok } from '@sthiva/shared';

// Buyer reviews of delivered orders. One review per order; it counts for the seller who delivered
// and for each item in the order (product pages show item reviews from every seller, because buyers
// don't choose the seller). Names are shown as first name and initial only.

export const reviewSchema = z.object({
  rating: z.number().int('Choose 1 to 5 stars').min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars'),
  comment: z.string().trim().max(500, 'Keep it under 500 characters').optional(),
  onTime: z.boolean().optional(),
  asListed: z.boolean().optional(),
}).strict();

/** "Ravi Kumar" -> "Ravi K." */
export function publicName(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Buyer';
  return parts.length === 1 ? parts[0].slice(0, 20) : `${parts[0].slice(0, 20)} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Recompute the seller's and the items' ratings from all their reviews */
async function refreshRatings(supplierId: Types.ObjectId, catalogItemIds: Types.ObjectId[]) {
  const [s] = await Review.aggregate<{ avg: number; n: number }>([
    { $match: { supplierId } },
    { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
  ]);
  if (s) await SupplierProfile.updateOne({ _id: supplierId }, { $set: { avgRating: round1(s.avg), totalReviews: s.n } });
  for (const itemId of catalogItemIds) {
    const [i] = await Review.aggregate<{ avg: number; n: number }>([
      { $match: { catalogItemIds: itemId } },
      { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
    ]);
    if (i) await Product.updateMany({ catalogItemId: itemId }, { $set: { avgRating: round1(i.avg), totalReviews: i.n } });
  }
}

// POST /reviews/orders/:orderId { rating, comment?, onTime?, asListed? }
export async function submitReview(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderId } = req.params;
    if (!isValidObjectId(orderId)) throw AppError.badRequest('Invalid order ID');
    const { rating, comment, onTime, asListed } = req.body as z.infer<typeof reviewSchema>;

    const order = await Order.findOne({ _id: orderId, buyerId: req.auth!.userId, status: 'DELIVERED' }).select('supplierId items').lean();
    if (!order) throw AppError.notFound('Order (it must be delivered before you can review it)');
    if (await Review.exists({ orderId })) throw AppError.conflict('You already reviewed this order');

    const user = await User.findById(req.auth!.userId).select('name').lean();
    const catalogItemIds = [...new Set(order.items.map((i) => i.catalogItemId?.toString()).filter(Boolean) as string[])].map((id) => new Types.ObjectId(id));
    const review = await Review.create({
      orderId,
      reviewerId: req.auth!.userId,
      reviewerName: publicName(user?.name),
      supplierId: order.supplierId,
      productId: order.items[0]?.productId,
      catalogItemIds,
      rating,
      ...(comment ? { comment } : {}),
      ...(onTime !== undefined ? { onTime } : {}),
      ...(asListed !== undefined ? { asListed } : {}),
      images: [],
      isVerifiedPurchase: true,
    });
    await refreshRatings(order.supplierId, catalogItemIds);
    logger.info('[reviews] submitted', { orderId, rating });
    res.status(201).json(ok({ reviewId: review._id, rating: review.rating }));
  } catch (err) {
    // Two taps at once: the unique index on orderId catches the second
    if ((err as { code?: number })?.code === 11000) return next(AppError.conflict('You already reviewed this order'));
    next(err);
  }
}

type Lean = { _id: unknown; rating: number; comment?: string; onTime?: boolean; asListed?: boolean; createdAt: Date; reviewerName?: string; reviewerId?: unknown };
const publicView = (r: Lean) => ({
  ...(() => {
    const name = r.reviewerName ?? publicName((r.reviewerId as { name?: string } | undefined)?.name);
    // reviewerId.name kept for app versions already installed, now the short public name
    return { name, reviewerId: { name } };
  })(),
  _id: r._id,
  rating: r.rating,
  comment: r.comment,
  onTime: r.onTime,
  asListed: r.asListed,
  createdAt: r.createdAt,
});

async function summary(match: Record<string, unknown>) {
  const [s] = await Review.aggregate<{ avg: number; n: number; onTimeYes: number; onTimeAsked: number; listedYes: number; listedAsked: number }>([
    { $match: match },
    { $group: {
      _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 },
      onTimeYes: { $sum: { $cond: [{ $eq: ['$onTime', true] }, 1, 0] } },
      onTimeAsked: { $sum: { $cond: [{ $eq: [{ $type: '$onTime' }, 'bool'] }, 1, 0] } },
      listedYes: { $sum: { $cond: [{ $eq: ['$asListed', true] }, 1, 0] } },
      listedAsked: { $sum: { $cond: [{ $eq: [{ $type: '$asListed' }, 'bool'] }, 1, 0] } },
    } },
  ]);
  if (!s) return { average: 0, count: 0 };
  return {
    average: round1(s.avg), count: s.n,
    ...(s.onTimeAsked ? { onTimePercent: Math.round((s.onTimeYes / s.onTimeAsked) * 100) } : {}),
    ...(s.listedAsked ? { asListedPercent: Math.round((s.listedYes / s.listedAsked) * 100) } : {}),
  };
}

async function page(req: Request, match: Record<string, unknown>) {
  const pageNo = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.max(1, Math.min(20, parseInt(req.query.limit as string, 10) || 10));
  const [rows, total] = await Promise.all([
    Review.find(match).sort({ createdAt: -1 }).skip((pageNo - 1) * limit).limit(limit).populate('reviewerId', 'name').lean(),
    Review.countDocuments(match),
  ]);
  return {
    rows: (rows as unknown as Lean[]).map(publicView),
    meta: { total, page: pageNo, limit, totalPages: Math.ceil(total / limit), hasNext: pageNo * limit < total, hasPrev: pageNo > 1 },
  };
}

// GET /reviews/suppliers/:supplierId
export async function getSupplierReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const { supplierId } = req.params;
    if (!isValidObjectId(supplierId)) throw AppError.badRequest('Invalid supplier ID');
    const { rows, meta } = await page(req, { supplierId: new Types.ObjectId(String(supplierId)) });
    res.json(ok(rows, meta));
  } catch (err) { next(err); }
}

// GET /reviews/products/:productId — reviews of the item (from every seller), with a summary
export async function getProductReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.params;
    if (!isValidObjectId(productId)) throw AppError.badRequest('Invalid product ID');
    const product = await Product.findById(productId).select('catalogItemId').lean();
    if (!product) throw AppError.notFound('Product');
    const match = product.catalogItemId ? { catalogItemIds: product.catalogItemId } : { productId: product._id };
    const [{ rows, meta }, sum] = await Promise.all([page(req, match), summary(match)]);
    res.json(ok({ summary: sum, reviews: rows }, meta));
  } catch (err) { next(err); }
}

// GET /reviews/orders/:orderId — the buyer's own review of their order, if any
export async function getOrderReview(req: Request, res: Response, next: NextFunction) {
  try {
    const { orderId } = req.params;
    if (!isValidObjectId(orderId)) throw AppError.badRequest('Invalid order ID');
    const review = await Review.findOne({ orderId, reviewerId: req.auth!.userId }).lean();
    res.json(ok(review ? publicView(review as unknown as Lean) : null));
  } catch (err) { next(err); }
}
