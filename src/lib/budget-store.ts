import { BudgetData, SpendEntry, MonthlyBudget } from './budget-types';

const STORAGE_KEY = 'budget-tracker-data';

function load(): BudgetData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { entries: [], monthlyBudgets: [] };
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

export function getMonthlyBudget(month: string): number | null {
  const data = load();
  const budget = data.monthlyBudgets.find(b => b.month === month);
  return budget ? budget.amount : null;
}

export function getEntriesForDate(date: string): SpendEntry[] {
  return load().entries.filter(e => e.date === date);
}

export function getEntriesForWeek(weekStart: string, weekEnd: string): SpendEntry[] {
  return load().entries.filter(e => e.date >= weekStart && e.date <= weekEnd);
}
