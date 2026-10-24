import { ArrowLeft, ArrowRight, Plus, UserPlus } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ApiError, errorMessage } from '../api/client';
import { useBalances, useGroup, useGroupActivity } from '../api/queries';
import type { Expense, Group, Transfer } from '../api/types';
import { useCurrentUser } from '../auth';
import { ActivityList } from '../components/ActivityFeed';
import { BalancesPanel } from '../components/BalancesPanel';
import { ExpenseDetailDialog } from '../components/ExpenseDetailDialog';
import { ExpenseFormDialog } from '../components/ExpenseFormDialog';
import { ExpenseList } from '../components/ExpenseList';
import { InviteDialog } from '../components/InviteDialog';
import { SettleUpDialog } from '../components/SettleUpDialog';
import { Avatar, AvatarStack } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, EmptyState, Money, Spinner } from '../components/ui/Misc';
import { Segmented } from '../components/ui/Segmented';
import { balanceTone } from '../components/ui/styles';
import { cn } from '../lib/cn';

// The charting library is the largest dependency, so it loads only when Insights is opened.
const InsightsPanel = lazy(() =>
  import('../components/InsightsPanel').then((m) => ({ default: m.InsightsPanel })),
);

const TABS = [
  { value: 'expenses', label: 'Expenses' },
  { value: 'balances', label: 'Balances' },
  { value: 'activity', label: 'Activity' },
  { value: 'insights', label: 'Insights' },
] as const;
type Tab = (typeof TABS)[number]['value'];

function GroupActivity({ groupId }: { groupId: string }) {
  const activity = useGroupActivity(groupId);
  if (activity.isPending) return <Spinner />;
  return (
    <div className="p-3">
      <ActivityList
        items={activity.data?.pages.flatMap((p) => p.items) ?? []}
        hasMore={activity.hasNextPage}
        loadingMore={activity.isFetchingNextPage}
        onLoadMore={() => void activity.fetchNextPage()}
      />
    </div>
  );
}

/** The signed-in user's position and their part of the settle-up plan. */
function YourBalance({ group, onPay }: { group: Group; onPay: (t: Transfer) => void }) {
  const me = useCurrentUser();
  const balances = useBalances(group.id);
  const mine = group.members.find((m) => m.id === me.id)?.balance ?? 0;
  const name = (id: string) => group.members.find((m) => m.id === id)?.name ?? 'Former member';
  const plan = (balances.data?.simplified ?? []).filter((t) => t.from === me.id || t.to === me.id);

  return (
    <Card>
      <CardHeader title="Your balance" />
      <div className="px-5 pt-2 pb-5">
        <p className={cn('text-3xl font-semibold tracking-tight', balanceTone(mine))}>
          {mine === 0 ? 'Settled up' : <Money value={Math.abs(mine)} currency={group.currency} />}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {mine > 0
            ? 'You get this back in total'
            : mine < 0
              ? 'You owe this in total'
              : 'You owe nothing and are owed nothing'}
        </p>
        {plan.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
            {plan.map((t) =>
              t.from === me.id ? (
                <li key={`${t.from}-${t.to}`} className="flex items-center gap-3 text-sm">
                  <Avatar id={t.to} name={name(t.to)} size="sm" />
                  <span className="min-w-0 flex-1">
                    Pay <span className="font-medium">{name(t.to)}</span>
                    <span className="tabular block font-semibold text-rose-700">
                      <Money value={t.amount} currency={group.currency} />
                    </span>
                  </span>
                  <Button size="sm" onClick={() => onPay(t)}>
                    Pay <ArrowRight className="size-3.5" aria-hidden />
                  </Button>
                </li>
              ) : (
                <li key={`${t.from}-${t.to}`} className="flex items-center gap-3 text-sm">
                  <Avatar id={t.from} name={name(t.from)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{name(t.from)}</span> pays you
                    <span className="tabular block font-semibold text-teal-700">
                      <Money value={t.amount} currency={group.currency} />
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Members({ group }: { group: Group }) {
  const me = useCurrentUser();
  return (
    <Card>
      <CardHeader title="Members" description={`${group.members.length} people`} />
      <ul className="space-y-3 px-5 pt-3 pb-5">
        {group.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 text-sm">
            <Avatar id={m.id} name={m.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {m.name}
                {m.id === me.id && <span className="font-normal text-slate-500"> (you)</span>}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {m.role === 'owner' ? 'Owner · ' : ''}
                {m.upiId ? `UPI ${m.upiId}` : 'No UPI ID yet'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function GroupPage() {
  const { groupId = '' } = useParams();
  const me = useCurrentUser();
  const group = useGroup(groupId);
  const balances = useBalances(groupId);
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.value === params.get('tab'))?.value ?? 'expenses';
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [settle, setSettle] = useState<{ open: boolean; initial?: Transfer }>({ open: false });

  if (group.isPending) return <Spinner />;
  if (group.error || !group.data) {
    const missing = group.error instanceof ApiError && group.error.status === 404;
    return (
      <Card>
        <EmptyState
          icon={UserPlus}
          title={missing ? 'Group not found' : 'Could not load this group'}
          action={
            <Link to="/" className="text-sm font-medium text-teal-700 hover:underline">
              Back to your groups
            </Link>
          }
        >
          {missing
            ? 'It does not exist, or you are not a member. Ask a member for the invite link.'
            : errorMessage(group.error)}
        </EmptyState>
      </Card>
    );
  }

  const g = group.data;
  const myPayment = balances.data?.simplified.find((t) => t.from === me.id);
  const openSettle = (initial?: Transfer) =>
    setSettle({ open: true, initial: initial ?? myPayment });
  const setTab = (value: Tab) =>
    setParams((p) => {
      p.set('tab', value);
      return p;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" aria-hidden /> All groups
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{g.name}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-slate-500">
            <AvatarStack people={g.members} max={6} />
            <span>
              {g.members.length} members · {g.currency}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" aria-hidden /> Invite
          </Button>
          <Button variant="secondary" onClick={() => openSettle()}>
            Settle up
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add expense
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <div className="border-b border-slate-100 p-3">
            <Segmented
              role="tab"
              label="Group sections"
              idPrefix="tab"
              options={[...TABS]}
              value={tab}
              onChange={setTab}
              className="flex w-full sm:inline-flex sm:w-auto"
            />
          </div>
          <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
            {tab === 'expenses' && (
              <ExpenseList group={g} onOpen={setViewing} onAdd={() => setAdding(true)} />
            )}
            {tab === 'balances' && <BalancesPanel group={g} onPay={openSettle} />}
            {tab === 'activity' && <GroupActivity groupId={g.id} />}
            {tab === 'insights' && (
              <Suspense fallback={<Spinner />}>
                <InsightsPanel group={g} />
              </Suspense>
            )}
          </div>
        </Card>
        <div className="space-y-6">
          <YourBalance group={g} onPay={openSettle} />
          <Members group={g} />
        </div>
      </div>

      <ExpenseFormDialog open={adding} onOpenChange={setAdding} group={g} />
      {editing && (
        <ExpenseFormDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          group={g}
          expense={editing}
        />
      )}
      <ExpenseDetailDialog
        group={g}
        expenseId={viewing}
        onClose={() => setViewing(null)}
        onEdit={(expense) => {
          setViewing(null);
          setEditing(expense);
        }}
      />
      <SettleUpDialog
        open={settle.open}
        onOpenChange={(open) => setSettle((s) => ({ ...s, open }))}
        group={g}
        initial={settle.initial}
      />
      <InviteDialog open={inviting} onOpenChange={setInviting} group={g} />
    </div>
  );
}
