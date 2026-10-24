import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const serverRoot = path.resolve(__dirname, '..');

// Local development reads server/.env with Node's built-in loader (no dotenv dependency).
// Variables already set in the environment win.
const envFile = path.join(serverRoot, '.env');
if (process.env.NODE_ENV !== 'test' && existsSync(envFile)) process.loadEnvFile(envFile);

const DEV_SECRET = 'dev-only-insecure-secret-change-me';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z
    .string()
    .min(1)
    .default('mongodb://127.0.0.1:27017/splitsmart?directConnection=true'),
  JWT_SECRET: z.string().min(16).default(DEV_SECRET),
  SESSION_DAYS: z.coerce.number().int().positive().max(90).default(7),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  APP_URL: z.url().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  COOKIE_SECURE: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).optional()),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_RECEIPT_MB: z.coerce.number().positive().max(20).default(5),
  SMTP_URL: z.preprocess(emptyToUndefined, z.string().optional()),
  MAIL_FROM: z.string().default('SplitSmart <reminders@splitsmart.local>'),
  OUTBOX_DIR: z.string().default('.outbox'),
  REMINDERS_CRON: z.string().trim().default(''),
  REMINDERS_TZ: z.string().default('Asia/Kolkata'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = envSchema.parse(env);
  const isProduction = e.NODE_ENV === 'production';
  if (isProduction && (e.JWT_SECRET === DEV_SECRET || e.JWT_SECRET.length < 32)) {
    throw new Error('Set JWT_SECRET to a random string of at least 32 characters in production');
  }
  return {
    env: e.NODE_ENV,
    isProduction,
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    mongoUri: e.MONGODB_URI,
    jwtSecret: e.JWT_SECRET,
    sessionDays: e.SESSION_DAYS,
    clientOrigins: e.CLIENT_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    appUrl: e.APP_URL.replace(/\/$/, ''),
    trustProxy: e.TRUST_PROXY,
    // Secure cookies by default in production; Docker on plain http://localhost turns it off.
    cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : isProduction,
    uploadDir: path.resolve(serverRoot, e.UPLOAD_DIR),
    maxReceiptBytes: Math.round(e.MAX_RECEIPT_MB * 1024 * 1024),
    smtpUrl: e.SMTP_URL,
    mailFrom: e.MAIL_FROM,
    outboxDir: path.resolve(serverRoot, e.OUTBOX_DIR),
    remindersCron: e.REMINDERS_CRON,
    remindersTimezone: e.REMINDERS_TZ,
    bcryptRounds: e.BCRYPT_ROUNDS,
    rateLimitMax: e.RATE_LIMIT_MAX,
    authRateLimitMax: e.AUTH_RATE_LIMIT_MAX,
    logLevel: e.LOG_LEVEL,
  };
}

export type Config = ReturnType<typeof loadConfig>;

export const config = loadConfig();
