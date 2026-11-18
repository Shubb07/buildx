import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { seedUser, seedSupplier, seedDriver, seedProduct, newKey, SITE, startDb, stopDb, clearDb, makeApp } from './helpers';
import { env } from '../src/config/env';
import { sendTemplate, toWhatsAppNumber, TEMPLATES } from '../src/shared/services/whatsapp.service';
import { DeliveryPartner } from '../src/infrastructure/database/models/DeliveryPartner.model';

const app = makeApp();
const api = (path: string) => `/api/v1${path}`;
const saved = { ...env };
let fetchMock: ReturnType<typeof vi.fn>;

const turnOn = () => Object.assign(env, { WHATSAPP_ENABLED: true, WHATSAPP_TOKEN: 'test-token', WHATSAPP_PHONE_NUMBER_ID: '1234567890', WHATSAPP_GRAPH_VERSION: 'v23.0', WHATSAPP_TEMPLATE_LANG: 'en' });

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.x' }] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(env, saved);
});

describe('WhatsApp sender', () => {
  it('normalises Indian mobile numbers', () => {
    expect(toWhatsAppNumber('+91 98765 43210')).toBe('919876543210');
    expect(toWhatsAppNumber('9876543210')).toBe('919876543210');
    expect(toWhatsAppNumber('12345')).toBeNull();
    expect(toWhatsAppNumber(undefined)).toBeNull();
  });

  it('sends nothing while switched off', async () => {
    expect(await sendTemplate({ to: '9876543210', template: TEMPLATES.SUPPLIER_NEW_ORDER, values: ['A', 'B', 'C'] })).toEqual({ sent: false, reason: 'OFF' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends an approved template to Meta when switched on', async () => {
    turnOn();
    const r = await sendTemplate({ to: '9876543210', template: TEMPLATES.SUPPLIER_NEW_ORDER, values: ['ORD-1', 'Rs 3,800', '\n15 '] });
    expect(r).toEqual({ sent: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'template',
      template: {
        name: 'sthiva_supplier_new_order',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'ORD-1' }, { type: 'text', text: 'Rs 3,800' }, { type: 'text', text: '15' }] }],
      },
    });
  });

  it('reports failures without throwing', async () => {
    turnOn();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 132001, message: 'Template does not exist' } }), { status: 400 }));
    expect(await sendTemplate({ to: '9876543210', template: TEMPLATES.DRIVER_NEW_JOB, values: ['x', 'y', 'z'] })).toEqual({ sent: false, reason: 'FAILED' });
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(await sendTemplate({ to: '9876543210', template: TEMPLATES.DRIVER_NEW_JOB, values: ['x', 'y', 'z'] })).toEqual({ sent: false, reason: 'FAILED' });
    expect((await sendTemplate({ to: 'nope', template: TEMPLATES.DRIVER_NEW_JOB, values: [] })).reason).toBe('BAD_NUMBER');
  });
});

describe('WhatsApp alerts in the order flow', () => {
  it('messages the supplier their new order on WhatsApp, and the order still goes through if WhatsApp fails', async () => {
    turnOn();
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    const buyer = await seedUser('wa-b');
    const supplier = await seedSupplier('wa-s');
    const product = await seedProduct(supplier.profile._id);
    const res = await request(app).post(api('/orders')).set(buyer.headers).set('Idempotency-Key', newKey())
      .send({ items: [{ productId: product._id.toString(), quantity: 2 }], deliveryAddress: SITE });
    expect(res.status).toBe(201);
    // The alert is sent in the background
    for (let i = 0; i < 40 && !fetchMock.mock.calls.length; i++) await new Promise((r) => setTimeout(r, 25));
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(sent).toMatchObject({ to: '919876543210', template: { name: 'sthiva_supplier_new_order' } });
    expect(sent.template.components[0].parameters[0].text).toBe(res.body.data.orderNumber);
  });

  it('lets a driver switch WhatsApp job alerts on and off', async () => {
    const driver = await seedDriver('wa-d');
    expect((await request(app).patch(api('/delivery/me')).set(driver.headers).send({ whatsappAlerts: 'yes' })).status).toBe(400);
    expect((await request(app).patch(api('/delivery/me')).set(driver.headers).send({ whatsappAlerts: true })).body.data.whatsappAlerts).toBe(true);
    expect((await DeliveryPartner.findOne({ userId: driver.user._id }).lean())!.whatsappAlerts).toBe(true);
    expect((await request(app).patch(api('/delivery/me')).set(driver.headers).send({ whatsappAlerts: false })).body.data.whatsappAlerts).toBe(false);
  });
});
