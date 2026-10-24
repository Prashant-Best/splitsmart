import { Schema, model, type Types } from 'mongoose';
import { CURRENCIES, type Currency } from '../domain';

export const MEMBER_ROLES = ['owner', 'member'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export interface MemberDoc {
  user: Types.ObjectId;
  role: MemberRole;
  /**
   * Net balance in paise, kept up to date inside the same transaction as every expense and
   * settlement. Positive: the group owes this member. Negative: the member owes the group.
   * The balances of a group always sum to exactly zero.
   */
  balance: number;
  joinedAt: Date;
}

export interface GroupDoc {
  _id: Types.ObjectId;
  name: string;
  currency: Currency;
  createdBy: Types.ObjectId;
  members: MemberDoc[];
  /** Secret part of the invite link; resetting it disables old links. */
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const memberSchema = new Schema<MemberDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: MEMBER_ROLES, required: true, default: 'member' },
    balance: { type: Number, required: true, default: 0 },
    joinedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const groupSchema = new Schema<GroupDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    currency: { type: String, enum: CURRENCIES, required: true, default: 'INR' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },
    inviteCode: { type: String, required: true },
  },
  { timestamps: true },
);

groupSchema.index({ 'members.user': 1, updatedAt: -1 });
groupSchema.index({ inviteCode: 1 }, { unique: true });

export const Group = model<GroupDoc>('Group', groupSchema);
