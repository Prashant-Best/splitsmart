import {
  balanceMap,
  equalExpense,
  getBalances,
  makeGroup,
  signUp,
  today,
  useTestDb,
  type TestUser,
} from '../helpers/api';

useTestDb();

let asha: TestUser;
let bala: TestUser;
let chirag: TestUser;
let groupId: string;
let expensesUrl: string;

beforeEach(async () => {
  asha = await signUp('Asha');
  bala = await signUp('Bala');
  chirag = await signUp('Chirag');
  ({ id: groupId } = await makeGroup(asha, [bala, chirag]));
  expensesUrl = `/api/groups/${groupId}/expenses`;
});

describe('expenses', () => {
  it('splits equally, updates balances and keeps them consistent with the ledger', async () => {
    const res = await asha.agent
      .post(expensesUrl)
      .send(equalExpense(asha, [asha, bala, chirag], 100_000))
      .expect(201);
    // 1000.00 / 3: the extra paisa goes to the first member by id (Asha's account was created first).
    expect(res.body.expense.shares).toEqual([
      { user: asha.id, amount: 33_334 },
      { user: bala.id, amount: 33_333 },
      { user: chirag.id, amount: 33_333 },
    ]);

    const summary = await getBalances(bala, groupId);
    expect(summary.total).toBe(0);
    expect(summary.consistent).toBe(true);
    expect(await balanceMap(bala, groupId)).toEqual({
      [asha.id]: 66_666,
      [bala.id]: -33_333,
      [chirag.id]: -33_333,
    });
    expect(summary.simplified).toEqual([
      { from: bala.id, to: asha.id, amount: 33_333 },
      { from: chirag.id, to: asha.id, amount: 33_333 },
    ]);
  });

  it.each([
    [
      'exact amounts',
      (ids: string[]) => ({
        type: 'exact',
        amounts: [
          { user: ids[0], amount: 20_000 },
          { user: ids[1], amount: 50_000 },
          { user: ids[2], amount: 30_000 },
        ],
      }),
      [20_000, 50_000, 30_000],
    ],
    [
      'percentages',
      (ids: string[]) => ({
        type: 'percentage',
        percents: [
          { user: ids[0], weight: 5_000 },
          { user: ids[1], weight: 2_500 },
          { user: ids[2], weight: 2_500 },
        ],
      }),
      [50_000, 25_000, 25_000],
    ],
    [
      'shares',
      (ids: string[]) => ({
        type: 'shares',
        shares: [
          { user: ids[0], weight: 1 },
          { user: ids[1], weight: 1 },
          { user: ids[2], weight: 2 },
        ],
      }),
      [25_000, 25_000, 50_000],
    ],
  ])('supports %s', async (_, split, expected) => {
    const ids = [asha.id, bala.id, chirag.id];
    const res = await asha.agent
      .post(expensesUrl)
      .send({ ...equalExpense(asha, [], 100_000), split: split(ids) })
      .expect(201);
    expect(res.body.expense.shares.map((s: { amount: number }) => s.amount)).toEqual(expected);
    expect((await getBalances(asha, groupId)).total).toBe(0);
  });

  it('supports several payers', async () => {
    await asha.agent
      .post(expensesUrl)
      .send({
        ...equalExpense(asha, [asha, bala, chirag], 90_000, 'Hotel'),
        payers: [
          { user: asha.id, amount: 60_000 },
          { user: bala.id, amount: 30_000 },
        ],
      })
      .expect(201);
    expect(await balanceMap(asha, groupId)).toEqual({
      [asha.id]: 30_000,
      [chirag.id]: -30_000,
    });
  });

  it.each([
    ['payers that do not add up', { payers: [{ user: 'ASHA', amount: 99_999 }] }, 'INVALID_SPLIT'],
    ['an amount in rupees with decimals', { amount: 999.5 }, 'VALIDATION_ERROR'],
    ['a negative amount', { amount: -100 }, 'VALIDATION_ERROR'],
    ['a missing description', { description: '' }, 'VALIDATION_ERROR'],
    ['an invalid date', { date: '2026-02-30' }, 'VALIDATION_ERROR'],
    ['an unknown split type', { split: { type: 'magic', participants: [] } }, 'VALIDATION_ERROR'],
    [
      'percentages that are not 100%',
      { split: { type: 'percentage', percents: [{ user: 'ASHA', weight: 9_000 }] } },
      'INVALID_SPLIT',
    ],
  ])('rejects %s', async (_, override, code) => {
    const body = JSON.parse(
      JSON.stringify({ ...equalExpense(asha, [asha, bala], 100_000), ...override }).replaceAll(
        'ASHA',
        asha.id,
      ),
    );
    const res = await asha.agent.post(expensesUrl).send(body).expect(400);
    expect(res.body.error.code).toBe(code);
    expect(await balanceMap(asha, groupId)).toEqual({});
  });

  it('rejects people who are not in the group', async () => {
    const eve = await signUp('Eve');
    const res = await asha.agent
      .post(expensesUrl)
      .send(equalExpense(asha, [asha, eve], 10_000))
      .expect(400);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  it('edits an expense: moves balances by the difference and records the history', async () => {
    const created = await asha.agent
      .post(expensesUrl)
      .send(equalExpense(asha, [asha, bala], 10_000))
      .expect(201);
    const { id, version } = created.body.expense;

    const edited = await bala.agent
      .put(`${expensesUrl}/${id}`)
      .send({ ...equalExpense(asha, [asha, bala, chirag], 30_000, 'Dinner + drinks'), version })
      .expect(200);
    expect(edited.body.expense.version).toBe(1);
    expect(edited.body.expense.history).toHaveLength(1);
    expect(edited.body.expense.history[0]).toMatchObject({
      editedBy: bala.id,
      changes: expect.arrayContaining([
        { field: 'description', from: 'Dinner', to: 'Dinner + drinks' },
        { field: 'amount', from: 10_000, to: 30_000 },
        expect.objectContaining({ field: 'split' }),
      ]),
    });
    expect(await balanceMap(asha, groupId)).toEqual({
      [asha.id]: 20_000,
      [bala.id]: -10_000,
      [chirag.id]: -10_000,
    });
    expect((await getBalances(asha, groupId)).consistent).toBe(true);
  });

  it('refuses an edit based on an old version (no silent overwrite)', async () => {
    const created = await asha.agent
      .post(expensesUrl)
      .send(equalExpense(asha, [asha, bala], 10_000))
      .expect(201);
    const { id } = created.body.expense;
    await asha.agent
      .put(`${expensesUrl}/${id}`)
      .send({ ...equalExpense(asha, [asha, bala], 12_000), version: 0 })
      .expect(200);
    const stale = await bala.agent
      .put(`${expensesUrl}/${id}`)
      .send({ ...equalExpense(asha, [asha, bala], 99_000), version: 0 })
      .expect(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(await balanceMap(asha, groupId)).toEqual({ [asha.id]: 6_000, [bala.id]: -6_000 });
  });

  it('treats an edit with no changes as a no-op', async () => {
    const body = equalExpense(asha, [asha, bala], 10_000);
    const created = await asha.agent.post(expensesUrl).send(body).expect(201);
    const same = await asha.agent
      .put(`${expensesUrl}/${created.body.expense.id}`)
      .send({ ...body, version: 0 })
      .expect(200);
    expect(same.body.expense.version).toBe(0);
    expect(same.body.expense.history).toEqual([]);
  });

  it('deletes an expense and reverses its effect', async () => {
    const created = await asha.agent
      .post(expensesUrl)
      .send(equalExpense(asha, [asha, bala], 10_000))
      .expect(201);
    const { id } = created.body.expense;
    await bala.agent.delete(`${expensesUrl}/${id}`).expect(204);
    await bala.agent.delete(`${expensesUrl}/${id}`).expect(404);
    await asha.agent.get(`${expensesUrl}/${id}`).expect(404);
    expect(await balanceMap(asha, groupId)).toEqual({});
    const list = await asha.agent.get(expensesUrl).expect(200);
    expect(list.body.items).toEqual([]);
  });

  it('pages through expenses newest first, and filters by category and text', async () => {
    const days = ['2026-01-05', '2026-03-10', '2026-02-01', '2026-03-10', '2026-04-22'];
    for (const [i, date] of days.entries()) {
      await asha.agent
        .post(expensesUrl)
        .send({
          ...equalExpense(asha, [asha, bala], 1_000 * (i + 1), `Item ${i}`),
          date,
          category: i % 2 ? 'travel' : 'food',
        })
        .expect(201);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?limit=2&cursor=${cursor}` : '?limit=2';
      const page = await asha.agent.get(`${expensesUrl}${query}`).expect(200);
      expect(page.body.items.length).toBeLessThanOrEqual(2);
      seen.push(
        ...page.body.items.map(
          (e: { date: string; description: string }) => `${e.date} ${e.description}`,
        ),
      );
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual([
      '2026-04-22 Item 4',
      '2026-03-10 Item 3',
      '2026-03-10 Item 1',
      '2026-02-01 Item 2',
      '2026-01-05 Item 0',
    ]);

    const travel = await asha.agent.get(`${expensesUrl}?category=travel`).expect(200);
    expect(travel.body.items).toHaveLength(2);
    const search = await asha.agent.get(`${expensesUrl}?search=item 2`).expect(200);
    expect(search.body.items.map((e: { description: string }) => e.description)).toEqual([
      'Item 2',
    ]);
    // Regex characters in the search are matched literally.
    await asha.agent.get(`${expensesUrl}?search=(a+)+$`).expect(200);
    await asha.agent.get(`${expensesUrl}?cursor=bogus`).expect(400);
  });

  it('cannot reach an expense through another group (no IDOR)', async () => {
    const eve = await signUp('Eve');
    const { id: otherGroup } = await makeGroup(eve, [], 'Eve group');
    const created = await asha.agent
      .post(expensesUrl)
      .send(equalExpense(asha, [asha, bala], 10_000))
      .expect(201);
    const { id } = created.body.expense;
    await eve.agent.get(`/api/groups/${otherGroup}/expenses/${id}`).expect(404);
    await eve.agent
      .put(`/api/groups/${otherGroup}/expenses/${id}`)
      .send({ ...equalExpense(eve, [eve], 1), version: 0 })
      .expect(404);
    await eve.agent.delete(`/api/groups/${otherGroup}/expenses/${id}`).expect(404);
  });

  it('stores the date as a calendar day', async () => {
    const res = await asha.agent
      .post(expensesUrl)
      .send({ ...equalExpense(asha, [asha], 500), date: today() })
      .expect(201);
    expect(res.body.expense.date).toBe(today());
  });
});
