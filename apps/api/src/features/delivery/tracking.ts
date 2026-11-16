// Live delivery tracking (owner decision 2026-11-16): the driver's location is shared with the buyer
// ONLY from pickup until delivered. Only the latest position is kept on the order (no history), and
// it is erased when the order is delivered or cancelled (order.service.ts) and by a sweep for any
// order that is no longer on the way.
//
//   POST /delivery/orders/:id/location  { lat, lng, accuracy? }  assigned driver, while on the way
//   GET  /orders/:id/tracking                                     the order's buyer

import { Request, Response, NextFunction } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { ok } from '@sthiva/shared';
import { Order } from '../../infrastructure/database/models/Order.model';
import { AppError } from '../../shared/errors/AppError';
import { deliveryPoint, distanceKm } from './delivery-pricing';

export const ON_THE_WAY = ['PICKED_UP', 'IN_TRANSIT'] as const;
/** Positions closer together than this are not written (the app sends about every 15 s) */
export const MIN_INTERVAL_MS = 10_000;
/** Older than this, the buyer is told the position may be out of date */
export const STALE_AFTER_MS = 2 * 60_000;

export const locationSchema = z.object({
  // India, roughly; anything else is a broken GPS reading
  lat: z.number().min(6).max(38),
  lng: z.number().min(68).max(98),
  accuracy: z.number().min(0).max(10_000).optional(),
});

// POST /delivery/orders/:id/location
export async function postLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    if (!isValidObjectId(id)) throw AppError.badRequest('Invalid order ID');
    const { lat, lng, accuracy } = req.body as z.infer<typeof locationSchema>;
    const now = new Date();
    const updated = await Order.updateOne(
      {
        _id: id,
        driverId: req.auth!.userId,
        status: { $in: ON_THE_WAY },
        $or: [{ 'liveLocation.at': { $exists: false } }, { 'liveLocation.at': { $lt: new Date(now.getTime() - MIN_INTERVAL_MS) } }],
      },
      { $set: { liveLocation: { lat, lng, ...(accuracy !== undefined ? { accuracy: Math.round(accuracy) } : {}), at: now } } }
    );
    if (updated.modifiedCount) return res.json(ok({ shared: true }));

    // Too soon after the last one is fine; anything else means the app should stop sending
    const order = await Order.findOne({ _id: id, driverId: req.auth!.userId }).select('status').lean();
    if (!order) throw AppError.notFound('Order');
    if (!(ON_THE_WAY as readonly string[]).includes(order.status)) {
      throw AppError.conflict('Location is shared only while the order is on the way');
    }
    res.json(ok({ shared: false }));
  } catch (err) { next(err); }
}

// GET /orders/:id/tracking
export async function getTracking(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    if (!isValidObjectId(id)) throw AppError.badRequest('Invalid order ID');
    const order = await Order.findOne({ _id: id, buyerId: req.auth!.userId })
      .select('status deliveryMode liveLocation deliveryAddress').lean();
    if (!order) throw AppError.notFound('Order');

    const onTheWay = (ON_THE_WAY as readonly string[]).includes(order.status);
    const loc = onTheWay ? order.liveLocation : undefined;
    if (!loc) return res.json(ok({ status: order.status, sharing: false }));

    const site = await deliveryPoint(order.deliveryAddress as { lat?: number; lng?: number; pincode?: string });
    const ageMs = Date.now() - new Date(loc.at).getTime();
    res.json(ok({
      status: order.status,
      sharing: true,
      location: { lat: loc.lat, lng: loc.lng, ...(loc.accuracy !== undefined ? { accuracy: loc.accuracy } : {}), at: loc.at },
      // Straight line to the site (the site's own pin, else its PIN code's post office)
      ...(site ? { distanceKm: Math.round(distanceKm(loc, site) * 10) / 10 } : {}),
      stale: ageMs > STALE_AFTER_MS,
    }));
  } catch (err) { next(err); }
}

/** Safety net (runs in the one-minute sweeper): no position survives on an order that is not on the way */
export async function clearFinishedLocations() {
  const r = await Order.updateMany(
    { liveLocation: { $exists: true }, status: { $nin: ON_THE_WAY } },
    { $unset: { liveLocation: '' } }
  );
  return r.modifiedCount;
}
