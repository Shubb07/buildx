'use client';

import { useRouter } from 'next/navigation';
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
};

// "6 mm" before "12 mm": compare by the first number, then as text
const byValue = (a: string, b: string) => {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na !== nb ? na - nb : a.localeCompare(b);
};

export function VariantPicker({ keys, options, unit }: { keys: string[]; options: VariantOption[]; unit: string }) {
  const router = useRouter();
  const current = options.find((o) => o.current);
  if (!current) return null;

  // The option with this value for `key`, keeping the other details where possible
  const target = (key: string, value: string) =>
    options.find((o) => o.details[key] === value && keys.every((k) => k === key || o.details[k] === current.details[k]))
    ?? options.find((o) => o.details[key] === value && o.productId)
    ?? options.find((o) => o.details[key] === value);

  return (
    <section className="flex flex-col gap-4" aria-label="Choose a size">
      {keys.map((key) => {
        const values = [...new Set(options.map((o) => o.details[key]).filter(Boolean))].sort(byValue);
        if (values.length < 2 && keys.length > 1) return null;
        return (
          <div key={key}>
            <p className="text-[14px] font-semibold">
              {key}: <span className="font-normal text-stone">{current.details[key] ?? 'Not set'}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={key}>
              {values.map((v) => {
                const t = target(key, v);
                const selected = current.details[key] === v;
                const available = !!t?.productId;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!available && !selected}
                    onClick={() => { if (t?.productId && !t.current) router.push(`/product/${t.productId}`); }}
                    className={`flex min-w-[84px] flex-col items-center rounded-xl border px-3 py-2 text-[14px] transition-colors ${
                      selected ? 'border-ink bg-ink text-sand' : available ? 'border-sand-4 bg-sand-2 hover:border-ink' : 'border-dashed border-sand-4 text-stone opacity-60'
                    }`}
                    title={available ? undefined : 'Not available near you right now'}
                  >
                    <span className="font-semibold">{v}</span>
                    {t?.price != null
                      ? <span className={`text-[12px] tabular-nums ${selected ? 'text-sand/70' : 'text-stone'}`}>{rupees.format(t.price)}/{unit}</span>
                      : <span className="text-[12px]">Unavailable</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
