'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { useApiClient, type ApiClient } from '@sthiva/web-core';

// The seller's onboarding checklist, worked out by the API (features/suppliers/go-live.ts)
const stepSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(['TODO', 'WAITING', 'DONE', 'PROBLEM']),
  detail: z.string(),
  href: z.string(),
});
export type GoLiveStep = z.infer<typeof stepSchema>;
const goLiveSchema = z.object({
  steps: z.array(stepSchema),
  done: z.number(),
  total: z.number(),
  review: z.object({ status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']), detail: z.string() }),
  termsVersion: z.string(),
});
export type GoLive = z.infer<typeof goLiveSchema>;

export async function fetchGoLive(client: ApiClient): Promise<GoLive> {
  return client.request('/suppliers/me/go-live', { auth: true, envelope: true, schema: goLiveSchema });
}

export async function acceptAgreement(client: ApiClient, version: string): Promise<{ version: string; at: string }> {
  return client.request('/suppliers/me/agreement', {
    method: 'POST',
    auth: true,
    envelope: true,
    schema: z.object({ version: z.string(), at: z.string() }),
    body: { version },
  });
}

export function useGoLive() {
  const client = useApiClient();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'success'; data: GoLive }>({ status: 'loading' });
  const [key, setKey] = useState(0);
  useEffect(() => {
    let live = true;
    fetchGoLive(client).then((data) => live && setState({ status: 'success', data })).catch(() => live && setState({ status: 'error' }));
    return () => { live = false; };
  }, [client, key]);
  const reload = useCallback(() => setKey((k) => k + 1), []);
  return { ...state, reload };
}
