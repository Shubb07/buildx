// Whether a listing can be ordered right now. A seller can pause one listing until a date (stock
// coming, festival, transporter strike) without touching the rest of the shop. While paused, buyers
// don't see that seller's listing, and Sthiva gives orders for that item to other sellers. It comes
// back by itself at the start of that day (IST); nothing has to run for that to happen.

/** Query fragment: not paused at `now` (also matches listings that were never paused) */
export const notPaused = (now = new Date()) => ({ pausedUntil: { $not: { $gt: now } } });

/** Query fragment: live and orderable now */
export const orderable = (now = new Date()) => ({ status: 'ACTIVE' as const, ...notPaused(now) });

export const isPaused = (p: { pausedUntil?: Date | string | null }, now = new Date()) =>
  !!p.pausedUntil && new Date(p.pausedUntil).getTime() > now.getTime();
