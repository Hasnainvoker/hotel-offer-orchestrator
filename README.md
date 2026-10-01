# Hotel Offer Orchestrator

Aggregates hotel offers from two (mock) suppliers, de-duplicates hotels by name, keeps the
best-priced offer per hotel, stores the result in Redis, and supports price-range filtering
executed **inside Redis**. The whole comparison is orchestrated by a **Temporal** workflow.

**Stack:** Node.js 24 · TypeScript · Express · Temporal · Redis · Docker Compose

---

## Architecture

```
                   ┌──────────────────────────── api (Express) ────────────────────────────┐
 GET /api/hotels ─►│ validate query ─► start hotelOffersWorkflow ─► wait for result ─► JSON │
                   │                                                                        │
                   │  mock suppliers:  GET /supplierA/hotels   GET /supplierB/hotels        │
                   │  GET /health      PUT /admin/suppliers/:id  (simulate outage)          │
                   └───────────────┬────────────────────────────────────▲──────────────────┘
                                   │ gRPC                                │ HTTP
                          ┌────────▼────────┐                 ┌──────────┴───────────┐
                          │ Temporal server │◄── task queue ──│ worker               │
                          │  (+ Web UI)     │   hotel-offers  │  workflow+activities │
                          └─────────────────┘                 └──────────┬───────────┘
                                                                         │
                                                                   ┌─────▼─────┐
                                                                   │   Redis   │
                                                                   └───────────┘
```

### Workflow: `hotelOffersWorkflow({ city, minPrice?, maxPrice? })`

1. **Parallel fetch** – `fetchSupplierHotels('supplierA')` and `fetchSupplierHotels('supplierB')`
   run concurrently (`Promise.allSettled`). Each activity retries up to 3 times with exponential backoff.
2. **De-duplicate** – hotels are grouped by name (case and whitespace are ignored). When both suppliers list a
   hotel, the **cheaper** offer wins. If the prices are equal, the higher `commissionPct` wins. A hotel listed by only one supplier is kept as is.
3. **Save to Redis** – `saveHotels` atomically replaces the city's list (MULTI/EXEC) with a TTL.
4. **Filter in Redis** – if `minPrice` / `maxPrice` is present, `filterHotelsByPrice` queries Redis.
5. Returns the list sorted by price ascending.

**Failure handling:** if one supplier still fails after its retries, the workflow continues with the
other supplier's hotels. The API response is then flagged with `X-Partial-Results: true` and
`X-Failed-Suppliers: supplierB`. If **all** suppliers fail, the workflow raises a
non-retryable `AllSuppliersUnavailable` failure and the API returns **502**.

### Redis data model

| Key                         | Type | Content                                       |
|-----------------------------|------|-----------------------------------------------|
| `hotels:{delhi}:by_price`   | ZSET | member = normalized hotel name, score = price |
| `hotels:{delhi}:offers`     | HASH | field = normalized hotel name, value = offer JSON |

Price filtering is a Lua script (registered with `defineCommand`, executed via `EVALSHA`). In one
server-side round trip, it runs `ZRANGEBYSCORE key min max` and resolves each match from the hash. An
absent bound becomes `-inf` / `+inf`, and both bounds are inclusive. The `{city}` hash tag keeps both keys
in the same slot, so the script also works on Redis Cluster. Keys expire after `CACHE_TTL_SECONDS` (default 600).

---

## Quick start (Docker Compose)

Prerequisites: Docker with Compose (`docker compose` or `docker-compose`).

```bash
git clone <your-repo-url> hotel-offer-orchestrator
cd hotel-offer-orchestrator
docker compose up -d --build
```

| Service      | URL                                  |
|--------------|--------------------------------------|
| API          | http://localhost:3000                |
| Temporal UI  | http://localhost:8233 (view workflow runs) |
| Temporal gRPC| localhost:7233                       |
| Redis        | localhost:6379                       |

Try it:

```bash
curl "http://localhost:3000/api/hotels?city=delhi"
curl "http://localhost:3000/api/hotels?city=delhi&minPrice=5000&maxPrice=7000"
curl "http://localhost:3000/health"
```

Logs / teardown:

```bash
docker compose logs -f api worker
docker compose down
```

