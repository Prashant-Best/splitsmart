/**
 * Deterministic demo data: three groups with realistic expenses over the last six months.
 * Pure (no database), so the seed script writes it through the real services and the benchmark
 * can measure debt simplification on exactly the same data.
 */
import {
  computeBalances,
  computeShares,
  simplifyDebts,
  type Allocation,
  type Category,
  type LedgerExpense,
  type SplitInput,
  type Transfer,
} from '../src/domain';

export const DEMO_PASSWORD = 'splitsmart-demo';

// UPI IDs use the made-up handle "@demo", so a scanned QR code can never pay a real person.
export const DEMO_USERS = [
  { key: 'prashant', name: 'Prashant Panwar', upiId: 'prashant@demo' },
  { key: 'aarav', name: 'Aarav Mehta', upiId: 'aarav@demo' },
  { key: 'diya', name: 'Diya Sharma', upiId: 'diya@demo' },
  { key: 'kabir', name: 'Kabir Malhotra', upiId: 'kabir@demo' },
  { key: 'meera', name: 'Meera Iyer', upiId: 'meera@demo' },
  { key: 'rohan', name: 'Rohan Das', upiId: null },
  { key: 'sneha', name: 'Sneha Kapoor', upiId: 'sneha@demo' },
  { key: 'ishaan', name: 'Ishaan Verma', upiId: 'ishaan@demo' },
] as const;

export type UserKey = (typeof DEMO_USERS)[number]['key'];
export const demoEmail = (key: UserKey) => `${key}@example.com`;

export interface DemoExpense {
  kind: 'expense';
  description: string;
  category: Category;
  amount: number;
  date: string;
  payers: Allocation[];
  split: SplitInput;
  notes?: string;
  /** Attach the sample receipt image. */
  receipt?: boolean;
  /** Created with this amount first and then corrected, to show edit history (equal splits only). */
  firstAmount?: number;
}

export interface DemoSettlement {
  kind: 'settlement';
  from: UserKey;
  to: UserKey;
  amount: number;
  method: 'upi' | 'cash';
  date: string;
}

export type DemoEvent = DemoExpense | DemoSettlement;

export interface DemoGroup {
  name: string;
  owner: UserKey;
  members: UserKey[];
  events: DemoEvent[];
}

const rupees = (value: number) => Math.round(value * 100);

/** Small deterministic PRNG (mulberry32), so the demo data is identical on every run. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

function expense(
  date: string,
  description: string,
  category: Category,
  amount: number,
  payers: [UserKey, number][],
  split: SplitInput,
  extra: Partial<DemoExpense> = {},
): DemoExpense {
  return {
    kind: 'expense',
    description,
    category,
    amount,
    date,
    payers: payers.map(([user, paid]) => ({ user, amount: paid })),
    split,
    ...extra,
  };
}

const equal = (...participants: UserKey[]): SplitInput => ({ type: 'equal', participants });

/** Settles a group completely with the simplified plan (what members do at month end). */
function settleAll(
  events: DemoEvent[],
  date: string,
  method: 'upi' | 'cash' = 'upi',
): DemoSettlement[] {
  const ledger: LedgerExpense[] = [];
  const transfers: Transfer[] = [];
  for (const e of events) {
    if (e.kind === 'expense')
      ledger.push({ payers: e.payers, shares: computeShares(e.amount, e.split) });
    else transfers.push(e);
  }
  return simplifyDebts(computeBalances(ledger, transfers)).map((t) => ({
    kind: 'settlement',
    from: t.from as UserKey,
    to: t.to as UserKey,
    amount: t.amount,
    method,
    date,
  }));
}

