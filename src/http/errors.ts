import type { ErrorRequestHandler, RequestHandler } from 'express';
import { errorMeta, logger } from '../logger';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    if (err.status >= 500) logger.error('Request failed', { path: req.path, status: err.status, ...errorMeta(err) });
    res.status(err.status).json({ error: err.message });
    return;
  }
  // Malformed JSON bodies etc. from express.json()
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  logger.error('Unhandled error', { path: req.path, ...errorMeta(err), stack: err?.stack });
  res.status(500).json({ error: 'Internal server error' });
};
