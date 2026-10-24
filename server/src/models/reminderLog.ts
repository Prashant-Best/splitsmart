import { Schema, model, type Types } from 'mongoose';

/**
 * One row per user per ISO week in which a reminder email was sent. The unique index makes
 * sending idempotent: if the job runs twice (a retry, or two server instances each running the
 * cron), the second insert fails with a duplicate key and that run skips the user.
 */
export interface ReminderLogDoc {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** ISO week in the reminder time zone, e.g. "2026-W43". */
  period: string;
  totalOwed: number;
  sentAt: Date;
}

const reminderLogSchema = new Schema<ReminderLogDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    period: { type: String, required: true },
    totalOwed: { type: Number, required: true },
    sentAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

reminderLogSchema.index({ user: 1, period: 1 }, { unique: true });

export const ReminderLog = model<ReminderLogDoc>('ReminderLog', reminderLogSchema);
