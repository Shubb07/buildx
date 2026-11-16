import { Request, Response, NextFunction } from 'express';
import { isValidObjectId } from 'mongoose';
import { Order } from '../../infrastructure/database/models/Order.model';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import { issueInvoice } from './invoice.service';
import { renderInvoicePdf } from './invoice.pdf';

// GET .../orders/:id/invoice: the GST invoice as a PDF, for the buyer, the supplier or ops.
// Invoices are issued when the goods leave the supplier; an older dispatched order gets its invoice
// issued on first download.

async function send(res: Response, orderFilter: Record<string, unknown>) {
  const order = await Order.findOne(orderFilter).select('_id status').lean();
  if (!order) throw AppError.notFound('Order');
  const invoice = await issueInvoice(order._id);
  if (!invoice) throw AppError.notFound('Invoice. It is issued when the supplier sends the goods');
  const name = `${invoice.number.replace(/\//g, '-')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  const pdf = renderInvoicePdf(invoice);
  pdf.on('error', (err) => logger.error('[invoices] pdf failed', { orderId: String(order._id), error: err.message }));
  pdf.pipe(res);
}

const checkId = (id: string) => { if (!isValidObjectId(id)) throw AppError.badRequest('Invalid order ID'); };

export async function buyerInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    checkId(String(req.params.id));
    await send(res, { _id: req.params.id, buyerId: req.auth!.userId });
  } catch (err) { next(err); }
}

export async function supplierInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    checkId(String(req.params.id));
    const profile = await SupplierProfile.findOne({ userId: req.auth!.userId }).select('_id').lean();
    if (!profile) throw AppError.notFound('Supplier profile');
    await send(res, { _id: req.params.id, supplierId: profile._id });
  } catch (err) { next(err); }
}

export async function opsInvoice(req: Request, res: Response, next: NextFunction) {
  try {
    checkId(String(req.params.id));
    await send(res, { _id: req.params.id });
  } catch (err) { next(err); }
}
