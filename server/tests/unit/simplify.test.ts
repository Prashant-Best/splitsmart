import fc from 'fast-check';
import { minPaymentsExact, simplifyDebts, type Transfer } from '../../src/domain';
import { RUNS, userIds, zeroSumBalancesArb } from '../helpers/arbitraries';

const toEntries = (amounts: number[]): [string, number][] =>
  amounts.map((amount, i) => [`u${String(i).padStart(2, '0')}`, amount]);

/** Applies payments to balances and returns what is left for everyone. */
function settle(entries: [string, number][], payments: Transfer[]): Map<string, number> {
  const left = new Map(entries);
  for (const p of payments) {
    left.set(p.from, (left.get(p.from) ?? 0) + p.amount);
    left.set(p.to, (left.get(p.to) ?? 0) - p.amount);
  }
  return left;
}

describe('simplifyDebts', () => {
  it('matches the largest debtor with the largest creditor', () => {
    const payments = simplifyDebts([
      ['asha', -500],
      ['bala', -300],
      ['chirag', 600],
      ['dev', 200],
    ]);
    expect(payments).toEqual([
      { from: 'asha', to: 'chirag', amount: 500 },
      { from: 'bala', to: 'dev', amount: 200 },
      { from: 'bala', to: 'chirag', amount: 100 },
    ]);
  });

  it('returns no payments when everyone is settled', () => {
    expect(simplifyDebts([])).toEqual([]);
    expect(
      simplifyDebts([
        ['a', 0],
        ['b', 0],
      ]),
    ).toEqual([]);
  });

  it('refuses balances that do not sum to zero', () => {
    expect(() =>
      simplifyDebts([
        ['a', 100],
        ['b', -99],
      ]),
    ).toThrow(/sum to zero/);
  });

  it('can be beaten by the exact solver: greedy is a heuristic, not optimal', () => {
    // {+600, -400, -200} and {+500, -500} each settle on their own: 3 payments.
    // Greedy pairs 600 with 500 first, breaking both groups, and needs 4.
    const amounts = [600, 500, -500, -400, -200];
    expect(simplifyDebts(toEntries(amounts))).toHaveLength(4);
    expect(minPaymentsExact(amounts)).toBe(3);
  });

  it('settles every balance to zero (property)', () => {
    fc.assert(
      fc.property(zeroSumBalancesArb(30), (amounts) => {
        const entries = toEntries(amounts);
        const left = settle(entries, simplifyDebts(entries));
        for (const amount of left.values()) expect(amount).toBe(0);
      }),
      { numRuns: RUNS },
    );
  });

  it('uses at most n - 1 payments for n people with a balance (property)', () => {
    fc.assert(
      fc.property(zeroSumBalancesArb(30), (amounts) => {
        const nonZero = amounts.filter((a) => a !== 0).length;
        expect(simplifyDebts(toEntries(amounts)).length).toBeLessThanOrEqual(
          Math.max(0, nonZero - 1),
        );
      }),
      { numRuns: RUNS },
    );
  });

  it('only debtors pay, only creditors receive, every payment is positive (property)', () => {
    fc.assert(
      fc.property(zeroSumBalancesArb(30), (amounts) => {
        const entries = toEntries(amounts);
        const balance = new Map(entries);
        for (const p of simplifyDebts(entries)) {
          expect(p.amount).toBeGreaterThan(0);
          expect(Number.isSafeInteger(p.amount)).toBe(true);
          expect(balance.get(p.from)).toBeLessThan(0);
          expect(balance.get(p.to)).toBeGreaterThan(0);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('is deterministic and never needs more payments than the exact optimum allows (property)', () => {
    fc.assert(
      fc.property(zeroSumBalancesArb(9, 5_000), (amounts) => {
        const entries = toEntries(amounts);
        const payments = simplifyDebts(entries);
        expect(simplifyDebts([...entries].reverse())).toEqual(payments);
        const optimum = minPaymentsExact(amounts);
        const nonZero = amounts.filter((a) => a !== 0).length;
        expect(payments.length).toBeGreaterThanOrEqual(optimum);
        expect(payments.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      }),
      { numRuns: RUNS },
    );
  });

  it('handles 100,000 people quickly (O(n log n))', () => {
    const users = userIds(100_000);
    const amounts = users.map((_, i) => (i % 2 === 0 ? 1_000 + i : -(1_000 + i - 1)));
    amounts[amounts.length - 1]! -= amounts.reduce((a, b) => a + b, 0);
    const start = performance.now();
    const payments = simplifyDebts(users.map((u, i) => [u, amounts[i]!]));
    expect(performance.now() - start).toBeLessThan(2_000);
    expect(payments.length).toBeLessThan(100_000);
  });
});

describe('minPaymentsExact', () => {
  it.each([
    [[], 0],
    [[0, 0], 0],
    [[100, -100], 1],
    [[10, -10, 20, -20], 2],
    [[30, -10, -20], 2],
    [[600, 500, -500, -400, -200], 3],
  ])('needs %p -> %p payments', (amounts, expected) => {
    expect(minPaymentsExact(amounts)).toBe(expected);
  });

  it('rejects inputs that are too large or do not balance', () => {
    expect(() => minPaymentsExact(Array.from({ length: 22 }, (_, i) => (i % 2 ? 1 : -1)))).toThrow(
      RangeError,
    );
    expect(() => minPaymentsExact([5, -4])).toThrow(RangeError);
  });
});
