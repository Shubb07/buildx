import { Request, Response, NextFunction } from 'express';
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
