import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BudgetData, CATEGORIES, Category, CATEGORY_COLORS, CATEGORY_EMOJI } from '@/lib/budget-types';
import { getMonthsInRange, formatDisplayMonth, getWeeklyBudget } from '@/lib/date-utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Line, ComposedChart, ReferenceLine, Cell,
} from 'recharts';
import { format } from 'date-fns';

interface MonthlyOverviewProps {
  data: BudgetData;
}

export function MonthlyOverview({ data }: MonthlyOverviewProps) {
  const months = useMemo(() => getMonthsInRange(data.entries), [data.entries]);

  const monthlyData = useMemo(() => {
    return months.map((month) => {
      const entries = data.entries.filter(e => e.date.startsWith(month));
      const byCategory: Record<string, number> = {};
      CATEGORIES.forEach(c => { byCategory[c] = 0; });
      entries.forEach(e => { byCategory[e.category] += e.amount; });
      const total = entries.reduce((s, e) => s + e.amount, 0);
      const budget = data.monthlyBudgets.find(b => b.month === month);
      const displayMonth = format(new Date(month + '-01'), 'MMM yy');

      return {
        month,
        displayMonth,
        ...byCategory,
        total,
        budget: budget?.amount || null,
        diff: budget ? budget.amount - total : null,
      };
    });
  }, [months, data]);

  const budgetChartData = useMemo(() => {
    return monthlyData
      .filter(d => d.budget !== null)
      .map(d => ({
        month: d.displayMonth,
        spent: d.total,
        budget: d.budget,
        diff: d.diff!,
        isOver: d.diff! < 0,
      }));
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
        <p className="text-muted-foreground">Start logging your spending in the Weekly view to see monthly trends here.</p>
      </motion.div>
    );
  }

  // active categories only
  const activeCategories = CATEGORIES.filter(c =>
    monthlyData.some(d => (d as any)[c] > 0)
  );

  return (
    <div className="space-y-8">
      {/* Stacked Bar + Line Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border border-border p-6"
      >
        <h3 className="font-display font-bold text-lg mb-1">Monthly Spend Breakdown</h3>
        <p className="text-sm text-muted-foreground mb-4">Category composition with spend trend</p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="displayMonth" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `£${v}`} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  fontSize: '13px',
                }}
                formatter={(value: number, name: string) => [`£${value.toFixed(2)}`, name]}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              {activeCategories.map((cat) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  stackId="spend"
                  fill={CATEGORY_COLORS[cat]}
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

      {/* Budget vs Actual Chart */}
      {budgetChartData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-xl border border-border p-6"
        >
          <h3 className="font-display font-bold text-lg mb-1">Budget vs Actual</h3>
          <p className="text-sm text-muted-foreground mb-4">Are you staying on track?</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={budgetChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `£${v}`} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    fontSize: '13px',
                  }}
                  formatter={(value: number, name: string) => [`£${value.toFixed(2)}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="spent" name="Spent" radius={[4, 4, 0, 0]}>
                  {budgetChartData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.isOver ? 'hsl(var(--budget-over))' : 'hsl(var(--budget-under))'}
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="budget"
                  stroke="hsl(var(--foreground))"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  dot={{ r: 4 }}
                  name="Budget"
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
                transition={{ delay: i * 0.1 }}
                className={`rounded-lg p-3 text-center font-display ${
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
    </div>
  );
}
