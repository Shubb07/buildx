'use client';

import { useState } from 'react';
import { LocationSelector, useDeliveryServiceability, useSelectedLocation, useT, tx } from '@sthiva/web-core';

type Availability = { deliverable: boolean; reason?: string };

const REASONS: Record<string, string> = {
  PINCODE_NOT_SERVED: tx('This supplier has not set up delivery to this PIN.'),
  SUPPLIER_NOT_AVAILABLE: tx('This supplier is not taking orders right now.'),
  NO_SUPPLIERS: tx('No supplier on Sthiva delivers to this PIN yet.'),
};

function Row({ tone, icon, title, body }: { tone: 'ok' | 'no' | 'wait'; icon: string; title: string; body?: string }) {
  const toneClass = tone === 'ok' ? 'bg-[#E3F4E8] text-tertiary' : tone === 'no' ? 'bg-error-container text-error' : 'bg-sand-3 text-stone';
  return (
    <div className="flex items-start gap-3">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${toneClass}`}>
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{icon}</span>
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[15px] font-semibold leading-snug">{title}</p>
        {body && <p className="mt-0.5 text-[14px] text-stone">{body}</p>}
      </div>
    </div>
  );
}

// Delivery panel for the product and material pages. With `availability` (from the product API
// for the saved PIN) it speaks for that one supplier; without it, for the area as a whole.
// A valid PIN is never presented as deliverable on its own.
export function DeliveryCheck({ availability, title = tx('Delivery to your site') }: { availability?: Availability; title?: string }) {
  const t = useT();
  const location = useSelectedLocation();
  const area = useDeliveryServiceability();
  const [editing, setEditing] = useState(false);
  const showSelector = editing || !location;

  let status: React.ReactNode = null;
  if (location && !editing) {
    if (availability) {
      status = availability.deliverable ? (
        <Row tone="ok" icon="local_shipping" title={t('Delivers to {pin}', { pin: location.pincode })} body={location.label} />
      ) : (
        <Row
          tone="no"
          icon="block"
          title={t('Not deliverable to {pin}', { pin: location.pincode })}
          body={t((availability.reason && REASONS[availability.reason]) || 'This supplier does not deliver to this PIN.')}
        />
      );
    } else if (area.status === 'checking') {
      status = <Row tone="wait" icon="progress_activity" title={t('Checking {pin}', { pin: location.pincode })} />;
    } else if (area.status === 'serviceable') {
      status = (
        <Row
          tone="ok"
          icon="local_shipping"
          title={area.supplierCount === 1 ? t('1 supplier delivers to {pin}', { pin: location.pincode }) : t('{n} suppliers deliver to {pin}', { n: area.supplierCount, pin: location.pincode })}
          body={t('Offers below are filtered to suppliers that deliver to this PIN.')}
        />
      );
    } else if (area.status === 'not-serviceable') {
      status = <Row tone="no" icon="block" title={t('No supplier delivers to {pin} yet', { pin: location.pincode })} body={location.label} />;
    } else if (area.status === 'unavailable') {
      status = <Row tone="wait" icon="cloud_off" title={t('Could not check delivery right now')} body={t('Try again in a moment.')} />;
    }
  }

  return (
    <section className="rounded-2xl border border-sand-4 bg-sand-2 p-5" aria-labelledby="delivery-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="delivery-title" className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="material-symbols-outlined text-[20px] text-stone" aria-hidden="true">pin_drop</span>
          {t(title)}
        </h2>
        {location && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-[14px] font-medium text-cobalt hover:underline">
            {t('Change PIN')}
          </button>
        )}
      </div>
      <div className="mt-4" aria-live="polite">
        {status}
        {showSelector && (
          <div className="[&_button]:min-h-[44px] [&_button]:rounded-full [&_button]:px-4 [&_input]:h-12 [&_input]:rounded-xl">
            {!location && <p className="mb-3 text-[14px] text-stone">{t('Enter your site PIN to see if this can be delivered to you.')}</p>}
            <LocationSelector
              title={t('Site PIN code')}
              className="max-w-none border-0 bg-transparent p-0 sm:p-0"
              onLocationChange={() => setEditing(false)}
            />
          </div>
        )}
      </div>
    </section>
  );
}
