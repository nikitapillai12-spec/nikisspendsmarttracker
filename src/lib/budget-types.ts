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
  'Groceries': 'hsl(145, 65%, 50%)',
  'Eating Out': 'hsl(25, 95%, 58%)',
  'Coffee': 'hsl(30, 70%, 45%)',
  'Transport': 'hsl(210, 80%, 58%)',
  'Home Improvement': 'hsl(280, 60%, 60%)',
  'Toiletries': 'hsl(330, 70%, 62%)',
  'Gifts': 'hsl(350, 85%, 62%)',
  'Health & Wellness': 'hsl(170, 75%, 48%)',
  'Subscriptions': 'hsl(250, 70%, 62%)',
  'Utilities': 'hsl(45, 90%, 52%)',
  'Rent': 'hsl(200, 75%, 52%)',
  'Flights': 'hsl(290, 70%, 58%)',
  'Travel Spend': 'hsl(180, 70%, 48%)',
  'Insurance': 'hsl(15, 80%, 55%)',
  'Other': 'hsl(230, 15%, 58%)',
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
