import cron, { type ScheduledTask } from 'node-cron';
import { config } from '../config';
import { logger } from '../logger';
import type { Mailer } from '../services/mailer';
import { sendWeeklyReminders } from '../services/reminders';

/**
 * Schedules the weekly reminder emails (default: Mondays 09:00 India time). Running it on
 * several instances is safe because sending is idempotent per user and week (see ReminderLog).
 */
export function startScheduler(mailer: Mailer): ScheduledTask | null {
  const expression = config.remindersCron;
  if (!expression) {
    logger.info('Weekly reminders are off (REMINDERS_CRON is empty)');
    return null;
  }
  if (!cron.validate(expression)) throw new Error(`Invalid REMINDERS_CRON: "${expression}"`);

  const task = cron.schedule(
    expression,
    async () => {
      try {
        logger.info(await sendWeeklyReminders({ mailer }), 'Weekly reminders done');
      } catch (err) {
        logger.error({ err }, 'Weekly reminders failed');
      }
    },
    { timezone: config.remindersTimezone, name: 'weekly-reminders', noOverlap: true },
  );
  logger.info(
    { cron: expression, timezone: config.remindersTimezone, nextRun: task.getNextRun() },
    'Weekly reminders scheduled',
  );
  return task;
}
