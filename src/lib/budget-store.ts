import { BudgetData, SpendEntry, MonthlyBudget, CustomCategory, CategoryBudget } from './budget-types';

const STORAGE_KEY = 'budget-tracker-data';

function load(): BudgetData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migration: ensure customCategories exists
      if (!parsed.customCategories) parsed.customCategories = [];
      if (!parsed.categoryBudgets) parsed.categoryBudgets = [];
      return parsed;
    }
  } catch {}
  return { entries: [], monthlyBudgets: [], customCategories: [], categoryBudgets: [] };
}

function save(data: BudgetData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getAll(): BudgetData {
  return load();
}

export function addEntry(entry: SpendEntry): BudgetData {
  const data = load();
  data.entries.push(entry);
  save(data);
  return data;
}

export function updateEntry(id: string, updates: Partial<Pick<SpendEntry, 'amount' | 'category'>>): BudgetData {
  const data = load();
  data.entries = data.entries.map(e => e.id === id ? { ...e, ...updates } : e);
  save(data);
  return data;
}

export function deleteEntry(id: string): BudgetData {
  const data = load();
  data.entries = data.entries.filter(e => e.id !== id);
  save(data);
  return data;
}

export function setMonthlyBudget(month: string, amount: number): BudgetData {
  const data = load();
  const existing = data.monthlyBudgets.find(b => b.month === month);
  if (existing) {
    existing.amount = amount;
  } else {
    data.monthlyBudgets.push({ month, amount });
  }
  save(data);
  return data;
}

// Returns the effective overall monthly budget for the given month:
// the most recent budget with month <= target month (forward-propagating).
export function getMonthlyBudget(month: string): number | null {
  const data = load();
  return getEffectiveMonthlyBudget(data, month);
}

export function getEffectiveMonthlyBudget(data: BudgetData, month: string): number | null {
  const eligible = data.monthlyBudgets
    .filter(b => b.month <= month)
    .sort((a, b) => b.month.localeCompare(a.month));
  return eligible.length ? eligible[0].amount : null;
}

export function setCategoryBudget(category: string, month: string, amount: number): BudgetData {
  const data = load();
  if (!data.categoryBudgets) data.categoryBudgets = [];
  const existing = data.categoryBudgets.find(b => b.category === category && b.month === month);
  if (existing) {
    existing.amount = amount;
  } else {
    data.categoryBudgets.push({ category, month, amount });
  }
  save(data);
  return data;
}

export function deleteCategoryBudget(category: string, month: string): BudgetData {
  const data = load();
  data.categoryBudgets = (data.categoryBudgets || []).filter(
    b => !(b.category === category && b.month === month)
  );
  save(data);
  return data;
}

export function getEffectiveCategoryBudget(
  data: BudgetData,
  category: string,
  month: string
): number | null {
  const list = data.categoryBudgets || [];
  const eligible = list
    .filter(b => b.category === category && b.month <= month)
    .sort((a, b) => b.month.localeCompare(a.month));
  return eligible.length ? eligible[0].amount : null;
}

export function getEntriesForDate(date: string): SpendEntry[] {
  return load().entries.filter(e => e.date === date);
}

export function getEntriesForWeek(weekStart: string, weekEnd: string): SpendEntry[] {
  return load().entries.filter(e => e.date >= weekStart && e.date <= weekEnd);
}

export function addCustomCategory(cat: CustomCategory): BudgetData {
  const data = load();
  data.customCategories.push(cat);
  save(data);
  return data;
}

export function updateCustomCategory(oldName: string, cat: CustomCategory): BudgetData {
  const data = load();
  data.customCategories = data.customCategories.map(c => c.name === oldName ? cat : c);
  // Also update entries that used the old name
  if (oldName !== cat.name) {
    data.entries = data.entries.map(e => e.category === oldName ? { ...e, category: cat.name } : e);
  }
  save(data);
  return data;
}

export function deleteCustomCategory(name: string): BudgetData {
  const data = load();
  data.customCategories = data.customCategories.filter(c => c.name !== name);
  save(data);
  return data;
}
