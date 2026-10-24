import { mkdir } from 'node:fs/promises';
import { createApp } from './app';
import { config } from './config';
import { connectDb, disconnectDb } from './db';
import { startScheduler } from './jobs/scheduler';
import { logger } from './logger';
import { prepareCollections } from './models';
import { createMailer } from './services/mailer';

async function main(): Promise<void> {
  await connectDb(config.mongoUri);
  await prepareCollections();
  await mkdir(config.uploadDir, { recursive: true });

  const server = createApp().listen(config.port, () => {
    logger.info(`SplitSmart API listening on http://localhost:${config.port}`);
  });
  const reminders = startScheduler(createMailer());

  // Finish in-flight requests, stop the cron job and close the database before exiting.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    void reminders?.stop();
    server.close(() => {
      disconnectDb()
        .catch((err: unknown) => logger.error({ err }, 'Error while closing MongoDB'))
        .finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'SplitSmart API failed to start');
  process.exit(1);
});
