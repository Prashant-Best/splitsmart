import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const tooMany: RequestHandler = (_req, res) => {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a few minutes and try again.',
    },
  });
};

/** Overall limit per IP for the whole API. */
export const apiLimiter = (limit: number) =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooMany,
  });

/** Strict limit for sign-in and sign-up, counting only failed attempts (slows password guessing). */
export const authLimiter = (limit: number) =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: tooMany,
  });

/** Receipt uploads per IP per hour. */
export const uploadLimiter = (limit: number) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooMany,
  });
