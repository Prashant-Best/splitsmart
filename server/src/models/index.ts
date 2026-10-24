import { Activity } from './activity';
import { Expense } from './expense';
import { Group } from './group';
import { ReminderLog } from './reminderLog';
import { Settlement } from './settlement';
import { User } from './user';

export * from './activity';
export * from './expense';
export * from './group';
export * from './reminderLog';
export * from './settlement';
export * from './user';

/**
 * Creates every collection and index up front. Collections must exist before concurrent
 * transactions write to them, and unique indexes (emails, invite codes, reminder logs) must exist
 * before the first request relies on them.
 */
export async function prepareCollections(): Promise<void> {
  await Promise.all([User, Group, Expense, Settlement, Activity, ReminderLog].map((m) => m.init()));
}

/** True for MongoDB's duplicate-key error (a unique index rejected a write). */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}
