// Bulk quotes (market study step 5): for jobs too big for listed prices. A buyer posts a list with a
// PIN and a needed-by date; verified sellers who deliver there and sell those items reply with a
// price per item and a delivery date; the buyer accepts one and it becomes a confirmed order.
//
// Rules:
//   - Sellers are invited when they serve the PIN and list at least one of the items or sell in
//     their category. Each reply prices every line (the seller may order in what they lack).
//   - The buyer sees the seller's price plus Sthiva's commission for each category and GST, the
//     same way listed prices are shown, so replies compare fairly with the catalogue.
//   - New replies close 48 hours after the request (or at the needed-by date if sooner); the buyer
//     can accept any reply until the needed-by date.
//   - Accepting makes a CONFIRMED order with that seller at the quoted prices and their delivery
//     date (the seller already agreed). Stock is not reserved: a quote may include ordered-in goods.
//   - The buyer's full address and phone go to the seller only once their quote is accepted.

import { randomBytes, randomInt } from 'crypto';
import mongoose, { Types } from 'mongoose';
import { QuoteRequest, type IQuoteRequest, type SellerQuote } from '../../infrastructure/database/models/QuoteRequest.model';
import { Product } from '../../infrastructure/database/models/Product.model';
import { CatalogItem } from '../../infrastructure/database/models/CatalogItem.model';
import { Category } from '../../infrastructure/database/models/Category.model';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { Order } from '../../infrastructure/database/models/Order.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import { notifyUser, notifyUsers } from '../../shared/services/notification.service';
import { eligibleSupplierIds, resolveDestination } from '../serviceability/serviceability.service';
import { ratesFor, buyerProduct } from '../orders/commission';
import { priceOrder, paiseToRupees, toPaise, PricingError } from '../orders/pricing';
import { daysFromToday, istToday } from '../orders/delivery-window';
import { supplierDistances } from '../orders/allocation.service';
import { deliveryPoint } from '../delivery/delivery-pricing';

export const REPLY_HOURS = 48;
export const MAX_NEEDED_BY_DAYS = 60;

