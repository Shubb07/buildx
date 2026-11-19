// Buyer problem reports after delivery (model: ProblemReport). Owner decisions 2026-11-20:
//  - returns depend on the product and the seller: each order line carries the returnPolicy promised
//    when it was ordered (Product.returnPolicy), default "note it at delivery, no change of mind";
//  - "note it at delivery" lines can be put on record here for a short time after delivery, so what
//    the buyer saw on the spot (and told the driver) is written down with photos;
//  - change-of-mind returns only where the product allows them, sealed items, buyer pays the trip;
//  - approved refunds go to the buyer's UPI within 3 working days, never as credit or coupons;
//  - when the seller is at fault they pay the refund (less Sthiva's commission, which Sthiva returns)
//    and the return trip, from their next payout statement (features/settlements).

import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import { Order, type IOrder } from '../../infrastructure/database/models/Order.model';
import { ProblemReport, type IProblemReport, type ProblemKind, type IProblemLine } from '../../infrastructure/database/models/ProblemReport.model';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { User } from '../../infrastructure/database/models/User.model';
import { AppError } from '../../shared/errors/AppError';
import { notifyUser } from '../../shared/services/notification.service';

const HOUR = 3_600_000;
// What was noticed on the spot can be put on record for this long after delivery
export const AT_DELIVERY_RECORD_HOURS = 2;
const PROBLEM_HOURS: Record<string, number> = { AT_DELIVERY: AT_DELIVERY_RECORD_HOURS, H24: 24, H48: 48, D7: 168 };
const CHANGE_OF_MIND_HOURS: Record<string, number> = { NONE: 0, UNOPENED_1D: 24, UNOPENED_7D: 168 };
const OPEN_STATES = ['OPEN', 'SELLER_REPLIED'];

type LeanOrder = IOrder & { _id: Types.ObjectId };
type LeanReport = IProblemReport & { _id: Types.ObjectId };

const round2 = (n: number) => Math.round(n * 100) / 100;

function deliveredAtOf(o: LeanOrder): Date | null {
  if (o.deliveredAt) return new Date(o.deliveredAt);
  const ev = [...(o.statusHistory ?? [])].reverse().find((e) => e.status === 'DELIVERED');
  return ev ? new Date(ev.at) : null;
}

export type LineWindow = { index: number; name: string; unit: string; quantity: number; problemUntil: string | null; changeOfMindUntil: string | null; atDeliveryOnly: boolean };

/** Until when each line of a delivered order can be reported, as promised when ordered. */
export function lineWindows(o: LeanOrder, now = new Date()): LineWindow[] {
  const at = deliveredAtOf(o);
  return o.items.map((it, index) => {
    const policy = it.returnPolicy ?? { problemWindow: 'AT_DELIVERY', changeOfMind: 'NONE' };
    const p = PROBLEM_HOURS[policy.problemWindow] ?? AT_DELIVERY_RECORD_HOURS;
    const c = CHANGE_OF_MIND_HOURS[policy.changeOfMind] ?? 0;
    const until = (h: number) => (at && h > 0 && at.getTime() + h * HOUR > now.getTime() ? new Date(at.getTime() + h * HOUR).toISOString() : null);
    return {
      index, name: it.name, unit: it.unit, quantity: it.quantity,
      problemUntil: until(p), changeOfMindUntil: until(c),
      atDeliveryOnly: (policy.problemWindow ?? 'AT_DELIVERY') === 'AT_DELIVERY',
    };
  });
}

