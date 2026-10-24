import type { Category } from '@domain';
import { BarChart3 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { errorMessage } from '../api/client';
import { useStats } from '../api/queries';
import type { Group, Stats } from '../api/types';
import { useCurrentUser } from '../auth';
import { CATEGORY_LABELS } from '../lib/categories';
import { axisTick, chartTheme } from '../lib/chartTheme';
import { cn } from '../lib/cn';
import { compactMoney, formatMoney, formatMonth, formatShortMonth } from '../lib/format';
import { EmptyState, Spinner } from './ui/Misc';
import { Segmented } from './ui/Segmented';

const PERIODS = [
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
] as const;

/** A chart with its accessible twin: every chart can be switched to a plain table. */
function ChartCard({
  title,
  description,
  legend,
  table,
  children,
}: {
  title: string;
  description?: string;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <figcaption className="font-semibold text-slate-900">{title}</figcaption>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      {legend && !asTable && <div className="mt-3">{legend}</div>}
      <div className="mt-4">{asTable ? table : children}</div>
    </figure>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-slate-500">
          {head.map((h, i) => (
            <th key={h} className={cn('py-2 font-medium', i > 0 && 'text-right')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular">
        {rows.map((row) => (
          <tr key={String(row[0])} className="border-b border-slate-100 last:border-0">
            {row.map((cell, i) => (
              <td key={i} className={cn('py-2', i > 0 && 'text-right')}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tooltip body: the value leads, the label follows; series keyed by a short line. */
function TooltipBox({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 text-xs text-slate-500">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 whitespace-nowrap">
          {r.color && (
            <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} aria-hidden />
          )}
          <span className="tabular font-semibold text-slate-900">{r.value}</span>
          <span className="text-slate-500">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function MonthlyChart({ stats }: { stats: Stats }) {
  const money = (v: number) => formatMoney(v, stats.currency);
  const rows = stats.byMonth.map((m) => ({ ...m, label: formatShortMonth(m.month) }));
  type Row = (typeof rows)[number];
  return (
    <ChartCard
      title="Spending per month"
      description="Everything the group spent, by the date of each expense"
      table={
        <DataTable
          head={['Month', 'Spent']}
          rows={rows.map((r) => [formatMonth(r.month), money(r.total)])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={chartTheme.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: chartTheme.axis }}
            tick={axisTick}
          />
          <YAxis
            tickFormatter={(v: number) => compactMoney(v, stats.currency)}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            width={56}
          />
          <Tooltip
            cursor={{ fill: chartTheme.cursor }}
            content={(props: TooltipContentProps) => {
              const row = props.payload?.[0]?.payload as Row | undefined;
              if (!props.active || !row) return null;
              const top = Object.entries(row.categories)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([c, v]) => ({ label: CATEGORY_LABELS[c as Category], value: money(v) }));
              return (
                <TooltipBox
                  title={formatMonth(row.month)}
                  rows={[
                    { label: 'total', value: money(row.total), color: chartTheme.series1 },
                    ...top,
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="total"
            fill={chartTheme.series1}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            activeBar={{ fillOpacity: 0.8 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function CategoryChart({ stats }: { stats: Stats }) {
  const money = (v: number) => formatMoney(v, stats.currency);
  const rows = stats.byCategory.map((c) => ({ ...c, label: CATEGORY_LABELS[c.category] }));
  return (
    <ChartCard
      title="Where the money went"
      description="Spending by category"
      table={
        <DataTable head={['Category', 'Spent']} rows={rows.map((r) => [r.label, money(r.total)])} />
      }
    >
      <ResponsiveContainer width="100%" height={rows.length * 36 + 8}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 0, right: 88, bottom: 0, left: 0 }}
          barCategoryGap={10}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={118}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
          />
          <Tooltip
            cursor={{ fill: chartTheme.cursor }}
            content={(props: TooltipContentProps) => {
              const row = props.payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!props.active || !row) return null;
              const share = stats.total ? Math.round((row.total / stats.total) * 100) : 0;
              return (
                <TooltipBox
                  title={row.label}
                  rows={[
                    {
                      label: `${share}% of spending`,
                      value: money(row.total),
                      color: chartTheme.series1,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="total"
            fill={chartTheme.series1}
            radius={[0, 4, 4, 0]}
            maxBarSize={20}
            activeBar={{ fillOpacity: 0.8 }}
          >
            <LabelList
              dataKey="total"
              position="right"
              formatter={(v) => money(Number(v))}
              fill={chartTheme.inkSecondary}
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function MemberChart({ stats, group }: { stats: Stats; group: Group }) {
  const me = useCurrentUser();
  const money = (v: number) => formatMoney(v, stats.currency);
  const rows = stats.byMember
    .map((m) => {
      const member = group.members.find((x) => x.id === m.user);
      return {
        ...m,
        name: m.user === me.id ? 'You' : (member?.name.split(' ')[0] ?? 'Former member'),
      };
    })
    .sort((a, b) => b.paid - a.paid);
  const legend = (
    <ul className="flex gap-4 text-xs text-slate-600">
      <li className="flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-sm"
          style={{ background: chartTheme.series1 }}
          aria-hidden
        />{' '}
        Paid
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-sm"
          style={{ background: chartTheme.series2 }}
          aria-hidden
        />{' '}
        Their share
      </li>
    </ul>
  );
  return (
    <ChartCard
      title="Paid vs. share"
      description="Who fronted the money and who used it"
      legend={legend}
      table={
        <DataTable
          head={['Member', 'Paid', 'Share', 'Difference']}
          rows={rows.map((r) => [r.name, money(r.paid), money(r.share), money(r.paid - r.share)])}
        />
      }
    >
      <ResponsiveContainer width="100%" height={rows.length * 44 + 28}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
          barGap={2}
          barCategoryGap={12}
        >
          <CartesianGrid horizontal={false} stroke={chartTheme.grid} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => compactMoney(v, stats.currency)}
            tickLine={false}
            axisLine={{ stroke: chartTheme.axis }}
            tick={axisTick}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={84}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
          />
          <Tooltip
            cursor={{ fill: chartTheme.cursor }}
            content={(props: TooltipContentProps) => {
              const row = props.payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!props.active || !row) return null;
              return (
                <TooltipBox
                  title={row.name}
                  rows={[
                    { label: 'paid', value: money(row.paid), color: chartTheme.series1 },
                    { label: 'share', value: money(row.share), color: chartTheme.series2 },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="paid"
            name="Paid"
            fill={chartTheme.series1}
            radius={[0, 4, 4, 0]}
            maxBarSize={12}
            activeBar={{ fillOpacity: 0.8 }}
          />
          <Bar
            dataKey="share"
            name="Their share"
            fill={chartTheme.series2}
            radius={[0, 4, 4, 0]}
            maxBarSize={12}
            activeBar={{ fillOpacity: 0.8 }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function InsightsPanel({ group }: { group: Group }) {
  const me = useCurrentUser();
  const [months, setMonths] = useState<(typeof PERIODS)[number]['value']>('6');
  const stats = useStats(group.id, Number(months));
  const data = stats.data;
  const money = (v: number) => formatMoney(v, group.currency);
  const myShare = data?.byMember.find((m) => m.user === me.id)?.share ?? 0;
  const top = data?.byCategory[0];

  return (
    <div className="space-y-5 p-5">
      {/* One filter row above everything it scopes. */}
      <Segmented label="Time range" options={[...PERIODS]} value={months} onChange={setMonths} />

      {stats.isPending ? (
        <Spinner />
      ) : stats.error ? (
        <p className="text-sm text-rose-700">{errorMessage(stats.error)}</p>
      ) : !data || data.count === 0 ? (
        <EmptyState icon={BarChart3} title="Nothing to chart yet">
          Charts appear once the group has expenses in this period.
        </EmptyState>
      ) : (
        <div
          className={cn('space-y-5 transition-opacity', stats.isPlaceholderData && 'opacity-60')}
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Group spending"
              value={money(data.total)}
              sub={`${data.count} expenses`}
            />
            <StatTile
              label="Your share"
              value={money(myShare)}
              sub={
                data.total ? `${Math.round((myShare / data.total) * 100)}% of the total` : undefined
              }
            />
            <StatTile
              label="Monthly average"
              value={money(Math.round(data.total / data.months))}
              sub={`over ${data.months} months`}
            />
            <StatTile
              label="Top category"
              value={top ? CATEGORY_LABELS[top.category] : '–'}
              sub={top ? money(top.total) : undefined}
            />
          </div>
          <MonthlyChart stats={data} />
          <div className="grid gap-5 xl:grid-cols-2">
            <CategoryChart stats={data} />
            <MemberChart stats={data} group={group} />
          </div>
        </div>
      )}
    </div>
  );
}