const DAY = 86_400_000;
const endOfIstDay = (date: string) => new Date(Date.parse(`${date}T23:59:59.999+05:30`));
const newNumber = () => `RQ-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;

type Lean = IQuoteRequest;
type Address = IQuoteRequest['deliveryAddress'];

/** Is the request still open, and can sellers still reply? (closed lazily, nothing has to run) */
export function requestState(r: Pick<Lean, 'status' | 'expiresAt' | 'neededBy'>, now = new Date()) {
  const pastNeeded = now > endOfIstDay(r.neededBy);
  const status = r.status === 'OPEN' && pastNeeded ? 'EXPIRED' : r.status;
  return { status, repliesOpen: status === 'OPEN' && now < new Date(r.expiresAt) };
}

// ─── Buyer ─────────────────────────────────────────────────────────────────

export async function createRequest(params: {
  buyerId: string;
  items: { productId: string; quantity: number }[];
  deliveryAddress: Omit<Address, 'district' | 'state'>;
  neededBy: string;
  notes?: string;
}) {
  const { buyerId, items, neededBy, notes } = params;
  const ahead = daysFromToday(neededBy);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(neededBy) || Number.isNaN(Date.parse(`${neededBy}T00:00:00Z`))) throw AppError.badRequest('Choose a valid date', { field: 'neededBy' });
  if (ahead < 1) throw AppError.badRequest('Choose tomorrow or a later date', { field: 'neededBy' });
  if (ahead > MAX_NEEDED_BY_DAYS) throw AppError.badRequest(`Choose a date within ${MAX_NEEDED_BY_DAYS} days`, { field: 'neededBy' });

  const destination = await resolveDestination(params.deliveryAddress.pincode);
  const products = await Product.find({ _id: { $in: items.map((i) => i.productId) } }).select('catalogItemId').lean();
  const itemOf = new Map(products.map((p) => [String(p._id), p.catalogItemId]));
  const catalogIds = items.map((i) => itemOf.get(i.productId));
  if (catalogIds.some((id) => !id)) throw AppError.badRequest('One of the items is not in the Sthiva catalogue. Remove it and try again.');
  if (new Set(catalogIds.map(String)).size !== catalogIds.length) throw AppError.badRequest('Each item can appear once');
  const catalog = await CatalogItem.find({ _id: { $in: catalogIds }, status: 'ACTIVE' }).select('name unit categoryId gstRate').lean();
  const byId = new Map(catalog.map((c) => [String(c._id), c]));
  if (catalog.length !== catalogIds.length) throw AppError.badRequest('One of the items is no longer sold. Remove it and try again.');
  const lines = items.map((it, i) => {
    const c = byId.get(String(catalogIds[i]))!;
    return { catalogItemId: c._id, categoryId: c.categoryId, name: c.name, unit: c.unit, quantity: it.quantity, gstRate: c.gstRate ?? 18 };
  });

  // Invite sellers who deliver here and list any of the items, or sell in their category
  const eligible = await eligibleSupplierIds(destination.pincode);
  const listers = await Product.distinct('supplierId', { supplierId: { $in: eligible }, catalogItemId: { $in: catalogIds }, status: { $ne: 'DISCONTINUED' } });
  const slugs = (await Category.find({ _id: { $in: lines.map((l) => l.categoryId) } }).select('slug').lean()).map((c) => c.slug);
  const byCategory = await SupplierProfile.find({ _id: { $in: eligible }, categories: { $in: slugs } }).select('_id').lean();
  const invited = [...new Set([...listers.map(String), ...byCategory.map((p) => String(p._id))])].map((id) => new Types.ObjectId(id));
  if (!invited.length) throw AppError.conflict('No verified seller near your site sells these items yet. Try a different PIN, or order what is listed.');

  const now = new Date();
  const expiresAt = new Date(Math.min(now.getTime() + REPLY_HOURS * 3600_000, endOfIstDay(neededBy).getTime()));
  const request = await QuoteRequest.create({
    number: newNumber(),
    buyerId,
    lines,
    deliveryAddress: { ...params.deliveryAddress, pincode: destination.pincode, district: destination.district, state: destination.state },
    neededBy,
    ...(notes ? { notes } : {}),
    status: 'OPEN',
    expiresAt,
    invitedSupplierIds: invited,
    quotes: [],
  });

  const sellers = await SupplierProfile.find({ _id: { $in: invited } }).select('userId').lean();
  notifyUsers(sellers.map((s) => s.userId.toString()), {
    title: 'New bulk quote request',
    body: `${lines.length} item${lines.length === 1 ? '' : 's'} for PIN ${destination.pincode}, needed by ${neededBy}. Reply within ${REPLY_HOURS} hours.`,
    data: { screen: 'supplier_quotes', requestId: request._id.toString() },
  });
  logger.info('[quotes] request created', { requestId: String(request._id), lines: lines.length, invited: invited.length });
  return request.toObject();
}

/** Buyer prices for one seller's quote: commission per category added, then GST, like listed prices */
async function buyerTotals(r: Pick<Lean, 'lines'>, q: Pick<SellerQuote, 'prices' | 'isGstInclusive' | 'deliveryCharge'>) {
  const rates = await ratesFor(r.lines.map((l) => l.categoryId));
  const listing = (i: number) => ({ name: r.lines[i].name, unit: r.lines[i].unit, basePrice: q.prices[i], gstRate: r.lines[i].gstRate, isGstInclusive: q.isGstInclusive });
  const rateOf = (i: number) => {
    const rate = rates.get(String(r.lines[i].categoryId));
    if (!rate) throw AppError.conflict(`${r.lines[i].name} isn't on sale yet. Please check back soon.`);
    return rate;
  };
  try {
    const buyer = priceOrder(r.lines.map((l, i) => ({ product: buyerProduct(listing(i), rateOf(i).platform), quantity: l.quantity })));
    const seller = priceOrder(r.lines.map((l, i) => ({ product: listing(i), quantity: l.quantity })));
    const deliveryPaise = toPaise(q.deliveryCharge);
    return { buyer, seller, rates: r.lines.map((_, i) => rateOf(i)), deliveryPaise, totalPaise: buyer.totalPaise + deliveryPaise };
  } catch (err) {
    if (err instanceof PricingError) throw AppError.badRequest(err.message);
    throw err;
  }
}

