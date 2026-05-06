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

/**
 * Returns the number of distinct ISO weeks (Monday-start) that have at least
 * one day inside the given calendar month. Used to evenly split a monthly
 * recurring payment across the weeks it touches.
 */
export function weeksTouchingMonth(monthKey: string): number {
  const first = new Date(monthKey + '-01');
  const last = endOfMonth(first);
  const seen = new Set<string>();
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    seen.add(format(getWeekStart(d), 'yyyy-MM-dd'));
  }
  return seen.size;
}

/**
 * Decides which single day in the given week the recurring split is
 * "billed" on for display purposes. Rule: the last day of the week that
 * still lies in the month — so the split appears at the end of each week
 * within that month.
 */
export function recurringDisplayDateInWeek(weekStart: Date, monthKey: string): string | null {
  const days = getWeekDays(weekStart);
  const inMonth = days.filter(d => format(d, 'yyyy-MM') === monthKey);
  if (inMonth.length === 0) return null;
  return formatDate(inMonth[inMonth.length - 1]);
}

/**
 * Returns the representative date for each week that touches a given month.
 * Used to create per-week split entries for Salary, Rent, Utilities, Subscriptions.
 * The representative date is the last day of each week that still falls in that month.
 */
export function getWeekRepresentativeDatesForMonth(monthKey: string): string[] {
  const first = new Date(monthKey + '-01');
  const last = endOfMonth(first);
  const seenWeeks = new Set<string>();
  const result: string[] = [];
  for (let d = new Date(first); d <= last; d = addDays(d, 1)) {
    const ws = format(getWeekStart(d), 'yyyy-MM-dd');
    if (!seenWeeks.has(ws)) {
      seenWeeks.add(ws);
      // The representative date = last day of this week still in the month
      const weekDays = Array.from({ length: 7 }, (_, i) => addDays(new Date(ws), i));
      const inMonth = weekDays.filter(wd => wd >= first && wd <= last);
      if (inMonth.length > 0) result.push(formatDate(inMonth[inMonth.length - 1]));
    }
  }
  return result;
}
