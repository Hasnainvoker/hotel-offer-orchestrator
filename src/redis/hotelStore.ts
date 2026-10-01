import type Redis from 'ioredis';
import { normalizeHotelName } from '../domain/selectBestOffers';
import type { HotelOffer } from '../types/hotel';

/*
 * Storage layout per city (the {city} hash tag keeps both keys in the same
 * slot, so the Lua script also works on Redis Cluster):
 *
 *   hotels:{delhi}:by_price  ZSET  member = normalized hotel name, score = price
 *   hotels:{delhi}:offers    HASH  field  = normalized hotel name, value = offer JSON
 *
 * Price filtering runs inside Redis: the Lua script does a ZRANGEBYSCORE over
 * the sorted set and resolves each match from the hash in one round trip.
 */
export function hotelKeys(city: string): { byPrice: string; offers: string } {
  return {
    byPrice: `hotels:{${city}}:by_price`,
    offers: `hotels:{${city}}:offers`,
  };
}

const FILTER_BY_PRICE_LUA = `
local names = redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[1], ARGV[2])
local offers = {}
for i, name in ipairs(names) do
  local offer = redis.call('HGET', KEYS[2], name)
  if offer then
    offers[#offers + 1] = offer
  end
end
return offers
`;

/** Shape of the custom command registered via defineCommand (EVALSHA under the hood). */
type WithFilterCommand = {
  filterHotelsByPrice(byPriceKey: string, offersKey: string, min: string, max: string): Promise<string[]>;
};

export class HotelStore {
  private readonly filterCommand: WithFilterCommand;

  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {
    if (!('filterHotelsByPrice' in redis)) {
      redis.defineCommand('filterHotelsByPrice', { numberOfKeys: 2, lua: FILTER_BY_PRICE_LUA });
    }
    this.filterCommand = redis as unknown as WithFilterCommand;
  }

  /** Atomically replaces the stored list for a city. An empty list clears it. */
  async saveHotels(city: string, hotels: HotelOffer[]): Promise<void> {
    const { byPrice, offers } = hotelKeys(city);
    const tx = this.redis.multi().del(byPrice, offers);

    if (hotels.length > 0) {
      const zaddArgs: (string | number)[] = [];
      const hashArgs: Record<string, string> = {};
      for (const hotel of hotels) {
        const member = normalizeHotelName(hotel.name);
        zaddArgs.push(hotel.price, member);
        hashArgs[member] = JSON.stringify(hotel);
      }
      tx.zadd(byPrice, ...zaddArgs)
        .hset(offers, hashArgs)
        .expire(byPrice, this.ttlSeconds)
        .expire(offers, this.ttlSeconds);
    }

    const results = await tx.exec();
    const failed = results?.find(([err]) => err);
    if (!results || failed) {
      throw new Error(`Redis transaction failed while saving hotels for "${city}": ${failed?.[0]?.message ?? 'aborted'}`);
    }
  }

  /** Hotels priced within [minPrice, maxPrice] (inclusive), cheapest first. */
  async findByPriceRange(city: string, minPrice?: number, maxPrice?: number): Promise<HotelOffer[]> {
    const { byPrice, offers } = hotelKeys(city);
    const raw = await this.filterCommand.filterHotelsByPrice(
      byPrice,
      offers,
      minPrice === undefined ? '-inf' : String(minPrice),
      maxPrice === undefined ? '+inf' : String(maxPrice),
    );
    return raw.map((json) => JSON.parse(json) as HotelOffer);
  }
}
