function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}

const port = int('PORT', 3000);
const selfBaseUrl = process.env.SELF_BASE_URL ?? `http://localhost:${port}`;

export const config = {
  port,
  logLevel: process.env.LOG_LEVEL ?? 'info',
  /** Exposes PUT /admin/suppliers/:id to simulate supplier outages. Demo/test use only. */
  enableAdminRoutes: process.env.ENABLE_ADMIN_ROUTES === 'true',

  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  /** How long a city's de-duplicated list lives in Redis. */
  cacheTtlSeconds: int('CACHE_TTL_SECONDS', 600),

  temporal: {
    address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'hotel-offers',
  },

  suppliers: {
    supplierA: process.env.SUPPLIER_A_URL ?? `${selfBaseUrl}/supplierA/hotels`,
    supplierB: process.env.SUPPLIER_B_URL ?? `${selfBaseUrl}/supplierB/hotels`,
    timeoutMs: int('SUPPLIER_TIMEOUT_MS', 3000),
  },
} as const;
