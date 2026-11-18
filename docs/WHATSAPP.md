# WhatsApp order alerts (Meta WhatsApp Cloud API)

Owner decision 2026-11-18: send order alerts through **Meta directly** (no middleman monthly fee).
The code is built and **switched off**. Nothing is sent or charged until the steps below are done
and `WHATSAPP_ENABLED=true` is set.

## What is sent

| Alert | To | When | Template name |
| --- | --- | --- | --- |
| New order to accept | Supplier, on the WhatsApp number they gave "for order updates" in setup | Each time an order is offered to them | `sthiva_supplier_new_order` |
| New delivery job | Driver, only if they turned on "WhatsApp job alerts" in the Driver app profile | Each time a job is offered to them | `sthiva_driver_new_job` |

App push notifications keep working as before. If WhatsApp fails, the order flow is not affected.
Phone numbers and message text are never written to logs.

Code: `apps/api/src/shared/services/whatsapp.service.ts` (sender), hooks in
`features/orders/allocation.service.ts` (supplier) and `features/delivery/driver-offers.ts` (driver).

## Cost (checked November 2026; confirm in WhatsApp Manager before turning on)

- Order alerts are **utility** template messages, charged per delivered message. Several sources give
  about Rs 0.115 per message for India, plus 18% GST (Meta publishes the exact INR rate card as a
  download on its pricing page).
- Since 1 October 2026 utility templates are charged even inside the 24-hour customer service window.
- 1,000 free **service** messages a month per number (replies to customers), not alerts.
- Rough budget: 3 alerts per order x 100 orders a day = about Rs 1,200 a month.

## Setup (owner, with Claude helping)

1. **Meta Business account** for Sthiva at business.facebook.com, and complete **business verification**
   (company or proprietorship papers, the sthiva.com domain).
2. At developers.facebook.com create an app of type **Business** and add the **WhatsApp** product. This
   creates a WhatsApp Business Account with a free test number for trying things out.
3. Add Sthiva's real phone number in **WhatsApp Manager**. The number must not be in use on the WhatsApp
   or WhatsApp Business app (delete it there first). Set the display name **Sthiva** (Meta reviews it).
4. Add a **payment method** in WhatsApp Manager (Billing). Set a spending limit.
5. Create the two message templates below: category **Utility**, language **English**.
6. Create a **permanent token**: Business Settings, System users, add a system user (Admin), assign the
   app and the WhatsApp account, generate a token with `whatsapp_business_messaging` and
   `whatsapp_business_management`.
7. Put these in the API host's environment (Render now, `deploy/vultr/.env` later). **Never in git.**
   - `WHATSAPP_TOKEN` (from step 6)
   - `WHATSAPP_PHONE_NUMBER_ID` (WhatsApp, API Setup page; not the phone number itself)
   - `WHATSAPP_ENABLED=true`
   - optional: `WHATSAPP_GRAPH_VERSION` (default `v23.0`), `WHATSAPP_TEMPLATE_LANG` (default `en`)
8. Place a test order with a supplier whose WhatsApp number is yours and check the message arrives.

## Templates to submit (exact text)

Meta rejects templates that start or end with a variable, or that read like advertising. These are
plain transactional messages.

### `sthiva_supplier_new_order` (Utility, English)

Body:

> New Sthiva order {{1}} for {{2}}. Please accept or reject it in the Sthiva Partner app or on
> seller.sthiva.com within {{3}} minutes, or it will go to another supplier.

Sample values for review: `{{1}}` = `STV-482913`, `{{2}}` = `Rs 3,800`, `{{3}}` = `15`

### `sthiva_driver_new_job` (Utility, English)

Body:

> New Sthiva delivery job {{1}}: {{2}}. Open the Sthiva Driver app to accept or decline within {{3}} minutes.

Sample values for review: `{{1}}` = `STV-482913`, `{{2}}` = `500 kg, about 6.2 km`, `{{3}}` = `10`

## Later

- Kannada versions of both templates (`WHATSAPP_TEMPLATE_LANG=kn` per user once languages are stored).
- Buyer order updates on WhatsApp (needs a buyer opt-in at checkout first).
- Replies from suppliers on WhatsApp ("accept") would need a webhook; not built.
