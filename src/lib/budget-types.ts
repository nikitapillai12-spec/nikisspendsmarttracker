export const DEFAULT_CATEGORIES = [
  'Groceries',
  'Eating Out',
  'Coffee',
  'Transport',
  'Home Improvement',
  'Toiletries',
  'Gifts',
  'Health & Wellness',
  'Subscriptions',
  'Utilities',
  'Rent',
  'Flights',
  'Travel Spend',
  'Insurance',
  'Other',
] as const;

export type DefaultCategory = typeof DEFAULT_CATEGORIES[number];
export type Category = string;

export type EntryType = 'spend' | 'credit';

/** Default categories for credits/refunds. Users can add more via the manager. */
export const DEFAULT_CREDIT_CATEGORIES = [
  'Shopping Refund',
] as const;

export type DefaultCreditCategory = typeof DEFAULT_CREDIT_CATEGORIES[number];

export const DEFAULT_CREDIT_CATEGORY_COLORS: Record<DefaultCreditCategory, string> = {
  'Shopping Refund': 'hsl(140, 45%, 38%)', // forest green
};

export const DEFAULT_CREDIT_CATEGORY_EMOJI: Record<DefaultCreditCategory, string> = {
  'Shopping Refund': '↩️',
};

export const DEFAULT_CATEGORY_COLORS: Record<DefaultCategory, string> = {
  // Mid-century modern palette: olive, terracotta, mustard, teal, sage, ochre, rust, dusty blue, plum
  'Groceries':         'hsl(90, 35%, 40%)',   // olive
  'Eating Out':        'hsl(15, 65%, 48%)',   // terracotta
  'Coffee':            'hsl(25, 45%, 32%)',   // espresso brown
  'Transport':         'hsl(200, 35%, 42%)',  // dusty blue
  'Home Improvement':  'hsl(35, 35%, 45%)',   // walnut
  'Toiletries':        'hsl(340, 30%, 55%)',  // dusty rose
  'Gifts':             'hsl(355, 55%, 50%)',  // brick red
  'Health & Wellness': 'hsl(160, 30%, 42%)',  // sage
  'Subscriptions':     'hsl(250, 25%, 50%)',  // muted indigo
  'Utilities':         'hsl(42, 75%, 50%)',   // mustard
  'Rent':              'hsl(180, 35%, 38%)',  // teal
  'Flights':           'hsl(280, 25%, 50%)',  // dusty plum
  'Travel Spend':      'hsl(190, 35%, 45%)',  // dusty cyan
  'Insurance':         'hsl(20, 55%, 45%)',   // burnt sienna
  'Other':             'hsl(35, 12%, 50%)',   // taupe
};

export const DEFAULT_CATEGORY_EMOJI: Record<DefaultCategory, string> = {
  'Groceries': '🛒',
  'Eating Out': '🍽️',
  'Coffee': '☕',
  'Transport': '🚌',
  'Home Improvement': '🏠',
  'Toiletries': '🧴',
  'Gifts': '🎁',
  'Health & Wellness': '💪',
  'Subscriptions': '📱',
  'Utilities': '💡',
  'Rent': '🏡',
  'Flights': '✈️',
  'Travel Spend': '🧳',
  'Insurance': '🛡️',
  'Other': '📦',
};

export interface CustomCategory {
  name: string;
  emoji: string;
  color: string;
  type?: EntryType; // 'spend' (default) or 'credit'
}

export interface SpendEntry {
  id: string;
  amount: number;
  category: Category;
  date: string; // YYYY-MM-DD
  createdAt: number;
  note?: string; // shop / retailer / website
  type?: EntryType; // 'spend' (default) or 'credit'
}

export interface MonthlyBudget {
  month: string; // YYYY-MM
  amount: number;
}

export interface CategoryBudget {
  category: string;
  month: string; // YYYY-MM — effective from this month forward
  amount: number;
}

export interface BudgetData {
  entries: SpendEntry[];
  monthlyBudgets: MonthlyBudget[];
  customCategories: CustomCategory[];
  categoryBudgets?: CategoryBudget[];
  recurringPayments?: RecurringPayment[];
  investmentEntries?: InvestmentEntry[];
  investmentPlatforms?: string[];
}

/** A monthly recurring payment (rent, subscriptions, utilities, etc.).
 *  Spread evenly across the weeks of the month for display only — does NOT
 *  count towards the ad-hoc weekly spend total. */
export interface RecurringPayment {
  id: string;
  label: string;       // e.g. "Rent", "Spotify"
  amount: number;      // monthly amount in £
  category: string;    // category bucket (e.g. "Rent", "Subscriptions")
  startMonth: string;  // 'YYYY-MM' — applies from this month onwards
  endMonth?: string;   // optional 'YYYY-MM' — last month it applies
  active: boolean;
}

/** A money top-up into an investment platform. Tracked separately — does NOT
 *  count towards spend totals. */
export interface InvestmentEntry {
  id: string;
  amount: number;
  platform: string;
  date: string; // YYYY-MM-DD
  note?: string;
  createdAt: number;
}

/** Default investment platforms — users can add more via the manager. */
export const DEFAULT_INVESTMENT_PLATFORMS = [
  'T212 ISA',
  'Freetrade GIA',
  'InvestEngine GIA',
  'IG Invest GIA',
  'Robinhood GIA',
] as const;

/** Returns the active recurring payments for a given 'YYYY-MM' month. */
export function getRecurringForMonth(
  payments: RecurringPayment[] | undefined,
  month: string
): RecurringPayment[] {
  if (!payments) return [];
  return payments.filter(p =>
    p.active && p.startMonth <= month && (!p.endMonth || p.endMonth >= month)
  );
}

// Helper to get all categories (default + custom) for a given entry type.
// Defaults to 'spend' to keep all legacy callers working.
export function getAllCategories(
  customCategories: CustomCategory[],
  type: EntryType = 'spend'
): string[] {
  if (type === 'credit') {
    return [
      ...DEFAULT_CREDIT_CATEGORIES,
      ...customCategories.filter(c => c.type === 'credit').map(c => c.name),
    ];
  }
  return [
    ...DEFAULT_CATEGORIES,
    ...customCategories.filter(c => (c.type ?? 'spend') === 'spend').map(c => c.name),
  ];
}

export function getCategoryColor(category: string, customCategories: CustomCategory[]): string {
  if (category in DEFAULT_CATEGORY_COLORS) {
    return DEFAULT_CATEGORY_COLORS[category as DefaultCategory];
  }
  if (category in DEFAULT_CREDIT_CATEGORY_COLORS) {
    return DEFAULT_CREDIT_CATEGORY_COLORS[category as DefaultCreditCategory];
  }
  const custom = customCategories.find(c => c.name === category);
  return custom?.color || 'hsl(230, 15%, 58%)';
}

export function getCategoryEmoji(category: string, customCategories: CustomCategory[]): string {
  if (category in DEFAULT_CATEGORY_EMOJI) {
    return DEFAULT_CATEGORY_EMOJI[category as DefaultCategory];
  }
  if (category in DEFAULT_CREDIT_CATEGORY_EMOJI) {
    return DEFAULT_CREDIT_CATEGORY_EMOJI[category as DefaultCreditCategory];
  }
  const custom = customCategories.find(c => c.name === category);
  return custom?.emoji || '🏷️';
}

/** Returns the signed contribution of an entry to totals: spend = +amount, credit = -amount. */
export function signedAmount(entry: SpendEntry): number {
  return (entry.type === 'credit') ? -entry.amount : entry.amount;
}
