import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import { config } from '../config';
import type { HotelSearchInput, HotelSearchResult } from '../types/hotel';
import type { hotelOffersWorkflow } from './workflows';

let connectionPromise: Promise<Connection> | undefined;

/** Lazily connects; a failed attempt is forgotten so the next call retries. */
export function getTemporalConnection(): Promise<Connection> {
  if (!connectionPromise) {
    connectionPromise = Connection.connect({ address: config.temporal.address, connectTimeout: '3 seconds' }).catch((err) => {
      connectionPromise = undefined;
      throw err;
    });
  }
  return connectionPromise;
}

export async function runHotelSearch(input: HotelSearchInput): Promise<HotelSearchResult> {
  const connection = await getTemporalConnection();
  const client = new Client({ connection, namespace: config.temporal.namespace });

  // The workflow times out after 15s; the gRPC deadline is a backstop so a dead
  // Temporal server can never leave the HTTP request hanging.
  return connection.withDeadline(Date.now() + 20_000, () =>
    client.workflow.execute<typeof hotelOffersWorkflow>('hotelOffersWorkflow', {
      taskQueue: config.temporal.taskQueue,
      workflowId: `hotel-offers-${input.city}-${randomUUID()}`,
      args: [input],
      workflowExecutionTimeout: '15 seconds',
    }),
  );
}

export async function checkTemporalHealth(): Promise<void> {
  const connection = await getTemporalConnection();
  await connection.withDeadline(Date.now() + 2000, () => connection.healthService.check({}));
}

export async function closeTemporal(): Promise<void> {
  if (connectionPromise) {
    const connection = await connectionPromise.catch(() => undefined);
    connectionPromise = undefined;
    await connection?.close();
  }
}
