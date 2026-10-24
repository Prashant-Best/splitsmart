import {
  HandCoins,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Activity, ActivityType } from '../api/types';
import { useCurrentUser } from '../auth';
import { formatMoney, timeAgo } from '../lib/format';
import { Button } from './ui/Button';

const ICONS: Record<ActivityType, LucideIcon> = {
  'group.created': Users,
  'group.renamed': Pencil,
  'invite.reset': Link2,
  'member.joined': UserPlus,
  'expense.created': Plus,
  'expense.updated': Pencil,
  'expense.deleted': Trash2,
  'receipt.added': Paperclip,
  'receipt.removed': Paperclip,
  'settlement.created': HandCoins,
  'settlement.deleted': Undo2,
};

const FIELD_NAMES: Record<string, string> = {
  description: 'description',
  amount: 'amount',
  category: 'category',
  date: 'date',
  notes: 'notes',
  payers: 'who paid',
  split: 'split',
};

const METHOD_TEXT: Record<string, string> = {
  upi: ' via UPI',
  cash: ' in cash',
  bank: ' by bank transfer',
  other: '',
};

const B = ({ children }: { children: ReactNode }) => (
  <span className="font-medium text-slate-900">{children}</span>
);

/** One feed entry as a sentence, naming the viewer "You". */
function describe(a: Activity, me: string): ReactNode {
  const person = (id: string | undefined, name: string | undefined, start = false) =>
    id === me ? (start ? 'You' : 'you') : (name ?? 'Someone');
  const actor = <B>{person(a.actor, a.actorName, true)}</B>;
  const what = <B>“{a.data.description}”</B>;
  const money = a.data.amount !== undefined ? formatMoney(a.data.amount, a.currency) : '';
  const from = <B>{person(a.data.from, a.data.fromName, true)}</B>;
  const to = <B>{person(a.data.to, a.data.toName)}</B>;
  switch (a.type) {
    case 'group.created':
      return <>{actor} created the group</>;
    case 'group.renamed':
      return (
        <>
          {actor} renamed the group to <B>{a.data.name}</B>
        </>
      );
    case 'invite.reset':
      return <>{actor} reset the invite link</>;
    case 'member.joined':
      return <>{actor} joined the group</>;
    case 'expense.created':
      return (
        <>
          {actor} added {what} <span className="tabular">· {money}</span>
        </>
      );
    case 'expense.updated': {
      const fields = (a.data.fields ?? []).map((f) => FIELD_NAMES[f] ?? f).join(', ');
      return (
        <>
          {actor} edited {what}
          {fields && <span className="text-slate-500"> ({fields})</span>}
        </>
      );
    }
    case 'expense.deleted':
      return (
        <>
          {actor} deleted {what}
        </>
      );
    case 'receipt.added':
      return (
        <>
          {actor} attached a receipt to {what}
        </>
      );
    case 'receipt.removed':
      return (
        <>
          {actor} removed the receipt from {what}
        </>
      );
    case 'settlement.created': {
      const payment = (
        <>
          {from} paid {to} <span className="tabular">{money}</span>
          {a.data.method && <span className="text-slate-500">{METHOD_TEXT[a.data.method]}</span>}
        </>
      );
      return a.actor === a.data.from ? (
        payment
      ) : (
        <>
          {actor} recorded that {payment}
        </>
      );
    }
    case 'settlement.deleted':
      return (
        <>
          {actor} undid a payment of <span className="tabular">{money}</span> from{' '}
          <B>{person(a.data.from, a.data.fromName)}</B> to {to}
        </>
      );
  }
}

export function ActivityList({
  items,
  showGroup = false,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  items: Activity[];
  showGroup?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const me = useCurrentUser();
  return (
    <div>
      <ol className="space-y-1">
        {items.map((a) => {
          const Icon = ICONS[a.type];
          return (
            <li key={a.id} className="flex gap-3 rounded-xl px-2 py-2.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 text-sm leading-snug text-slate-600">
                <p>{describe(a, me.id)}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {showGroup && (
                    <>
                      <Link
                        to={`/groups/${a.groupId}`}
                        className="font-medium text-slate-500 hover:text-teal-700"
                      >
                        {a.groupName}
                      </Link>{' '}
                      ·{' '}
                    </>
                  )}
                  <time
                    dateTime={a.createdAt}
                    title={new Date(a.createdAt).toLocaleString('en-IN')}
                  >
                    {timeAgo(a.createdAt)}
                  </time>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {hasMore && onLoadMore && (
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" size="sm" onClick={onLoadMore} loading={loadingMore}>
            Show older activity
          </Button>
        </div>
      )}
    </div>
  );
}
