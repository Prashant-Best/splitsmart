import { Schema, model, type Types } from 'mongoose';

export const PAYMENT_METHODS = ['upi', 'cash', 'bank', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** A recorded payment from one member to another ("settle up"). */
export interface SettlementDoc {
  _id: Types.ObjectId;
  group: Types.ObjectId;
  from: Types.ObjectId;
  to: Types.ObjectId;
  /** Paise. */
  amount: number;
  method: PaymentMethod;
  note: string;
  createdBy: Types.ObjectId;
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const userRef = { type: Schema.Types.ObjectId, ref: 'User', required: true } as const;

const settlementSchema = new Schema<SettlementDoc>(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    from: userRef,
    to: userRef,
    amount: { type: Number, required: true },
    method: { type: String, enum: PAYMENT_METHODS, required: true, default: 'upi' },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    createdBy: userRef,
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

settlementSchema.index({ group: 1, deletedAt: 1, createdAt: -1 });

export const Settlement = model<SettlementDoc>('Settlement', settlementSchema);
