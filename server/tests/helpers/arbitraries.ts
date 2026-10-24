// fast-check generators for random groups, expenses, splits and settlements.
import fc from 'fast-check';
import type { Allocation, SplitInput, Transfer } from '../../src/domain';
import { FULL_PERCENT } from '../../src/domain';

/** Number of random cases per pure property. */
export const RUNS = 1_000;

export const userIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `u${i}`);

/** Random way to write `total` as a sum of 1..maxParts positive integers. */
export function compositionArb(total: number, maxParts: number): fc.Arbitrary<number[]> {
  const parts = Math.min(maxParts, total);
  if (parts <= 1) return fc.constant([total]);
  return fc
    .uniqueArray(fc.integer({ min: 1, max: total - 1 }), { maxLength: parts - 1 })
    .map((cuts) => {
      const points = [0, ...cuts.sort((a, b) => a - b), total];
      return points.slice(1).map((p, i) => p - points[i]!);
    });
}

/** Assigns a list of amounts to the first people in `users`. */
const assign = (users: string[], amounts: number[]): Allocation[] =>
  amounts.map((amount, i) => ({ user: users[i]!, amount }));

/** Any valid split of `total` among some of `users`, of any of the four types. */
export function splitArb(users: string[], total: number): fc.Arbitrary<SplitInput> {
  const someUsers = fc.shuffledSubarray(users, { minLength: 1 });
  return fc.oneof(
    someUsers.map((participants): SplitInput => ({ type: 'equal', participants })),
    someUsers.chain((people) =>
      compositionArb(total, people.length).map((amounts): SplitInput => ({
        type: 'exact',
        amounts: assign(people, amounts),
      })),
    ),
    someUsers.chain((people) =>
      compositionArb(FULL_PERCENT, people.length).map((weights): SplitInput => ({
        type: 'percentage',
        percents: weights.map((weight, i) => ({ user: people[i]!, weight })),
      })),
    ),
    someUsers.chain((people) =>
      fc
        .array(fc.integer({ min: 1, max: 10 }), {
          minLength: people.length,
          maxLength: people.length,
        })
        .map((weights): SplitInput => ({
          type: 'shares',
          shares: people.map((user, i) => ({ user, weight: weights[i]! })),
        })),
    ),
  );
}

export interface ExpenseCase {
  total: number;
  payers: Allocation[];
  split: SplitInput;
}

/** A random expense: 1-3 payers whose amounts add up to the total, plus a random split. */
export function expenseArb(users: string[], maxTotal = 2_000_000): fc.Arbitrary<ExpenseCase> {
  return fc.integer({ min: 1, max: maxTotal }).chain((total) =>
    fc
      .tuple(
        fc
          .shuffledSubarray(users, { minLength: 1, maxLength: Math.min(3, users.length) })
          .chain((payers) =>
            compositionArb(total, payers.length).map((amounts) => assign(payers, amounts)),
          ),
        splitArb(users, total),
      )
      .map(([payers, split]) => ({ total, payers, split })),
  );
}

export function settlementArb(users: string[]): fc.Arbitrary<Transfer> {
  return fc
    .record({
      from: fc.constantFrom(...users),
      to: fc.constantFrom(...users),
      amount: fc.integer({ min: 1, max: 1_000_000 }),
    })
    .filter((s) => s.from !== s.to);
}

/** A random group: 2-10 people, up to 25 expenses and up to 5 settlements. */
export const ledgerArb = fc.integer({ min: 2, max: 10 }).chain((n) => {
  const users = userIds(n);
  return fc.record({
    users: fc.constant(users),
    expenses: fc.array(expenseArb(users), { maxLength: 25 }),
    settlements: fc.array(settlementArb(users), { maxLength: 5 }),
  });
});

/** Random balances for up to `maxPeople` people that sum to zero (the last one balances it). */
export function zeroSumBalancesArb(maxPeople: number, maxAbs = 1_000_000): fc.Arbitrary<number[]> {
  return fc
    .array(fc.integer({ min: -maxAbs, max: maxAbs }), { minLength: 1, maxLength: maxPeople - 1 })
    .map((values) => [...values, -values.reduce((a, b) => a + b, 0)]);
}
