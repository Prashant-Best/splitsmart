import { ReminderLog } from '../../src/models';
import { MemoryMailer, type MailMessage, type Mailer } from '../../src/services/mailer';
import { isoWeek, sendWeeklyReminders } from '../../src/services/reminders';
import { equalExpense, makeGroup, signUp, useTestDb, type TestUser } from '../helpers/api';

useTestDb();

let asha: TestUser;
let bala: TestUser;
let chirag: TestUser;

beforeEach(async () => {
  asha = await signUp('Asha');
  bala = await signUp('Bala <b>');
  chirag = await signUp('Chirag');
  await asha.agent.patch('/api/auth/me').send({ upiId: 'asha@okaxis' }).expect(200);
  const { id } = await makeGroup(asha, [bala, chirag], 'Goa & Gokarna');
  await asha.agent
    .post(`/api/groups/${id}/expenses`)
    .send(equalExpense(asha, [asha, bala, chirag], 90_000, 'Villa'))
    .expect(201);
});

const monday = new Date('2026-10-26T03:30:00Z'); // 09:00 in India

describe('weekly reminders', () => {
  it('emails each debtor whom to pay, with a UPI link, and nobody else', async () => {
    const mailer = new MemoryMailer();
    const result = await sendWeeklyReminders({ mailer, now: monday });
    expect(result).toMatchObject({ period: '2026-W44', groups: 1, sent: 2, skipped: 0, failed: 0 });

    const recipients = mailer.sent.map((m) => m.to).sort();
    expect(recipients).toEqual([bala.email, chirag.email].sort());
    const email = mailer.sent.find((m) => m.to === chirag.email)!;
    expect(email.subject).toBe('Reminder: you owe ₹300.00 in 1 SplitSmart group');
    expect(email.html).toContain('upi://pay?pa=asha@okaxis&amp;pn=Asha&amp;am=300.00&amp;cu=INR');
    expect(email.text).toContain('Goa & Gokarna: pay Asha ₹300.00');
    // User-controlled text is escaped in the HTML.
    expect(email.html).toContain('Goa &amp; Gokarna');
    const balaEmail = mailer.sent.find((m) => m.to === bala.email)!;
    expect(balaEmail.html).toContain('Bala &lt;b&gt;');
    expect(balaEmail.html).not.toContain('<b>');
  });

  it('sends at most one email per person per week, even if the job runs twice', async () => {
    const mailer = new MemoryMailer();
    await sendWeeklyReminders({ mailer, now: monday });
    const again = await sendWeeklyReminders({ mailer, now: monday });
    expect(again).toMatchObject({ sent: 0, skipped: 2 });
    expect(mailer.sent).toHaveLength(2);

    const nextWeek = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(await sendWeeklyReminders({ mailer, now: nextWeek })).toMatchObject({ sent: 2 });
  });

  it('respects the opt-out setting', async () => {
    await chirag.agent.patch('/api/auth/me').send({ emailReminders: false }).expect(200);
    const mailer = new MemoryMailer();
    expect(await sendWeeklyReminders({ mailer, now: monday })).toMatchObject({
      sent: 1,
      skipped: 1,
    });
    expect(mailer.sent.map((m) => m.to)).toEqual([bala.email]);
  });

  it('retries next run when sending fails', async () => {
    let calls = 0;
    const flaky: Mailer = {
      send: (_message: MailMessage) => {
        calls++;
        return Promise.reject(new Error('SMTP down'));
      },
    };
    expect(await sendWeeklyReminders({ mailer: flaky, now: monday })).toMatchObject({ failed: 2 });
    expect(calls).toBe(2);
    expect(await ReminderLog.countDocuments()).toBe(0);

    const mailer = new MemoryMailer();
    expect(await sendWeeklyReminders({ mailer, now: monday })).toMatchObject({ sent: 2 });
  });
});

describe('isoWeek', () => {
  it.each([
    ['2026-01-01T06:00:00Z', 'UTC', '2026-W01'],
    ['2027-01-01T06:00:00Z', 'UTC', '2026-W53'],
    ['2026-10-25T20:00:00Z', 'UTC', '2026-W43'], // Sunday in UTC...
    ['2026-10-25T20:00:00Z', 'Asia/Kolkata', '2026-W44'], // ...but Monday 01:30 in India
  ])('%s in %s is %s', (date, timeZone, expected) => {
    expect(isoWeek(new Date(date), timeZone)).toBe(expected);
  });
});
