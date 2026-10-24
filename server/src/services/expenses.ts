import { Types, type QueryFilter } from 'mongoose';
import { inTransaction } from '../db';
import {
  combine,
  computeShares,
  expenseDeltas,
  negate,
  validatePayers,
  type Allocation,
  type Category,
  type SplitType,
  type Weight,
} from '../domain';
import { badRequest, conflict, notFound } from '../errors';
import { Expense, type ChangeDoc, type ExpenseDoc, type GroupDoc } from '../models';
import type { ExpenseInput, ExpenseUpdate } from '../schemas/expense';
import { logActivity } from './activity';
import { applyBalanceDeltas, assertBalanced, toLedgerExpense } from './ledger';
import { dateFromDay, isoDay } from './serializers';
import { receiptStorage, sniffReceiptType } from './storage';

/** An expense after validation, with everyone's share computed. User ids are strings. */
interface PreparedExpense {
  description: string;
  category: Category;
  amount: number;
  date: Date;
  notes: string;
  payers: Allocation[];
  splitType: SplitType;
  splitWeights: Weight[];
  shares: Allocation[];
}

const EARLIEST = dateFromDay('2000-01-01');

/**
 * Validates an expense and computes the shares with the pure domain module. Throws 400 if the
 * numbers do not add up or someone is not in the group. Members are never removed from a group,
 * so checking against the member list loaded before the transaction is safe.
 */
function prepareExpense(group: GroupDoc, input: ExpenseInput): PreparedExpense {
  const payers = validatePayers(input.amount, input.payers);
  const shares = computeShares(input.amount, input.split);

  const members = new Set(group.members.map((m) => m.user.toString()));
  const everyone = [...payers, ...shares].map((a) => a.user);
  if (!everyone.every((user) => members.has(user))) {
    throw badRequest('Everyone in an expense must be a member of the group', 'NOT_A_MEMBER');
  }

  const date = dateFromDay(input.date);
  const latest = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(date.getTime()) || date < EARLIEST || date > latest) {
    throw badRequest('Pick a date between 2000 and next year');
  }

  const split = input.split;
  const splitWeights =
    split.type === 'percentage' ? split.percents : split.type === 'shares' ? split.shares : [];

  return {
    description: input.description,
    category: input.category,
    amount: input.amount,
    date,
    notes: input.notes,
    payers,
    splitType: split.type,
    splitWeights: [...splitWeights].sort((a, b) => (a.user < b.user ? -1 : 1)),
    shares,
  };
}

const plainAllocations = (items: { user: { toString(): string }; amount: number }[]) =>
  items.map((a) => ({ user: a.user.toString(), amount: a.amount }));

const plainWeights = (items: { user: { toString(): string }; weight: number }[]) =>
  items.map((w) => ({ user: w.user.toString(), weight: w.weight }));

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Field-level differences between a stored expense and its edited version, for the history. */
function describeChanges(before: ExpenseDoc, after: PreparedExpense): ChangeDoc[] {
  const changes: ChangeDoc[] = [];
  for (const field of ['description', 'category', 'amount', 'notes'] as const) {
    if (before[field] !== after[field])
      changes.push({ field, from: before[field], to: after[field] });
  }
  if (isoDay(before.date) !== isoDay(after.date)) {
    changes.push({ field: 'date', from: isoDay(before.date), to: isoDay(after.date) });
  }
  const oldPayers = plainAllocations(before.payers);
  if (!sameJson(oldPayers, after.payers)) {
    changes.push({ field: 'payers', from: oldPayers, to: after.payers });
  }
  const oldSplit = {
    type: before.splitType,
    weights: plainWeights(before.splitWeights),
    shares: plainAllocations(before.shares),
  };
  const newSplit = { type: after.splitType, weights: after.splitWeights, shares: after.shares };
  if (!sameJson(oldSplit, newSplit)) changes.push({ field: 'split', from: oldSplit, to: newSplit });
  return changes;
}

/**
 * Creates an expense. The expense, the balance changes of everyone involved and the activity
 * entry are written in one transaction: all of them commit, or none do.
 */
