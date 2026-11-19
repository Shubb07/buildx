'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useT } from '@sthiva/web-core';
import { rupees } from '@/lib/format';

// Every size of one product on its page: a row of chips per detail (Thickness, Size...). Each chip
// opens that size, at its best price from sellers near the buyer. Sizes nobody sells nearby are
// shown but can't be picked. API: features/products/product.controller.ts (familyOptions).

export type VariantOption = {
  catalogItemId: string;
  name: string;
  details: Record<string, string>;
  productId: string | null;
  price: number | null;
  current: boolean;
  note?: string; // one-line guide for this option, e.g. "12 mm: for shelves and partitions"
};

// "6 mm" before "12 mm": compare by the first number, then as text
const byValue = (a: string, b: string) => {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na !== nb ? na - nb : a.localeCompare(b);
};

// customType: the made-to-measure work type for this product, if any, for an "Order any size" chip
export function VariantPicker({ keys, options, unit, customType }: { keys: string[]; options: VariantOption[]; unit: string; customType?: string }) {
  const router = useRouter();
  const t = useT();
  const current = options.find((o) => o.current);
  if (!current) return null;

  // The option with this value for `key`, keeping the other details where possible
  const target = (key: string, value: string) =>
    options.find((o) => o.details[key] === value && keys.every((k) => k === key || o.details[k] === current.details[k]))
    ?? options.find((o) => o.details[key] === value && o.productId)
    ?? options.find((o) => o.details[key] === value);

  return (
    <section className="flex flex-col gap-4" aria-label={t('Choose a size')}>
      {keys.map((key) => {
        const values = [...new Set(options.map((o) => o.details[key]).filter(Boolean))].sort(byValue);
        if (values.length < 2 && keys.length > 1) return null;
        return (
          <div key={key}>
            <p className="text-[14px] font-semibold">
              {t(key)}: <span className="font-normal text-stone">{current.details[key] ?? t('Not set')}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t(key)}>
              {values.map((v) => {
                const opt = target(key, v);
                const selected = current.details[key] === v;
                const available = !!opt?.productId;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!available && !selected}
                    onClick={() => { if (opt?.productId && !opt.current) router.push(`/product/${opt.productId}`); }}
                    className={`flex min-w-[84px] flex-col items-center rounded-xl border px-3 py-2 text-[14px] transition-colors ${
                      selected ? 'border-ink bg-ink text-sand' : available ? 'border-sand-4 bg-sand-2 hover:border-ink' : 'border-dashed border-sand-4 text-stone opacity-60'
                    }`}
                    title={available ? undefined : t('Not available near you right now')}
                  >
                    <span className="font-semibold">{v}</span>
                    {opt?.price != null
                      ? <span className={`text-[12px] tabular-nums ${selected ? 'text-sand/70' : 'text-stone'}`}>{rupees.format(opt.price)}/{unit}</span>
                      : <span className="text-[12px]">{t('Unavailable')}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {current.note && (
        <p className="flex items-start gap-2 rounded-xl bg-sand-3 px-3 py-2 text-[14px]">
          <span className="material-symbols-outlined mt-0.5 text-[18px] text-tertiary" aria-hidden="true">lightbulb</span>
          <span><span className="font-semibold">{Object.values(current.details).join(', ')}:</span> {current.note}</span>
        </p>
      )}
      {customType && (
        <Link href={`/made-to-measure?type=${customType}`} className="inline-flex items-center gap-1.5 self-start text-[14px] font-semibold text-cobalt hover:underline">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">straighten</span>
          {t('Need a size not shown? Order it made to measure')}
        </Link>
      )}
    </section>
  );
}
