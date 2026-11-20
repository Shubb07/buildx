// Refunds for online orders that are cancelled. Kept apart from online.service.ts so the order code can
// use it without a circular import.
//
// The order moves CAPTURED → REFUNDED in one compare-and-set before Razorpay is asked, so a refund is
// requested at most once however many times this runs. If Razorpay refuses or can't be reached, the
// order keeps refund.status FAILED for ops to retry (retryRefund).

import { Types } from 'mongoose';
import { Order, type IOrder } from '../../infrastructure/database/models/Order.model';
import { logger } from '../../shared/logger/logger';
import { notifyUser } from '../../shared/services/notification.service';
import { refundPayment } from '../../shared/services/razorpay';
import { AppError } from '../../shared/errors/AppError';
import { toPaise } from '../orders/pricing';

type LeanOrder = IOrder & { _id: Types.ObjectId };

const rs = (n: number) => `Rs ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

async function ask(order: LeanOrder) {
  try {
    const r = await refundPayment(order.razorpayPaymentId!, toPaise(order.refund!.amount), { orderNumber: order.orderNumber });
    await Order.updateOne({ _id: order._id }, { $set: { 'refund.status': 'DONE', 'refund.razorpayRefundId': r.id }, $unset: { 'refund.error': '' } });
    notifyUser(order.buyerId.toString(), {
      title: 'Refund started',
      body: `${rs(order.refund!.amount)} for order ${order.orderNumber} is on its way back to you. It usually reaches you in 5 to 7 working days.`,
      data: { screen: 'buyer_orders', orderId: order._id.toString() },
    });
    return true;
  } catch (err) {
    const error = (err as Error)?.message ?? 'Refund failed';
    await Order.updateOne({ _id: order._id }, { $set: { 'refund.status': 'FAILED', 'refund.error': error.slice(0, 300) } });
    logger.error('[payments] refund failed', { orderId: String(order._id), error });
    return false;
  }
}

/** Refunds what the buyer paid for a cancelled online order, once. */
export async function refundCancelledOrder(orderId: Types.ObjectId | string): Promise<void> {
  const current = await Order.findById(orderId).select('total').lean<LeanOrder>();
  if (!current) return;
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: 'CANCELLED', paymentMethod: 'ONLINE', paymentStatus: 'CAPTURED', razorpayPaymentId: { $exists: true } },
    { $set: { paymentStatus: 'REFUNDED', refund: { status: 'PENDING', amount: current.total, at: new Date() } } },
    { new: true }
  ).lean<LeanOrder>();
  if (order) await ask(order);
}

/** Never blocks the cancel: failures are logged and stay FAILED on the order for ops. */
export function refundCancelledOrderInBackground(orderId: Types.ObjectId | string) {
  refundCancelledOrder(orderId).catch((err) => logger.error('[payments] refund start failed', { orderId: String(orderId), error: err?.message }));
}

/** Ops: try a FAILED refund again. */
export async function retryRefund(orderId: string) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, paymentMethod: 'ONLINE', 'refund.status': 'FAILED' },
    { $set: { 'refund.status': 'PENDING', 'refund.at': new Date() } },
    { new: true }
  ).lean<LeanOrder>();
  if (!order) throw AppError.conflict('This order has no failed refund to retry');
  const ok = await ask(order);
  return { ok, order: await Order.findById(orderId).lean<LeanOrder>() };
}
