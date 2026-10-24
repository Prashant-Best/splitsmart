import fc from 'fast-check';
import { formatMoney, parseDecimal2, toDecimalString } from '../../src/domain';
import { RUNS } from '../helpers/arbitraries';

describe('parseDecimal2', () => {
  it.each([
    ['100', 10_000],
    ['4.35', 435],
    ['0.29', 29],
    ['12.5', 1_250],
    ['12.', 1_200],
    ['1,23,456.50', 12_345_650],
    ['₹ 99.99', 9_999],
    ['  7 ', 700],
    ['33.33', 3_333],
  ])('parses %p as %p hundredths', (text, expected) => {
    expect(parseDecimal2(text)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '-5', '1e3', '.5', '12.3.4', '1_000'])('rejects %p', (text) => {
    expect(parseDecimal2(text)).toBeNull();
  });

  it('avoids the float error that multiplying by 100 has', () => {
    expect(4.35 * 100).not.toBe(435); // 434.99999999999994
    expect(parseDecimal2('4.35')).toBe(435);
  });

  it('round-trips with toDecimalString for any amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999_999_999_999 }), (paise) => {
        expect(parseDecimal2(toDecimalString(paise))).toBe(paise);
      }),
      { numRuns: RUNS },
    );
  });
});

describe('toDecimalString', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [12_345, '123.45'],
    [-250, '-2.50'],
  ])('formats %p as %p', (paise, expected) => {
    expect(toDecimalString(paise)).toBe(expected);
  });
});

describe('formatMoney', () => {
  it('uses Indian digit grouping for rupees', () => {
    expect(formatMoney(12_345_650)).toBe('₹1,23,456.50');
    expect(formatMoney(0)).toBe('₹0.00');
    expect(formatMoney(-5_000)).toBe('-₹50.00');
  });

  it('formats other currencies', () => {
    expect(formatMoney(123_456, 'USD')).toBe('$1,234.56');
    expect(formatMoney(99, 'EUR')).toBe('€0.99');
  });

  it('never loses a paisa, even for amounts with no exact float representation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99_999_999_999 }), (paise) => {
        const digits = formatMoney(paise).replace(/[^\d]/g, '');
        expect(Number(digits)).toBe(paise);
      }),
      { numRuns: RUNS },
    );
  });
});
