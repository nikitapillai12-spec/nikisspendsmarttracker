import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Target, Tag } from 'lucide-react';
import { DayBox } from './DayBox';
import { CategoryManager } from './CategoryManager';
import { RecurringPaymentsManager } from './RecurringPaymentsManager';
import { InvestmentsManager } from './InvestmentsManager';
import { BudgetData, Category, SpendEntry, EntryType, RecurringPayment, getAllCategories, getCategoryEmoji, getCategoryColor, getRecurringForMonth, signedAmount, shouldDistributeWeekly } from '@/lib/budget-types';
import { getWeekStart, getWeekEnd, getWeekDays, formatDate, formatMonth, formatDisplayMonth, navigateWeek, getWeeklyBudget, weeksTouchingMonth, recurringDisplayDateInWeek, getWeekRepresentativeDatesForMonth } from '@/lib/date-utils';
import { addEntry, updateEntry, deleteEntry, getMonthlyBudget, setMonthlyBudget, setCategoryBudget, deleteCategoryBudget, getEffectiveCategoryBudget, setAnnualBudget, getAnnualBudget } from '@/lib/budget-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface WeeklyViewProps {
  data: BudgetData;
  onDataChange: (data: BudgetData) => void;
}

export function WeeklyView({ data, onDataChange }: WeeklyViewProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [catBudgetInputs, setCatBudgetInputs] = useState<Record<string, string>>({});
  const [budgetMode, setBudgetMode] = useState<'total' | 'categories'>('total');
  const [vacationsInput, setVacationsInput] = useState('');

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

  const weekEntries = useMemo(() => {
    const start = formatDate(weekStart);
    const end = formatDate(weekEnd);
    return data.entries.filter(e => e.date >= start && e.date <= end);
  }, [data.entries, weekStart, weekEnd]);

  // Weekly summary stats (Item 3)
  const weekTotalSpend = weekEntries.filter(e => (e.type ?? 'spend') === 'spend').reduce((s, e) => s + e.amount, 0);
  const weekTotalCredits = weekEntries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
  const weekTotalInvestments = weekEntries.filter(e => e.type === 'investment').reduce((s, e) => s + e.amount, 0);
  const weekNetSpend = weekTotalSpend - weekTotalCredits;
  const weekTotal = weekEntries.reduce((s, e) => s + signedAmount(e), 0);
  const budgetDiff = weeklyBudget ? weeklyBudget - weekTotal : null;

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

  const openBudgetDialog = () => {
    setBudgetInput(currentBudget?.toString() || '');
    const init: Record<string, string> = {};
    let hasAnyCat = false;
    allCats.forEach(c => {
      const v = getEffectiveCategoryBudget(data, c, month);
      if (v !== null) hasAnyCat = true;
      init[c] = v !== null ? v.toString() : '';
    });
    setCatBudgetInputs(init);
    setBudgetMode(hasAnyCat && !currentBudget ? 'categories' : 'total');
    const year = new Date(weekStart).getFullYear();
    const vab = getAnnualBudget(year, 'Vacations');
    setVacationsInput(vab ? vab.amount.toString() : '');
    setBudgetDialogOpen(true);
  };

  const handleSetBudget = () => {
    let latest = data;
    if (budgetMode === 'total') {
      const val = parseFloat(budgetInput);
      if (!Number.isNaN(val) && val > 0) {
        latest = setMonthlyBudget(month, val);
      }
      (latest.categoryBudgets || [])
        .filter(b => b.month === month)
        .forEach(b => { latest = deleteCategoryBudget(b.category, month); });
    } else {
      let sum = 0;
      Object.entries(catBudgetInputs).forEach(([cat, raw]) => {
        const trimmed = raw.trim();
        if (trimmed === '') {
          const hasAtThisMonth = (latest.categoryBudgets || []).some(b => b.category === cat && b.month === month);
          if (hasAtThisMonth) latest = deleteCategoryBudget(cat, month);
          return;
        }
        const n = parseFloat(trimmed);
        if (!Number.isNaN(n) && n >= 0) {
          latest = setCategoryBudget(cat, month, n);
          sum += n;
        }
      });
      if (sum > 0) {
        latest = setMonthlyBudget(month, sum);
      }
    }
    // Save vacations annual budget
    const year = new Date(weekStart).getFullYear();
    const vacVal = parseFloat(vacationsInput);
    if (!isNaN(vacVal) && vacVal > 0) {
      latest = setAnnualBudget({ year, label: 'Vacations', amount: vacVal, categories: ['Flights', 'Travel Spend'] });
    }

    onDataChange(latest);
    setBudgetDialogOpen(false);
    setBudgetInput('');
    setCatBudgetInputs({});
  };

  const updateCatBudget = (cat: string, val: string) => {
    setCatBudgetInputs(prev => ({ ...prev, [cat]: val }));
  };

  const totalCategoryBudgets = Object.values(catBudgetInputs).reduce((s, v) => {
    const n = parseFloat(v);
    return Number.isNaN(n) ? s : s + n;
  }, 0);

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
          <motion.div
            key={weekTotal}
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="px-3 py-1.5 rounded-lg bg-secondary border border-border mcm-shadow-sm"
          >
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Week Total</span>
            <p className="font-display font-normal text-xl sm:text-2xl tracking-wide leading-none mt-0.5">£{weekTotal.toFixed(2)}</p>
          </motion.div>

          {weeklyBudget !== null && budgetDiff !== null && (
            <motion.div
              key={budgetDiff}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className={`px-3 py-1.5 rounded-lg border border-border mcm-shadow-sm ${
                budgetDiff >= 0
                  ? 'bg-budget-under/10 text-budget-under'
                  : 'bg-budget-over/10 text-budget-over'
              }`}
            >
              <span className="text-[10px] opacity-75 uppercase tracking-widest">
                £{weeklyBudget.toFixed(0)}/wk
              </span>
              <p className="font-display font-normal text-xl sm:text-2xl tracking-wide leading-none mt-0.5">
                {budgetDiff >= 0 ? '✅' : '🔴'} £{Math.abs(budgetDiff).toFixed(2)} {budgetDiff >= 0 ? 'under' : 'over'}
              </p>
            </motion.div>
          )}

          <Dialog open={budgetDialogOpen} onOpenChange={(v) => { if (v) openBudgetDialog(); else setBudgetDialogOpen(false); }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full border border-border mcm-shadow-sm text-sm">
                <Target className="w-4 h-4" />
                {currentBudget ? 'Edit Budget' : 'Set Budget'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Budgets for {formatDisplayMonth(weekStart)}</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground -mt-1">Changes apply from this month forward.</p>
              <div className="space-y-5 pt-3">
                <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-secondary">
                  <button
                    type="button"
                    onClick={() => setBudgetMode('total')}
                    className={`text-xs font-medium rounded-full py-2 transition-colors ${budgetMode === 'total' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                  >
                    Total monthly budget
                  </button>
                  <button
                    type="button"
                    onClick={() => setBudgetMode('categories')}
                    className={`text-xs font-medium rounded-full py-2 transition-colors ${budgetMode === 'categories' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                  >
                    By category (auto-total)
                  </button>
                </div>

                {budgetMode === 'total' ? (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Overall monthly budget (£)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                      placeholder="e.g. 2000"
                      onKeyDown={(e) => e.key === 'Enter' && handleSetBudget()}
                    />
                    {budgetInput && parseFloat(budgetInput) > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        ≈ £{getWeeklyBudget(parseFloat(budgetInput)).toFixed(2)} per week
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium flex items-center gap-1.5"><Tag className="w-4 h-4" /> Per-category budgets</label>
                      <span className="text-xs font-semibold">Total: £{totalCategoryBudgets.toFixed(2)}</span>
                    </div>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {allCats.map(cat => (
                        <div key={cat} className="flex items-center gap-2">
                          <span
                            className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
                            style={{ background: `${getCategoryColor(cat, data.customCategories)}22` }}
                          >
                            {getCategoryEmoji(cat, data.customCategories)}
                          </span>
                          <span className="flex-1 text-sm truncate">{cat}</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={catBudgetInputs[cat] || ''}
                            onChange={(e) => updateCatBudget(cat, e.target.value)}
                            placeholder="—"
                            className="h-8 w-24 text-sm text-right"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Annual Vacations budget */}
                <div className="border-t border-border pt-4">
                  <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                    ✈️ Annual Vacations budget ({new Date(weekStart).getFullYear()})
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Covers Flights + Travel Spend. Tracked separately in the Time Series view.
                  </p>
                  <Input
                    type="number"
                    step="0.01"
                    value={vacationsInput}
                    onChange={(e) => setVacationsInput(e.target.value)}
                    placeholder="e.g. 5000"
                    onKeyDown={(e) => e.key === 'Enter' && handleSetBudget()}
                  />
                </div>

                <Button className="w-full" onClick={handleSetBudget}>
                  Save Budgets
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <RecurringPaymentsManager data={data} onDataChange={onDataChange} />
          <InvestmentsManager data={data} onDataChange={onDataChange} />
          <CategoryManager data={data} onDataChange={onDataChange} />
        </div>
      </div>{/* end Row 2 */}

      {/* Weekly Summary Stats (Item 3) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-budget-over/10 px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Total Spend</div>
          <div className="font-display text-xl text-budget-over">£{weekTotalSpend.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-border bg-budget-under/10 px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Total Credits</div>
          <div className="font-display text-xl text-budget-under">£{weekTotalCredits.toFixed(2)}</div>
        </div>
        <div className={`rounded-xl border border-border px-4 py-3 text-center ${weekNetSpend >= 0 ? 'bg-secondary' : 'bg-budget-under/10'}`}>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Net Spend</div>
          <div className={`font-display text-xl ${weekNetSpend < 0 ? 'text-budget-under' : 'text-foreground'}`}>
            {weekNetSpend < 0 ? '-' : ''}£{Math.abs(weekNetSpend).toFixed(2)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-blue-50 px-4 py-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Investments</div>
          <div className="font-display text-xl text-blue-600">£{weekTotalInvestments.toFixed(2)}</div>
        </div>
      </div>

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

      <div className="overflow-x-auto -mx-2 px-2 pb-2">
      <div className="grid grid-cols-7 gap-3" style={{ minWidth: '560px' }}>
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
