import bcrypt from 'bcryptjs';
import type { Types } from 'mongoose';
import { config } from '../config';
import { conflict, notFound, unauthorized } from '../errors';
import { isDuplicateKeyError, User, type UserDoc } from '../models';
import type { PublicUser } from './serializers';

let dummyHash: Promise<string> | undefined;

/**
 * A hash to compare against when the email does not exist, so "unknown email" and "wrong
 * password" take the same time and response times do not reveal which emails have accounts.
 */
const timingHash = () =>
  (dummyHash ??= bcrypt.hash('splitsmart-timing-check', config.bcryptRounds));

export async function registerUser(input: { name: string; email: string; password: string }) {
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  try {
    const user = await User.create({ name: input.name, email: input.email, passwordHash });
    return user.toObject<UserDoc>();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw err;
  }
}

export async function verifyLogin(email: string, password: string) {
  const user = await User.findOne({ email }).select('+passwordHash').lean<UserDoc>();
  const matches = await bcrypt.compare(password, user?.passwordHash ?? (await timingHash()));
  if (!user || !matches) throw unauthorized('Wrong email or password');
  return user;
}

export async function getUser(userId: string) {
  const user = await User.findById(userId).lean<UserDoc>();
  if (!user) throw notFound('User');
  return user;
}

export async function updateProfile(
  userId: string,
  changes: { name?: string; upiId?: string | null; emailReminders?: boolean },
) {
  const $set: Partial<UserDoc> = {};
  const $unset: Record<string, 1> = {};
  if (changes.name !== undefined) $set.name = changes.name;
  if (changes.emailReminders !== undefined) $set.emailReminders = changes.emailReminders;
  if (changes.upiId !== undefined) {
    if (changes.upiId) $set.upiId = changes.upiId;
    else $unset.upiId = 1;
  }
  const user = await User.findByIdAndUpdate(
    userId,
    { $set, $unset },
    { returnDocument: 'after', runValidators: true },
  ).lean<UserDoc>();
  if (!user) throw notFound('User');
  return user;
}

/** Invalidates every session of the user ("sign out everywhere"). */
export async function revokeSessions(userId: string): Promise<void> {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}

/** Public profiles (name, email, UPI ID) by id, for showing group members. */
export async function usersById(ids: Iterable<Types.ObjectId | string>) {
  const unique = [...new Set([...ids].map(String))];
  const users = await User.find({ _id: { $in: unique } })
    .select('name email upiId')
    .lean<PublicUser[]>();
  return new Map(users.map((u) => [u._id.toString(), u]));
}
