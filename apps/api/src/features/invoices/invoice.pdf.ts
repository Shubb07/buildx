// Renders a stored invoice (Invoice.model.ts) as an A4 PDF. Only what was frozen on the invoice is
// printed, so the same invoice always looks the same. Fields follow the GST invoice rules: supplier
// name, address and GSTIN, consecutive number, date, buyer details (and GSTIN if given), HSN, quantity,
// unit, taxable value, rate and amount of tax, place of supply, reverse charge, signature line.

import path from 'path';
import PDFDocument from 'pdfkit';
import type { IInvoice } from '../../infrastructure/database/models/Invoice.model';

// apps/api/assets/fonts, both from src/ (development) and dist/ (production)
const FONTS = path.resolve(__dirname, '../../../assets/fonts');
const REGULAR = path.join(FONTS, 'Geist_400Regular.ttf');
const BOLD = path.join(FONTS, 'Geist_600SemiBold.ttf');

const INK = '#0B0C0A';
const STONE = '#5E5D57';
const LINE = '#D9D5C9';

const UNIT: Record<string, string> = {
  KG: 'kg', TON: 'tonne', PIECE: 'pc', BAG: 'bag', BUNDLE: 'bundle', CUBIC_METER: 'm³', SQUARE_METER: 'm²',
  LITER: 'litre', METER: 'm', BOX: 'box', SHEET: 'sheet',
};

