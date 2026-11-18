'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { useApiClient, type ApiClient } from '@sthiva/web-core';

// Buyer reviews (API features/reviews). Names are first name and initial only.
const reviewSchema = z
  .object({
    _id: z.string(),
    rating: z.number(),
    comment: z.string().optional(),
    onTime: z.boolean().optional(),
    asListed: z.boolean().optional(),
    createdAt: z.string(),
    name: z.string().optional(),
  })
  .passthrough();
export type Review = z.infer<typeof reviewSchema>;

const summarySchema = z.object({
  average: z.number(),
  count: z.number(),
  onTimePercent: z.number().optional(),
  asListedPercent: z.number().optional(),
});
export type ReviewSummary = z.infer<typeof summarySchema>;
const productReviewsSchema = z.object({ summary: summarySchema, reviews: z.array(reviewSchema) });
export type ProductReviews = z.infer<typeof productReviewsSchema>;

/** Reviews of an item from every seller (buyers don't choose the seller), with a summary */
export async function fetchProductReviews(client: ApiClient, productId: string, signal?: AbortSignal): Promise<ProductReviews> {
  return client.request(`/reviews/products/${productId}`, { query: { limit: 5 }, schema: productReviewsSchema, envelope: true, signal });
}

export type ReviewsState =
  | { status: 'loading' }
  | { status: 'success'; data: ProductReviews }
  | { status: 'error'; error: unknown };

export function useProductReviews(productId: string | undefined): ReviewsState {
  const client = useApiClient();
  const [state, setState] = useState<ReviewsState>({ status: 'loading' });
  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchProductReviews(client, productId, controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', error });
      });
    return () => controller.abort();
  }, [client, productId]);
  return state;
}

export type ReviewInput = { rating: number; comment?: string; onTime?: boolean; asListed?: boolean };

export async function submitOrderReview(client: ApiClient, orderId: string, input: ReviewInput): Promise<void> {
  await client.request(`/reviews/orders/${orderId}`, { method: 'POST', auth: true, envelope: true, schema: z.unknown(), body: input });
}

/** The buyer's own review of an order (null if none yet) */
export function useOrderReview(orderId: string | undefined, enabled: boolean) {
  const client = useApiClient();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'success'; review: Review | null } | { status: 'error' }>({ status: 'loading' });
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!orderId || !enabled) return;
    let live = true;
    client.request(`/reviews/orders/${orderId}`, { auth: true, envelope: true, schema: reviewSchema.nullable() })
      .then((review) => live && setState({ status: 'success', review }))
      .catch(() => live && setState({ status: 'error' }));
    return () => { live = false; };
  }, [client, orderId, enabled, key]);
  const reload = useCallback(() => setKey((k) => k + 1), []);
  return { ...state, reload };
}
