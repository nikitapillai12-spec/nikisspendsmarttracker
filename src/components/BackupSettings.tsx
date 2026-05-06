import { useEffect, useRef, useState } from 'react';
import { Download, Upload, CloudUpload, RefreshCw, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  exportSnapshot,
  saveDailyBackupToCloud,
  listCloudBackups,
  fetchCloudBackup,
  restoreFromBackup,
  initStore,
  type BackupListItem,
} from '@/lib/budget-store';
import { toast } from '@/components/ui/sonner';

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function BackupSettings({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [backups, setBackups] = useState<BackupListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listCloudBackups().then(b => setBackups(b)).finally(() => setLoading(false));
  }, [open]);

  const handleDownload = () => {
    downloadJson(`spendsmart-backup-${todayStr()}.json`, exportSnapshot());
    toast.success('Backup downloaded');
  };

  const handleSnapshotNow = async () => {
    setBusy(true);
    const r = await saveDailyBackupToCloud();
    setBusy(false);
    if (r.saved) {
      toast.success(`Snapshot saved for ${r.date}`);
      const list = await listCloudBackups();
      setBackups(list);
    } else {
      toast.error('Snapshot failed');
    }
  };

  const handleDownloadCloud = async (b: BackupListItem) => {
    const data = await fetchCloudBackup(b.id);
    if (!data) { toast.error('Could not fetch backup'); return; }
    downloadJson(`spendsmart-backup-${b.date}.json`, data);
  };

  const handleRestoreCloud = async (b: BackupListItem) => {
    if (!confirm(`Restore backup from ${b.date}? Existing entries with the same id will be overwritten.`)) return;
    setBusy(true);
    const data = await fetchCloudBackup(b.id);
    if (!data) { setBusy(false); toast.error('Could not fetch backup'); return; }
    const ok = await restoreFromBackup(data);
    await initStore();
    setBusy(false);
    toast[ok ? 'success' : 'error'](ok ? 'Restore complete' : 'Restore failed');
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!confirm('Import this backup? Existing entries with the same id will be overwritten.')) return;
        setBusy(true);
        const ok = await restoreFromBackup(parsed);
        await initStore();
        setBusy(false);
        toast[ok ? 'success' : 'error'](ok ? 'Import complete' : 'Import failed');
      } catch {
        toast.error('Invalid backup file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Backups</DialogTitle>
          <DialogDescription>
            Daily cloud snapshots are saved automatically. Download a copy any time, or restore from a saved file.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" /> Download Backup
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" /> Import Backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = '';
            }}
          />
          <Button variant="outline" onClick={handleSnapshotNow} disabled={busy}>
            <CloudUpload className="w-4 h-4 mr-2" /> Snapshot now
          </Button>
          <Button variant="outline" onClick={async () => { setLoading(true); setBackups(await listCloudBackups()); setLoading(false); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh list
          </Button>
        </div>

        <div className="mt-2 max-h-72 overflow-auto border rounded-md divide-y">
          {loading ? (
            <div className="p-4 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
            </div>
          ) : backups.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No cloud backups yet.</div>
          ) : (
            backups.map(b => (
              <div key={b.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-medium">{b.date}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => handleDownloadCloud(b)}>
                    <Download className="w-3.5 h-3.5 mr-1" /> Download
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleRestoreCloud(b)} disabled={busy}>
                    Restore
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}