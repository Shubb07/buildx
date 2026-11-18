'use client';

import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

// Free map for the Sthiva websites (owner decision 2026-11-16: free location and maps).
// MapLibre GL (open source) draws OpenFreeMap tiles built from OpenStreetMap: no key, no request
// limit, business use allowed; the "© OpenStreetMap" credit must stay visible (it is in the style).
// The map library is loaded only when a map is shown, so pages without a map stay light.

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// MapLibre 5 ships one file with its worker built in (version 6 splits it into files Next.js does not
// serve). Bundlers hand it over either as the module itself or under `default`.
type Maplibre = typeof import('maplibre-gl');
const loadMaplibre = () =>
  import('maplibre-gl').then((m) => ((m as unknown as { default?: Maplibre }).default ?? m) as Maplibre);

export type MapPoint ={ lat: number; lng: number; kind: 'driver' | 'site' | 'shop'; label: string };

const COLORS: Record<MapPoint['kind'], { bg: string; fg: string; icon: string }> = {
  driver: { bg: '#F3B806', fg: '#0B0C0A', icon: 'local_shipping' },
  site: { bg: '#0B0C0A', fg: '#F3B806', icon: 'home_pin' },
  shop: { bg: '#2457FF', fg: '#FFFFFF', icon: 'storefront' },
};

function markerEl(p: MapPoint) {
  const c = COLORS[p.kind];
  const el = document.createElement('div');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', p.label);
  el.title = p.label;
  el.style.cssText = `width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:${c.bg};color:${c.fg};border:3px solid #fff;box-shadow:0 4px 14px rgba(11,12,10,.35)`;
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.style.fontSize = '20px';
  icon.textContent = c.icon;
  el.appendChild(icon);
  return el;
}

/**
 * A small map with markers, fitted to show all of them. With `onPick`, a tap (or dragging the shop
 * marker) reports the chosen point, e.g. for a supplier marking their shop or yard.
 */
export function SiteMap({ points, onPick, height = 260, className = '' }: {
  points: MapPoint[];
  onPick?: (p: { lat: number; lng: number }) => void;
  height?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<import('maplibre-gl').Map | null>(null);
  const markers = useRef<import('maplibre-gl').Marker[]>([]);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [failed, setFailed] = useState(false);
  const key = points.map((p) => `${p.kind}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');

  // Create the map once
  useEffect(() => {
    let cancelled = false;
    loadMaplibre().then((maplibregl) => {
      if (cancelled || !box.current) return;
      const first = points[0] ?? { lat: 20.6, lng: 78.9 };
      const m = new maplibregl.Map({
        container: box.current,
        style: MAP_STYLE,
        center: [first.lng, first.lat],
        zoom: points.length ? 13 : 4,
        attributionControl: { compact: true },
        cooperativeGestures: true, // one finger scrolls the page on phones; two fingers move the map
      });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      // Small errors (one missing tile) are normal; only a map that never loads counts as failed
      let loaded = false;
      m.on('load', () => { loaded = true; setFailed(false); });
      m.on('error', (e: { error?: Error }) => { if (!loaded) { setFailed(true); console.warn('[map]', e.error?.message); } });
      if (pick.current) m.on('click', (e: import('maplibre-gl').MapMouseEvent) => pick.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
      map.current = m;
    }).catch(() => setFailed(true));
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Place the markers and fit them in view whenever they move
  useEffect(() => {
    let cancelled = false;
    const place = async () => {
      const maplibregl = await loadMaplibre();
      for (let i = 0; i < 40 && !map.current && !cancelled; i++) await new Promise((r) => setTimeout(r, 50));
      const m = map.current;
      if (!m || cancelled) return;
      markers.current.forEach((mk) => mk.remove());
      markers.current = points.map((p) => {
        const mk = new maplibregl.Marker({ element: markerEl(p), draggable: !!pick.current && p.kind === 'shop' })
          .setLngLat([p.lng, p.lat]).addTo(m);
        if (pick.current && p.kind === 'shop') mk.on('dragend', () => { const ll = mk.getLngLat(); pick.current?.({ lat: ll.lat, lng: ll.lng }); });
        return mk;
      });
      if (points.length === 1) m.easeTo({ center: [points[0].lng, points[0].lat], zoom: Math.max(m.getZoom(), 14) });
      if (points.length > 1) {
        const lngs = points.map((p) => p.lng), lats = points.map((p) => p.lat);
        m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 48, left: 48, right: 56, bottom: 84 }, maxZoom: 15, duration: 600 });
      }
    };
    place().catch(() => setFailed(true));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-sand-4 bg-sand-3 ${className}`} style={{ height }}>
      {/* MapLibre makes this box position:relative, so it is sized with width and height, not inset */}
      <div ref={box} style={{ width: '100%', height: '100%' }} />
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-4 text-center text-[14px] text-stone">The map could not load. Check your connection.</p>
      )}
    </div>
  );
}
