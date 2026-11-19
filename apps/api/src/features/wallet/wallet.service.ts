// Seller Sthiva balance: a prepaid balance that commission is taken from.
//
// Owner decisions (2026-11-21):
//   - Sellers top up through Razorpay; smallest top-up from settings (Rs 1,000). Sthiva pays the gateway
//     fee, so a Rs 1,000 top-up adds exactly Rs 1,000.
//   - The commission is taken when the seller accepts an order. With too little balance the order is not
//     accepted: the seller sees how much to top up and can still accept while the offer is open.
//   - Taken at the "Sthiva delivers" rate (the delivery mode is not known yet). If the seller then
//     delivers with their own vehicle, the difference to the lower rate comes back.
//   - Given back in full if the order is cancelled by the buyer or ops. A seller who cancels keeps the
//     cost (their fault). Ops can add or take balance by hand with a reason.
//   - The rule is only active when ops switches it on (PlatformSettings.sellerWalletEnabled).
//
// Every change to SupplierProfile.walletBalancePaise writes one WalletEntry in the same transaction.
// Each entry has a unique key, so retries and the Razorpay webhook racing the browser can never move
// money twice. The balance can never go below zero.

import mongoose, { ClientSession, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { WalletEntry, type WalletEntryType } from '../../infrastructure/database/models/WalletEntry.model';
import { WalletTopUp } from '../../infrastructure/database/models/WalletTopUp.model';
import { Order, type IOrder } from '../../infrastructure/database/models/Order.model';
import { getPlatformSettings } from '../../infrastructure/database/models/PlatformSettings.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import {
  razorpayReady, razorpayKeyId, createRazorpayOrder, confirmPayment, checkoutSignatureValid,
} from '../../shared/services/razorpay';
import { supplierEarnings } from '../orders/commission';
import { toPaise, paiseToRupees } from '../orders/pricing';

type LeanOrder = IOrder & { _id: Types.ObjectId };

export const MAX_TOPUP_RUPEES = 1_00_000;

export async function inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => { result = await fn(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

const rupees = (paise: number) => paiseToRupees(paise);
const rs = (paise: number) => `Rs ${rupees(paise).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function insufficientBalance(neededPaise: number, balancePaise: number) {
  const short = neededPaise - balancePaise;
  return new AppError(
    `Insufficient balance. This order's commission is ${rs(neededPaise)} and your balance is ${rs(balancePaise)}. Top up at least ${rs(short)} to accept it.`,
    'INSUFFICIENT_BALANCE', 409,
    { commission: rupees(neededPaise), balance: rupees(balancePaise), shortBy: rupees(short) }
  );
}

/**
 * Moves money in or out of a seller's balance, once per key. Returns false if this key already moved.
 * Taking more than the balance throws INSUFFICIENT_BALANCE (and the caller's transaction rolls back).
 */
export async function moveBalance(p: {
  supplierId: Types.ObjectId | string; amountPaise: number; type: WalletEntryType; key: string; session: ClientSession;
  orderId?: Types.ObjectId; orderNumber?: string; note?: string; byUserId?: string; razorpayPaymentId?: string;
}): Promise<boolean> {
  if (!Number.isInteger(p.amountPaise)) throw new Error('amountPaise must be whole paise');
  if (await WalletEntry.exists({ key: p.key }).session(p.session)) return false;
  const supplierId = new Types.ObjectId(String(p.supplierId));
  const filter: Record<string, unknown> = { _id: supplierId };
  if (p.amountPaise < 0) filter.walletBalancePaise = { $gte: -p.amountPaise };
  const after = await SupplierProfile.findOneAndUpdate(filter, { $inc: { walletBalancePaise: p.amountPaise } }, { new: true, session: p.session })
    .select('walletBalancePaise').lean();
  if (!after) {
    const now = await SupplierProfile.findById(supplierId).select('walletBalancePaise').session(p.session).lean();
    if (!now) throw AppError.notFound('Supplier profile');
    throw insufficientBalance(-p.amountPaise, now.walletBalancePaise ?? 0);
  }
  await WalletEntry.create([{
    supplierId, type: p.type, amountPaise: p.amountPaise, balanceAfterPaise: after.walletBalancePaise, key: p.key,
    orderId: p.orderId, orderNumber: p.orderNumber, note: p.note, razorpayPaymentId: p.razorpayPaymentId,
    byUserId: p.byUserId ? new Types.ObjectId(p.byUserId) : undefined,
  }], { session: p.session });
  return true;
}

