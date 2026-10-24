import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { inTransaction } from '../db';
import { MAX_GROUP_MEMBERS, type Currency } from '../domain';
import { conflict, forbidden, notFound } from '../errors';
import { Group, type GroupDoc } from '../models';
import { logActivity } from './activity';
import { groupDto } from './serializers';
import { usersById } from './users';

/** 72 random bits, URL-safe: invite links cannot be guessed. */
export const newInviteCode = (): string => randomBytes(9).toString('base64url');

export function isMember(group: GroupDoc, userId: string): boolean {
  return group.members.some((m) => m.user.equals(userId));
}

function assertOwner(group: GroupDoc, userId: string): void {
  const member = group.members.find((m) => m.user.equals(userId));
  if (member?.role !== 'owner') throw forbidden('Only the group owner can do that');
}

export async function createGroup(
  ownerId: string,
  input: { name: string; currency: Currency },
): Promise<Types.ObjectId> {
  return inTransaction(async (session) => {
    const [group] = await Group.create(
      [
        {
          name: input.name,
          currency: input.currency,
          createdBy: ownerId,
          members: [{ user: ownerId, role: 'owner', balance: 0 }],
          inviteCode: newInviteCode(),
        },
      ],
      { session },
    );
    await logActivity(
      { group: group!._id, actor: ownerId, type: 'group.created', data: { name: input.name } },
      session,
    );
    return group!._id;
  });
}

/** Group with member names, emails, UPI IDs and balances. */
export async function getGroupDetail(groupId: Types.ObjectId) {
  const group = await Group.findById(groupId).lean<GroupDoc>();
  if (!group) throw notFound('Group');
  return groupDto(group, await usersById(group.members.map((m) => m.user)));
}

/** The user's groups, most recently active first, with their own balance in each. */
export async function listGroups(userId: string) {
  const groups = await Group.find({ 'members.user': userId })
    .sort({ updatedAt: -1 })
    .lean<GroupDoc[]>();
  const users = await usersById(groups.flatMap((g) => g.members.map((m) => m.user)));
  return groups.map((g) => ({
    id: g._id.toString(),
    name: g.name,
    currency: g.currency,
    updatedAt: g.updatedAt,
    members: g.members.map((m) => ({
      id: m.user.toString(),
      name: users.get(m.user.toString())?.name ?? 'Unknown member',
    })),
    myBalance: g.members.find((m) => m.user.equals(userId))?.balance ?? 0,
  }));
}

export async function renameGroup(group: GroupDoc, actorId: string, name: string): Promise<void> {
  assertOwner(group, actorId);
  if (name === group.name) return;
  await inTransaction(async (session) => {
    await Group.updateOne({ _id: group._id }, { $set: { name } }, { session });
    await logActivity(
      {
        group: group._id,
        actor: actorId,
        type: 'group.renamed',
        data: { name, previousName: group.name },
      },
      session,
    );
  });
}

/** Replaces the invite code, so links shared earlier stop working. */
export async function resetInvite(group: GroupDoc, actorId: string): Promise<string> {
  assertOwner(group, actorId);
  const inviteCode = newInviteCode();
  await inTransaction(async (session) => {
    await Group.updateOne({ _id: group._id }, { $set: { inviteCode } }, { session });
    await logActivity({ group: group._id, actor: actorId, type: 'invite.reset' }, session);
  });
  return inviteCode;
}

async function findByInvite(code: string): Promise<GroupDoc> {
  const group = await Group.findOne({ inviteCode: code }).lean<GroupDoc>();
  if (!group) throw notFound('Invite link');
  return group;
}

export async function previewInvite(code: string, userId: string) {
  const group = await findByInvite(code);
  return {
    group: {
      id: group._id.toString(),
      name: group.name,
      currency: group.currency,
      memberCount: group.members.length,
    },
    alreadyMember: isMember(group, userId),
  };
}

/**
 * Adds the user to the group behind an invite code. The update itself checks that the code is
 * still valid, that the user is not already a member and that the group is not full, so two
 * simultaneous joins cannot add someone twice or overfill the group.
 */
export async function joinGroup(code: string, userId: string) {
  const group = await findByInvite(code);
  if (isMember(group, userId)) return { groupId: group._id.toString(), joined: false };
  if (group.members.length >= MAX_GROUP_MEMBERS) throw conflict('This group is full');

  const joined = await inTransaction(async (session) => {
    const result = await Group.updateOne(
      {
        _id: group._id,
        inviteCode: code,
        'members.user': { $ne: userId },
        [`members.${MAX_GROUP_MEMBERS - 1}`]: { $exists: false },
      },
      { $push: { members: { user: userId, role: 'member', balance: 0, joinedAt: new Date() } } },
      { session },
    );
    if (result.modifiedCount === 0) return false;
    await logActivity({ group: group._id, actor: userId, type: 'member.joined' }, session);
    return true;
  });

  if (!joined) {
    const latest = await Group.findById(group._id).lean<GroupDoc>();
    if (!latest || !isMember(latest, userId)) {
      throw conflict('This invite link has expired or the group is full');
    }
  }
  return { groupId: group._id.toString(), joined };
}
