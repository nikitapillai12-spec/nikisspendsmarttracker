import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Target, Tag } from 'lucide-react';
import { DayBox } from './DayBox';
import { CategoryManager } from './CategoryManager';
import { BudgetData, Category, SpendEntry, getAllCategories, getCategoryEmoji, getCategoryColor } from '@/lib/budget-types';
import { getWeekStart, getWeekEnd, getWeekDays, formatDate, formatMonth, formatDisplayMonth, navigateWeek, getWeeklyBudget } from '@/lib/date-utils';
import { addEntry, updateEntry, deleteEntry, getMonthlyBudget, setMonthlyBudget, setCategoryBudget, deleteCategoryBudget, getEffectiveCategoryBudget } from '@/lib/budget-store';
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

  const weekEnd = getWeekEnd(weekStart);
  const days = getWeekDays(weekStart);
  const month = formatMonth(weekStart);
  const currentBudget = getMonthlyBudget(month);
  const weeklyBudget = currentBudget ? getWeeklyBudget(currentBudget) : null;
  const allCats = useMemo(() => getAllCategories(data.customCategories), [data.customCategories]);

  const weekEntries = useMemo(() => {
    const start = formatDate(weekStart);
    const end = formatDate(weekEnd);
    return data.entries.filter(e => e.date >= start && e.date <= end);
  }, [data.entries, weekStart, weekEnd]);

  const weekTotal = weekEntries.reduce((s, e) => s + e.amount, 0);
  const budgetDiff = weeklyBudget ? weeklyBudget - weekTotal : null;

  const handleAdd = useCallback((dateStr: string, amount: number, category: Category) => {
    const entry: SpendEntry = {
      id: crypto.randomUUID(),
      amount,
      category,
      date: dateStr,
      createdAt: Date.now(),
    };
    onDataChange(addEntry(entry));
  }, [onDataChange]);

  const handleUpdate = useCallback((id: string, amount: number, category: Category) => {
    onDataChange(updateEntry(id, { amount, category }));
  }, [onDataChange]);

  const handleDelete = useCallback((id: string) => {
    onDataChange(deleteEntry(id));
  }, [onDataChange]);

  const handleSetBudget = () => {
    const val = parseFloat(budgetInput);
    let latest = data;
    if (!Number.isNaN(val) && val > 0) {
      latest = setMonthlyBudget(month, val);
    }
    // Persist per-category budgets (effective from this month onward)
    Object.entries(catBudgetInputs).forEach(([cat, raw]) => {
      const trimmed = raw.trim();
      if (trimmed === '') {
        const existing = getEffectiveCategoryBudget(latest, cat, month);
        if (existing !== null) {
          // Only delete a budget specifically set at this month (don't wipe history)
          latest = deleteCategoryBudget(cat, month);
        }
        return;
      }
      const n = parseFloat(trimmed);
      if (!Number.isNaN(n) && n >= 0) {
        latest = setCategoryBudget(cat, month, n);
      }
    });
    onDataChange(latest);
    setBudgetDialogOpen(false);
    setBudgetInput('');
    setCatBudgetInputs({});
  };

  const openBudgetDialog = () => {
    setBudgetInput(currentBudget?.toString() || '');
    // Prefill with effective budgets for the current month
    const init: Record<string, string> = {};
    allCats.forEach(c => {
      const v = getEffectiveCategoryBudget(data, c, month);
      init[c] = v !== null ? v.toString() : '';
    });
    setCatBudgetInputs(init);
    setBudgetDialogOpen(true);
  };

  const totalCategoryBudgets = Object.values(catBudgetInputs).reduce((s, v) => {
    const n = parseFloat(v);
    return Number.isNaN(n) ? s : s + n;
  }, 0);

  const updateCatBudget = (cat: string, val: string) => {
    setCatBudgetInputs(prev => ({ ...prev, [cat]: val }));
  };

  return renderContent();

  function renderContent() {
    return (
      <div className="space-y-6">
      {/* Week Navigation & Budget */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => setWeekStart(navigateWeek(weekStart, 'prev'))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <h2 className="font-display font-bold text-lg">
              {formatDate(weekStart).slice(5)} – {formatDate(weekEnd).slice(5)}
            </h2>
            <p className="text-xs text-muted-foreground">{formatDisplayMonth(weekStart)}</p>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => setWeekStart(navigateWeek(weekStart, 'next'))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekStart(getWeekStart(new Date()))}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <motion.div
            key={weekTotal}
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="px-4 py-2 rounded-xl bg-secondary font-display"
          >
            <span className="text-xs text-muted-foreground">Week Total</span>
            <p className="font-bold text-lg">£{weekTotal.toFixed(2)}</p>
          </motion.div>

          {weeklyBudget !== null && budgetDiff !== null && (
            <motion.div
              key={budgetDiff}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className={`px-4 py-2 rounded-xl font-display ${
                budgetDiff >= 0
                  ? 'bg-budget-under/10 text-budget-under'
                  : 'bg-budget-over/10 text-budget-over'
              }`}
            >
              <span className="text-xs opacity-75">
                Budget: £{weeklyBudget.toFixed(2)}/wk
              </span>
              <p className="font-bold text-lg">
                {budgetDiff >= 0 ? '✅' : '🔴'} £{Math.abs(budgetDiff).toFixed(2)} {budgetDiff >= 0 ? 'under' : 'over'}
              </p>
            </motion.div>
          )}

          <Dialog open={budgetDialogOpen} onOpenChange={(v) => { if (v) { openBudgetDialog(); } else { setBudgetDialogOpen(false); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full">
                <Target className="w-4 h-4" />
                {currentBudget ? 'Edit Budget' : 'Set Budget'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Budgets for {formatDisplayMonth(weekStart)}</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground -mt-1">Changes apply from this month forward. Earlier months keep their existing budgets.</p>
              <div className="space-y-5 pt-3">
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

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium flex items-center gap-1.5"><Tag className="w-4 h-4" /> Per-category budgets (optional)</label>
                    <span className="text-xs text-muted-foreground">Sum: £{totalCategoryBudgets.toFixed(2)}</span>
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

                <Button className="w-full" onClick={handleSetBudget}>
                  Save Budgets
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <CategoryManager data={data} onDataChange={onDataChange} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {days.map((day, i) => {
          const dateStr = formatDate(day);
          const dayEntries = data.entries.filter(e => e.date === dateStr);
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
                onAdd={(amount, category) => handleAdd(dateStr, amount, category)}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
    );
  }
}

// Legacy render kept below (unused) to preserve diff safety — removed.
function _unused() {
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _legacy = () => {
  return null as any;
  // original JSX removed below
  // @ts-ignore
  return (
    <>
    </>
  );
};

/* legacy
  return (
    <div className="space-y-6">
      {/* Week Navigation & Budget */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => setWeekStart(navigateWeek(weekStart, 'prev'))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <h2 className="font-display font-bold text-lg">
              {formatDate(weekStart).slice(5)} – {formatDate(weekEnd).slice(5)}
            </h2>
            <p className="text-xs text-muted-foreground">{formatDisplayMonth(weekStart)}</p>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => setWeekStart(navigateWeek(weekStart, 'next'))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekStart(getWeekStart(new Date()))}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
*/
    }
  };

  return (
    <div className="space-y-6">
      {/* Week Navigation & Budget */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => setWeekStart(navigateWeek(weekStart, 'prev'))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <h2 className="font-display font-bold text-lg">
              {formatDate(weekStart).slice(5)} – {formatDate(weekEnd).slice(5)}
            </h2>
            <p className="text-xs text-muted-foreground">{formatDisplayMonth(weekStart)}</p>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => setWeekStart(navigateWeek(weekStart, 'next'))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekStart(getWeekStart(new Date()))}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Week Total */}
          <motion.div
            key={weekTotal}
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="px-4 py-2 rounded-xl bg-secondary font-display"
          >
            <span className="text-xs text-muted-foreground">Week Total</span>
            <p className="font-bold text-lg">£{weekTotal.toFixed(2)}</p>
          </motion.div>

          {/* Budget Status */}
          {weeklyBudget !== null && budgetDiff !== null && (
            <motion.div
              key={budgetDiff}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className={`px-4 py-2 rounded-xl font-display ${
                budgetDiff >= 0
                  ? 'bg-budget-under/10 text-budget-under'
                  : 'bg-budget-over/10 text-budget-over'
              }`}
            >
              <span className="text-xs opacity-75">
                Budget: £{weeklyBudget.toFixed(2)}/wk
              </span>
              <p className="font-bold text-lg">
                {budgetDiff >= 0 ? '✅' : '🔴'} £{Math.abs(budgetDiff).toFixed(2)} {budgetDiff >= 0 ? 'under' : 'over'}
              </p>
            </motion.div>
          )}

          {/* Set Budget */}
          <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => setBudgetInput(currentBudget?.toString() || '')}>
                <Target className="w-4 h-4" />
                {currentBudget ? 'Edit Budget' : 'Set Budget'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-display">Monthly Budget for {formatDisplayMonth(weekStart)}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Monthly budget (£)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    placeholder="e.g. 2000"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleSetBudget()}
                  />
                  {budgetInput && parseFloat(budgetInput) > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ≈ £{getWeeklyBudget(parseFloat(budgetInput)).toFixed(2)} per week
                    </p>
                  )}
                </div>
                <Button className="w-full" onClick={handleSetBudget}>
                  Save Budget
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <CategoryManager data={data} onDataChange={onDataChange} />
        </div>
      </div>

      {/* Day Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {days.map((day, i) => {
          const dateStr = formatDate(day);
          const dayEntries = data.entries.filter(e => e.date === dateStr);
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
                onAdd={(amount, category) => handleAdd(dateStr, amount, category)}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
