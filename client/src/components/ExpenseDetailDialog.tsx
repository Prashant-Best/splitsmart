import { FileText, History, Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { receiptUrl, useDeleteExpense, useExpense, useRemoveReceipt } from '../api/queries';
import type { Change, Expense, Group } from '../api/types';
import { useCurrentUser } from '../auth';
import { CATEGORY_LABELS } from '../lib/categories';
import { formatFullDay, formatMoney, timeAgo, toDecimalString } from '../lib/format';
import { CategoryIcon } from './CategoryIcon';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { ConfirmDialog, Dialog } from './ui/Dialog';
import { Spinner } from './ui/Misc';

const SPLIT_NAMES = {
  equal: 'equally',
  exact: 'by exact amounts',
  percentage: 'by percentages',
  shares: 'by shares',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** One line of the edit history, e.g. "amount: ₹7,680.00 → ₹7,860.00". */
function describeChange(
  change: Change,
  money: (v: number) => string,
  name: (id: string) => string,
) {
  const value = (v: unknown) => (typeof v === 'number' ? money(v) : String(v ?? '–'));
  switch (change.field) {
    case 'amount':
      return `amount ${value(change.from)} → ${value(change.to)}`;
    case 'description':
    case 'category':
    case 'date':
    case 'notes':
      return `${change.field} “${String(change.from || '–')}” → “${String(change.to || '–')}”`;
    case 'payers': {
      const list = (v: unknown) =>
        (v as { user: string; amount: number }[])
          .map((p) => `${name(p.user)} ${money(p.amount)}`)
          .join(', ');
      return `who paid: ${list(change.from)} → ${list(change.to)}`;
    }
    case 'split': {
      const type = (v: unknown) => SPLIT_NAMES[(v as { type: keyof typeof SPLIT_NAMES }).type];
      const [from, to] = [type(change.from), type(change.to)];
      return from === to ? 'everyone’s share recalculated' : `split ${from} → ${to}`;
    }
    default:
      return change.field;
  }
}

export function ExpenseDetailDialog({
  group,
  expenseId,
  onClose,
  onEdit,
}: {
  group: Group;
  expenseId: string | null;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
}) {
  const me = useCurrentUser();
  const { data: expense, isPending, error } = useExpense(group.id, expenseId);
  const remove = useDeleteExpense(group.id);
  const removeReceipt = useRemoveReceipt(group.id);
  const [confirming, setConfirming] = useState(false);
  const money = (v: number) => formatMoney(v, group.currency);
  const member = (id: string) => group.members.find((m) => m.id === id);
  const name = (id: string) => (id === me.id ? 'You' : (member(id)?.name ?? 'Former member'));

  const weightLabel = (user: string) => {
    if (!expense) return null;
    const weight = expense.split.weights.find((w) => w.user === user)?.weight;
    if (weight === undefined) return null;
    return expense.split.type === 'percentage'
      ? `${toDecimalString(weight)}%`
      : `${weight} share${weight === 1 ? '' : 's'}`;
  };

  return (
    <>
      <Dialog
        open={expenseId !== null}
        onOpenChange={(open) => !open && onClose()}
        title={expense?.description ?? 'Expense'}
        description={
          expense
            ? `${CATEGORY_LABELS[expense.category]} · ${formatFullDay(expense.date)}`
            : undefined
        }
      >
        {isPending ? (
          <Spinner />
        ) : error || !expense ? (
          <p className="text-sm text-rose-700">
            {error ? errorMessage(error) : 'Expense not found'}
          </p>
        ) : (
          <div>
            <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
              <CategoryIcon category={expense.category} className="bg-white" />
              <div>
                <p className="text-2xl font-semibold tracking-tight">{money(expense.amount)}</p>
                <p className="text-sm text-slate-500">
                  Added by {name(expense.createdBy)} {timeAgo(expense.createdAt)}
                </p>
              </div>
            </div>

            <Section title="Paid by">
              <ul className="space-y-2">
                {expense.payers.map((p) => (
                  <li key={p.user} className="flex items-center gap-3 text-sm">
                    <Avatar id={p.user} name={member(p.user)?.name ?? '?'} size="xs" />
                    <span className="flex-1">{name(p.user)}</span>
                    <span className="tabular font-medium">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={`Split ${SPLIT_NAMES[expense.split.type]}`}>
              <ul className="space-y-2">
                {expense.shares.map((s) => (
                  <li key={s.user} className="flex items-center gap-3 text-sm">
                    <Avatar id={s.user} name={member(s.user)?.name ?? '?'} size="xs" />
                    <span className="flex-1">
                      {name(s.user)}
                      {weightLabel(s.user) && (
                        <span className="ml-2 text-slate-400">{weightLabel(s.user)}</span>
                      )}
                    </span>
                    <span className="tabular font-medium">{money(s.amount)}</span>
                  </li>
                ))}
              </ul>
            </Section>

            {expense.notes && (
              <Section title="Notes">
                <p className="text-sm whitespace-pre-line text-slate-700">{expense.notes}</p>
              </Section>
            )}

            {expense.receipt && (
              <Section title="Receipt">
                {expense.receipt.mimeType.startsWith('image/') ? (
                  <a
                    href={receiptUrl(group.id, expense.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <img
                      src={`${receiptUrl(group.id, expense.id)}?v=${expense.version}`}
                      alt={`Receipt for ${expense.description}`}
                      className="max-h-72 rounded-xl border border-slate-200 object-contain"
                    />
                  </a>
                ) : (
                  <a
                    href={receiptUrl(group.id, expense.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline"
                  >
                    <FileText className="size-4" aria-hidden /> Open the PDF receipt
                  </a>
                )}
                <Button
                  variant="danger-ghost"
                  size="sm"
                  className="mt-2"
                  loading={removeReceipt.isPending}
                  onClick={() =>
                    removeReceipt.mutate(expense.id, {
                      onSuccess: () => toast.success('Receipt removed'),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  Remove receipt
                </Button>
              </Section>
            )}

            {expense.history && expense.history.length > 0 && (
              <Section title="Edit history">
                <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
                  {[...expense.history].reverse().map((h) => (
                    <li key={h.editedAt} className="text-sm">
                      <p className="flex items-center gap-1.5 text-slate-500">
                        <History className="size-3.5" aria-hidden />
                        {name(h.editedBy)} edited {timeAgo(h.editedAt)}
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-slate-700">
                        {h.changes.map((c) => (
                          <li key={c.field}>{describeChange(c, money, name)}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            <div className="mt-6 flex justify-between gap-2 border-t border-slate-100 pt-4">
              <Button variant="danger-ghost" onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" aria-hidden /> Delete
              </Button>
              <Button onClick={() => onEdit(expense)}>
                <Pencil className="size-4" aria-hidden /> Edit
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this expense?"
        message="Everyone's balance goes back to how it was before it was added. It stays in the activity feed."
        confirmLabel="Delete expense"
        loading={remove.isPending}
        onConfirm={() =>
          expense &&
          remove.mutate(expense.id, {
            onSuccess: () => {
              toast.success('Expense deleted');
              setConfirming(false);
              onClose();
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </>
  );
}
