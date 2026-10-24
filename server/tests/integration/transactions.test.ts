// Atomicity, concurrency and a database-backed property test of the zero-sum invariant.
import fc from 'fast-check';
import { Types } from 'mongoose';
import { computeBalances, totalOf } from '../../src/domain';
import { Activity, Expense, Group, Settlement, type GroupDoc } from '../../src/models';
import { createExpense, deleteExpense, updateExpense } from '../../src/services/expenses';
import type { ExpenseInput } from '../../src/schemas/expense';
import { toLedgerExpense, toTransfer } from '../../src/services/ledger';
import { createSettlement, deleteSettlement } from '../../src/services/settlements';
import {
  equalExpense,
  getBalances,
  makeGroup,
  signUp,
  today,
  useTestDb,
  type TestUser,
} from '../helpers/api';
import { expenseArb, settlementArb, type ExpenseCase } from '../helpers/arbitraries';

useTestDb();

const toInput = (e: ExpenseCase): ExpenseInput => ({
  description: 'Random expense',
  amount: e.total,
  category: 'other',
  date: today(),
  notes: '',
  payers: e.payers,
  split: e.split,
});

describe('transactions', () => {
  it('rolls back the expense and the balances if any write in the transaction fails', async () => {
    const asha = await signUp('Asha');
    const bala = await signUp('Bala');
    const { id } = await makeGroup(asha, [bala]);

    // Fail the last write of the transaction (the activity entry).
    const spy = jest.spyOn(Activity, 'create').mockRejectedValueOnce(new Error('disk full'));
    const res = await asha.agent
      .post(`/api/groups/${id}/expenses`)
      .send(equalExpense(asha, [asha, bala], 10_000));
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(res.body.error.message).not.toMatch(/disk full/); // internal details stay in the logs
    expect(await Expense.countDocuments()).toBe(0);
    const summary = await getBalances(asha, id);
    expect(summary.balances.every((b) => b.balance === 0)).toBe(true);
  });

  it('keeps balances exact under 25 concurrent expenses (write conflicts are retried)', async () => {
    const people: TestUser[] = [];
    for (const name of ['Asha', 'Bala', 'Chirag', 'Dev', 'Esha']) people.push(await signUp(name));
    const { id } = await makeGroup(people[0]!, people.slice(1));

    const requests = Array.from({ length: 25 }, (_, i) => {
      const payer = people[i % people.length]!;
      return payer.agent
        .post(`/api/groups/${id}/expenses`)
        .send(equalExpense(payer, people, 1_000 + i * 7, `Snack ${i}`));
    });
    const results = await Promise.all(requests);
    expect(results.map((r) => r.status)).toEqual(Array(25).fill(201));

    const summary = await getBalances(people[0]!, id);
    expect(summary.total).toBe(0);
    expect(summary.consistent).toBe(true);
    expect(await Expense.countDocuments({ group: id })).toBe(25);
  });

  it('lets exactly one of two simultaneous edits of the same version win', async () => {
    const asha = await signUp('Asha');
    const bala = await signUp('Bala');
    const { id } = await makeGroup(asha, [bala]);
    const created = await asha.agent
      .post(`/api/groups/${id}/expenses`)
      .send(equalExpense(asha, [asha, bala], 10_000))
      .expect(201);
    const url = `/api/groups/${id}/expenses/${created.body.expense.id}`;

    const [first, second] = await Promise.all([
      asha.agent.put(url).send({ ...equalExpense(asha, [asha, bala], 20_000), version: 0 }),
      bala.agent.put(url).send({ ...equalExpense(asha, [asha, bala], 40_000), version: 0 }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const summary = await getBalances(asha, id);
    expect(summary.consistent).toBe(true);
    expect(summary.total).toBe(0);
  });

  it('balances always sum to zero and match the ledger after any sequence of changes (property)', async () => {
    const people: TestUser[] = [];
    for (const name of ['Asha', 'Bala', 'Chirag', 'Dev', 'Esha', 'Farah']) {
      people.push(await signUp(name));
    }
    const { id } = await makeGroup(people[0]!, people.slice(1));
    const groupId = new Types.ObjectId(id);
    const users = people.map((p) => p.id);
    const loadGroup = async () => (await Group.findById(groupId).lean<GroupDoc>())!;
    const actor = users[0]!;

    const operation = fc.oneof(
      {
        weight: 4,
        arbitrary: expenseArb(users, 500_000).map((e) => ({ kind: 'add' as const, e })),
      },
      {
        weight: 2,
        arbitrary: fc
          .tuple(fc.nat(), expenseArb(users, 500_000))
          .map(([pick, e]) => ({ kind: 'edit' as const, pick, e })),
      },
      { weight: 1, arbitrary: fc.nat().map((pick) => ({ kind: 'delete' as const, pick })) },
      { weight: 2, arbitrary: settlementArb(users).map((s) => ({ kind: 'settle' as const, s })) },
      { weight: 1, arbitrary: fc.nat().map((pick) => ({ kind: 'unsettle' as const, pick })) },
    );

    await fc.assert(
      fc.asyncProperty(fc.array(operation, { minLength: 1, maxLength: 12 }), async (ops) => {
        await Promise.all([
          Expense.deleteMany({ group: groupId }),
          Settlement.deleteMany({ group: groupId }),
          Group.updateOne({ _id: groupId }, { $set: { 'members.$[].balance': 0 } }),
        ]);

        for (const op of ops) {
          const group = await loadGroup();
          if (op.kind === 'add') {
            await createExpense(group, actor, toInput(op.e));
          } else if (op.kind === 'edit' || op.kind === 'delete') {
            const live = await Expense.find({ group: groupId, deletedAt: null })
              .sort({ _id: 1 })
              .lean();
            if (live.length === 0) continue;
            const target = live[op.pick % live.length]!;
            if (op.kind === 'edit') {
              await updateExpense(group, actor, target._id.toString(), {
                ...toInput(op.e),
                version: target.version,
              });
            } else {
              await deleteExpense(group, actor, target._id.toString());
            }
          } else if (op.kind === 'settle') {
            await createSettlement(group, actor, { ...op.s, method: 'upi', note: '' });
          } else {
            const live = await Settlement.find({ group: groupId, deletedAt: null })
              .sort({ _id: 1 })
              .lean();
            if (live.length === 0) continue;
            await deleteSettlement(group, actor, live[op.pick % live.length]!._id.toString());
          }
        }

        const group = await loadGroup();
        const stored = group.members.map((m) => [m.user.toString(), m.balance] as const);
        expect(totalOf(stored)).toBe(0);

        const expenses = await Expense.find({ group: groupId, deletedAt: null }).lean();
        const settlements = await Settlement.find({ group: groupId, deletedAt: null }).lean();
        const recomputed = computeBalances(
          expenses.map(toLedgerExpense),
          settlements.map(toTransfer),
        );
        for (const [user, balance] of stored) expect(balance).toBe(recomputed.get(user) ?? 0);
      }),
      { numRuns: 40 },
    );
  });
});
