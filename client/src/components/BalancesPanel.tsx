import { ArrowRight, BadgeCheck, CircleAlert, HandCoins, Network } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { useBalances, useSettlements, useUndoPayment } from '../api/queries';
import type { Group, Transfer } from '../api/types';
import { useCurrentUser } from '../auth';
import { cn } from '../lib/cn';
import { formatDate, formatMoney } from '../lib/format';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/Dialog';
import { EmptyState, Spinner } from './ui/Misc';
import { Segmented } from './ui/Segmented';

/**
 * Each member's net balance as a diverging bar around a zero line: teal to the right for money
 * they get back, rose to the left for money they owe. The amount and the words next to every
 * bar carry the same information, so color is never the only cue.
 */
function BalanceBars({ group }: { group: Group }) {
  const me = useCurrentUser();
  const max = Math.max(1, ...group.members.map((m) => Math.abs(m.balance)));
  const sorted = [...group.members].sort((a, b) => b.balance - a.balance);
  return (
    <ul className="space-y-2.5">
      {sorted.map((m) => {
        const width = `${(Math.abs(m.balance) / max) * 50}%`;
        return (
          <li
            key={m.id}
            className="grid grid-cols-[minmax(0,9rem)_1fr_minmax(0,9rem)] items-center gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Avatar id={m.id} name={m.name} size="xs" />
              <span className="truncate">{m.id === me.id ? 'You' : m.name}</span>
            </span>
            <span className="relative h-3" aria-hidden>
              <span className="absolute inset-y-[-4px] left-1/2 w-px bg-slate-300" />
              {m.balance > 0 && (
                <span className="absolute inset-y-0 left-1/2 rounded-r bg-owed" style={{ width }} />
              )}
              {m.balance < 0 && (
                <span className="absolute inset-y-0 right-1/2 rounded-l bg-owe" style={{ width }} />
              )}
            </span>
            <span className="text-right text-slate-700">
              {m.balance === 0 ? (
                <span className="text-slate-400">settled</span>
              ) : (
                <>
                  <span className="text-xs text-slate-500">
                    {m.balance > 0 ? 'gets back ' : 'owes '}
                  </span>
                  <span className="tabular font-medium">
                    {formatMoney(Math.abs(m.balance), group.currency)}
                  </span>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PaymentRow({
  transfer,
  group,
  onPay,
}: {
  transfer: Transfer;
  group: Group;
  onPay: (transfer: Transfer) => void;
}) {
  const me = useCurrentUser();
  const person = (id: string) => group.members.find((m) => m.id === id);
  const label = (id: string) => (id === me.id ? 'You' : (person(id)?.name ?? 'Former member'));
  const mine = transfer.from === me.id;
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5',
        mine ? 'bg-rose-50/60' : transfer.to === me.id ? 'bg-teal-50/60' : '',
      )}
    >
      <Avatar id={transfer.from} name={person(transfer.from)?.name ?? '?'} size="sm" />
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium text-slate-900">{label(transfer.from)}</span>
        <ArrowRight className="mx-1.5 inline size-3.5 text-slate-400" aria-label="pays" />
        <span className="font-medium text-slate-900">{label(transfer.to)}</span>
      </span>
      <span className="tabular text-sm font-semibold">
        {formatMoney(transfer.amount, group.currency)}
      </span>
      {mine && (
        <Button size="sm" onClick={() => onPay(transfer)}>
          Pay
        </Button>
      )}
    </li>
  );
}

export function BalancesPanel({
  group,
  onPay,
}: {
  group: Group;
  onPay: (transfer?: Transfer) => void;
}) {
  const me = useCurrentUser();
  const balances = useBalances(group.id);
  const settlements = useSettlements(group.id);
  const undo = useUndoPayment(group.id);
  const [view, setView] = useState<'simplified' | 'pairwise'>('simplified');
  const [undoId, setUndoId] = useState<string | null>(null);
  const name = (id: string) =>
    id === me.id ? 'You' : (group.members.find((m) => m.id === id)?.name ?? 'Former member');

  if (balances.isPending) return <Spinner />;
  if (balances.error)
    return <p className="p-5 text-sm text-rose-700">{errorMessage(balances.error)}</p>;
  const { simplified, pairwise, consistent } = balances.data;
  const settled = simplified.length === 0;
  const list = view === 'simplified' ? simplified : pairwise;

  return (
    <div className="space-y-8 p-5">
      <section aria-labelledby="plan-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="plan-heading" className="font-semibold text-slate-900">
              {settled ? 'Everyone is settled up' : 'Who pays whom'}
            </h3>
            {!settled && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <Network className="size-4 text-teal-700" aria-hidden />
                <span>
                  <span className="font-semibold text-slate-900">{pairwise.length}</span> debts
                  between pairs, settled in{' '}
                  <span className="font-semibold text-slate-900">{simplified.length}</span> payment
                  {simplified.length === 1 ? '' : 's'}
                </span>
              </p>
            )}
          </div>
          {!settled && (
            <Segmented
              label="Payment plan"
              value={view}
              onChange={setView}
              options={[
                { value: 'simplified', label: 'Simplified' },
                { value: 'pairwise', label: 'Without simplifying' },
              ]}
            />
          )}
        </div>

        {settled ? (
          <EmptyState icon={HandCoins} title="No payments needed">
            Balances are all zero. New expenses will show up here.
          </EmptyState>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-500">
              {view === 'simplified'
                ? 'SplitSmart nets everyone’s balance, then repeatedly matches the person who owes the most with the person owed the most. Any group settles in at most n − 1 payments.'
                : 'Debts as they arose from each expense, netted between each pair of people: what the group would have to pay without simplification.'}
            </p>
            <ul className="mt-3 space-y-1.5">
              {list.map((t) => (
                <PaymentRow key={`${t.from}-${t.to}`} transfer={t} group={group} onPay={onPay} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="balances-heading">
        <h3 id="balances-heading" className="mb-3 font-semibold text-slate-900">
          Balances
        </h3>
        <BalanceBars group={group} />
        <p
          className={cn(
            'mt-4 flex items-center gap-1.5 text-xs',
            consistent ? 'text-slate-500' : 'text-rose-700',
          )}
        >
          {consistent ? (
            <BadgeCheck className="size-4 text-teal-700" aria-hidden />
          ) : (
            <CircleAlert className="size-4" aria-hidden />
          )}
          {consistent
            ? 'Verified: stored balances match a fresh recount of every expense and payment, and add up to zero.'
            : 'Stored balances differ from the ledger. Please report this.'}
        </p>
      </section>

      <section aria-labelledby="payments-heading">
        <h3 id="payments-heading" className="mb-2 font-semibold text-slate-900">
          Recorded payments
        </h3>
        {settlements.data?.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {settlements.data.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <HandCoins className="size-4 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{name(s.from)}</span> paid{' '}
                  <span className="font-medium">{name(s.to)}</span>
                  <span className="block text-xs text-slate-500">
                    {formatDate(s.createdAt)} · {s.method.toUpperCase()}
                  </span>
                </span>
                <span className="tabular font-medium">{formatMoney(s.amount, group.currency)}</span>
                <Button variant="ghost" size="sm" onClick={() => setUndoId(s.id)}>
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No payments recorded yet.</p>
        )}
      </section>

      <ConfirmDialog
        open={undoId !== null}
        onOpenChange={(open) => !open && setUndoId(null)}
        title="Undo this payment?"
        message="Both people's balances go back to what they were before it was recorded."
        confirmLabel="Undo payment"
        loading={undo.isPending}
        onConfirm={() =>
          undoId &&
          undo.mutate(undoId, {
            onSuccess: () => {
              toast.success('Payment undone');
              setUndoId(null);
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </div>
  );
}
