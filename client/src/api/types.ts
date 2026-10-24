// Response shapes of the SplitSmart API. All money values are integer minor units (paise).
import type { Category, Currency, SplitInput, SplitType } from '@domain';

export interface User {
  id: string;
  name: string;
  email: string;
  upiId: string | null;
  emailReminders: boolean;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  upiId: string | null;
  role: 'owner' | 'member';
  /** Positive: the group owes them. Negative: they owe the group. */
  balance: number;
  joinedAt: string;
}

export interface Group {
  id: string;
  name: string;
  currency: Currency;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  members: Member[];
}

export interface GroupSummary {
  id: string;
  name: string;
  currency: Currency;
  updatedAt: string;
  members: { id: string; name: string }[];
  myBalance: number;
}

export interface Allocation {
  user: string;
  amount: number;
}

export interface Change {
  field: string;
  from: unknown;
  to: unknown;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  category: Category;
  amount: number;
  date: string;
  notes: string;
  payers: Allocation[];
  split: { type: SplitType; weights: { user: string; weight: number }[] };
  shares: Allocation[];
  receipt: { mimeType: string; size: number; originalName: string; uploadedAt: string } | null;
  version: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  history?: { editedBy: string; editedAt: string; changes: Change[] }[];
}

export interface ExpenseInput {
  description: string;
  amount: number;
  category: Category;
  date: string;
  notes: string;
  payers: Allocation[];
  split: SplitInput;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface BalanceSummary {
  currency: Currency;
  balances: { user: string; balance: number }[];
  simplified: Transfer[];
  pairwise: Transfer[];
  total: number;
  consistent: boolean;
}

export type PaymentMethod = 'upi' | 'cash' | 'bank' | 'other';

export interface Settlement extends Transfer {
  id: string;
  groupId: string;
  method: PaymentMethod;
  note: string;
  createdBy: string;
  createdAt: string;
}

export type ActivityType =
  | 'group.created'
  | 'group.renamed'
  | 'invite.reset'
  | 'member.joined'
  | 'expense.created'
  | 'expense.updated'
  | 'expense.deleted'
  | 'receipt.added'
  | 'receipt.removed'
  | 'settlement.created'
  | 'settlement.deleted';

export interface Activity {
  id: string;
  type: ActivityType;
  groupId: string;
  groupName: string;
  currency: Currency;
  actor: string;
  actorName: string;
  expenseId: string | null;
  settlementId: string | null;
  data: {
    description?: string;
    amount?: number;
    name?: string;
    previousName?: string;
    fields?: string[];
    from?: string;
    to?: string;
    fromName?: string;
    toName?: string;
    method?: PaymentMethod;
  };
  createdAt: string;
}

export interface Stats {
  currency: Currency;
  from: string;
  months: number;
  total: number;
  count: number;
  byMonth: { month: string; total: number; categories: Partial<Record<Category, number>> }[];
  byCategory: { category: Category; total: number }[];
  byMember: { user: string; paid: number; share: number }[];
}

export interface InvitePreview {
  group: { id: string; name: string; currency: Currency; memberCount: number };
  alreadyMember: boolean;
}
