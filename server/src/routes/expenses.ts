import { Router, type RequestHandler } from 'express';
import { config } from '../config';
import { badRequest } from '../errors';
import { currentUser } from '../middleware/auth';
import { currentGroup } from '../middleware/groupAccess';
import { receiptUpload } from '../middleware/upload';
import { expenseParams } from '../schemas/common';
import { expenseInputSchema, expenseListQuery, expenseUpdateSchema } from '../schemas/expense';
import {
  attachReceipt,
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  openReceipt,
  removeReceipt,
  updateExpense,
} from '../services/expenses';
import { expenseDto } from '../services/serializers';

/** Mounted at /api/groups/:groupId/expenses, after loadGroup has checked membership. */
export function expensesRouter(uploadLimiter: RequestHandler): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const page = await listExpenses(currentGroup(req), expenseListQuery.parse(req.query));
    res.json({ items: page.items.map((e) => expenseDto(e)), nextCursor: page.nextCursor });
  });

  router.post('/', async (req, res) => {
    const input = expenseInputSchema.parse(req.body);
    const expense = await createExpense(currentGroup(req), currentUser(req).id, input);
    res.status(201).json({ expense: expenseDto(expense) });
  });

  router.get('/:expenseId', async (req, res) => {
    const { expenseId } = expenseParams.parse(req.params);
    const expense = await getExpense(currentGroup(req), expenseId);
    res.json({ expense: expenseDto(expense, { history: true }) });
  });

  router.put('/:expenseId', async (req, res) => {
    const { expenseId } = expenseParams.parse(req.params);
    const input = expenseUpdateSchema.parse(req.body);
    const expense = await updateExpense(currentGroup(req), currentUser(req).id, expenseId, input);
    res.json({ expense: expenseDto(expense, { history: true }) });
  });

  router.delete('/:expenseId', async (req, res) => {
    const { expenseId } = expenseParams.parse(req.params);
    await deleteExpense(currentGroup(req), currentUser(req).id, expenseId);
    res.status(204).end();
  });

  router.post(
    '/:expenseId/receipt',
    uploadLimiter,
    receiptUpload(config.maxReceiptBytes),
    async (req, res) => {
      const { expenseId } = expenseParams.parse(req.params);
      if (!req.file) throw badRequest('Attach an image or PDF in the "receipt" field');
      const expense = await attachReceipt(
        currentGroup(req),
        currentUser(req).id,
        expenseId,
        req.file,
      );
      res.status(201).json({ expense: expenseDto(expense) });
    },
  );

  // Receipts are private: they are streamed through this members-only route, never served as
  // public static files.
  router.get('/:expenseId/receipt', async (req, res) => {
    const { expenseId } = expenseParams.parse(req.params);
    const { stream, receipt } = await openReceipt(currentGroup(req), expenseId);
    res.setHeader('Content-Type', receipt.mimeType);
    res.setHeader('Content-Length', String(receipt.size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="receipt.${receipt.key.split('.').pop()}"`,
    );
    stream.on('error', (err) => res.destroy(err));
    stream.pipe(res);
  });

  router.delete('/:expenseId/receipt', async (req, res) => {
    const { expenseId } = expenseParams.parse(req.params);
    await removeReceipt(currentGroup(req), currentUser(req).id, expenseId);
    res.status(204).end();
  });

  return router;
}
