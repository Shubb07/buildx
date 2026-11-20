import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { createOrder, listOrders, getOrder, quote, cancelOrder } from './order.controller';
import { createOrderSchema, quoteSchema, cancelSchema } from './order.schemas';
import { buyerInvoice } from '../invoices/invoice.controller';
import { getTracking } from '../delivery/tracking';
import { startPayOnline, completePayOnline, completeSchema } from '../payments/online.controller';

const router = Router();

// Buyer-only; every handler also scopes queries to req.auth.userId
router.use(requireAuth, requireRole('BUYER'));

router.post('/quote', validate(quoteSchema), quote);
router.post('/', validate(createOrderSchema), createOrder);
// Pay online and save on delivery (features/payments/online.service.ts): the order is made after paying
router.post('/pay-online', validate(createOrderSchema), startPayOnline);
router.post('/pay-online/complete', validate(completeSchema), completePayOnline);
router.get('/', listOrders);
router.get('/:id', getOrder);
router.get('/:id/invoice', buyerInvoice);
router.get('/:id/tracking', getTracking);
router.post('/:id/cancel', validate(cancelSchema), cancelOrder);

export { router as orderRoutes };
