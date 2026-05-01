import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, BarChart3, Settings, KeyRound, Lock, CloudUpload, RefreshCw } from 'lucide-react';
import { WeeklyView } from '@/components/WeeklyView';
import { MonthlyOverview } from '@/components/MonthlyOverview';
import { PasscodeGate, SESSION_KEY } from '@/components/PasscodeGate';
import { BudgetData } from '@/lib/budget-types';
import { getAll, subscribeStore, initStore, migrateLocalDataIfAny } from '@/lib/budget-store';
import { getStoredVaultId } from '@/lib/vault-store';
import { clearStoredVaultId } from '@/lib/vault-store';
import { toast } from '@/components/ui/sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import mcmLogo from '@/assets/mcm-logo.png';

type Tab = 'weekly' | 'timeseries';

const Index = () => {
  const [tab, setTab] = useState<Tab>('weekly');
  const [data, setData] = useState<BudgetData>(() => getAll());

  useEffect(() => {
    setData({ ...getAll() });
    const unsub = subscribeStore(d => setData({ ...d }));
    // Defensive re-hydration in case Index mounted before PasscodeGate's initStore
    // finished, or the cache was cleared (e.g. HMR). Safe to call multiple times.
    if (getStoredVaultId()) {
      initStore().then(d => setData({ ...d }));
    }
    return () => { unsub(); };
  }, []);

  const refreshData = (newData: BudgetData) => {
    setData({ ...newData });
  };

  return (
    <PasscodeGate>
    <div className="min-h-screen mcm-bg relative overflow-x-hidden text-[17px]">
      {/* Decorative MCM shapes — organic atomic forms, sparse */}
      <div className="mcm-blob top-24 -left-12 w-40 h-24 rounded-[50%] bg-[hsl(var(--mcm-mustard))]/25 rotate-[-12deg]" />
      <div className="mcm-blob top-[28rem] -right-8 w-28 h-28 rounded-full bg-[hsl(var(--mcm-teal))]/20" />
      <div className="mcm-blob bottom-24 left-10 w-0 h-0 border-l-[28px] border-l-transparent border-r-[28px] border-r-transparent border-b-[48px] border-b-[hsl(var(--mcm-terracotta))]/35" />
      <div className="mcm-blob top-[60rem] right-16 w-32 h-12 rounded-full bg-[hsl(var(--mcm-olive))]/20 rotate-12" />

      {/* Header */}
      <header className="border-b border-border bg-card/95 backdrop-blur-sm sticky top-0 z-50 mcm-shadow-sm">
        <div className="container max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.img
                src={mcmLogo}
                alt="SpendSmart logo"
                width={56}
                height={56}
                className="w-14 h-14 rounded-full bg-card border border-border mcm-shadow-sm object-contain p-1"
                animate={{ rotate: [0, -4, 4, -4, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 6 }}
              />
              <div>
                <h1 className="font-display font-normal text-4xl tracking-wide leading-none">SPENDSMART</h1>
                <p className="text-base text-muted-foreground font-serif-mcm italic">Stay on top of what you spend on</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-md border border-border bg-card hover:bg-secondary transition-colors mcm-shadow-sm">
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
            <div className="flex rounded-full bg-secondary p-1 gap-1 border border-border mcm-shadow-sm">
              <button
                onClick={() => setTab('weekly')}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-base font-medium tracking-wide transition-all ${
                  tab === 'weekly'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Wallet className="w-4 h-4" />
                Weekly
              </button>
              <button
                onClick={() => setTab('timeseries')}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-base font-medium tracking-wide transition-all ${
                  tab === 'timeseries'
                    ? 'bg-accent text-accent-foreground'
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
        {tab === 'weekly' ? (
          <div key="weekly">
            <WeeklyView data={data} onDataChange={refreshData} />
          </div>
        ) : (
          <div key="timeseries">
            <MonthlyOverview data={data} />
          </div>
        )}
      </main>
    </div>
    </PasscodeGate>
  );
};

export default Index;
