import { Router, type RequestHandler } from 'express';
import { currentUser } from '../middleware/auth';
import { currentGroup, loadGroup } from '../middleware/groupAccess';
import { pageQuery, settlementParams } from '../schemas/common';
import { createGroupSchema, statsQuery, updateGroupSchema } from '../schemas/group';
import { createSettlementSchema } from '../schemas/settlement';
import { listActivity } from '../services/activity';
import {
  createGroup,
  getGroupDetail,
  listGroups,
  renameGroup,
  resetInvite,
} from '../services/groups';
import { getBalanceSummary } from '../services/ledger';
import { settlementDto } from '../services/serializers';
import { createSettlement, deleteSettlement, listSettlements } from '../services/settlements';
import { groupStats } from '../services/stats';
import { expensesRouter } from './expenses';

/** Mounted at /api/groups behind requireAuth. */
export function groupsRouter(uploadLimiter: RequestHandler): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json({ groups: await listGroups(currentUser(req).id) });
  });

  router.post('/', async (req, res) => {
    const groupId = await createGroup(currentUser(req).id, createGroupSchema.parse(req.body));
    res.status(201).json({ group: await getGroupDetail(groupId) });
  });

  // Everything under /:groupId is for members only.
  const group = Router({ mergeParams: true });
  group.use(loadGroup);

  group.get('/', async (req, res) => {
    res.json({ group: await getGroupDetail(currentGroup(req)._id) });
  });

  group.patch('/', async (req, res) => {
    const { name } = updateGroupSchema.parse(req.body);
    await renameGroup(currentGroup(req), currentUser(req).id, name);
    res.json({ group: await getGroupDetail(currentGroup(req)._id) });
  });

  group.post('/invite/reset', async (req, res) => {
    res.json({ inviteCode: await resetInvite(currentGroup(req), currentUser(req).id) });
  });

  group.get('/balances', async (req, res) => {
    res.json(await getBalanceSummary(currentGroup(req)._id));
  });

  group.get('/stats', async (req, res) => {
    const { months } = statsQuery.parse(req.query);
    res.json(await groupStats(currentGroup(req), months));
  });

  group.get('/activity', async (req, res) => {
    res.json(await listActivity([currentGroup(req)._id], pageQuery.parse(req.query)));
  });

  group.get('/settlements', async (req, res) => {
    const settlements = await listSettlements(currentGroup(req));
    res.json({ items: settlements.map(settlementDto) });
  });

  group.post('/settlements', async (req, res) => {
    const input = createSettlementSchema.parse(req.body);
    const settlement = await createSettlement(currentGroup(req), currentUser(req).id, input);
    res.status(201).json({ settlement: settlementDto(settlement) });
  });

  group.delete('/settlements/:settlementId', async (req, res) => {
    const { settlementId } = settlementParams.parse(req.params);
    await deleteSettlement(currentGroup(req), currentUser(req).id, settlementId);
    res.status(204).end();
  });

  group.use('/expenses', expensesRouter(uploadLimiter));

  router.use('/:groupId', group);
  return router;
}
