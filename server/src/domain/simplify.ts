import type { Transfer } from './balances';
import { BinaryHeap } from './heap';

interface Party {
  user: string;
  amount: number;
}

// Larger amounts first; equal amounts by user id so the plan is deterministic.
const largestFirst = (a: Party, b: Party): boolean =>
  a.amount > b.amount || (a.amount === b.amount && a.user < b.user);

/**
 * Debt simplification: turns net balances into a short list of payments that settles everyone.
 *
 * Creditors (balance > 0) go into one max-heap and debtors (balance < 0) into another, keyed by
 * the amount. Each round pops the largest debtor and the largest creditor and has the debtor pay
 * min(debt, credit); whoever still has money left goes back into their heap.
 *
 * Every round settles at least one person completely, and the final round settles two (the
 * totals match), so k people with non-zero balances need at most k - 1 payments.
 * Time O(k log k), extra space O(k).
 *
 * Finding the true minimum is NP-hard (it means finding the most disjoint zero-sum subgroups);
 * see optimal.ts for an exact solver used to measure how close this greedy plan gets.
 */
export function simplifyDebts(balances: Iterable<readonly [string, number]>): Transfer[] {
  const creditors: Party[] = [];
  const debtors: Party[] = [];
  let total = 0;
  for (const [user, amount] of balances) {
    if (!Number.isSafeInteger(amount)) throw new TypeError(`Balance for ${user} is not an integer`);
    total += amount;
    if (amount > 0) creditors.push({ user, amount });
    else if (amount < 0) debtors.push({ user, amount: -amount });
  }
  if (total !== 0) throw new RangeError(`Balances must sum to zero, but they sum to ${total}`);

  const creditorHeap = new BinaryHeap(largestFirst, creditors);
  const debtorHeap = new BinaryHeap(largestFirst, debtors);
  const payments: Transfer[] = [];

  while (creditorHeap.size > 0 && debtorHeap.size > 0) {
    const creditor = creditorHeap.pop() as Party;
    const debtor = debtorHeap.pop() as Party;
    const amount = Math.min(creditor.amount, debtor.amount);
    payments.push({ from: debtor.user, to: creditor.user, amount });

    // The heaps hold their own copies, so the popped entries can be updated and reused.
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount > 0) creditorHeap.push(creditor);
    if (debtor.amount > 0) debtorHeap.push(debtor);
  }
  return payments;
}
