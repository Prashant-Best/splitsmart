/**
 * Measures debt simplification (no database needed):
 *  1. pairwise debts vs simplified payments for the demo groups,
 *  2. greedy vs the exact optimum on 10,000 random groups,
 *  3. running time of simplifyDebts as the number of people grows.
 * Writes docs/benchmark.md and prints the same tables.
 *
 *   npm run benchmark
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  computeBalances,
  computeShares,
  minPaymentsExact,
  pairwiseDebts,
  simplifyDebts,
  type LedgerExpense,
  type SplitInput,
  type Transfer,
} from '../src/domain';
import { buildDemoData } from './demo-data';

function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lines: string[] = [];
const out = (line = '') => {
  console.log(line);
  lines.push(line);
};

// 1. Demo groups, measured on their expenses alone (before anyone settles up).
out('## Demo groups (expenses only, before any settlement)\n');
out('| Group | Members | Expenses | Pairwise debts | Simplified payments | Exact minimum |');
out('|---|---|---|---|---|---|');
for (const group of buildDemoData(new Date('2026-10-24T00:00:00Z'))) {
  const ledger: LedgerExpense[] = group.events
    .filter((e) => e.kind === 'expense')
    .map((e) => ({ payers: e.payers, shares: computeShares(e.amount, e.split) }));
  const balances = computeBalances(ledger, []);
  out(
    `| ${group.name} | ${group.members.length} | ${ledger.length} | ${pairwiseDebts(ledger, []).length} | ` +
      `${simplifyDebts(balances).length} | ${minPaymentsExact([...balances.values()])} |`,
  );
}

// 2. Random groups: n people, 3n expenses with random payers and random split types.
// With `clusters` > 1 the people form separate sub-groups that never share an expense (two
// friend circles on one trip). Each sub-group then settles on its own, so the true minimum is
// below n - 1, and a greedy plan that pays across sub-groups can miss it.
const random = prng(2026);
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
function randomGroup(n: number, clusters = 1): LedgerExpense[] {
  const users = Array.from({ length: n }, (_, i) => `u${i}`);
  return Array.from({ length: 3 * n }, () => {
    const amount = 100 * Math.floor(100 + random() * 9_900);
    const cluster = Math.floor(random() * clusters);
    const circle = users.filter((_, i) => i % clusters === cluster);
    const people = circle.filter(() => random() < 0.6);
    if (people.length === 0) people.push(pick(circle));
    const type = pick(['equal', 'shares', 'percentage'] as const);
    const split: SplitInput =
      type === 'equal'
        ? { type, participants: people }
        : type === 'shares'
          ? { type, shares: people.map((user) => ({ user, weight: 1 + Math.floor(random() * 3) })) }
          : {
              type,
              percents: people.map((user, i) => ({
                user,
                weight:
                  i < people.length - 1
                    ? Math.floor(10_000 / people.length)
                    : 10_000 - Math.floor(10_000 / people.length) * (people.length - 1),
              })),
            };
    const circlePayer = pick(circle);
    return { payers: [{ user: circlePayer, amount }], shares: computeShares(amount, split) };
  });
}

function compare(title: string, clusters: number): void {
  out(`\n## ${title} (2,000 groups per size, 3n expenses each)\n`);
  out(
    '| People (n) | Avg pairwise debts | Avg greedy payments | Avg exact minimum | Greedy optimal | Worst gap | Max greedy (bound n-1) |',
  );
  out('|---|---|---|---|---|---|---|');
  let total = 0;
  let optimalCount = 0;
  let pairTotal = 0;
  let greedyTotal = 0;
  for (const n of [4, 6, 8, 10, 12]) {
    let pair = 0;
    let greedy = 0;
    let exact = 0;
    let optimal = 0;
    let worstGap = 0;
    let maxGreedy = 0;
    const runs = 2_000;
    for (let r = 0; r < runs; r++) {
      const ledger = randomGroup(n, clusters);
      const balances = computeBalances(ledger, []);
      const g = simplifyDebts(balances).length;
      const e = minPaymentsExact([...balances.values()]);
      pair += pairwiseDebts(ledger, []).length;
      greedy += g;
      exact += e;
      if (g === e) optimal++;
      worstGap = Math.max(worstGap, g - e);
      maxGreedy = Math.max(maxGreedy, g);
    }
    total += runs;
    optimalCount += optimal;
    pairTotal += pair;
    greedyTotal += greedy;
    out(
      `| ${n} | ${(pair / runs).toFixed(1)} | ${(greedy / runs).toFixed(2)} | ${(exact / runs).toFixed(2)} | ` +
        `${((100 * optimal) / runs).toFixed(2)}% | ${worstGap} | ${maxGreedy} (${n - 1}) |`,
    );
  }
  out(
    `\nGreedy matched the exact optimum in ${optimalCount.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} groups ` +
      `(${((100 * optimalCount) / total).toFixed(2)}%) and cut the number of payments by ` +
      `${(100 * (1 - greedyTotal / pairTotal)).toFixed(0)}% compared with paying every pairwise debt.`,
  );
}

compare('Random groups: everyone shares expenses', 1);
compare('Random groups: two separate friend circles', 2);

// 3. Speed: random zero-sum balances for n people; median of 5 runs.
out('\n## Speed of simplifyDebts (median of 5 runs)\n');
out('| People | Payments | Time |');
out('|---|---|---|');
for (const n of [1_000, 10_000, 100_000]) {
  const entries: [string, number][] = Array.from({ length: n }, (_, i) => [
    `u${i}`,
    Math.floor((random() - 0.5) * 2_000_000),
  ]);
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  entries[0]![1] -= sum;
  const times: number[] = [];
  let payments: Transfer[] = [];
  for (let r = 0; r < 5; r++) {
    const start = performance.now();
    payments = simplifyDebts(entries);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  out(
    `| ${n.toLocaleString('en-IN')} | ${payments.length.toLocaleString('en-IN')} | ${times[2]!.toFixed(1)} ms |`,
  );
}
out(
  `\n_Node ${process.version}, ${process.platform}. Random data from a fixed seed, so runs are repeatable._`,
);

void writeFile(
  path.resolve(__dirname, '..', '..', 'docs', 'benchmark.md'),
  `# Debt simplification benchmark\n\nGenerated by \`npm run benchmark\` in \`server/\`.\n\n${lines.join('\n')}\n`,
);