export async function createExpense(group: GroupDoc, actorId: string, input: ExpenseInput) {
  const data = prepareExpense(group, input);
  return inTransaction(async (session) => {
    const [expense] = await Expense.create(
      [{ ...data, group: group._id, createdBy: actorId, updatedBy: actorId }],
      { session },
    );
    await applyBalanceDeltas(group._id, expenseDeltas(data), session);
    await assertBalanced(group._id, session);
    await logActivity(
      {
        group: group._id,
        actor: actorId,
        type: 'expense.created',
        expense: expense!._id,
        data: { description: data.description, amount: data.amount },
      },
      session,
    );
    return expense!.toObject<ExpenseDoc>();
  });
}

/**
 * Edits an expense. Balances move by (new effect - old effect), computed from the stored
 * version read inside the transaction. `version` must match the stored one, otherwise someone
 * else saved in between and the request fails with 409 instead of silently overwriting them.
 */
export async function updateExpense(
  group: GroupDoc,
  actorId: string,
  expenseId: string,
  input: ExpenseUpdate,
) {
  const data = prepareExpense(group, input);
  return inTransaction(async (session) => {
    const expense = await Expense.findOne({
      _id: expenseId,
      group: group._id,
      deletedAt: null,
    }).session(session);
    if (!expense) throw notFound('Expense');
    if (expense.version !== input.version) {
      throw conflict(
        'Someone else changed this expense. Reload it and try again.',
        'VERSION_CONFLICT',
      );
    }

    const changes = describeChanges(expense, data);
    if (changes.length === 0) return expense.toObject<ExpenseDoc>();

    const oldDeltas = expenseDeltas(toLedgerExpense(expense));
    expense.set({ ...data, updatedBy: actorId, version: expense.version + 1 });
    expense.history.push({ editedBy: new Types.ObjectId(actorId), editedAt: new Date(), changes });
    await expense.save({ session });

    await applyBalanceDeltas(group._id, combine(negate(oldDeltas), expenseDeltas(data)), session);
    await assertBalanced(group._id, session);
    await logActivity(
      {
        group: group._id,
        actor: actorId,
        type: 'expense.updated',
        expense: expense._id,
        data: {
          description: data.description,
          amount: data.amount,
          fields: changes.map((c) => c.field),
        },
      },
      session,
    );
    return expense.toObject<ExpenseDoc>();
  });
}

/** Soft-deletes an expense and reverses its effect on balances, in one transaction. */
export async function deleteExpense(group: GroupDoc, actorId: string, expenseId: string) {
  await inTransaction(async (session) => {
    const expense = await Expense.findOne({
      _id: expenseId,
      group: group._id,
      deletedAt: null,
    }).session(session);
    if (!expense) throw notFound('Expense');
    expense.set({ deletedAt: new Date(), deletedBy: actorId, version: expense.version + 1 });
    await expense.save({ session });
    await applyBalanceDeltas(group._id, negate(expenseDeltas(toLedgerExpense(expense))), session);
    await assertBalanced(group._id, session);
    await logActivity(
      {
        group: group._id,
        actor: actorId,
        type: 'expense.deleted',
        expense: expense._id,
        data: { description: expense.description, amount: expense.amount },
      },
      session,
    );
  });
}

export async function getExpense(group: GroupDoc, expenseId: string) {
  const expense = await Expense.findOne({
    _id: expenseId,
    group: group._id,
    deletedAt: null,
  }).lean<ExpenseDoc>();
  if (!expense) throw notFound('Expense');
  return expense;
}

// Cursor = "<date ms>_<id>" of the last item, base64url-encoded.
const encodeCursor = (e: ExpenseDoc) =>
  Buffer.from(`${e.date.getTime()}_${e._id.toString()}`).toString('base64url');

