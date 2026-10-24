import { Schema, model, type Types } from 'mongoose';

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  /** Where friends send UPI payments, e.g. "prashant@okicici". */
  upiId?: string;
  /** Opt-out for the weekly "you owe" email. */
  emailReminders: boolean;
  /** Tokens carry the version they were issued with; "sign out everywhere" increments it. */
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    upiId: { type: String, trim: true },
    emailReminders: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export const User = model<UserDoc>('User', userSchema);
