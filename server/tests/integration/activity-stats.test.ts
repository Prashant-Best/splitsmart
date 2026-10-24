import { equalExpense, makeGroup, signUp, useTestDb, type TestUser } from '../helpers/api';

useTestDb();

let asha: TestUser;
let bala: TestUser;
let groupId: string;

beforeEach(async () => {
  asha = await signUp('Asha');
  bala = await signUp('Bala');
  ({ id: groupId } = await makeGroup(asha, [bala], 'Flat 302'));
});

describe('activity feed', () => {
  it('records who did what, newest first, with names', async () => {
    const url = `/api/groups/${groupId}/expenses`;
    const created = await asha.agent
      .post(url)
      .send(equalExpense(asha, [asha, bala], 30_000, 'Rent'))
      .expect(201);
    const { id, version } = created.body.expense;
    await bala.agent
      .put(`${url}/${id}`)
      .send({ ...equalExpense(asha, [asha, bala], 32_000, 'Rent'), version })
      .expect(200);
    await bala.agent
      .post(`/api/groups/${groupId}/settlements`)
      .send({ from: bala.id, to: asha.id, amount: 16_000 })
      .expect(201);
    await asha.agent.delete(`${url}/${id}`).expect(204);

    const feed = await bala.agent.get(`/api/groups/${groupId}/activity`).expect(200);
    expect(feed.body.items.map((a: { type: string }) => a.type)).toEqual([
      'expense.deleted',
      'settlement.created',
      'expense.updated',
      'expense.created',
      'member.joined',
      'group.created',
    ]);
    expect(feed.body.items[1]).toMatchObject({
      actorName: 'Bala',
      groupName: 'Flat 302',
      data: { amount: 16_000, fromName: 'Bala', toName: 'Asha', method: 'upi' },
    });
    // A new amount on an equal split also changes what the payer paid and everyone's share.
    expect(feed.body.items[2].data.fields).toEqual(['amount', 'payers', 'split']);
  });

  it('pages with a cursor and shows activity from all of my groups', async () => {
    const { id: other } = await makeGroup(bala, [], 'Goa Trip');
    for (let i = 0; i < 3; i++) {
      await asha.agent
        .post(`/api/groups/${groupId}/expenses`)
        .send(equalExpense(asha, [asha, bala], 1_000, `Snack ${i}`))
        .expect(201);
    }
    const first = await asha.agent.get(`/api/groups/${groupId}/activity?limit=2`).expect(200);
    expect(first.body.items).toHaveLength(2);
    const second = await asha.agent
      .get(`/api/groups/${groupId}/activity?limit=2&cursor=${first.body.nextCursor}`)
      .expect(200);
    expect(second.body.items[0].id).not.toBe(first.body.items[1].id);

    const all = await bala.agent.get('/api/activity?limit=50').expect(200);
    const groupNames = new Set(all.body.items.map((a: { groupName: string }) => a.groupName));
    expect(groupNames).toEqual(new Set(['Flat 302', 'Goa Trip']));
    // Asha is not in Bala's other group, so she never sees it.
    const ashas = await asha.agent.get('/api/activity?limit=50').expect(200);
    expect(ashas.body.items.some((a: { groupId: string }) => a.groupId === other)).toBe(false);
  });
});

describe('spending stats', () => {
  it('totals spending by month, category and member', async () => {
    const now = new Date();
    const month = (offset: number) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 15));
      return d.toISOString().slice(0, 10);
    };
    const url = `/api/groups/${groupId}/expenses`;
    const add = (by: TestUser, amount: number, category: string, date: string) =>
      by.agent
        .post(url)
        .send({ ...equalExpense(by, [asha, bala], amount), category, date })
        .expect(201);
    await add(asha, 40_000, 'rent', month(0));
    await add(bala, 6_000, 'groceries', month(0));
    await add(asha, 40_000, 'rent', month(1));
    await add(bala, 2_000, 'food', month(1));
    await add(asha, 99_999, 'travel', month(8)); // outside the 6-month window

    const res = await asha.agent.get(`/api/groups/${groupId}/stats?months=6`).expect(200);
    const stats = res.body;
    expect(stats.total).toBe(88_000);
    expect(stats.count).toBe(4);
    expect(stats.byMonth).toHaveLength(6);
    expect(stats.byMonth[5]).toEqual({
      month: month(0).slice(0, 7),
      total: 46_000,
      categories: { rent: 40_000, groceries: 6_000 },
    });
    expect(stats.byMonth[4].total).toBe(42_000);
    expect(stats.byMonth[0].total).toBe(0);
    expect(stats.byCategory).toEqual([
      { category: 'rent', total: 80_000 },
      { category: 'groceries', total: 6_000 },
      { category: 'food', total: 2_000 },
    ]);
    const byMember = Object.fromEntries(
      stats.byMember.map((m: { user: string; paid: number; share: number }) => [m.user, m]),
    );
    expect(byMember[asha.id]).toMatchObject({ paid: 80_000, share: 44_000 });
    expect(byMember[bala.id]).toMatchObject({ paid: 8_000, share: 44_000 });

    await asha.agent.get(`/api/groups/${groupId}/stats?months=100`).expect(400);
  });
});
