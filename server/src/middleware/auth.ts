import type { Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { isValidObjectId } from 'mongoose';
import { config } from '../config';
import { unauthorized } from '../errors';
import { User } from '../models';

export const SESSION_COOKIE = 'splitsmart_session';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

const cookieOptions = () =>
  ({
    httpOnly: true, // not readable from JavaScript, so an XSS bug cannot steal the session
    sameSite: 'lax', // not sent on cross-site POSTs, which blocks CSRF
    secure: config.cookieSecure,
    path: '/',
  }) as const;

/** Signs a JWT for the user and stores it in an httpOnly cookie. */
export function startSession(res: Response, user: { id: string; tokenVersion: number }): void {
  const token = jwt.sign({ ver: user.tokenVersion }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.sessionDays * 24 * 60 * 60,
    algorithm: 'HS256',
  });
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
  });
}

export function endSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

function readToken(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const fromCookie = cookies?.[SESSION_COOKIE];
  if (fromCookie) return fromCookie;
  // API clients (curl, the CI smoke test) can send the same token as a bearer header.
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
}

/** Rejects the request with 401 unless it carries a valid, unrevoked session. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw unauthorized();

  let payload: jwt.JwtPayload;
  try {
    // Pinning the algorithm stops "alg: none" and algorithm-confusion tokens.
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  const user =
    typeof payload.sub === 'string' && isValidObjectId(payload.sub)
      ? await User.findById(payload.sub).select('name email tokenVersion').lean()
      : null;
  if (!user || user.tokenVersion !== payload.ver) {
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  req.user = { id: user._id.toString(), name: user.name, email: user.email };
  next();
};

/** The signed-in user; only call after requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
