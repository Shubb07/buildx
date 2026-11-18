import { describe, it, expect } from 'vitest';
import { itemsSummary, offerAlert } from '../src/features/orders/offer-alert';

const cement = { name: 'UltraTech PPC Cement', unit: 'BAG', quantity: 50, lineTotal: 20000, supplierLineTotal: 19000, commissionPercent: 5, supplierDeliveryPercent: 3 };
const steel = { name: 'TMT Bar 12 mm', unit: 'TON', quantity: 2, lineTotal: 120000, supplierLineTotal: 114000, commissionPercent: 5, supplierDeliveryPercent: 3 };
const sand = { name: 'M-Sand', unit: 'CUBIC_METER', quantity: 1, lineTotal: 2000 };
const order = (extra = {}) => ({
  orderNumber: 'STV-1', total: 142000, items: [cement, steel, sand], deliveryCharge: 0,
  deliveryAddress: { pincode: '572101', district: 'Tumakuru' }, ...extra,
});

describe('new order alert to the supplier', () => {
  it('names the items with units, at most two, then counts the rest', () => {
    expect(itemsSummary([cement])).toBe('50 bags UltraTech PPC Cement');
    expect(itemsSummary([cement, steel, sand])).toBe('50 bags UltraTech PPC Cement, 2 tonnes TMT Bar 12 mm and 1 more');
    expect(itemsSummary([{ ...sand }])).toBe('1 m³ M-Sand');
  });

  it('says what the supplier earns, not the buyer total, plus where and how long', () => {
    const a = offerAlert(order(), { canDeliver: false, minutes: 15 });
    expect(a.push.title).toMatch(/^New order: you earn ₹/);
    expect(a.push.title).not.toContain('1,42,000');
    expect(a.push.body).toBe('50 bags UltraTech PPC Cement, 2 tonnes TMT Bar 12 mm and 1 more. Deliver to 572101 Tumakuru. Answer within 15 min.');
    expect(a.whatsapp).toEqual(['STV-1', '50 bags UltraTech PPC Cement, 2 tonnes TMT Bar 12 mm and 1 more', expect.stringMatching(/^₹/), '15']);
  });

  it('shows both figures to a supplier who may deliver themselves', () => {
    const a = offerAlert(order(), { canDeliver: true, minutes: 10 });
    expect(a.whatsapp[2]).toMatch(/^₹[\d,]+ \(₹[\d,]+ if you deliver\)$/);
  });
});
