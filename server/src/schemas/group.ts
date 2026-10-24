import { z } from 'zod';
import { CURRENCIES } from '../domain';

const groupName = z
  .string()
  .trim()
  .min(1, 'Give the group a name')
  .max(60, 'Use at most 60 characters');

export const createGroupSchema = z.object({
  name: groupName,
  currency: z.enum(CURRENCIES).default('INR'),
});

export const updateGroupSchema = z.object({ name: groupName });

export const statsQuery = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});
