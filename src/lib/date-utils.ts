import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, startOfMonth, endOfMonth, eachMonthOfInterval, parse } from 'date-fns';

export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 }); // Monday
}

export function getWeekEnd(date: Date): Date {
  return endOfWeek(date, { weekStartsOn: 1 });
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function formatMonth(date: Date): string {
  return format(date, 'yyyy-MM');
}

export function formatDisplayDate(date: Date): string {
  return format(date, 'EEE d MMM');
}

export function formatDisplayMonth(date: Date): string {
  return format(date, 'MMM yyyy');
}

export function navigateWeek(currentStart: Date, direction: 'prev' | 'next'): Date {
  return direction === 'next' ? addWeeks(currentStart, 1) : subWeeks(currentStart, 1);
}

export function getWeeklyBudget(monthlyBudget: number): number {
  return Math.round((monthlyBudget * 12 / 52) * 100) / 100;
}

export function getMonthsInRange(entries: { date: string }[]): string[] {
  if (entries.length === 0) return [];
  const dates = entries.map(e => new Date(e.date)).sort((a, b) => a.getTime() - b.getTime());
  const months = eachMonthOfInterval({ start: startOfMonth(dates[0]), end: endOfMonth(dates[dates.length - 1]) });
  return months.map(m => format(m, 'yyyy-MM'));
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
}
