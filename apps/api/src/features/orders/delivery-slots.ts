// Delivery slots (owner decision 2026-11-20): optional, per product. A seller ticks "Offer delivery
// slots" only on listings where a fixed time matters (cement or steel for a pour, a crew waiting).
// A buyer whose whole cart can be delivered in a slot may pick a date and a window; the order then
// only goes to sellers who offer slots on every item and can deliver by that date, both when it is
// placed and when it moves to another seller. Accepting a slot order confirms the slot's date; the
// seller cannot move it (Sthiva's team can help if something goes wrong).
//
// Windows are fixed and the same for everyone, so a buyer never has to compare seller timetables.

import { daysFromToday, istToday } from './delivery-window';

export const SLOT_WINDOWS = {
  MORNING: { label: 'Morning', hours: '7 to 11 am' },
  MIDDAY: { label: 'Midday', hours: '11 am to 3 pm' },
  EVENING: { label: 'Evening', hours: '3 to 7 pm' },
} as const;
export type SlotWindow = keyof typeof SLOT_WINDOWS;
export const SLOT_KEYS = Object.keys(SLOT_WINDOWS) as SlotWindow[];

export type DeliverySlot = { date: string; window: SlotWindow };

/** A slot can be booked from tomorrow up to two weeks ahead */
export const SLOT_MAX_DAYS_AHEAD = 14;

/** Earliest day (days from today) a listing can make: its usual shortest delivery time, at least tomorrow */
export const slotLeadDays = (deliveryDays?: number | null) => Math.max(1, deliveryDays ?? 2);

/** Format and range check; the per-seller lead time is checked when sellers are chosen */
export function checkSlot(slot: DeliverySlot, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date) || Number.isNaN(Date.parse(`${slot.date}T00:00:00Z`))
    || new Date(`${slot.date}T00:00:00Z`).toISOString().slice(0, 10) !== slot.date) return 'Choose a valid delivery date';
  if (!(slot.window in SLOT_WINDOWS)) return 'Choose a delivery time';
  const ahead = daysFromToday(slot.date, now);
  if (ahead < 1) return 'Delivery slots start from tomorrow';
  if (ahead > SLOT_MAX_DAYS_AHEAD) return `Delivery slots can be booked up to ${SLOT_MAX_DAYS_AHEAD} days ahead`;
  return null;
}

/** Days from today to the slot date (IST) */
export const slotDaysAhead = (slot: DeliverySlot, now = new Date()) => daysFromToday(slot.date, now);

/** YYYY-MM-DD n days from today in India */
export function istDayPlus(n: number, now = new Date()): string {
  return new Date(Date.parse(`${istToday(now)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** "Tue, 25 Nov, Morning (7 to 11 am)" */
export function slotLabel(slot: DeliverySlot): string {
  const day = new Date(`${slot.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const w = SLOT_WINDOWS[slot.window];
  return `${day}, ${w.label} (${w.hours})`;
}
