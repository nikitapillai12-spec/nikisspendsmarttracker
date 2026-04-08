import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { BudgetData, getAllCategories, getCategoryColor, CustomCategory } from '@/lib/budget-types';
import { getMonthsInRange } from '@/lib/date-utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Line, ComposedChart, Cell, Area,
} from 'recharts';
import { format } from 'date-fns';

interface MonthlyOverviewProps {
  data: BudgetData;
}

export function MonthlyOverview({ data }: MonthlyOverviewProps) {
  const months = useMemo(() => getMonthsInRange(data.entries), [data.entries]);
  const customCats = data.customCategories || [];
  const allCats = getAllCategories(customCats);

  const monthlyData = useMemo(() => {
    return months.map((month) => {
      const entries = data.entries.filter(e => e.date.startsWith(month));
      const byCategory: Record<string, number> = {};
      allCats.forEach(c => { byCategory[c] = 0; });
      entries.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
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
  }, [months, data, allCats]);

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

  // Cumulative net savings
  const cumulativeData = useMemo(() => {
    let running = 0;
    return budgetChartData.map(d => {
      running += d.diff;
      return { ...d, cumulative: running };
    });
  }, [budgetChartData]);

  const totalNetSavings = cumulativeData.length > 0 ? cumulativeData[cumulativeData.length - 1].cumulative : 0;

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

  const activeCategories = allCats.filter(c =>
    monthlyData.some(d => (d as any)[c] > 0)
  );

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

      {/* Stacked Bar + Line Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border p-6 shadow-sm"
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

      {/* Budget vs Actual Chart */}
      {budgetChartData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl border border-border p-6 shadow-sm"
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
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '13px' }}
                  formatter={(value: number, name: string) => [`£${value.toFixed(2)}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="spent" name="Spent" radius={[4, 4, 0, 0]}>
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

      {/* Cumulative Savings Chart */}
      {cumulativeData.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
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
