// Map database documents to the JSON the API returns. Only listed fields leave the server, so
// internal fields (password hashes, file keys, token versions) can never leak by accident.
import type { Types } from 'mongoose';
import type { ExpenseDoc, GroupDoc, SettlementDoc, UserDoc } from '../models';

type Id = Types.ObjectId | string;
const str = (id: Id): string => id.toString();

/** Calendar day of a stored date ("2026-10-24"). Dates are stored at 12:00 UTC. */
export const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** Stored at noon UTC so the same calendar day shows in every time zone from UTC-11 to UTC+11. */
export const dateFromDay = (day: string): Date => new Date(`${day}T12:00:00.000Z`);

export type PublicUser = Pick<UserDoc, '_id' | 'name' | 'email' | 'upiId'>;

export function userDto(
  user: Pick<UserDoc, '_id' | 'name' | 'email' | 'upiId' | 'emailReminders'>,
) {
  return {
    id: str(user._id),
    name: user.name,
    email: user.email,
    upiId: user.upiId ?? null,
    emailReminders: user.emailReminders,
  };
}

export function groupDto(group: GroupDoc, users: Map<string, PublicUser>) {
  return {
    id: str(group._id),
    name: group.name,
    currency: group.currency,
    inviteCode: group.inviteCode,
    createdBy: str(group.createdBy),
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    members: group.members.map((m) => {
      const user = users.get(str(m.user));
      return {
        id: str(m.user),
        name: user?.name ?? 'Unknown member',
        email: user?.email ?? '',
        upiId: user?.upiId ?? null,
        role: m.role,
        balance: m.balance,
        joinedAt: m.joinedAt,
      };
    }),
  };
}

const allocations = (items: { user: Id; amount: number }[]) =>
  items.map((a) => ({ user: str(a.user), amount: a.amount }));

export function expenseDto(expense: ExpenseDoc, options: { history?: boolean } = {}) {
  return {
    id: str(expense._id),
    groupId: str(expense.group),
    description: expense.description,
    category: expense.category,
    amount: expense.amount,
    date: isoDay(expense.date),
    notes: expense.notes,
    payers: allocations(expense.payers),
    split: {
      type: expense.splitType,
      weights: expense.splitWeights.map((w) => ({ user: str(w.user), weight: w.weight })),
    },
    shares: allocations(expense.shares),
    receipt: expense.receipt
      ? {
          mimeType: expense.receipt.mimeType,
          size: expense.receipt.size,
          originalName: expense.receipt.originalName,
          uploadedAt: expense.receipt.uploadedAt,
        }
      : null,
    version: expense.version,
    createdBy: str(expense.createdBy),
    updatedBy: str(expense.updatedBy),
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    ...(options.history
      ? {
          history: expense.history.map((h) => ({
            editedBy: str(h.editedBy),
            editedAt: h.editedAt,
            changes: h.changes.map((c) => ({ field: c.field, from: c.from, to: c.to })),
          })),
        }
      : {}),
  };
}

export function settlementDto(settlement: SettlementDoc) {
  return {
    id: str(settlement._id),
    groupId: str(settlement.group),
    from: str(settlement.from),
    to: str(settlement.to),
    amount: settlement.amount,
    method: settlement.method,
    note: settlement.note,
    createdBy: str(settlement.createdBy),
    createdAt: settlement.createdAt,
  };
}
