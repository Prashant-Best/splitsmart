import { z } from 'zod';
import { MAX_AMOUNT } from '../domain';
import { PAYMENT_METHODS } from '../models/settlement';
import { objectId } from './common';

export const createSettlementSchema = z
  .object({
    from: objectId,
    to: objectId,
    amount: z
      .number()
      .int('Amounts are whole numbers of paise')
      .positive('Amounts must be more than zero')
      .max(MAX_AMOUNT),
    method: z.enum(PAYMENT_METHODS).default('upi'),
    note: z.string().trim().max(200).default(''),
  })
  .refine((value) => value.from !== value.to, {
    message: 'Choose two different people',
    path: ['to'],
  });

export type SettlementInput = z.infer<typeof createSettlementSchema>;
