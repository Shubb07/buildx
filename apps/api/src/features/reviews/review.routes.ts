import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import { submitReview, getSupplierReviews, getOrderReview, getProductReviews, reviewSchema } from './review.controller';

export const reviewRoutes = Router();

reviewRoutes.post('/orders/:orderId', requireAuth, requireRole('BUYER'), validate(reviewSchema), submitReview);
reviewRoutes.get('/orders/:orderId', requireAuth, requireRole('BUYER'), getOrderReview);
reviewRoutes.get('/suppliers/:supplierId', getSupplierReviews);
// Reviews of an item from every seller, with a summary (buyers don't choose the seller)
reviewRoutes.get('/products/:productId', getProductReviews);