/** Commission on an order at each delivery mode, in paise. */
export function commissionOf(order: LeanOrder) {
  const e = supplierEarnings({ ...order, deliveryMode: undefined });
  return { sthivaDelivers: toPaise(e.commissionIfSthivaDelivers), youDeliver: toPaise(e.commissionIfYouDeliver) };
}

export async function walletEnabled(): Promise<boolean> {
  return !!(await getPlatformSettings())?.sellerWalletEnabled;
}

/**
 * Inside the accept transaction: takes the commission for an order the seller just accepted and records
 * it on the order. Throws INSUFFICIENT_BALANCE when the balance is short, which undoes the accept.
 */
export async function takeCommissionOnAccept(order: LeanOrder, userId: string, session: ClientSession) {
  const hold = commissionOf(order).sthivaDelivers;
  if (hold > 0) {
    await moveBalance({
      supplierId: order.supplierId, amountPaise: -hold, type: 'COMMISSION', key: `hold:${order._id}`, session,
      orderId: order._id, orderNumber: order.orderNumber, byUserId: userId,
      note: 'Commission for this order (Sthiva delivery rate)',
    });
  }
  await Order.updateOne({ _id: order._id }, { $set: { walletCommissionPaise: hold } }, { session });
}

/**
 * The seller is delivering with their own vehicle: gives back the difference to the lower rate, once.
 * Safe to call any number of times (dispatch and delivery both call it).
 */
export async function returnSelfDeliveryDifference(orderId: Types.ObjectId | string): Promise<void> {
  const order = await Order.findById(orderId).lean<LeanOrder>();
  if (!order || order.walletCommissionPaise === undefined || order.deliveryMode !== 'SUPPLIER' || order.status === 'CANCELLED') return;
  const c = commissionOf(order);
  const diff = c.sthivaDelivers - c.youDeliver;
  if (diff <= 0) return;
  await inTransaction(async (session) => {
    const moved = await moveBalance({
      supplierId: order.supplierId, amountPaise: diff, type: 'COMMISSION_RETURN', key: `mode:${order._id}`, session,
      orderId: order._id, orderNumber: order.orderNumber, note: 'You delivered yourself: lower commission rate',
    });
    if (moved) await Order.updateOne({ _id: order._id }, { $inc: { walletCommissionPaise: -diff } }, { session });
  });
}

/** Never blocks the order flow: a failure is logged, and the next call (or delivery) retries. */
export function returnSelfDeliveryDifferenceInBackground(orderId: Types.ObjectId | string) {
  returnSelfDeliveryDifference(orderId).catch((err) => logger.error('[wallet] self-delivery return failed', { orderId: String(orderId), error: err?.message }));
}

/** Inside the cancel transaction: gives back what is still taken for the order, unless the seller cancelled. */
export async function returnCommissionOnCancel(order: LeanOrder, actor: 'BUYER' | 'SUPPLIER' | 'OPS', session: ClientSession) {
  const held = order.walletCommissionPaise ?? 0;
  if (held <= 0 || actor === 'SUPPLIER') return;
  const moved = await moveBalance({
    supplierId: order.supplierId, amountPaise: held, type: 'COMMISSION_RETURN', key: `cancel:${order._id}`, session,
    orderId: order._id, orderNumber: order.orderNumber,
    note: actor === 'BUYER' ? 'Order cancelled by the buyer' : 'Order cancelled by Sthiva',
  });
  if (moved) await Order.updateOne({ _id: order._id }, { $set: { walletCommissionPaise: 0 } }, { session });
}

// ─── Top-ups ────────────────────────────────────────────────────────────────

async function profileOf(userId: string) {
  const profile = await SupplierProfile.findOne({ userId }).select('_id businessName walletBalancePaise').lean();
  if (!profile) throw AppError.notFound('Supplier profile');
  return profile;
}

/** Starts a top-up: a Razorpay order the seller's browser pays with Razorpay Checkout. */
export async function startTopUp(userId: string, amountRupees: number) {
  const settings = await getPlatformSettings();
  const min = settings?.minTopUpRupees ?? 1000;
  if (!Number.isFinite(amountRupees) || amountRupees < min) throw AppError.badRequest(`The smallest top-up is Rs ${min.toLocaleString('en-IN')}`);
  if (amountRupees > MAX_TOPUP_RUPEES) throw AppError.badRequest(`Top up at most Rs ${MAX_TOPUP_RUPEES.toLocaleString('en-IN')} at a time`);
  if (!razorpayReady()) throw new AppError('Online top-up is not set up yet. Write to support@sthiva.com to add balance.', 'SERVICE_UNAVAILABLE', 503);
  const profile = await profileOf(userId);
  const amountPaise = toPaise(amountRupees);
  const rzp = await createRazorpayOrder(amountPaise, `topup-${randomBytes(6).toString('hex')}`, {
    purpose: 'seller_topup', supplierId: String(profile._id),
  });
  await WalletTopUp.create({ supplierId: profile._id, userId: new Types.ObjectId(userId), amountPaise, razorpayOrderId: rzp.id });
  return { keyId: razorpayKeyId(), razorpayOrderId: rzp.id, amount: amountPaise, currency: 'INR', name: 'Sthiva', description: 'Sthiva balance top-up', businessName: profile.businessName };
}

