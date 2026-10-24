import { formatMoney } from '@domain';

export { formatMoney, parseDecimal2, toDecimalString } from '@domain';

/** The currency symbol on its own, e.g. "₹". */
export function currencySymbol(currency: string): string {
  return formatMoney(0, currency).replace(/[\d.,\s-]/g, '');
}

const compactFormatters = new Map<string, Intl.NumberFormat>();

/** Short axis labels in Indian notation: 950 -> ₹950, 12000 -> ₹12K, 150000 -> ₹1.5L. */
export function compactMoney(minor: number, currency = 'INR'): string {
  let formatter = compactFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    compactFormatters.set(currency, formatter);
  }
  return formatter.format(Math.round(minor / 100));
}

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const fullDayFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortMonthFormat = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });

// Expense dates are calendar days ("2026-10-03"); formatting them in UTC keeps the same day
// for every viewer, whatever their time zone.
const asUtc = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`);

const localDateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** A timestamp (createdAt) as a date in the viewer's own time zone. */
export const formatDate = (timestamp: string) => localDateFormat.format(new Date(timestamp));
export const formatDay = (day: string) => dayFormat.format(asUtc(day));
export const formatFullDay = (day: string) => fullDayFormat.format(asUtc(day));
export const formatMonth = (month: string) => monthFormat.format(asUtc(`${month}-01`));
export const formatShortMonth = (month: string) => shortMonthFormat.format(asUtc(`${month}-01`));

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 days ago", "yesterday", "just now". */
export function timeAgo(timestamp: string, now = Date.now()): string {
  const seconds = Math.round((new Date(timestamp).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

/** Today's date as YYYY-MM-DD in the user's own time zone. */
export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
