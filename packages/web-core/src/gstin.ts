// GSTIN checks that need no paid service (owner decision 2026-11-10: "free first").
// A GSTIN is: 2-digit state code, the 10-character PAN, entity number, 'Z', and a check character
// computed from the first 14 (mod 36). A wrong check character means a typing mistake.
// Same rules as apps/api/src/shared/gstin.ts: keep the two in step.

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// GST state codes (25 and 28 are older codes still found on certificates)
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinCheck =
  | { ok: true; stateCode: string; state: string; pan: string }
  | { ok: false; problem: string };

export function checkGstin(raw: string): GstinCheck {
  const g = raw.trim().toUpperCase();
  if (g.length !== 15) return { ok: false, problem: 'A GSTIN has 15 characters.' };
  if (!GSTIN_RE.test(g)) return { ok: false, problem: 'This does not look like a GSTIN. Copy it from your GST certificate.' };
  const state = GST_STATES[g.slice(0, 2)];
  if (!state) return { ok: false, problem: `The first two digits (${g.slice(0, 2)}) are not a GST state code.` };
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) {
    return { ok: false, problem: 'This GSTIN has a typing mistake (the last character does not match). Check it against your GST certificate.' };
  }
  return { ok: true, stateCode: g.slice(0, 2), state, pan: g.slice(2, 12) };
}

const ALIASES: Record<string, string> = { orissa: 'odisha', pondicherry: 'puducherry', uttaranchal: 'uttarakhand' };
const norm = (s: string) => {
  const n = s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
  return ALIASES[n] ?? n;
};

// Does a state name from the India Post directory match a GST state code?
export function sameGstState(stateCode: string, postalState: string): boolean {
  const p = norm(postalState);
  if (stateCode === '25' || stateCode === '26') return p.includes('dadra') || p.includes('daman');
  if (stateCode === '28' || stateCode === '37') return p === 'andhrapradesh';
  const g = GST_STATES[stateCode];
  return !!g && norm(g) === p;
}
