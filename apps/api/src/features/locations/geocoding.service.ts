import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';
import { PostalDataset } from '../../infrastructure/database/models/PostalDataset.model';
import { PostalOffice } from '../../infrastructure/database/models/PostalOffice.model';

// Turns a buyer's optional GPS position into a candidate PIN code (the buyer always confirms it).
// Free first (owner decision 2026-11-16): the nearest post office with coordinates in our own copy of
// the India Post directory (data.gov.in, GODL). No key, no limits, nothing leaves our server.
// Google's Geocoding API is used only as a fallback, and only if GOOGLE_MAPS_API_KEY is set.
// Neither the key nor the coordinates are logged.

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 5000;
/** A post office farther than this is not trusted as "your" PIN */
export const MAX_POST_OFFICE_KM = 20;

export class GeocoderUnavailable extends Error {
  constructor(reason: 'NOT_CONFIGURED' | 'PROVIDER_ERROR' | 'TIMEOUT') {
    super(reason);
    this.name = 'GeocoderUnavailable';
  }
}

export type ReverseGeocodeResult =
  | { status: 'OK'; pincode: string; countryCode: string; locality?: string; district?: string; state?: string; source?: 'INDIA_POST' | 'GOOGLE' }
  | { status: 'NO_RESULT' };

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/**
 * Nearest post office (with coordinates) to a point, from the active India Post directory.
 * Searches a growing box (about 5, 11, 22 km) so dense cities stay quick. Null when none is near
 * or no directory is loaded.
 */
export async function nearestPostOffice(lat: number, lng: number) {
  const dataset = await PostalDataset.findOne({ active: true }).select('version').lean();
  if (!dataset) return null;
  for (const deg of [0.05, 0.1, 0.2]) {
    const offices = await PostalOffice.find({
      datasetVersion: dataset.version,
      'location.lat': { $gte: lat - deg, $lte: lat + deg },
      'location.lng': { $gte: lng - deg, $lte: lng + deg },
    }).select('pincode officeName district state location deliveryStatus').limit(500).lean();
    if (!offices.length) continue;
    // Nearest first; at equal distance prefer an office that delivers mail
    const ranked = offices
      .map((o) => ({ o, d: km({ lat, lng }, o.location!) }))
      .sort((a, b) => a.d - b.d || Number(/^delivery$/i.test(b.o.deliveryStatus ?? '')) - Number(/^delivery$/i.test(a.o.deliveryStatus ?? '')));
    const best = ranked[0];
    if (best.d <= MAX_POST_OFFICE_KM) return { ...best.o, distanceKm: Math.round(best.d * 10) / 10 };
  }
  return null;
}

type GoogleComponent = { long_name: string; short_name: string; types: string[] };
type GoogleResponse = { status: string; results?: { address_components: GoogleComponent[] }[] };

const component = (components: GoogleComponent[], type: string) => components.find((c) => c.types.includes(type));

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  // 1. Free: our own India Post directory
  let directoryLoaded = true;
  try {
    const office = await nearestPostOffice(lat, lng);
    if (office) {
      return { status: 'OK', source: 'INDIA_POST', pincode: office.pincode, countryCode: 'IN', locality: office.officeName, district: office.district, state: office.state };
    }
    directoryLoaded = !!(await PostalDataset.exists({ active: true }));
  } catch {
    directoryLoaded = false;
  }

  // 2. Optional paid fallback
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    if (directoryLoaded) return { status: 'NO_RESULT' };
    throw new GeocoderUnavailable('NOT_CONFIGURED');
  }

  const url = new URL(GEOCODE_URL);
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('result_type', 'postal_code');
  url.searchParams.set('language', 'en');
  url.searchParams.set('key', key);

  let body: GoogleResponse;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      logger.warn('[geocode] provider HTTP error', { httpStatus: res.status });
      throw new GeocoderUnavailable('PROVIDER_ERROR');
    }
    body = (await res.json()) as GoogleResponse;
  } catch (err) {
    if (err instanceof GeocoderUnavailable) throw err;
    const timedOut = (err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError';
    logger.warn('[geocode] provider request failed', { reason: timedOut ? 'timeout' : (err as Error)?.name });
    throw new GeocoderUnavailable(timedOut ? 'TIMEOUT' : 'PROVIDER_ERROR');
  }

  if (body.status === 'ZERO_RESULTS') return { status: 'NO_RESULT' };
  if (body.status !== 'OK') {
    // OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, UNKNOWN_ERROR: only the status is logged
    logger.warn('[geocode] provider status', { status: body.status });
    throw new GeocoderUnavailable('PROVIDER_ERROR');
  }

  for (const result of body.results ?? []) {
    const postal = component(result.address_components, 'postal_code');
    const country = component(result.address_components, 'country');
    if (!postal || !country) continue;
    return {
      status: 'OK',
      source: 'GOOGLE',
      pincode: postal.long_name.replace(/\s/g, ''),
      countryCode: country.short_name,
      locality: (component(result.address_components, 'locality') ?? component(result.address_components, 'sublocality'))?.long_name,
      district: component(result.address_components, 'administrative_area_level_3')?.long_name
        ?? component(result.address_components, 'administrative_area_level_2')?.long_name,
      state: component(result.address_components, 'administrative_area_level_1')?.long_name,
    };
  }
  return { status: 'NO_RESULT' };
}