> The compose file runs Temporal's single-binary dev server (`temporal server start-dev`) with
> in-memory persistence. For production, point `TEMPORAL_ADDRESS` at a real Temporal cluster
> or Temporal Cloud.

## Local development (without Docker for the app)

```bash
npm install
docker compose up -d redis temporal      # or: redis-server & temporal server start-dev
ENABLE_ADMIN_ROUTES=true npm run dev:api  # terminal 1 – http://localhost:3000
npm run dev:worker                        # terminal 2 – Temporal worker
```

Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run build`,
`npm run start:api` / `npm run start:worker` (compiled output in `dist/`).

---

## API

### `GET /api/hotels?city=<city>[&minPrice=<n>][&maxPrice=<n>]`

| Param      | Required | Notes                                         |
|------------|----------|-----------------------------------------------|
| `city`     | yes      | Case-insensitive (`Delhi` = `delhi`)          |
| `minPrice` | no       | Non-negative number, inclusive                |
| `maxPrice` | no       | Non-negative number, inclusive, ≥ `minPrice`  |

`200 OK`:

```json
[
  { "name": "Holtin",  "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

| Status | When |
|--------|------|
| 200    | Success. The body is `[]` for a city with no hotels or a range with no matches. |
| 400    | `city` missing or invalid, a price is not a number, or `minPrice > maxPrice` |
| 502    | Every supplier failed |
| 503    | Redis or Temporal is unreachable |
| 504    | The workflow did not finish within 15s (usually: the worker is not running) |

Response headers: `X-Request-Id`, plus `X-Partial-Results` and `X-Failed-Suppliers` on partial results.

### Mock suppliers

- `GET /supplierA/hotels[?city=delhi]`
- `GET /supplierB/hotels[?city=delhi]`

The mock data is in [`src/suppliers/data.ts`](src/suppliers/data.ts):

| City     | Scenario |
|----------|----------|
| `delhi`  | Overlaps: Holtin & Lemon Tree cheaper at **B**, Radison cheaper at **A**, Taj Palace price tie (B wins on commission) |
| `mumbai` | Overlaps: Trident cheaper at B, JW Marriott cheaper at A |
| `goa`    | Only Supplier A has hotels |
| anything else | No results |

### `GET /health`

Checks both suppliers over HTTP, and also Redis and Temporal.

```json
{
  "status": "ok",
  "timestamp": "2026-09-30T16:23:57.723Z",
  "suppliers": {
    "supplierA": { "name": "Supplier A", "status": "up", "latencyMs": 6, "httpStatus": 200 },
    "supplierB": { "name": "Supplier B", "status": "up", "latencyMs": 5, "httpStatus": 200 }
  },
  "dependencies": {
    "redis":    { "status": "up", "latencyMs": 1 },
    "temporal": { "status": "up", "latencyMs": 3 }
  }
}
```

- `ok` (200): everything is up.
- `degraded` (200): one supplier is down.
- `down` (503): all suppliers are down, or Redis or Temporal is unreachable.

`GET /health/live` is a plain liveness probe. The container healthcheck uses it.

### Simulating a supplier outage

```bash
curl -X PUT localhost:3000/admin/suppliers/supplierB -H 'Content-Type: application/json' -d '{"up": false}'
curl -i "localhost:3000/api/hotels?city=delhi"     # Supplier A results only, X-Partial-Results: true
curl -X PUT localhost:3000/admin/suppliers/supplierB -H 'Content-Type: application/json' -d '{"up": true}'
```

`GET /admin/suppliers` shows the current availability. While a supplier is down, its mock endpoint
returns 503. The switch is in-memory in the API process, so it resets on restart.

The `/admin` routes are a test-only tool, so they exist **only when `ENABLE_ADMIN_ROUTES=true`**.
`docker-compose.yml` turns this on for the demo; it is off by default.

---

## Postman

Import [`postman/hotel-offer-orchestrator.postman_collection.json`](postman/hotel-offer-orchestrator.postman_collection.json).
The collection variable `baseUrl` defaults to `http://localhost:3000`. It contains the following folders:

- **Health**: all suppliers and dependencies are up.
- **Mock suppliers**: raw supplier responses, showing the overlap.
- **Hotels**:
  - delhi, with overlap and cheapest-offer assertions
  - price range, min only, max only, and a range with no matches
  - goa (one supplier)
  - **city with no results**
  - 400 validation cases
- **Simulate supplier down**:
  1. Supplier B down: health is `degraded` and results are partial.
  2. Both suppliers down: the API returns 502 and health returns 503.
  3. Both suppliers restored.

Run the folders in order with the Collection Runner or from the CLI:

```bash
npx newman run postman/hotel-offer-orchestrator.postman_collection.json
```

---

## Logging & error handling

- **API**: structured JSON logs. Each request logs method, URL, status, duration, and request id. There is a central error handler; client errors return a JSON `{ "error": ... }` body.
- **Workflow**: uses Temporal's replay-safe `log`. It logs each supplier failure it tolerates and a completion summary.
- **Activities**:
  - Each supplier call has a timeout (`SUPPLIER_TIMEOUT_MS`).
  - 5xx, 429, and network errors are *retryable*. 4xx responses and malformed payloads are *non-retryable*.
  - Malformed hotel records are dropped with a warning.
  - Redis writes are transactional.
- **Worker**: retries its connection to Temporal on startup and shuts down cleanly on SIGINT/SIGTERM.
- **No hanging requests**:
  - Each search is capped by a 15s workflow timeout, with a 20s gRPC deadline as a backstop.
  - Each `/health` check is capped at 2s.

## Security

- **Input validation**: `city` must match `[a-z .'-]` (max 60 chars). Prices must be plain decimals, so hex, exponents and `Infinity` are rejected. Redis keys and Lua arguments therefore never contain user-controlled syntax.
- **Request IDs**: a caller's `X-Request-Id` is only accepted if it matches `[A-Za-z0-9_-]{1,64}`.
- **Request bodies** are limited to 1 KB.
- **Containers**:
  - The app runs as the non-root `node` user.
  - npm, yarn and corepack are removed from the runtime image.
  - OS packages are upgraded at build time.
  - Image versions are pinned.
- **Network**: every published port is bound to `127.0.0.1`, so Redis, Temporal and the API are not reachable from your network.
- **Health output** does not expose internal URLs.
- **Outage switch**: the `/admin` routes are opt-in (see above).
- **Scan results (October 2026)**:
  - `npm audit`: 0 vulnerabilities.
  - `docker scout`: the app image has no fixable high or critical CVEs. One zlib CVE remains, with no fix released by Debian yet. Redis 8.2 is clean.
  - The official `temporalio/temporal` dev-server image has upstream findings; it is for local development only. Use a managed or hardened Temporal deployment in production.

Not in scope for this assessment: authentication and rate limiting. Each search starts a workflow, so a public deployment should add both.

## Configuration

See [`.env.example`](.env.example). The main settings are `REDIS_URL`, `TEMPORAL_ADDRESS`,
`TEMPORAL_TASK_QUEUE`, `SUPPLIER_A_URL`, `SUPPLIER_B_URL`, `SUPPLIER_TIMEOUT_MS`, and `CACHE_TTL_SECONDS`.

## Project structure

```
src/
├── server.ts                  # API entry point (graceful shutdown)
├── app.ts                     # Express app + request logging
├── config.ts / logger.ts
├── controllers/hotel.controller.ts
├── routes/                    # hotels, mock suppliers + admin, health
├── http/                      # validation, HttpError, error handler
├── domain/selectBestOffers.ts # pure dedupe/cheapest logic (used by the workflow)
├── suppliers/                 # mock data + outage switch
├── redis/                     # client + HotelStore (ZSET/HASH + Lua filter)
├── temporal/
│   ├── workflows.ts           # hotelOffersWorkflow
│   ├── activities.ts          # fetchSupplierHotels, saveHotels, filterHotelsByPrice
│   ├── worker.ts              # worker entry point
│   └── client.ts              # used by the API to start workflows
└── types/hotel.ts
postman/                       # Postman collection
Dockerfile                     # multi-stage (node:24-trixie-slim); one image for api + worker
docker-compose.yml             # redis 8.2, temporal 1.9.1 (+UI), api, worker
```
