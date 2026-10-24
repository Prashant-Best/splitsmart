/**
 * Resets the database and loads the demo data through the real services, so every balance
 * update runs in a transaction exactly as it would for a user.
 *
 *   npm run seed            (refuses to run when NODE_ENV=production unless --force is passed)
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from '../src/config';
import { connectDb, disconnectDb } from '../src/db';
import { Activity, Expense, Group, prepareCollections, type GroupDoc } from '../src/models';
import { attachReceipt, createExpense, updateExpense } from '../src/services/expenses';
import { createGroup, joinGroup } from '../src/services/groups';
import { getBalanceSummary } from '../src/services/ledger';
import { createSettlement } from '../src/services/settlements';
import { registerUser, updateProfile } from '../src/services/users';
import {
  buildDemoData,
  DEMO_PASSWORD,
  DEMO_USERS,
  demoEmail,
  type DemoExpense,
  type UserKey,
} from './demo-data';

/** Shows activity at the time the demo event happened instead of "just now". */
async function backdateLatest(groupId: mongoose.Types.ObjectId, date: string, hour: number) {
  const latest = await Activity.findOne({ group: groupId }).sort({ _id: -1 }).select('_id').lean();
  const at = new Date(
    `${date}T${String(hour).padStart(2, '0')}:${String((hour * 7) % 60).padStart(2, '0')}:00+05:30`,
  );
  if (latest) await Activity.collection.updateOne({ _id: latest._id }, { $set: { createdAt: at } });
  return at;
}

async function main(): Promise<void> {
  if (config.isProduction && !process.argv.includes('--force')) {
    throw new Error('Refusing to wipe a production database. Pass --force if you really mean it.');
  }
  await connectDb(config.mongoUri);
  await mongoose.connection.dropDatabase();
  await prepareCollections();

  const ids = new Map<UserKey, string>();
  for (const u of DEMO_USERS) {
    const user = await registerUser({
      name: u.name,
      email: demoEmail(u.key),
      password: DEMO_PASSWORD,
    });
    if (u.upiId) await updateProfile(user._id.toString(), { upiId: u.upiId });
    ids.set(u.key, user._id.toString());
  }
  const id = (key: string) => ids.get(key as UserKey)!;
  const receipt = await readFile(path.join(__dirname, 'assets', 'sample-receipt.png'));

  const toInput = (e: DemoExpense, amount = e.amount) => {
    const mapUsers = <T extends { user: string }>(items: T[]) =>
      items.map((i) => ({ ...i, user: id(i.user) }));
    const split = e.split;
    return {
      description: e.description,
      amount,
      category: e.category,
      date: e.date,
      notes: e.notes ?? '',
      // The first, uncorrected version of an expense has a single payer who paid that amount.
      payers: amount === e.amount ? mapUsers(e.payers) : [{ user: id(e.payers[0]!.user), amount }],
      split:
        split.type === 'equal'
          ? { ...split, participants: split.participants.map(id) }
          : split.type === 'exact'
            ? { ...split, amounts: mapUsers(split.amounts) }
            : split.type === 'percentage'
              ? { ...split, percents: mapUsers(split.percents) }
              : { ...split, shares: mapUsers(split.shares) },
    };
  };

  for (const demo of buildDemoData()) {
    const groupId = await createGroup(id(demo.owner), { name: demo.name, currency: 'INR' });
    const firstDate = demo.events[0]!.date;
    await backdateLatest(groupId, firstDate, 8);
    const { inviteCode } = (await Group.findById(groupId).lean<GroupDoc>())!;
    for (const member of demo.members) {
      if (member === demo.owner) continue;
      await joinGroup(inviteCode, id(member));
      await backdateLatest(groupId, firstDate, 9);
    }

    let hour = 10;
    for (const event of demo.events) {
      const group = (await Group.findById(groupId).lean<GroupDoc>())!;
      hour = hour >= 21 ? 10 : hour + 1;
      if (event.kind === 'settlement') {
        await createSettlement(group, id(event.from), {
          from: id(event.from),
          to: id(event.to),
          amount: event.amount,
          method: event.method,
          note: '',
        });
        await backdateLatest(groupId, event.date, hour);
        continue;
      }

      const actor = event.payers[0]!.user;
      let expense = await createExpense(group, id(actor), toInput(event, event.firstAmount));
      const createdAt = await backdateLatest(groupId, event.date, hour);
      await Expense.collection.updateOne(
        { _id: expense._id },
        { $set: { createdAt, updatedAt: createdAt } },
      );
      if (event.firstAmount !== undefined) {
        expense = await updateExpense(group, id(actor), expense._id.toString(), {
          ...toInput(event),
          version: expense.version,
        });
        await backdateLatest(groupId, event.date, hour + 1);
      }
      if (event.receipt) {
        await attachReceipt(group, id(actor), expense._id.toString(), {
          buffer: receipt,
          size: receipt.length,
          originalname: 'sea-breeze-bill.png',
        });
        await backdateLatest(groupId, event.date, hour + 1);
      }
    }

    const summary = await getBalanceSummary(groupId);
    const expenses = demo.events.filter((e) => e.kind === 'expense').length;
    console.log(
      `${demo.name}: ${demo.members.length} members, ${expenses} expenses, ` +
        `${demo.events.length - expenses} settlements | pairwise debts ${summary.pairwise.length} -> ` +
        `simplified payments ${summary.simplified.length} | balances consistent: ${summary.consistent}`,
    );
  }

  console.log(
    `\nDemo login: ${demoEmail('prashant')} / ${DEMO_PASSWORD} (every demo user has this password)`,
  );
  await disconnectDb();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
