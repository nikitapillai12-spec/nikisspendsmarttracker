import { BudgetData, WEEKLY_RING_CATEGORIES, getCategoryEmoji } from '@/lib/budget-types';
import { getPlanCategoryBudget } from '@/lib/budget-store';
import { getWeeklyBudget } from '@/lib/date-utils';

interface Props {
  data: BudgetData;
  /** YYYY-MM-DD */
  weekStart: string;
  weekEnd: string;
}

function statusColor(pct: number): string {
  if (pct > 100) return 'hsl(var(--budget-over))';
  if (pct >= 80) return 'hsl(35, 90%, 48%)';
  return 'hsl(var(--budget-under))';
}

function Ring({
  label, emoji, spent, budget,
}: { label: string; emoji: string; spent: number; budget: number | null }) {
  if (budget === null) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-3 flex flex-col items-center text-center">
        <div className="w-[68px] h-[68px] rounded-full border-[7px] border-secondary flex flex-col items-center justify-center leading-none">
          <span className="text-base">{emoji}</span>
        </div>
        <div className="mt-1.5 text-[11px] font-semibold truncate w-full" title={label}>{label}</div>
        <div className="text-[11px] text-muted-foreground">£{spent.toFixed(0)} spent</div>
        <div className="text-[11px] text-muted-foreground">No budget set</div>
      </div>
    );
  }
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const clamped = Math.min(100, pct);
  const color = statusColor(pct);
  const r = 26;
  const c = 2 * Math.PI * r;
  const remaining = budget - spent;

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col items-center text-center mcm-shadow-sm">
      <div className="relative w-[68px] h-[68px]">
        <svg viewBox="0 0 68 68" className="w-full h-full -rotate-90">
          <circle cx="34" cy="34" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="7" />
          <circle
            cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c - (clamped / 100) * c}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-base">{emoji}</span>
          <span className="text-[11px] font-bold" style={{ color }}>{pct.toFixed(0)}%</span>
        </div>
      </div>
      <div className="mt-1.5 text-[11px] font-semibold truncate w-full" title={label}>{label}</div>
      <div className="text-[11px] text-muted-foreground">
        £{spent.toFixed(0)} of £{budget.toFixed(0)}
      </div>
      <div className="text-[11px] font-semibold" style={{ color }}>
        {remaining >= 0 ? `£${remaining.toFixed(2)} left` : `£${Math.abs(remaining).toFixed(2)} over`}
      </div>
    </div>
  );
}

export function BudgetRings({ data, weekStart, weekEnd }: Props) {
  const month = weekStart.slice(0, 7);

  const rings = WEEKLY_RING_CATEGORIES.map(cat => {
    const monthly = getPlanCategoryBudget(data, cat, month);
    const budget = monthly === null ? null : getWeeklyBudget(monthly);
    const spent = data.entries
      .filter(e => (e.type ?? 'spend') === 'spend' && e.category === cat && e.date >= weekStart && e.date <= weekEnd)
      .reduce((s, e) => s + e.amount, 0);
    return { cat, budget, spent };
  });

  const hasAnyBudget = rings.some(r => r.budget !== null);

  if (!hasAnyBudget) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
        No locked budget yet — set your monthly category budgets on the <strong>Set Up</strong> tab to see your
        weekly progress rings here.
      </div>
    );
  }

  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
        This week vs budget
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {rings.map(r => (
          <Ring
            key={r.cat}
            label={r.cat}
            emoji={getCategoryEmoji(r.cat, data.customCategories)}
            spent={r.spent}
            budget={r.budget}
          />
        ))}
      </div>
    </div>
  );
}
