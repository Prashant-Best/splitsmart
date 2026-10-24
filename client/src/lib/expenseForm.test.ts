import { describe, expect, it } from 'vitest';
import type { Expense, Member } from '../api/types';
import { emptyForm, evaluate, formFromExpense, type ExpenseForm } from './expenseForm';

const member = (id: string, name: string): Member => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  upiId: null,
  role: 'member',
  balance: 0,
  joinedAt: '2026-10-01T00:00:00.000Z',
});
const members = [member('a1', 'Asha'), member('b2', 'Bala'), member('c3', 'Chirag')];
const base = (changes: Partial<ExpenseForm> = {}): ExpenseForm => ({
  ...emptyForm(members, 'a1', '2026-10-24'),
  description: 'Dinner',
  amount: '1000',
  ...changes,
});

describe('evaluate', () => {
  it('previews an equal split with the leftover paisa going to the first person by id', () => {
    const result = evaluate(base(), members);
    expect([...result.shares!.values()]).toEqual([33_334, 33_333, 33_333]);
    expect(result.input).toMatchObject({
      amount: 100_000,
      payers: [{ user: 'a1', amount: 100_000 }],
      split: { type: 'equal', participants: ['a1', 'b2', 'c3'] },
    });
  });

  it('parses amounts as exact paise, never through floats', () => {
    expect(evaluate(base({ amount: '4.35' }), members).amount).toBe(435);
    expect(evaluate(base({ amount: '1,23,456.5' }), members).amount).toBe(12_345_650);
    expect(evaluate(base({ amount: 'abc' }), members).input).toBeNull();
  });

  it('reports what is left to assign for exact amounts and blocks saving', () => {
    const result = evaluate(base({ splitType: 'exact', exact: { a1: '400', b2: '350' } }), members);
    expect(result.remaining).toBe(25_000);
    expect(result.splitError).toMatch(/add up to 750.00/);
    expect(result.input).toBeNull();
  });

  it('accepts percentages with two decimals once they reach 100%', () => {
    const percent = { a1: '33.33', b2: '33.33', c3: '33.34' };
    const result = evaluate(base({ splitType: 'percentage', percent }), members);
    expect(result.remaining).toBe(0);
    // 33.33% of ₹1,000 is ₹333.30; the three parts still add up to exactly ₹1,000.
    expect([...result.shares!.values()]).toEqual([33_330, 33_330, 33_340]);
    expect(result.input?.split).toEqual({
      type: 'percentage',
      percents: [
        { user: 'a1', weight: 3_333 },
        { user: 'b2', weight: 3_333 },
        { user: 'c3', weight: 3_334 },
      ],
    });
  });

  it('splits by shares and ignores people with zero shares', () => {
    const result = evaluate(
      base({ splitType: 'shares', shares: { a1: '2', b2: '1', c3: '0' } }),
      members,
    );
    expect(Object.fromEntries(result.shares!)).toEqual({ a1: 66_667, b2: 33_333 });
  });

  it('checks that several payers add up to the total', () => {
    const wrong = evaluate(base({ multiPayer: true, paid: { a1: '600', b2: '300' } }), members);
    expect(wrong.payerError).toMatch(/add up to 900.00/);
    expect(wrong.input).toBeNull();
    const right = evaluate(base({ multiPayer: true, paid: { a1: '600', b2: '400' } }), members);
    expect(right.input?.payers).toEqual([
      { user: 'a1', amount: 60_000 },
      { user: 'b2', amount: 40_000 },
    ]);
  });

  it('needs a description', () => {
    expect(evaluate(base({ description: '   ' }), members).input).toBeNull();
  });
});

describe('formFromExpense', () => {
  it('round-trips a stored expense back into the same request', () => {
    const expense: Expense = {
      id: 'e1',
      groupId: 'g1',
      description: 'Villa',
      category: 'stay',
      amount: 48_000_00,
      date: '2026-09-30',
      notes: 'By nights',
      payers: [{ user: 'a1', amount: 48_000_00 }],
      split: {
        type: 'shares',
        weights: [
          { user: 'a1', weight: 4 },
          { user: 'b2', weight: 4 },
          { user: 'c3', weight: 3 },
        ],
      },
      shares: [
        { user: 'a1', amount: 17_454_55 },
        { user: 'b2', amount: 17_454_54 },
        { user: 'c3', amount: 13_090_91 },
      ],
      receipt: null,
      version: 2,
      createdBy: 'a1',
      updatedBy: 'a1',
      createdAt: '2026-09-30T10:00:00.000Z',
      updatedAt: '2026-09-30T10:00:00.000Z',
    };
    const result = evaluate(formFromExpense(expense, members), members);
    expect(result.input).toMatchObject({
      description: 'Villa',
      amount: 48_000_00,
      category: 'stay',
      date: '2026-09-30',
      notes: 'By nights',
      split: {
        type: 'shares',
        shares: [
          { user: 'a1', weight: 4 },
          { user: 'b2', weight: 4 },
          { user: 'c3', weight: 3 },
        ],
      },
    });
    expect([...result.shares!.values()]).toEqual([17_454_55, 17_454_54, 13_090_91]);
  });
});
