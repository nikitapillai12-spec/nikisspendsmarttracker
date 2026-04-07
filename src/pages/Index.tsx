import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, BarChart3 } from 'lucide-react';
import { WeeklyView } from '@/components/WeeklyView';
import { MonthlyOverview } from '@/components/MonthlyOverview';
import { BudgetData } from '@/lib/budget-types';
import { getAll } from '@/lib/budget-store';

type Tab = 'weekly' | 'monthly';

const Index = () => {
  const [tab, setTab] = useState<Tab>('weekly');
  const [data, setData] = useState<BudgetData>(() => getAll());

  const refreshData = (newData: BudgetData) => {
    setData({ ...newData });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.span
                className="text-3xl"
                animate={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 1, repeat: Infinity, repeatDelay: 5 }}
              >
                💰
              </motion.span>
              <div>
                <h1 className="font-display font-bold text-xl">SpendSmart</h1>
                <p className="text-xs text-muted-foreground">Track every penny</p>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex rounded-lg bg-secondary p-1 gap-1">
              <button
                onClick={() => setTab('weekly')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium font-display transition-all ${
                  tab === 'weekly'
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Wallet className="w-4 h-4" />
                Weekly
              </button>
              <button
                onClick={() => setTab('monthly')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium font-display transition-all ${
                  tab === 'monthly'
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Monthly
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container max-w-7xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {tab === 'weekly' ? (
            <motion.div
              key="weekly"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <WeeklyView data={data} onDataChange={refreshData} />
            </motion.div>
          ) : (
            <motion.div
              key="monthly"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <MonthlyOverview data={data} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;
