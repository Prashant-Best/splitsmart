import { Router } from 'express';
import { isDbConnected } from '../db';
import { currentUser, requireAuth } from '../middleware/auth';
import { authLimiter, uploadLimiter } from '../middleware/rateLimit';
import { Group } from '../models';
import { inviteParams, pageQuery } from '../schemas/common';
import { listActivity } from '../services/activity';
import { joinGroup, previewInvite } from '../services/groups';
import { authRouter } from './auth';
import { groupsRouter } from './groups';

export interface ApiLimits {
  authRateLimitMax: number;
  uploadRateLimitMax: number;
}

export function apiRouter(limits: ApiLimits): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const db = isDbConnected();
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db: db ? 'up' : 'down' });
  });

  router.use('/auth', authRouter(authLimiter(limits.authRateLimitMax)));
  router.use('/groups', requireAuth, groupsRouter(uploadLimiter(limits.uploadRateLimitMax)));

  router.get('/invites/:code', requireAuth, async (req, res) => {
    const { code } = inviteParams.parse(req.params);
    res.json(await previewInvite(code, currentUser(req).id));
  });

  router.post('/invites/:code/join', requireAuth, async (req, res) => {
    const { code } = inviteParams.parse(req.params);
    const result = await joinGroup(code, currentUser(req).id);
    res.status(result.joined ? 201 : 200).json(result);
  });

  /** Recent activity across all of the user's groups (dashboard feed). */
  router.get('/activity', requireAuth, async (req, res) => {
    const groups = await Group.find({ 'members.user': currentUser(req).id })
      .select('_id')
      .lean();
    res.json(
      await listActivity(
        groups.map((g) => g._id),
        pageQuery.parse(req.query),
      ),
    );
  });

  return router;
}
