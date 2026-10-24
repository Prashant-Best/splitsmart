import { Schema, model, type Types } from 'mongoose';

export const ACTIVITY_TYPES = [
  'group.created',
  'group.renamed',
  'invite.reset',
  'member.joined',
  'expense.created',
  'expense.updated',
  'expense.deleted',
  'receipt.added',
  'receipt.removed',
  'settlement.created',
  'settlement.deleted',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * One entry in a group's activity feed. Written in the same transaction as the change it
 * describes, so the feed never shows something that did not happen (or misses something that did).
 */
export interface ActivityDoc {
  _id: Types.ObjectId;
  group: Types.ObjectId;
  actor: Types.ObjectId;
  type: ActivityType;
  expense?: Types.ObjectId;
  settlement?: Types.ObjectId;
  /** Small snapshot for display, e.g. { description, amount } or { from, to, amount }. */
  data: Record<string, unknown>;
  createdAt: Date;
}

const activitySchema = new Schema<ActivityDoc>(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    expense: { type: Schema.Types.ObjectId, ref: 'Expense' },
    settlement: { type: Schema.Types.ObjectId, ref: 'Settlement' },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false, minimize: false },
);

// The feed pages backwards by _id (ObjectIds grow with time).
activitySchema.index({ group: 1, _id: -1 });

export const Activity = model<ActivityDoc>('Activity', activitySchema);