/** The request as its buyer sees it: replies sorted by total, with seller name, rating and distance */
export async function buyerView(r: Lean) {
  const active = r.quotes.filter((q) => q.status === 'ACTIVE' || q.status === 'ACCEPTED');
  const sellers = await SupplierProfile.find({ _id: { $in: active.map((q) => q.supplierId) } })
    .select('businessName avgRating totalReviews verificationStatus').lean();
  const byId = new Map(sellers.map((s) => [String(s._id), s]));
  const drop = await deliveryPoint(r.deliveryAddress);
  const km = await supplierDistances(active.map((q) => q.supplierId), drop);
  const replies = await Promise.all(active.map(async (q) => {
    const t = await buyerTotals(r, q);
    const s = byId.get(String(q.supplierId));
    const d = km(q.supplierId);
    return {
      quoteId: String(q._id),
      status: q.status,
      seller: { name: s?.businessName ?? 'Seller', rating: s?.avgRating ?? 0, reviews: s?.totalReviews ?? 0, distanceKm: Number.isFinite(d) ? Math.round(d) : null },
      lines: r.lines.map((l, i) => ({ name: l.name, quantity: l.quantity, unit: l.unit, unitPrice: paiseToRupees(t.buyer.lines[i].unitPricePaise), lineTotal: paiseToRupees(t.buyer.lines[i].totalPaise) })),
      goods: paiseToRupees(t.buyer.totalPaise),
      gstAmount: paiseToRupees(t.buyer.gstPaise),
      deliveryCharge: q.deliveryCharge,
      total: paiseToRupees(t.totalPaise),
      deliveryDate: q.deliveryDate,
      note: q.note,
    };
  }));
  replies.sort((a, b) => a.total - b.total);
  const state = requestState(r);
  return {
    _id: String(r._id), number: r.number, status: state.status, repliesOpen: state.repliesOpen,
    lines: r.lines.map((l) => ({ name: l.name, unit: l.unit, quantity: l.quantity })),
    neededBy: r.neededBy, notes: r.notes, expiresAt: r.expiresAt, invited: r.invitedSupplierIds.length,
    deliveryAddress: r.deliveryAddress, orderId: r.orderId, createdAt: r.createdAt, replies,
  };
}

export async function getBuyerRequest(buyerId: string, id: string) {
  const r = await QuoteRequest.findOne({ _id: id, buyerId }).lean<Lean>();
  if (!r) throw AppError.notFound('Quote request');
  return buyerView(r);
}

export async function listBuyerRequests(buyerId: string) {
  const rows = await QuoteRequest.find({ buyerId }).sort({ createdAt: -1 }).limit(30).lean<Lean[]>();
  return rows.map((r) => ({
    _id: String(r._id), number: r.number, status: requestState(r).status, neededBy: r.neededBy,
    items: r.lines.length, replies: r.quotes.filter((q) => q.status !== 'WITHDRAWN').length, createdAt: r.createdAt, orderId: r.orderId,
  }));
}

export async function cancelRequest(buyerId: string, id: string) {
  const r = await QuoteRequest.findOneAndUpdate({ _id: id, buyerId, status: 'OPEN' }, { $set: { status: 'CANCELLED' } }, { new: true }).lean<Lean>();
  if (!r) throw AppError.conflict('This request is no longer open');
  const sellers = await SupplierProfile.find({ _id: { $in: r.quotes.filter((q) => q.status === 'ACTIVE').map((q) => q.supplierId) } }).select('userId').lean();
  notifyUsers(sellers.map((s) => s.userId.toString()), { title: 'Quote request closed', body: `The buyer closed request ${r.number}.`, data: { screen: 'supplier_quotes' } });
  return { status: r.status };
}

