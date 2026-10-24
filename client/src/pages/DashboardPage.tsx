import { ArrowDownLeft, ArrowUpRight, Plus, Scale, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useActivity, useGroups } from '../api/queries';
import type { GroupSummary } from '../api/types';
import { useCurrentUser } from '../auth';
import { ActivityList } from '../components/ActivityFeed';
import { CreateGroupDialog } from '../components/CreateGroupDialog';
import { AvatarStack } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, EmptyState, Money, Spinner } from '../components/ui/Misc';
import { balanceTone } from '../components/ui/styles';
import { cn } from '../lib/cn';
import { formatMoney, timeAgo } from '../lib/format';

function StatTile({
  label,
  value,
  currency,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  icon: typeof Scale;
  tone: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className={cn('size-5', tone)} aria-hidden />
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tracking-tight', tone)}>
        {formatMoney(value, currency)}
      </p>
    </Card>
  );
}

function GroupCard({ group }: { group: GroupSummary }) {
  const b = group.myBalance;
  return (
    <Link
      to={`/groups/${group.id}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-teal-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900 group-hover:text-teal-800">
            {group.name}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {group.members.length} members · active {timeAgo(group.updatedAt)}
          </p>
        </div>
        <AvatarStack people={group.members} max={4} size="xs" />
      </div>
      <p className={cn('mt-4 text-sm font-medium', balanceTone(b))}>
        {b > 0 && (
          <>
            You get back <Money value={b} currency={group.currency} />
          </>
        )}
        {b < 0 && (
          <>
            You owe <Money value={-b} currency={group.currency} />
          </>
        )}
        {b === 0 && 'You are settled up'}
      </p>
    </Link>
  );
}

export function DashboardPage() {
  const user = useCurrentUser();
  const groups = useGroups();
  const activity = useActivity();
  const [creating, setCreating] = useState(false);

  // Totals in the currency most of your groups use.
  const list = groups.data ?? [];
  const currency = list[0]?.currency ?? 'INR';
  const same = list.filter((g) => g.currency === currency);
  const owed = same.reduce((sum, g) => sum + Math.max(g.myBalance, 0), 0);
  const owe = same.reduce((sum, g) => sum + Math.max(-g.myBalance, 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hi, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-slate-500">Here is where you stand across your groups.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden /> New group
        </Button>
      </div>

      {groups.isPending ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="You get back"
              value={owed}
              currency={currency}
              icon={ArrowDownLeft}
              tone="text-teal-700"
            />
            <StatTile
              label="You owe"
              value={owe}
              currency={currency}
              icon={ArrowUpRight}
              tone="text-rose-700"
            />
            <StatTile
              label="Net balance"
              value={owed - owe}
              currency={currency}
              icon={Scale}
              tone={owed === owe ? 'text-slate-900' : balanceTone(owed - owe)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2" aria-labelledby="groups-heading">
              <h2 id="groups-heading" className="mb-3 text-base font-semibold">
                Your groups
              </h2>
              {list.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Users}
                    title="No groups yet"
                    action={
                      <Button onClick={() => setCreating(true)}>Create your first group</Button>
                    }
                  >
                    Create a group for a trip, your flat or office lunches, then share the invite
                    link.
                  </EmptyState>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {list.map((g) => (
                    <GroupCard key={g.id} group={g} />
                  ))}
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="flex min-h-28 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-medium text-slate-500 transition hover:border-teal-400 hover:text-teal-700"
                  >
                    <Plus className="size-4" aria-hidden /> New group
                  </button>
                </div>
              )}
            </section>

            <Card className="h-fit">
              <CardHeader title="Recent activity" description="Across all your groups" />
              <div className="px-3 pt-2 pb-3">
                {activity.isPending ? (
                  <Spinner />
                ) : (
                  <ActivityList
                    items={activity.data?.pages.flatMap((p) => p.items).slice(0, 30) ?? []}
                    showGroup
                    hasMore={activity.hasNextPage}
                    loadingMore={activity.isFetchingNextPage}
                    onLoadMore={() => void activity.fetchNextPage()}
                  />
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      <CreateGroupDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
