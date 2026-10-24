/**
 * Local MongoDB for development without installing anything: runs the mongod binary that
 * mongodb-memory-server downloads (and caches) as a persistent single-node replica set.
 * Transactions need a replica set; data is kept in server/.data/db between runs.
 *
 *   npm run db      ->  mongodb://127.0.0.1:27017/splitsmart?directConnection=true
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { MongoBinary } from 'mongodb-memory-server';

const PORT = Number(process.env.DEV_DB_PORT ?? 27017);
const DB_PATH = path.resolve(__dirname, '..', '.data', 'db');
const ADMIN_URI = `mongodb://127.0.0.1:${PORT}/?directConnection=true`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  await mkdir(DB_PATH, { recursive: true });
  const binary = await MongoBinary.getPath();
  const mongod = spawn(
    binary,
    [
      '--replSet',
      'rs0',
      '--dbpath',
      DB_PATH,
      '--port',
      String(PORT),
      '--bind_ip',
      '127.0.0.1',
      '--quiet',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  mongod.on('exit', (code) => {
    console.log(`mongod exited (${code ?? 'signal'})`);
    process.exit(code ?? 0);
  });

  const client = new MongoClient(ADMIN_URI, { serverSelectionTimeoutMS: 30_000 });
  try {
    await client.connect();
  } catch (err) {
    console.error(`Could not reach mongod on port ${PORT}. Is another MongoDB already using it?`);
    mongod.kill();
    throw err;
  }
  const admin = client.db('admin');

  // Initiate the replica set on first run; later runs find it already configured.
  try {
    await admin.command({ replSetGetStatus: 1 });
  } catch {
    await admin.command({
      replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `127.0.0.1:${PORT}` }] },
    });
  }
  while (!(await admin.command({ hello: 1 })).isWritablePrimary) await sleep(250);
  await client.close();

  console.log(
    `MongoDB replica set ready: mongodb://127.0.0.1:${PORT}/splitsmart?directConnection=true`,
  );
  console.log(`Data directory: ${DB_PATH}  (Ctrl+C to stop)`);

  // Shut mongod down cleanly so its data files are never left half-written.
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    setTimeout(() => mongod.kill(), 10_000).unref(); // last resort if it does not stop
    const shutdown = new MongoClient(ADMIN_URI, { serverSelectionTimeoutMS: 3_000 });
    try {
      await shutdown.connect();
      await shutdown.db('admin').command({ shutdown: 1 });
    } catch {
      // Expected: the server drops the connection while it shuts down.
    }
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
