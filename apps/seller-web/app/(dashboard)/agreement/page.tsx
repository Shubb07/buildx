'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApiClient } from '@sthiva/web-core';
import { ErrorNote, PageHead } from '../../../components/ui';
import { acceptAgreement, useGoLive } from '../../../lib/go-live';

// The seller agreement. Written from the rules the platform actually applies (API features/*).
// When this text changes, bump SELLER_TERMS_VERSION in apps/api/src/features/suppliers/go-live.ts so
// every seller reads and accepts the new version.

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: '1. What Sthiva does',
    points: [
      'Sthiva is an online marketplace. Buyers order building materials; you, an independent seller, supply and sell them. You are the seller of record for every order you accept.',
      'Each item has one price for buyers. Sthiva offers an order to one seller at a time: the lowest price that can deliver to the buyer\'s PIN code, then the nearest. Being on Sthiva does not promise any number of orders.',
    ],
  },
  {
    title: '2. Your listings',
    points: [
      'Prices, GST rate, HSN code, stock, minimum order and delivery time must be true and kept up to date. Photos must be of your own stock.',
      'Every Monday you confirm your stock and prices. Listings you don\'t confirm are hidden until you do.',
      'You may pause a product until a date, or stop selling it, at any time. Orders you already accepted must still be delivered.',
    ],
  },
  {
    title: '3. Orders',
    points: [
      'Accept or reject each order within the answer time shown. If you don\'t answer, the order goes to another seller.',
      'Accept only what you can deliver, in full, on the date you confirm. If the buyer booked a delivery slot, accepting means you will deliver in that slot.',
      'The buyer gives a 4-digit delivery code on arrival. An order is delivered only when the code is entered.',
      'Repeated late deliveries, short quantities, wrong items or cancellations after accepting may lead Sthiva to pause your account.',
    ],
  },
  {
    title: '4. Delivery',
    points: [
      'You deliver with your own vehicle, or hand the order to a Sthiva delivery partner, as shown on the order.',
      'When you deliver yourself, Sthiva keeps a lower commission and the delivery charge is yours.',
    ],
  },
  {
    title: '5. Money',
    points: [
      'Sthiva\'s commission is a percentage per category. You see what you will earn on every order before you accept it.',
      'Buyers pay cash on delivery for now. Cash you collect counts against what Sthiva owes you. Sthiva sends you statements; it pays what it owes, or you pay what you owe, with a payment reference.',
      'Sthiva pays only to your verified payout account. After you change that account, payouts pause for 48 hours for your safety.',
      'When a refund to a buyer is approved, Sthiva pays it to their UPI or bank account within 3 working days.',
    ],
  },
  {
    title: '6. Invoices and tax',
    points: [
      'You bill the buyer. Sthiva prepares the GST invoice in your name from your details and the order, when the order is dispatched.',
      'You are responsible for your GST registration, returns and other taxes on your sales.',
    ],
  },
  {
    title: '7. Verification',
    points: [
      'The papers you upload (GST certificate, shop licence or Udyam certificate) and your payout account must be genuine and in your business\'s or your own name.',
      'Keep them valid. Sthiva reminds you before a paper expires. Sthiva may pause or close an account with false or expired papers.',
    ],
  },
  {
    title: '8. Quality and complaints',
    points: [
      'You are responsible for the quality, grade and quantity of what you supply, as listed.',
      'If a buyer reports a problem, you help Sthiva resolve it quickly, including replacing or taking back wrong or damaged goods.',
      'You set the returns for each product: whether problems must be noted at delivery or can be reported within a set time, and whether sealed items can be returned for a change of mind. Buyers see this before they order, and the setting at the time of the order applies.',
      'When goods are wrong, damaged or short because of you, you pay for the refund and the return trip. It is taken from your next payout, and Sthiva returns its commission on that item.',
    ],
  },
  {
    title: '9. Buyer details',
    points: [
      'Use a buyer\'s name, phone and address only to deliver their order. Don\'t contact them for anything else or share their details.',
    ],
  },
  {
    title: '10. Ending and changes',
    points: [
      'You can delete your seller account at any time from the Business page. Open orders and statements are settled first.',
      'Sthiva may update this agreement. You will be asked to read and accept the new version before you continue selling.',
    ],
  },
];

export default function AgreementPage() {
  const client = useApiClient();
  const goLive = useGoLive();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptedNow, setAcceptedNow] = useState(false);

  const accepted = acceptedNow || (goLive.status === 'success' && goLive.data.steps.find((s) => s.key === 'agreement')?.status === 'DONE');
  const version = goLive.status === 'success' ? goLive.data.termsVersion : null;

  async function accept() {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await acceptAgreement(client, version);
      setAcceptedNow(true);
      goLive.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHead eyebrow="Seller agreement" title="How selling on Sthiva works">
        <p className="max-w-sm text-[15px] text-stone">Plain rules for orders, delivery and money. Please read them once before you go live.</p>
      </PageHead>

      <article className="card flex flex-col gap-6 p-5 sm:p-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="font-display text-lg font-semibold tracking-tight">{s.title}</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed">
              {s.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </section>
        ))}
        {version && <p className="font-mono text-[12px] text-stone">Version {version}</p>}
      </article>

      <section className="card flex flex-col gap-4 p-5 sm:p-6" aria-label="Accept the agreement">
        {goLive.status === 'loading' && <div className="skeleton h-12" role="status" aria-label="Loading" />}
        {goLive.status === 'error' && <ErrorNote>Couldn&apos;t load your status. Check your connection and try again.</ErrorNote>}
        {goLive.status === 'success' && (accepted ? (
          <p className="flex items-center gap-2 text-[15px]">
            <span className="material-symbols-outlined text-tertiary" aria-hidden="true">task_alt</span>
            You have accepted this agreement.
            <Link href="/" className="ml-auto text-[14px] font-medium text-cobalt hover:underline">Back to overview</Link>
          </p>
        ) : (
          <>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-5 w-5 accent-ink" />
              <span className="text-[15px]">I have read the seller agreement and I agree to sell on Sthiva on these terms.</span>
            </label>
            {error && <ErrorNote>{error}</ErrorNote>}
            <button type="button" disabled={!agree || busy} onClick={accept} className="btn-ink self-start px-7">
              {busy ? 'Saving' : 'Accept and continue'}
            </button>
          </>
        ))}
      </section>
    </div>
  );
}
