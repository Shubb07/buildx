import type { Vars } from '../i18n/core';

type T = (text: string, vars?: Vars) => string;

// PIN and location messages are made in English by lookup.ts, pincode.ts and hooks.ts (some with the PIN
// inside). This turns them into the visitor's language. Each form is its own literal t() call so the
// sites' translation tests see it; unknown text is shown as it is.
export function locationMessageT(t: T, message: string): string {
  let m: RegExpMatchArray | null;
  if ((m = message.match(/^Sthiva doesn't deliver to (\d{6}) yet\. You can still browse products\.$/))) return t("Sthiva doesn't deliver to {pin} yet. You can still browse products.", { pin: m[1] });
  if ((m = message.match(/^Sthiva doesn't deliver to (\d{6}) yet\.$/))) return t("Sthiva doesn't deliver to {pin} yet.", { pin: m[1] });
  if ((m = message.match(/^PIN code (\d{6}) isn't in the India Post directory\. Please check it\.$/))) return t("PIN code {pin} isn't in the India Post directory. Please check it.", { pin: m[1] });
  if ((m = message.match(/^PIN code (\d{6}) isn't in the India Post directory\.$/))) return t("PIN code {pin} isn't in the India Post directory.", { pin: m[1] });
  switch (message) {
    case "Couldn't confirm delivery right now": return t("Couldn't confirm delivery right now.");
    case 'Enter a valid 6-digit PIN code': return t('Enter a valid 6-digit PIN code');
    case 'Enter your 6-digit PIN code': return t('Enter your 6-digit PIN code');
    case 'A PIN code can only contain digits': return t('A PIN code can only contain digits');
    case 'A PIN code has exactly 6 digits': return t('A PIN code has exactly 6 digits');
    case "Your browser can't share its location. Please enter your PIN code.": return t("Your browser can't share its location. Please enter your PIN code.");
    case 'Location can only be used on a secure (https) page. Please enter your PIN code.': return t('Location can only be used on a secure (https) page. Please enter your PIN code.');
    case 'Location permission was denied. You can enter your PIN code instead.': return t('Location permission was denied. You can enter your PIN code instead.');
    case "We couldn't get your location. Please enter your PIN code.": return t("We couldn't get your location. Please enter your PIN code.");
    case 'Finding your location took too long. Please enter your PIN code.': return t('Finding your location took too long. Please enter your PIN code.');
    case 'Your location appears to be outside India. Please enter your delivery PIN code.': return t('Your location appears to be outside India. Please enter your delivery PIN code.');
    case "We couldn't find a PIN code for your location. Please enter it manually.": return t("We couldn't find a PIN code for your location. Please enter it manually.");
    case 'Too many location requests. Please enter your PIN code.': return t('Too many location requests. Please enter your PIN code.');
    case "We couldn't look up your location right now. Please enter your PIN code.": return t("We couldn't look up your location right now. Please enter your PIN code.");
    case "We couldn't check delivery for this PIN right now. You can retry, or keep browsing — delivery will be confirmed at checkout.":
      return t("We couldn't check delivery for this PIN right now. You can retry, or keep browsing — delivery will be confirmed at checkout.");
    default: return message;
  }
}
