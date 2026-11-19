// Boards sold by the sheet (plywood, MDF, laminate, cement board) are compared by price per square
// foot in the trade. The sheet size comes from the listing's name or details: "8x4", "8 x 4 ft",
// "8' x 4'", "2440 x 1220 mm". A single number such as "18mm" is a thickness and is ignored.

const SQFT_PER_SQMM = 1 / 92903.04;

/** Area of one sheet in square feet, or null when no size is given */
export function sheetAreaSqFt(...texts: (string | undefined | null)[]): number | null {
  for (const text of texts) {
    if (!text) continue;
    const t = text.replace(/[′’']/g, "'").toLowerCase();
    // Millimetres: 2440 x 1220 mm
    const mm = /(\d{3,4}(?:\.\d+)?)\s*(?:mm)?\s*[x×*]\s*(\d{3,4}(?:\.\d+)?)\s*mm/.exec(t);
    if (mm) {
      const a = Number(mm[1]) * Number(mm[2]) * SQFT_PER_SQMM;
      if (a > 1 && a < 200) return Math.round(a * 100) / 100;
    }
    // Feet: 8x4, 8 x 4 ft, 8' x 4', 7 X 4 feet
    const ft = /(?:^|[^\d.])(\d{1,2}(?:\.\d+)?)\s*(?:'|ft|feet)?\s*[x×*]\s*(\d{1,2}(?:\.\d+)?)\s*(?:'|ft|feet)?(?![\d.]|\s*mm)/.exec(t);
    if (ft) {
      const a = Number(ft[1]) * Number(ft[2]);
      if (a >= 4 && a <= 120) return a;
    }
  }
  return null;
}

/** Price per square foot for a sheet listing, or null when it is not a sheet or the size is unknown */
export function pricePerSqFt(unit: string, price: number, name: string, specs?: Record<string, string> | null): number | null {
  if (unit !== 'SHEET') return null;
  const area = sheetAreaSqFt(specs?.Size, specs?.size, specs?.Dimensions, name);
  return area ? Math.round((price / area) * 100) / 100 : null;
}
