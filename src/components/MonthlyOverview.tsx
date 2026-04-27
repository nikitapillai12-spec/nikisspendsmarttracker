import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { BudgetData, getAllCategories, getCategoryColor, getCategoryEmoji } from '@/lib/budget-types';
import { getMonthsInRange } from '@/lib/date-utils';
import { getEffectiveMonthlyBudget, getEffectiveCategoryBudget } from '@/lib/budget-store';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Line, ComposedChart, Cell, Area,
} from 'recharts';
import { format } from 'date-fns';

interface MonthlyOverviewProps {
  data: BudgetData;
}

interface CategoryInsight {
  category: string;
  spent: number;
  budget: number | null;
  diff: number | null; // budget - spent (positive = under)
}

interface MonthInsight {
  month: string;
  displayMonth: string;
  total: number;
  budget: number | null;
  diff: number | null;
  byCategory: Record<string, number>;
  categoryInsights: CategoryInsight[];
  worstOver: CategoryInsight | null;
  bestUnder: CategoryInsight | null;
}

export function MonthlyOverview({ data }: MonthlyOverviewProps) {
  const months = useMemo(() => getMonthsInRange(data.entries), [data.entries]);
  const customCats = data.customCategories || [];
  const allCats = getAllCategories(customCats);

  const monthlyData: MonthInsight[] = useMemo(() => {
    return months.map((month) => {
      const entries = data.entries.filter(e => e.date.startsWith(month));
      const byCategory: Record<string, number> = {};
      allCats.forEach(c => { byCategory[c] = 0; });
      entries.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
      const total = entries.reduce((s, e) => s + e.amount, 0);
      const budget = getEffectiveMonthlyBudget(data, month);
      const displayMonth = format(new Date(month + '-01'), 'MMM yy');

      const categoryInsights: CategoryInsight[] = allCats
        .map(cat => {
          const spent = byCategory[cat] || 0;
          const catBudget = getEffectiveCategoryBudget(data, cat, month);
          return {
            category: cat,
            spent,
            budget: catBudget,
            diff: catBudget !== null ? catBudget - spent : null,
          };
        })
        .filter(ci => ci.spent > 0 || ci.budget !== null);

      const withBudget = categoryInsights.filter(ci => ci.budget !== null);
      const worstOver = withBudget
        .filter(ci => (ci.diff as number) < 0)
        .sort((a, b) => (a.diff as number) - (b.diff as number))[0] || null;
      const bestUnder = withBudget
        .filter(ci => (ci.diff as number) >= 0)
        .sort((a, b) => (b.diff as number) - (a.diff as number))[0] || null;

      return {
        month,
        displayMonth,
        total,
        budget,
        diff: budget !== null ? budget - total : null,
        byCategory,
        categoryInsights,
        worstOver,
        bestUnder,
      };
    });
  }, [months, data, allCats]);

  // Data for the stacked-bar + spend trend (existing chart)
  const stackedData = useMemo(() => {
    return monthlyData.map(d => ({
      displayMonth: d.displayMonth,
      total: d.total,
      ...d.byCategory,
    }));
  }, [monthlyData]);

  // Data for new Budget vs Actual chart (includes months with a budget)
  const budgetChartData = useMemo(() => {
    return monthlyData
      .filter(d => d.budget !== null)
      .map(d => ({
        month: d.displayMonth,
        monthKey: d.month,
        spent: d.total,
        budget: d.budget as number,
        diff: d.diff as number,
        isOver: (d.diff as number) < 0,
      }));
  }, [monthlyData]);

  // Cumulative net savings
  const cumulativeData = useMemo(() => {
    let running = 0;
    return budgetChartData.map(d => {
      running += d.diff;
      return { ...d, cumulative: running };
    });
  }, [budgetChartData]);

  const totalNetSavings = cumulativeData.length > 0 ? cumulativeData[cumulativeData.length - 1].cumulative : 0;

  const insightByMonth = useMemo(() => {
    const m: Record<string, MonthInsight> = {};
    monthlyData.forEach(d => { m[d.month] = d; });
    return m;
  }, [monthlyData]);

  if (months.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <span className="text-6xl mb-4">📊</span>
        <h3 className="font-display font-bold text-xl mb-2">No data yet</h3>
        <p className="text-muted-foreground">Start logging your spending in the Weekly view to see time-series trends here.</p>
      </motion.div>
    );
  }

  const activeCategories = allCats.filter(c =>
    stackedData.some(d => (d as any)[c] > 0)
  );

  // Custom tooltip for Budget vs Actual chart with insights
  const BudgetTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;
    const insight = insightByMonth[row.monthKey];
    if (!insight) return null;
    const pct = insight.budget ? (insight.total / insight.budget) * 100 : 0;

    return (
      <div className="rounded-xl bg-popover text-popover-foreground border border-border shadow-xl p-3 text-xs max-w-xs">
        <div className="font-display font-bold text-sm mb-2">{row.month}</div>
        <div className="space-y-1.5 mb-2">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-semibold">£{insight.budget?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Spent</span>
            <span className="font-semibold">£{insight.total.toFixed(2)} ({pct.toFixed(0)}%)</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{row.isOver ? 'Over' : 'Under'}</span>
            <span className={`font-bold ${row.isOver ? 'text-budget-over' : 'text-budget-under'}`}>
              {row.isOver ? '🔴' : '🟢'} £{Math.abs(row.diff).toFixed(2)}
            </span>
          </div>
        </div>

        {(insight.worstOver || insight.bestUnder) && (
          <div className="border-t border-border pt-2 space-y-1">
            {insight.worstOver && (
              <div className="flex items-start gap-1.5">
                <span>🚨</span>
                <span>
                  <span className="text-muted-foreground">Most over:</span>{' '}
                  <span className="font-semibold">
                    {getCategoryEmoji(insight.worstOver.category, customCats)} {insight.worstOver.category}
                  </span>{' '}
                  <span className="text-budget-over font-semibold">
                    £{Math.abs(insight.worstOver.diff as number).toFixed(2)} over
                  </span>
                </span>
              </div>
            )}
            {insight.bestUnder && (
              <div className="flex items-start gap-1.5">
                <span>✨</span>
                <span>
                  <span className="text-muted-foreground">Biggest saving:</span>{' '}
                  <span className="font-semibold">
                    {getCategoryEmoji(insight.bestUnder.category, customCats)} {insight.bestUnder.category}
                  </span>{' '}
                  <span className="text-budget-under font-semibold">
                    £{(insight.bestUnder.diff as number).toFixed(2)} under
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        {insight.categoryInsights.filter(c => c.budget === null && c.spent > 0).length > 0 && (
          <div className="mt-2 pt-2 border-t border-border text-muted-foreground text-[10px]">
            Tip: set per-category budgets to see more insights.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Cumulative Net Savings Banner */}
      {cumulativeData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-6 text-center font-display ${
            totalNetSavings >= 0
              ? 'bg-budget-under/10 border-2 border-budget-under/30'
              : 'bg-budget-over/10 border-2 border-budget-over/30'
          }`}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            {totalNetSavings >= 0 ? (
              <TrendingUp className="w-6 h-6 text-budget-under" />
            ) : (
              <TrendingDown className="w-6 h-6 text-budget-over" />
            )}
            <span className="text-sm text-muted-foreground">Overall to Date</span>
          </div>
          <p className={`text-3xl font-bold ${totalNetSavings >= 0 ? 'text-budget-under' : 'text-budget-over'}`}>
            {totalNetSavings >= 0 ? '🎉' : '⚠️'} £{Math.abs(totalNetSavings).toFixed(2)}
          </p>
          <p className={`text-sm font-medium ${totalNetSavings >= 0 ? 'text-budget-under' : 'text-budget-over'}`}>
            {totalNetSavings >= 0 ? 'net savings' : 'net overspend'}
          </p>
        </motion.div>
      )}

      {/* Budget vs Actual with trendline + insights */}
      {budgetChartData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-6 shadow-sm"
        >
          <h3 className="font-display font-bold text-lg mb-1">Actual Spend vs Monthly Budget</h3>
          <p className="text-sm text-muted-foreground mb-4">Bars show actual spend, dashed line shows your monthly budget, solid line is your spend trend. Hover a bar for insights.</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={budgetChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `£${v}`} />
                <Tooltip content={<BudgetTooltip />} cursor={{ fill: 'hsl(var(--accent) / 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="spent" name="Actual spend" radius={[6, 6, 0, 0]}>
                  {budgetChartData.map((entry, index) => (
                    <Cell key={index} fill={entry.isOver ? 'hsl(var(--budget-over))' : 'hsl(var(--budget-under))'} />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="budget"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  dot={{ r: 4 }}
                  name="Monthly budget"
                />
                <Line
                  type="monotone"
                  dataKey="spent"
                  stroke="hsl(var(--accent))"
                  strokeWidth={3}
                  dot={{ r: 5, fill: 'hsl(var(--accent))' }}
                  name="Spend trend"
                  legendType="line"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {budgetChartData.map((d, i) => (
              <motion.div
                key={d.month}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-xl p-3 text-center font-display ${
                  d.isOver
                    ? 'bg-budget-over/10 text-budget-over'
                    : 'bg-budget-under/10 text-budget-under'
                }`}
              >
                <p className="text-xs opacity-75">{d.month}</p>
                <p className="font-bold text-lg">
                  {d.isOver ? '🔴' : '🟢'} £{Math.abs(d.diff).toFixed(2)}
                </p>
                <p className="text-xs">{d.isOver ? 'over' : 'under'}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Stacked Bar + Line Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl border border-border p-6 shadow-sm"
      >
        <h3 className="font-display font-bold text-lg mb-1">Monthly Spend Breakdown</h3>
        <p className="text-sm text-muted-foreground mb-4">Category composition with spend trend</p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={stackedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="displayMonth" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `£${v}`} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '13px' }}
                formatter={(value: number, name: string) => [`£${value.toFixed(2)}`, name]}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              {activeCategories.map((cat) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  stackId="spend"
                  fill={getCategoryColor(cat, customCats)}
                  radius={cat === activeCategories[activeCategories.length - 1] ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
              <Line
                type="monotone"
                dataKey="total"
                stroke="hsl(var(--foreground))"
                strokeWidth={2.5}
                dot={{ r: 5, fill: 'hsl(var(--foreground))' }}
                name="Total"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Cumulative Savings Chart */}
      {cumulativeData.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl border border-border p-6 shadow-sm"
        >
          <h3 className="font-display font-bold text-lg mb-1">Cumulative Savings Trend</h3>
          <p className="text-sm text-muted-foreground mb-4">Running total of savings vs overspend over time</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `£${v}`} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '13px' }}
                  formatter={(value: number) => [`£${value.toFixed(2)}`, 'Net Savings']}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  fill="hsl(var(--accent) / 0.2)"
                  stroke="hsl(var(--accent))"
                  strokeWidth={3}
                  dot={{ r: 6, fill: 'hsl(var(--accent))' }}
                  name="Cumulative"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}
    </div>
  );
}
