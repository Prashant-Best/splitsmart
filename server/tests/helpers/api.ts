// Shared setup for integration tests: a clean database per test and helpers to drive the API.
import os from 'node:os';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app';
import { connectDb } from '../../src/db';
import { prepareCollections } from '../../src/models';

export type Agent = ReturnType<typeof request.agent>;

export const PASSWORD = 'correct-horse-battery';

/** Connects once per test file and empties every collection before each test. */
export function useTestDb(): void {
  beforeAll(async () => {
    // MongoDB driver 7 loads Node's `os` module with a dynamic import(), which Jest's VM sandbox
    // cannot run; the handshake would then go out without driver metadata and be rejected.
    // Handing the module over directly avoids that (production keeps the driver's default).
    await connectDb(process.env.MONGODB_URI!, { runtimeAdapters: { os } });
    await prepareCollections();
  });
  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });
}

export const app = createApp();

export interface TestUser {
  id: string;
  name: string;
  email: string;
  agent: Agent;
}

/** Registers a user; the returned agent keeps the session cookie. */
export async function signUp(name: string, theApp = app): Promise<TestUser> {
  const agent = request.agent(theApp);
  const local = name
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  const email = `${local}@example.com`;
  const res = await agent.post('/api/auth/register').send({ name, email, password: PASSWORD });
  expect(res.status).toBe(201);
  return { id: res.body.user.id, name, email, agent };
}

/** Creates a group owned by `owner` and has everyone in `others` join through the invite link. */
export async function makeGroup(owner: TestUser, others: TestUser[] = [], name = 'Goa Trip') {
  const res = await owner.agent.post('/api/groups').send({ name }).expect(201);
  const { id, inviteCode } = res.body.group as { id: string; inviteCode: string };
  for (const user of others) {
    await user.agent.post(`/api/invites/${inviteCode}/join`).expect(201);
  }
  return { id, inviteCode };
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Body for an expense paid by one person and split equally. */
export function equalExpense(
  payer: TestUser,
  participants: TestUser[],
  amount: number,
  description = 'Dinner',
) {
  return {
    description,
    amount,
    category: 'food',
    date: today(),
    payers: [{ user: payer.id, amount }],
    split: { type: 'equal', participants: participants.map((p) => p.id) },
  };
}

export async function getBalances(user: TestUser, groupId: string) {
  const res = await user.agent.get(`/api/groups/${groupId}/balances`).expect(200);
  return res.body as {
    balances: { user: string; balance: number }[];
    simplified: { from: string; to: string; amount: number }[];
    pairwise: { from: string; to: string; amount: number }[];
    total: number;
    consistent: boolean;
  };
}

/** Balances as { userId: paise }, leaving out people at zero. */
export async function balanceMap(user: TestUser, groupId: string) {
  const summary = await getBalances(user, groupId);
  return Object.fromEntries(
    summary.balances.filter((b) => b.balance !== 0).map((b) => [b.user, b.balance]),
  );
}