function goaTrip(today: Date): DemoGroup {
  const members: UserKey[] = ['prashant', 'aarav', 'diya', 'kabir', 'meera', 'rohan'];
  const day = (n: number) => iso(addDays(today, n - 24));
  const all = equal(...members);
  const events: DemoEvent[] = [
    expense(
      day(0),
      'Flights Bengaluru to Goa',
      'travel',
      rupees(32_400),
      [
        ['aarav', rupees(18_000)],
        ['diya', rupees(14_400)],
      ],
      all,
    ),
    expense(
      day(0),
      'Cab to Bengaluru airport',
      'transport',
      rupees(1_150),
      [['rohan', rupees(1_150)]],
      equal('rohan', 'meera', 'kabir'),
    ),
    expense(
      day(0),
      'Villa in Anjuna, 4 nights',
      'stay',
      rupees(48_000),
      [['prashant', rupees(48_000)]],
      {
        type: 'shares',
        // Meera arrived a day late: 3 nights instead of 4.
        shares: members.map((user) => ({ user, weight: user === 'meera' ? 3 : 4 })),
      },
      { notes: 'Split by nights stayed' },
    ),
    expense(
      day(0),
      'Dinner at Sea Breeze Shack',
      'food',
      rupees(7_860),
      [['kabir', rupees(7_860)]],
      all,
      {
        receipt: true,
        firstAmount: rupees(7_680),
      },
    ),
    expense(
      day(1),
      'Scooter rentals (3 scooters)',
      'transport',
      rupees(5_400),
      [['meera', rupees(5_400)]],
      all,
    ),
    expense(day(1), 'Petrol', 'transport', rupees(1_200), [['aarav', rupees(1_200)]], all),
    expense(
      day(1),
      'Breakfast at Cafe Laguna',
      'food',
      rupees(2_340),
      [['diya', rupees(2_340)]],
      all,
    ),
    expense(day(1), 'Beach shack lunch', 'food', rupees(3_150), [['rohan', rupees(3_150)]], all),
    expense(
      day(1),
      'Groceries and water',
      'groceries',
      rupees(1_875),
      [['prashant', rupees(1_875)]],
      all,
    ),
    expense(day(2), 'Parasailing', 'entertainment', rupees(6_000), [['kabir', rupees(6_000)]], {
      type: 'exact',
      amounts: [
        { user: 'kabir', amount: rupees(1_500) },
        { user: 'aarav', amount: rupees(1_500) },
        { user: 'diya', amount: rupees(1_500) },
        { user: 'rohan', amount: rupees(1_500) },
      ],
    }),
    expense(
      day(2),
      'Dudhsagar falls jeep safari',
      'travel',
      rupees(9_000),
      [['aarav', rupees(9_000)]],
      all,
    ),
    expense(
      day(2),
      'Dinner at Spice Route',
      'food',
      rupees(6_480),
      [['meera', rupees(6_480)]],
      all,
    ),
    expense(day(3), 'Club entry', 'entertainment', rupees(8_000), [['diya', rupees(8_000)]], {
      type: 'percentage',
      // Meera skipped the club; the others split it evenly.
      percents: (['prashant', 'aarav', 'diya', 'kabir', 'rohan'] as UserKey[]).map((user) => ({
        user,
        weight: 2_000,
      })),
    }),
    expense(
      day(3),
      'Drinks',
      'food',
      rupees(4_560),
      [['rohan', rupees(4_560)]],
      equal('prashant', 'aarav', 'diya', 'kabir', 'rohan'),
    ),
    expense(
      day(3),
      'Spice plantation tour',
      'entertainment',
      rupees(3_600),
      [['prashant', rupees(3_600)]],
      all,
    ),
    expense(day(4), 'Fish thali lunch', 'food', rupees(2_520), [['aarav', rupees(2_520)]], all),
    expense(
      day(4),
      'Cab to Goa airport',
      'transport',
      rupees(1_400),
      [['kabir', rupees(1_400)]],
      all,
    ),
    expense(
      day(4),
      'Airport snacks',
      'food',
      rupees(980),
      [['diya', rupees(980)]],
      equal('diya', 'meera', 'prashant'),
    ),
  ];
  // Rohan paid Aarav back part of his share in cash on the way home.
  events.push({
    kind: 'settlement',
    from: 'rohan',
    to: 'aarav',
    amount: rupees(2_000),
    method: 'cash',
    date: day(5),
  });
  return { name: 'Goa Trip 2026', owner: 'prashant', members, events };
}

