// Runs in every integration test worker before any app code is imported, so `config` picks it up.
import os from 'node:os';
import path from 'node:path';

const worker = process.env.JEST_WORKER_ID ?? '0';
const [hosts = '', query] = (process.env.TEST_MONGODB_URI ?? '').split('?');

// One database per Jest worker, so test files running in parallel never share data.
process.env.MONGODB_URI = `${hosts.replace(/\/[^/]*$/, '')}/splitsmart_test_${worker}${query ? `?${query}` : ''}`;
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
process.env.BCRYPT_ROUNDS = '4';
process.env.LOG_LEVEL = 'silent';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `splitsmart-test-uploads-${worker}`);
process.env.REMINDERS_CRON = '';
process.env.APP_URL = 'http://localhost:5173';
process.env.RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
