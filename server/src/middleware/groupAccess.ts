import type { Request, RequestHandler } from 'express';
import { notFound } from '../errors';
import { Group, type GroupDoc } from '../models';
import { groupParams } from '../schemas/common';
import { currentUser } from './auth';

declare module 'express-serve-static-core' {
  interface Request {
    group?: GroupDoc;
  }
}

/**
 * Loads :groupId only if the signed-in user is a member. Outsiders get the same 404 as for a
 * group that does not exist, so ids cannot be probed. Every route below a group goes through
 * this, and every expense or settlement query also filters by the group id (no IDOR).
 */
export const loadGroup: RequestHandler = async (req, _res, next) => {
  const { groupId } = groupParams.parse(req.params);
  const group = await Group.findOne({
    _id: groupId,
    'members.user': currentUser(req).id,
  }).lean<GroupDoc>();
  if (!group) throw notFound('Group');
  req.group = group;
  next();
};

/** The group loaded by loadGroup. */
export function currentGroup(req: Request): GroupDoc {
  if (!req.group) throw notFound('Group');
  return req.group;
}