/**
 * Credits a top-up once Razorpay confirms the payment. Called by the seller's browser (with Checkout's
 * signature) and by the webhook (signature checked on the whole request); whichever comes first credits.
 */
export async function completeTopUp(p: { razorpayOrderId: string; razorpayPaymentId: string; signature?: string; userId?: string }) {
  if (p.signature !== undefined && !checkoutSignatureValid(p.razorpayOrderId, p.razorpayPaymentId, p.signature)) {
    throw AppError.badRequest('Payment could not be verified');
  }
  const topUp = await WalletTopUp.findOne({ razorpayOrderId: p.razorpayOrderId }).lean();
  if (!topUp) throw AppError.notFound('Top-up');
  if (p.userId && String(topUp.userId) !== p.userId) throw AppError.notFound('Top-up');
  if (topUp.status === 'PAID') return { credited: false, amount: rupees(topUp.amountPaise) };
  // Razorpay's own record decides, not what the browser says
  const payment = await confirmPayment(p.razorpayPaymentId, p.razorpayOrderId, topUp.amountPaise);
  const credited = await inTransaction(async (session) => {
    const marked = await WalletTopUp.findOneAndUpdate(
      { _id: topUp._id, status: 'CREATED' },
      { $set: { status: 'PAID', paidAt: new Date(), razorpayPaymentId: payment.id } },
      { session }
    );
    if (!marked) return false;
    return moveBalance({
      supplierId: topUp.supplierId, amountPaise: topUp.amountPaise, type: 'TOPUP', key: `topup:${topUp.razorpayOrderId}`, session,
      razorpayPaymentId: payment.id, note: payment.method ? `Paid by ${payment.method}` : undefined,
    });
  });
  return { credited, amount: rupees(topUp.amountPaise) };
}

// ─── Reading ────────────────────────────────────────────────────────────────

export function entryView(e: { _id: Types.ObjectId; type: string; amountPaise: number; balanceAfterPaise: number; orderId?: Types.ObjectId; orderNumber?: string; note?: string; createdAt: Date }) {
  return {
    id: String(e._id), type: e.type, amount: rupees(e.amountPaise), balanceAfter: rupees(e.balanceAfterPaise),
    orderId: e.orderId ? String(e.orderId) : undefined, orderNumber: e.orderNumber, note: e.note, at: e.createdAt,
  };
}

export async function walletSummary(supplierId: Types.ObjectId | string, page = 1, limit = 20) {
  const [profile, entries, total, settings] = await Promise.all([
    SupplierProfile.findById(supplierId).select('walletBalancePaise').lean(),
    WalletEntry.find({ supplierId }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    WalletEntry.countDocuments({ supplierId }),
    getPlatformSettings(),
  ]);
  if (!profile) throw AppError.notFound('Supplier profile');
  return {
    balance: rupees(profile.walletBalancePaise ?? 0),
    enabled: !!settings?.sellerWalletEnabled,
    canTopUp: razorpayReady(),
    minTopUp: settings?.minTopUpRupees ?? 1000,
    maxTopUp: MAX_TOPUP_RUPEES,
    entries: entries.map(entryView),
    page, limit, total,
  };
}

export async function myWallet(userId: string, page?: number) {
  return walletSummary((await profileOf(userId))._id, page);
}

/** Ops adds (+) or takes (-) balance by hand, with a reason. */
export async function adjustBalance(p: { supplierId: string; amountRupees: number; note: string; byUserId: string }) {
  // toPaise takes only amounts of 0 or more
  const amountPaise = Math.sign(p.amountRupees) * toPaise(Math.abs(p.amountRupees));
  if (amountPaise === 0) throw AppError.badRequest('Enter an amount other than zero');
  await inTransaction((session) => moveBalance({
    supplierId: p.supplierId, amountPaise, type: 'ADJUSTMENT', key: `adjust:${randomBytes(8).toString('hex')}`, session,
    note: p.note, byUserId: p.byUserId,
  }));
  return walletSummary(p.supplierId);
}
