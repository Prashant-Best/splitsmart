import { Types, type ClientSession } from 'mongoose';
import { badRequest } from '../errors';
import { Activity, Group, type ActivityDoc, type ActivityType, type GroupDoc } from '../models';
import { usersById } from './users';

export interface ActivityEntry {
  group: Types.ObjectId;
  actor: Types.ObjectId | string;
  type: ActivityType;
  expense?: Types.ObjectId;
  settlement?: Types.ObjectId;
  data?: Record<string, unknown>;
}

/** Records an activity entry inside the caller's transaction. */
export async function logActivity(entry: ActivityEntry, session: ClientSession): Promise<void> {
  await Activity.create([{ ...entry, data: entry.data ?? {} }], { session });
}

/**
 * Newest-first activity for one or more groups, `limit` at a time. The cursor is the id of the
 * last item of the previous page; ObjectIds grow with time, so "_id < cursor" is the next page.
 * Names are looked up at read time so renamed people show their current name.
 */
export async function listActivity(
  groupIds: Types.ObjectId[],
  page: { limit: number; cursor?: string },
) {
  if (page.cursor !== undefined && !Types.ObjectId.isValid(page.cursor)) {
    throw badRequest('Invalid cursor');
  }
  const docs = await Activity.find({
    group: { $in: groupIds },
    ...(page.cursor ? { _id: { $lt: new Types.ObjectId(page.cursor) } } : {}),
  })
    .sort({ _id: -1 })
    .limit(page.limit + 1)
    .lean<ActivityDoc[]>();

  const items = docs.slice(0, page.limit);
  const userIds = items.flatMap((a) =>
    [a.actor.toString(), a.data.from, a.data.to].filter((v): v is string => typeof v === 'string'),
  );
  const [users, groups] = await Promise.all([
    usersById(userIds),
    Group.find({ _id: { $in: [...new Set(items.map((a) => a.group.toString()))] } })
      .select('name currency')
      .lean<Pick<GroupDoc, '_id' | 'name' | 'currency'>[]>(),
  ]);
  const groupById = new Map(groups.map((g) => [g._id.toString(), g]));
  const nameOf = (id: unknown) =>
    typeof id === 'string' ? (users.get(id)?.name ?? 'Someone') : undefined;

  return {
    items: items.map((a) => {
      const group = groupById.get(a.group.toString());
      return {
        id: a._id.toString(),
        type: a.type,
        groupId: a.group.toString(),
        groupName: group?.name ?? '',
        currency: group?.currency ?? 'INR',
        actor: a.actor.toString(),
        actorName: nameOf(a.actor.toString()),
        expenseId: a.expense?.toString() ?? null,
        settlementId: a.settlement?.toString() ?? null,
        data: {
          ...a.data,
          ...(a.data.from ? { fromName: nameOf(a.data.from) } : {}),
          ...(a.data.to ? { toName: nameOf(a.data.to) } : {}),
        },
        createdAt: a.createdAt,
      };
    }),
    nextCursor: docs.length > page.limit ? items[items.length - 1]!._id.toString() : null,
  };
}
