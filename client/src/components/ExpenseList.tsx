import type { Category } from '@domain';
import { Paperclip, Receipt, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useExpenses } from '../api/queries';
import type { Expense, Group } from '../api/types';
import { useCurrentUser } from '../auth';
import { CATEGORIES, CATEGORY_LABELS } from '../lib/categories';
import { cn } from '../lib/cn';
import { formatDay, formatMoney, formatMonth } from '../lib/format';
import { CategoryIcon } from './CategoryIcon';
import { Button } from './ui/Button';
import { Input, Select } from './ui/Field';
import { EmptyState, Spinner } from './ui/Misc';

/** How an expense affects the signed-in user: what they paid minus their share. */
function myPosition(expense: Expense, me: string) {
  const paid = expense.payers.find((p) => p.user === me)?.amount ?? 0;
  const share = expense.shares.find((s) => s.user === me)?.amount ?? 0;
  return { involved: paid > 0 || share > 0, net: paid - share };
}

function payerText(expense: Expense, group: Group, me: string, money: (v: number) => string) {
  const name = (id: string) =>
    id === me ? 'You' : (group.members.find((m) => m.id === id)?.name.split(' ')[0] ?? 'Someone');
  if (expense.payers.length === 1)
    return `${name(expense.payers[0]!.user)} paid ${money(expense.amount)}`;
  return `${expense.payers.length} people paid ${money(expense.amount)}`;
}

export function ExpenseList({
  group,
  onOpen,
  onAdd,
}: {
  group: Group;
  onOpen: (expenseId: string) => void;
  onAdd: () => void;
}) {
  const me = useCurrentUser();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const expenses = useExpenses(group.id, {
    search: deferredSearch || undefined,
    category: category || undefined,
  });
  const money = (v: number) => formatMoney(v, group.currency);
  const items = expenses.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = Boolean(deferredSearch || category);

  // Group consecutive expenses by month (the list is already newest first).
  const months: { month: string; items: Expense[] }[] = [];
  for (const expense of items) {
    const month = expense.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.month === month) last.items.push(expense);
    else months.push({ month, items: [expense] });
  }

  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            type="search"
            className="pl-9"
            placeholder="Search expenses"
            aria-label="Search expenses"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          aria-label="Filter by category"
          className="sm:w-48"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
      </div>

      {expenses.isPending ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={filtered ? 'No matching expenses' : 'No expenses yet'}
          action={!filtered && <Button onClick={onAdd}>Add the first expense</Button>}
        >
          {filtered
            ? 'Try another search or category.'
            : 'Add a bill and SplitSmart works out who owes whom.'}
        </EmptyState>
      ) : (
        <div className={cn('transition-opacity', expenses.isPlaceholderData && 'opacity-60')}>
          {months.map(({ month, items: monthItems }) => (
            <section key={month} aria-label={formatMonth(month)}>
              <h3 className="sticky top-16 z-10 border-b border-slate-100 bg-slate-50/95 px-5 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase backdrop-blur">
                {formatMonth(month)}
              </h3>
              <ul className="divide-y divide-slate-100">
                {monthItems.map((expense) => {
                  const { involved, net } = myPosition(expense, me.id);
                  const [day, mon] = formatDay(expense.date).split(' ');
                  return (
                    <li key={expense.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(expense.id)}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50"
                      >
                        <span className="w-9 shrink-0 text-center leading-tight text-slate-500">
                          <span className="block text-[11px] uppercase">{mon}</span>
                          <span className="block text-lg font-semibold text-slate-700">{day}</span>
                        </span>
                        <CategoryIcon category={expense.category as Category} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 font-medium text-slate-900">
                            <span className="truncate">{expense.description}</span>
                            {expense.receipt && (
                              <Paperclip
                                className="size-3.5 shrink-0 text-slate-400"
                                aria-label="Has a receipt"
                              />
                            )}
                          </span>
                          <span className="block truncate text-sm text-slate-500">
                            {payerText(expense, group, me.id, money)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-sm">
                          {!involved ? (
                            <span className="text-slate-400">not involved</span>
                          ) : net === 0 ? (
                            <span className="text-slate-500">no balance</span>
                          ) : (
                            <>
                              <span
                                className={cn(
                                  'block text-xs',
                                  net > 0 ? 'text-teal-700' : 'text-rose-700',
                                )}
                              >
                                {net > 0 ? 'you lent' : 'you borrowed'}
                              </span>
                              <span
                                className={cn(
                                  'tabular block font-semibold',
                                  net > 0 ? 'text-teal-700' : 'text-rose-700',
                                )}
                              >
                                {money(Math.abs(net))}
                              </span>
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {expenses.hasNextPage && (
            <div className="flex justify-center p-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void expenses.fetchNextPage()}
                loading={expenses.isFetchingNextPage}
              >
                Load older expenses
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
