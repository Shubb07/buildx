'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buyerDeliveryPhrase, checkGstin, locationMessageT, PaymentClosed, tx, useApiClient, useLocationSelector, useSelectedLocation, useT } from '@sthiva/web-core';
import { deliveryPhraseT } from '@/lib/i18n/delivery';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { useAuth } from '@/components/auth/AuthProvider';
import { EmptyState, ErrorNote, PageHead, SummaryRow } from '@/components/account/AccountUI';
import { useCart, clearCart } from '@/lib/cart';
import { checkoutPrefill, forgetAddress, quoteCart, placeOrder, payOnlineAndPlace, type Quote, type SavedAddress } from '@/lib/orders';
import { rupees } from '@/lib/format';
import { SlotPicker, slotText, type DeliverySlot, type SlotOptions } from '@/components/checkout/SlotPicker';

// Money stays in English (owner): prices, GST invoice, payment, the order summary and Place order.
const LABELS = [tx('Site'), tx('Home'), tx('Office'), tx('Warehouse')];

// One step of checkout. Finished steps fold into a short summary with a Change button.
function Step({ n, title, open, done, summary, onEdit, children }: {
  n: number; title: string; open: boolean; done: boolean; summary?: React.ReactNode; onEdit: () => void; children: React.ReactNode;
}) {
  const t = useT();
  return (
    <section className="card p-5 sm:p-6" aria-labelledby={`step-${n}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[13px] ${done && !open ? 'bg-lime text-ink' : open ? 'bg-ink text-lime' : 'bg-sand-3 text-stone'}`}>
          {done && !open ? <span className="material-symbols-outlined text-[18px]" aria-hidden="true">check</span> : n}
        </span>
        <h2 id={`step-${n}`} className={`font-display text-xl font-semibold tracking-tight ${open || done ? '' : 'text-stone'}`}>{t(title)}</h2>
        {!open && done && (
          <button type="button" onClick={onEdit} className="ml-auto text-[14px] font-semibold text-cobalt hover:underline" aria-label={t('Change: {step}', { step: t(title) })}>
            {t('Change')}
          </button>
        )}
      </div>
      {open ? <div className="mt-5">{children}</div> : done && summary ? <div className="mt-3 pl-11 text-[15px]">{summary}</div> : null}
    </section>
  );
}

