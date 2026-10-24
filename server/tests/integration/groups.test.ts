import request from 'supertest';
import { app, makeGroup, signUp, useTestDb } from '../helpers/api';

useTestDb();

describe('groups and invites', () => {
  it('creates a group with the creator as owner and lists it with their balance', async () => {
    const asha = await signUp('Asha');
    const created = await asha.agent
      .post('/api/groups')
      .send({ name: 'Flat 302', currency: 'INR' })
      .expect(201);
    expect(created.body.group).toMatchObject({
      name: 'Flat 302',
      currency: 'INR',
      members: [{ id: asha.id, name: 'Asha', role: 'owner', balance: 0 }],
    });
    expect(created.body.group.inviteCode).toMatch(/^[A-Za-z0-9_-]{12}$/);

    const list = await asha.agent.get('/api/groups').expect(200);
    expect(list.body.groups).toEqual([
      expect.objectContaining({
        name: 'Flat 302',
        myBalance: 0,
        members: [{ id: asha.id, name: 'Asha' }],
      }),
    ]);
  });

  it('validates the group name and currency', async () => {
    const asha = await signUp('Asha');
    await asha.agent.post('/api/groups').send({ name: '   ' }).expect(400);
    await asha.agent.post('/api/groups').send({ name: 'Trip', currency: 'BTC' }).expect(400);
  });

  it('joins through an invite link exactly once', async () => {
    const asha = await signUp('Asha');
    const bala = await signUp('Bala');
    const { id, inviteCode } = await makeGroup(asha);

    const preview = await bala.agent.get(`/api/invites/${inviteCode}`).expect(200);
    expect(preview.body).toEqual({
      group: { id, name: 'Goa Trip', currency: 'INR', memberCount: 1 },
      alreadyMember: false,
    });

    await bala.agent.post(`/api/invites/${inviteCode}/join`).expect(201);
    const again = await bala.agent.post(`/api/invites/${inviteCode}/join`).expect(200);
    expect(again.body).toEqual({ groupId: id, joined: false });

    const group = await bala.agent.get(`/api/groups/${id}`).expect(200);
    expect(group.body.group.members.map((m: { name: string }) => m.name)).toEqual(['Asha', 'Bala']);
  });

  it('adds a member only once when the same join arrives twice at the same time', async () => {
    const asha = await signUp('Asha');
    const bala = await signUp('Bala');
    const { id, inviteCode } = await makeGroup(asha);
    const results = await Promise.all([
      bala.agent.post(`/api/invites/${inviteCode}/join`),
      bala.agent.post(`/api/invites/${inviteCode}/join`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    const group = await asha.agent.get(`/api/groups/${id}`).expect(200);
    expect(group.body.group.members).toHaveLength(2);
  });

  it('hides groups from non-members with a 404', async () => {
    const asha = await signUp('Asha');
    const eve = await signUp('Eve');
    const { id } = await makeGroup(asha);
    for (const path of ['', '/balances', '/expenses', '/activity', '/stats', '/settlements']) {
      await eve.agent.get(`/api/groups/${id}${path}`).expect(404);
    }
    await request(app).get(`/api/groups/${id}`).expect(401);
    await asha.agent.get('/api/groups/not-an-id').expect(400);
    await asha.agent.get('/api/groups/65f000000000000000000000').expect(404);
  });

  it('lets only the owner rename the group or reset the invite link', async () => {
    const asha = await signUp('Asha');
    const bala = await signUp('Bala');
    const carol = await signUp('Carol');
    const { id, inviteCode } = await makeGroup(asha, [bala]);

    await bala.agent.patch(`/api/groups/${id}`).send({ name: 'Mine now' }).expect(403);
    const renamed = await asha.agent
      .patch(`/api/groups/${id}`)
      .send({ name: 'Goa 2026' })
      .expect(200);
    expect(renamed.body.group.name).toBe('Goa 2026');

    await bala.agent.post(`/api/groups/${id}/invite/reset`).expect(403);
    const reset = await asha.agent.post(`/api/groups/${id}/invite/reset`).expect(200);
    expect(reset.body.inviteCode).not.toBe(inviteCode);
    await carol.agent.post(`/api/invites/${inviteCode}/join`).expect(404);
    await carol.agent.post(`/api/invites/${reset.body.inviteCode}/join`).expect(201);
  });

  it('rejects malformed invite codes', async () => {
    const asha = await signUp('Asha');
    await asha.agent.get('/api/invites/x').expect(400);
    await asha.agent.post('/api/invites/does-not-exist-123/join').expect(404);
  });
});
