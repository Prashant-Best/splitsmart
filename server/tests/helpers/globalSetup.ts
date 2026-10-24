// Starts one in-memory MongoDB replica set for the whole integration run. A replica set (not a
// standalone server) is required because the API uses multi-document transactions.
import { MongoMemoryReplSet } from 'mongodb-memory-server';

declare global {
  var __MONGO_REPLSET__: MongoMemoryReplSet | undefined;
}

export default async function globalSetup(): Promise<void> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  globalThis.__MONGO_REPLSET__ = replSet;
  // Test workers are started after this and inherit the variable.
  process.env.TEST_MONGODB_URI = replSet.getUri();
}
