import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const groupParams = z.object({ groupId: objectId });
export const expenseParams = z.object({ expenseId: objectId });
export const settlementParams = z.object({ settlementId: objectId });
export const inviteParams = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{8,32}$/, 'Invalid invite link'),
});

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(100).optional(),
});
