'use client';

import Link from 'next/link';
import { useI18n, tx } from '@sthiva/web-core';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { CategoryGrid } from '@/components/CategoryGrid';
import { ShortBanner } from '@/components/home/ShortBanner';
import { Reveal } from '@/components/motion/Reveal';
import { BUILT_IN_CATEGORIES } from '@/lib/categories';
import { SITE } from '@/lib/site';

const STEPS = [
  {
    n: '01',
    title: tx('Set your site PIN'),
    body: tx('Enter the PIN code of your site. We match it against the areas each supplier has actually configured, so you only see what can reach you.'),
    icon: 'pin_drop',
  },
  {
    n: '02',
    title: tx('Compare and add to cart'),
    body: tx('Prices, units, minimum quantities and bulk tiers come straight from the supplier listing. GST and delivery are shown at checkout before you confirm.'),
    icon: 'compare_arrows',
  },
  {
    n: '03',
    title: tx('Pay cash on delivery'),
    body: tx('Place the order with your phone number. Track every status change from confirmed to delivered, and pay when it reaches your site.'),
    icon: 'local_shipping',
  },
];

// Phone (SMS) sign-in is switched on only when the paid SMS plan is active; Google sign-in always works
const PHONE_SIGNIN = process.env.NEXT_PUBLIC_PHONE_SIGNIN === 'true';
const SIGNIN_WAYS = PHONE_SIGNIN ? tx('your Google account or phone number') : tx('your Google account');

const PRINCIPLES = [
  { icon: 'verified_user', title: tx('Verified suppliers only'), body: tx('Only suppliers that pass verification can list products that buyers see.') },
  { icon: 'receipt_long', title: tx('Prices you can audit'), body: tx('Before an order is placed, our servers recalculate the total from the live listing.') },
  { icon: 'block', title: tx('No false promises'), body: tx('A valid PIN is not a delivery promise. If no supplier delivers to your area yet, we say so before you order, and find one for you.') },
  { icon: 'lock', title: tx('Sign in, no passwords'), body: tx('Use {ways}. No new password to create, remember or leak.') },
];

