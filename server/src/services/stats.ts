import type { Types } from 'mongoose';
import { CATEGORIES, type Category } from '../domain';
import { Expense, type GroupDoc } from '../models';
import { isoDay } from './serializers';

interface Facets {
  byMonthCategory: { _id: { month: string; category: Category }; total: number }[];
  shares: { _id: Types.ObjectId; amount: number }[];
  paid: { _id: Types.ObjectId; amount: number }[];
  totals: { total: number; count: number }[];
}

interface MonthBucket {
  month: string;
  total: number;
  categories: Partial<Record<Category, number>>;
}

/** First day (UTC) of the month `monthsBack` months before `now`. */
const monthStart = (now: Date, monthsBack: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));

/**
 * Spending charts for a group: totals per month and category, per category, and what each
 * member paid versus their share. One aggregation with $facet computes every breakdown in a
 * single pass over the group's expenses (served by the group/date index).
 */
export async function groupStats(group: GroupDoc, months: number, now = new Date()) {
  const from = monthStart(now, months - 1);
  const [facets] = await Expense.aggregate<Facets>([
    { $match: { group: group._id, deletedAt: null, date: { $gte: from } } },
    {
      $facet: {
        byMonthCategory: [
          {
            $group: {
              _id: {
                month: { $dateToString: { format: '%Y-%m', date: '$date' } },
                category: '$category',
              },
              total: { $sum: '$amount' },
            },
          },
        ],
        shares: [
          { $unwind: '$shares' },
          { $group: { _id: '$shares.user', amount: { $sum: '$shares.amount' } } },
        ],
        paid: [
          { $unwind: '$payers' },
          { $group: { _id: '$payers.user', amount: { $sum: '$payers.amount' } } },
        ],
        totals: [{ $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }],
      },
    },
  ]);

  // Every month in the window appears, even with no spending, so charts have a steady axis.
  const byMonth: MonthBucket[] = Array.from({ length: months }, (_, i) => ({
    month: monthStart(now, months - 1 - i)
      .toISOString()
      .slice(0, 7),
    total: 0,
    categories: {},
  }));
  const monthIndex = new Map(byMonth.map((m) => [m.month, m]));
  const categoryTotals = new Map<Category, number>();
  for (const row of facets?.byMonthCategory ?? []) {
    const bucket = monthIndex.get(row._id.month);
    if (!bucket) continue;
    bucket.total += row.total;
    bucket.categories[row._id.category] = (bucket.categories[row._id.category] ?? 0) + row.total;
    categoryTotals.set(row._id.category, (categoryTotals.get(row._id.category) ?? 0) + row.total);
  }

  const shareOf = new Map((facets?.shares ?? []).map((r) => [r._id.toString(), r.amount]));
  const paidBy = new Map((facets?.paid ?? []).map((r) => [r._id.toString(), r.amount]));

  return {
    currency: group.currency,
    from: isoDay(from),
    months,
    total: facets?.totals[0]?.total ?? 0,
    count: facets?.totals[0]?.count ?? 0,
    byMonth,
    byCategory: CATEGORIES.filter((c) => categoryTotals.has(c))
      .map((category) => ({ category, total: categoryTotals.get(category) ?? 0 }))
      .sort((a, b) => b.total - a.total),
    byMember: group.members.map((m) => ({
      user: m.user.toString(),
      paid: paidBy.get(m.user.toString()) ?? 0,
      share: shareOf.get(m.user.toString()) ?? 0,
    })),
  };
}