/** YYYY-MM-DD, n working days (Monday to Friday) after `from`, in India time. */
export function addWorkingDays(from: Date, n: number): string {
  const d = new Date(from.getTime() + 330 * 60_000);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

function reportNumber() {
  const d = new Date(Date.now() + 330 * 60_000).toISOString();
  return `PR-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

async function sellerUserId(supplierId: Types.ObjectId | string): Promise<string | null> {
  const p = await SupplierProfile.findById(supplierId).select('userId').lean();
  return p ? String(p.userId) : null;
}

const KIND_WORDS: Record<ProblemKind, string> = {
  DAMAGED: 'damaged', WRONG_ITEM: 'wrong item', SHORT: 'short quantity', DEFECTIVE: 'defective', CHANGE_OF_MIND: 'change of mind return',
};

// ─── Buyer ──────────────────────────────────────────────────────────────────

async function buyerOrder(buyerId: string, orderId: string): Promise<LeanOrder> {
  const o = await Order.findOne({ _id: orderId, buyerId }).lean<LeanOrder>();
  if (!o) throw AppError.notFound('Order');
  return o;
}

function buyerView(r: LeanReport) {
  return {
    _id: String(r._id), number: r.number, kind: r.kind, status: r.status, lines: r.lines.map(({ sellerShare: _s, ...l }) => l),
    description: r.description, photos: r.photos, want: r.want, upiId: r.upiId, claimValue: r.claimValue,
    sellerReply: r.sellerReply ? { agrees: r.sellerReply.agrees, note: r.sellerReply.note, at: r.sellerReply.at } : undefined,
    resolution: r.resolution ? {
      outcome: r.resolution.outcome, refundAmount: r.resolution.refundAmount, returnTripCharge: r.resolution.returnTripCharge,
      note: r.resolution.note, refundDueBy: r.resolution.refundDueBy, at: r.resolution.at,
    } : undefined,
    refundPaidAt: r.refund?.paidAt, createdAt: r.createdAt,
  };
}

/** What a buyer can report on one order, and their reports so far. */
export async function buyerOrderProblems(buyerId: string, orderId: string) {
  const o = await buyerOrder(buyerId, orderId);
  const reports = await ProblemReport.find({ orderId: o._id }).sort({ createdAt: -1 }).lean<LeanReport[]>();
  const delivered = o.status === 'DELIVERED';
  return {
    delivered,
    deliveredAt: deliveredAtOf(o),
    lines: delivered ? lineWindows(o) : [],
    hasOpenReport: reports.some((r) => OPEN_STATES.includes(r.status)),
    reports: reports.map(buyerView),
  };
}

export type NewProblem = {
  buyerId: string; orderId: string; kind: ProblemKind;
  lines: { index: number; quantity: number }[];
  description: string; photos: string[]; want: 'REFUND' | 'REPLACEMENT'; upiId?: string;
};

export async function reportProblem(input: NewProblem, now = new Date()) {
  const o = await buyerOrder(input.buyerId, input.orderId);
  if (o.status !== 'DELIVERED') throw AppError.conflict('You can report a problem once the order is delivered. Before that, refuse damaged or short items at delivery.');
  if (await ProblemReport.exists({ orderId: o._id, status: { $in: OPEN_STATES } })) {
    throw AppError.conflict('This order already has an open report. We will update you on it first.');
  }
  const windows = lineWindows(o, now);
  const changeOfMind = input.kind === 'CHANGE_OF_MIND';
  if (changeOfMind && input.want !== 'REFUND') throw AppError.badRequest('A change-of-mind return is refunded, not replaced');
  if (input.want === 'REFUND' && !input.upiId) throw AppError.badRequest('Give your UPI ID for the refund');
  if (!changeOfMind && input.photos.length === 0) throw AppError.badRequest('Add at least one photo of the problem');

  const seen = new Set<number>();
  const lines: IProblemLine[] = [];
  for (const l of input.lines) {
    if (seen.has(l.index)) throw AppError.badRequest('Each item can be chosen once');
    seen.add(l.index);
    const it = o.items[l.index];
    const w = windows[l.index];
    if (!it || !w) throw AppError.badRequest('That item is not in this order');
    if (l.quantity > it.quantity) throw AppError.badRequest(`You ordered ${it.quantity} of ${it.name}`);
    if (changeOfMind && !w.changeOfMindUntil) {
      throw AppError.conflict(`${it.name} cannot be returned for a change of mind${it.returnPolicy?.changeOfMind && it.returnPolicy.changeOfMind !== 'NONE' ? ' any more: the return time has passed' : ''}`);
    }
    if (!changeOfMind && !w.problemUntil) {
      throw AppError.conflict(w.atDeliveryOnly
        ? `${it.name} had to be checked at delivery, and the time to put it on record has passed. Call us if you told the driver about it.`
        : `The time to report a problem with ${it.name} has passed`);
    }
    const buyerUnitPrice = it.quantity > 0 ? it.lineTotal / it.quantity : 0;
    const sellerShare = it.supplierLineTotal && it.lineTotal > 0 ? Math.min(1, it.supplierLineTotal / it.lineTotal) : 1;
    lines.push({ index: l.index, name: it.name, unit: it.unit, quantity: l.quantity, orderedQuantity: it.quantity, buyerUnitPrice: round2(buyerUnitPrice), sellerShare }); // exact: rounding here showed up as paise in charges
  }
  const claimValue = round2(lines.reduce((s, l) => s + l.quantity * l.buyerUnitPrice, 0));

  const doc = await ProblemReport.create({
    number: reportNumber(), orderId: o._id, orderNumber: o.orderNumber, buyerId: o.buyerId, supplierId: o.supplierId,
    kind: input.kind, lines, description: input.description, photos: input.photos, want: input.want,
    ...(input.upiId ? { upiId: input.upiId } : {}), claimValue,
  });
  const seller = await sellerUserId(o.supplierId);
  if (seller) {
    notifyUser(seller, {
      title: `Problem reported on ${o.orderNumber}`,
      body: `The buyer reports: ${KIND_WORDS[input.kind]} (${lines.map((l) => `${l.quantity} ${l.name}`).join(', ')}). Please reply today.`,
      data: { screen: 'supplier_problems', problemId: String(doc._id) },
    });
  }
  return buyerView(doc.toObject() as LeanReport);
}

export async function withdrawProblem(buyerId: string, id: string) {
  const r = await ProblemReport.findOneAndUpdate({ _id: id, buyerId, status: { $in: OPEN_STATES } }, { $set: { status: 'WITHDRAWN' } }, { new: true }).lean<LeanReport>();
  if (r) return buyerView(r);
  if (!(await ProblemReport.exists({ _id: id, buyerId }))) throw AppError.notFound('Report');
  throw AppError.conflict('This report is already closed');
}

// ─── Seller ─────────────────────────────────────────────────────────────────

function sellerView(r: LeanReport) {
  return {
    _id: String(r._id), number: r.number, orderId: String(r.orderId), orderNumber: r.orderNumber, kind: r.kind, status: r.status,
    lines: r.lines.map(({ sellerShare: _s, ...l }) => l), description: r.description, photos: r.photos, want: r.want, claimValue: r.claimValue,
    sellerReply: r.sellerReply,
    resolution: r.resolution ? { outcome: r.resolution.outcome, atFault: r.resolution.atFault, sellerCharge: r.resolution.sellerCharge, note: r.resolution.note, at: r.resolution.at } : undefined,
    createdAt: r.createdAt,
  };
}

export async function sellerProblems(supplierId: Types.ObjectId | string) {
  const rows = await ProblemReport.find({ supplierId, status: { $ne: 'WITHDRAWN' } }).sort({ createdAt: -1 }).limit(100).lean<LeanReport[]>();
  return rows.map(sellerView);
}

export async function sellerReply(supplierId: Types.ObjectId | string, id: string, agrees: boolean, note?: string) {
  const r = await ProblemReport.findOneAndUpdate(
    { _id: id, supplierId, status: { $in: OPEN_STATES } },
    { $set: { status: 'SELLER_REPLIED', sellerReply: { agrees, ...(note ? { note } : {}), at: new Date() } } },
    { new: true }
  ).lean<LeanReport>();
  if (r) return sellerView(r);
  if (!(await ProblemReport.exists({ _id: id, supplierId }))) throw AppError.notFound('Report');
  throw AppError.conflict('Sthiva has already closed this report');
}

// ─── Sthiva's team ──────────────────────────────────────────────────────────

export async function opsProblems(status?: string) {
  const q: Record<string, unknown> = {};
  if (status === 'OPEN') q.status = { $in: OPEN_STATES };
  else if (status === 'REFUND_DUE') { q.status = 'RESOLVED'; q['resolution.refundAmount'] = { $gt: 0 }; q.refund = { $exists: false }; }
  else if (status) q.status = status;
  const rows = await ProblemReport.find(q).sort({ createdAt: -1 }).limit(200).lean<LeanReport[]>();
  const sellers = await SupplierProfile.find({ _id: { $in: rows.map((r) => r.supplierId) } }).select('businessName userId').lean();
  const users = await User.find({ _id: { $in: [...rows.map((r) => r.buyerId), ...sellers.map((p) => p.userId)] } }).select('name phone').lean();
  const u = new Map(users.map((x) => [String(x._id), x]));
  const s = new Map(sellers.map((p) => [String(p._id), p]));
  return rows.map((r) => {
    const sp = s.get(String(r.supplierId));
    return {
      ...r,
      _id: String(r._id),
      buyer: { name: u.get(String(r.buyerId))?.name ?? 'Buyer', phone: u.get(String(r.buyerId))?.phone },
      seller: { name: sp?.businessName ?? 'Seller', phone: sp ? u.get(String(sp.userId))?.phone : undefined },
    };
  });
}

/** What the seller pays by default: their share of the refund (Sthiva gives back its commission), plus the trip if at fault. */
export function suggestedSellerCharge(r: Pick<IProblemReport, 'lines' | 'claimValue'>, outcome: string, atFault: string, refundAmount: number, returnTripCharge: number): number {
  if (outcome === 'REJECTED' || atFault === 'NONE') return 0;
  const weight = r.claimValue > 0
    ? r.lines.reduce((s, l) => s + l.quantity * l.buyerUnitPrice * l.sellerShare, 0) / r.claimValue
    : 1;
  const share = round2(refundAmount * weight);
  return atFault === 'SELLER' ? round2(share + returnTripCharge) : share;
}

export type Resolution = {
  id: string; byUserId: string;
  outcome: 'REFUND' | 'REPLACEMENT' | 'REJECTED';
  atFault: 'SELLER' | 'BUYER' | 'NONE';
  refundAmount?: number; returnTripCharge?: number; sellerCharge?: number; note: string;
};

export async function resolveProblem(input: Resolution, now = new Date()) {
  const r = await ProblemReport.findById(input.id).lean<LeanReport>();
  if (!r) throw AppError.notFound('Report');
  if (!OPEN_STATES.includes(r.status)) throw AppError.conflict('This report is already closed');
  const refundAmount = input.outcome === 'REFUND' ? round2(input.refundAmount ?? 0) : 0;
  if (input.outcome === 'REFUND') {
    if (refundAmount <= 0) throw AppError.badRequest('Enter the refund amount');
    if (!r.upiId) throw AppError.badRequest('The buyer gave no UPI ID; ask for one before refunding');
    const order = await Order.findById(r.orderId).select('total').lean();
    if (order && refundAmount > order.total) throw AppError.badRequest(`The refund cannot be more than the order total (₹${order.total})`);
  }
  const returnTripCharge = input.outcome === 'REJECTED' ? 0 : round2(input.returnTripCharge ?? 0);
  const sellerCharge = input.sellerCharge !== undefined
    ? round2(input.sellerCharge)
    : suggestedSellerCharge(r, input.outcome, input.atFault, refundAmount, returnTripCharge);

  const updated = await ProblemReport.findOneAndUpdate(
    { _id: r._id, status: { $in: OPEN_STATES } },
    { $set: {
      status: input.outcome === 'REJECTED' ? 'REJECTED' : 'RESOLVED',
      resolution: {
        outcome: input.outcome, atFault: input.atFault, refundAmount, returnTripCharge, sellerCharge, note: input.note,
        ...(refundAmount > 0 ? { refundDueBy: addWorkingDays(now, 3) } : {}),
        by: new Types.ObjectId(input.byUserId), at: now,
      },
    } },
    { new: true }
  ).lean<LeanReport>();
  if (!updated) throw AppError.conflict('This report changed while you were deciding. Please reload.');

  notifyUser(String(r.buyerId), {
    title: input.outcome === 'REJECTED' ? `About your report ${r.number}` : `Your report ${r.number} is resolved`,
    body: input.outcome === 'REFUND' ? `A refund of ₹${refundAmount} will reach your UPI by ${updated.resolution!.refundDueBy}.`
      : input.outcome === 'REPLACEMENT' ? 'The seller will replace the items. We will tell you the delivery date.'
      : input.note,
    data: { screen: 'order', orderId: String(r.orderId) },
  });
  const seller = await sellerUserId(r.supplierId);
  if (seller) {
    notifyUser(seller, {
      title: `Report ${r.number} closed`,
      body: sellerCharge > 0 ? `₹${sellerCharge} will be taken from your next payout. ${input.note}` : input.note,
      data: { screen: 'supplier_problems', problemId: String(r._id) },
    });
  }
  return updated;
}

export async function markRefundPaid(id: string, byUserId: string, reference: string) {
  const r = await ProblemReport.findOneAndUpdate(
    { _id: id, status: 'RESOLVED', 'resolution.refundAmount': { $gt: 0 }, refund: { $exists: false } },
    { $set: { refund: { paidAt: new Date(), reference, by: new Types.ObjectId(byUserId) } } },
    { new: true }
  ).lean<LeanReport>();
  if (r) {
    notifyUser(String(r.buyerId), { title: 'Refund sent', body: `₹${r.resolution!.refundAmount} was sent to ${r.upiId}. Reference ${reference}.`, data: { screen: 'order', orderId: String(r.orderId) } });
    return r;
  }
  const current = await ProblemReport.findById(id).lean<LeanReport>();
  if (!current) throw AppError.notFound('Report');
  throw AppError.conflict(current.refund ? 'The refund is already marked paid' : 'This report has no refund to pay');
}
