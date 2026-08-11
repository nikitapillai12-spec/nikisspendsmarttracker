import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayBox } from './DayBox';
import { CategoryManager } from './CategoryManager';
import { RecurringPaymentsManager } from './RecurringPaymentsManager';
import { BudgetRings } from './BudgetRings';
import { BudgetData, Category, SpendEntry, EntryType, RecurringPayment, getAllCategories, getCategoryEmoji, getCategoryColor, getRecurringForMonth, signedAmount, shouldDistributeWeekly } from '@/lib/budget-types';
import { getWeekStart, getWeekEnd, getWeekDays, formatDate, formatMonth, formatDisplayMonth, navigateWeek, getWeeklyBudget, weeksTouchingMonth, recurringDisplayDateInWeek, getWeekRepresentativeDatesForMonth } from '@/lib/date-utils';
import { addEntry, updateEntry, deleteEntry, getMonthlyBudget } from '@/lib/budget-store';
import { Button } from '@/components/ui/button';

interface WeeklyViewProps {
  data: BudgetData;
  onDataChange: (data: BudgetData) => void;
}

export function WeeklyView({ data, onDataChange }: WeeklyViewProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));

  const weekEnd = getWeekEnd(weekStart);
  const days = getWeekDays(weekStart);
  const month = formatMonth(weekStart);
  const currentBudget = getMonthlyBudget(month);
  const weeklyBudget = currentBudget ? getWeeklyBudget(currentBudget) : null;
  const allCats = useMemo(() => getAllCategories(data.customCategories), [data.customCategories]);

  const recurringSplits = useMemo(() => {
    const result: Array<{ payment: RecurringPayment; perWeek: number; displayDate: string | null }> = [];
    const monthsForWeek = new Set<string>();
    days.forEach(d => monthsForWeek.add(formatMonth(d)));
    monthsForWeek.forEach(mk => {
      const active = getRecurringForMonth(data.recurringPayments, mk);
      if (active.length === 0) return;
      const weeksInMonth = Math.max(1, weeksTouchingMonth(mk));
      const displayDate = recurringDisplayDateInWeek(weekStart, mk);
      active.forEach(p => {
        result.push({ payment: p, perWeek: p.amount / weeksInMonth, displayDate });
      });
    });
    return result;
  }, [data.recurringPayments, days, weekStart]);

  const recurringByDate = useMemo(() => {
    const m: Record<string, Array<{ payment: RecurringPayment; perWeek: number }>> = {};
    recurringSplits.forEach(({ payment, perWeek, displayDate }) => {
      if (!displayDate) return;
      (m[displayDate] = m[displayDate] || []).push({ payment, perWeek });
    });
    return m;
  }, [recurringSplits]);

  const recurringWeekTotal = recurringSplits.reduce((s, x) => s + x.perWeek, 0);

  // Month-to-date totals (up to and including the end of the displayed week)
  const mtd = useMemo(() => {
    const monthKey = month;
    const monthStart = `${monthKey}-01`;
    const cutoff = formatDate(weekEnd);
    const inMonth = data.entries.filter(e => e.date >= monthStart && e.date <= cutoff && e.date.slice(0, 7) === monthKey);
    const spend = inMonth.filter(e => (e.type ?? 'spend') === 'spend').reduce((s, e) => s + e.amount, 0);
    const credits = inMonth.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
    const investments = inMonth.filter(e => e.type === 'investment').reduce((s, e) => s + e.amount, 0);

    // Recurring payments accrued so far this month (per-week split × weeks elapsed)
    const weeksInMonth = Math.max(1, weeksTouchingMonth(monthKey));
    const weekDates = getWeekRepresentativeDatesForMonth(monthKey);
    const weeksElapsed = weekDates.filter(d => d <= cutoff).length;
    const monthlyRecurring = getRecurringForMonth(data.recurringPayments, monthKey)
      .reduce((s, p) => s + p.amount, 0);
    const recurringSoFar = (monthlyRecurring / weeksInMonth) * weeksElapsed;

    return { spend: spend + recurringSoFar, credits, investments, net: spend + recurringSoFar - credits, recurringSoFar };
  }, [data.entries, data.recurringPayments, month, weekEnd]);

  const weekEntries = useMemo(() => {
    const start = formatDate(weekStart);
    const end = formatDate(weekEnd);
    return data.entries.filter(e => e.date >= start && e.date <= end);
  }, [data.entries, weekStart, weekEnd]);

  // Weekly summary stats (Item 3)
  const weekTotalSpend = weekEntries.filter(e => (e.type ?? 'spend') === 'spend').reduce((s, e) => s + e.amount, 0);
  const weekTotalCredits = weekEntries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
  const weekTotalInvestments = weekEntries.filter(e => e.type === 'investment').reduce((s, e) => s + e.amount, 0);
  const weekTotal = weekEntries.reduce((s, e) => s + signedAmount(e), 0);
  const budgetDiff = weeklyBudget ? weeklyBudget - weekTotal : null;
  const weekSpendInclRecurring = weekTotalSpend + recurringWeekTotal;
  const weekNetSpend = weekSpendInclRecurring - weekTotalCredits;

  const handleAdd = useCallback((dateStr: string, amount: number, category: Category, note?: string, type?: EntryType) => {
    const effectiveType = type ?? 'spend';

    // Items 6/7/8: Auto-distribute across weeks for Salary, Rent, Utilities, Subscriptions
    if (shouldDistributeWeekly(category, effectiveType)) {
      const month = dateStr.slice(0, 7); // YYYY-MM
      const weekDates = getWeekRepresentativeDatesForMonth(month);
      const perWeek = amount / weekDates.length;
      let latest: BudgetData = { ...data };
      weekDates.forEach((wDate, i) => {
        const e: SpendEntry = {
          id: crypto.randomUUID(),
          amount: Math.round(perWeek * 100) / 100,
          category,
          date: wDate,
          createdAt: Date.now() + i,
          note: note ? `${note} (wk ${i + 1}/${weekDates.length})` : `Week ${i + 1}/${weekDates.length}`,
          type: effectiveType,
        };
        latest = addEntry(e);
      });
      onDataChange(latest);
      return;
    }

    const entry: SpendEntry = {
      id: crypto.randomUUID(),
      amount,
      category,
      date: dateStr,
      createdAt: Date.now(),
      note,
      type: effectiveType,
    };
    onDataChange(addEntry(entry));
  }, [onDataChange, data]);

  const handleUpdate = useCallback((id: string, amount: number, category: Category, note?: string, type?: EntryType) => {
    onDataChange(updateEntry(id, { amount, category, note, type }));
  }, [onDataChange]);

  const handleDelete = useCallback((id: string) => {
    onDataChange(deleteEntry(id));
  }, [onDataChange]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {/* Row 1: week navigation */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full border border-border mcm-shadow-sm shrink-0" onClick={() => setWeekStart(navigateWeek(weekStart, 'prev'))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="text-center">
              <h2 className="font-display font-normal text-lg sm:text-2xl tracking-wide leading-none">
                {formatDate(weekStart).slice(5)} – {formatDate(weekEnd).slice(5)}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground font-serif-mcm italic mt-0.5">{formatDisplayMonth(weekStart)}</p>
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-full border border-border mcm-shadow-sm shrink-0" onClick={() => setWeekStart(navigateWeek(weekStart, 'next'))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="text-xs sm:text-sm shrink-0" onClick={() => setWeekStart(getWeekStart(new Date()))}>
            Today
          </Button>
        </div>

        {/* Row 2: totals + action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <RecurringPaymentsManager data={data} onDataChange={onDataChange} />
          <CategoryManager data={data} onDataChange={onDataChange} />
        </div>
      </div>{/* end Row 2 */}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-budget-over/10 px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Week Total Spend</div>
          <div className="font-display text-xl text-budget-over">£{weekSpendInclRecurring.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">incl. £{recurringWeekTotal.toFixed(2)} monthly split</div>
        </div>
        <div className="rounded-xl border border-border bg-budget-over/5 px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">MTD Total Spend</div>
          <div className="font-display text-xl text-budget-over">£{mtd.spend.toFixed(2)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">incl. £{mtd.recurringSoFar.toFixed(2)} monthly split</div>
        </div>
        <div className={`rounded-xl border border-border px-4 py-3 text-center ${weekNetSpend >= 0 ? 'bg-secondary' : 'bg-budget-under/10'}`}>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Week Net Spend</div>
          <div className={`font-display text-xl ${weekNetSpend < 0 ? 'text-budget-under' : 'text-foreground'}`}>
            {weekNetSpend < 0 ? '-' : ''}£{Math.abs(weekNetSpend).toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-secondary px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">MTD Net Spend</div>
          <div className={`font-display text-xl ${mtd.net < 0 ? 'text-budget-under' : ''}`}>
            {mtd.net < 0 ? '-' : ''}£{Math.abs(mtd.net).toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-budget-under/10 px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Total Credits</div>
          <div className="font-display text-xl text-budget-under">£{weekTotalCredits.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-border bg-blue-50 px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">MTD Investments</div>
          <div className="font-display text-xl text-blue-600">£{mtd.investments.toFixed(2)}</div>
        </div>
      </div>

      <BudgetRings data={data} weekStart={formatDate(weekStart)} weekEnd={formatDate(weekEnd)} />

      {recurringWeekTotal > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-display font-bold tracking-wide">Monthly payments split this week:</span>
          {Object.entries(
            recurringSplits.reduce<Record<string, number>>((acc, { payment, perWeek }) => {
              acc[payment.label] = (acc[payment.label] || 0) + perWeek;
              return acc;
            }, {})
          ).map(([label, amt]) => (
            <span key={label} className="text-muted-foreground">
              {label} <span className="font-semibold text-foreground">£{amt.toFixed(2)}</span>
            </span>
          ))}
          <span className="ml-auto font-display font-bold">= £{recurringWeekTotal.toFixed(2)}</span>
        </div>
      )}

      <div className="pb-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {days.map((day, i) => {
          const dateStr = formatDate(day);
          const dayEntries = data.entries.filter(e => e.date === dateStr);
          const dayRecurring = recurringByDate[dateStr] || [];
          return (
            <motion.div
              key={dateStr}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <DayBox
                date={day}
                dateStr={dateStr}
                entries={dayEntries}
                customCategories={data.customCategories}
                allEntries={data.entries}
                recurringSplits={dayRecurring}
                investmentPlatforms={data.investmentPlatforms}
                onAdd={(amount, category, note, type) => handleAdd(dateStr, amount, category, note, type)}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onDataChange={onDataChange}
              />
            </motion.div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
