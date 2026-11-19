'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApiClient, useT } from '@sthiva/web-core';
import { fetchSupplierOrders, type SupplierOrder } from '../lib/orders';

// New orders must not go unseen: an offer that is not answered in time moves to another supplier.
// While the seller website is open (any page), this checks for new offers every 20 seconds and:
//   - shows a banner with the count and the time left, on every page
//   - rings, and keeps ringing every 15 seconds until every offer is answered (like restaurant
//     partner apps), if the seller turned the sound on (browsers only play sound after a tap)
//   - puts the count in the browser tab title, and shows a system notification if the tab is in
//     the background and the seller allowed notifications
// The orders page listens for OFFERS_CHANGED to refresh itself.

export const OFFERS_CHANGED = 'sthiva:offers-changed';
const EVERY_MS = 20_000;
const RING_EVERY_MS = 15_000;
const SOUND_KEY = 'sthiva.orderSound';

const readSound = () => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };
const saveSound = (on: boolean) => { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* private mode */ } };

/** A short two-tone chime, three times. Made with Web Audio, so there is no sound file to load. */
function ring(ctx: AudioContext) {
  const start = ctx.currentTime + 0.02;
  for (let i = 0; i < 3; i++) {
    for (const [freq, at] of [[880, 0], [1320, 0.16]] as const) {
      const t = start + i * 0.6 + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    }
  }
}

const isLiveOffer = (o: SupplierOrder) =>
  o.status === 'PENDING' && o.allocation?.state === 'OFFERED' && (!o.allocation.expiresAt || Date.parse(o.allocation.expiresAt) > Date.now());

export function NewOrderWatcher() {
  const client = useApiClient();
  const t = useT();
  const [offers, setOffers] = useState<SupplierOrder[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [, tick] = useState(0);
  const ctx = useRef<AudioContext | null>(null);
  const known = useRef<Set<string> | null>(null);

  useEffect(() => setSoundOn(readSound()), []);

  // Browsers allow sound only after the person taps the page once; unlock on the first tap
  useEffect(() => {
    const unlock = () => {
      if (!ctx.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) ctx.current = new Ctor();
      }
      void ctx.current?.resume().then(() => setAudioReady(true));
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  const play = useCallback(() => {
    if (soundOn && ctx.current && ctx.current.state === 'running') ring(ctx.current);
  }, [soundOn]);

  // Check for offers
  useEffect(() => {
    let live = true;
    const check = () => {
      fetchSupplierOrders(client, { status: 'PENDING' })
        .then(({ data }) => {
          if (!live) return;
          const now = data.filter(isLiveOffer);
          const ids = new Set(now.map((o) => o._id));
          const fresh = known.current ? now.filter((o) => !known.current!.has(o._id)) : [];
          const changed = !known.current || ids.size !== known.current.size || fresh.length > 0;
          known.current = ids;
          setOffers(now);
          if (changed) window.dispatchEvent(new Event(OFFERS_CHANGED));
          if (fresh.length) {
            play();
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(t('New Sthiva order'), { body: fresh.length === 1 ? t('An order is waiting for your answer.') : t('{n} orders are waiting for your answer.', { n: fresh.length }), tag: 'sthiva-offer' });
            }
          }
        })
        .catch(() => undefined);
    };
    check();
    const id = setInterval(check, EVERY_MS);
    return () => { live = false; clearInterval(id); };
  }, [client, play, t]);

  // Keep ringing while anything waits; refresh the minutes shown
  useEffect(() => {
    if (!offers.length) return;
    const ringId = setInterval(play, RING_EVERY_MS);
    const tickId = setInterval(() => tick((n) => n + 1), 30_000);
    return () => { clearInterval(ringId); clearInterval(tickId); };
  }, [offers.length, play]);

  // Count in the tab title
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = offers.length ? `(${offers.length}) ${base}` : base;
  }, [offers.length]);

  if (!offers.length) return null;
  const soonest = Math.min(...offers.map((o) => (o.allocation?.expiresAt ? Date.parse(o.allocation.expiresAt) : Infinity)));
  const minutes = Number.isFinite(soonest) ? Math.max(1, Math.round((soonest - Date.now()) / 60000)) : null;
  const toggleSound = () => { const next = !soundOn; setSoundOn(next); saveSound(next); };
  const askNotifications = () => { if ('Notification' in window) void Notification.requestPermission().then(() => tick((n) => n + 1)); };

  return (
    <div role="alert" className="sticky top-0 z-40 border-b border-ink bg-lime text-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <span className="material-symbols-outlined text-[24px]" aria-hidden="true">notifications_active</span>
        <p className="text-[15px] font-semibold">
          {offers.length === 1 ? t('1 new order is waiting') : t('{n} new orders are waiting', { n: offers.length })}
          {minutes !== null && <span className="font-normal"> · {t('answer within {m} min or it goes to another seller', { m: minutes })}</span>}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {soundOn && !audioReady && <span className="text-[13px]">{t('Tap anywhere to allow the ring')}</span>}
          <button type="button" onClick={toggleSound} aria-pressed={soundOn} className="rounded-full border border-ink px-3 py-1.5 text-[13px] font-medium">
            {soundOn ? t('Sound on') : t('Sound off')}
          </button>
          {'Notification' in globalThis && typeof Notification !== 'undefined' && Notification.permission === 'default' && (
            <button type="button" onClick={askNotifications} className="rounded-full border border-ink px-3 py-1.5 text-[13px] font-medium">{t('Alert me in other tabs')}</button>
          )}
          <Link href="/orders" className="rounded-full bg-ink px-4 py-1.5 text-[14px] font-semibold text-lime">{t('Answer now')}</Link>
        </div>
      </div>
    </div>
  );
}
