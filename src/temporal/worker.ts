import { NativeConnection, Worker } from '@temporalio/worker';
import { config } from '../config';
import { errorMeta, logger } from '../logger';
import { closeRedis, getRedis } from '../redis/client';
import { HotelStore } from '../redis/hotelStore';
import { createActivities } from './activities';

async function connectWithRetry(maxAttempts = 30, delayMs = 2000): Promise<NativeConnection> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await NativeConnection.connect({ address: config.temporal.address });
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      logger.warn('Temporal not reachable yet, retrying', { attempt, address: config.temporal.address, ...errorMeta(err) });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main(): Promise<void> {
  const connection = await connectWithRetry();
  const store = new HotelStore(getRedis(), config.cacheTtlSeconds);

  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueue,
    workflowsPath: require.resolve('./workflows'),
    activities: createActivities(store),
  });

  logger.info('Temporal worker started', {
    address: config.temporal.address,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueue,
  });

  try {
    // Resolves after SIGINT/SIGTERM once in-flight tasks drain.
    await worker.run();
  } finally {
    await connection.close();
    await closeRedis();
    logger.info('Temporal worker stopped');
  }
}

main().catch((err) => {
  logger.error('Worker crashed', errorMeta(err));
  process.exit(1);
});
