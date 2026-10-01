import { Router } from 'express';
import { config } from '../config';
import { getRedis } from '../redis/client';
import { checkTemporalHealth } from '../temporal/client';
import { SUPPLIER_IDS, SUPPLIERS, type SupplierId } from '../types/hotel';

interface CheckResult {
  status: 'up' | 'down';
  latencyMs: number;
  httpStatus?: number;
  error?: string;
}

const CHECK_TIMEOUT_MS = 2000;

/** Runs a check with a hard time limit so /health never hangs on a dead dependency. */
async function timed(check: () => Promise<number | void>): Promise<CheckResult> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
  });
  try {
    const httpStatus = await Promise.race([check(), timeout]);
    return { status: 'up', latencyMs: Date.now() - started, ...(httpStatus ? { httpStatus } : {}) };
  } catch (err) {
    const e = err as Error & { httpStatus?: number };
    return {
      status: 'down',
      latencyMs: Date.now() - started,
      ...(e.httpStatus ? { httpStatus: e.httpStatus } : {}),
      error: e.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeSupplier(id: SupplierId): Promise<number> {
  const response = await fetch(config.suppliers[id], { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status}`), { httpStatus: response.status });
  }
  return response.status;
}

export const healthRouter = Router();

/** Liveness only — used by the container healthcheck. */
healthRouter.get('/health/live', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Reports both suppliers plus Redis and Temporal.
 *   200 "ok"        — everything up
 *   200 "degraded"  — one supplier down (searches still work with partial results)
 *   503 "down"      — all suppliers down, or Redis/Temporal unreachable
 */
healthRouter.get('/health', async (_req, res) => {
  const [supplierChecks, redis, temporal] = await Promise.all([
    Promise.all(SUPPLIER_IDS.map((id) => timed(() => probeSupplier(id)))),
    timed(async () => {
      await getRedis().ping();
    }),
    timed(() => checkTemporalHealth()),
  ]);

  const suppliers = Object.fromEntries(
    SUPPLIER_IDS.map((id, i) => [id, { name: SUPPLIERS[id], ...supplierChecks[i] }]),
  );
  const suppliersUp = supplierChecks.filter((c) => c.status === 'up').length;
  const depsUp = redis.status === 'up' && temporal.status === 'up';

  const status = !depsUp || suppliersUp === 0 ? 'down' : suppliersUp < SUPPLIER_IDS.length ? 'degraded' : 'ok';

  res.status(status === 'down' ? 503 : 200).json({
    status,
    timestamp: new Date().toISOString(),
    suppliers,
    dependencies: { redis, temporal },
  });
});
