import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Unlock, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { BudgetData, getAllCategories, getCategoryColor, getCategoryEmoji } from '@/lib/budget-types';
import { saveBudgetPlan } from '@/lib/budget-store';
import { getWeeklyBudget } from '@/lib/date-utils';

interface Props {
  data: BudgetData;
  onDataChange: (d: BudgetData) => void;
}

export function SetupView({ data, onDataChange }: Props) {
  const plan = data.budgetPlan ?? null;
  const spendCats = useMemo(() => getAllCategories(data.customCategories, 'spend'), [data.customCategories]);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Initialise from the saved plan only once per plan id, so typing is never wiped
  // by background refreshes (realtime sync, category loads, etc.).
  const initedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = plan?.id ?? 'new';
    if (initedFor.current === key) return;
    initedFor.current = key;
    const init: Record<string, string> = {};
    spendCats.forEach(c => {
      const v = plan?.categories?.[c];
      init[c] = v ? String(v) : '';
    });
    setAmounts(init);
    const today = new Date();
    setStartDate(plan?.startDate ?? `${today.getFullYear()}-01-01`);
    setEndDate(plan?.endDate ?? `${today.getFullYear()}-12-31`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, spendCats.length]);

  const locked = !!plan?.locked;

  const monthlyTotal = Object.values(amounts).reduce((s, v) => {
    const n = parseFloat(v);
    return Number.isNaN(n) ? s : s + n;
  }, 0);

  const buildCategories = () => {
    const out: Record<string, number> = {};
    Object.entries(amounts).forEach(([cat, raw]) => {
      const n = parseFloat(raw);
      if (!Number.isNaN(n) && n > 0) out[cat] = n;
    });
    return out;
  };

  const persist = async (lockedFlag: boolean) => {
    if (!startDate || !endDate) { toast('Please set a start and end date'); return; }
    if (endDate < startDate) { toast('End date must be after the start date'); return; }
    const cats = buildCategories();
    if (lockedFlag && Object.keys(cats).length === 0) {
      toast('Add at least one category budget before locking');
      return;
    }
    setSaving(true);
    const latest = await saveBudgetPlan({
      id: plan?.id,
      startDate,
      endDate,
      categories: cats,
      locked: lockedFlag,
    });
    setSaving(false);
    onDataChange(latest);
    toast(lockedFlag ? 'Budget locked in ✅' : 'Budget saved — unlocked for editing');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-normal text-3xl tracking-wide">Set Up</h2>
        <p className="text-base text-muted-foreground">
          Set a monthly budget for the categories that matter — you can leave the rest blank.
          We divide each one into a weekly budget (monthly × 12 ÷ 52) and track your weekly
          progress against it.
        </p>
      </div>

      {/* Date range */}
      <div className="bg-card rounded-2xl border border-border p-5 mcm-shadow">
        <h3 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
          <Target className="w-5 h-5" /> Budget period
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Start date</label>
            <Input type="date" value={startDate} disabled={locked} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">End date</label>
            <Input type="date" value={endDate} disabled={locked} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          These budgets apply to every week and month within this period.
        </p>
      </div>

      {/* Category budgets */}
      <div className="bg-card rounded-2xl border border-border p-5 mcm-shadow">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="font-display font-bold text-lg">Monthly budget by category</h3>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Monthly total</div>
            <div className="font-display text-2xl">£{monthlyTotal.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">≈ £{getWeeklyBudget(monthlyTotal).toFixed(2)} / week</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {spendCats.map(cat => {
            const monthly = parseFloat(amounts[cat] || '');
            return (
              <div key={cat} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                <span
                  className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                  style={{ background: `${getCategoryColor(cat, data.customCategories)}22` }}
                >
                  {getCategoryEmoji(cat, data.customCategories)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{cat}</div>
                  {!Number.isNaN(monthly) && monthly > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      £{getWeeklyBudget(monthly).toFixed(2)} / week
                    </div>
                  )}
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  disabled={locked}
                  value={amounts[cat] ?? ''}
                  onChange={e => setAmounts(p => ({ ...p, [cat]: e.target.value }))}
                  placeholder="—"
                  className="h-9 w-24 text-right"
                />
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          {locked && (
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
              className="rounded-xl bg-budget-under/15 text-budget-under px-4 py-2 text-sm font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4" /> Locked — applied from {plan?.startDate} to {plan?.endDate}
            </motion.div>
          )}
          {!locked ? (
            <>
              <Button onClick={() => persist(true)} disabled={saving} className="gap-2">
                <Lock className="w-4 h-4" /> Lock in these budgets
              </Button>
              <Button variant="outline" onClick={() => persist(false)} disabled={saving}>
                Save as draft
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="gap-2" onClick={() => persist(false)} disabled={saving}>
                <Unlock className="w-4 h-4" /> Unlock to edit
              </Button>
              <Button onClick={() => persist(true)} disabled={saving} className="gap-2">
                <Lock className="w-4 h-4" /> Save changes
              </Button>
            </>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Budgets show up as progress rings at the top of every weekly view — locked or draft.
        </p>
      </div>
    </div>
  );
}