export default function HomePage() {
  const { lang, t } = useI18n();
  const ways = t(SIGNIN_WAYS);
  return (
    <>
      <Header />

      <main id="main" className="pt-[var(--header-h)]">
        <ShortBanner />

        {/* ── Materials: every category, in building order ── */}
        <section id="categories" className="scroll-mt-[calc(var(--header-h)+8px)] py-8 md:py-12">
          <div className="container-x">
            <div className="mb-5 flex items-end justify-between gap-4 md:mb-7">
              <h2 className="font-display text-[24px] font-bold tracking-[-0.02em] md:text-[32px]">{t('Shop by material')}</h2>
              <p className="hidden text-[14px] text-stone md:block">{t('From foundation to furnishing, in building order.')}</p>
            </div>
            <CategoryGrid categories={BUILT_IN_CATEGORIES} />
          </div>
        </section>

        {/* ── How it works ─────────────────────────────── */}
        <section id="how-it-works" className="on-ink scroll-mt-16 bg-ink py-20 text-sand md:py-28">
          <div className="container-x">
            <Reveal className="max-w-3xl">
              <p className="eyebrow text-lime">{t('How it works')}</p>
              <h2 className="mt-4 font-display text-[clamp(2.25rem,4.6vw,3.75rem)] font-bold leading-[0.98] tracking-tightest text-balance">
                {t('From PIN code to site gate in three steps.')}
              </h2>
            </Reveal>

            <ol className="mt-14 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.n} delay={i * 120}>
                  <div className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-ink-2 p-7 transition-colors duration-500 hover:border-lime/50 sm:p-8">
                    <div className="flex items-center justify-between">
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.06] text-lime transition-colors duration-500 group-hover:bg-lime group-hover:text-ink">
                        <span className="material-symbols-outlined text-[28px]" aria-hidden="true">{s.icon}</span>
                      </span>
                      <span className="font-display text-6xl font-bold tracking-tightest text-white/[0.07] transition-colors duration-500 group-hover:text-lime/25">
                        {s.n}
                      </span>
                    </div>
                    <h3 className="mt-10 font-display text-2xl font-semibold tracking-[-0.02em]">{t(s.title)}</h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-sand/60">{t(s.body)}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Principles ───────────────────────────────── */}
        <section className="py-20 md:py-28">
          <div className="container-x grid gap-12 lg:grid-cols-12">
            <Reveal className="lg:col-span-4">
              <p className="eyebrow text-stone">{t('Our promise')}</p>
              <h2 className="mt-4 font-display text-[clamp(2.25rem,4.2vw,3.5rem)] font-bold leading-[0.98] tracking-tightest">
                {lang === 'en' ? <>Built on <span className="font-serif font-normal italic">honesty</span>, not hype.</> : t('Built on honesty, not hype.')}
              </h2>
              <p className="mt-5 text-[16px] leading-relaxed text-stone">
                {t('No invented ratings, no made-up stock, no delivery dates we cannot keep. Just the real marketplace.')}
              </p>
            </Reveal>
            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-8">
              {PRINCIPLES.map((p, i) => (
                <Reveal key={p.title} delay={i * 80}>
                  <div className="card group h-full p-7 transition-[transform,box-shadow] duration-500 ease-out-expo hover:-translate-y-1 hover:shadow-[0_24px_60px_-30px_rgba(11,12,10,0.4)]">
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink text-lime transition-transform duration-500 ease-out-expo group-hover:rotate-[-6deg] group-hover:scale-110">
                      <span className="material-symbols-outlined text-[24px]" aria-hidden="true">{p.icon}</span>
                    </span>
                    <h3 className="mt-8 font-display text-[22px] font-semibold tracking-[-0.02em]">{t(p.title)}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-stone">{t(p.body, { ways })}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Suppliers ────────────────────────────────── */}
        <section id="suppliers" className="scroll-mt-24 pb-20 md:pb-28">
          <div className="container-x">
            <Reveal>
              <div className="relative overflow-hidden rounded-[32px] bg-cobalt p-8 text-white sm:p-12 lg:p-16">
                <div className="blueprint absolute inset-0 opacity-70" aria-hidden="true" />
                <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-lime/30 blur-[100px]" aria-hidden="true" />
                <div className="relative grid gap-10 lg:grid-cols-12 lg:items-end">
                  <div className="lg:col-span-8">
                    <p className="eyebrow text-white/60">{t('For suppliers')}</p>
                    <h2 className="mt-4 font-display text-[clamp(2.25rem,5vw,4.25rem)] font-bold leading-[0.95] tracking-tightest text-balance">
                      {t('Sell to every site in your service area.')}
                    </h2>
                    <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/75">
                      {t('List your catalogue, set your own prices and bulk tiers, choose the PIN codes you deliver to, and manage orders from one portal.')}
                    </p>
                  </div>
                  <div className="lg:col-span-4 lg:text-right">
                    {SITE.sellerPortalUrl ? (
                      <a href={SITE.sellerPortalUrl} className="btn bg-white text-ink hover:bg-lime">
                        {t('Open the seller portal')}
                        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_outward</span>
                      </a>
                    ) : (
                      <p className="text-[15px] text-white/70">{t('Seller portal access is shared with suppliers during onboarding.')}</p>
                    )}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────── */}
        <section className="pb-24 md:pb-32">
          <div className="container-x text-center">
            <Reveal>
              <h2 className="mx-auto max-w-4xl font-display text-[clamp(2.75rem,7vw,6rem)] font-bold leading-[0.92] tracking-tightest text-balance">
                {lang === 'en' ? <>Your next pour starts <span className="relative inline-block">here<span className="absolute -bottom-1 left-0 right-0 h-[0.14em] rounded-full bg-lime" aria-hidden="true" /></span>.</> : t('Your next pour starts here.')}
              </h2>
              <p className="mx-auto mt-6 max-w-md text-[17px] text-stone">{t('Sign in with {ways} in under a minute. No passwords.', { ways })}</p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link href="/signin" className="btn-ink group">
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">login</span>
                  {t('Sign in')}
                </Link>
                <Link href="#categories" className="btn-ghost">
                  {t('Browse first')}
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
      <BottomNav />
    </>
  );
}
