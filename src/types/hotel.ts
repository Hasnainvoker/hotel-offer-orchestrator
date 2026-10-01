/** Raw hotel record as returned by a supplier API. */
export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

/** Best offer for a hotel after de-duplication — this is the public API shape. */
export interface HotelOffer {
  name: string;
  price: number;
  supplier: SupplierName;
  commissionPct: number;
}

export const SUPPLIERS = {
  supplierA: 'Supplier A',
  supplierB: 'Supplier B',
} as const;

export type SupplierId = keyof typeof SUPPLIERS;
export type SupplierName = (typeof SUPPLIERS)[SupplierId];

export const SUPPLIER_IDS = Object.keys(SUPPLIERS) as SupplierId[];

export interface HotelSearchInput {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}

export type SupplierFetchStatus = 'ok' | 'failed';

export interface HotelSearchResult {
  city: string;
  hotels: HotelOffer[];
  /** Per-supplier outcome, so callers can tell when results are partial. */
  suppliers: Record<SupplierId, SupplierFetchStatus>;
}
