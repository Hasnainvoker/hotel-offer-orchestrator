import { ApplicationFailure, log, proxyActivities } from '@temporalio/workflow';
import { selectBestOffers, type SupplierListing } from '../domain/selectBestOffers';
import {
  SUPPLIERS,
  SUPPLIER_IDS,
  type HotelSearchInput,
  type HotelSearchResult,
  type SupplierFetchStatus,
  type SupplierId,
} from '../types/hotel';
import type { Activities } from './activities';

const { fetchSupplierHotels } = proxyActivities<Activities>({
  startToCloseTimeout: '5 seconds',
  retry: {
    initialInterval: '300 milliseconds',
    backoffCoefficient: 2,
    maximumInterval: '2 seconds',
    maximumAttempts: 3,
  },
});

// Kept short so a Redis outage fails the workflow well inside its 15s timeout.
const { saveHotels, filterHotelsByPrice } = proxyActivities<Activities>({
  startToCloseTimeout: '3 seconds',
  retry: { initialInterval: '200 milliseconds', maximumAttempts: 3 },
});

/**
 * 1. Calls every supplier in parallel.
 * 2. De-duplicates hotels by name, keeping the cheapest offer.
 * 3. Saves the de-duplicated list to Redis.
 * 4. If a price range is requested, filters it inside Redis.
 *
 * A single failing supplier degrades the result instead of failing it;
 * only when every supplier fails does the workflow fail.
 */
export async function hotelOffersWorkflow(input: HotelSearchInput): Promise<HotelSearchResult> {
  const { city, minPrice, maxPrice } = input;

  const settled = await Promise.allSettled(SUPPLIER_IDS.map((id) => fetchSupplierHotels(id, city)));

  const listings: SupplierListing[] = [];
  const suppliers = {} as Record<SupplierId, SupplierFetchStatus>;
  settled.forEach((result, i) => {
    const id = SUPPLIER_IDS[i];
    if (result.status === 'fulfilled') {
      suppliers[id] = 'ok';
      listings.push({ supplier: SUPPLIERS[id], hotels: result.value });
    } else {
      suppliers[id] = 'failed';
      log.warn('Supplier failed after retries; continuing without it', {
        supplier: SUPPLIERS[id],
        city,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  if (listings.length === 0) {
    throw ApplicationFailure.nonRetryable('All suppliers are unavailable', 'AllSuppliersUnavailable');
  }

  const bestOffers = selectBestOffers(listings);
  await saveHotels(city, bestOffers);

  const hasPriceFilter = minPrice !== undefined || maxPrice !== undefined;
  const hotels = hasPriceFilter ? await filterHotelsByPrice(city, minPrice, maxPrice) : bestOffers;

  log.info('Hotel search completed', { city, minPrice, maxPrice, deduped: bestOffers.length, returned: hotels.length });
  return { city, hotels, suppliers };
}