/** Accept one reply: a confirmed order with that seller at the quoted prices, in one transaction */
export async function acceptQuote(params: { buyerId: string; id: string; quoteId: string; expectedTotal?: number }) {
  const { buyerId, id, quoteId, expectedTotal } = params;
  const session = await mongoose.startSession();
  let made: { orderId: Types.ObjectId; orderNumber: string; total: number } | null = null;
  let sellerUserIds: { chosen?: string; others: string[] } = { others: [] };
  try {
    await session.withTransaction(async () => {
      const r = await QuoteRequest.findOne({ _id: id, buyerId }).session(session).lean<Lean>();
      if (!r) throw AppError.notFound('Quote request');
      if (requestState(r).status !== 'OPEN') throw AppError.conflict('This request is no longer open');
      const q = r.quotes.find((x) => String(x._id) === quoteId && x.status === 'ACTIVE');
      if (!q) throw AppError.conflict('That reply is no longer available. Choose another one.');
      const t = await buyerTotals(r, q);
      if (expectedTotal !== undefined && toPaise(expectedTotal) !== t.totalPaise) throw AppError.conflict('Prices changed. Please check the reply again.');

      const listings = await Product.find({ supplierId: q.supplierId, catalogItemId: { $in: r.lines.map((l) => l.catalogItemId) } })
        .select('catalogItemId images hsn').session(session).lean();
      const listingOf = new Map(listings.map((l) => [String(l.catalogItemId), l]));
      const now = new Date();
      const [order] = await Order.create([{
        orderNumber: `BX-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`,
        buyerId,
        supplierId: q.supplierId,
        items: r.lines.map((l, i) => {
          const own = listingOf.get(String(l.catalogItemId));
          const line = t.buyer.lines[i];
          return {
            ...(own ? { productId: own._id } : {}),
            catalogItemId: l.catalogItemId,
            name: l.name,
            imageUrl: own?.images?.[0]?.url ?? '',
            unit: l.unit,
            quantity: l.quantity,
            pricePerUnit: paiseToRupees(line.unitPricePaise),
            listPrice: paiseToRupees(line.listPricePaise),
            gstRate: l.gstRate,
            isGstInclusive: q.isGstInclusive,
            ...(own?.hsn ? { hsn: own.hsn } : {}),
            subtotal: paiseToRupees(line.grossPaise),
            taxableValue: paiseToRupees(line.taxablePaise),
            gstAmount: paiseToRupees(line.gstPaise),
            lineTotal: paiseToRupees(line.totalPaise),
            supplierUnitPrice: paiseToRupees(t.seller.lines[i].unitPricePaise),
            supplierLineTotal: paiseToRupees(t.seller.lines[i].totalPaise),
            commissionPercent: t.rates[i].platform,
            ...(t.rates[i].supplier !== null ? { supplierDeliveryPercent: t.rates[i].supplier } : {}),
          };
        }),
        supplierTotal: paiseToRupees(t.seller.totalPaise),
        commissionTotal: paiseToRupees(t.buyer.totalPaise - t.seller.totalPaise),
        deliveryAddress: r.deliveryAddress,
        serviceabilityCheck: 'VERIFIED',
        deliveryMethod: 'STANDARD',
        deliveryDate: q.deliveryDate,
        deliveryDateSetAt: now,
        deliveryCharge: q.deliveryCharge,
        subtotal: paiseToRupees(t.buyer.subtotalPaise),
        gstAmount: paiseToRupees(t.buyer.gstPaise),
        total: paiseToRupees(t.totalPaise),
        notes: [`From bulk quote ${r.number}`, r.notes].filter(Boolean).join('. '),
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        // The seller already agreed in their quote
        status: 'CONFIRMED',
        confirmedAt: now,
        allocation: { state: 'ACCEPTED', attempts: [{ supplierId: q.supplierId, offeredAt: q.at, outcome: 'ACCEPTED', at: now }] },
        // A quote may include goods the seller orders in: no stock is reserved
        inventoryState: 'NONE',
        deliveryOtp: String(randomInt(1000, 10000)),
        statusHistory: [{ status: 'CONFIRMED', at: now, byRole: 'BUYER', byUserId: buyerId, note: `Accepted quote on ${r.number}` }],
      }], { session });

      const res = await QuoteRequest.updateOne(
        { _id: r._id, status: 'OPEN' },
        {
          $set: { status: 'ACCEPTED', acceptedQuoteId: q._id, orderId: order._id, 'quotes.$[chosen].status': 'ACCEPTED', 'quotes.$[other].status': 'NOT_CHOSEN' },
        },
        { session, arrayFilters: [{ 'chosen._id': q._id }, { 'other._id': { $ne: q._id }, 'other.status': 'ACTIVE' }] }
      );
      if (res.modifiedCount !== 1) throw AppError.conflict('This request changed at the same time. Please refresh.');

      const profiles = await SupplierProfile.find({ _id: { $in: r.quotes.filter((x) => x.status === 'ACTIVE').map((x) => x.supplierId) } }).select('userId').session(session).lean();
      sellerUserIds = {
        chosen: profiles.find((p) => p._id.equals(q.supplierId))?.userId.toString(),
        others: profiles.filter((p) => !p._id.equals(q.supplierId)).map((p) => p.userId.toString()),
      };
      made = { orderId: order._id, orderNumber: order.orderNumber, total: order.total };
    });
  } finally {
    await session.endSession();
  }
  const m = made!;
  if (sellerUserIds.chosen) {
    notifyUser(sellerUserIds.chosen, { title: 'Your quote was accepted', body: `Order ${m.orderNumber} is confirmed at your quoted prices. Deliver on the date you gave.`, data: { screen: 'supplier_orders', orderId: String(m.orderId) } });
  }
  if (sellerUserIds.others.length) notifyUsers(sellerUserIds.others, { title: 'Quote not chosen', body: 'The buyer chose another reply this time.', data: { screen: 'supplier_quotes' } });
  logger.info('[quotes] accepted', { requestId: id, orderId: String(m.orderId) });
  return m;
}

