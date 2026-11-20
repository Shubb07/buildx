import type { Metadata } from 'next';
import { LegalPage, Section } from '@/components/layout/LegalPage';

export const metadata: Metadata = {
  title: 'Cancellations and refunds',
  description: 'How to cancel a Sthiva order, and what happens if materials arrive damaged or wrong.',
  alternates: { canonical: '/refunds' },
};

export default function RefundsPage() {
  return (
    <LegalPage
      path="/refunds"
      title="Cancellations and refunds"
      intro="You can pay cash on delivery or, where it is offered, pay online in advance. Here is how cancellations, refunds and delivery problems are handled."
    >
      <Section title="Cancelling an order">
        <ul>
          <li>
            You can cancel from the order page while the order is in a state that allows it, typically before the supplier
            dispatches it. The cancel option disappears once cancellation is no longer possible.
          </li>
          <li>Cancelling a cash on delivery order costs nothing, since you have not paid.</li>
          <li>
            If you paid online, cancelling gives you the full amount you paid back to where it came from (your UPI, card or bank
            account). The refund starts straight away and usually reaches you in 5 to 7 working days, depending on your bank.
          </li>
          <li>
            If you paid online but your order could not be placed (for example the last stock sold out while you were paying), the
            whole amount is refunded automatically in the same way.
          </li>
          <li>A supplier may cancel an order if materials become unavailable. The updated status appears on your order.</li>
        </ul>
      </Section>

      <Section title="At delivery">
        <ul>
          <li>Check quantity, brand, grade and condition before you pay, or before you accept the delivery if you paid online.</li>
          <li>
            If something is damaged, short or different from what you ordered, you may refuse that item, or the whole delivery, and
            pay only for what you accept. If you paid online, report it on your order page and the refused part is refunded.
          </li>
        </ul>
      </Section>

      <Section title="Each product has its own returns">
        <p>
          Returns depend on the product and the seller, and every product page shows them before you order. The returns shown when
          you ordered are the ones that apply to your order.
        </p>
        <ul>
          <li>
            <strong>Damaged, wrong or short items:</strong> note them at delivery and tell the driver. Then use <strong>Report a
            problem</strong> on your order page, with photos, within 2 hours of delivery. Some products give you longer: 24 hours,
            48 hours or 7 days, as shown on the product page.
          </li>
          <li>
            <strong>Change of mind:</strong> most building materials cannot be returned once delivered. Where the product page allows it,
            sealed and unused items can be returned within the time shown, and you pay the return trip.
          </li>
          <li>When the problem is the seller&apos;s fault, the seller pays for the replacement or refund and any return trip.</li>
        </ul>
      </Section>

      <Section title="Refunds">
        <p>
          When a refund for a problem is approved, Sthiva pays it to your UPI ID or bank account within 3 working days, or back to
          your online payment if you paid online. Refunds are paid as money, not as store credit or coupons.
        </p>
      </Section>

      <Section title="Items that cannot be returned">
        <p>
          Materials that have been used, mixed, cut to size or left exposed to weather after delivery, and loose materials such as
          sand or aggregates once unloaded, generally cannot be returned unless they were defective or not as ordered.
        </p>
      </Section>
    </LegalPage>
  );
}
