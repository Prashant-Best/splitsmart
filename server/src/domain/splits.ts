import { MAX_AMOUNT, sumAmounts, toDecimalString } from './money';

export const SPLIT_TYPES = ['equal', 'exact', 'percentage', 'shares'] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

/** One person's part of an amount, in minor units (paise). */
export interface Allocation {
  user: string;
  amount: number;
}

/** A relative weight: basis points for percentages (100% = 10000), a count for shares. */
export interface Weight {
  user: string;
  weight: number;
}

/** How an expense is divided, exactly as the user entered it. */
export type SplitInput =
  | { type: 'equal'; participants: string[] }
  | { type: 'exact'; amounts: Allocation[] }
  | { type: 'percentage'; percents: Weight[] }
  | { type: 'shares'; shares: Weight[] };

/** 100% in basis points. Percentages are entered with two decimals: 33.33% = 3333. */
export const FULL_PERCENT = 10_000;
/** Upper limit for one person's share count ("2 shares", "3 shares", ...). */
export const MAX_SHARE_UNITS = 1_000;
/** Upper limit for members in a group, and so for people in one split. */
export const MAX_GROUP_MEMBERS = 50;

/** A split that cannot be computed. The message is safe to show to users. */
export class SplitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SplitError';
  }
}

const byUser = (a: { user: string }, b: { user: string }): number =>
  a.user < b.user ? -1 : a.user > b.user ? 1 : 0;

function assertUnique(users: readonly string[]): void {
  if (new Set(users).size !== users.length) {
    throw new SplitError('Each person can appear only once');
  }
}

function assertPositiveInteger(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SplitError(`${what} must be a positive whole number`);
  }
}

/**
 * Splits `total` in proportion to integer weights with the largest-remainder method.
 *
 * Everyone first gets floor(total * weight / sum of weights). Each floor drops less than one
 * unit, so fewer than n units are left over; they go one each to the people with the largest
 * dropped remainders, ties broken by user id. Results:
 *  - the parts always add up to exactly `total` (no paisa is created or lost),
 *  - every part is within one paisa of the exact proportional value,
 *  - the outcome does not depend on the order of the input (it is sorted by user id).
 *
 * BigInt keeps total * weight exact even for huge inputs.
 */
export function allocateByWeights(total: number, weights: readonly Weight[]): Allocation[] {
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new SplitError('The amount must be a whole number of paise');
  }
  if (weights.length === 0) throw new SplitError('Choose at least one person');
  assertUnique(weights.map((w) => w.user));

  const sorted = [...weights].sort(byUser);
  let weightSum = 0n;
  for (const w of sorted) {
    assertPositiveInteger(w.weight, 'Each share');
    weightSum += BigInt(w.weight);
  }

  const bigTotal = BigInt(total);
  const parts = sorted.map((w, index) => {
    const product = bigTotal * BigInt(w.weight);
    return {
      user: w.user,
      amount: Number(product / weightSum),
      remainder: product % weightSum,
      index,
    };
  });

  let leftover = total - sumAmounts(parts);
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const part of byRemainder) {
    if (leftover === 0) break;
    part.amount += 1;
    leftover -= 1;
  }
  return parts.map(({ user, amount }) => ({ user, amount }));
}

/** The people an expense is split between. */
export function splitParticipants(split: SplitInput): string[] {
  switch (split.type) {
    case 'equal':
      return [...split.participants];
    case 'exact':
      return split.amounts.map((a) => a.user);
    case 'percentage':
      return split.percents.map((p) => p.user);
    case 'shares':
      return split.shares.map((s) => s.user);
  }
}

/**
 * Computes what each person owes for an expense of `total` paise. The result is sorted by user
 * id and always sums to exactly `total`; invalid input throws a SplitError.
 */
export function computeShares(total: number, split: SplitInput): Allocation[] {
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_AMOUNT) {
    throw new SplitError('The amount must be between 0.01 and 10,00,00,000.00');
  }
  if (splitParticipants(split).length > MAX_GROUP_MEMBERS) {
    throw new SplitError(`A split can include at most ${MAX_GROUP_MEMBERS} people`);
  }

  switch (split.type) {
    case 'equal':
      return allocateByWeights(
        total,
        split.participants.map((user) => ({ user, weight: 1 })),
      );

    case 'shares':
      for (const s of split.shares) {
        if (s.weight > MAX_SHARE_UNITS) {
          throw new SplitError(`One person can have at most ${MAX_SHARE_UNITS} shares`);
        }
      }
      return allocateByWeights(total, split.shares);

    case 'percentage': {
      const sum = split.percents.reduce((acc, p) => acc + p.weight, 0);
      if (sum !== FULL_PERCENT) {
        throw new SplitError(
          `Percentages must add up to 100% (they add up to ${toDecimalString(sum)}%)`,
        );
      }
      return allocateByWeights(total, split.percents);
    }

    case 'exact': {
      if (split.amounts.length === 0) throw new SplitError('Choose at least one person');
      assertUnique(split.amounts.map((a) => a.user));
      for (const a of split.amounts) assertPositiveInteger(a.amount, 'Each amount');
      const sum = sumAmounts(split.amounts);
      if (sum !== total) {
        throw new SplitError(
          `The amounts add up to ${toDecimalString(sum)}, but the expense is ${toDecimalString(total)}`,
        );
      }
      return split.amounts.map(({ user, amount }) => ({ user, amount })).sort(byUser);
    }
  }
}

/** Checks the "paid by" side of an expense: distinct people, positive amounts, exact total. */
export function validatePayers(total: number, payers: readonly Allocation[]): Allocation[] {
  if (payers.length === 0) throw new SplitError('Choose who paid');
  assertUnique(payers.map((p) => p.user));
  for (const p of payers) assertPositiveInteger(p.amount, 'Each paid amount');
  const sum = sumAmounts(payers);
  if (sum !== total) {
    throw new SplitError(
      `The paid amounts add up to ${toDecimalString(sum)}, but the expense is ${toDecimalString(total)}`,
    );
  }
  return payers.map(({ user, amount }) => ({ user, amount })).sort(byUser);
}
