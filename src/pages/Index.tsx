import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, BarChart3, Settings, CloudUpload, RefreshCw, Database } from 'lucide-react';
import { WeeklyView } from '@/components/WeeklyView';
import { MonthlyOverview } from '@/components/MonthlyOverview';
import { AutoUnlock } from '@/components/AutoUnlock';
import { BudgetData } from '@/lib/budget-types';
import { getAll, subscribeStore, initStore, migrateLocalDataIfAny, maybeRunDailyBackup } from '@/lib/budget-store';
import { getStoredVaultId } from '@/lib/vault-store';
import { toast } from '@/components/ui/sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BackupSettings } from '@/components/BackupSettings';
import { PdfImport } from '@/components/PdfImport';
import { RefundMatcher } from '@/components/RefundMatcher';
import { FileText } from 'lucide-react';

type Tab = 'weekly' | 'timeseries';

const Index = () => {
  const [tab, setTab] = useState<Tab>('weekly');
  const [data, setData] = useState<BudgetData>(() => getAll());

  useEffect(() => {
    setData({ ...getAll() });
    const unsub = subscribeStore(d => setData({ ...d }));
    if (getStoredVaultId()) {
      initStore().then(d => {
        setData({ ...d });
        maybeRunDailyBackup();
      });
    }
    return () => { unsub(); };
  }, []);

  const refreshData = (newData: BudgetData) => setData({ ...newData });

  return (
    <AutoUnlock>
    <RefundMatcher data={data} onDataChange={refreshData} />
    <div className="min-h-screen mcm-bg relative overflow-x-hidden">

      {/* Memphis geometric accent shapes — hidden on mobile to keep UI clean */}
      <div className="hidden sm:block mcm-blob top-0 left-0 h-screen bg-[hsl(var(--memphis-yellow,45_95%_55%))] opacity-60" style={{ width: '6px' }} />
      <div className="hidden sm:block mcm-blob top-6 right-6 w-16 h-16 rounded-full border-4 border-[hsl(var(--accent))] opacity-30" />
      <div className="hidden sm:block mcm-blob top-12 right-16 w-6 h-6 rounded-full bg-[hsl(var(--primary))] opacity-20" />
      <div className="hidden sm:block mcm-blob bottom-16 left-8 w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-b-[36px] border-b-[hsl(var(--accent))] opacity-20" />
      <div className="hidden sm:block mcm-blob top-[40%] -right-2 w-8 h-24 bg-[hsl(var(--primary))] opacity-15 rounded-l-lg" />

      {/* Header */}
      <header className="border-b-2 border-border bg-white/95 backdrop-blur-sm sticky top-0 z-50" style={{ boxShadow: '0 2px 0 hsl(var(--border)), 0 4px 20px -8px hsl(230 25% 12% / 0.10)' }}>
        <div className="container max-w-7xl mx-auto px-3 py-2">
          <div className="flex items-center justify-between gap-2">

            {/* Logo — compact on mobile */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative w-8 h-8 shrink-0">
                <div className="absolute inset-0 rounded-md bg-[hsl(var(--primary))]" />
                <div className="absolute inset-1 rounded-sm bg-white" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))]" />
                </div>
              </div>
              <div className="min-w-0">
                <h1 className="font-display leading-none tracking-tight text-lg sm:text-3xl truncate" style={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
                  SpendSmart
                </h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-body mt-0.5 tracking-wide hidden sm:block">Stay on top of what you spend on</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-lg border-2 border-border bg-white hover:bg-secondary transition-colors mcm-shadow-sm">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <BackupSettings
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Database className="w-4 h-4 mr-2" /> Backups (Download / Restore)
                      </DropdownMenuItem>
                    }
                  />
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
                  <PdfImport
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <FileText className="w-4 h-4 mr-2" /> Import Bank Statement (PDF)
                      </DropdownMenuItem>
                    }
                  />
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Tab Switcher */}
              <div className="flex rounded-lg bg-secondary p-0.5 gap-0.5 border-2 border-border mcm-shadow-sm">
                <button
                  onClick={() => setTab('weekly')}
                  aria-label="Weekly view"
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold tracking-wide transition-all ${
                    tab === 'weekly'
                      ? 'bg-[hsl(var(--primary))] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Weekly</span>
                </button>
                <button
                  onClick={() => setTab('timeseries')}
                  aria-label="Charts view"
                  className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold tracking-wide transition-all ${
                    tab === 'timeseries'
                      ? 'bg-[hsl(var(--accent))] text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Charts</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Memphis bold underline stripe below header */}
        <div className="h-1 w-full" style={{
          background: 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 50%, hsl(var(--mcm-mustard)) 100%)'
        }} />
      </header>

      {/* Content */}
      <main className="container max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6 relative z-10">
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
    </AutoUnlock>
  );
};

export default Index;
