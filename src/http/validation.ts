import type { HotelSearchInput } from '../types/hotel';
import { HttpError } from './errors';

const CITY_PATTERN = /^[a-z][a-z .'-]{0,59}$/;
// Plain decimals only — rejects hex (0x10), exponents (1e3), Infinity, etc.
const PRICE_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

function single(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `Query parameter "${name}" must be provided once`);
  return value;
}

function parsePrice(value: unknown, name: string): number | undefined {
  const raw = single(value, name)?.trim();
  if (raw === undefined || raw === '') return undefined;
  if (!PRICE_PATTERN.test(raw)) {
    throw new HttpError(400, `Query parameter "${name}" must be a non-negative number`);
  }
  return Number(raw);
}

function normalizeCity(value: unknown): string {
  const city = single(value, 'city')?.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!city) throw new HttpError(400, 'Query parameter "city" is required');
  if (!CITY_PATTERN.test(city)) throw new HttpError(400, 'Query parameter "city" contains invalid characters');
  return city;
}

export function parseHotelSearchQuery(query: Record<string, unknown>): HotelSearchInput {
  const city = normalizeCity(query.city);
  const minPrice = parsePrice(query.minPrice, 'minPrice');
  const maxPrice = parsePrice(query.maxPrice, 'maxPrice');
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new HttpError(400, '"minPrice" must be less than or equal to "maxPrice"');
  }
  return { city, minPrice, maxPrice };
}
