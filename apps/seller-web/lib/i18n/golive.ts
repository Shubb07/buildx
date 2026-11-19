import { tx, type Vars } from '@sthiva/web-core';

type T = (text: string, vars?: Vars) => string;

// The go-live steps come from the API in English (apps/api/src/features/suppliers/go-live.ts). These
// are their fixed texts, marked for translation; the ones with a number or a masked account are matched
// by pattern. Anything new from the API shows in English until it is added here.
export const GO_LIVE_TEXTS = [
  tx('Business details'), tx('Delivery area'), tx('What you sell'), tx('Verification papers'), tx('Payout account'),
  tx('Seller agreement'), tx('Your products'),
  tx('Name, type, address and shop location saved.'), tx('Your business name, type, address and where your shop is.'),
  tx('The PIN codes you deliver to.'), tx('Categories and brands saved.'), tx('Your categories and the brands you deal in.'),
  tx('Accepted by Sthiva.'), tx('Uploaded. Sthiva is checking them.'), tx('A paper was not accepted. Upload a clear copy again.'),
  tx('GST certificate, and a shop licence or Udyam certificate.'),
  tx('A shop licence or Udyam certificate (and the GST certificate if you have a GSTIN).'),
  tx('The bank account or UPI ID where Sthiva pays you.'), tx('Not accepted. Add it again.'),
  tx('Accepted.'), tx('The agreement was updated. Read and accept the new version.'), tx('Read and accept how selling on Sthiva works.'),
  tx('List what you sell, with your price and stock.'),
  tx('You are live. Buyers can order your products.'), tx('Verification was not approved. Contact Sthiva support.'),
  tx('Everything is in. Sthiva checks your details, usually within one working day.'),
  tx('Finish the steps above. Sthiva checks your details once they are in.'),
];

/** A go-live label or detail in the visitor's language. */
export function goLiveText(t: T, text: string): string {
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^(\d+) PIN codes? added\.$/))) return m[1] === '1' ? t('1 PIN code added.') : t('{n} PIN codes added.', { n: m[1] });
  if ((m = text.match(/^(\d+) listed\.$/))) return t('{n} listed.', { n: m[1] });
  if ((m = text.match(/^Verified: (.+)\.$/))) return t('Verified: {account}.', { account: m[1] });
  if ((m = text.match(/^Added \((.+)\)\. Sthiva is checking it\.$/))) return t('Added ({account}). Sthiva is checking it.', { account: m[1] });
  return t(text);
}
