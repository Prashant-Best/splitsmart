import { simplifyDebts } from './simplify';
import type { Allocation } from './splits';

/**
 * Net balance per user in paise. Positive: the group owes them money (creditor).
 * Negative: they owe the group (debtor). In a consistent group all balances sum to exactly 0.
 */
export type Balances = Map<string, number>;

/** The money-relevant part of an expense. */
export interface LedgerExpense {
  payers: readonly Allocation[];
  shares: readonly Allocation[];
}

/** A payment from one person to another (a recorded settlement or a suggested one). */
export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

function add(balances: Balances, user: string, delta: number): void {
  const next = (balances.get(user) ?? 0) + delta;
  if (next === 0) balances.delete(user);
  else balances.set(user, next);
}

/**
 * How one expense moves balances: each payer goes up by what they paid, each participant goes
 * down by their share. Because paid amounts and shares both add up to the expense total, the
 * deltas always sum to zero.
 */
export function expenseDeltas(expense: LedgerExpense): Balances {
  const deltas: Balances = new Map();
  for (const payer of expense.payers) add(deltas, payer.user, payer.amount);
  for (const share of expense.shares) add(deltas, share.user, -share.amount);
  return deltas;
}

/** A payment from `from` to `to`: the payer now owes less (+), the receiver is owed less (-). */
export function transferDeltas(transfer: Transfer): Balances {
  const deltas: Balances = new Map();
  add(deltas, transfer.from, transfer.amount);
  add(deltas, transfer.to, -transfer.amount);
  return deltas;
}

/** Adds several sets of deltas together. */
export function combine(...parts: Balances[]): Balances {
  const result: Balances = new Map();
  for (const part of parts) for (const [user, delta] of part) add(result, user, delta);
  return result;
}

/** The deltas that undo `deltas` (used when an expense is edited or deleted). */
export function negate(deltas: Balances): Balances {
  const result: Balances = new Map();
  for (const [user, delta] of deltas) result.set(user, -delta);
  return result;
}

/** Recomputes every balance from scratch from the ledger (the source of truth). */
export function computeBalances(
  expenses: Iterable<LedgerExpense>,
  settlements: Iterable<Transfer>,
): Balances {
  const balances: Balances = new Map();
  for (const expense of expenses) {
    for (const [user, delta] of expenseDeltas(expense)) add(balances, user, delta);
  }
  for (const settlement of settlements) {
    for (const [user, delta] of transferDeltas(settlement)) add(balances, user, delta);
  }
  return balances;
}

/** Sum of all balances. Zero for every valid ledger. */
export function totalOf(balances: Iterable<readonly [string, number]>): number {
  let total = 0;
  for (const [, amount] of balances) total += amount;
  return total;
}

/**
 * "Who owes whom" without simplification across expenses: within each expense, the people who
 * paid less than their share owe the people who paid more (with one payer, every participant
 * simply owes the payer their share). Settlements reduce the payer's debt, and debts between the
 * same two people are netted (A owes B ₹300 and B owes A ₹100 become A owes B ₹200).
 *
 * Each expense's debts come from running the settle-up algorithm on that expense alone, which
 * is exact. (Rounding every share across several payers separately is not: it can drop a paisa
 * from one payer and give it to another. A property test found exactly that.)
 */
export function pairwiseDebts(
  expenses: Iterable<LedgerExpense>,
  settlements: Iterable<Transfer>,
): Transfer[] {
  // Key "a|b" with a < b; a positive value means a owes b, negative means b owes a.
  const net = new Map<string, number>();
  const owe = (debtor: string, creditor: string, amount: number): void => {
    if (debtor === creditor || amount === 0) return;
    const [key, sign] =
      debtor < creditor ? [`${debtor}|${creditor}`, 1] : [`${creditor}|${debtor}`, -1];
    net.set(key, (net.get(key) ?? 0) + sign * amount);
  };

  for (const expense of expenses) {
    for (const t of simplifyDebts(expenseDeltas(expense))) owe(t.from, t.to, t.amount);
  }
  // Paying someone back is the same as them now owing you that amount, before netting.
  for (const s of settlements) owe(s.to, s.from, s.amount);

  const transfers: Transfer[] = [];
  for (const [key, amount] of net) {
    if (amount === 0) continue;
    const [a, b] = key.split('|') as [string, string];
    transfers.push(amount > 0 ? { from: a, to: b, amount } : { from: b, to: a, amount: -amount });
  }
  return transfers.sort((x, y) => y.amount - x.amount || (x.from < y.from ? -1 : 1));
}
