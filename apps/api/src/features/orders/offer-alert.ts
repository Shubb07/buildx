// What a supplier sees the moment an order is offered (phone notification and WhatsApp).
// A shop owner decides in a few minutes, often with a customer at the counter, so the alert carries
// the three things that decide it: what to supply, where it goes, and what they earn after Sthiva's
// commission. Not the buyer's total: that includes Sthiva's share and misleads the decision.

import { supplierEarnings } from './commission';

const UNIT: Record<string, [string, string]> = {
  KG: ['kg', 'kg'], TON: ['tonne', 'tonnes'], PIECE: ['piece', 'pieces'], BAG: ['bag', 'bags'], BUNDLE: ['bundle', 'bundles'],
  CUBIC_METER: ['m³', 'm³'], SQUARE_METER: ['m²', 'm²'], LITER: ['litre', 'litres'], METER: ['metre', 'metres'], BOX: ['box', 'boxes'], SHEET: ['sheet', 'sheets'],
};

const inr = (rupees: number) => `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

type AlertItem = { name: string; unit: string; quantity: number; lineTotal: number; supplierLineTotal?: number; commissionPercent?: number; supplierDeliveryPercent?: number };
type AlertOrder = Parameters<typeof supplierEarnings>[0] & {
  orderNumber: string;
  items: AlertItem[];
  deliveryAddress?: { pincode?: string; district?: string };
};

/** "50 bags UltraTech PPC Cement, 2 tonnes TMT 12 mm and 1 more" (at most `max` lines named) */
export function itemsSummary(items: AlertItem[], max = 2): string {
  const named = items.slice(0, max).map((it) => {
    const [one, many] = UNIT[it.unit] ?? [it.unit.toLowerCase(), it.unit.toLowerCase()];
    const name = it.name.length > 40 ? `${it.name.slice(0, 39).trimEnd()}…` : it.name;
    return `${it.quantity.toLocaleString('en-IN')} ${it.quantity === 1 ? one : many} ${name}`;
  });
  const rest = items.length - named.length;
  return rest > 0 ? `${named.join(', ')} and ${rest} more` : named.join(', ');
}

/** What the supplier earns, as one phrase; both figures when they may still deliver themselves */
export function earningsPhrase(order: AlertOrder, canDeliver: boolean): string {
  const e = supplierEarnings(order);
  if (e.expectedPayout !== null) return inr(e.expectedPayout);
  if (canDeliver && e.payoutIfYouDeliver !== e.payoutIfSthivaDelivers) {
    return `${inr(e.payoutIfSthivaDelivers)} (${inr(e.payoutIfYouDeliver)} if you deliver)`;
  }
  return inr(e.payoutIfSthivaDelivers);
}

export function offerAlert(order: AlertOrder, opts: { canDeliver: boolean; minutes: number | null }) {
  const items = itemsSummary(order.items);
  const earn = earningsPhrase(order, opts.canDeliver);
  const where = [order.deliveryAddress?.pincode, order.deliveryAddress?.district].filter(Boolean).join(' ');
  const minutes = Math.max(opts.minutes ?? 0, 1);
  return {
    push: {
      title: `New order: you earn ${earn}`,
      body: [`${items}.`, where ? `Deliver to ${where}.` : '', opts.minutes ? `Answer within ${minutes} min.` : ''].filter(Boolean).join(' '),
    },
    // sthiva_supplier_new_order: {{1}} order number, {{2}} items, {{3}} what they earn, {{4}} minutes
    whatsapp: [order.orderNumber, items, earn, String(minutes)],
  };
}
