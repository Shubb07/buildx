'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useApiClient, useT } from '@sthiva/web-core';

// Free map (MapLibre + OpenFreeMap), loaded only when a position is shown
const SiteMap = dynamic(() => import('@sthiva/web-core/src/location/SiteMap').then((m) => m.SiteMap), {
  ssr: false,
  loading: () => <div className="skeleton h-[260px] rounded-2xl" aria-hidden="true" />,
});
import { fetchTracking, type Tracking } from '@/lib/orders';

// While the order is on the way, where the driver is (shared by the driver app only from pickup
// until delivered). Checks every 15 seconds while the page is open and visible.
const EVERY_MS = 15_000;

function ago(iso: string, now: number, t: ReturnType<typeof useT>) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return t('{n} seconds ago', { n: s });
  const m = Math.round(s / 60);
  return m === 1 ? t('1 minute ago') : t('{n} minutes ago', { n: m });
}

export function LiveTracking({ orderId, onStatusChange }: { orderId: string; onStatusChange?: (status: string) => void }) {
  const client = useApiClient();
  const t = useT();
  const [track, setT] = useState<Tracking | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Kept in a ref so a new callback each render does not restart the polling
  const onChange = useRef(onStatusChange);
  onChange.current = onStatusChange;

  useEffect(() => {
    let cancelled = false;
    let lastStatus: string | null = null;
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      fetchTracking(client, orderId)
        .then((data) => {
          if (cancelled) return;
          setT(data);
          if (lastStatus && data.status !== lastStatus) onChange.current?.(data.status);
          lastStatus = data.status;
        })
        .catch(() => undefined);
    };
    load();
    const poll = setInterval(load, EVERY_MS);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    document.addEventListener('visibilitychange', load);
    return () => { cancelled = true; clearInterval(poll); clearInterval(tick); document.removeEventListener('visibilitychange', load); };
  }, [client, orderId]);

  if (!track) return null;
  const loc = track.sharing ? track.location : undefined;

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="tracking-title" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3" aria-hidden="true">
          {loc && !track.stale && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-75" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${loc && !track.stale ? 'bg-tertiary' : 'bg-sand-4'}`} />
        </span>
        <h2 id="tracking-title" className="font-display text-xl font-semibold tracking-tight">{t('On the way')}</h2>
      </div>
      {loc ? (
        <>
          <p className="mt-3 text-[16px]">
            {track.distanceKm !== undefined
              ? (track.distanceKm < 1 ? t('The driver is less than 1 km from your site.') : t('The driver is about {km} km from your site.', { km: track.distanceKm }))
              : t('The driver is on the way to your site.')}
          </p>
          <p className="mt-1 text-[14px] text-stone">
            {track.stale ? t("Last position {ago}. The driver's phone may be out of signal.", { ago: ago(loc.at, now, t) }) : t('Updated {ago}.', { ago: ago(loc.at, now, t) })} {t('Straight-line distance; the road can be longer.')}
          </p>
          <SiteMap
            className="mt-4"
            points={[
              { lat: loc.lat, lng: loc.lng, kind: 'driver', label: t('Driver') },
              ...(track.site ? [{ lat: track.site.lat, lng: track.site.lng, kind: 'site' as const, label: t('Your site') }] : []),
            ]}
          />
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost mt-4"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">map</span>
            {t('Open in Google Maps')}
          </a>
        </>
      ) : (
        <p className="mt-3 text-[15px] text-stone">
          {t('The live position appears here once the driver opens the delivery in the Sthiva Driver app. Their location is shared only until your order is delivered.')}
        </p>
      )}
    </section>
  );
}
