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
    <div className="min-h-screen memphis-bg relative overflow-x-hidden">
      {/* Decorative Memphis shapes */}
      <div className="memphis-blob top-24 -left-10 w-32 h-32 rounded-full bg-primary/30 border-2 border-foreground" />
      <div className="memphis-blob top-72 right-4 w-20 h-20 bg-accent/40 border-2 border-foreground rotate-12" />
      <div className="memphis-blob bottom-20 left-8 w-0 h-0 border-l-[30px] border-l-transparent border-r-[30px] border-r-transparent border-b-[52px] border-b-[hsl(45_90%_55%)]" />

      {/* Header */}
      <header className="border-b-2 border-foreground bg-card/95 backdrop-blur-sm sticky top-0 z-50 memphis-shadow-sm">
        <div className="container max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.span
                className="text-3xl inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground border-2 border-foreground memphis-shadow-sm"
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
                  <button className="p-2 rounded-lg border-2 border-foreground bg-card hover:bg-secondary transition-colors memphis-shadow-sm">
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
            <div className="flex rounded-full bg-secondary p-1 gap-1 border-2 border-foreground memphis-shadow-sm">
              <button
                onClick={() => setTab('weekly')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium font-display transition-all ${
                  tab === 'weekly'
                    ? 'bg-primary text-primary-foreground border-2 border-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Wallet className="w-4 h-4" />
                Weekly
              </button>
              <button
                onClick={() => setTab('timeseries')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium font-display transition-all ${
                  tab === 'timeseries'
                    ? 'bg-accent text-accent-foreground border-2 border-foreground'
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
      <main className="container max-w-7xl mx-auto px-4 py-6 relative z-10">
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
