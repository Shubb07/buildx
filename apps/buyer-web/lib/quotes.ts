import { z } from 'zod';
import type { ApiClient } from '@sthiva/web-core';

// Bulk quotes (API features/quotes): ask nearby verified sellers to price a big list, compare the
// replies and accept one. Accepting makes a confirmed order.

const replySchema = z.object({
  quoteId: z.string(),
  status: z.string(),
  seller: z.object({ name: z.string(), rating: z.number(), reviews: z.number(), distanceKm: z.number().nullable() }),
  lines: z.array(z.object({ name: z.string(), quantity: z.number(), unit: z.string(), unitPrice: z.number(), lineTotal: z.number() })),
  goods: z.number(),
  gstAmount: z.number(),
  deliveryCharge: z.number(),
  total: z.number(),
  deliveryDate: z.string(),
  note: z.string().optional(),
});
export type QuoteReply = z.infer<typeof replySchema>;

const requestSchema = z.object({
  _id: z.string(),
  number: z.string(),
  kind: z.enum(['LIST', 'CUSTOM']).optional(),
  custom: z.object({ workName: z.string(), spec: z.string(), siteVisit: z.boolean() }).passthrough().optional(),
  status: z.enum(['OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED']),
  repliesOpen: z.boolean(),
  lines: z.array(z.object({ name: z.string(), unit: z.string(), quantity: z.number() })),
  neededBy: z.string(),
  notes: z.string().optional(),
  expiresAt: z.string(),
  invited: z.number(),
  orderId: z.string().optional(),
  replies: z.array(replySchema),
}).passthrough();
export type QuoteRequestView = z.infer<typeof requestSchema>;

const summarySchema = z.object({
  _id: z.string(), number: z.string(), kind: z.string().optional(), workName: z.string().optional(), status: z.string(), neededBy: z.string(), items: z.number(), replies: z.number(), createdAt: z.string(), orderId: z.string().optional(),
});
export type QuoteSummary = z.infer<typeof summarySchema>;

export type NewQuoteRequest = {
  items: { productId: string; quantity: number }[];
  deliveryAddress: { label: string; fullAddress: string; pincode: string; contactPhone: string };
  neededBy: string;
  notes?: string;
};

export async function createQuoteRequest(client: ApiClient, body: NewQuoteRequest): Promise<{ _id: string }> {
  return client.request('/quotes', { method: 'POST', auth: true, envelope: true, schema: z.object({ _id: z.string() }).passthrough(), body });
}
export type NewCustomRequest = {
  work: { type: string; name: string; categorySlug: string };
  pieces: { label: string; widthMm: number; heightMm: number; quantity: number }[];
  spec: string;
  siteVisit: boolean;
  deliveryAddress: { label: string; fullAddress: string; pincode: string; contactPhone: string };
  neededBy: string;
  notes?: string;
};

export async function createCustomQuoteRequest(client: ApiClient, body: NewCustomRequest): Promise<{ _id: string }> {
  return client.request('/quotes/custom', { method: 'POST', auth: true, envelope: true, schema: z.object({ _id: z.string() }).passthrough(), body });
}

export async function fetchQuoteRequests(client: ApiClient): Promise<QuoteSummary[]> {
  return client.request('/quotes', { auth: true, envelope: true, schema: z.array(summarySchema) });
}
export async function fetchQuoteRequest(client: ApiClient, id: string): Promise<QuoteRequestView> {
  return client.request(`/quotes/${id}`, { auth: true, envelope: true, schema: requestSchema });
}
export async function acceptQuoteReply(client: ApiClient, id: string, quoteId: string, expectedTotal: number): Promise<{ orderId: string; orderNumber: string }> {
  return client.request(`/quotes/${id}/accept`, {
    method: 'POST', auth: true, envelope: true, body: { quoteId, expectedTotal },
    schema: z.object({ orderId: z.string(), orderNumber: z.string() }).passthrough(),
  });
}
export async function cancelQuoteRequest(client: ApiClient, id: string): Promise<void> {
  await client.request(`/quotes/${id}/cancel`, { method: 'POST', auth: true, envelope: true, schema: z.unknown() });
}
