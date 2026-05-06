export const DEFAULT_CATEGORIES = [
  'Groceries',
  'Eating Out',
  'Coffee',
  'Transport',
  'Home Improvement',
  'Toiletries',
  'Shopping',
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

export type EntryType = 'spend' | 'credit' | 'investment';

/** Default categories for credits/refunds. Users can add more via the manager. */
export const DEFAULT_CREDIT_CATEGORIES = [
  'Shopping Refund',
  'Salary Payment',
  'RSUs Payment',
  'ESPP Payment',
] as const;

export type DefaultCreditCategory = typeof DEFAULT_CREDIT_CATEGORIES[number];

export const DEFAULT_CREDIT_CATEGORY_COLORS: Record<DefaultCreditCategory, string> = {
  'Shopping Refund': 'hsl(140, 45%, 38%)',
  'Salary Payment':  'hsl(210, 55%, 42%)',
  'RSUs Payment':    'hsl(270, 40%, 48%)',
  'ESPP Payment':    'hsl(175, 45%, 38%)',
};

export const DEFAULT_CREDIT_CATEGORY_EMOJI: Record<DefaultCreditCategory, string> = {
  'Shopping Refund': '↩️',
  'Salary Payment':  '💰',
  'RSUs Payment':    '📈',
  'ESPP Payment':    '🏦',
};

export const DEFAULT_CATEGORY_COLORS: Record<DefaultCategory, string> = {
  'Groceries':         'hsl(90, 35%, 40%)',
  'Eating Out':        'hsl(15, 65%, 48%)',
  'Coffee':            'hsl(25, 45%, 32%)',
  'Transport':         'hsl(200, 35%, 42%)',
  'Home Improvement':  'hsl(35, 35%, 45%)',
  'Toiletries':        'hsl(340, 30%, 55%)',
  'Shopping':          'hsl(330, 50%, 48%)',
  'Gifts':             'hsl(355, 55%, 50%)',
  'Health & Wellness': 'hsl(160, 30%, 42%)',
  'Subscriptions':     'hsl(250, 25%, 50%)',
  'Utilities':         'hsl(42, 75%, 50%)',
  'Rent':              'hsl(180, 35%, 38%)',
  'Flights':           'hsl(280, 25%, 50%)',
  'Travel Spend':      'hsl(190, 35%, 45%)',
  'Insurance':         'hsl(20, 55%, 45%)',
  'Other':             'hsl(35, 12%, 50%)',
};

export const DEFAULT_CATEGORY_EMOJI: Record<DefaultCategory, string> = {
  'Groceries': '🛒',
  'Eating Out': '🍽️',
  'Coffee': '☕',
  'Transport': '🚌',
  'Home Improvement': '🏠',
  'Toiletries': '🧴',
  'Shopping': '🛍️',
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
  type?: EntryType;
}

export interface SpendEntry {
  id: string;
  amount: number;
  category: Category;
  date: string; // YYYY-MM-DD
  createdAt: number;
  note?: string;
  type?: EntryType;
  /** If set, this entry is linked to another entry as a refund pair */
  refundPairId?: string;
}

export interface MonthlyBudget {
  month: string; // YYYY-MM
  amount: number;
}

export interface CategoryBudget {
  category: string;
  month: string; // YYYY-MM
  amount: number;
}

export interface AnnualBudget {
  year: number;
  label: string; // e.g. "Vacations"
  amount: number;
  /** Categories whose spend counts toward this budget */
  categories: string[];
}

export interface BudgetData {
  entries: SpendEntry[];
  monthlyBudgets: MonthlyBudget[];
  customCategories: CustomCategory[];
  categoryBudgets?: CategoryBudget[];
  annualBudgets?: AnnualBudget[];
  recurringPayments?: RecurringPayment[];
  investmentEntries?: InvestmentEntry[];
  investmentPlatforms?: string[];
}

export interface RecurringPayment {
  id: string;
  label: string;
  amount: number;
  category: string;
  startMonth: string;
  endMonth?: string;
  active: boolean;
}

export interface InvestmentEntry {
  id: string;
  amount: number;
  platform: string;
  date: string; // YYYY-MM-DD
  note?: string;
  createdAt: number;
}

export const DEFAULT_INVESTMENT_PLATFORMS = [
  'T212 ISA',
  'Freetrade GIA',
  'InvestEngine GIA',
  'IG Invest GIA',
  'Robinhood GIA',
] as const;

export function getRecurringForMonth(
  payments: RecurringPayment[] | undefined,
  month: string
): RecurringPayment[] {
  if (!payments) return [];
  return payments.filter(p =>
    p.active && p.startMonth <= month && (!p.endMonth || p.endMonth >= month)
  );
}

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
  if (type === 'investment') {
    return ['Investment'];
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
  if (category === 'Investment') return 'hsl(210, 60%, 45%)';
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
  if (category === 'Investment') return '📊';
  const custom = customCategories.find(c => c.name === category);
  return custom?.emoji || '🏷️';
}

/** Returns the signed contribution of an entry to totals: spend/investment = +amount, credit = -amount. */
export function signedAmount(entry: SpendEntry): number {
  return (entry.type === 'credit') ? -entry.amount : entry.amount;
}

/** Categories that trigger weekly distribution across the month */
export const WEEKLY_DISTRIBUTED_SPEND_CATEGORIES = ['Rent', 'Utilities', 'Subscriptions'] as const;
export const WEEKLY_DISTRIBUTED_CREDIT_CATEGORIES = ['Salary Payment'] as const;

export function shouldDistributeWeekly(category: string, type: EntryType): boolean {
  if (type === 'spend') return (WEEKLY_DISTRIBUTED_SPEND_CATEGORIES as readonly string[]).includes(category);
  if (type === 'credit') return (WEEKLY_DISTRIBUTED_CREDIT_CATEGORIES as readonly string[]).includes(category);
  return false;
}
