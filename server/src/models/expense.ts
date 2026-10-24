import { Schema, model, type Types } from 'mongoose';
import { CATEGORIES, SPLIT_TYPES, type Category, type SplitType } from '../domain';

export interface AllocationDoc {
  user: Types.ObjectId;
  amount: number;
}

export interface WeightDoc {
  user: Types.ObjectId;
  weight: number;
}

export interface ChangeDoc {
  field: string;
  from: unknown;
  to: unknown;
}

export interface HistoryDoc {
  editedBy: Types.ObjectId;
  editedAt: Date;
  changes: ChangeDoc[];
}

export interface ReceiptDoc {
  key: string;
  mimeType: string;
  size: number;
  originalName: string;
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
}

export interface ExpenseDoc {
  _id: Types.ObjectId;
  group: Types.ObjectId;
  description: string;
  category: Category;
  /** Total in paise. */
  amount: number;
  /** The day of the expense, stored at 12:00 UTC so it is the same calendar day in every time zone. */
  date: Date;
  notes: string;
  /** Who paid and how much; adds up to `amount`. */
  payers: AllocationDoc[];
  splitType: SplitType;
  /** Percentages (basis points) or share counts as entered; empty for equal and exact splits. */
  splitWeights: WeightDoc[];
  /** What each participant owes, computed by the domain module; adds up to `amount`. */
  shares: AllocationDoc[];
  receipt: ReceiptDoc | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  /** Incremented on every change; edits must send the version they started from. */
  version: number;
  history: HistoryDoc[];
  /** Soft delete keeps the record for the activity feed. */
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const userRef = { type: Schema.Types.ObjectId, ref: 'User', required: true } as const;

const allocationSchema = new Schema<AllocationDoc>(
  { user: userRef, amount: { type: Number, required: true } },
  { _id: false },
);

const weightSchema = new Schema<WeightDoc>(
  { user: userRef, weight: { type: Number, required: true } },
  { _id: false },
);

const historySchema = new Schema<HistoryDoc>(
  {
    editedBy: userRef,
    editedAt: { type: Date, required: true },
    changes: [
      new Schema<ChangeDoc>(
        {
          field: { type: String, required: true },
          from: Schema.Types.Mixed,
          to: Schema.Types.Mixed,
        },
        { _id: false },
      ),
    ],
  },
  { _id: false },
);

const receiptSchema = new Schema<ReceiptDoc>(
  {
    key: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: { type: String, default: 'receipt' },
    uploadedBy: userRef,
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const expenseSchema = new Schema<ExpenseDoc>(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    description: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: CATEGORIES, required: true, default: 'other' },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    payers: { type: [allocationSchema], required: true },
    splitType: { type: String, enum: SPLIT_TYPES, required: true },
    splitWeights: { type: [weightSchema], default: [] },
    shares: { type: [allocationSchema], required: true },
    receipt: { type: receiptSchema, default: null },
    createdBy: userRef,
    updatedBy: userRef,
    version: { type: Number, required: true, default: 0 },
    history: { type: [historySchema], default: [] },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, versionKey: false },
);

// Newest-first pages of a group's live expenses.
expenseSchema.index({ group: 1, deletedAt: 1, date: -1, _id: -1 });

export const Expense = model<ExpenseDoc>('Expense', expenseSchema);
