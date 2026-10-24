/**
 * Money helpers.
 *
 * Every amount in SplitSmart is an integer number of minor units: paise for INR (100 paise =
 * ₹1), cents for USD/EUR/GBP. Floating-point rupees are never stored or added up, so errors
 * like 0.1 + 0.2 = 0.30000000000000004 can never reach a balance.
 *
 * This module is pure (no Node or browser APIs): the React client imports the same file.
 */

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Largest amount accepted for one expense: ₹10 crore = 10^10 paise, far below 2^53. */
export const MAX_AMOUNT = 10_000_000_000;

const DECIMAL_2 = /^(\d{1,12})(?:\.(\d{0,2}))?$/;

/**
 * Parses a decimal string with at most two decimals ("1,234.5", "₹99", "33.33") into integer
 * hundredths, without going through a float: "4.35" becomes 435, whereas 4.35 * 100 is
 * 434.99999999999994. Returns null for anything that is not a plain non-negative number.
 * Used for amounts (paise) and for percentages (basis points, 100% = 10000).
 */
export function parseDecimal2(text: string): number | null {
  const cleaned = text.replace(/[\s,₹$€£]/g, '');
  const match = DECIMAL_2.exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const value = whole * 100 + fraction;
  return Number.isSafeInteger(value) ? value : null;
}

/** Inverse of parseDecimal2: 12345 -> "123.45". Used for UPI links and form fields. */
export function toDecimalString(minor: number): string {
  const abs = Math.abs(minor);
  const fraction = abs % 100;
  const whole = (abs - fraction) / 100;
  return `${minor < 0 ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, formatter);
  }
  return formatter;
}

/**
 * Formats minor units for display with Indian digit grouping: 12345650 -> "₹1,23,456.50".
 * Intl formats the whole-rupee part (an exact integer) and the paise digits are spliced in, so
 * no division result is ever rounded.
 */
export function formatMoney(minor: number, currency: string = 'INR'): string {
  const abs = Math.abs(minor);
  const fraction = abs % 100;
  const whole = (abs - fraction) / 100;
  const text = formatterFor(currency)
    .formatToParts(whole)
    .map((part) => (part.type === 'fraction' ? String(fraction).padStart(2, '0') : part.value))
    .join('');
  return minor < 0 ? `-${text}` : text;
}

/** Sum of the `amount` fields of a list. */
export function sumAmounts(items: readonly { amount: number }[]): number {
  let total = 0;
  for (const item of items) total += item.amount;
  return total;
}
