import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../../src/app';
import { SESSION_COOKIE } from '../../src/middleware/auth';
import { app, PASSWORD, signUp, useTestDb } from '../helpers/api';

useTestDb();

const sessionCookie = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith(SESSION_COOKIE));

describe('auth', () => {
  it('registers a user with an httpOnly session cookie and never returns the hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Asha Rao', email: ' Asha@Example.com ', password: PASSWORD })
      .expect(201);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Asha Rao',
      email: 'asha@example.com',
      upiId: null,
      emailReminders: true,
    });
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('rejects invalid input with field details', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'email',
      'name',
      'password',
    ]);
  });

  it('refuses a second account with the same email, in any letter case', async () => {
    await signUp('Asha');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Other', email: 'ASHA@example.com', password: PASSWORD })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('logs in, and gives the same answer for a wrong password and an unknown email', async () => {
    await signUp('Asha');
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'asha@example.com', password: PASSWORD })
      .expect(200);
    expect(sessionCookie(ok)).toBeDefined();

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'asha@example.com', password: 'nope-nope-nope' })
      .expect(401);
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD })
      .expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('protects /me and accepts the session cookie or a bearer token', async () => {
    await request(app).get('/api/auth/me').expect(401);
    const asha = await signUp('Asha');
    const me = await asha.agent.get('/api/auth/me').expect(200);
    expect(me.body.user.name).toBe('Asha');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: asha.email, password: PASSWORD });
    const token = sessionCookie(login)!.split(';')[0]!.split('=')[1]!;
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('rejects forged, unsigned and expired tokens', async () => {
    const asha = await signUp('Asha');
    const forged = jwt.sign({ ver: 0 }, 'some-other-secret-of-sufficient-length', {
      subject: asha.id,
    });
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: asha.id, ver: 0 })}.`;
    const expired = jwt.sign({ ver: 0, exp: 1 }, process.env.JWT_SECRET!, { subject: asha.id });
    for (const token of [forged, unsigned, expired, 'garbage']) {
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    }
  });

  it('logs out, and "sign out everywhere" revokes other sessions', async () => {
    const asha = await signUp('Asha');
    const laptop = request.agent(app);
    await laptop
      .post('/api/auth/login')
      .send({ email: asha.email, password: PASSWORD })
      .expect(200);

    await asha.agent.post('/api/auth/logout').expect(204);
    await asha.agent.get('/api/auth/me').expect(401);
    await laptop.get('/api/auth/me').expect(200);

    await laptop.post('/api/auth/logout-all').expect(204);
    const phone = request.agent(app);
    await phone.post('/api/auth/login').send({ email: asha.email, password: PASSWORD }).expect(200);
    await phone.get('/api/auth/me').expect(200); // new logins still work
  });

  it('old tokens stop working after "sign out everywhere"', async () => {
    const asha = await signUp('Asha');
    const other = request.agent(app);
    await other.post('/api/auth/login').send({ email: asha.email, password: PASSWORD });
    await asha.agent.post('/api/auth/logout-all').expect(204);
    await other.get('/api/auth/me').expect(401);
  });

  it('updates the profile and validates the UPI ID', async () => {
    const asha = await signUp('Asha');
    const res = await asha.agent
      .patch('/api/auth/me')
      .send({ upiId: 'asha@okaxis', emailReminders: false })
      .expect(200);
    expect(res.body.user).toMatchObject({ upiId: 'asha@okaxis', emailReminders: false });

    await asha.agent.patch('/api/auth/me').send({ upiId: 'not a upi id' }).expect(400);
    const cleared = await asha.agent.patch('/api/auth/me').send({ upiId: '' }).expect(200);
    expect(cleared.body.user.upiId).toBeNull();
  });

  it('rate-limits repeated failed logins', async () => {
    const limited = createApp({ authRateLimitMax: 3 });
    await signUp('Asha', limited);
    const attempt = () =>
      request(limited)
        .post('/api/auth/login')
        .send({ email: 'asha@example.com', password: 'wrong-guess' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('answers malformed JSON and unknown routes with JSON errors', async () => {
    const bad = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
    const missing = await request(app).get('/api/nope').expect(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });

  it('reports health', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });
});
