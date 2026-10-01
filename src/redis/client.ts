import Redis from 'ioredis';
import { config } from '../config';
import { errorMeta, logger } from '../logger';

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 2,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });
    client.on('error', (err) => logger.error('Redis connection error', errorMeta(err)));
    client.on('ready', () => logger.info('Redis connected', { url: config.redisUrl }));
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => client?.disconnect());
    client = undefined;
  }
}
