import { describe, expect, it } from 'vitest';
import { supplierInventory } from '../suppliers/data';
import type { SupplierHotel } from '../types/hotel';
import { selectBestOffers } from './selectBestOffers';

const hotel = (name: string, price: number, commissionPct = 10): SupplierHotel => ({
  hotelId: `${name}-${price}`,
  name,
  price,
  city: 'delhi',
  commissionPct,
});

describe('selectBestOffers', () => {
  it('keeps the cheaper offer when both suppliers list the same hotel', () => {
    const result = selectBestOffers([
      { supplier: 'Supplier A', hotels: [hotel('Holtin', 6000, 10), hotel('Radison', 5900, 13)] },
      { supplier: 'Supplier B', hotels: [hotel('Holtin', 5340, 20), hotel('Radison', 6100, 11)] },
    ]);
    expect(result).toEqual([
      { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
      { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
    ]);
  });

  it('keeps hotels that only one supplier returns', () => {
    const result = selectBestOffers([
      { supplier: 'Supplier A', hotels: [hotel('Taj', 7000)] },
      { supplier: 'Supplier B', hotels: [hotel('Novotel', 4500)] },
    ]);
    expect(result.map((h) => [h.name, h.supplier])).toEqual([
      ['Novotel', 'Supplier B'],
      ['Taj', 'Supplier A'],
    ]);
  });

  it('matches names case- and whitespace-insensitively', () => {
    const result = selectBestOffers([
      { supplier: 'Supplier A', hotels: [hotel('Lemon  Tree', 3200)] },
      { supplier: 'Supplier B', hotels: [hotel(' lemon tree ', 2950)] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ price: 2950, supplier: 'Supplier B', name: 'lemon tree' });
  });

  it('breaks a price tie by higher commission', () => {
    const result = selectBestOffers([
      { supplier: 'Supplier A', hotels: [hotel('Taj Palace', 7200, 15)] },
      { supplier: 'Supplier B', hotels: [hotel('Taj Palace', 7200, 17)] },
    ]);
    expect(result[0]).toMatchObject({ supplier: 'Supplier B', commissionPct: 17 });
  });

  it('returns an empty list when no supplier has hotels', () => {
    expect(selectBestOffers([{ supplier: 'Supplier A', hotels: [] }, { supplier: 'Supplier B', hotels: [] }])).toEqual([]);
  });

  it('produces the expected result for the mock delhi inventory', () => {
    const forDelhi = (hotels: SupplierHotel[]) => hotels.filter((h) => h.city === 'delhi');
    const result = selectBestOffers([
      { supplier: 'Supplier A', hotels: forDelhi(supplierInventory.supplierA) },
      { supplier: 'Supplier B', hotels: forDelhi(supplierInventory.supplierB) },
    ]);
    expect(result.map((h) => `${h.name}:${h.price}:${h.supplier}`)).toEqual([
      'Lemon Tree:2950:Supplier B',
      'Novotel:4500:Supplier B',
      'Holtin:5340:Supplier B',
      'Radison:5900:Supplier A',
      'Hyatt Regency:6800:Supplier B',
      'Taj Palace:7200:Supplier B',
      'The Oberoi:8900:Supplier A',
      'ITC Maurya:9500:Supplier A',
    ]);
  });
});