// The postal directory writes states in capitals
const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(And|Of)\b/g, (w) => w.toLowerCase());
const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d: Date) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ''}`;
  return [h ? `${ONES[h]} Hundred` : '', rest].filter(Boolean).join(' ');
}
/** Indian numbering in words: 1,23,45,678.50 -> One Crore Twenty Three Lakh ... Rupees and Fifty Paise only */
export function amountInWords(amount: number): string {
  const p = Math.round(amount * 100);
  let r = Math.floor(p / 100);
  const paise = p % 100;
  if (r === 0 && paise === 0) return 'Rupees Zero only';
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7); r %= 1e7;
  const lakh = Math.floor(r / 1e5); r %= 1e5;
  const thousand = Math.floor(r / 1000); r %= 1000;
  if (crore) parts.push(`${crore >= 1000 ? amountInWords(crore).replace(/^Rupees |\sonly$/g, '') : under1000(crore)} Crore`);
  if (lakh) parts.push(`${under1000(lakh)} Lakh`);
  if (thousand) parts.push(`${under1000(thousand)} Thousand`);
  if (r) parts.push(under1000(r));
  const rupeesText = parts.length ? `Rupees ${parts.join(' ')}` : 'Rupees Zero';
  return `${rupeesText}${paise ? ` and ${under1000(paise)} Paise` : ''} only`;
}

export function renderInvoicePdf(inv: IInvoice): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Invoice ${inv.number}`, Author: inv.seller.name } });
  doc.registerFont('r', REGULAR);
  doc.registerFont('b', BOLD);
  const W = doc.page.width - 80; // content width
  const X = 40;
  const taxed = inv.kind === 'TAX_INVOICE';

  // Title and number
  doc.font('b').fontSize(18).fillColor(INK).text(taxed ? 'Tax Invoice' : 'Bill of Supply', X, 40);
  doc.font('r').fontSize(9).fillColor(STONE)
    .text(taxed ? 'Original for recipient' : 'Supplier not registered under GST: no tax is charged on this bill', X, 64);
  doc.font('r').fontSize(9).fillColor(STONE).text('Invoice no.', X + W - 200, 40, { width: 200, align: 'right' });
  doc.font('b').fontSize(11).fillColor(INK).text(inv.number, X + W - 200, 52, { width: 200, align: 'right' });
  doc.font('r').fontSize(9).fillColor(STONE).text(`Date ${day(inv.issuedAt)}  ·  Order ${inv.orderNumber}`, X + W - 260, 68, { width: 260, align: 'right' });

  // Seller and buyer blocks
  const top = 96;
  const colW = (W - 20) / 2;
  const block = (x: number, title: string, lines: (string | undefined)[], bold?: string) => {
    doc.font('b').fontSize(8).fillColor(STONE).text(title.toUpperCase(), x, top, { width: colW, characterSpacing: 1 });
    let y = top + 14;
    if (bold) { doc.font('b').fontSize(11).fillColor(INK).text(bold, x, y, { width: colW }); y = doc.y + 2; }
    doc.font('r').fontSize(9).fillColor(INK);
    for (const l of lines.filter(Boolean) as string[]) { doc.text(l, x, y, { width: colW }); y = doc.y + 1; }
    return y;
  };
  const yA = block(X, 'Sold by', [
    inv.seller.address,
    inv.seller.gstin ? `GSTIN ${inv.seller.gstin}` : 'Not registered under GST',
    inv.seller.state ? `State ${inv.seller.state} (${inv.seller.stateCode})` : undefined,
  ], inv.seller.name);
  const yB = block(X + colW + 20, 'Bill to and ship to', [
    inv.buyer.businessName ? inv.buyer.name : undefined,
    inv.buyer.address,
    [inv.buyer.state && titleCase(inv.buyer.state), inv.buyer.pincode].filter(Boolean).join(' ') || undefined,
    inv.buyer.gstin ? `GSTIN ${inv.buyer.gstin}` : undefined,
    inv.buyer.phone ? `Phone ${inv.buyer.phone}` : undefined,
  ], inv.buyer.businessName ?? inv.buyer.name);

  let y = Math.max(yA, yB) + 8;
  doc.font('r').fontSize(9).fillColor(STONE)
    .text(`Place of supply: ${inv.placeOfSupply?.state ? `${inv.placeOfSupply.state} (${inv.placeOfSupply.stateCode})` : 'Not known'}    Reverse charge: No`, X, y);
  y = doc.y + 10;

  // Items table
  const cols = taxed
    ? [
        { h: 'Item', w: 116, a: 'left' }, { h: 'HSN', w: 44, a: 'left' }, { h: 'Qty', w: 48, a: 'right' },
        { h: 'Rate', w: 50, a: 'right' }, { h: 'Taxable', w: 60, a: 'right' }, { h: 'GST', w: 28, a: 'right' },
        ...(inv.interState
          ? [{ h: 'IGST', w: 110, a: 'right' }]
          : [{ h: 'CGST', w: 55, a: 'right' }, { h: 'SGST', w: 55, a: 'right' }]),
        { h: 'Amount', w: W - 456, a: 'right' },
      ]
    : [
        { h: 'Item', w: 230, a: 'left' }, { h: 'HSN', w: 50, a: 'left' }, { h: 'Qty', w: 70, a: 'right' },
        { h: 'Rate', w: 70, a: 'right' }, { h: 'Amount', w: W - 420, a: 'right' },
      ];
  const row = (cells: string[], font: 'r' | 'b', color = INK) => {
    let x = X;
    const startY = y;
    let maxY = y;
    doc.font(font).fontSize(8.5).fillColor(color);
    cells.forEach((c, i) => {
      doc.text(c, x + 3, startY, { width: cols[i].w - 6, align: cols[i].a as 'left' | 'right' });
      maxY = Math.max(maxY, doc.y);
      x += cols[i].w;
    });
    y = maxY + 5;
    doc.moveTo(X, y - 2).lineTo(X + W, y - 2).strokeColor(LINE).lineWidth(0.6).stroke();
  };
  doc.rect(X, y - 4, W, 18).fill('#F1EFE8');
  row(cols.map((c) => c.h), 'b', STONE);
  for (const l of inv.lines) {
    if (y > doc.page.height - 200) { doc.addPage(); y = 40; }
    const qty = `${l.quantity} ${UNIT[l.unit] ?? l.unit.toLowerCase()}`;
    row(taxed
      ? [l.name, l.hsn ?? '', qty, money(l.rate), money(l.taxable), `${l.gstRate}%`,
          ...(inv.interState ? [money(l.igst)] : [money(l.cgst), money(l.sgst)]), money(l.total)]
      : [l.name, l.hsn ?? '', qty, money(l.rate), money(l.total)], 'r');
  }

  // Totals
  y += 6;
  const total = (label: string, value: string, strong = false) => {
    doc.font(strong ? 'b' : 'r').fontSize(strong ? 11 : 9).fillColor(strong ? INK : STONE)
      .text(label, X + W - 260, y, { width: 150, align: 'right' });
    doc.font(strong ? 'b' : 'r').fillColor(INK).text(value, X + W - 105, y, { width: 105, align: 'right' });
    y = doc.y + 4;
  };
  if (taxed) {
    total('Taxable value', `₹${money(inv.totals.taxable)}`);
    if (inv.interState) total('IGST', `₹${money(inv.totals.igst)}`);
    else { total('CGST', `₹${money(inv.totals.cgst)}`); total('SGST', `₹${money(inv.totals.sgst)}`); }
  }
  total('Invoice total', `₹${money(inv.totals.total)}`, true);
  doc.font('r').fontSize(9).fillColor(INK).text(amountInWords(inv.totals.total), X, y + 4, { width: W });
  y = doc.y + 14;

  // Notes and signature
  const notes = [
    inv.deliveryCharge > 0 ? `Delivery charge for this order (₹${money(inv.deliveryCharge)}) is not part of this invoice.` : undefined,
    'Sold through Sthiva (sthiva.com), an online marketplace. The supplier named above is the seller of these goods.',
    'This is a computer-generated invoice.',
  ].filter(Boolean) as string[];
  doc.font('r').fontSize(8).fillColor(STONE);
  for (const n of notes) { doc.text(n, X, y, { width: W - 200 }); y = doc.y + 2; }
  doc.font('b').fontSize(9).fillColor(INK).text(`For ${inv.seller.name}`, X + W - 200, y + 10, { width: 200, align: 'right' });
  doc.font('r').fontSize(8).fillColor(STONE).text('Authorised signatory', X + W - 200, y + 40, { width: 200, align: 'right' });

  doc.end();
  return doc;
}
