import type { Category, SplitType } from '@domain';
import { Paperclip, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { useSaveExpense, useUploadReceipt } from '../api/queries';
import type { Expense, Group } from '../api/types';
import { useCurrentUser } from '../auth';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/categories';
import { cn } from '../lib/cn';
import { emptyForm, evaluate, formFromExpense, type ExpenseForm } from '../lib/expenseForm';
import { currencySymbol, formatMoney, todayIso, toDecimalString } from '../lib/format';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Field, Input, MoneyInput, Select, Textarea } from './ui/Field';
import { Segmented } from './ui/Segmented';

const SPLIT_OPTIONS: { value: SplitType; label: string }[] = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: 'Exact amounts' },
  { value: 'percentage', label: 'Percentages' },
  { value: 'shares', label: 'Shares' },
];

export function ExpenseFormDialog({
  open,
  onOpenChange,
  group,
  expense,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group;
  expense?: Expense;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={expense ? 'Edit expense' : 'Add an expense'}
      description={`In ${group.name}. Amounts are in ${group.currency}.`}
      size="lg"
    >
      <ExpenseFormBody group={group} expense={expense} onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}

function ExpenseFormBody({
  group,
  expense,
  onDone,
}: {
  group: Group;
  expense?: Expense;
  onDone: () => void;
}) {
  const me = useCurrentUser();
  const members = group.members;
  const [form, setForm] = useState<ExpenseForm>(() =>
    expense ? formFromExpense(expense, members) : emptyForm(members, me.id, todayIso()),
  );
  const [receipt, setReceipt] = useState<File | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const save = useSaveExpense(group.id);
  const upload = useUploadReceipt(group.id);
  const result = useMemo(() => evaluate(form, members), [form, members]);
  const symbol = currencySymbol(group.currency);
  const money = (paise: number) => formatMoney(paise, group.currency);

  const update = <K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const updateIn = (key: 'paid' | 'exact' | 'percent' | 'shares', user: string, value: string) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], [user]: value } }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!result.input) return;
    setServerError(null);
    try {
      const saved = await save.mutateAsync({
        id: expense?.id,
        version: expense?.version,
        input: result.input,
      });
      if (receipt) {
        try {
          await upload.mutateAsync({ expenseId: saved.id, file: receipt });
        } catch (error) {
          toast.error(`Expense saved, but the receipt was not: ${errorMessage(error)}`);
        }
      }
      toast.success(expense ? 'Expense updated' : `Added ${saved.description}`);
      onDone();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  };

  // What to say under the split list.
  let status: { text: string; tone: 'ok' | 'warn' | 'error' } | null = null;
  if (result.amount !== null) {
    if (
      (form.splitType === 'exact' || form.splitType === 'percentage') &&
      result.remaining !== null
    ) {
      const fmt = (v: number) => (form.splitType === 'exact' ? money(v) : `${toDecimalString(v)}%`);
      if (result.remaining > 0)
        status = { text: `${fmt(result.remaining)} left to assign`, tone: 'warn' };
      else if (result.remaining < 0)
        status = { text: `${fmt(-result.remaining)} more than the total`, tone: 'error' };
    }
    if (!status && result.splitError) status = { text: result.splitError, tone: 'error' };
    if (!status && result.shares) {
      status = {
        text: `Adds up to ${money(result.amount)} across ${result.shares.size} people`,
        tone: 'ok',
      };
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <Field label="Description" htmlFor="exp-description">
          <Input
            id="exp-description"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Dinner, cab, groceries…"
            maxLength={120}
            autoFocus
          />
        </Field>
        <Field label="Amount" htmlFor="exp-amount">
          <MoneyInput
            id="exp-amount"
            symbol={symbol}
            value={form.amount}
            onChange={(e) => update('amount', e.target.value)}
            placeholder="0.00"
            aria-invalid={form.amount !== '' && result.amount === null}
          />
        </Field>
        <Field label="Date" htmlFor="exp-date">
          <Input
            id="exp-date"
            type="date"
            value={form.date}
            onChange={(e) => update('date', e.target.value)}
          />
        </Field>
        <Field label="Category" htmlFor="exp-category">
          <Select
            id="exp-category"
            value={form.category}
            onChange={(e) => update('category', e.target.value as Category)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="space-y-3">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium text-slate-700">Paid by</legend>
          <button
            type="button"
            className="text-sm font-medium text-teal-700 hover:underline"
            onClick={() => update('multiPayer', !form.multiPayer)}
          >
            {form.multiPayer ? 'One person paid' : 'Several people paid'}
          </button>
        </div>
        {form.multiPayer ? (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <Avatar id={m.id} name={m.name} size="xs" />
                <span className="flex-1 truncate text-sm">
                  {m.id === me.id ? `${m.name} (you)` : m.name}
                </span>
                <MoneyInput
                  className="w-36"
                  symbol={symbol}
                  aria-label={`Amount paid by ${m.name}`}
                  value={form.paid[m.id] ?? ''}
                  onChange={(e) => updateIn('paid', m.id, e.target.value)}
                  placeholder="0.00"
                />
              </li>
            ))}
            {result.payerError && (
              <li className="py-2 text-sm text-rose-700" role="alert">
                {result.payerError}
              </li>
            )}
          </ul>
        ) : (
          <Select
            aria-label="Who paid"
            value={form.payer}
            onChange={(e) => update('payer', e.target.value)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me.id ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </Select>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-medium text-slate-700">Split</legend>
        <Segmented
          label="How to split"
          options={SPLIT_OPTIONS}
          value={form.splitType}
          onChange={(value) => update('splitType', value)}
          className="flex w-full"
        />
        <ul
          className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3"
          aria-label="Split between"
        >
          {members.map((m) => {
            const share = result.shares?.get(m.id);
            return (
              <li key={m.id} className="flex items-center gap-3 py-2">
                {form.splitType === 'equal' && (
                  <input
                    type="checkbox"
                    className="size-4 accent-teal-600"
                    checked={form.included[m.id] ?? false}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        included: { ...f.included, [m.id]: e.target.checked },
                      }))
                    }
                    aria-label={`Include ${m.name}`}
                  />
                )}
                <Avatar id={m.id} name={m.name} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {m.id === me.id ? `${m.name} (you)` : m.name}
                </span>
                {form.splitType === 'exact' && (
                  <MoneyInput
                    className="w-32"
                    symbol={symbol}
                    aria-label={`Exact amount for ${m.name}`}
                    value={form.exact[m.id] ?? ''}
                    onChange={(e) => updateIn('exact', m.id, e.target.value)}
                    placeholder="0.00"
                  />
                )}
                {form.splitType === 'percentage' && (
                  <div className="relative w-24">
                    <Input
                      inputMode="decimal"
                      className="tabular pr-7 text-right"
                      aria-label={`Percentage for ${m.name}`}
                      value={form.percent[m.id] ?? ''}
                      onChange={(e) => updateIn('percent', m.id, e.target.value)}
                      placeholder="0"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
                      %
                    </span>
                  </div>
                )}
                {form.splitType === 'shares' && (
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    step={1}
                    className="tabular w-20 text-right"
                    aria-label={`Shares for ${m.name}`}
                    value={form.shares[m.id] ?? ''}
                    onChange={(e) => updateIn('shares', m.id, e.target.value)}
                  />
                )}
                <span
                  className={cn(
                    'tabular w-24 text-right text-sm',
                    share ? 'text-slate-900' : 'text-slate-400',
                  )}
                  aria-label={`${m.name}'s share`}
                >
                  {share !== undefined ? money(share) : '–'}
                </span>
              </li>
            );
          })}
        </ul>
        {status && (
          <p
            className={cn(
              'text-sm',
              status.tone === 'ok' && 'text-teal-700',
              status.tone === 'warn' && 'text-amber-700',
              status.tone === 'error' && 'text-rose-700',
            )}
            role={status.tone === 'error' ? 'alert' : 'status'}
          >
            {status.text}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Notes (optional)" htmlFor="exp-notes">
          <Textarea
            id="exp-notes"
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            maxLength={500}
            rows={2}
          />
        </Field>
        <Field
          label={expense?.receipt ? 'Replace receipt' : 'Receipt (optional)'}
          htmlFor="exp-receipt"
          hint="JPEG, PNG, WebP or PDF, up to 5 MB."
        >
          {receipt ? (
            <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm">
              <Paperclip className="size-4 text-slate-500" aria-hidden />
              <span className="flex-1 truncate">{receipt.name}</span>
              <button type="button" onClick={() => setReceipt(null)} aria-label="Remove file">
                <X className="size-4 text-slate-500" />
              </button>
            </div>
          ) : (
            <Input
              id="exp-receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            />
          )}
        </Field>
      </div>

      {serverError && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {serverError}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!result.input} loading={save.isPending || upload.isPending}>
          {expense ? 'Save changes' : 'Add expense'}
        </Button>
      </div>
    </form>
  );
}