function decodeCursor(cursor: string): { date: Date; id: Types.ObjectId } {
  const [ms, id] = Buffer.from(cursor, 'base64url').toString().split('_');
  const date = new Date(Number(ms));
  if (!id || !Types.ObjectId.isValid(id) || Number.isNaN(date.getTime())) {
    throw badRequest('Invalid cursor');
  }
  return { date, id: new Types.ObjectId(id) };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Newest first by date; keyset pagination stays fast and stable while expenses are added. */
export async function listExpenses(
  group: GroupDoc,
  query: { limit: number; cursor?: string; category?: Category; search?: string },
) {
  const filter: QueryFilter<ExpenseDoc> = { group: group._id, deletedAt: null };
  if (query.category) filter.category = query.category;
  // User text is escaped so it is matched literally (no regex injection or ReDoS).
  if (query.search) filter.description = { $regex: escapeRegExp(query.search), $options: 'i' };
  if (query.cursor) {
    const { date, id } = decodeCursor(query.cursor);
    filter.$or = [{ date: { $lt: date } }, { date, _id: { $lt: id } }];
  }
  const docs = await Expense.find(filter)
    .sort({ date: -1, _id: -1 })
    .limit(query.limit + 1)
    .lean<ExpenseDoc[]>();
  const items = docs.slice(0, query.limit);
  return {
    items,
    nextCursor: docs.length > query.limit ? encodeCursor(items[items.length - 1]!) : null,
  };
}

/**
 * Stores a receipt file and links it to the expense. The file is written before the
 * transaction (a transaction can be retried, a file write cannot be rolled back), and deleted
 * again if the transaction fails. The replaced file, if any, is removed after the commit.
 */
export async function attachReceipt(
  group: GroupDoc,
  actorId: string,
  expenseId: string,
  file: { buffer: Buffer; size: number; originalname: string },
) {
  const type = sniffReceiptType(file.buffer);
  if (!type) throw badRequest('Receipts must be JPEG, PNG, WebP or PDF files', 'UNSUPPORTED_FILE');

  const key = await receiptStorage.save(file.buffer, type.ext);
  let replacedKey: string | undefined;
  let saved: ExpenseDoc;
  try {
    saved = await inTransaction(async (session) => {
      const expense = await Expense.findOne({
        _id: expenseId,
        group: group._id,
        deletedAt: null,
      }).session(session);
      if (!expense) throw notFound('Expense');
      replacedKey = expense.receipt?.key;
      expense.receipt = {
        key,
        mimeType: type.mime,
        size: file.size,
        originalName: file.originalname.slice(0, 120) || 'receipt',
        uploadedBy: new Types.ObjectId(actorId),
        uploadedAt: new Date(),
      };
      await expense.save({ session });
      await logActivity(
        {
          group: group._id,
          actor: actorId,
          type: 'receipt.added',
          expense: expense._id,
          data: { description: expense.description },
        },
        session,
      );
      return expense.toObject<ExpenseDoc>();
    });
  } catch (err) {
    await receiptStorage.remove(key);
    throw err;
  }
  if (replacedKey) await receiptStorage.remove(replacedKey);
  return saved;
}

export async function removeReceipt(group: GroupDoc, actorId: string, expenseId: string) {
  let removedKey: string | undefined;
  await inTransaction(async (session) => {
    const expense = await Expense.findOne({
      _id: expenseId,
      group: group._id,
      deletedAt: null,
    }).session(session);
    if (!expense?.receipt) throw notFound('Receipt');
    removedKey = expense.receipt.key;
    expense.receipt = null;
    await expense.save({ session });
    await logActivity(
      {
        group: group._id,
        actor: actorId,
        type: 'receipt.removed',
        expense: expense._id,
        data: { description: expense.description },
      },
      session,
    );
  });
  if (removedKey) await receiptStorage.remove(removedKey);
}

/** Opens the receipt file of an expense in the group (members only, enforced by the route). */
export async function openReceipt(group: GroupDoc, expenseId: string) {
  const expense = await getExpense(group, expenseId);
  if (!expense.receipt) throw notFound('Receipt');
  try {
    return { stream: await receiptStorage.open(expense.receipt.key), receipt: expense.receipt };
  } catch {
    throw notFound('Receipt');
  }
}
