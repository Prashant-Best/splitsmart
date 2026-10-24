import fc from 'fast-check';
import {
  allocateByWeights,
  computeShares,
  SplitError,
  sumAmounts,
  validatePayers,
  type Weight,
} from '../../src/domain';
import { RUNS, splitArb, userIds } from '../helpers/arbitraries';

const amountOf = (allocations: { user: string; amount: number }[], user: string) =>
  allocations.find((a) => a.user === user)?.amount;

describe('computeShares', () => {
  it('splits equally and gives the leftover paisa to the first person by id', () => {
    expect(computeShares(10_000, { type: 'equal', participants: ['c', 'a', 'b'] })).toEqual([
      { user: 'a', amount: 3_334 },
      { user: 'b', amount: 3_333 },
      { user: 'c', amount: 3_333 },
    ]);
  });

  it('is deterministic whatever order the people are listed in', () => {
    const a = computeShares(1_001, { type: 'equal', participants: ['x', 'y', 'z'] });
    const b = computeShares(1_001, { type: 'equal', participants: ['z', 'x', 'y'] });
    expect(a).toEqual(b);
  });

  it('splits by shares', () => {
    const shares = computeShares(1_000, {
      type: 'shares',
      shares: [
        { user: 'a', weight: 2 },
        { user: 'b', weight: 1 },
        { user: 'c', weight: 1 },
      ],
    });
    expect(shares).toEqual([
      { user: 'a', amount: 500 },
      { user: 'b', amount: 250 },
      { user: 'c', amount: 250 },
    ]);
  });

  it('splits by percentages with two decimals', () => {
    const shares = computeShares(10_000, {
      type: 'percentage',
      percents: [
        { user: 'a', weight: 3_333 },
        { user: 'b', weight: 3_333 },
        { user: 'c', weight: 3_334 },
      ],
    });
    expect(shares.map((s) => s.amount)).toEqual([3_333, 3_333, 3_334]);
  });

  it('gives leftover paise to the largest remainders first', () => {
    // 100 paise at 1/3 - 1/3 - 1/3 by shares 1:1:1 is equal, but 2:2:3 has remainders that differ.
    const shares = computeShares(100, {
      type: 'shares',
      shares: [
        { user: 'a', weight: 2 },
        { user: 'b', weight: 2 },
        { user: 'c', weight: 3 },
      ],
    });
    // exact: 28.57, 28.57, 42.857 -> floors 28, 28, 42 (+2 left): .857 (c) then .571 (a, by id)
    expect(shares).toEqual([
      { user: 'a', amount: 29 },
      { user: 'b', amount: 28 },
      { user: 'c', amount: 43 },
    ]);
  });

  it('accepts exact amounts that add up to the total', () => {
    const shares = computeShares(1_500, {
      type: 'exact',
      amounts: [
        { user: 'b', amount: 1_000 },
        { user: 'a', amount: 500 },
      ],
    });
    expect(shares).toEqual([
      { user: 'a', amount: 500 },
      { user: 'b', amount: 1_000 },
    ]);
  });

  it.each([
    ['exact amounts that do not add up', { type: 'exact', amounts: [{ user: 'a', amount: 900 }] }],
    [
      'percentages that do not add up to 100',
      { type: 'percentage', percents: [{ user: 'a', weight: 9_000 }] },
    ],
    ['an empty equal split', { type: 'equal', participants: [] }],
    ['the same person twice', { type: 'equal', participants: ['a', 'a'] }],
    ['a zero share', { type: 'shares', shares: [{ user: 'a', weight: 0 }] }],
    ['a fractional share', { type: 'shares', shares: [{ user: 'a', weight: 1.5 }] }],
    ['too many shares', { type: 'shares', shares: [{ user: 'a', weight: 1_001 }] }],
  ] as const)('rejects %s', (_, split) => {
    expect(() => computeShares(1_000, split as never)).toThrow(SplitError);
  });

  it.each([0, -100, 1.5, 10_000_000_001])('rejects the amount %p', (amount) => {
    expect(() => computeShares(amount, { type: 'equal', participants: ['a'] })).toThrow(SplitError);
  });

  it('always adds up to the total, for every split type (property)', () => {
    const users = userIds(8);
    const caseArb = fc
      .integer({ min: 1, max: 10_000_000_000 })
      .chain((total) => splitArb(users, total).map((split) => ({ total, split })));
    fc.assert(
      fc.property(caseArb, ({ total, split }) => {
        const shares = computeShares(total, split);
        expect(sumAmounts(shares)).toBe(total);
        for (const s of shares) expect(Number.isSafeInteger(s.amount) && s.amount >= 0).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('allocateByWeights (largest remainder)', () => {
  const weightsArb = fc
    .uniqueArray(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 30 })
    .chain((ids) =>
      fc
        .array(fc.integer({ min: 1, max: 10_000 }), {
          minLength: ids.length,
          maxLength: ids.length,
        })
        .map((ws): Weight[] => ids.map((id, i) => ({ user: `u${id}`, weight: ws[i]! }))),
    );

  it('sums to the total and keeps every part within one paisa of the exact share', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e12 }), weightsArb, (total, weights) => {
        const parts = allocateByWeights(total, weights);
        expect(sumAmounts(parts)).toBe(total);
        // |part - total * w / W| < 1, checked exactly in integers: |part * W - total * w| < W
        const weightSum = BigInt(weights.reduce((s, w) => s + w.weight, 0));
        for (const w of weights) {
          const diff =
            BigInt(amountOf(parts, w.user)!) * weightSum - BigInt(total) * BigInt(w.weight);
          expect(diff < weightSum && diff > -weightSum).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('does not depend on the order of the input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e9 }),
        weightsArb.chain((w) =>
          fc.tuple(fc.constant(w), fc.shuffledSubarray(w, { minLength: w.length })),
        ),
        (total, [weights, shuffled]) => {
          expect(allocateByWeights(total, shuffled)).toEqual(allocateByWeights(total, weights));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('equal weights never differ by more than one paisa', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e9 }), fc.integer({ min: 1, max: 50 }), (total, n) => {
        const parts = allocateByWeights(
          total,
          userIds(n).map((user) => ({ user, weight: 1 })),
        );
        const amounts = parts.map((p) => p.amount);
        expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('validatePayers', () => {
  it('accepts several payers that add up to the total', () => {
    expect(
      validatePayers(1_000, [
        { user: 'b', amount: 600 },
        { user: 'a', amount: 400 },
      ]),
    ).toEqual([
      { user: 'a', amount: 400 },
      { user: 'b', amount: 600 },
    ]);
  });

  it('rejects payers that do not add up', () => {
    expect(() => validatePayers(1_000, [{ user: 'a', amount: 999 }])).toThrow(/add up to 9.99/);
  });

  it('rejects an empty list and duplicates', () => {
    expect(() => validatePayers(1_000, [])).toThrow(SplitError);
    expect(() =>
      validatePayers(1_000, [
        { user: 'a', amount: 500 },
        { user: 'a', amount: 500 },
      ]),
    ).toThrow(SplitError);
  });
});
