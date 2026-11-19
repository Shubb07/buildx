import { Router } from 'express';
import { razorpayWebhook } from '../wallet/wallet.controller';

// Razorpay calls this after a payment (app.ts gives it the raw body so the signature can be checked).
// Seller top-ups today; buyer online payments use the same webhook.
const router = Router();

router.post('/webhook', razorpayWebhook);

export { router as paymentRoutes };
