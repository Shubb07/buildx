import { describe, it, expect } from 'vitest';
import { sheetAreaSqFt, pricePerSqFt } from '../lib/sheet-area';

describe('price per square foot for boards', () => {
  it('reads the sheet size from the name or details in any common form', () => {
    expect(sheetAreaSqFt('Century Sainik MR 18mm 8x4')).toBe(32);
    expect(sheetAreaSqFt('Plywood 12 mm 8 x 4 ft')).toBe(32);
    expect(sheetAreaSqFt("Board 8' x 4'")).toBe(32);
    expect(sheetAreaSqFt('Ply 7 X 4 feet')).toBe(28);
    expect(sheetAreaSqFt('Laminate 2440 x 1220 mm')).toBe(32.04);
  });

  it('ignores a thickness alone and things that are not sheets', () => {
    expect(sheetAreaSqFt('Plywood 18mm')).toBeNull();
    expect(sheetAreaSqFt('PPC Cement 50 kg')).toBeNull();
    expect(pricePerSqFt('BAG', 400, 'Cement 8x4')).toBeNull();
  });

  it('works out the price per sq ft, preferring the Size detail', () => {
    expect(pricePerSqFt('SHEET', 2300, 'Sainik 18mm 8x4')).toBe(71.88);
    expect(pricePerSqFt('SHEET', 2800, 'Sainik 18mm', { Size: '7 x 4 ft' })).toBe(100);
    expect(pricePerSqFt('SHEET', 2300, 'Sainik 18mm')).toBeNull();
  });
});
