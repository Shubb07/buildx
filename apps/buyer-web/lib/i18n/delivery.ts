import type { Vars } from '@sthiva/web-core';

type T = (text: string, vars?: Vars) => string;

// Delivery times come from @sthiva/web-core as English ("Same day", "2 to 3 days", "1 week"...).
// These turn them into the visitor's language. Each form is written out as its own literal t() call
// so the translation test sees it.

/** "2 to 3 days" -> "2 ರಿಂದ 3 ದಿನಗಳು" */
export function deliveryLabelT(t: T, label: string): string {
  let m: RegExpMatchArray | null;
  if (label === 'Same day') return t('Same day');
  if (label === '1 day') return t('1 day');
  if ((m = label.match(/^(\d+) to (\d+) days$/))) return t('{a} to {b} days', { a: m[1], b: m[2] });
  if ((m = label.match(/^(\d+) to (\d+) weeks$/))) return t('{a} to {b} weeks', { a: m[1], b: m[2] });
  if ((m = label.match(/^(\d+) days$/))) return t('{n} days', { n: m[1] });
  if ((m = label.match(/^(\d+) weeks$/))) return t('{n} weeks', { n: m[1] });
  if ((m = label.match(/^Same day to (\d+) days?$/))) return t('Same day to {n} days', { n: m[1] });
  return label;
}

/** "Usually delivered in 2 to 3 days after the supplier accepts", from the English phrase. */
export function usuallyDeliveredT(t: T, phrase: string): string {
  if (phrase === 'the same day or next day') return t('Usually delivered the same day or next day after the supplier accepts');
  if (phrase === 'the same day') return t('Usually delivered the same day after the supplier accepts');
  let m: RegExpMatchArray | null;
  if ((m = phrase.match(/^within (\d+) days?$/))) return t('Usually delivered within {n} days after the supplier accepts', { n: m[1] });
  if ((m = phrase.match(/^in (.+)$/))) return t('Usually delivered in {time} after the supplier accepts', { time: deliveryLabelT(t, m[1]) });
  return t('Usually delivered {time} after the supplier accepts', { time: phrase });
}