// ─── Seller ────────────────────────────────────────────────────────────────

/** Open requests a seller is invited to (no buyer contact details), plus recent ones they replied to */
export async function sellerRequests(supplierId: Types.ObjectId) {
  const since = new Date(Date.now() - 30 * DAY);
  const rows = await QuoteRequest.find({ invitedSupplierIds: supplierId, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(50).lean<Lean[]>();
  const listings = await Product.find({ supplierId, catalogItemId: { $in: rows.flatMap((r) => r.lines.map((l) => l.catalogItemId)) } })
    .select('catalogItemId basePrice isGstInclusive stockQuantity supply').lean();
  const mineOf = new Map(listings.map((l) => [String(l.catalogItemId), l]));
  return rows.map((r) => {
    const state = requestState(r);
    const mine = r.quotes.find((q) => q.supplierId.equals(supplierId));
    const won = r.status === 'ACCEPTED' && mine?.status === 'ACCEPTED';
    return {
      _id: String(r._id), number: r.number, status: state.status, repliesOpen: state.repliesOpen, expiresAt: r.expiresAt,
      neededBy: r.neededBy, notes: r.notes,
      area: { pincode: r.deliveryAddress.pincode, district: r.deliveryAddress.district },
      lines: r.lines.map((l) => {
        const own = mineOf.get(String(l.catalogItemId));
        return { name: l.name, unit: l.unit, quantity: l.quantity, gstRate: l.gstRate, yourListing: own ? { price: own.basePrice, isGstInclusive: own.isGstInclusive, stock: own.supply === 'ON_ORDER' ? null : own.stockQuantity } : null };
      }),
      yourQuote: mine ? { prices: mine.prices, isGstInclusive: mine.isGstInclusive, deliveryCharge: mine.deliveryCharge, deliveryDate: mine.deliveryDate, note: mine.note, status: mine.status } : null,
      ...(won ? { orderId: r.orderId } : {}),
    };
  });
}

export async function submitQuote(params: { supplierId: Types.ObjectId; id: string; prices: number[]; isGstInclusive: boolean; deliveryCharge: number; deliveryDate: string; note?: string }) {
  const { supplierId, id, prices, isGstInclusive, deliveryCharge, deliveryDate, note } = params;
  const r = await QuoteRequest.findOne({ _id: id, invitedSupplierIds: supplierId }).lean<Lean>();
  if (!r) throw AppError.notFound('Quote request');
  if (!requestState(r).repliesOpen) throw AppError.conflict('Replies to this request are closed');
  if (prices.length !== r.lines.length) throw AppError.badRequest('Give a price for every item');
  if (deliveryDate < istToday() || daysFromToday(deliveryDate) < 0) throw AppError.badRequest('Choose today or a later date', { field: 'deliveryDate' });
  if (deliveryDate > r.neededBy) throw AppError.badRequest(`The buyer needs it by ${r.neededBy}`, { field: 'deliveryDate' });
  const quote = { supplierId, prices, isGstInclusive, deliveryCharge, deliveryDate, ...(note ? { note } : {}), at: new Date(), status: 'ACTIVE' as const };
  await buyerTotals(r, quote); // checks the amounts are sane before saving

  const existing = r.quotes.find((q) => q.supplierId.equals(supplierId));
  const res = existing
    ? await QuoteRequest.updateOne({ _id: r._id, status: 'OPEN', 'quotes._id': existing._id }, { $set: { 'quotes.$': { ...quote, _id: existing._id } } })
    : await QuoteRequest.updateOne({ _id: r._id, status: 'OPEN', 'quotes.supplierId': { $ne: supplierId } }, { $push: { quotes: quote } });
  if (res.modifiedCount !== 1) throw AppError.conflict('This request changed at the same time. Please refresh.');

  if (!existing) {
    notifyUser(r.buyerId.toString(), { title: 'New reply to your bulk quote', body: `A verified seller replied to ${r.number}. Compare the replies and choose one.`, data: { screen: 'buyer_quotes', requestId: String(r._id) } });
  }
  return { saved: true, updated: !!existing };
}

export async function withdrawQuote(supplierId: Types.ObjectId, id: string) {
  const res = await QuoteRequest.updateOne(
    { _id: id, status: 'OPEN', quotes: { $elemMatch: { supplierId, status: 'ACTIVE' } } },
    { $set: { 'quotes.$.status': 'WITHDRAWN' } }
  );
  if (res.modifiedCount !== 1) throw AppError.conflict('Nothing to withdraw');
  return { withdrawn: true };
}

export { istToday };
