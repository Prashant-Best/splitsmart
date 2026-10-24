// Pure logic behind the add/edit expense form: form state <-> API input, plus a live preview of
// everyone's share computed by the same domain code the server uses.
import {
  computeShares,
  FULL_PERCENT,
  parseDecimal2,
  SplitError,
  sumAmounts,
  toDecimalString,
  validatePayers,
  type Allocation,
  type Category,
  type SplitInput,
  type SplitType,
} from '@domain';
import type { Expense, ExpenseInput, Member } from '../api/types';

/** Everything as typed: amounts are strings until they are parsed into paise. */
export interface ExpenseForm {
  description: string;
  amount: string;
  date: string;
  category: Category;
  notes: string;
  multiPayer: boolean;
  payer: string;
  paid: Record<string, string>;
  splitType: SplitType;
  included: Record<string, boolean>;
  exact: Record<string, string>;
  percent: Record<string, string>;
  shares: Record<string, string>;
}

export function emptyForm(members: Member[], me: string, today: string): ExpenseForm {
  return {
    description: '',
    amount: '',
    date: today,
    category: 'food',
    notes: '',
    multiPayer: false,
    payer: me,
    paid: {},
    splitType: 'equal',
    included: Object.fromEntries(members.map((m) => [m.id, true])),
    exact: {},
    percent: {},
    shares: Object.fromEntries(members.map((m) => [m.id, '1'])),
  };
}

export function formFromExpense(expense: Expense, members: Member[]): ExpenseForm {
  const base = emptyForm(members, expense.payers[0]?.user ?? '', expense.date);
  const weights = new Map(expense.split.weights.map((w) => [w.user, w.weight]));
  const shareUsers = new Set(expense.shares.map((s) => s.user));
  return {
    ...base,
    description: expense.description,
    amount: toDecimalString(expense.amount),
    category: expense.category,
    notes: expense.notes,
    multiPayer: expense.payers.length > 1,
    paid: Object.fromEntries(expense.payers.map((p) => [p.user, toDecimalString(p.amount)])),
    splitType: expense.split.type,
    included: Object.fromEntries(members.map((m) => [m.id, shareUsers.has(m.id)])),
    exact: Object.fromEntries(expense.shares.map((s) => [s.user, toDecimalString(s.amount)])),
    // Percentages are stored as basis points, so 3333 shows as "33.33".
    percent: Object.fromEntries([...weights].map(([user, w]) => [user, toDecimalString(w)])),
    shares:
      expense.split.type === 'shares'
        ? Object.fromEntries(members.map((m) => [m.id, String(weights.get(m.id) ?? 0)]))
        : base.shares,
  };
}

export interface Evaluation {
  /** The total in paise, if it parses and is above zero. */
  amount: number | null;
  payers: Allocation[];
  split: SplitInput;
  /** Everyone's share in paise, when the split is valid. */
  shares: Map<string, number> | null;
  splitError: string | null;
  payerError: string | null;
  /** Exact amounts: paise still unassigned. Percentages: basis points still unassigned. */
  remaining: number | null;
  /** The request body, once everything is valid. */
  input: ExpenseInput | null;
}

function parsedValues(members: Member[], values: Record<string, string>) {
  return members.flatMap((m) => {
    const value = parseDecimal2(values[m.id] ?? '');
    return value ? [{ user: m.id, value }] : [];
  });
}

export function evaluate(form: ExpenseForm, members: Member[]): Evaluation {
  const parsed = parseDecimal2(form.amount);
  const amount = parsed !== null && parsed > 0 ? parsed : null;

  const payers: Allocation[] = form.multiPayer
    ? parsedValues(members, form.paid).map(({ user, value }) => ({ user, amount: value }))
    : amount !== null && form.payer
      ? [{ user: form.payer, amount }]
      : [];

  let split: SplitInput;
  let remaining: number | null = null;
  switch (form.splitType) {
    case 'equal':
      split = {
        type: 'equal',
        participants: members.filter((m) => form.included[m.id]).map((m) => m.id),
      };
      break;
    case 'exact': {
      const amounts = parsedValues(members, form.exact).map(({ user, value }) => ({
        user,
        amount: value,
      }));
      split = { type: 'exact', amounts };
      if (amount !== null) remaining = amount - sumAmounts(amounts);
      break;
    }
    case 'percentage': {
      const percents = parsedValues(members, form.percent).map(({ user, value }) => ({
        user,
        weight: value,
      }));
      split = { type: 'percentage', percents };
      remaining = FULL_PERCENT - percents.reduce((sum, p) => sum + p.weight, 0);
      break;
    }
    case 'shares': {
      const shares = members.flatMap((m) => {
        const n = Number(form.shares[m.id]);
        return Number.isInteger(n) && n > 0 ? [{ user: m.id, weight: n }] : [];
      });
      split = { type: 'shares', shares };
      break;
    }
  }

  let shares: Map<string, number> | null = null;
  let splitError: string | null = null;
  let payerError: string | null = null;
  if (amount !== null) {
    try {
      shares = new Map(computeShares(amount, split).map((s) => [s.user, s.amount]));
    } catch (error) {
      splitError = error instanceof SplitError ? error.message : 'This split is not valid';
    }
    if (form.multiPayer) {
      try {
        validatePayers(amount, payers);
      } catch (error) {
        payerError = error instanceof SplitError ? error.message : 'Check who paid';
      }
    }
  }

  const description = form.description.trim();
  const input: ExpenseInput | null =
    amount !== null && shares && !payerError && payers.length > 0 && description && form.date
      ? {
          description,
          amount,
          category: form.category,
          date: form.date,
          notes: form.notes.trim(),
          payers,
          split,
        }
      : null;

  return { amount, payers, split, shares, splitError, payerError, remaining, input };
}
