import { randomUUID } from 'node:crypto';
import express, { type RequestHandler } from 'express';
import { config } from './config';
import { errorHandler, notFoundHandler } from './http/errors';
import { logger } from './logger';
import { healthRouter } from './routes/health.routes';
import { hotelRouter } from './routes/hotel.routes';
import { adminRouter, supplierRouter } from './routes/supplier.routes';

const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/;

const requestLogger: RequestHandler = (req, res, next) => {
  // Only trust a caller-supplied id if it is short and plain; otherwise mint one.
  const incoming = req.header('x-request-id');
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  const started = Date.now();
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    logger.info('request', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });
  next();
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1kb' }));
  app.use(requestLogger);

  app.use(healthRouter);
  app.use('/api', hotelRouter);
  app.use(supplierRouter);
  // Outage-simulation switch: test-only, never enabled unless explicitly opted in.
  if (config.enableAdminRoutes) app.use('/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
