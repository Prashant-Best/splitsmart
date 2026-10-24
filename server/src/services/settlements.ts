import { inTransaction } from '../db';
import { negate, transferDeltas } from '../domain';
import { badRequest, notFound } from '../errors';
import { Settlement, type GroupDoc, type SettlementDoc } from '../models';
import type { SettlementInput } from '../schemas/settlement';
import { logActivity } from './activity';
import { applyBalanceDeltas, assertBalanced, toTransfer } from './ledger';

/**
 * Records a payment between two members ("settle up"), e.g. after paying through the UPI link.
 * The payment and both balance changes are one transaction.
 */
export async function createSettlement(group: GroupDoc, actorId: string, input: SettlementInput) {
  const members = new Set(group.members.map((m) => m.user.toString()));
  if (!members.has(input.from) || !members.has(input.to)) {
    throw badRequest('Both people must be members of the group', 'NOT_A_MEMBER');
  }
  return inTransaction(async (session) => {
    const [settlement] = await Settlement.create(
      [{ ...input, group: group._id, createdBy: actorId }],
      { session },
    );
    await applyBalanceDeltas(group._id, transferDeltas(input), session);
    await assertBalanced(group._id, session);
    await logActivity(
      {
        group: group._id,
        actor: actorId,
        type: 'settlement.created',
        settlement: settlement!._id,
        data: { from: input.from, to: input.to, amount: input.amount, method: input.method },
      },
      session,
    );
    return settlement!.toObject<SettlementDoc>();
  });
}

/** Undoes a recorded payment (soft delete) and restores both balances. */
export async function deleteSettlement(group: GroupDoc, actorId: string, settlementId: string) {
  await inTransaction(async (session) => {
    const settlement = await Settlement.findOne({
      _id: settlementId,
      group: group._id,
      deletedAt: null,
    }).session(session);
    if (!settlement) throw notFound('Payment');
    settlement.set({ deletedAt: new Date(), deletedBy: actorId });
    await settlement.save({ session });
    await applyBalanceDeltas(group._id, negate(transferDeltas(toTransfer(settlement))), session);
    await assertBalanced(group._id, session);
    await logActivity(
      {
        group: group._id,
        actor: actorId,
        type: 'settlement.deleted',
        settlement: settlement._id,
        data: {
          from: settlement.from.toString(),
          to: settlement.to.toString(),
          amount: settlement.amount,
        },
      },
      session,
    );
  });
}

export async function listSettlements(group: GroupDoc, limit = 100) {
  return Settlement.find({ group: group._id, deletedAt: null })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<SettlementDoc[]>();
}
