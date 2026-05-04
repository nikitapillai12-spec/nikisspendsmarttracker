import { useState, useMemo } from 'react';
import { TrendingUp, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BudgetData, InvestmentEntry } from '@/lib/budget-types';
import {
  addInvestmentEntry, updateInvestmentEntry, deleteInvestmentEntry,
  addInvestmentPlatform, deleteInvestmentPlatform,
} from '@/lib/budget-store';
import { formatDate } from '@/lib/date-utils';

interface Props {
  data: BudgetData;
  onDataChange: (d: BudgetData) => void;
}

const blank = (platforms: string[]) => ({
  amount: 0,
  platform: platforms[0] || 'T212 ISA',
  date: formatDate(new Date()),
  note: '' as string | undefined,
});

export function InvestmentsManager({ data, onDataChange }: Props) {
  const [open, setOpen] = useState(false);
  const platforms = useMemo(() => data.investmentPlatforms || [], [data.investmentPlatforms]);
  const entries = useMemo(
    () => [...(data.investmentEntries || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [data.investmentEntries],
  );

  const [draft, setDraft] = useState(() => blank(platforms));
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPlatform, setNewPlatform] = useState('');

  const total = entries.reduce((s, e) => s + e.amount, 0);

  const startEdit = (e: InvestmentEntry) => {
    setEditingId(e.id);
    setAdding(false);
    setDraft({ amount: e.amount, platform: e.platform, date: e.date, note: e.note ?? '' });
  };

  const handleSave = () => {
    if (draft.amount <= 0 || !draft.platform || !draft.date) return;
    const note = draft.note?.trim() || undefined;
    if (editingId) {
      onDataChange(updateInvestmentEntry(editingId, { ...draft, note }));
    } else {
      onDataChange(addInvestmentEntry({
        id: crypto.randomUUID(),
        amount: draft.amount,
        platform: draft.platform,
        date: draft.date,
        note,
        createdAt: Date.now(),
      }));
    }
    setEditingId(null);
    setAdding(false);
    setDraft(blank(platforms));
  };

  const handleAddPlatform = () => {
    const name = newPlatform.trim();
    if (!name) return;
    onDataChange(addInvestmentPlatform(name));
    setNewPlatform('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full border border-border mcm-shadow-sm text-sm">
          <TrendingUp className="w-4 h-4" />
          Investments
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Investments</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Tracked separately from your spending. Money put into investments is recorded here and does not count against your budget.
        </p>

        <div className="rounded-lg bg-secondary px-3 py-2 mt-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total invested</span>
          <span className="font-display font-bold text-xl">£{total.toFixed(2)}</span>
        </div>

        {/* Platforms management */}
        <div className="mt-4">
          <label className="text-xs text-muted-foreground mb-1 block">Investment platforms</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {platforms.map(p => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full bg-secondary text-sm px-3 py-1">
                {p}
                <button
                  onClick={() => onDataChange(deleteInvestmentPlatform(p))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${p}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add platform (e.g. Vanguard ISA)"
              value={newPlatform}
              onChange={e => setNewPlatform(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddPlatform()}
            />
            <Button variant="outline" size="sm" onClick={handleAddPlatform}><Plus className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Entries */}
        <div className="space-y-2 pt-4">
          <div className="flex items-center justify-between">
            <h4 className="font-display font-bold text-sm">Top-ups</h4>
            {!adding && !editingId && (
              <Button size="sm" variant="outline" onClick={() => { setAdding(true); setDraft(blank(platforms)); }}>
                <Plus className="w-4 h-4 mr-1" /> Add top-up
              </Button>
            )}
          </div>

          {adding && (
            <div className="rounded-lg border border-dashed border-primary p-3 bg-primary/5">
              <Editor
                draft={draft} setDraft={setDraft} platforms={platforms}
                onSave={handleSave}
                onCancel={() => { setAdding(false); setDraft(blank(platforms)); }}
              />
            </div>
          )}

          {entries.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground text-center py-3">No investment top-ups yet.</p>
          )}

          {entries.map(e => (
            <div key={e.id} className="rounded-lg border border-border p-3 bg-card">
              {editingId === e.id ? (
                <Editor
                  draft={draft} setDraft={setDraft} platforms={platforms}
                  onSave={handleSave}
                  onCancel={() => { setEditingId(null); setDraft(blank(platforms)); }}
                />
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xl">📈</span>
                  <div className="flex-1 min-w-[140px]">
                    <p className="font-semibold leading-tight">{e.platform}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.date}{e.note ? ` · ${e.note}` : ''}
                    </p>
                  </div>
                  <span className="font-display font-bold text-base">£{e.amount.toFixed(2)}</span>
                  <button onClick={() => startEdit(e)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => onDataChange(deleteInvestmentEntry(e.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Editor({
  draft, setDraft, platforms, onSave, onCancel,
}: {
  draft: { amount: number; platform: string; date: string; note?: string };
  setDraft: (d: { amount: number; platform: string; date: string; note?: string }) => void;
  platforms: string[];
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Amount (£)</label>
          <Input
            type="number" step="0.01"
            value={draft.amount || ''}
            onChange={e => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Date</label>
          <Input
            type="date"
            value={draft.date}
            onChange={e => setDraft({ ...draft, date: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Platform</label>
          <Select value={draft.platform} onValueChange={v => setDraft({ ...draft, platform: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {platforms.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Note (optional)</label>
          <Input
            value={draft.note || ''}
            onChange={e => setDraft({ ...draft, note: e.target.value })}
            placeholder="e.g. monthly DD"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave}><Check className="w-4 h-4 mr-1" /> Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Cancel</Button>
      </div>
    </div>
  );
}