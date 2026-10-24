import { z } from 'zod';
import { UPI_ID_PATTERN } from '../domain';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Enter a valid email address' }));

const name = z.string().trim().min(1, 'Enter your name').max(60, 'Use at most 60 characters');

export const registerSchema = z.object({
  name,
  email,
  password: z.string().min(8, 'Use at least 8 characters').max(128),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const updateProfileSchema = z
  .object({
    name: name.optional(),
    // Empty string or null removes the UPI ID.
    upiId: z
      .union([
        z.literal(''),
        z.null(),
        z.string().trim().regex(UPI_ID_PATTERN, 'Enter a UPI ID like name@okhdfcbank'),
      ])
      .optional(),
    emailReminders: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update');
