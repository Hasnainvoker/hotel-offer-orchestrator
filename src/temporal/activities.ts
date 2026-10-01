import { ApplicationFailure, log } from '@temporalio/activity';
import { config } from '../config';
import type { HotelStore } from '../redis/hotelStore';
import { SUPPLIERS, type HotelOffer, type SupplierHotel, type SupplierId } from '../types/hotel';

function isSupplierHotel(value: unknown): value is SupplierHotel {
  const h = value as SupplierHotel;
  return (
    typeof h === 'object' &&
    h !== null &&
    typeof h.name === 'string' &&
    h.name.trim() !== '' &&
    typeof h.price === 'number' &&
    Number.isFinite(h.price) &&
    h.price >= 0 &&
    typeof h.commissionPct === 'number' &&
    Number.isFinite(h.commissionPct)
  );
}

export function createActivities(store: HotelStore) {
  return {
    /**
     * Fetches one supplier's hotels for a city. 5xx/network errors are thrown
     * as retryable failures (Temporal retries them per the workflow's policy);
     * 4xx and malformed payloads are non-retryable.
     */
    async fetchSupplierHotels(supplierId: SupplierId, city: string): Promise<SupplierHotel[]> {
      const url = new URL(config.suppliers[supplierId]);
      url.searchParams.set('city', city);
      const supplier = SUPPLIERS[supplierId];
      const started = Date.now();

      let response: Response;
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(config.suppliers.timeoutMs) });
      } catch (err) {
        log.warn('Supplier request failed', { supplier, city, error: (err as Error).message });
        throw ApplicationFailure.retryable(`${supplier} unreachable: ${(err as Error).message}`, 'SupplierUnavailable');
      }

      if (!response.ok) {
        log.warn('Supplier returned error status', { supplier, city, status: response.status });
        const message = `${supplier} responded with HTTP ${response.status}`;
        throw response.status >= 500 || response.status === 429
          ? ApplicationFailure.retryable(message, 'SupplierUnavailable')
          : ApplicationFailure.nonRetryable(message, 'SupplierBadRequest');
      }

      const body: unknown = await response.json().catch(() => undefined);
      if (!Array.isArray(body)) {
        throw ApplicationFailure.nonRetryable(`${supplier} returned a non-array payload`, 'SupplierBadPayload');
      }

      const hotels = body.filter(isSupplierHotel);
      if (hotels.length !== body.length) {
        log.warn('Dropped malformed supplier records', { supplier, dropped: body.length - hotels.length });
      }
      // Suppliers are expected to filter by city, but don't trust them to.
      const inCity = hotels.filter((h) => typeof h.city !== 'string' || h.city.toLowerCase() === city);

      log.info('Fetched supplier hotels', { supplier, city, count: inCity.length, ms: Date.now() - started });
      return inCity;
    },

    async saveHotels(city: string, hotels: HotelOffer[]): Promise<void> {
      await store.saveHotels(city, hotels);
      log.info('Saved de-duplicated hotels to Redis', { city, count: hotels.length });
    },

    async filterHotelsByPrice(city: string, minPrice?: number, maxPrice?: number): Promise<HotelOffer[]> {
      const hotels = await store.findByPriceRange(city, minPrice, maxPrice);
      log.info('Filtered hotels by price in Redis', { city, minPrice, maxPrice, count: hotels.length });
      return hotels;
    },
  };
}

export type Activities = ReturnType<typeof createActivities>;
