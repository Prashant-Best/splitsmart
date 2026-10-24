import mongoose, { type ClientSession, type ConnectOptions } from 'mongoose';
import { logger } from './logger';

mongoose.set('strictQuery', true);

export async function connectDb(uri: string, options: ConnectOptions = {}): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000, ...options });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

/**
 * Runs `work` inside a MongoDB transaction: either every write in it commits or none does.
 * Reads see one consistent snapshot, and writes are acknowledged by a majority of the replica
 * set.
 *
 * The driver retries the whole callback on transient errors, for example a write conflict when
 * two people add expenses to the same group at the same moment. So `work` must only touch the
 * database (no emails or file writes), because it can run more than once.
 */
export async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await mongoose.connection.transaction(
    async (session) => {
      result = await work(session);
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
  );
  return result as T;
}