function flat302(today: Date): DemoGroup {
  const members: UserKey[] = ['prashant', 'kabir', 'sneha', 'ishaan'];
  const random = prng(302);
  const events: DemoEvent[] = [];
  const all = equal(...members);
  const roomShares: SplitInput = {
    type: 'shares',
    // Sneha has the bigger room.
    shares: members.map((user) => ({ user, weight: user === 'sneha' ? 4 : 3 })),
  };

  for (let back = 5; back >= 0; back--) {
    const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
    const label = month.toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' });
    const on = (d: number) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), d));
    const add = (d: number, e: (date: string) => DemoExpense) => {
      if (on(d) <= today) events.push(e(iso(on(d))));
    };
    const summer = [3, 4, 5].includes(month.getUTCMonth()); // April to June: more AC

    add(1, (date) =>
      expense(
        date,
        `Rent for ${label}`,
        'rent',
        rupees(40_000),
        [['sneha', rupees(40_000)]],
        roomShares,
      ),
    );
    for (const d of [4, 15, 25]) {
      const amount = rupees(Math.round(1_200 + random() * 2_600));
      const payer = members[Math.floor(random() * members.length)]!;
      add(d, (date) => expense(date, 'Groceries', 'groceries', amount, [[payer, amount]], all));
    }
    const power = rupees(Math.round((summer ? 3_200 : 1_900) + random() * 600));
    add(7, (date) =>
      expense(date, 'Electricity bill', 'utilities', power, [['kabir', power]], all),
    );
    add(10, (date) =>
      expense(date, 'Wi-Fi bill', 'utilities', rupees(999), [['prashant', rupees(999)]], all),
    );
    if (back % 2 === 0) {
      add(18, (date) =>
        expense(date, 'Gas cylinder', 'utilities', rupees(1_053), [['ishaan', rupees(1_053)]], all),
      );
    }
    add(26, (date) =>
      expense(date, 'Cook and cleaning', 'other', rupees(6_000), [['ishaan', rupees(6_000)]], all),
    );
    add(22, (date) => {
      const amount = rupees(Math.round(900 + random() * 1_400));
      return expense(
        date,
        'Weekend dinner order',
        'food',
        amount,
        [['sneha', amount]],
        equal('prashant', 'kabir', 'sneha'),
      );
    });

    // Everyone settles up at the end of each finished month.
    if (back > 0) {
      const lastDay = iso(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)));
      events.push(...settleAll(events, lastDay));
    }
  }
  // Chronological order (stable, so month-end settlements stay after that month's expenses).
  events.sort((a, b) => a.date.localeCompare(b.date));
  return { name: 'Flat 302', owner: 'sneha', members, events };
}

function lunchClub(today: Date): DemoGroup {
  const members: UserKey[] = ['meera', 'prashant', 'rohan', 'ishaan', 'diya'];
  const random = prng(7);
  const events: DemoEvent[] = [];
  const places = [
    'Udupi canteen',
    'Biryani place',
    'South Indian thali',
    'Momos stall',
    'Salad bar',
    'Chaat corner',
  ];
  let settledMidway = false;

  for (let back = 45; back >= 1; back--) {
    const date = addDays(today, -back);
    if (![1, 3, 5].includes(date.getUTCDay())) continue; // Mondays, Wednesdays, Fridays
    const attendees = members.filter(() => random() < 0.75);
    if (attendees.length < 2) continue;
    const payer = attendees[Math.floor(random() * attendees.length)]!;
    const amount = rupees(Math.round((180 + random() * 220) * attendees.length));
    const place = places[Math.floor(random() * places.length)]!;
    events.push(
      expense(iso(date), `Lunch: ${place}`, 'food', amount, [[payer, amount]], equal(...attendees)),
    );
    // About halfway through, two people pay back what they owe so far.
    if (back <= 20 && !settledMidway) {
      events.push(...settleAll(events, iso(date)).slice(0, 2));
      settledMidway = true;
    }
  }
  return { name: 'Office Lunch Club', owner: 'meera', members, events };
}

export function buildDemoData(now = new Date()): DemoGroup[] {
  const today = utcDay(now);
  return [goaTrip(today), flat302(today), lunchClub(today)];
}
