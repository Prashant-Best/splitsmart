export const CATEGORIES = [
  'food',
  'groceries',
  'travel',
  'transport',
  'stay',
  'rent',
  'utilities',
  'entertainment',
  'shopping',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food & drinks',
  groceries: 'Groceries',
  travel: 'Travel',
  transport: 'Local transport',
  stay: 'Hotels & stays',
  rent: 'Rent',
  utilities: 'Utilities',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  other: 'Other',
};
