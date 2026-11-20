import { Request, Response, NextFunction } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { ok } from '@sthiva/shared';
import { AppError } from '../../shared/errors/AppError';
import { logger } from '../../shared/logger/logger';
import { webhookSignatureValid } from '../../shared/services/razorpay';
import { WalletTopUp } from '../../infrastructure/database/models/WalletTopUp.model';
import { SupplierProfile } from '../../infrastructure/database/models/SupplierProfile.model';
import { myWallet, startTopUp, completeTopUp, walletSummary, adjustBalance, MAX_TOPUP_RUPEES } from './wallet.service';
import { paiseToRupees } from '../orders/pricing';
import { isBuyerPayment, completeOnlinePayment } from '../payments/online.service';

export const topUpSchema = z.object({
  amount: z.number().finite().positive().max(MAX_TOPUP_RUPEES).multipleOf(1, 'Top up in whole rupees'),
});

export const topUpVerifySchema = z.object({
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySignature: z.string().min(1).max(256),
});

export const adjustSchema = z.object({
  // + adds to the balance, - takes from it
  amount: z.number().finite().min(-MAX_TOPUP_RUPEES).max(MAX_TOPUP_RUPEES).multipleOf(0.01),
  note: z.string().trim().min(5, 'Say why, e.g. "Paid Rs 2,000 by bank transfer on 21 Nov"').max(300),
});

const pageOf = (req: Request) => Math.max(1, Math.min(1000, Number(req.query.page) || 1));

// GET /suppliers/me/wallet?page=
export async function getMyWallet(req: Request, res: Response, next: NextFunction) {
  try { res.json(ok(await myWallet(req.auth!.userId, pageOf(req)))); } catch (err) { next(err); }
}

// POST /suppliers/me/wallet/topups { amount } → what Razorpay Checkout needs
export async function createTopUp(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(ok(await startTopUp(req.auth!.userId, req.body.amount))); } catch (err) { next(err); }
}

// POST /suppliers/me/wallet/topups/verify { razorpayOrderId, razorpayPaymentId, razorpaySignature }
export async function verifyTopUp(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await completeTopUp({
      razorpayOrderId: req.body.razorpayOrderId, razorpayPaymentId: req.body.razorpayPaymentId,
      signature: req.body.razorpaySignature, userId: req.auth!.userId,
    });
    res.json(ok({ ...r, wallet: await myWallet(req.auth!.userId) }));
  } catch (err) { next(err); }
}

// GET /ops/wallets — sellers and their balances, highest first
export async function opsListWallets(_req: Request, res: Response, next: NextFunction) {
  try {
    const rows = await SupplierProfile.find({}).select('businessName walletBalancePaise verificationStatus').sort({ walletBalancePaise: -1, businessName: 1 }).limit(500).lean();
    res.json(ok(rows.map((r) => ({ supplierId: String(r._id), businessName: r.businessName, balance: paiseToRupees(r.walletBalancePaise ?? 0), verificationStatus: r.verificationStatus }))));
  } catch (err) { next(err); }
}

// GET /ops/wallets/:supplierId?page=
export async function opsGetWallet(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isValidObjectId(req.params.supplierId)) throw AppError.badRequest('Invalid supplier ID');
    res.json(ok(await walletSummary(String(req.params.supplierId), pageOf(req))));
  } catch (err) { next(err); }
}

// POST /ops/wallets/:supplierId/adjust { amount, note } (admin)
export async function opsAdjustWallet(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isValidObjectId(req.params.supplierId)) throw AppError.badRequest('Invalid supplier ID');
    const wallet = await adjustBalance({ supplierId: String(req.params.supplierId), amountRupees: req.body.amount, note: req.body.note, byUserId: req.auth!.userId });
    logger.info('[wallet] ops adjustment', { supplierId: req.params.supplierId, amount: req.body.amount, by: req.auth!.userId });
    res.json(ok(wallet));
  } catch (err) { next(err); }
}

type WebhookBody = { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };

// POST /payments/webhook (raw body, see app.ts). Razorpay retries until it gets a 2xx, so anything
// we can't use is acknowledged; only a bad signature is refused.
export async function razorpayWebhook(req: Request, res: Response) {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || !webhookSignatureValid(raw, req.header('x-razorpay-signature'))) {
    res.status(400).json({ success: false, error: 'Invalid signature' });
    return;
  }
  let body: WebhookBody;
  try { body = JSON.parse(raw.toString('utf8')) as WebhookBody; } catch { res.json({ success: true }); return; }
  const payment = body.payload?.payment?.entity;
  if ((body.event === 'payment.captured' || body.event === 'order.paid') && payment?.id && payment.order_id) {
    try {
      if (await WalletTopUp.exists({ razorpayOrderId: payment.order_id })) {
        await completeTopUp({ razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id });
      } else if (await isBuyerPayment(payment.order_id)) {
        // The buyer paid but their browser never came back: make the order (or refund) now
        await completeOnlinePayment({ razorpayOrderId: payment.order_id, razorpayPaymentId: payment.id }).catch((err: AppError) => {
          // A refunded checkout is finished business; anything else Razorpay should retry
          if (!(err instanceof AppError && err.code === 'CONFLICT')) throw err;
        });
      }
    } catch (err) {
      // 500 makes Razorpay try again later
      logger.error('[payments] webhook handling failed', { event: body.event, orderId: payment.order_id, error: (err as Error)?.message });
      res.status(500).json({ success: false });
      return;
    }
  }
  res.json({ success: true });
}
