import { Types, type ClientSession } from 'mongoose';
import { inTransaction } from '../db';
import {
  computeBalances,
  pairwiseDebts,
  simplifyDebts,
  totalOf,
  type Balances,
  type LedgerExpense,
  type Transfer,
} from '../domain';
import { notFound } from '../errors';
import {
  Expense,
  Group,
  Settlement,
  type ExpenseDoc,
  type GroupDoc,
  type SettlementDoc,
} from '../models';

/** The money-relevant part of a stored expense, with user ids as strings. */
export function toLedgerExpense(expense: Pick<ExpenseDoc, 'payers' | 'shares'>): LedgerExpense {
  return {
    payers: expense.payers.map((p) => ({ user: p.user.toString(), amount: p.amount })),
    shares: expense.shares.map((s) => ({ user: s.user.toString(), amount: s.amount })),
  };
}

export function toTransfer(settlement: Pick<SettlementDoc, 'from' | 'to' | 'amount'>): Transfer {
  return {
    from: settlement.from.toString(),
    to: settlement.to.toString(),
    amount: settlement.amount,
  };
}

/**
 * Adds balance deltas to the members of a group in one atomic update, inside the caller's
 * transaction. `$inc` with array filters changes several members' balances in a single write:
 *   { $inc: { "members.$[m0].balance": 600, "members.$[m1].balance": -600 } }
 */
export async function applyBalanceDeltas(
  groupId: Types.ObjectId,
  deltas: Balances,
  session: ClientSession,
): Promise<void> {
  const changes = [...deltas].filter(([, delta]) => delta !== 0);
  if (changes.length === 0) return;

  const $inc: Record<string, number> = {};
  const arrayFilters: Record<string, Types.ObjectId>[] = [];
  changes.forEach(([user, delta], i) => {
    $inc[`members.$[m${i}].balance`] = delta;
    arrayFilters.push({ [`m${i}.user`]: new Types.ObjectId(user) });
  });
  const result = await Group.updateOne({ _id: groupId }, { $inc }, { session, arrayFilters });
  if (result.matchedCount !== 1) throw notFound('Group');
}

/**
 * Defence in depth: re-reads the group inside the transaction and aborts it if the balances no
 * longer sum to zero. (An array filter that matched no member would skip its delta silently;
 * this check turns that into a failed request instead of a corrupted group.)
 */
export async function assertBalanced(
  groupId: Types.ObjectId,
  session: ClientSession,
): Promise<void> {
  const group = await Group.findById(groupId).select('members').session(session).lean<GroupDoc>();
  if (!group) throw notFound('Group');
  const total = totalOf(group.members.map((m) => [m.user.toString(), m.balance] as const));
  if (total !== 0) {
    throw new Error(`Invariant violated: group ${groupId.toString()} balances sum to ${total}`);
  }
}

/** Every live expense and settlement of a group, read inside `session`. */
async function loadLedger(groupId: Types.ObjectId, session: ClientSession) {
  // Sequential on purpose: operations in one transaction must not run in parallel.
  const expenses = await Expense.find({ group: groupId, deletedAt: null })
    .select('payers shares')
    .session(session)
    .lean<Pick<ExpenseDoc, 'payers' | 'shares'>[]>();
  const settlements = await Settlement.find({ group: groupId, deletedAt: null })
    .select('from to amount')
    .session(session)
    .lean<Pick<SettlementDoc, 'from' | 'to' | 'amount'>[]>();
  return { expenses: expenses.map(toLedgerExpense), settlements: settlements.map(toTransfer) };
}

/**
 * Balances, the simplified settle-up plan and the unsimplified pairwise debts of a group.
 * Everything is read in one snapshot transaction, so the stored balances and the ledger they
 * are compared with are from the same instant; `consistent` reports whether they agree.
 */
export async function getBalanceSummary(groupId: Types.ObjectId) {
  return inTransaction(async (session) => {
    const group = await Group.findById(groupId).session(session).lean<GroupDoc>();
    if (!group) throw notFound('Group');
    const { expenses, settlements } = await loadLedger(groupId, session);

    const stored: Balances = new Map(group.members.map((m) => [m.user.toString(), m.balance]));
    const recomputed = computeBalances(expenses, settlements);
    const consistent = group.members.every(
      (m) => m.balance === (recomputed.get(m.user.toString()) ?? 0),
    );

    return {
      currency: group.currency,
      balances: group.members.map((m) => ({ user: m.user.toString(), balance: m.balance })),
      simplified: simplifyDebts(stored),
      pairwise: pairwiseDebts(expenses, settlements),
      total: totalOf(stored),
      consistent,
    };
  });
}
