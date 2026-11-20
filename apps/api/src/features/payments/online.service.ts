// Buyers paying online at checkout (owner decision 2026-11-21): they save a share of the delivery charge
// (PlatformSettings.prepayDeliveryDiscountPercent, 25% to start). Sthiva pays the saving: the driver's
// share and the seller's delivery money are worked out on the full charge.
//
// Flow:
//   1. startOnlinePayment: prices the checkout exactly as an order would be, creates a Razorpay order for
//      that amount and saves the checkout (OnlinePayment, CREATED). Nothing is reserved yet.
//   2. The buyer pays in Razorpay Checkout.
//   3. completeOnlinePayment (from the browser, or the webhook if the browser never comes back): checks
//      the payment with Razorpay, then creates the order(s) with that payment. The order's idempotency key
//      comes from the Razorpay order, so the browser and the webhook can't create it twice.
//   4. If the order can't be made after paying (stock gone, prices changed), the whole amount is refunded
//      at once and the buyer is told.

import { Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { OnlinePayment } from '../../infrastructure/database/models/OnlinePayment.model';
import { Order, type IOrder } from '../../infrastructure/database/models/Order.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import {
  razorpayReady, razorpayKeyId, createRazorpayOrder, confirmPayment, checkoutSignatureValid, refundPayment,
} from '../../shared/services/razorpay';
import { createOrder, quoteOrder, onlineOffer } from '../orders/order.service';
import { announceNewOrder } from '../orders/allocation.service';
import type { CreateOrderInput } from '../orders/order.schemas';
import { toPaise, paiseToRupees } from '../orders/pricing';

type LeanOrder = IOrder & { _id: Types.ObjectId };

const rs = (paise: number) => `Rs ${paiseToRupees(paise).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Step 1: what Razorpay Checkout needs to take the payment. */
export async function startOnlinePayment(buyerId: string, input: CreateOrderInput) {
  const offer = await onlineOffer();
  if (!offer || !razorpayReady()) throw new AppError('Paying online is not available right now. You can pay on delivery.', 'SERVICE_UNAVAILABLE', 503);
  const q = await quoteOrder(input.items, input.deliveryAddress.pincode, { lat: input.deliveryAddress.lat, lng: input.deliveryAddress.lng }, input.deliverySlot);
  if (!q.payOnline?.available) throw AppError.conflict('This order can only be paid on delivery: the delivery charge is confirmed after Sthiva finds a seller.');
  if (q.items.some((i) => !i.inStock)) throw AppError.conflict('Some items are no longer in stock. Check your cart.');
  const amountPaise = toPaise(q.payOnline.total);
  if (input.expectedTotal !== undefined && toPaise(input.expectedTotal) !== amountPaise) {
    throw AppError.conflict('Prices changed since you reviewed your order. Please check the new total.');
  }
  const rzp = await createRazorpayOrder(amountPaise, `buy-${randomBytes(6).toString('hex')}`, { purpose: 'buyer_order', buyerId });
  await OnlinePayment.create({
    buyerId: new Types.ObjectId(buyerId), input: input as unknown as Record<string, unknown>,
    amountPaise, discountPercent: offer.discountPercent, razorpayOrderId: rzp.id,
  });
  return {
    keyId: razorpayKeyId(), razorpayOrderId: rzp.id, amount: amountPaise, currency: 'INR', name: 'Sthiva',
    description: 'Building materials order', total: q.payOnline.total, deliveryDiscount: q.payOnline.deliveryDiscount,
    contact: input.deliveryAddress.contactPhone,
  };
}

function summary(orders: LeanOrder[]) {
  const first = orders[0];
  return {
    orderId: first._id, orderNumber: first.orderNumber, status: first.status,
    total: Math.round(orders.reduce((s, o) => s + o.total, 0) * 100) / 100,
    ...(orders.length > 1 ? { orders: orders.map((o) => ({ orderId: o._id, orderNumber: o.orderNumber, total: o.total, part: o.orderGroup?.part })) } : {}),
  };
}

/** Step 3: confirm with Razorpay, then create the order(s). Safe to call more than once. */
export async function completeOnlinePayment(p: { razorpayOrderId: string; razorpayPaymentId: string; signature?: string; buyerId?: string }) {
  if (p.signature !== undefined && !checkoutSignatureValid(p.razorpayOrderId, p.razorpayPaymentId, p.signature)) {
    throw AppError.badRequest('Payment could not be verified');
  }
  const intent = await OnlinePayment.findOne({ razorpayOrderId: p.razorpayOrderId }).lean();
  if (!intent || (p.buyerId && String(intent.buyerId) !== p.buyerId)) throw AppError.notFound('Payment');
  if (intent.status === 'ORDERED') {
    const orders = await Order.find({ _id: { $in: intent.orderIds } }).sort({ 'orderGroup.part': 1 }).lean<LeanOrder[]>();
    return { ...summary(orders), replayed: true };
  }
  if (intent.status !== 'CREATED') {
    throw AppError.conflict(`Your order could not be placed, so your payment of ${rs(intent.amountPaise)} is being refunded. It usually reaches you in 5 to 7 working days.`);
  }
  // Razorpay's own record decides, not what the browser says
  const payment = await confirmPayment(p.razorpayPaymentId, p.razorpayOrderId, intent.amountPaise);

  let made: { orders: LeanOrder[]; replayed: boolean };
  try {
    made = await createOrder({
      buyerId: String(intent.buyerId),
      input: intent.input as unknown as CreateOrderInput,
      idempotencyKey: `pay_${intent.razorpayOrderId}`,
      payment: { razorpayOrderId: intent.razorpayOrderId, razorpayPaymentId: payment.id, paidPaise: intent.amountPaise, discountPercent: intent.discountPercent },
    });
  } catch (err) {
    // Paid, but the order can't be made: give all of it back, once
    const reason = (err as Error)?.message ?? 'Order could not be placed';
    const claimed = await OnlinePayment.findOneAndUpdate(
      { _id: intent._id, status: 'CREATED' },
      { $set: { status: 'REFUNDING', razorpayPaymentId: payment.id, refund: { reason: reason.slice(0, 300) } } },
      { new: true }
    );
    if (claimed) {
      try {
        const r = await refundPayment(payment.id, intent.amountPaise, { reason: 'order_not_placed' });
        await OnlinePayment.updateOne({ _id: intent._id }, { $set: { status: 'REFUNDED', 'refund.razorpayRefundId': r.id } });
      } catch (refundErr) {
        await OnlinePayment.updateOne({ _id: intent._id }, { $set: { 'refund.error': ((refundErr as Error)?.message ?? 'Refund failed').slice(0, 300) } });
        logger.error('[payments] refund after failed order did not go through', { razorpayOrderId: intent.razorpayOrderId, error: (refundErr as Error)?.message });
      }
    }
    throw AppError.conflict(`${reason} Your payment of ${rs(intent.amountPaise)} is being refunded. It usually reaches you in 5 to 7 working days.`);
  }

  await OnlinePayment.updateOne(
    { _id: intent._id, status: 'CREATED' },
    { $set: { status: 'ORDERED', razorpayPaymentId: payment.id, orderIds: made.orders.map((o) => o._id) } }
  );
  // Each part's seller must accept or reject their offer
  if (!made.replayed) for (const order of made.orders) announceNewOrder(order);
  return { ...summary(made.orders), replayed: made.replayed };
}

/** Is this Razorpay order a buyer checkout? (The webhook routes payments by it.) */
export async function isBuyerPayment(razorpayOrderId: string): Promise<boolean> {
  return !!(await OnlinePayment.exists({ razorpayOrderId }));
}
