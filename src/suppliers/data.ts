import type { SupplierHotel, SupplierId } from '../types/hotel';

/*
 * Static mock inventory. Names intentionally overlap between suppliers so the
 * workflow has something to compare:
 *   delhi  — Holtin & Lemon Tree cheaper at B, Radison cheaper at A,
 *            Taj Palace ties on price (B wins on higher commission)
 *   mumbai — Trident cheaper at B, JW Marriott cheaper at A
 *   goa    — only Supplier A has inventory
 */
export const supplierInventory: Record<SupplierId, SupplierHotel[]> = {
  supplierA: [
    { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
    { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
    { hotelId: 'a3', name: 'Taj Palace', price: 7200, city: 'delhi', commissionPct: 15 },
    { hotelId: 'a4', name: 'The Oberoi', price: 8900, city: 'delhi', commissionPct: 12 },
    { hotelId: 'a5', name: 'Lemon Tree', price: 3200, city: 'delhi', commissionPct: 8 },
    { hotelId: 'a6', name: 'ITC Maurya', price: 9500, city: 'delhi', commissionPct: 18 },
    { hotelId: 'a7', name: 'Trident', price: 7800, city: 'mumbai', commissionPct: 11 },
    { hotelId: 'a8', name: 'JW Marriott', price: 11000, city: 'mumbai', commissionPct: 14 },
    { hotelId: 'a9', name: 'Holtin', price: 6500, city: 'mumbai', commissionPct: 10 },
    { hotelId: 'a10', name: 'Taj Exotica', price: 12000, city: 'goa', commissionPct: 16 },
    { hotelId: 'a11', name: 'Cidade de Goa', price: 8400, city: 'goa', commissionPct: 12 },
  ],
  supplierB: [
    { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
    { hotelId: 'b2', name: 'Radison', price: 6100, city: 'delhi', commissionPct: 11 },
    { hotelId: 'b3', name: 'Taj Palace', price: 7200, city: 'delhi', commissionPct: 17 },
    { hotelId: 'b4', name: 'Hyatt Regency', price: 6800, city: 'delhi', commissionPct: 14 },
    { hotelId: 'b5', name: 'Lemon Tree', price: 2950, city: 'delhi', commissionPct: 9 },
    { hotelId: 'b6', name: 'Novotel', price: 4500, city: 'delhi', commissionPct: 10 },
    { hotelId: 'b7', name: 'Trident', price: 7400, city: 'mumbai', commissionPct: 12 },
    { hotelId: 'b8', name: 'JW Marriott', price: 11500, city: 'mumbai', commissionPct: 15 },
    { hotelId: 'b9', name: 'Sea Princess', price: 5200, city: 'mumbai', commissionPct: 9 },
  ],
};
