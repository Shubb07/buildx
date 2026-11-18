// POST /suppliers/me/products/:id/pause { until: 'YYYY-MM-DD' | null }
// Pauses one listing until the start of that day in India (it returns by itself), or resumes it now
// with null. From tomorrow up to 90 days ahead. See features/products/availability.ts.

import { Request, Response, NextFunction } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { ok } from '@sthiva/shared';
import { Product } from '../../infrastructure/database/models/Product.model';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import { daysFromToday } from '../orders/delivery-window';

export const MAX_PAUSE_DAYS = 90;

export const pauseSchema = z.object({
  until: z.union([z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')]),
}).strict();

export async function pauseProduct(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isValidObjectId(req.params.id)) throw AppError.badRequest('Invalid product ID');
    const profile = await SupplierProfile.findOne({ userId: req.auth!.userId }).select('_id').lean();
    if (!profile) throw AppError.notFound('Supplier profile');
    const { until } = req.body as z.infer<typeof pauseSchema>;

    let update: Record<string, unknown>;
    if (until === null) {
      update = { $unset: { pausedUntil: '' } };
    } else {
      const date = new Date(`${until}T00:00:00+05:30`);
      if (Number.isNaN(date.getTime()) || new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10) !== until) {
        throw AppError.badRequest('Choose a real date');
      }
      const ahead = daysFromToday(until);
      if (ahead < 1) throw AppError.badRequest('Choose tomorrow or a later date');
      if (ahead > MAX_PAUSE_DAYS) throw AppError.badRequest(`A pause can last up to ${MAX_PAUSE_DAYS} days. For longer, set the listing inactive.`);
      update = { $set: { pausedUntil: date } };
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, supplierId: profile._id, status: { $in: ['ACTIVE', 'OUT_OF_STOCK', 'INACTIVE'] } },
      update,
      { new: true }
    ).populate('categoryId', 'name slug').lean();
    if (!product) throw AppError.notFound('Product');
    logger.info('[products] pause', { supplierId: String(profile._id), productId: String(product._id), until });
    res.json(ok(product));
  } catch (err) { next(err); }
}
