import { useEffect, useState } from 'react';
import { requireOptionalNativeModule } from 'expo';
import { api } from '../lib/api';

// Live tracking (owner decision 2026-11-16): while a Sthiva driver has a delivery open in the app and
// the order is on the way (picked up until delivered), their position goes to the buyer about every
// 15 seconds. Foreground only: it stops when the app is closed, the screen is left, or the order is
// delivered. The API keeps only the latest position and erases it on delivery.
//
// Older installs were built without the location module: there this reports 'unsupported' instead of
// crashing, so over-the-air updates stay safe for them.

export type ShareState = 'off' | 'unsupported' | 'asking' | 'denied' | 'sharing' | 'error';

type LocationModule = typeof import('expo-location');

function locationModule(): LocationModule | null {
  if (!requireOptionalNativeModule('ExpoLocation')) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-location') as LocationModule;
}

export function useShareLocation(orderId: string | undefined, active: boolean): ShareState {
  const [state, setState] = useState<ShareState>('off');

  useEffect(() => {
    if (!orderId || !active) { setState('off'); return; }
    const Location = locationModule();
    if (!Location) { setState('unsupported'); return; }

    let stopped = false;
    let sub: { remove: () => void } | null = null;
    const stop = () => { stopped = true; sub?.remove(); sub = null; };

    (async () => {
      setState('asking');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (stopped) return;
      if (status !== 'granted') { setState('denied'); return; }
      setState('sharing');
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15_000, distanceInterval: 30 },
        (pos) => {
          api.post(`/delivery/orders/${orderId}/location`, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ...(pos.coords.accuracy != null ? { accuracy: pos.coords.accuracy } : {}),
          }).catch((err) => {
            // 409: the order is no longer on the way; stop sending
            if (err?.response?.status === 409) { stop(); setState('off'); }
          });
        }
      );
      if (stopped) sub.remove();
    })().catch(() => { if (!stopped) setState('error'); });

    return stop;
  }, [orderId, active]);

  return state;
}
