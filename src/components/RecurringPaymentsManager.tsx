import { useState, useMemo } from 'react';
import { Repeat, Plus, Trash2, Pencil, Check, X, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BudgetData, RecurringPayment, RecurringInvestment, getAllCategories, getCategoryEmoji } from '@/lib/budget-types';
import {
  addRecurringPayment, updateRecurringPayment, deleteRecurringPayment,
  addRecurringInvestment, updateRecurringInvestment, deleteRecurringInvestment,
} from '@/lib/budget-store';
import { formatMonth, formatDate } from '@/lib/date-utils';

interface Props {
  data: BudgetData;
  onDataChange: (d: BudgetData) => void;
}

const blank = (): Omit<RecurringPayment, 'id'> => ({
  label: '',
  amount: 0,
  category: 'Rent',
  startMonth: formatMonth(new Date()),
  endMonth: undefined,
  active: true,
});

export function RecurringPaymentsManager({ data, onDataChange }: Props) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<RecurringPayment, 'id'>>(blank());
  const [adding, setAdding] = useState(false);

  const allCats = useMemo(() => getAllCategories(data.customCategories, 'spend'), [data.customCategories]);
  const payments = data.recurringPayments || [];

  const startEdit = (p: RecurringPayment) => {
    setEditingId(p.id);
    setAdding(false);
    setDraft({
      label: p.label,
      amount: p.amount,
      category: p.category,
      startMonth: p.startMonth,
      endMonth: p.endMonth,
      active: p.active,
    });
  };

  const handleSave = () => {
    if (!draft.label.trim() || draft.amount <= 0) return;
    if (editingId) {
      onDataChange(updateRecurringPayment(editingId, draft));
    } else {
      onDataChange(addRecurringPayment({ id: crypto.randomUUID(), ...draft }));
    }
    setEditingId(null);
    setAdding(false);
    setDraft(blank());
  };

  const handleCancel = () => {
    setEditingId(null);
    setAdding(false);
    setDraft(blank());
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 rounded-full border border-border mcm-shadow-sm text-sm">
          <Repeat className="w-4 h-4" />
          Monthly Payments &amp; Investments
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Monthly Payments &amp; Investments</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Each monthly amount is split evenly across the weeks of the month and shown in the weekly view as a recurring line item. They’re displayed separately and don’t count towards your ad-hoc weekly spend total.
        </p>

        <div className="space-y-2 pt-3">
          {payments.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No recurring payments yet. Add your rent, subscriptions, utilities, etc.
            </p>
          )}

          {payments.map(p => (
            <div key={p.id} className="rounded-lg border border-border p-3 bg-card">
              {editingId === p.id ? (
                <RecurringEditor
                  draft={draft}
                  setDraft={setDraft}
                  allCats={allCats}
                  customCategories={data.customCategories}
                  onSave={handleSave}
                  onCancel={handleCancel}
                />
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xl">{getCategoryEmoji(p.category, data.customCategories)}</span>
                  <div className="flex-1 min-w-[140px]">
                    <p className="font-semibold leading-tight">
                      {p.label} {!p.active && <span className="text-xs text-muted-foreground italic">(paused)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.category} · from {p.startMonth}{p.endMonth ? ` to ${p.endMonth}` : ''}
                    </p>
                  </div>
                  <span className="font-display font-bold text-base">£{p.amount.toFixed(2)}<span className="text-xs text-muted-foreground font-sans font-normal">/mo</span></span>
                  <button onClick={() => startEdit(p)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => onDataChange(deleteRecurringPayment(p.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          ))}

          {adding && (
            <div className="rounded-lg border border-dashed border-primary p-3 bg-primary/5">
              <RecurringEditor
                draft={draft}
                setDraft={setDraft}
                allCats={allCats}
                customCategories={data.customCategories}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            </div>
          )}

          {!adding && !editingId && (
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => { setAdding(true); setDraft(blank()); }}
            >
              <Plus className="w-4 h-4 mr-1" /> Add monthly payment
            </Button>
          )}
        </div>

        <RecurringInvestmentsSection data={data} onDataChange={onDataChange} />
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Recurring monthly investments ----------------

type InvDraft = {
  amount: number; platform: string; startDate: string; endDate: string;
  dayOfMonth: number; note: string; active: boolean;
};

const blankInv = (platforms: string[]): InvDraft => ({
  amount: 0,
  platform: platforms[0] || 'T212 ISA',
  startDate: formatDate(new Date()),
  endDate: '',
  dayOfMonth: new Date().getDate(),
  note: '',
  active: true,
});

function RecurringInvestmentsSection({ data, onDataChange }: Props) {
  const platforms = useMemo(
    () => (data.investmentPlatforms && data.investmentPlatforms.length
      ? data.investmentPlatforms
      : ['T212 ISA', 'Freetrade GIA', 'InvestEngine GIA', 'IG Invest GIA', 'Robinhood GIA']),
    [data.investmentPlatforms],
  );
  const list = data.recurringInvestments || [];
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InvDraft>(() => blankInv(platforms));

  const startEdit = (r: RecurringInvestment) => {
    setEditingId(r.id);
    setAdding(false);
    setDraft({
      amount: r.amount,
      platform: r.platform,
      startDate: r.startDate,
      endDate: r.endDate || '',
      dayOfMonth: r.dayOfMonth || Number(r.startDate.slice(8, 10)) || 1,
      note: r.note || '',
      active: r.active,
    });
  };

  const save = () => {
    if (draft.amount <= 0 || !draft.platform || !draft.startDate) return;
    const payload = {
      amount: draft.amount,
      platform: draft.platform,
      startDate: draft.startDate,
      endDate: draft.endDate || undefined,
      frequency: 'monthly' as const,
      dayOfMonth: draft.dayOfMonth,
      note: draft.note.trim() || undefined,
      active: draft.active,
    };
    if (editingId) {
      onDataChange(updateRecurringInvestment(editingId, payload));
    } else {
      onDataChange(addRecurringInvestment({ id: crypto.randomUUID(), locked: false, ...payload }));
    }
    setEditingId(null);
    setAdding(false);
    setDraft(blankInv(platforms));
  };

  const cancel = () => { setEditingId(null); setAdding(false); setDraft(blankInv(platforms)); };

  return (
    <div className="pt-6 mt-4 border-t border-border space-y-2">
      <h4 className="font-display font-bold text-base">Monthly Recurring Investments</h4>
      <p className="text-xs text-muted-foreground">
        Monthly investments count towards your investment totals and charts for every month between the start and end date.
      </p>

      {list.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground text-center py-3">No recurring investments yet.</p>
      )}

      {list.map(r => (
        <div key={r.id} className="rounded-lg border border-border p-3 bg-card">
          {editingId === r.id ? (
            <InvEditor draft={draft} setDraft={setDraft} platforms={platforms} onSave={save} onCancel={cancel} />
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xl">📈</span>
              <div className="flex-1 min-w-[150px]">
                <p className="font-semibold leading-tight">
                  {r.platform} {!r.active && <span className="text-xs italic text-muted-foreground">(paused)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Monthly on day {r.dayOfMonth || Number(r.startDate.slice(8, 10)) || 1} · {r.startDate} → {r.endDate || 'ongoing'}
                  {r.note ? ` · ${r.note}` : ''}
                </p>
              </div>
              <span className="font-display font-bold text-base">
                £{r.amount.toFixed(2)}<span className="text-xs text-muted-foreground font-sans font-normal">/mo</span>
              </span>
              <button
                onClick={() => onDataChange(updateRecurringInvestment(r.id, { locked: !r.locked }))}
                className="text-muted-foreground hover:text-foreground"
                aria-label={r.locked ? 'Unlock dates' : 'Lock dates'}
                title={r.locked ? 'Unlock to edit dates' : 'Lock dates'}
              >
                {r.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>
              <button
                onClick={() => !r.locked && startEdit(r)}
                disabled={r.locked}
                title={r.locked ? 'Unlock to edit' : 'Edit'}
                className="text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => onDataChange(deleteRecurringInvestment(r.id))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      ))}

      {adding && (
        <div className="rounded-lg border border-dashed border-primary p-3 bg-primary/5">
          <InvEditor draft={draft} setDraft={setDraft} platforms={platforms} onSave={save} onCancel={cancel} />
        </div>
      )}

      {!adding && !editingId && (
        <Button variant="outline" className="w-full border-dashed" onClick={() => { setAdding(true); setDraft(blankInv(platforms)); }}>
          <Plus className="w-4 h-4 mr-1" /> Add recurring investment
        </Button>
      )}
    </div>
  );
}

function InvEditor({
  draft, setDraft, platforms, onSave, onCancel,
}: {
  draft: InvDraft;
  setDraft: (d: InvDraft) => void;
  platforms: string[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const locked = false;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Monthly amount (£)</label>
          <Input
            type="number" step="0.01"
            value={draft.amount || ''}
            onChange={e => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Platform</label>
          <Select value={draft.platform} onValueChange={v => setDraft({ ...draft, platform: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {platforms.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Start date</label>
          <Input type="date" disabled={locked} value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">End date (optional)</label>
          <Input type="date" disabled={locked} value={draft.endDate} onChange={e => setDraft({ ...draft, endDate: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Day of month</label>
          <Input
            type="number" min={1} max={31}
            value={draft.dayOfMonth}
            onChange={e => setDraft({ ...draft, dayOfMonth: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Frequency</label>
          <Input value="Monthly" readOnly disabled />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Note (optional)</label>
          <Input value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. monthly DD" />
        </div>
        <div className="col-span-2 flex items-center gap-2 pt-1">
          <Switch checked={draft.active} onCheckedChange={v => setDraft({ ...draft, active: v })} />
          <span className="text-sm">{draft.active ? 'Active' : 'Paused'}</span>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave}><Check className="w-4 h-4 mr-1" /> Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Cancel</Button>
      </div>
    </div>
  );
}

function RecurringEditor({
  draft, setDraft, allCats, customCategories, onSave, onCancel,
}: {
  draft: Omit<RecurringPayment, 'id'>;
  setDraft: (d: Omit<RecurringPayment, 'id'>) => void;
  allCats: string[];
  customCategories: BudgetData['customCategories'];
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Label</label>
          <Input
            placeholder="e.g. Rent, Spotify, Council Tax"
            value={draft.label}
            onChange={e => setDraft({ ...draft, label: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Monthly amount (£)</label>
          <Input
            type="number" step="0.01"
            value={draft.amount || ''}
            onChange={e => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Category</label>
          <Select value={draft.category} onValueChange={v => setDraft({ ...draft, category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {allCats.map(c => (
                <SelectItem key={c} value={c}>{getCategoryEmoji(c, customCategories)} {c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Start month (YYYY-MM)</label>
          <Input
            placeholder="2026-05"
            value={draft.startMonth}
            onChange={e => setDraft({ ...draft, startMonth: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">End month (optional)</label>
          <Input
            placeholder="leave blank for ongoing"
            value={draft.endMonth || ''}
            onChange={e => setDraft({ ...draft, endMonth: e.target.value || undefined })}
          />
        </div>
        <div className="col-span-2 flex items-center gap-2 pt-1">
          <Switch checked={draft.active} onCheckedChange={v => setDraft({ ...draft, active: v })} />
          <span className="text-sm">{draft.active ? 'Active' : 'Paused'}</span>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={onSave}><Check className="w-4 h-4 mr-1" /> Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Cancel</Button>
      </div>
    </div>
  );
}