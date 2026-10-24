import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config';
import { logger } from './logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { apiRouter } from './routes';

export interface AppOptions {
  rateLimitMax?: number;
  authRateLimitMax?: number;
  uploadRateLimitMax?: number;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  // Behind nginx or a hosting proxy, trust X-Forwarded-For so rate limits see real client IPs.
  app.set('trust proxy', config.trustProxy);

  app.use(pinoHttp({ logger, autoLogging: !config.isTest }));
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', apiLimiter(options.rateLimitMax ?? config.rateLimitMax));
  app.use(
    '/api',
    apiRouter({
      authRateLimitMax: options.authRateLimitMax ?? config.authRateLimitMax,
      uploadRateLimitMax: options.uploadRateLimitMax ?? 60,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
