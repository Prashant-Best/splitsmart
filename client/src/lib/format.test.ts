import { describe, expect, it } from 'vitest';
import { safeNext } from '../auth';
import {
  compactMoney,
  currencySymbol,
  formatDay,
  formatMoney,
  formatMonth,
  timeAgo,
} from './format';

describe('formatting', () => {
  it('formats paise in Indian style without rounding errors', () => {
    expect(formatMoney(12_345_650, 'INR')).toBe('₹1,23,456.50');
    expect(formatMoney(29, 'INR')).toBe('₹0.29');
  });

  it('compacts axis labels in lakhs', () => {
    expect(compactMoney(95_000)).toBe('₹950');
    expect(compactMoney(1_200_000)).toBe('₹12K');
    expect(compactMoney(15_000_000)).toBe('₹1.5L');
  });

  it('finds the currency symbol', () => {
    expect(currencySymbol('INR')).toBe('₹');
    expect(currencySymbol('USD')).toBe('$');
  });

  it('shows calendar days the same in every time zone', () => {
    expect(formatDay('2026-10-03')).toBe('3 Oct');
    expect(formatMonth('2026-10')).toBe('October 2026');
  });

  it('describes how long ago something happened', () => {
    const now = Date.parse('2026-10-24T12:00:00Z');
    expect(timeAgo('2026-10-24T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-24T09:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-10-23T12:00:00Z', now)).toBe('yesterday');
  });
});

describe('safeNext', () => {
  it.each([
    ['/groups/abc', '/groups/abc'],
    ['/join/xyz?x=1', '/join/xyz?x=1'],
    ['//evil.example', '/'],
    ['https://evil.example', '/'],
    [null, '/'],
  ])('%s -> %s', (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });
});
