import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import { BudgetData, getAllCategories, getCategoryColor, getCategoryEmoji, signedAmount } from '@/lib/budget-types';
import { getMonthsInRange } from '@/lib/date-utils';
import { getEffectiveMonthlyBudget, getEffectiveCategoryBudget } from '@/lib/budget-store';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Line, ComposedChart, Cell, Area, LabelList, ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

interface MonthlyOverviewProps {
  data: BudgetData;
}

interface CategoryInsight {
  category: string;
  spent: number;
  budget: number | null;
  diff: number | null;
}

interface MonthInsight {
  month: string;
  displayMonth: string;
  total: number;
  totalSpend: number;
  totalCredits: number;
  totalInvestments: number;
  netSpend: number;
  budget: number | null;
  diff: number | null;
  byCategory: Record<string, number>;
  categoryInsights: CategoryInsight[];
  worstOver: CategoryInsight | null;
  bestUnder: CategoryInsight | null;
  topRetailersByCategory: Record<string, { note: string; total: number }[]>;
  topRetailersOverall: { note: string; total: number }[];
  momChanges: Record<string, number>; // category → % change vs prev month
}

// AI-style suggestions based on top categories
function generateSuggestions(insight: MonthInsight, prevInsight: MonthInsight | null): string[] {
  const suggestions: string[] = [];
  const cats = Object.entries(insight.byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (cats.length === 0) return suggestions;

  const [topCat, topAmt] = cats[0];
  suggestions.push(`${topCat} is your biggest category at £${topAmt.toFixed(0)} — consider setting a monthly budget limit for it.`);

  if (prevInsight) {
    const biggestIncrease = Object.entries(insight.byCategory)
      .filter(([c]) => insight.byCategory[c] > 0)
      .map(([c]) => ({ cat: c, pct: prevInsight.byCategory[c] > 0 ? ((insight.byCategory[c] - prevInsight.byCategory[c]) / prevInsight.byCategory[c]) * 100 : 100 }))
      .sort((a, b) => b.pct - a.pct)[0];
    if (biggestIncrease && biggestIncrease.pct > 10) {
      suggestions.push(`${biggestIncrease.cat} rose ${biggestIncrease.pct.toFixed(0)}% vs last month — worth reviewing.`);
    }
  }

  if (insight.byCategory['Eating Out'] > 0 && insight.byCategory['Groceries'] > 0) {
    const ratio = insight.byCategory['Eating Out'] / insight.byCategory['Groceries'];
    if (ratio > 0.6) suggestions.push(`You're spending a lot on Eating Out relative to Groceries — cooking more at home could save £${(insight.byCategory['Eating Out'] * 0.3).toFixed(0)}/mo.`);
  }

  if (suggestions.length < 3 && insight.byCategory['Subscriptions'] > 0) {
    suggestions.push(`Review your Subscriptions (£${insight.byCategory['Subscriptions'].toFixed(0)}) — cancel anything you haven't used this month.`);
  }

  return suggestions.slice(0, 3);
}

export function MonthlyOverview({ data }: MonthlyOverviewProps) {
  const months = useMemo(() => getMonthsInRange(data.entries), [data.entries]);
  const customCats = data.customCategories || [];
  const allCats = getAllCategories(customCats);
  const [drillMonth, setDrillMonth] = useState<string | null>(null);

  const monthlyData: MonthInsight[] = useMemo(() => {
    return months.map((month, idx) => {
      const entries = data.entries.filter(e => e.date.startsWith(month));
      const spendOnly = entries.filter(e => (e.type ?? 'spend') === 'spend');
      const creditOnly = entries.filter(e => e.type === 'credit');
      const investOnly = entries.filter(e => e.type === 'investment');

      const byCategory: Record<string, number> = {};
      allCats.forEach(c => { byCategory[c] = 0; });
      spendOnly.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });

      const totalSpend = spendOnly.reduce((s, e) => s + e.amount, 0);
      const totalCredits = creditOnly.reduce((s, e) => s + e.amount, 0);
      const totalInvestments = investOnly.reduce((s, e) => s + e.amount, 0);
      const netSpend = totalSpend - totalCredits;
      const total = entries.reduce((s, e) => s + signedAmount(e), 0);
      const budget = getEffectiveMonthlyBudget(data, month);
      const displayMonth = format(new Date(month + '-01'), 'MMM yy');

      const categoryInsights: CategoryInsight[] = allCats
        .map(cat => {
          const spent = byCategory[cat] || 0;
          const catBudget = getEffectiveCategoryBudget(data, cat, month);
          return { category: cat, spent, budget: catBudget, diff: catBudget !== null ? catBudget - spent : null };
        })
        .filter(ci => ci.spent > 0 || ci.budget !== null);

      const withBudget = categoryInsights.filter(ci => ci.budget !== null);
      const worstOver = withBudget.filter(ci => (ci.diff as number) < 0).sort((a, b) => (a.diff as number) - (b.diff as number))[0] || null;
      const bestUnder = withBudget.filter(ci => (ci.diff as number) >= 0).sort((a, b) => (b.diff as number) - (a.diff as number))[0] || null;

      const topRetailersByCategory: Record<string, { note: string; total: number }[]> = {};
      const overallByRetailer: Record<string, number> = {};
      allCats.forEach(cat => {
        const byRetailer: Record<string, number> = {};
        spendOnly.filter(e => e.category === cat && e.note && e.note.trim()).forEach(e => {
          const key = (e.note as string).trim();
          byRetailer[key] = (byRetailer[key] || 0) + e.amount;
          overallByRetailer[key] = (overallByRetailer[key] || 0) + e.amount;
        });
        const sorted = Object.entries(byRetailer).map(([note, total]) => ({ note, total })).sort((a, b) => b.total - a.total);
        if (sorted.length) topRetailersByCategory[cat] = sorted;
      });
      const topRetailersOverall = Object.entries(overallByRetailer).map(([note, total]) => ({ note, total })).sort((a, b) => b.total - a.total).slice(0, 5);

      return {
        month, displayMonth, total, totalSpend, totalCredits, totalInvestments, netSpend,
        budget, diff: budget !== null ? budget - total : null,
        byCategory, categoryInsights, worstOver, bestUnder,
        topRetailersByCategory, topRetailersOverall,
        momChanges: {},
      };
    });
  }, [months, data, allCats]);

  const stackedData = useMemo(() => {
    return monthlyData.map(d => ({
      displayMonth: d.displayMonth,
      monthKey: d.month,
      netSpend: d.netSpend,
      total: d.total,
      ...d.byCategory,
    }));
  }, [monthlyData]);

  // Four-bar chart data (Item 4 Chart 2)
  const fourBarData = useMemo(() => {
    return monthlyData.map(d => ({
      month: d.displayMonth,
      monthKey: d.month,
      'Total Spend': d.totalSpend,
      'Total Credits': d.totalCredits,
      'Net Spend': Math.max(0, d.netSpend),
      'Investments': d.totalInvestments,
    }));
  }, [monthlyData]);

  const budgetChartData = useMemo(() => {
    return monthlyData.filter(d => d.budget !== null).map(d => ({
      month: d.displayMonth,
      monthKey: d.month,
      spent: d.total,
      budget: d.budget as number,
      diff: d.diff as number,
      isOver: (d.diff as number) < 0,
    }));
  }, [monthlyData]);

  const cumulativeData = useMemo(() => {
    let running = 0;
    return budgetChartData.map(d => { running += d.diff; return { ...d, cumulative: running }; });
  }, [budgetChartData]);

  const totalNetSavings = cumulativeData.length > 0 ? cumulativeData[cumulativeData.length - 1].cumulative : 0;

  const insightByMonth = useMemo(() => {
    const m: Record<string, MonthInsight> = {};
    monthlyData.forEach(d => { m[d.month] = d; });
    return m;
  }, [monthlyData]);

  if (months.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-6xl mb-4">📊</span>
        <h3 className="font-display font-bold text-xl mb-2">No data yet</h3>
        <p className="text-muted-foreground">Start logging your spending in the Weekly view to see time-series trends here.</p>
      </motion.div>
    );
  }

  const activeCategories = allCats.filter(c => stackedData.some(d => (d as any)[c] > 0));

  const BudgetTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;
    const insight = insightByMonth[row.monthKey];
    if (!insight) return null;
    const pct = insight.budget ? (insight.total / insight.budget) * 100 : 0;
    const prevIdx = monthlyData.findIndex(d => d.month === row.monthKey) - 1;
    const prevInsight = prevIdx >= 0 ? monthlyData[prevIdx] : null;
    const suggestions = generateSuggestions(insight, prevInsight);

    return (
      <div className="rounded-xl bg-popover text-popover-foreground border border-border shadow-xl p-3 text-xs max-w-xs">
        <div className="font-display font-bold text-sm mb-2">{row.month}</div>
        <div className="space-y-1.5 mb-2">
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Budget</span><span className="font-semibold">£{insight.budget?.toFixed(2)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">Spent</span><span className="font-semibold">£{insight.total.toFixed(2)} ({pct.toFixed(0)}%)</span></div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{row.isOver ? 'Over' : 'Under'}</span>
            <span className={`font-bold ${row.isOver ? 'text-budget-over' : 'text-budget-under'}`}>{row.isOver ? '🔴' : '🟢'} £{Math.abs(row.diff).toFixed(2)}</span>
          </div>
        </div>
        {(insight.worstOver || insight.bestUnder) && (
          <div className="border-t border-border pt-2 space-y-1">
            {insight.worstOver && (
              <div className="flex items-start gap-1.5">
                <span>🚨</span>
                <span><span className="text-muted-foreground">Most over:</span> <span className="font-semibold">{getCategoryEmoji(insight.worstOver.category, customCats)} {insight.worstOver.category}</span> <span className="text-budget-over font-semibold">£{Math.abs(insight.worstOver.diff as number).toFixed(2)} over</span></span>
              </div>
            )}
            {insight.bestUnder && (
              <div className="flex items-start gap-1.5">
                <span>✨</span>
                <span><span className="text-muted-foreground">Biggest saving:</span> <span className="font-semibold">{getCategoryEmoji(insight.bestUnder.category, customCats)} {insight.bestUnder.category}</span> <span className="text-budget-under font-semibold">£{(insight.bestUnder.diff as number).toFixed(2)} under</span></span>
              </div>
            )}
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="border-t border-border pt-2 mt-2 space-y-1">
            <div className="font-semibold text-muted-foreground mb-1">💡 Suggestions for next month</div>
            {suggestions.map((s, i) => <div key={i} className="text-muted-foreground">• {s}</div>)}
          </div>
        )}
      </div>
    );
  };

  const StackedTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const monthKey = payload[0]?.payload?.monthKey;
    const insight = monthKey ? insightByMonth[monthKey] : null;
    if (!insight) return null;
    const cats = Object.entries(insight.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    return (
      <div className="rounded-xl bg-popover text-popover-foreground border border-border shadow-xl p-3 text-xs max-w-xs">
        <div className="font-display font-bold text-sm mb-1">{insight.displayMonth}</div>
        <div className="mb-2 text-muted-foreground">Net Spend: <span className="font-bold text-foreground">£{insight.netSpend.toFixed(2)}</span></div>
        <div className="space-y-2">
          {cats.map(([cat, amt]) => {
            const tops = insight.topRetailersByCategory[cat] || [];
            return (
              <div key={cat}>
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{getCategoryEmoji(cat, customCats)} {cat}</span>
                  <span className="font-semibold" style={{ color: getCategoryColor(cat, customCats) }}>£{(amt as number).toFixed(2)}</span>
                </div>
                {tops.length > 0 && (
                  <ol className="ml-5 mt-0.5 text-[10px] text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                    {tops.slice(0, 5).map((r) => (
                      <li key={r.note} className="flex justify-between gap-2"><span className="truncate">• {r.note}</span><span>£{r.total.toFixed(2)}</span></li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const FourBarTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0]?.payload;
    return (
      <div className="rounded-xl bg-popover text-popover-foreground border border-border shadow-xl p-3 text-xs max-w-[200px]">
        <div className="font-display font-bold text-sm mb-2">{row.month}</div>
        {payload.map((p: any) => (
          <div key={p.name} className="flex justify-between gap-3 mb-1">
            <span style={{ color: p.fill }}>{p.name}</span>
            <span className="font-semibold">£{p.value.toFixed(2)}</span>
          </div>
        ))}
      </div>
    );
  };

  // Drill-down view for a single month
  const drillInsight = drillMonth ? insightByMonth[drillMonth] : null;
  const drillBarData = drillInsight ? [
    { name: 'Total Spend', value: drillInsight.totalSpend, fill: 'hsl(var(--budget-over))' },
    { name: 'Total Credits', value: drillInsight.totalCredits, fill: 'hsl(var(--budget-under))' },
    { name: 'Net Spend', value: Math.max(0, drillInsight.netSpend), fill: 'hsl(var(--primary))' },
    { name: 'Investments', value: drillInsight.totalInvestments, fill: 'hsl(210, 60%, 45%)' },
  ] : [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="font-display font-normal text-3xl tracking-wide">Time Series</h2>
        <p className="text-base text-muted-foreground">Monthly trends, budget performance and category breakdown.</p>
      </div>

      {/* Cumulative Net Savings Banner */}
      {cumulativeData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-6 text-center font-display border border-border mcm-shadow ${totalNetSavings >= 0 ? 'bg-budget-under/15' : 'bg-budget-over/15'}`}>
          <div className="flex items-center justify-center gap-2 mb-1">
            {totalNetSavings >= 0 ? <TrendingUp className="w-6 h-6 text-budget-under" /> : <TrendingDown className="w-6 h-6 text-budget-over" />}
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

      {/* CHART 1 — Monthly Net Spend Stacked Bar by Category */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="bg-card rounded-2xl border border-border p-6 mcm-shadow">
        <h3 className="font-display font-bold text-lg mb-1">Monthly Net Spend by Category</h3>
        <p className="text-sm text-muted-foreground mb-4">Stacked by category. Hover for breakdown + suggestions.</p>
        {stackedData.length > 0 && (
          <div className="overflow-x-auto -mx-2"><div className="h-80" style={{minWidth:320}}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stackedData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="displayMonth" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `£${v}`} />
                <Tooltip content={<StackedTooltip />} cursor={{ fill: 'hsl(var(--accent) / 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
                {activeCategories.map((cat) => (
                  <Bar key={cat} dataKey={cat} stackId="spend" fill={getCategoryColor(cat, customCats)} maxBarSize={120}
                    radius={cat === activeCategories[activeCategories.length - 1] ? [4, 4, 0, 0] : [0, 0, 0, 0]}>
                    {cat === activeCategories[activeCategories.length - 1] && (
                      <LabelList
                        dataKey="netSpend"
                        position="top"
                        formatter={(v: number) => `£${v.toFixed(0)}`}
                        style={{ fontSize: '11px', fontWeight: 700, fill: 'hsl(var(--foreground))' }}
                      />
                    )}
                  </Bar>
                ))}
                <Line type="monotone" dataKey="netSpend" stroke="hsl(var(--foreground))" strokeWidth={2.5}
                  dot={{ r: 5, fill: 'hsl(var(--foreground))' }} name="Net Spend trend" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          </div>{/* end overflow-x-auto */}
        )}
      </motion.div>

      {/* CHART 2 — Four-Bar Monthly Breakdown with Trendline */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl border border-border p-6 mcm-shadow">
        <h3 className="font-display font-bold text-lg mb-1">Monthly Breakdown — Spend / Credits / Net / Investments</h3>
        <p className="text-sm text-muted-foreground mb-4">Click any bar or label to drill into that month.</p>
        {fourBarData.length > 0 && (
          <div className="overflow-x-auto -mx-2"><div className="h-80" style={{minWidth:320}}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={fourBarData} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `£${v}`} />
                <Tooltip content={<FourBarTooltip />} cursor={{ fill: 'hsl(var(--accent) / 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Total Spend" fill="hsl(var(--budget-over))" radius={[4, 4, 0, 0]} onClick={(d) => setDrillMonth(d.monthKey)}>
                  <LabelList dataKey="Total Spend" position="top" formatter={(v: number) => `£${v.toFixed(0)}`} style={{ fontSize: '10px', fill: 'hsl(var(--foreground))', cursor: 'pointer' }} />
                </Bar>
                <Bar dataKey="Total Credits" fill="hsl(var(--budget-under))" radius={[4, 4, 0, 0]} onClick={(d) => setDrillMonth(d.monthKey)}>
                  <LabelList dataKey="Total Credits" position="top" formatter={(v: number) => `£${v.toFixed(0)}`} style={{ fontSize: '10px', fill: 'hsl(var(--foreground))', cursor: 'pointer' }} />
                </Bar>
                <Bar dataKey="Net Spend" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} onClick={(d) => setDrillMonth(d.monthKey)}>
                  <LabelList dataKey="Net Spend" position="top" formatter={(v: number) => `£${v.toFixed(0)}`} style={{ fontSize: '10px', fill: 'hsl(var(--foreground))', cursor: 'pointer' }} />
                </Bar>
                <Bar dataKey="Investments" fill="hsl(210, 60%, 45%)" radius={[4, 4, 0, 0]} onClick={(d) => setDrillMonth(d.monthKey)}>
                  <LabelList dataKey="Investments" position="top" formatter={(v: number) => `£${v.toFixed(0)}`} style={{ fontSize: '10px', fill: 'hsl(var(--foreground))', cursor: 'pointer' }} />
                </Bar>
                <Line type="monotone" dataKey="Net Spend" stroke="hsl(var(--accent))" strokeWidth={2.5}
                  dot={{ r: 5, fill: 'hsl(var(--accent))' }} name="Net trend" legendType="line" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          </div>{/* end overflow-x-auto */}
        )}
      </motion.div>

      {/* Drill-down Modal */}
      <AnimatePresence>
        {drillInsight && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setDrillMonth(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card rounded-2xl border border-border p-6 mcm-shadow max-w-xl w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-2xl">{drillInsight.displayMonth} — Detail</h3>
                <Button variant="ghost" size="icon" onClick={() => setDrillMonth(null)}><X className="w-5 h-5" /></Button>
              </div>
              <div className="overflow-x-auto -mx-2 mb-6"><div className="h-64" style={{minWidth:320}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={drillBarData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `£${v}`} />
                    <Tooltip formatter={(v: number) => [`£${v.toFixed(2)}`]} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {drillBarData.map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                      <LabelList dataKey="value" position="top" formatter={(v: number) => `£${v.toFixed(2)}`} style={{ fontSize: '11px', fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div></div>{/* end overflow-x-auto drill chart */}
              <div className="grid grid-cols-2 gap-3">
                {drillBarData.map(d => (
                  <div key={d.name} className="rounded-xl border border-border p-3 text-center">
                    <div className="text-xs text-muted-foreground mb-1">{d.name}</div>
                    <div className="font-display text-xl" style={{ color: d.fill }}>£{d.value.toFixed(2)}</div>
                  </div>
                ))}
              </div>
              {drillInsight.topRetailersOverall.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <div className="text-sm font-semibold mb-2">🏷️ Top retailers</div>
                  {drillInsight.topRetailersOverall.map((r, i) => (
                    <div key={r.note} className="flex justify-between text-sm py-1 border-b border-border/50">
                      <span>{i + 1}. {r.note}</span>
                      <span className="font-semibold">£{r.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Budget vs Actual */}
      {budgetChartData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card rounded-2xl border border-border p-6 mcm-shadow">
          <h3 className="font-display font-bold text-lg mb-1">Actual Spend vs Monthly Budget</h3>
          <p className="text-sm text-muted-foreground mb-4">Bars show actual spend, dashed line = budget, solid line = trend. Hover for insights + suggestions.</p>
          <div className="overflow-x-auto -mx-2"><div className="h-80" style={{minWidth:320}}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={budgetChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `£${v}`} />
                <Tooltip content={<BudgetTooltip />} cursor={{ fill: 'hsl(var(--accent) / 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: '13px' }} />
                <Bar dataKey="spent" name="Actual spend" radius={[6, 6, 0, 0]}>
                  {budgetChartData.map((entry, index) => (
                    <Cell key={index} fill={entry.isOver ? 'hsl(var(--budget-over))' : 'hsl(var(--budget-under))'} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="budget" stroke="hsl(var(--foreground))" strokeWidth={2} strokeDasharray="8 4" dot={{ r: 4 }} name="Monthly budget" />
                <Line type="monotone" dataKey="spent" stroke="hsl(var(--accent))" strokeWidth={3} dot={{ r: 5, fill: 'hsl(var(--accent))' }} name="Spend trend" legendType="line" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          </div>{/* end overflow-x-auto */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {budgetChartData.map((d, i) => (
              <motion.div key={d.month} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                className={`rounded-xl p-3 text-center font-display border border-border mcm-shadow-sm ${d.isOver ? 'bg-budget-over/15 text-budget-over' : 'bg-budget-under/15 text-budget-under'}`}>
                <p className="text-xs opacity-75">{d.month}</p>
                <p className="font-bold text-lg">{d.isOver ? '🔴' : '🟢'} £{Math.abs(d.diff).toFixed(2)}</p>
                <p className="text-xs">{d.isOver ? 'over' : 'under'}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Cumulative Savings Chart */}
      {cumulativeData.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl border border-border p-6 mcm-shadow">
          <h3 className="font-display font-bold text-lg mb-1">Cumulative Savings Trend</h3>
          <p className="text-sm text-muted-foreground mb-4">Running total of savings vs overspend over time</p>
          <div className="overflow-x-auto -mx-2"><div className="h-64" style={{minWidth:320}}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `£${v}`} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '13px' }} formatter={(value: number) => [`£${value.toFixed(2)}`, 'Net Savings']} />
                <Area type="monotone" dataKey="cumulative" fill="hsl(var(--accent) / 0.2)" stroke="hsl(var(--accent))" strokeWidth={3} dot={{ r: 6, fill: 'hsl(var(--accent))' }} name="Cumulative" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          </div>{/* end overflow-x-auto */}
        </motion.div>
      )}

      {/* Vacations Budget Chart */}
      <VacationsChart data={data} />
    </div>
  );
}

const VACATION_CATS = ['Flights', 'Travel Spend'];

function VacationsChart({ data }: { data: BudgetData }) {
  const thisYear = new Date().getFullYear();

  const annualBudget = (data.annualBudgets || []).find(b => b.year === thisYear && b.label === 'Vacations');
  if (!annualBudget) return null;

  const budget = annualBudget.amount;
  const cats = annualBudget.categories.length > 0 ? annualBudget.categories : VACATION_CATS;

  // Build cumulative spend by month for the year
  const yearMonths: string[] = [];
  for (let m = 1; m <= 12; m++) {
    yearMonths.push(`${thisYear}-${String(m).padStart(2, '0')}`);
  }

  let running = 0;
  const chartData = yearMonths.map(month => {
    const monthSpend = data.entries
      .filter(e => e.date.startsWith(month) && (e.type ?? 'spend') === 'spend' && cats.includes(e.category))
      .reduce((s, e) => s + e.amount, 0);
    running += monthSpend;
    return {
      month: format(new Date(month + '-01'), 'MMM'),
      monthSpend,
      cumulative: running,
      budget,
      remaining: Math.max(0, budget - running),
    };
  });

  // Only show months up to the latest one with data (or current month)
  const currentMonth = `${thisYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const visibleData = chartData.filter((_, i) => yearMonths[i] <= currentMonth);

  const totalSpent = running;
  const pct = budget > 0 ? Math.min(100, (totalSpent / budget) * 100) : 0;
  const isOver = totalSpent > budget;
  const remaining = budget - totalSpent;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
      className="bg-card rounded-2xl border border-border p-6 mcm-shadow">
      <div className="flex items-start justify-between mb-1 flex-wrap gap-2">
        <div>
          <h3 className="font-display font-bold text-lg">✈️ Vacations Budget {thisYear}</h3>
          <p className="text-sm text-muted-foreground">Flights + Travel Spend vs annual budget. Cumulative YTD.</p>
        </div>
        <div className={`text-right rounded-xl px-4 py-2 border ${isOver ? 'bg-budget-over/10 border-budget-over/30' : 'bg-budget-under/10 border-budget-under/30'}`}>
          <div className="text-xs text-muted-foreground">YTD spent</div>
          <div className={`font-display text-2xl font-bold ${isOver ? 'text-budget-over' : 'text-budget-under'}`}>
            £{totalSpent.toFixed(0)}
          </div>
          <div className="text-xs font-medium text-muted-foreground">of £{budget.toFixed(0)}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4 mt-3">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{pct.toFixed(0)}% used</span>
          <span className={isOver ? 'text-budget-over font-semibold' : 'text-budget-under font-semibold'}>
            {isOver ? `£${Math.abs(remaining).toFixed(0)} over` : `£${remaining.toFixed(0)} remaining`}
          </span>
        </div>
        <div className="h-3 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: isOver ? 'hsl(var(--budget-over))' : pct > 80 ? 'hsl(42,75%,50%)' : 'hsl(var(--budget-under))',
            }}
          />
        </div>
      </div>

      {visibleData.length > 0 && (
        <div className="overflow-x-auto -mx-2"><div className="h-64" style={{minWidth:320}}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 13 }} />
              <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `£${v}`} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '13px' }}
                formatter={(value: number, name: string) => [`£${value.toFixed(2)}`, name]}
              />
              <Legend wrapperStyle={{ fontSize: '13px' }} />
              <Bar dataKey="monthSpend" name="Monthly vacation spend" fill="hsl(280,40%,55%)" radius={[4, 4, 0, 0]} maxBarSize={60} />
              <Line type="monotone" dataKey="cumulative" name="Cumulative YTD" stroke="hsl(280,60%,40%)" strokeWidth={2.5} dot={{ r: 5, fill: 'hsl(280,60%,40%)' }} />
              <ReferenceLine y={budget} stroke="hsl(var(--foreground))" strokeDasharray="8 4" strokeWidth={2} label={{ value: `Budget £${budget.toFixed(0)}`, position: 'insideTopRight', fontSize: 11, fontWeight: 700 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
          </div>{/* end overflow-x-auto */}
      )}
    </motion.div>
  );
}
