import { Router, type RequestHandler } from 'express';
import { currentUser, endSession, requireAuth, startSession } from '../middleware/auth';
import { loginSchema, registerSchema, updateProfileSchema } from '../schemas/auth';
import { userDto } from '../services/serializers';
import {
  getUser,
  registerUser,
  revokeSessions,
  updateProfile,
  verifyLogin,
} from '../services/users';

export function authRouter(authLimiter: RequestHandler): Router {
  const router = Router();

  router.post('/register', authLimiter, async (req, res) => {
    const user = await registerUser(registerSchema.parse(req.body));
    startSession(res, { id: user._id.toString(), tokenVersion: user.tokenVersion });
    res.status(201).json({ user: userDto(user) });
  });

  router.post('/login', authLimiter, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await verifyLogin(email, password);
    startSession(res, { id: user._id.toString(), tokenVersion: user.tokenVersion });
    res.json({ user: userDto(user) });
  });

  router.post('/logout', (_req, res) => {
    endSession(res);
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    res.json({ user: userDto(await getUser(currentUser(req).id)) });
  });

  router.patch('/me', requireAuth, async (req, res) => {
    const user = await updateProfile(currentUser(req).id, updateProfileSchema.parse(req.body));
    res.json({ user: userDto(user) });
  });

  /** Signs out every device by invalidating all tokens issued so far. */
  router.post('/logout-all', requireAuth, async (req, res) => {
    await revokeSessions(currentUser(req).id);
    endSession(res);
    res.status(204).end();
  });

  return router;
}
