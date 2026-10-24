import fc from 'fast-check';
import {
  combine,
  computeBalances,
  computeShares,
  expenseDeltas,
  negate,
  pairwiseDebts,
  simplifyDebts,
  totalOf,
  type Balances,
  type LedgerExpense,
} from '../../src/domain';
import { expenseArb, ledgerArb, RUNS, userIds, type ExpenseCase } from '../helpers/arbitraries';

const toLedger = ({ total, payers, split }: ExpenseCase): LedgerExpense => ({
  payers,
  shares: computeShares(total, split),
});

const asObject = (balances: Balances) => Object.fromEntries([...balances].sort());

describe('balances', () => {
  it('moves payers up by what they paid and participants down by their share', () => {
    const deltas = expenseDeltas({
      payers: [{ user: 'a', amount: 900 }],
      shares: [
        { user: 'a', amount: 300 },
        { user: 'b', amount: 300 },
        { user: 'c', amount: 300 },
      ],
    });
    expect(asObject(deltas)).toEqual({ a: 600, b: -300, c: -300 });
  });

  it('applies settlements: the payer owes less and the receiver is owed less', () => {
    const balances = computeBalances(
      [
        {
          payers: [{ user: 'a', amount: 900 }],
          shares: [
            { user: 'a', amount: 300 },
            { user: 'b', amount: 300 },
            { user: 'c', amount: 300 },
          ],
        },
      ],
      [{ from: 'b', to: 'a', amount: 300 }],
    );
    expect(asObject(balances)).toEqual({ a: 300, c: -300 });
  });

  it('nets pairwise debts between the same two people', () => {
    const debts = pairwiseDebts(
      [
        {
          payers: [{ user: 'a', amount: 900 }],
          shares: [
            { user: 'a', amount: 300 },
            { user: 'b', amount: 300 },
            { user: 'c', amount: 300 },
          ],
        },
        {
          payers: [{ user: 'b', amount: 600 }],
          shares: [
            { user: 'a', amount: 300 },
            { user: 'b', amount: 300 },
          ],
        },
      ],
      [],
    );
    expect(debts).toEqual([{ from: 'c', to: 'a', amount: 300 }]);
  });

  it('pays back every payer of an expense with several payers', () => {
    const debts = pairwiseDebts(
      [
        {
          payers: [
            { user: 'a', amount: 600 },
            { user: 'b', amount: 400 },
          ],
          shares: [{ user: 'c', amount: 1_000 }],
        },
      ],
      [],
    );
    expect(debts).toEqual([
      { from: 'c', to: 'a', amount: 600 },
      { from: 'c', to: 'b', amount: 400 },
    ]);
  });

  it('always sums to exactly zero for any group (property)', () => {
    fc.assert(
      fc.property(ledgerArb, ({ expenses, settlements }) => {
        const balances = computeBalances(expenses.map(toLedger), settlements);
        expect(totalOf(balances)).toBe(0);
      }),
      { numRuns: RUNS },
    );
  });

  it('keeps every paisa when one payer paid almost nothing (regression found by fast-check)', () => {
    const shares = computeShares(1_076_466, { type: 'equal', participants: ['u2', 'u4'] });
    const ledger = [
      {
        payers: [
          { user: 'u1', amount: 1_076_465 },
          { user: 'u5', amount: 1 },
        ],
        shares,
      },
    ];
    expect(pairwiseDebts(ledger, [])).toEqual([
      { from: 'u2', to: 'u1', amount: 538_233 },
      { from: 'u4', to: 'u1', amount: 538_232 },
      { from: 'u4', to: 'u5', amount: 1 },
    ]);
  });

  it('pairwise debts and net balances describe the same position (property)', () => {
    fc.assert(
      fc.property(ledgerArb, ({ expenses, settlements }) => {
        const ledger = expenses.map(toLedger);
        const fromDebts: Balances = new Map();
        for (const d of pairwiseDebts(ledger, settlements)) {
          fromDebts.set(d.from, (fromDebts.get(d.from) ?? 0) - d.amount);
          fromDebts.set(d.to, (fromDebts.get(d.to) ?? 0) + d.amount);
        }
        for (const [user, amount] of [...fromDebts]) if (amount === 0) fromDebts.delete(user);
        expect(asObject(fromDebts)).toEqual(asObject(computeBalances(ledger, settlements)));
      }),
      { numRuns: RUNS },
    );
  });

  it('the simplified plan settles any group completely (property)', () => {
    fc.assert(
      fc.property(ledgerArb, ({ expenses, settlements }) => {
        const ledger = expenses.map(toLedger);
        const balances = computeBalances(ledger, settlements);
        const payments = simplifyDebts(balances);
        // Recording the suggested payments leaves nobody with a balance (zeros are dropped).
        expect(computeBalances(ledger, [...settlements, ...payments]).size).toBe(0);
        expect(payments.length).toBeLessThanOrEqual(Math.max(0, balances.size - 1));
      }),
      { numRuns: RUNS },
    );
  });

  it('editing an expense by applying (new - old) deltas equals recomputing (property)', () => {
    const users = userIds(6);
    fc.assert(
      fc.property(
        fc.array(expenseArb(users), { minLength: 1, maxLength: 10 }),
        expenseArb(users),
        fc.nat(),
        (expenses, replacement, pick) => {
          const ledger = expenses.map(toLedger);
          const index = pick % ledger.length;
          const before = computeBalances(ledger, []);
          const edited = toLedger(replacement);
          const incremental = combine(
            before,
            negate(expenseDeltas(ledger[index]!)),
            expenseDeltas(edited),
          );
          ledger[index] = edited;
          expect(asObject(incremental)).toEqual(asObject(computeBalances(ledger, [])));
          expect(totalOf(incremental)).toBe(0);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
