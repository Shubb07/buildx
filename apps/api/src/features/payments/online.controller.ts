import { Request, Response, NextFunction } from 'express';
import { isValidObjectId } from 'mongoose';
import { Order } from '../../infrastructure/database/models/Order.model';
import { OnlinePayment } from '../../infrastructure/database/models/OnlinePayment.model';
import { AppError } from '../../shared/errors/AppError';
import { retryRefund } from './refunds';
import { z } from 'zod';
import { ok } from '@sthiva/shared';
import { startOnlinePayment, completeOnlinePayment } from './online.service';
import type { CreateOrderInput } from '../orders/order.schemas';

export const completeSchema = z.object({
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySignature: z.string().min(1).max(256),
});

// POST /orders/pay-online (same body as POST /orders) → what Razorpay Checkout needs
export async function startPayOnline(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(ok(await startOnlinePayment(req.auth!.userId, req.body as CreateOrderInput))); } catch (err) { next(err); }
}

// POST /orders/pay-online/complete { razorpayOrderId, razorpayPaymentId, razorpaySignature } → the order
export async function completePayOnline(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await completeOnlinePayment({
      razorpayOrderId: req.body.razorpayOrderId, razorpayPaymentId: req.body.razorpayPaymentId,
      signature: req.body.razorpaySignature, buyerId: req.auth!.userId,
    });
    res.status(r.replayed ? 200 : 201).json(ok(r));
  } catch (err) { next(err); }
}

// ─── Ops: refunds that need a person (features/payments/refunds.ts, online.service.ts) ───

// GET /ops/refunds — cancelled online orders whose refund failed or is stuck, and paid checkouts that
// could not become orders and whose refund failed
export async function opsRefunds(_req: Request, res: Response, next: NextFunction) {
  try {
    const stuckSince = new Date(Date.now() - 15 * 60_000);
    const [orders, checkouts] = await Promise.all([
      Order.find({ paymentMethod: 'ONLINE', $or: [{ 'refund.status': 'FAILED' }, { 'refund.status': 'PENDING', 'refund.at': { $lt: stuckSince } }] })
        .select('orderNumber total refund razorpayPaymentId buyerId cancelledAt').sort({ 'refund.at': -1 }).limit(200).lean(),
      OnlinePayment.find({ status: 'REFUNDING', 'refund.error': { $exists: true } })
        .select('razorpayOrderId razorpayPaymentId amountPaise refund buyerId updatedAt').sort({ updatedAt: -1 }).limit(200).lean(),
    ]);
    res.json(ok({
      orders: orders.map((o) => ({ orderId: String(o._id), orderNumber: o.orderNumber, amount: o.refund?.amount ?? o.total, status: o.refund?.status, error: o.refund?.error, at: o.refund?.at, razorpayPaymentId: o.razorpayPaymentId })),
      checkouts: checkouts.map((c) => ({ razorpayOrderId: c.razorpayOrderId, razorpayPaymentId: c.razorpayPaymentId, amount: c.amountPaise / 100, reason: c.refund?.reason, error: c.refund?.error, at: c.updatedAt })),
    }));
  } catch (err) { next(err); }
}

// POST /ops/orders/:id/refund-retry (admin)
export async function opsRetryRefund(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isValidObjectId(req.params.id)) throw AppError.badRequest('Invalid order ID');
    const r = await retryRefund(String(req.params.id));
    res.json(ok({ ok: r.ok, refund: r.order?.refund }));
  } catch (err) { next(err); }
}
