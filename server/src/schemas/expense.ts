import { z } from 'zod';
import {
  CATEGORIES,
  FULL_PERCENT,
  MAX_AMOUNT,
  MAX_GROUP_MEMBERS,
  MAX_SHARE_UNITS,
} from '../domain';
import { objectId, pageQuery } from './common';

// Zod checks the shape and ranges; the domain module checks the arithmetic (totals add up).
const paise = z
  .number({ error: 'Amounts are whole numbers of paise' })
  .int('Amounts are whole numbers of paise')
  .positive('Amounts must be more than zero')
  .max(MAX_AMOUNT, 'That amount is too large');

const allocation = z.object({ user: objectId, amount: paise });
const people = <T extends z.ZodType>(item: T) =>
  z.array(item).min(1, 'Choose at least one person').max(MAX_GROUP_MEMBERS);

export const splitSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('equal'), participants: people(objectId) }),
  z.object({ type: z.literal('exact'), amounts: people(allocation) }),
  z.object({
    type: z.literal('percentage'),
    percents: people(
      z.object({ user: objectId, weight: z.number().int().positive().max(FULL_PERCENT) }),
    ),
  }),
  z.object({
    type: z.literal('shares'),
    shares: people(
      z.object({ user: objectId, weight: z.number().int().positive().max(MAX_SHARE_UNITS) }),
    ),
  }),
]);

export const expenseInputSchema = z.object({
  description: z.string().trim().min(1, 'Add a description').max(120, 'Use at most 120 characters'),
  amount: paise,
  category: z.enum(CATEGORIES).default('other'),
  date: z.iso.date('Use a date like 2026-10-24'),
  notes: z.string().trim().max(500).default(''),
  payers: people(allocation),
  split: splitSchema,
});

export const expenseUpdateSchema = expenseInputSchema.extend({
  /** The version the edit started from (optimistic concurrency). */
  version: z.number().int().min(0),
});

export const expenseListQuery = pageQuery.extend({
  category: z.enum(CATEGORIES).optional(),
  search: z.string().trim().max(60).optional(),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type ExpenseUpdate = z.infer<typeof expenseUpdateSchema>;
