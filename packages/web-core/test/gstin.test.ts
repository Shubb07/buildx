import { describe, expect, it } from 'vitest';
import { checkGstin, gstinCheckChar, sameGstState } from '../src/gstin';

describe('GSTIN checks', () => {
  it('accepts real GSTINs and reads state and PAN', () => {
    for (const g of ['27AAPFU0939F1ZV', '29AAGCB7383J1Z4', '33AAACH7409R1Z8']) expect(checkGstin(g).ok).toBe(true);
    const r = checkGstin(' 33aaach7409r1z8 ');
    expect(r).toEqual({ ok: true, stateCode: '33', state: 'Tamil Nadu', pan: 'AAACH7409R' });
  });
  it('catches a typing mistake through the check character', () => {
    const r = checkGstin('33AAACH7409R1Z9');
    expect(r.ok).toBe(false);
    expect(gstinCheckChar('33AAACH7409R1Z')).toBe('8');
  });
  it('rejects bad shapes and unknown state codes', () => {
    expect(checkGstin('33AAACH7409R1Z').ok).toBe(false);
    expect(checkGstin('33AAACH7409R1X8').ok).toBe(false);
    expect(checkGstin('45AAACH7409R1Z8').ok).toBe(false);
  });
  it('matches GST state codes to India Post state names', () => {
    expect(sameGstState('33', 'TAMIL NADU')).toBe(true);
    expect(sameGstState('29', 'Karnataka')).toBe(true);
    expect(sameGstState('29', 'Tamil Nadu')).toBe(false);
    expect(sameGstState('21', 'Orissa')).toBe(true);
    expect(sameGstState('26', 'Dadra & Nagar Haveli')).toBe(true);
    expect(sameGstState('35', 'Andaman & Nicobar Islands')).toBe(true);
    expect(sameGstState('37', 'Andhra Pradesh')).toBe(true);
  });
});
