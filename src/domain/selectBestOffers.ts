// Pure, deterministic logic — safe to import from Temporal workflow code.
import type { HotelOffer, SupplierHotel, SupplierName } from '../types/hotel';

export interface SupplierListing {
  supplier: SupplierName;
  hotels: SupplierHotel[];
}

/** Key used to decide whether two supplier listings are the same hotel. */
export function normalizeHotelName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Returns true when `candidate` should replace `current`.
 * Cheaper price wins; on a price tie the higher commission wins,
 * and if that also ties the first-seen offer is kept (stable).
 */
function isBetterOffer(candidate: HotelOffer, current: HotelOffer): boolean {
  if (candidate.price !== current.price) return candidate.price < current.price;
  return candidate.commissionPct > current.commissionPct;
}

/**
 * De-duplicates hotels across suppliers by name and keeps the best offer
 * for each. The result is sorted by price ascending, then name.
 */
export function selectBestOffers(listings: SupplierListing[]): HotelOffer[] {
  const best = new Map<string, HotelOffer>();

  for (const { supplier, hotels } of listings) {
    for (const hotel of hotels) {
      const key = normalizeHotelName(hotel.name);
      const offer: HotelOffer = {
        name: hotel.name.trim(),
        price: hotel.price,
        supplier,
        commissionPct: hotel.commissionPct,
      };
      const current = best.get(key);
      if (!current || isBetterOffer(offer, current)) {
        best.set(key, offer);
      }
    }
  }

  return [...best.values()].sort(
    (a, b) => a.price - b.price || a.name.localeCompare(b.name),
  );
}
