import type { Request, Response } from 'express';
import { ApplicationFailure, TimeoutFailure, WorkflowFailedError } from '@temporalio/client';
import { HttpError } from '../http/errors';
import { parseHotelSearchQuery } from '../http/validation';
import { errorMeta, logger } from '../logger';
import { runHotelSearch } from '../temporal/client';

function toHttpError(err: unknown): HttpError {
  const cause = err instanceof WorkflowFailedError ? err.cause : undefined;
  if (cause instanceof ApplicationFailure && cause.type === 'AllSuppliersUnavailable') {
    return new HttpError(502, 'All hotel suppliers are currently unavailable');
  }
  if (cause instanceof TimeoutFailure) {
    // Typically no worker is polling the task queue.
    return new HttpError(504, 'Hotel search timed out');
  }
  // Redis/Temporal unreachable or an activity exhausted its retries.
  return new HttpError(503, 'Hotel search is temporarily unavailable');
}

export async function getHotels(req: Request, res: Response): Promise<void> {
  const input = parseHotelSearchQuery(req.query);

  let result;
  try {
    result = await runHotelSearch(input);
  } catch (err) {
    const httpError = toHttpError(err);
    logger.error('Hotel search failed', {
      ...input,
      status: httpError.status,
      ...errorMeta(err instanceof WorkflowFailedError ? (err.cause?.cause ?? err.cause ?? err) : err),
    });
    throw httpError;
  }

  // Body keeps the exact contract (a plain array); partial results are flagged in headers.
  const failed = Object.entries(result.suppliers)
    .filter(([, status]) => status === 'failed')
    .map(([id]) => id);
  if (failed.length > 0) {
    res.setHeader('X-Partial-Results', 'true');
    res.setHeader('X-Failed-Suppliers', failed.join(','));
  }
  res.json(result.hotels);
}
