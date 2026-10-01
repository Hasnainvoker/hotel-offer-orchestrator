import { describe, expect, it } from 'vitest';
import { HttpError } from './errors';
import { parseHotelSearchQuery } from './validation';

describe('parseHotelSearchQuery', () => {
  it('normalizes the city and leaves prices undefined when absent', () => {
    expect(parseHotelSearchQuery({ city: '  Delhi ' })).toEqual({ city: 'delhi', minPrice: undefined, maxPrice: undefined });
  });

  it('parses a price range', () => {
    expect(parseHotelSearchQuery({ city: 'delhi', minPrice: '5000', maxPrice: '6000.5' })).toMatchObject({
      minPrice: 5000,
      maxPrice: 6000.5,
    });
  });

  it('treats empty price params as absent', () => {
    expect(parseHotelSearchQuery({ city: 'delhi', minPrice: '', maxPrice: '' })).toMatchObject({
      minPrice: undefined,
      maxPrice: undefined,
    });
  });

  it.each([
    [{}, 'required'],
    [{ city: '' }, 'required'],
    [{ city: 'del*hi' }, 'invalid characters'],
    [{ city: ['delhi', 'goa'] }, 'provided once'],
    [{ city: 'delhi', minPrice: 'abc' }, 'non-negative number'],
    [{ city: 'delhi', maxPrice: '-1' }, 'non-negative number'],
    [{ city: 'delhi', minPrice: '0x10' }, 'non-negative number'],
    [{ city: 'delhi', minPrice: '1e3' }, 'non-negative number'],
    [{ city: 'delhi', maxPrice: 'Infinity' }, 'non-negative number'],
    [{ city: 'delhi', minPrice: '7000', maxPrice: '5000' }, 'less than or equal'],
  ])('rejects %j', (query, message) => {
    expect(() => parseHotelSearchQuery(query)).toThrow(HttpError);
    expect(() => parseHotelSearchQuery(query)).toThrow(message);
  });
});
