import { env } from '../../config/env';
import { logger } from '../logger/logger';

// WhatsApp order alerts through Meta's WhatsApp Cloud API (owner decision 2026-11-18: Meta directly,
// no middleman fee). Only pre-approved TEMPLATE messages are sent, because these alerts start the
// conversation. Each delivered message is charged by Meta (utility category). Setup and the exact
// template texts to submit to Meta are in docs/WHATSAPP.md.
//
// Switched off unless WHATSAPP_ENABLED=true and the token and phone number ID are set. A failure is
// logged and never stops the order flow; app push notifications keep working either way.
// Phone numbers and message text are never logged.

export const TEMPLATES = {
  /** To a supplier: {{1}} order number, {{2}} order total, {{3}} minutes to answer */
  SUPPLIER_NEW_ORDER: 'sthiva_supplier_new_order',
  /** To a driver who turned alerts on: {{1}} order number, {{2}} load and distance, {{3}} minutes */
  DRIVER_NEW_JOB: 'sthiva_driver_new_job',
} as const;

export type TemplateName = (typeof TEMPLATES)[keyof typeof TEMPLATES];

export function whatsappEnabled() {
  return env.WHATSAPP_ENABLED && !!env.WHATSAPP_TOKEN && !!env.WHATSAPP_PHONE_NUMBER_ID;
}

/** Indian mobile in any common form -> 91XXXXXXXXXX (what the API wants), or null */
export function toWhatsAppNumber(input?: string | null): string | null {
  const digits = (input ?? '').replace(/\D/g, '');
  const m = /^(?:91)?([6-9]\d{9})$/.exec(digits);
  return m ? `91${m[1]}` : null;
}

export type SendResult = { sent: boolean; reason?: 'OFF' | 'BAD_NUMBER' | 'FAILED' };

export async function sendTemplate(params: { to?: string | null; template: TemplateName; values: string[] }): Promise<SendResult> {
  if (!whatsappEnabled()) return { sent: false, reason: 'OFF' };
  const to = toWhatsAppNumber(params.to);
  if (!to) return { sent: false, reason: 'BAD_NUMBER' };

  const url = `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: params.template,
      language: { code: env.WHATSAPP_TEMPLATE_LANG },
      components: [{
        type: 'body',
        // Template parameters cannot contain new lines, tabs or more than 4 spaces in a row
        parameters: params.values.map((v) => ({ type: 'text', text: String(v).replace(/\s+/g, ' ').trim().slice(0, 200) })),
      }],
    },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: { code?: number; message?: string } } | null;
      logger.warn('[whatsapp] not sent', { template: params.template, httpStatus: res.status, code: err?.error?.code, message: err?.error?.message?.slice(0, 160) });
      return { sent: false, reason: 'FAILED' };
    }
    return { sent: true };
  } catch (err) {
    logger.warn('[whatsapp] request failed', { template: params.template, error: (err as Error)?.name });
    return { sent: false, reason: 'FAILED' };
  }
}
