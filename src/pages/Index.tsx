import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, BarChart3, Settings, KeyRound, Lock, CloudUpload, RefreshCw } from 'lucide-react';
import { WeeklyView } from '@/components/WeeklyView';
import { MonthlyOverview } from '@/components/MonthlyOverview';
import { PasscodeGate, SESSION_KEY } from '@/components/PasscodeGate';
import { BudgetData } from '@/lib/budget-types';
import { getAll, subscribeStore, initStore, migrateLocalDataIfAny } from '@/lib/budget-store';
import { clearStoredVaultId } from '@/lib/vault-store';
import { toast } from '@/components/ui/sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Tab = 'weekly' | 'timeseries';

const Index = () => {
  const [tab, setTab] = useState<Tab>('weekly');
  const [data, setData] = useState<BudgetData>(() => getAll());

  useEffect(() => {
    setData({ ...getAll() });
    const unsub = subscribeStore(d => setData({ ...d }));
    return () => { unsub(); };
  }, []);

  const refreshData = (newData: BudgetData) => {
    setData({ ...newData });
  };

  return (
    <PasscodeGate>
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
                <p className="text-xs text-muted-foreground">Stay on top of what you spend on</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                    <Settings className="w-5 h-5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={async () => {
                    const did = await migrateLocalDataIfAny();
                    await initStore();
                    toast(did ? 'Local data pushed to cloud' : 'No local-only data to sync');
                  }}>
                    <CloudUpload className="w-4 h-4 mr-2" /> Push Local Data to Cloud
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    await initStore();
                    toast('Re-synced from cloud');
                  }}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Re-sync From Cloud
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    clearStoredVaultId();
                    sessionStorage.removeItem(SESSION_KEY);
                    window.location.reload();
                  }}>
                    <KeyRound className="w-4 h-4 mr-2" /> Change Passcode
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    sessionStorage.removeItem(SESSION_KEY);
                    window.location.reload();
                  }}>
                    <Lock className="w-4 h-4 mr-2" /> Lock App
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

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
                onClick={() => setTab('timeseries')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium font-display transition-all ${
                  tab === 'timeseries'
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Time Series
              </button>
            </div>
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
              key="timeseries"
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
    </PasscodeGate>
  );
};

export default Index;
