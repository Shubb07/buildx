'use client';

// Optional delivery slot at checkout (API: features/orders/delivery-slots.ts). Shown only when some
// seller can deliver the whole cart in a slot near the buyer's PIN. Standard delivery stays the default.

export type SlotWindow = 'MORNING' | 'MIDDAY' | 'EVENING';
export type DeliverySlot = { date: string; window: SlotWindow };
export type SlotOptions = { available: boolean; earliest?: string; latest?: string };

export const SLOT_WINDOWS: { key: SlotWindow; label: string; hours: string }[] = [
  { key: 'MORNING', label: 'Morning', hours: '7 to 11 am' },
  { key: 'MIDDAY', label: 'Midday', hours: '11 am to 3 pm' },
  { key: 'EVENING', label: 'Evening', hours: '3 to 7 pm' },
];

const day = (date: string, opts: Intl.DateTimeFormatOptions) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' });

/** "Tue, 25 Nov, Morning (7 to 11 am)" */
export function slotText(s: DeliverySlot) {
  const w = SLOT_WINDOWS.find((x) => x.key === s.window)!;
  return `${day(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${w.label} (${w.hours})`;
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && out.length < 15; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function SlotPicker({ options, value, onChange }: {
  options: SlotOptions;
  value: DeliverySlot | null;
  onChange: (slot: DeliverySlot | null) => void;
}) {
  if (!options.available || !options.earliest || !options.latest) return null;
  const dates = datesBetween(options.earliest, options.latest);
  const pick = (patch: Partial<DeliverySlot>) =>
    onChange({ date: patch.date ?? value?.date ?? dates[0], window: patch.window ?? value?.window ?? 'MORNING' });

  return (
    <fieldset className="mt-6 flex flex-col gap-3">
      <legend className="font-semibold">Delivery time</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${value ? 'border-sand-4' : 'border-2 border-ink'}`}>
          <input type="radio" name="delivery-time" checked={!value} onChange={() => onChange(null)} className="mt-1 h-5 w-5 accent-ink" />
          <span>
            <span className="block font-semibold">Standard</span>
            <span className="block text-[14px] text-stone">The seller confirms the delivery date when they accept.</span>
          </span>
        </label>
        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${value ? 'border-2 border-ink' : 'border-sand-4'}`}>
          <input type="radio" name="delivery-time" checked={!!value} onChange={() => pick({})} className="mt-1 h-5 w-5 accent-ink" />
          <span>
            <span className="block font-semibold">Book a delivery slot</span>
            <span className="block text-[14px] text-stone">Pick the day and time. Good when a crew or a slab pour is waiting.</span>
          </span>
        </label>
      </div>

      {value && (
        <div className="flex flex-col gap-3 rounded-xl bg-sand-2 p-4">
          <div>
            <p className="text-[14px] font-medium text-stone">Day</p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Delivery day">
              {dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={value.date === d}
                  onClick={() => pick({ date: d })}
                  className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-2 text-[13px] ${value.date === d ? 'bg-ink text-sand' : 'border border-sand-4 bg-sand hover:border-ink'}`}
                >
                  <span>{day(d, { weekday: 'short' })}</span>
                  <span className="font-display text-[17px] font-semibold">{day(d, { day: 'numeric' })}</span>
                  <span>{day(d, { month: 'short' })}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[14px] font-medium text-stone">Time</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Delivery time window">
              {SLOT_WINDOWS.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  role="radio"
                  aria-checked={value.window === w.key}
                  onClick={() => pick({ window: w.key })}
                  className={`rounded-xl px-4 py-3 text-left ${value.window === w.key ? 'bg-ink text-sand' : 'border border-sand-4 bg-sand hover:border-ink'}`}
                >
                  <span className="block font-semibold">{w.label}</span>
                  <span className="block text-[13px] opacity-80">{w.hours}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-[13px] text-stone">
            Only sellers who promise slots get this order, so the price can differ from standard delivery. You can cancel until the seller sends it out.
          </p>
        </div>
      )}
    </fieldset>
  );
}
