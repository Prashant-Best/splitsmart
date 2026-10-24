import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { SplitError } from '../domain';
import { AppError } from '../errors';
import { isDuplicateKeyError } from '../models';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

function toResponse(err: unknown): { status: number; body: ErrorBody } {
  const reply = (status: number, code: string, message: string, details?: unknown) => ({
    status,
    body: { error: details === undefined ? { code, message } : { code, message, details } },
  });

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return reply(400, 'VALIDATION_ERROR', details[0]?.message ?? 'Invalid request', details);
  }
  if (err instanceof SplitError) return reply(400, 'INVALID_SPLIT', err.message);
  if (err instanceof AppError) return reply(err.status, err.code, err.message, err.details);
  if (err instanceof multer.MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? reply(413, 'FILE_TOO_LARGE', 'That file is too large')
      : reply(400, 'UPLOAD_ERROR', 'Upload one file in the "receipt" field');
  }
  if (err instanceof mongoose.Error.CastError) return reply(400, 'INVALID_ID', 'Invalid id');
  if (isDuplicateKeyError(err)) return reply(409, 'DUPLICATE', 'That already exists');

  // Errors raised by express.json() for malformed or oversized bodies.
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed')
    return reply(400, 'INVALID_JSON', 'The request body is not valid JSON');
  if (type === 'entity.too.large')
    return reply(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large');

  return reply(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

/** Turns every error into the same JSON shape; details of unexpected errors stay in the logs. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const { status, body } = toResponse(err);
  if (status >= 500) req.log.error({ err }, 'Unhandled error');
  res.status(status).json(body);
};

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  });
};
