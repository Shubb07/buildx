import { z } from 'zod';
import type { ApiClient } from '@sthiva/web-core';

// Quick add: many catalogue items at once (API features/suppliers/quick-add.ts)
const itemSchema = z.object({
  _id: z.string(),
  name: z.string(),
  brand: z.string().optional().nullable(),
  unit: z.string(),
  gstRate: z.number().optional().nullable(),
  weightKgPerUnit: z.number().optional().nullable(),
  image: z.string().optional().nullable(),
  mine: z.object({
    productId: z.string(), price: z.number(), stock: z.number(), status: z.string(),
    isGstInclusive: z.boolean().optional(), onOrder: z.boolean().optional(),
  }).nullable(),
});
export type QuickItem = z.infer<typeof itemSchema>;
const listSchema = z.object({
  categories: z.array(z.object({ _id: z.string(), name: z.string(), slug: z.string(), items: z.number(), yours: z.boolean() })),
  category: z.string().nullable(),
  items: z.array(itemSchema),
});
export type QuickList = z.infer<typeof listSchema>;

export async function fetchQuickAdd(client: ApiClient, category?: string): Promise<QuickList> {
  return client.request('/suppliers/me/quick-add', { auth: true, envelope: true, schema: listSchema, query: { category } });
}

export async function saveQuickAdd(
  client: ApiClient,
  body: { isGstInclusive: boolean; items: { catalogItemId: string; price: number; stock: number }[] }
): Promise<{ created: number; updated: number }> {
  return client.request('/suppliers/me/quick-add', {
    method: 'POST',
    auth: true,
    envelope: true,
    schema: z.object({ created: z.number(), updated: z.number() }),
    body,
  });
}
