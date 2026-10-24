/**
 * Runs the weekly reminder job once, right now (the cron schedule normally does this).
 * Without SMTP_URL the emails are saved as HTML files in server/.outbox/.
 *
 *   npm run reminders:send
 */
import { config } from '../src/config';
import { connectDb, disconnectDb } from '../src/db';
import { createMailer } from '../src/services/mailer';
import { sendWeeklyReminders } from '../src/services/reminders';

async function main(): Promise<void> {
  await connectDb(config.mongoUri);
  const result = await sendWeeklyReminders({ mailer: createMailer() });
  console.log('Reminders:', result);
  if (!config.smtpUrl) console.log(`Emails were saved to ${config.outboxDir}`);
  await disconnectDb();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
