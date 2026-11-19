'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSelectedLocation } from '@sthiva/web-core';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ProductGallery } from '@/components/ProductGallery';
import { DeliveryCheck } from '@/components/catalog/DeliveryCheck';
import { QuantityHelper } from '@/components/catalog/QuantityHelper';
import { VariantPicker } from '@/components/catalog/VariantPicker';
import { pricePerSqFt } from '@/lib/sheet-area';
import { useProduct } from '@/lib/products';
import { useProductReviews } from '@/lib/reviews';
import { addToCart } from '@/lib/cart';
import { buyerDeliveryPhrase, buyerDeliveryRange, formatDeliveryDate, istDate, matchCatalogItem } from '@sthiva/web-core';
import { rupees } from '@/lib/format';

const relativeDate = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function timeAgo(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days < 30) return relativeDate.format(-days, 'day');
  if (days < 365) return relativeDate.format(-Math.round(days / 30), 'month');
  return relativeDate.format(-Math.round(days / 365), 'year');
}

function bestBulkPrice(base: number, tiers: { minQty: number; price: number }[] | undefined, qty: number) {
  if (!tiers?.length) return base;
  const applicable = tiers.filter((t) => qty >= t.minQty).sort((a, b) => b.minQty - a.minQty)[0];
  return applicable ? applicable.price : base;
}

const UNIT_LABEL: Record<string, string> = {
  KG: 'kg', TON: 'tonne', PIECE: 'piece', BAG: 'bag', BUNDLE: 'bundle', CUBIC_METER: 'm³', SQUARE_METER: 'm²', LITER: 'litre', METER: 'metre', BOX: 'box', SHEET: 'sheet',
};
const unitLabel = (u: string) => UNIT_LABEL[u] ?? u.toLowerCase();

