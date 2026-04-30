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
}

export interface SpendEntry {
  id: string;
  amount: number;
  category: Category;
  date: string; // YYYY-MM-DD
  createdAt: number;
  note?: string; // shop / retailer / website
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
}

// Helper to get all categories (default + custom)
export function getAllCategories(customCategories: CustomCategory[]): string[] {
  return [...DEFAULT_CATEGORIES, ...customCategories.map(c => c.name)];
}

export function getCategoryColor(category: string, customCategories: CustomCategory[]): string {
  if (category in DEFAULT_CATEGORY_COLORS) {
    return DEFAULT_CATEGORY_COLORS[category as DefaultCategory];
  }
  const custom = customCategories.find(c => c.name === category);
  return custom?.color || 'hsl(230, 15%, 58%)';
}

export function getCategoryEmoji(category: string, customCategories: CustomCategory[]): string {
  if (category in DEFAULT_CATEGORY_EMOJI) {
    return DEFAULT_CATEGORY_EMOJI[category as DefaultCategory];
  }
  const custom = customCategories.find(c => c.name === category);
  return custom?.emoji || '🏷️';
}