function PayOption({ checked, onSelect, icon, title, body }: { checked: boolean; onSelect: () => void; icon: string; title: string; body: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect}
      className={`flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-colors ${checked ? 'border-ink bg-sand' : 'border-sand-4 bg-sand-2 hover:border-ink/40'}`}>
      <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${checked ? 'bg-lime text-ink' : 'bg-sand-3 text-stone'}`}>
        <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      </span>
      <span className="flex flex-col">
        <span className="font-semibold">{title}</span>
        <span className="text-[14px] text-stone">{body}</span>
      </span>
      <span className={`material-symbols-outlined ml-auto text-[22px] ${checked ? 'text-ink' : 'text-sand-4'}`} aria-hidden="true">{checked ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
    </button>
  );
}

function CheckoutForm() {
  const client = useApiClient();
  const { user } = useAuth();
  const cart = useCart();
  const location = useSelectedLocation();
  const router = useRouter();
  const t = useT();

  const [quote, setQuote] = useState<{ status: 'loading' } | { status: 'success'; data: Quote } | { status: 'error'; message: string }>({ status: 'loading' });
  const [label, setLabel] = useState('Site');
  const [fullAddress, setFullAddress] = useState('');
  const [contactPhone, setContactPhone] = useState(user?.phone?.replace(/\D/g, '').slice(-10) ?? '');
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  // Pay online now (saves on delivery) or cash on delivery; online is picked when it is on offer
  const [payWay, setPayWay] = useState<'ONLINE' | 'COD'>('ONLINE');
  // Optional GST invoice (business buyers claim input credit); prefilled from the last one used
  const [wantGst, setWantGst] = useState(false);
  const [gstin, setGstin] = useState('');
  const [gstName, setGstName] = useState('');
  // Step being filled in (finished steps fold into a summary)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Optional booked delivery slot; slotOptions comes from the last successful quote
  const [slot, setSlot] = useState<DeliverySlot | null>(null);
  const [slotOptions, setSlotOptions] = useState<SlotOptions>({ available: false });
  // Addresses remembered from earlier orders (newest first), the chosen one, or 'new'
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [chosen, setChosen] = useState<string>('new');
  const { state: pinState, submitPincode } = useLocationSelector();
  const [pinInput, setPinInput] = useState('');
  const [editingPin, setEditingPin] = useState(false);

  const pickSaved = (a: SavedAddress) => {
    setChosen(a._id);
    setLabel(a.label);
    setFullAddress(a.fullAddress);
    setContactPhone(a.contactPhone);
    // Prices and delivery follow the site PIN, so the saved address brings its PIN along
    if (a.pincode && a.pincode !== location?.pincode) submitPincode(a.pincode);
  };
  const pickNew = () => {
    setChosen('new');
    setFullAddress('');
  };
  const forget = (id: string) => {
    forgetAddress(client, id).then((list) => {
      setSaved(list);
      if (chosen === id) pickNew();
    }).catch(() => undefined);
  };
  const checkPin = () => {
    if (pinInput.length !== 6) return;
    submitPincode(pinInput);
    setEditingPin(false);
  };

  useEffect(() => {
    checkoutPrefill(client).then(({ gst, addresses }) => {
      if (gst) { setGstin(gst.gstin); setGstName(gst.businessName); }
      setSaved(addresses);
      // Start with the last address used for this site (or the last one used at all)
      const first = addresses.find((a) => a.pincode && a.pincode === location?.pincode) ?? addresses[0];
      if (first) pickSaved(first);
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);
  const gstCheck = gstin.length === 15 ? checkGstin(gstin) : null;
  const gstReady = !wantGst || (gstCheck?.ok === true && gstName.trim().length >= 2);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const items = useMemo(() => cart?.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) ?? [], [cart]);

  useEffect(() => {
    if (!cart || cart.items.length === 0) return;
    let cancelled = false;
    setQuote({ status: 'loading' });
    quoteCart(client, items, location?.pincode, slot)
      .then((data) => {
        if (cancelled) return;
        setQuote({ status: 'success', data });
        if (data.slots) setSlotOptions(data.slots);
      })
      .catch((err) => {
        if (cancelled) return;
        setQuote({ status: 'error', message: err instanceof Error ? err.message : 'Could not price your cart' });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, JSON.stringify(items), location?.pincode, slot?.date, slot?.window]);

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        icon="shopping_cart"
        title="Nothing to check out"
        body="Your cart is empty. Add materials from a supplier first."
        cta={{ href: '/#categories', label: 'Browse materials' }}
      />
    );
  }

  const pinCheck = pinState.phase === 'result' ? pinState.check : null;
  const pinProblem = pinCheck && pinCheck.status !== 'serviceable' && pinCheck.status !== 'not-serviceable' ? locationMessageT(t, pinCheck.message) : null;
  const phoneOk = /^[6-9]\d{9}$/.test(contactPhone);
  const addressReady = fullAddress.trim().length >= 5 && phoneOk && !!location?.pincode;
  const stepOneHint = addressReady ? null
    : !location?.pincode ? t('Enter the site PIN code so we can check delivery and price it.')
    : fullAddress.trim().length < 5 ? t('Write the full delivery address.')
    : t('Enter a 10-digit mobile number for the person on site.');

  // Out of area is allowed (Sthiva finds a supplier); any other not-serviceable answer blocks the order
  const notServiceable = quote.status === 'success' && quote.data.delivery !== null && !quote.data.delivery.serviceable && !quote.data.outOfArea;
  const canPlace =
    !placing && quote.status === 'success' && !notServiceable && quote.data.deliveryPricing?.status !== 'UNPRICED' && addressReady && gstReady;

  const online = quote.status === 'success' && quote.data.payOnline?.available ? quote.data.payOnline : null;
  const payingOnline = !!online && payWay === 'ONLINE';
  const payable = quote.status === 'success' ? (payingOnline ? online!.total : quote.data.total) : null;
  const buttonText = placing
    ? (payingOnline ? 'Waiting for payment' : 'Placing order')
    : payingOnline ? `Pay ${rupees.format(payable!)} and place order` : `Place order${payable !== null ? ` · ${rupees.format(payable)}` : ''}`;

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    // Enter in an earlier step's field must not place the order
    if (quote.status !== 'success' || step !== 3 || !canPlace) return;
    setPlaceError(null);
    setPlacing(true);
    try {
      const input = {
        items,
        deliveryAddress: { label, fullAddress, pincode: location?.pincode, contactPhone },
        expectedTotal: payable!,
        ...(wantGst ? { buyerGst: { gstin, businessName: gstName.trim() } } : {}),
        ...(slot ? { deliverySlot: slot } : {}),
      };
      const result = payingOnline
        ? await payOnlineAndPlace(client, input, { name: user?.name })
        : await placeOrder(client, input, idempotencyKey);
      clearCart();
      // Split across sellers: the orders list shows every part together
      router.push(result.orders && result.orders.length > 1 ? '/orders' : `/orders/${result.orderId}`);
    } catch (err) {
      if (err instanceof PaymentClosed) setPlaceError('Payment not completed, so nothing was charged. You can try again or choose cash on delivery.');
      else setPlaceError(err instanceof Error ? err.message : 'Could not place the order. Please try again.');
    } finally {
      setPlacing(false);
    }
  }

  return (
    <form onSubmit={handlePlaceOrder} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-4">
        <Step
          n={1}
          title={tx('Delivery address')}
          open={step === 1}
          done={addressReady}
          onEdit={() => setStep(1)}
          summary={
            <>
              <p className="font-semibold">{t(label)}{location?.pincode && <span className="font-normal text-stone"> · {t('PIN')} <span className="font-mono text-ink">{location.pincode}</span></span>}</p>
              <p className="text-stone">{fullAddress}</p>
              <p className="mt-1 font-mono text-[14px]">+91 {contactPhone}</p>
            </>
          }
        >
          {saved.length > 0 && (
            <fieldset className="mb-5">
              <legend className="text-[14px] font-medium text-stone">{t('Your addresses')}</legend>
              <div className="mt-2 flex flex-col gap-2">
                {saved.map((a) => (
                  <div key={a._id} className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${chosen === a._id ? 'border-ink bg-sand' : 'border-sand-4 hover:border-ink'}`}>
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input type="radio" name="saved-address" checked={chosen === a._id} onChange={() => pickSaved(a)} className="mt-1 h-4 w-4 accent-ink" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t(a.label)}{a.pincode && <span className="font-normal text-stone"> · {t('PIN')} <span className="font-mono">{a.pincode}</span></span>}</span>
                        <span className="block text-[14px] text-stone">{a.fullAddress}</span>
                        <span className="block font-mono text-[13px] text-stone">+91 {a.contactPhone}</span>
                      </span>
                    </label>
                    <button type="button" onClick={() => forget(a._id)} className="text-[13px] text-stone hover:text-error" aria-label={t('Remove saved address: {address}', { address: a.fullAddress })}>
                      {t('Remove')}
                    </button>
                  </div>
                ))}
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${chosen === 'new' ? 'border-ink bg-sand' : 'border-sand-4 hover:border-ink'}`}>
                  <input type="radio" name="saved-address" checked={chosen === 'new'} onChange={pickNew} className="h-4 w-4 accent-ink" />
                  <span className="font-semibold">{t('A new address')}</span>
                </label>
              </div>
            </fieldset>
          )}

          {chosen === 'new' && (
            <>
              <fieldset>
                <legend className="text-[14px] font-medium text-stone">{t('Save this address as')}</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LABELS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLabel(l)}
                      aria-pressed={label === l}
                      className={`h-11 rounded-full border px-4 text-[14px] font-medium transition-colors ${
                        label === l ? 'border-ink bg-ink text-sand' : 'border-sand-4 bg-sand hover:border-ink'
                      }`}
                    >
                      {t(l)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="mt-5 flex flex-col gap-2">
                <span className="text-[14px] font-medium text-stone">{t('Full address')}</span>
                <textarea
                  rows={3}
                  value={fullAddress}
                  onChange={(e) => setFullAddress(e.target.value)}
                  placeholder={t('Plot or house no., street, area, landmark, city')}
                  autoComplete="street-address"
                  className="field resize-none"
                />
              </label>
            </>
          )}

          {/* Site PIN: the same saved PIN as the rest of the site; prices and delivery follow it */}
          <div className="mt-5 flex flex-col gap-2">
            <span className="text-[14px] font-medium text-stone">{t('Site PIN code')}</span>
            {location && !editingPin && pinState.phase !== 'checking' ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
                <span className="material-symbols-outlined text-[18px] text-stone" aria-hidden="true">location_on</span>
                <span className="font-mono font-semibold">{location.pincode}</span>
                <span className="text-stone">{location.label}</span>
                <button type="button" onClick={() => { setPinInput(''); setEditingPin(true); }} className="text-[14px] font-semibold text-cobalt hover:underline">{t('Change')}</button>
              </p>
            ) : (
              <div className="flex gap-2">
                <input
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); checkPin(); } }}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder={t('6-digit PIN')}
                  aria-label={t('Site PIN code')}
                  className="field w-40 font-mono"
                />
                <button type="button" disabled={pinInput.length !== 6 || pinState.phase === 'checking'} onClick={checkPin} className="btn-ink px-5">
                  {pinState.phase === 'checking' ? t('Checking') : t('Check')}
                </button>
              </div>
            )}
            {pinProblem && <p role="alert" className="text-[14px] text-error">{pinProblem}</p>}
          </div>

          <label className="mt-5 flex flex-col gap-2">
            <span className="text-[14px] font-medium text-stone">{t('Mobile number to call on delivery')}</span>
            <div className="flex items-center gap-2 rounded-xl border border-sand-4 bg-sand-2 pl-4 transition-[border-color,box-shadow] focus-within:border-ink focus-within:shadow-[0_0_0_4px_rgba(243,184,6,0.55)]">
              <span className="font-mono text-[15px] text-stone">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-transparent py-3.5 pr-4 font-mono text-[15px] tracking-wide outline-none"
              />
            </div>
          </label>

          {stepOneHint && <p className="mt-4 text-[14px] text-stone">{stepOneHint}</p>}
          <button type="button" disabled={!addressReady} onClick={() => setStep(2)} className="btn-ink mt-6 w-full py-4 sm:w-auto sm:px-8">
            {t('Continue')}
          </button>
        </Step>

        <Step
          n={2}
          title={tx('Check your order')}
          open={step === 2}
          done={step > 2}
          onEdit={() => setStep(2)}
          summary={
            quote.status === 'success' ? (
              <p className="text-stone">
                {quote.data.items.length === 1 ? t('1 item') : t('{n} items', { n: quote.data.items.length })}
                {slot ? `, ${t('slot {slot}', { slot: slotText(slot, t) })}` : ''}
                {wantGst && gstCheck?.ok ? `, GST invoice to ${gstName.trim()}` : ''}
              </p>
            ) : null
          }
        >
          {quote.status === 'loading' && <div className="skeleton h-24" role="status" aria-label={t('Pricing your cart')} />}
          {quote.status === 'error' && <p role="alert" className="text-[15px] text-error">{quote.message}</p>}
          {quote.status === 'error' && slot && (
            <button type="button" onClick={() => setSlot(null)} className="btn-ghost mt-3">{t('Use standard delivery instead')}</button>
          )}
          {quote.status === 'success' && (
            <>
              {quote.data.parts && quote.data.parts.length > 1 && (
                <div className="mb-4 flex items-start gap-3 rounded-xl bg-[#FFF4D6] p-4 text-[14px] text-[#5C4300]">
                  <span className="material-symbols-outlined mt-0.5 text-[20px]" aria-hidden="true">local_shipping</span>
                  <div>
                    <p className="font-semibold">{t('Delivered in {n} parts', { n: quote.data.parts.length })}</p>
                    <p>{t('No single nearby seller has everything, so each part comes from a different verified seller, with its own delivery and tracking. You pay each part on delivery.')}</p>
                    <ul className="mt-2 flex flex-col gap-0.5">
                      {quote.data.parts.map((p) => (
                        <li key={p.part}>Part {p.part}: {p.items} item{p.items === 1 ? '' : 's'}, {rupees.format(p.goods)}{p.deliveryCharge > 0 ? ` + ${rupees.format(p.deliveryCharge)} delivery` : ''}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <ul className="flex flex-col divide-y divide-sand-4 rounded-xl border border-sand-4">
                {quote.data.items.map((item) => (
                  <li key={item.productId} className="flex items-start justify-between gap-4 p-4 text-[15px]">
                    <span className="min-w-0">
                      {quote.data.parts && quote.data.parts.length > 1 && item.part && <span className="mb-1 inline-block rounded-full bg-sand-3 px-2 py-0.5 text-[12px] font-medium">{t('Part {n}', { n: item.part })}</span>}
                      <span className="block font-semibold">{item.name}</span>
                      <span className="block text-[14px] text-stone">
                        <span className="font-mono text-ink">{item.quantity}</span> {item.unit.toLowerCase()} × {rupees.format(item.pricePerUnit)}
                        {item.pricePerUnit < item.listPrice && <span className="text-tertiary"> (bulk price)</span>}
                      </span>
                      {!item.inStock && <span className="block text-[13px] text-error">{t('Only {n} left', { n: item.stockQuantity })}</span>}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{rupees.format(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <Link href="/cart" className="mt-3 inline-flex items-center gap-1 text-[14px] font-medium text-cobalt hover:underline">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
                {t('Change quantities in the cart')}
              </Link>
            </>
          )}

          <SlotPicker options={slotOptions} value={slot} onChange={setSlot} />

          <label className="mt-6 flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={wantGst} onChange={(e) => setWantGst(e.target.checked)} className="mt-1 h-5 w-5 accent-ink" />
            <span>
              <span className="block font-semibold">I need a GST invoice</span>
              <span className="block text-[14px] text-stone">For business purchases: the supplier bills your GSTIN so you can claim input credit.</span>
            </span>
          </label>
          {wantGst && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-[14px] font-medium text-stone">GSTIN</span>
                <input
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15))}
                  placeholder="29ABCDE1234F1ZW"
                  aria-invalid={gstCheck ? !gstCheck.ok : undefined}
                  aria-describedby="gst-help"
                  className={`field font-mono tracking-wider ${gstCheck && !gstCheck.ok ? 'border-error' : ''}`}
                />
                <span id="gst-help" aria-live="polite" className={`text-[13px] ${gstCheck && !gstCheck.ok ? 'text-error' : 'text-stone'}`}>
                  {gstCheck ? (gstCheck.ok ? `Registered in ${gstCheck.state}.` : gstCheck.problem) : `${gstin.length} of 15 characters.`}
                </span>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-[14px] font-medium text-stone">Business name on the GST certificate</span>
                <input value={gstName} onChange={(e) => setGstName(e.target.value.slice(0, 120))} autoComplete="organization" className="field" />
              </label>
            </div>
          )}

          <button type="button" disabled={quote.status !== 'success' || !gstReady} onClick={() => setStep(3)} className="btn-ink mt-6 w-full py-4 sm:w-auto sm:px-8">
            {t('Continue')}
          </button>
        </Step>

        <Step n={3} title="Pay and place order" open={step === 3} done={false} onEdit={() => setStep(3)}>
          {/* Money text stays in English (owner rule) */}
          <div className="flex flex-col gap-3" role="radiogroup" aria-label="How you pay">
            {online && (
              <PayOption
                checked={payWay === 'ONLINE'} onSelect={() => setPayWay('ONLINE')} icon="bolt"
                title={online.deliveryDiscount > 0 ? `Pay online now and save ${rupees.format(online.deliveryDiscount)}` : 'Pay online now'}
                body={`UPI, card or net banking through Razorpay.${online.deliveryDiscount > 0 ? ` ${online.discountPercent}% off delivery.` : ''} If the order is cancelled, the money comes back to you.`}
              />
            )}
            <PayOption
              checked={!payingOnline} onSelect={() => setPayWay('COD')} icon="payments"
              title="Cash on delivery" body="Pay when the materials reach your site."
            />
          </div>
          {/* Phones: the summary sits below, so the button is here too */}
          {placeError && <p role="alert" className="mt-4 text-[14px] text-error lg:hidden">{placeError}</p>}
          <button type="submit" disabled={!canPlace} className="btn-lime mt-5 w-full py-4 text-[16px] lg:hidden">
            {buttonText}
          </button>
        </Step>
      </div>

      <aside className="lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start">
        <div className="rounded-3xl bg-ink p-6 text-sand">
          <p className="eyebrow text-stone-light">Order summary</p>
          <p className="mt-2 text-[14px] text-stone-light">Supplied by a verified Sthiva supplier near you</p>

          {quote.status === 'loading' && (
            <div className="mt-5 flex flex-col gap-3" role="status" aria-label="Pricing your cart">
              {[0, 1, 2].map((i) => <div key={i} className="h-5 animate-pulse rounded bg-white/10" />)}
            </div>
          )}

          {quote.status === 'error' && <p role="alert" className="mt-5 text-[15px] text-signal-red">{quote.message}</p>}

          {quote.status === 'success' && (
            <>
              <ul className="mt-5 flex flex-col gap-3 border-b border-white/10 pb-5">
                {quote.data.items.map((item) => (
                  <li key={item.productId} className="flex justify-between gap-4 text-[14px]">
                    <span className="min-w-0 text-stone-light">
                      <span className="font-mono text-sand">{item.quantity}</span> {item.unit.toLowerCase()} × {item.name}
                      {item.pricePerUnit < item.listPrice && (
                        <span className="mt-0.5 block text-[12px] text-lime">Bulk price {rupees.format(item.pricePerUnit)} / {item.unit.toLowerCase()}</span>
                      )}
                      {!item.inStock && <span className="mt-0.5 block text-[12px] text-signal-red">{t('Only {n} left', { n: item.stockQuantity })}</span>}
                    </span>
                    <span className="flex-shrink-0 tabular-nums">{rupees.format(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-col gap-2">
                <SummaryRow onDark label="Subtotal" value={rupees.format(quote.data.subtotal)} />
                <SummaryRow onDark label="GST" value={rupees.format(quote.data.gstAmount)} />
                <SummaryRow onDark label="Delivery" value={quote.data.deliveryCharge > 0 ? rupees.format(quote.data.deliveryCharge) : 'No charge'} />
                {quote.data.deliveryPricing?.status === 'PRICED' && (
                  <p className="text-[13px] text-stone-light">{quote.data.deliveryPricing.vehicle}, {quote.data.deliveryPricing.weightKg} kg, about {quote.data.deliveryPricing.distanceKm} km</p>
                )}
                <div className="mt-2 border-t border-white/10 pt-3">
                  {payingOnline && online!.deliveryDiscount > 0 && <SummaryRow onDark label="Paying online" value={`− ${rupees.format(online!.deliveryDiscount)}`} />}
                  <SummaryRow strong label="Total" value={rupees.format(payable ?? quote.data.total)} />
                </div>
              </div>
              {(quote.data.outOfArea || quote.data.onOrder) ? (
                <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-white/[0.06] px-4 py-3 text-[14px] text-sand/80">
                  <span className="material-symbols-outlined mt-0.5 text-[18px] text-lime" aria-hidden="true">pending</span>
                  <span>
                    <strong className="font-semibold text-sand">{t('Your order will be in process.')}</strong>{' '}
                    {quote.data.outOfArea
                      ? t('No supplier delivers to your PIN yet. Sthiva finds one and tells you the delivery date and charge within 24 hours. You can cancel if it does not suit you.')
                      : t('Something here is ordered from the company or made for you. The supplier confirms the delivery date within 24 hours and you will be notified.')}
                  </span>
                </p>
              ) : slot ? (
                <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-white/[0.06] px-4 py-3 text-[14px] text-sand/80">
                  <span className="material-symbols-outlined mt-0.5 text-[18px] text-lime" aria-hidden="true">schedule</span>
                  <span>
                    {t('Delivery slot')} <strong className="font-semibold text-sand">{slotText(slot, t)}</strong>. {t('The seller confirms it when they accept your order.')}
                  </span>
                </p>
              ) : quote.data.expectedDelivery && (
                <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-white/[0.06] px-4 py-3 text-[14px] text-sand/80">
                  <span className="material-symbols-outlined mt-0.5 text-[18px] text-lime" aria-hidden="true">event</span>
                  <span>
                    {t('Usual delivery time')}: <strong className="font-semibold text-sand">{deliveryPhraseT(t, buyerDeliveryPhrase(quote.data.expectedDelivery.minDays, quote.data.expectedDelivery.maxDays))}</strong>.{' '}
                    {t('The supplier confirms the exact date when they accept, and your order page shows it.')}
                  </span>
                </p>
              )}
              {quote.data.deliveryPricing?.status === 'UNPRICED' && (
                <p role="alert" className="mt-4 rounded-xl bg-signal-red/15 px-4 py-3 text-[14px] text-[#FFB4B6]">{quote.data.deliveryPricing.message}</p>
              )}
              {notServiceable && (
                <p role="alert" className="mt-4 rounded-xl bg-signal-red/15 px-4 py-3 text-[14px] text-[#FFB4B6]">
                  {t('This supplier does not deliver to PIN {pin}. Change your PIN on the home page or pick another supplier.', { pin: quote.data.delivery?.pincode ?? '' })}
                </p>
              )}
            </>
          )}

          {placeError && <p role="alert" className="mt-4 hidden text-[14px] text-signal-red lg:block">{placeError}</p>}
          {step !== 3 && <p className="mt-6 hidden text-center text-[14px] text-stone-light lg:block">{t('Finish the steps on the left to place your order.')}</p>}

          <button type="submit" disabled={!canPlace || step !== 3} className="btn-lime mt-6 hidden w-full py-4 text-[16px] lg:inline-flex">
            {placing && <span className="material-symbols-outlined animate-spin text-[20px]" aria-hidden="true">progress_activity</span>}
            {buttonText}
          </button>
          <p className="mt-3 text-center text-[12px] text-stone-light">{t('The supplier confirms the order before it is dispatched.')}</p>
        </div>
      </aside>
    </form>
  );
}

export default function CheckoutPage() {
  return (
    <>
      <Header />
      <main id="main" className="container-x min-h-[70vh] pb-32 pt-[calc(var(--header-h)+40px)]">
        <PageHead eyebrow="Checkout" title="Almost" accent="there" />
        <div className="mt-10">
          <RequireAuth>
            <CheckoutForm />
          </RequireAuth>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
