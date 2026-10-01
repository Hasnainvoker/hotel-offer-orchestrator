import { createApp } from './app';
import { config } from './config';
import { errorMeta, logger } from './logger';
import { closeRedis } from './redis/client';
import { closeTemporal } from './temporal/client';

const server = createApp().listen(config.port, () => {
  logger.info('API listening', { port: config.port });
});

function shutdown(signal: string): void {
  logger.info('Shutting down API', { signal });
  server.close(async () => {
    await Promise.allSettled([closeRedis(), closeTemporal()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', errorMeta(reason)));
