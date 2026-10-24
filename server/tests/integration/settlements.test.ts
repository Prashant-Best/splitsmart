import {
  balanceMap,
  equalExpense,
  getBalances,
  makeGroup,
  signUp,
  useTestDb,
  type TestUser,
} from '../helpers/api';

useTestDb();

let people: TestUser[];
let groupId: string;

beforeEach(async () => {
  people = [];
  for (const name of ['Asha', 'Bala', 'Chirag', 'Dev']) people.push(await signUp(name));
  ({ id: groupId } = await makeGroup(people[0]!, people.slice(1)));
});

const settle = (by: TestUser, body: object) =>
  by.agent.post(`/api/groups/${groupId}/settlements`).send(body);

describe('settling up', () => {
  it('recording every suggested payment brings everyone to zero', async () => {
    const [asha, bala, chirag, dev] = people as [TestUser, TestUser, TestUser, TestUser];
    const url = `/api/groups/${groupId}/expenses`;
    await asha.agent
      .post(url)
      .send(equalExpense(asha, people, 120_000, 'Villa'))
      .expect(201);
    await bala.agent
      .post(url)
      .send(equalExpense(bala, [asha, bala, chirag], 45_000, 'Scooters'))
      .expect(201);
    await chirag.agent
      .post(url)
      .send(equalExpense(chirag, [chirag, dev], 8_000, 'Fish thali'))
      .expect(201);

    const before = await getBalances(dev, groupId);
    expect(before.simplified.length).toBeLessThanOrEqual(3); // at most n - 1
    for (const payment of before.simplified) {
      const payer = people.find((p) => p.id === payment.from)!;
      await settle(payer, { ...payment, method: 'upi' }).expect(201);
    }

    const after = await getBalances(dev, groupId);
    expect(after.balances.every((b) => b.balance === 0)).toBe(true);
    expect(after.simplified).toEqual([]);
    expect(after.consistent).toBe(true);
    // Pairwise debts can still form a cycle (A owes B, B owes C, C owes A), but it nets to zero
    // for everyone: exactly the kind of debt that simplification removes.
    const net = new Map<string, number>();
    for (const d of after.pairwise) {
      net.set(d.from, (net.get(d.from) ?? 0) - d.amount);
      net.set(d.to, (net.get(d.to) ?? 0) + d.amount);
    }
    expect([...net.values()].every((v) => v === 0)).toBe(true);
  });

  it('simplification needs fewer payments than paying back every pairwise debt', async () => {
    const [asha, bala, chirag, dev] = people as [TestUser, TestUser, TestUser, TestUser];
    const url = `/api/groups/${groupId}/expenses`;
    // A cycle: everyone pays for the next person, so all net balances cancel out.
    await asha.agent
      .post(url)
      .send(equalExpense(asha, [bala], 50_000, 'Train'))
      .expect(201);
    await bala.agent
      .post(url)
      .send(equalExpense(bala, [chirag], 50_000, 'Bus'))
      .expect(201);
    await chirag.agent
      .post(url)
      .send(equalExpense(chirag, [dev], 50_000, 'Cab'))
      .expect(201);
    await dev.agent
      .post(url)
      .send(equalExpense(dev, [asha], 50_000, 'Ferry'))
      .expect(201);

    const summary = await getBalances(asha, groupId);
    expect(summary.pairwise).toHaveLength(4);
    expect(summary.simplified).toEqual([]);
  });

  it('undoing a payment restores both balances', async () => {
    const [asha, bala] = people as [TestUser, TestUser];
    await asha.agent
      .post(`/api/groups/${groupId}/expenses`)
      .send(equalExpense(asha, [asha, bala], 20_000))
      .expect(201);
    const paid = await settle(bala, {
      from: bala.id,
      to: asha.id,
      amount: 10_000,
      method: 'cash',
    }).expect(201);
    expect(await balanceMap(asha, groupId)).toEqual({});

    const list = await asha.agent.get(`/api/groups/${groupId}/settlements`).expect(200);
    expect(list.body.items).toHaveLength(1);

    await asha.agent
      .delete(`/api/groups/${groupId}/settlements/${paid.body.settlement.id}`)
      .expect(204);
    expect(await balanceMap(asha, groupId)).toEqual({ [asha.id]: 10_000, [bala.id]: -10_000 });
  });

  it('validates payments', async () => {
    const [asha, bala] = people as [TestUser, TestUser];
    const eve = await signUp('Eve');
    await settle(asha, { from: asha.id, to: asha.id, amount: 100 }).expect(400);
    await settle(asha, { from: asha.id, to: bala.id, amount: 0 }).expect(400);
    await settle(asha, { from: asha.id, to: bala.id, amount: 10.5 }).expect(400);
    const outsider = await settle(asha, { from: eve.id, to: asha.id, amount: 100 }).expect(400);
    expect(outsider.body.error.code).toBe('NOT_A_MEMBER');
  });
});
