import { z } from 'zod';
import type { ApiClient } from '@sthiva/web-core';
import { getFirebaseAuth } from './firebase';

// Problems after delivery (API features/problems): damaged, wrong, short or defective items, or a
// change-of-mind return where the product allows it. Each item's window was promised when ordered.

export const PROBLEM_KINDS = [
  { id: 'DAMAGED', label: 'Damaged', hint: 'Cracked, broken, wet or bent' },
  { id: 'SHORT', label: 'Fewer than ordered', hint: 'Count or weight is short' },
  { id: 'WRONG_ITEM', label: 'Wrong item', hint: 'Different brand, size or grade' },
  { id: 'DEFECTIVE', label: 'Not working or faulty', hint: 'Fittings, switches, motors' },
  { id: 'CHANGE_OF_MIND', label: 'Changed my mind', hint: 'Sealed and unused items only' },
] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number]['id'];

const lineWindowSchema = z.object({
  index: z.number(), name: z.string(), unit: z.string(), quantity: z.number(),
  problemUntil: z.string().nullable(), changeOfMindUntil: z.string().nullable(), atDeliveryOnly: z.boolean(),
});
export type LineWindow = z.infer<typeof lineWindowSchema>;

const reportSchema = z.object({
  _id: z.string(), number: z.string(), kind: z.string(),
  status: z.enum(['OPEN', 'SELLER_REPLIED', 'RESOLVED', 'REJECTED', 'WITHDRAWN']),
  lines: z.array(z.object({ name: z.string(), unit: z.string(), quantity: z.number() }).passthrough()),
  description: z.string(), photos: z.array(z.string()), want: z.enum(['REFUND', 'REPLACEMENT']), upiId: z.string().optional(), claimValue: z.number(),
  sellerReply: z.object({ agrees: z.boolean(), note: z.string().optional() }).passthrough().optional(),
  resolution: z.object({
    outcome: z.enum(['REFUND', 'REPLACEMENT', 'REJECTED']), refundAmount: z.number(), returnTripCharge: z.number().optional(),
    note: z.string(), refundDueBy: z.string().optional(),
  }).passthrough().optional(),
  refundPaidAt: z.string().optional(),
  createdAt: z.string(),
});
export type ProblemReport = z.infer<typeof reportSchema>;

const orderProblemsSchema = z.object({
  delivered: z.boolean(),
  deliveredAt: z.string().nullable(),
  lines: z.array(lineWindowSchema),
  hasOpenReport: z.boolean(),
  reports: z.array(reportSchema),
});
export type OrderProblems = z.infer<typeof orderProblemsSchema>;

export async function fetchOrderProblems(client: ApiClient, orderId: string): Promise<OrderProblems> {
  return client.request(`/problems/orders/${orderId}`, { auth: true, envelope: true, schema: orderProblemsSchema });
}

export type NewProblem = {
  kind: ProblemKind;
  lines: { index: number; quantity: number }[];
  description: string;
  photos: string[];
  want: 'REFUND' | 'REPLACEMENT';
  upiId?: string;
};

export async function reportProblem(client: ApiClient, orderId: string, body: NewProblem): Promise<ProblemReport> {
  return client.request(`/problems/orders/${orderId}`, { method: 'POST', auth: true, envelope: true, schema: reportSchema, body });
}

export async function withdrawProblem(client: ApiClient, id: string): Promise<void> {
  await client.request(`/problems/${id}/withdraw`, { method: 'POST', auth: true, envelope: true, schema: z.unknown() });
}

// Multipart upload: the shared ApiClient only speaks JSON, so this calls /upload/image directly
export async function uploadProblemPhoto(baseUrl: string, file: File): Promise<string> {
  const token = await getFirebaseAuth().currentUser?.getIdToken();
  if (!token) throw new Error('Sign in again to add photos');
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`${baseUrl}/upload/image`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success !== true) throw new Error(json?.error?.message ?? 'The photo could not be added. Try a smaller one.');
  return z.object({ url: z.string() }).parse(json.data).url;
}
