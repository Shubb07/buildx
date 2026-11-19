'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApiClient, useSelectedLocation } from '@sthiva/web-core';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { useAuth } from '@/components/auth/AuthProvider';
import { EmptyState, ErrorNote, PageHead } from '@/components/account/AccountUI';
import { useCart } from '@/lib/cart';
import { createQuoteRequest } from '@/lib/quotes';

// Ask nearby verified sellers to price the cart as one bulk job. They reply within 48 hours.

const IST_MS = 330 * 60 * 1000;
const dayPlus = (n: number) => new Date(Date.now() + IST_MS + n * 86_400_000).toISOString().slice(0, 10);

function NewQuote() {
  const client = useApiClient();
  const router = useRouter();
  const cart = useCart();
  const { user } = useAuth();
  const location = useSelectedLocation();
  const [label, setLabel] = useState('Site');
  const [fullAddress, setFullAddress] = useState('');
  const [pincode, setPincode] = useState(location?.pincode ?? '');
  const [phone, setPhone] = useState(user?.phone?.replace(/\D/g, '').slice(-10) ?? '');
  const [neededBy, setNeededBy] = useState(dayPlus(7));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = useMemo(() => cart?.items ?? [], [cart]);

  if (!items.length) {
    return <EmptyState icon="request_quote" title="Your cart is empty" body="Add the items for your job first, for example with Order by list, then ask for a bulk quote." cta={{ href: '/order-by-list', label: 'Order by list' }} />;
  }

  const ready = fullAddress.trim().length >= 5 && /^[1-9]\d{5}$/.test(pincode) && /^[6-9]\d{9}$/.test(phone) && neededBy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const r = await createQuoteRequest(client, {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        deliveryAddress: { label, fullAddress: fullAddress.trim(), pincode, contactPhone: phone },
        neededBy,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      router.push(`/quotes/${r._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section className="card p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Items ({items.length})</h2>
        <ul className="mt-3 divide-y divide-sand-4 text-[15px]">
          {items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-3 py-2">
              <span>{i.name}</span>
              <span className="font-mono">{i.quantity} {i.unit.toLowerCase()}</span>
            </li>
          ))}
        </ul>
        <Link href="/cart" className="mt-2 inline-block text-[14px] font-medium text-cobalt hover:underline">Change quantities in the cart</Link>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <label className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-[14px] font-medium text-stone">Site address</span>
          <textarea value={fullAddress} onChange={(e) => setFullAddress(e.target.value.slice(0, 500))} rows={2} className="field resize-none" placeholder="Plot, street, area, town" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-medium text-stone">Site PIN code</span>
          <input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" className="field font-mono" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-medium text-stone">Phone for the person on site</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(-10))} inputMode="tel" className="field font-mono" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-medium text-stone">Needed by</span>
          <input type="date" value={neededBy} min={dayPlus(1)} max={dayPlus(60)} onChange={(e) => setNeededBy(e.target.value)} className="field" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-medium text-stone">Name for this site</span>
          <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 50))} className="field" />
        </label>
        <label className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-[14px] font-medium text-stone">Anything sellers should know? (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} rows={2} className="field resize-none" placeholder="e.g. 12 flats, delivery in two lots, truck access only before 9 am" />
        </label>
        <p className="text-[13px] text-stone sm:col-span-2">Sellers see your PIN and area, not your phone or full address, until you accept their quote.</p>
      </section>

      {error && <ErrorNote>{error}</ErrorNote>}
      <button type="submit" disabled={!ready || busy} className="btn-lime self-start px-8 py-4 text-[16px]">
        {busy ? 'Sending' : 'Ask sellers for a quote'}
      </button>
    </form>
  );
}

export default function NewQuotePage() {
  return (
    <>
      <Header />
      <main id="main" className="container-x min-h-[70vh] max-w-3xl pb-32 pt-[calc(var(--header-h)+40px)]">
        <PageHead eyebrow="Bulk quote" title="Get a" accent="bulk quote" />
        <p className="mt-3 max-w-2xl text-[15px] text-stone">
          For big jobs: verified sellers near your site reply with their best price and a delivery date within 48 hours. Compare them and accept one. It becomes a confirmed order, paid on delivery.
        </p>
        <div className="mt-8"><RequireAuth><NewQuote /></RequireAuth></div>
      </main>
      <BottomNav />
    </>
  );
}
