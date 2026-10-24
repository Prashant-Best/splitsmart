/**
 * Exact minimum number of payments needed to settle a set of balances. Exponential, so it is
 * only used to measure the greedy algorithm in tests and benchmarks, never in requests.
 *
 * If k people can be split into g disjoint groups whose balances each sum to zero, every group
 * settles on its own with (size - 1) payments, for k - g in total; and no plan can do better
 * than that, because the payments of any plan form a graph whose connected components are such
 * groups. So the answer is k - (largest number of disjoint zero-sum groups).
 *
 * best[mask] = the most zero-sum groups that the people in `mask` can be ordered into, computed
 * by removing one person at a time: best[mask] = max(best[mask - i]) + (sum(mask) == 0 ? 1 : 0).
 * Time O(2^k * k), memory O(2^k).
 */
export function minPaymentsExact(balances: readonly number[]): number {
  const values = balances.filter((b) => b !== 0);
  const k = values.length;
  if (k === 0) return 0;
  if (k > 20) throw new RangeError('The exact solver supports at most 20 non-zero balances');
  if (values.reduce((a, b) => a + b, 0) !== 0) throw new RangeError('Balances must sum to zero');

  const size = 1 << k;
  const sums = new Float64Array(size); // integers up to 2^53 are exact in a double
  const best = new Uint8Array(size);
  for (let mask = 1; mask < size; mask++) {
    const lowest = mask & -mask;
    sums[mask] = sums[mask ^ lowest]! + values[31 - Math.clz32(lowest)]!;
    let most = 0;
    for (let rest = mask; rest !== 0; rest &= rest - 1) {
      const bit = rest & -rest;
      most = Math.max(most, best[mask ^ bit]!);
    }
    best[mask] = most + (sums[mask] === 0 ? 1 : 0);
  }
  return k - best[size - 1]!;
}