function Stars({ value, size = 'text-[18px]' }: { value: number; size?: string }) {
  return (
    <span className="flex gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`material-symbols-outlined ${size} ${i < Math.round(value) ? 'text-ink' : 'text-sand-4'}`} style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
          star
        </span>
      ))}
    </span>
  );
}

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const location = useSelectedLocation();
  const [quantity, setQuantity] = useState<number | null>(null);
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  // Phones see the buy box only after the gallery and details, so a slim bar keeps price and
  // Add to cart in reach until the real button scrolls into view
  const buyButtonRef = useRef<HTMLButtonElement>(null);
  const [buyButtonVisible, setBuyButtonVisible] = useState(true);

  const product = useProduct(id, location?.pincode ?? null);
  const data = product.status === 'success' ? product.data : undefined;
  const reviews = useProductReviews(data?._id);

  const minQty = data?.minOrderQuantity ?? 1;
  const qty = Math.max(quantity ?? minQty, minQty);
  const unitPrice = useMemo(() => (data ? bestBulkPrice(data.basePrice, data.bulkPricing, qty) : 0), [data, qty]);
  const tiers = data?.bulkPricing?.slice().sort((a, b) => a.minQty - b.minQty) ?? [];
  const catalog = data ? matchCatalogItem(data.name, data.categoryId?.slug) : undefined;
  const inStock = (data?.stockQuantity ?? 0) > 0;
  const onOrder = data?.supply === 'ON_ORDER';
  const notDeliverable = !!(location && data?.availability && !data.availability.deliverable);
  // No supplier serves this PIN yet: the order is still taken and Sthiva finds a supplier (in process)
  const outOfArea = notDeliverable && data?.availability?.reason === 'PINCODE_NOT_SERVED';
  const blockedByPin = notDeliverable && !outOfArea;
  const unit = data ? unitLabel(data.unit) : '';
  // Its seller paused it for a few days and nobody else has it right now
  const backOn = data?.backOn ? new Date(data.backOn).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : null;
  const canBuy = inStock && !blockedByPin && !backOn;

  useEffect(() => {
    const el = buyButtonRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setBuyButtonVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [data]);

  function handleAddToCart() {
    if (!data) return;
    const result = addToCart(data.supplierId?._id ?? 'unknown', data.supplierId?.businessName ?? 'Supplier', {
      productId: data._id,
      name: data.name,
      imageUrl: data.images?.find((img) => img.isPrimary)?.url ?? data.images?.[0]?.url,
      unit: data.unit,
      basePrice: unitPrice,
      quantity: qty,
      minOrderQuantity: minQty,
    });
    setCartNotice(result === 'added' ? `Added ${qty} ${unit} to your cart.` : '');
  }

  return (
    <>
      <Header />
      <main id="main" className="container-x pb-24 pt-[calc(var(--header-h)+32px)]">
        {product.status === 'loading' && (
          <div className="grid gap-10 lg:grid-cols-12" role="status" aria-label="Loading product">
            <div className="skeleton aspect-square lg:col-span-7" />
            <div className="flex flex-col gap-4 lg:col-span-5">
              <div className="skeleton h-12 w-3/4" />
              <div className="skeleton h-40" />
              <div className="skeleton h-32" />
            </div>
          </div>
        )}
        {product.status === 'error' && (
          <div className="card flex flex-col items-center gap-2 px-6 py-16 text-center">
            <span className="material-symbols-outlined text-4xl text-stone" aria-hidden="true">inventory_2</span>
            <p className="font-display text-xl font-semibold">This listing isn&apos;t available</p>
            <p className="max-w-sm text-[15px] text-stone">It may have been removed by the supplier.</p>
            <Link href="/#categories" className="btn-ink mt-3">Browse materials</Link>
          </div>
        )}

        {data && (
          <>
            <nav aria-label="Breadcrumb" className="mb-6 text-[13px] text-stone">
              <Link href="/" className="hover:text-ink">Home</Link> <span aria-hidden="true">/</span>{' '}
              {data.categoryId && (
                <>
                  <Link href={`/category/${data.categoryId.slug}`} className="hover:text-ink">{data.categoryId.name}</Link> <span aria-hidden="true">/</span>{' '}
                </>
              )}
              <span className="text-ink">{data.name}</span>
            </nav>

            {/* Phones: photos, then name, price and Add to cart, then the details. Computers: photos and
                details on the left, the buy box sticky on the right across both rows. */}
            <div className="grid gap-8 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-10">
              <div className="order-1 lg:order-none lg:col-span-7">
                <ProductGallery
                  images={data.images ?? []}
                  name={data.name}
                  category={data.categoryId?.name}
                  badges={data.supplierId?.verificationStatus === 'VERIFIED' ? ['Verified supplier'] : undefined}
                />
              </div>

              <div className="order-3 flex flex-col gap-10 lg:order-none lg:col-span-7 lg:row-start-2">

                {data.description && (
                  <section aria-labelledby="about-title">
                    <h2 id="about-title" className="font-display text-xl font-semibold tracking-tight">About this listing</h2>
                    <p className="mt-3 whitespace-pre-line text-[16px] leading-relaxed text-stone">{data.description}</p>
                  </section>
                )}

                {data.specifications && Object.keys(data.specifications).length > 0 && (
                  <section aria-labelledby="spec-title">
                    <h2 id="spec-title" className="font-display text-xl font-semibold tracking-tight">Specifications</h2>
                    <dl className="mt-3 divide-y divide-sand-4 overflow-hidden rounded-2xl border border-sand-4 bg-sand-2">
                      {Object.entries(data.specifications).map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4 px-5 py-3.5 text-[15px]">
                          <dt className="text-stone">{k}</dt>
                          <dd className="font-medium">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                {data.warranty && (
                  <section className="flex items-start gap-4 rounded-2xl border border-sand-4 bg-sand-2 p-5" aria-label="Warranty">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime text-ink">
                      <span className="material-symbols-outlined text-[22px]" aria-hidden="true">verified_user</span>
                    </span>
                    <div>
                      <p className="text-[16px] font-semibold">
                        {data.warranty.months % 12 === 0 ? `${data.warranty.months / 12} year${data.warranty.months === 12 ? '' : 's'}` : `${data.warranty.months} months`} warranty
                      </p>
                      <p className="text-[14px] text-stone">
                        {data.warranty.by === 'MANUFACTURER' ? 'From the manufacturer.' : 'From the seller.'}{data.warranty.note ? ` ${data.warranty.note}` : ''} Keep your Sthiva invoice for claims.
                      </p>
                    </div>
                  </section>
                )}

                {catalog && (
                  <section className="card p-5 sm:p-6" aria-labelledby="material-title">
                    <p className="eyebrow text-stone">About the material</p>
                    <h2 id="material-title" className="mt-2 font-display text-xl font-semibold tracking-tight">{catalog.name}</h2>
                    <p className="mt-2 text-[15px] leading-relaxed text-stone">{catalog.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {catalog.standard && <span className="rounded-full bg-cobalt-soft px-3 py-1 font-mono text-[12px] text-[#0F2A8A]">{catalog.standard}</span>}
                      {catalog.soldAs.map((s) => (
                        <span key={s.label} className="rounded-full bg-sand-3 px-3 py-1 text-[13px]">{s.label}{s.note ? ` (${s.note})` : ''}</span>
                      ))}
                    </div>
                    <Link href={`/materials/${catalog.id}`} className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-cobalt hover:underline">
                      Sizes, uses and other brands
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
                    </Link>
                  </section>
                )}

                {catalog?.calculator && <QuantityHelper calculator={catalog.calculator} />}
              </div>

              {/* right: buy box */}
              <aside className="order-2 flex flex-col gap-5 lg:order-none lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:self-start">
                <div>
                  {data.categoryId?.name && <p className="eyebrow text-stone">{data.categoryId.name}</p>}
                  <h1 className="mt-2 font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-[0.98] tracking-tightest">{data.name}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
                    <span className="text-stone">by <span className="font-semibold text-ink">{data.supplierId?.businessName ?? 'Supplier'}</span></span>
                    {data.supplierId?.verificationStatus === 'VERIFIED' && (
                      <span className="inline-flex items-center gap-1 font-medium text-tertiary">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">verified</span>
                        Verified supplier
                      </span>
                    )}
                    {(data.sellerCount ?? 1) > 1 && (
                      <span className="inline-flex items-center gap-1 text-stone">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">storefront</span>
                        {data.sellerCount} verified sellers{location?.pincode ? ` deliver to ${location.pincode}` : ' carry this'}
                      </span>
                    )}
                    {data.slotDelivery && (
                      <span className="inline-flex items-center gap-1 text-stone">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">schedule</span>
                        Book a delivery slot at checkout
                      </span>
                    )}
                    {(data.totalReviews ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <Stars value={data.avgRating ?? 0} size="text-[16px]" />
                        <span className="text-stone">({data.totalReviews})</span>
                      </span>
                    )}
                  </div>
                </div>

                {data.variants && <VariantPicker keys={data.variants.keys} options={data.variants.options} unit={unit} customType={catalog?.madeToOrder ? catalog.id : undefined} />}
                {!data.variants && catalog?.madeToOrder && (
                  <a href={`/made-to-measure?type=${catalog.id}`} className="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold text-cobalt hover:underline">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">straighten</span>
                    Need it in your own size? Order it made to measure
                  </a>
                )}

                {/* price */}
                <section className="rounded-2xl bg-ink p-5 text-sand sm:p-6" aria-label="Price">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-display text-4xl font-bold tabular-nums">{rupees.format(unitPrice)}</span>
                    <span className="text-[16px] text-stone-light">per {unit}</span>
                    {unitPrice < data.basePrice && (
                      <span className="text-[14px] text-stone-light">
                        <s className="tabular-nums">{rupees.format(data.basePrice)}</s> <span className="text-lime">bulk price</span>
                      </span>
                    )}
                  </div>
                  {(() => {
                    // Boards sold by the sheet: the trade compares price per square foot
                    const sq = pricePerSqFt(data.unit, unitPrice, data.name, data.specifications);
                    return sq !== null ? <p className="mt-1 text-[15px] text-sand/85"><span className="font-semibold tabular-nums">{rupees.format(sq)}</span> per sq ft</p> : null;
                  })()}
                  <p className="mt-1 text-[13px] text-stone-light">Excluding GST and delivery, which are shown at checkout.</p>
                  {tiers.length > 0 && (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <p className="eyebrow text-lime">Bulk prices <span className="normal-case tracking-normal text-stone-light">(tap to order that much)</span></p>
                      <ul className="mt-2 flex flex-col gap-1">
                        {tiers.map((t) => {
                          const active = unitPrice === t.price && qty >= t.minQty;
                          return (
                            <li key={t.minQty}>
                              <button
                                type="button"
                                onClick={() => setQuantity(Math.max(minQty, t.minQty))}
                                aria-pressed={active}
                                className={`-mx-2 flex w-[calc(100%+1rem)] justify-between rounded-lg px-2 py-1.5 text-[14px] transition-colors hover:bg-white/10 ${active ? 'bg-white/10 text-sand' : 'text-stone-light'}`}
                              >
                                <span>{t.minQty}+ {unit}</span>
                                <span className="tabular-nums">{rupees.format(t.price)} / {unit}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <p className={`mt-4 flex items-center gap-1.5 text-[14px] ${inStock ? 'text-lime' : 'text-signal-red'}`}>
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{onOrder ? 'local_shipping' : inStock ? 'inventory' : 'block'}</span>
                    {onOrder ? 'On order: the supplier gets it from the company or makes it for you' : inStock ? 'In stock with this supplier' : 'Out of stock'}
                  </p>
                  {inStock && data.deliveryDays !== undefined && !onOrder && !outOfArea && (
                    <p className="mt-2 flex items-center gap-1.5 text-[14px] text-stone-light">
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">schedule</span>
                      Usually delivered {buyerDeliveryPhrase(data.deliveryDays, data.deliveryDaysMax)} after the supplier accepts
                    </p>
                  )}
                  {inStock && data.deliveryDays !== undefined && !onOrder && !outOfArea && location?.pincode && !blockedByPin && (
                    <p className="mt-1 flex items-center gap-1.5 text-[15px] text-sand">
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">local_shipping</span>
                      Get it by <span className="font-semibold">{formatDeliveryDate(istDate(buyerDeliveryRange(data.deliveryDays, data.deliveryDaysMax).max))}</span>
                      <span className="text-[13px] text-stone-light">to {location.pincode}, if ordered today</span>
                    </p>
                  )}
                  {(onOrder || outOfArea) && (
                    <p className="mt-2 flex items-start gap-1.5 text-[14px] text-stone-light">
                      <span className="material-symbols-outlined mt-0.5 text-[18px]" aria-hidden="true">pending</span>
                      <span>
                        Your order will be in process.{' '}
                        {outOfArea
                          ? 'No supplier delivers to your PIN yet; Sthiva finds one and tells you the date within 24 hours.'
                          : 'The supplier confirms the delivery date within 24 hours and you will be notified.'}
                      </span>
                    </p>
                  )}
                </section>

                {/* delivery check, right where the decision is made */}
                {!outOfArea && <DeliveryCheck availability={location ? data.availability : undefined} title="Delivery to your site" />}

                {/* quantity */}
                <section className="rounded-2xl border border-sand-4 bg-sand-2 p-5" aria-labelledby="qty-title">
                  <div className="flex items-center justify-between gap-4">
                    <h2 id="qty-title" className="text-[15px] font-semibold">Quantity <span className="font-normal text-stone">({unit})</span></h2>
                    <div className="flex items-center rounded-full border border-sand-4 bg-sand">
                      <button
                        type="button"
                        onClick={() => setQuantity(Math.max(minQty, qty - 1))}
                        disabled={qty <= minQty}
                        className="grid h-11 w-11 place-items-center rounded-full hover:bg-sand-3 disabled:opacity-30"
                        aria-label="Decrease quantity"
                      >
                        <span className="material-symbols-outlined text-[18px]">remove</span>
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={minQty}
                        value={qty}
                        onChange={(e) => setQuantity(Math.max(minQty, Math.floor(Number(e.target.value) || minQty)))}
                        className="w-16 bg-transparent text-center font-mono text-[16px] outline-none"
                        aria-label={`Quantity in ${unit}`}
                      />
                      <button
                        type="button"
                        onClick={() => setQuantity(qty + 1)}
                        className="grid h-11 w-11 place-items-center rounded-full hover:bg-sand-3"
                        aria-label="Increase quantity"
                      >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                      </button>
                    </div>
                  </div>
                  {minQty > 1 && <p className="mt-2 text-[13px] text-stone">Minimum order: {minQty} {unit}</p>}
                  <div className="mt-4 flex items-baseline justify-between border-t border-sand-4 pt-4">
                    <span className="text-[14px] text-stone">Estimated total</span>
                    <span className="font-display text-2xl font-bold tabular-nums">{rupees.format(unitPrice * qty)}</span>
                  </div>
                </section>

                <button ref={buyButtonRef} type="button" onClick={handleAddToCart} disabled={!canBuy} className="btn-lime w-full py-4 text-[16px]">
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_shopping_cart</span>
                  {blockedByPin ? 'Not deliverable to your PIN' : backOn ? `Available again ${backOn}` : !inStock ? 'Out of stock' : 'Add to cart'}
                </button>
                {backOn && !blockedByPin && (
                  <p className="text-center text-[14px] text-stone">The seller has paused this item for a few days. You can order it again from {backOn}.</p>
                )}
                {cartNotice && (
                  <div role="status" className="flex items-center justify-between gap-3 rounded-2xl bg-sand-3 px-4 py-3">
                    <p className="text-[14px]">{cartNotice}</p>
                    <Link href="/cart" className="shrink-0 text-[14px] font-semibold text-cobalt hover:underline">View cart</Link>
                  </div>
                )}
                {/* What every order comes with: only promises Sthiva already keeps */}
                <ul className="grid grid-cols-2 gap-2 text-[13px]">
                  <li className="flex items-start gap-2 rounded-xl bg-sand-2 p-3">
                    <span className="material-symbols-outlined text-[20px] text-tertiary" aria-hidden="true">payments</span>
                    <span><span className="block font-semibold">Pay on delivery</span><span className="text-stone">Pay when it arrives</span></span>
                  </li>
                  <li className="flex items-start gap-2 rounded-xl bg-sand-2 p-3">
                    <span className="material-symbols-outlined text-[20px] text-tertiary" aria-hidden="true">fact_check</span>
                    <span><span className="block font-semibold">Check before you pay</span><Link href="/refunds" className="text-stone underline">Refuse damaged or short items</Link></span>
                  </li>
                  {data.warranty ? (
                    <li className="flex items-start gap-2 rounded-xl bg-sand-2 p-3">
                      <span className="material-symbols-outlined text-[20px] text-tertiary" aria-hidden="true">verified_user</span>
                      <span><span className="block font-semibold">{data.warranty.months % 12 === 0 ? `${data.warranty.months / 12} year` : `${data.warranty.months} month`} warranty</span><span className="text-stone">{data.warranty.by === 'MANUFACTURER' ? 'From the manufacturer' : 'From the seller'}</span></span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 rounded-xl bg-sand-2 p-3">
                      <span className="material-symbols-outlined text-[20px] text-tertiary" aria-hidden="true">verified</span>
                      <span><span className="block font-semibold">Verified sellers</span><span className="text-stone">GST, licence and bank checked</span></span>
                    </li>
                  )}
                  {catalog?.madeToOrder ? (
                    <li className="flex items-start gap-2 rounded-xl bg-sand-2 p-3">
                      <span className="material-symbols-outlined text-[20px] text-tertiary" aria-hidden="true">straighten</span>
                      <span><span className="block font-semibold">Any size</span><Link href={`/made-to-measure?type=${catalog.id}`} className="text-stone underline">Order made to measure</Link></span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 rounded-xl bg-sand-2 p-3">
                      <span className="material-symbols-outlined text-[20px] text-tertiary" aria-hidden="true">receipt_long</span>
                      <span><span className="block font-semibold">GST invoice</span><span className="text-stone">For business buyers</span></span>
                    </li>
                  )}
                </ul>
              </aside>
            </div>

            {!buyButtonVisible && (
              <div className="fixed inset-x-3 bottom-[92px] z-40 flex items-center justify-between gap-3 rounded-2xl border border-sand-4 bg-sand px-4 py-3 shadow-[0_18px_50px_-12px_rgba(11,12,10,0.45)] md:bottom-4 lg:hidden">
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-stone" role={cartNotice ? 'status' : undefined}>
                    {cartNotice ? 'Added to your cart' : `${qty} ${unit} · + GST, delivery`}
                  </p>
                  <p className="font-display text-xl font-bold tabular-nums">{rupees.format(unitPrice * qty)}</p>
                </div>
                {cartNotice ? (
                  <Link href="/cart" className="btn-ink shrink-0 px-5 py-3 text-[15px]">
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">shopping_cart</span>
                    View cart
                  </Link>
                ) : canBuy ? (
                  <button type="button" onClick={handleAddToCart} className="btn-lime shrink-0 px-5 py-3 text-[15px]">
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_shopping_cart</span>
                    Add to cart
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => buyButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className="btn-ink shrink-0 px-5 py-3 text-[15px]"
                  >
                    {blockedByPin ? 'Not deliverable' : backOn ? `Back ${backOn}` : 'Out of stock'}
                  </button>
                )}
              </div>
            )}

            {/* supplier + reviews */}
            <section className="mt-20 grid gap-4 md:grid-cols-3" aria-labelledby="reviews-title">
              <div className="card flex flex-col items-center p-8 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-ink font-display text-2xl font-bold text-lime">
                  {data.supplierId?.businessName?.[0] ?? '?'}
                </span>
                <p className="mt-4 font-display text-xl font-semibold">{data.supplierId?.businessName ?? 'Supplier'}</p>
                {data.supplierId?.verificationStatus === 'VERIFIED' && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[14px] text-tertiary">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">verified</span> Verified
                  </p>
                )}
                {(data.supplierId?.avgRating ?? 0) > 0 && <div className="mt-3"><Stars value={data.supplierId!.avgRating!} /></div>}
              </div>
              <div className="card p-6 md:col-span-2 sm:p-8">
                <h2 id="reviews-title" className="font-display text-xl font-semibold tracking-tight">Buyer reviews</h2>
                {reviews.status === 'success' && reviews.data.summary.count > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
                    <span className="inline-flex items-center gap-2">
                      <span className="font-display text-2xl font-bold tabular-nums">{reviews.data.summary.average.toFixed(1)}</span>
                      <Stars value={reviews.data.summary.average} size="text-[16px]" />
                      <span className="text-stone">({reviews.data.summary.count})</span>
                    </span>
                    {reviews.data.summary.onTimePercent !== undefined && <span className="text-stone"><span className="font-semibold text-ink">{reviews.data.summary.onTimePercent}%</span> delivered on time</span>}
                    {reviews.data.summary.asListedPercent !== undefined && <span className="text-stone"><span className="font-semibold text-ink">{reviews.data.summary.asListedPercent}%</span> got what was listed</span>}
                  </div>
                )}
                <p className="mt-1 text-[13px] text-stone">From buyers who received this item, from any Sthiva seller.</p>
                <div className="mt-5">
                  {reviews.status === 'loading' && <div className="skeleton h-20" />}
                  {reviews.status === 'error' && <p className="text-[15px] text-error">Couldn&apos;t load reviews.</p>}
                  {reviews.status === 'success' && reviews.data.reviews.length === 0 && (
                    <p className="text-[15px] text-stone">No reviews yet. Reviews appear here after buyers receive their orders.</p>
                  )}
                  {reviews.status === 'success' && reviews.data.reviews.length > 0 && (
                    <ul className="flex flex-col gap-6">
                      {reviews.data.reviews.map((r) => (
                        <li key={r._id} className="flex gap-4">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sand-3 font-semibold">{r.name?.[0] ?? 'B'}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="text-[15px] font-semibold">{r.name ?? 'Buyer'}</p>
                              <span className="font-mono text-[11px] uppercase text-stone">{timeAgo(r.createdAt)}</span>
                            </div>
                            <div className="mt-1"><Stars value={r.rating} size="text-[14px]" /></div>
                            {r.comment && <p className="mt-2 text-[15px] text-stone">{r.comment}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        <Link href="/#categories" className="btn-ghost mt-12">
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_back</span>
          All materials
        </Link>
      </main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
