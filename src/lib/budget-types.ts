export const CATEGORIES = [
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
  'Other',
] as const;

export type Category = typeof CATEGORIES[number];

export const CATEGORY_COLORS: Record<Category, string> = {
  'Groceries': 'hsl(145, 65%, 42%)',
  'Eating Out': 'hsl(25, 95%, 55%)',
  'Coffee': 'hsl(30, 60%, 40%)',
  'Transport': 'hsl(210, 80%, 55%)',
  'Home Improvement': 'hsl(280, 55%, 55%)',
  'Toiletries': 'hsl(330, 65%, 58%)',
  'Gifts': 'hsl(350, 80%, 60%)',
  'Health & Wellness': 'hsl(170, 70%, 45%)',
  'Subscriptions': 'hsl(250, 65%, 58%)',
  'Utilities': 'hsl(45, 85%, 50%)',
  'Other': 'hsl(230, 10%, 55%)',
};

export const CATEGORY_EMOJI: Record<Category, string> = {
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
  'Other': '📦',
};

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

export interface BudgetData {
  entries: SpendEntry[];
  monthlyBudgets: MonthlyBudget[];
}
