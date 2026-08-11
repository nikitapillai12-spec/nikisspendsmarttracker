import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, Check, X, TrendingUp, Link, Link2Off, ChevronDown } from 'lucide-react';
import { SpendEntry, Category, CustomCategory, EntryType, RecurringPayment, getAllCategories, getCategoryColor, getCategoryEmoji, signedAmount } from '@/lib/budget-types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatDisplayDate, isToday } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RetailerInput } from './RetailerInput';
import { linkRefundPair, unlinkRefundPair, addRecurringInvestment } from '@/lib/budget-store';
import { findRefundPairs } from './RefundMatcher';

interface DayBoxProps {
  date: Date;
  dateStr: string;
  entries: SpendEntry[];
  customCategories: CustomCategory[];
  allEntries: SpendEntry[];
  recurringSplits?: { payment: RecurringPayment; perWeek: number }[];
  investmentPlatforms?: string[];
  onAdd: (amount: number, category: Category, note?: string, type?: EntryType) => void;
  onUpdate: (id: string, amount: number, category: Category, note?: string, type?: EntryType) => void;
  onDelete: (id: string) => void;
  onDataChange: (data: any) => void;
}

type AddMode = null | 'spend' | 'credit' | 'investment';

interface RefundSuggestion {
  spendEntry: SpendEntry;
  creditEntry: SpendEntry;
}

export function DayBox({ date, dateStr, entries, customCategories, allEntries, recurringSplits, investmentPlatforms = [], onAdd, onUpdate, onDelete, onDataChange }: DayBoxProps) {
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [entryType, setEntryType] = useState<EntryType>('spend');
  const [category, setCategory] = useState<Category>('Groceries');
  const [note, setNote] = useState('');
  const [refundSuggestion, setRefundSuggestion] = useState<RefundSuggestion | null>(null);

  // Recurring investment options (shown when adding an Investment)
  const [isRecurringInvestment, setIsRecurringInvestment] = useState(false);
  const [riStart, setRiStart] = useState(dateStr);
  const [riEnd, setRiEnd] = useState('');
  const [riFreq, setRiFreq] = useState<'weekly' | 'fortnightly' | 'monthly'>('monthly');
  const [riDow, setRiDow] = useState<number>(new Date(dateStr).getDay());
  const [riPlatform, setRiPlatform] = useState<string>(investmentPlatforms[0] || 'T212 ISA');

  const total = entries.reduce((s, e) => s + signedAmount(e), 0);
  const today = isToday(date);
  const allCategories = getAllCategories(customCategories, entryType);

  // Mobile-only: collapse empty days by default to keep the vertical list short.
  const hasContent = entries.length > 0 || (recurringSplits && recurringSplits.length > 0);
  const [expanded, setExpanded] = useState<boolean>(hasContent || today);

  const switchType = (t: EntryType) => {
    setEntryType(t);
    const list = getAllCategories(customCategories, t);
    if (!list.includes(category)) {
      setCategory(list[0] ?? (t === 'credit' ? 'Shopping Refund' : 'Groceries'));
    }
  };

  const spendEntries = entries.filter(e => (e.type ?? 'spend') === 'spend');
  const pieData = Object.entries(
    spendEntries.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const retailersByCat: Record<string, { note: string; total: number }[]> = {};
  for (const cat of pieData.map(p => p.name)) {
    const totals = new Map<string, number>();
    spendEntries.filter(e => e.category === cat && e.note?.trim())
      .forEach(e => totals.set(e.note!.trim(), (totals.get(e.note!.trim()) || 0) + e.amount));
    const list = Array.from(totals.entries()).map(([note, total]) => ({ note, total }))
      .sort((a, b) => b.total - a.total);
    if (list.length) retailersByCat[cat] = list;
  }

  const PieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    const tops = retailersByCat[name] || [];
    return (
      <div className="rounded-lg bg-popover text-popover-foreground border-2 border-foreground shadow-[3px_3px_0_0_hsl(var(--foreground))] px-2.5 py-2 text-[11px] max-w-[180px]">
        <div className="font-display font-bold flex justify-between gap-3">
          <span>{getCategoryEmoji(name, customCategories)} {name}</span>
          <span style={{ color: getCategoryColor(name, customCategories) }}>£{value.toFixed(2)}</span>
        </div>
        {tops.length > 0 && (
          <ol className="mt-1 space-y-0.5">
            {tops.map(r => (
              <li key={r.note} className="flex justify-between gap-2">
                <span className="truncate">• {r.note}</span>
                <span className="font-semibold">£{r.total.toFixed(2)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  };

  /** After adding a credit, check if a matching spend exists using the shared scoring algorithm */
  const checkRefundMatch = (newEntry: SpendEntry) => {
    if (newEntry.type !== 'credit') return;
    // Combine allEntries with the new entry and run the matcher
    const allWithNew = [...allEntries, newEntry];
    const pairs = findRefundPairs(allWithNew);
    const match = pairs.find(p => p.credit.id === newEntry.id || p.spend.id === newEntry.id);
    if (match) {
      setRefundSuggestion({ spendEntry: match.spend, creditEntry: match.credit });
    }
  };

  const handleAdd = () => {
    const val = parseFloat(amount);
    if (val <= 0 || !amount) return;

    if (addMode === 'investment' && isRecurringInvestment) {
      onDataChange(addRecurringInvestment({
        id: crypto.randomUUID(),
        amount: val,
        platform: riPlatform,
        startDate: riStart || dateStr,
        endDate: riEnd || undefined,
        frequency: riFreq,
        dayOfWeek: riFreq === 'monthly' ? undefined : riDow,
        note: note.trim() || undefined,
        active: true,
      }));
      setAmount('');
      setNote('');
      setIsRecurringInvestment(false);
      setAddMode(null);
      return;
    }

    const cat = entryType === 'investment' ? 'Investment' : category;
    const actualType: EntryType = entryType;

    // WeeklyView.handleAdd intercepts distributed categories (Salary, Rent, Utilities, Subscriptions)
    // and splits them across weeks. DayBox just calls onAdd with the full amount.
    onAdd(val, cat, note.trim() || undefined, actualType);

    // Check refund match after a short delay to let entry propagate
    const newEntry: SpendEntry = {
      id: 'temp',
      amount: val,
      category: cat,
      date: dateStr,
      createdAt: Date.now(),
      note: note.trim() || undefined,
      type: actualType,
    };
    if (actualType === 'credit') setTimeout(() => checkRefundMatch({ ...newEntry, id: 'new' }), 100);

    setAmount('');
    setEntryType('spend');
    setCategory('Groceries');
    setNote('');
    setAddMode(null);
  };

  const handleUpdate = (id: string) => {
    const val = parseFloat(amount);
    if (val > 0) {
      onUpdate(id, val, category, note.trim() || undefined, entryType);
      setEditingId(null);
      setAmount('');
      setNote('');
    }
  };

  const startEdit = (entry: SpendEntry) => {
    setEditingId(entry.id);
    setAmount(entry.amount.toString());
    setEntryType((entry.type ?? 'spend') as EntryType);
    setCategory(entry.category);
    setNote(entry.note || '');
    setAddMode(null);
  };

  const openAdd = (mode: 'spend' | 'credit' | 'investment') => {
    setAddMode(mode);
    setEditingId(null);
    setIsRecurringInvestment(false);
    setRiStart(dateStr);
    setRiEnd('');
    setRiPlatform(investmentPlatforms[0] || 'T212 ISA');
    setRiDow(new Date(dateStr).getDay());
    setEntryType(mode === 'investment' ? 'investment' : mode);
    const cats = getAllCategories(customCategories, mode === 'investment' ? 'investment' : mode);
    setCategory(cats[0] ?? 'Groceries');
    setAmount('');
    setNote('');
  };

  const confirmRefundLink = () => {
    if (!refundSuggestion) return;
    onDataChange(linkRefundPair(refundSuggestion.spendEntry.id, refundSuggestion.creditEntry.id));
    setRefundSuggestion(null);
  };

  const isLinked = (entry: SpendEntry) => !!entry.refundPairId;
  const getPair = (entry: SpendEntry) => entry.refundPairId ? allEntries.find(e => e.id === entry.refundPairId) : null;

  const getNetLabel = (entry: SpendEntry): string | null => {
    const pair = getPair(entry);
    if (!pair) return null;
    const spend = (entry.type ?? 'spend') === 'spend' ? entry : pair;
    const credit = (entry.type ?? 'spend') === 'credit' ? entry : pair;
    const net = spend.amount - credit.amount;
    if (net <= 0.01) return 'Full refund — net: £0';
    return `Partially refunded — net: £${net.toFixed(2)}`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border border-border p-4 transition-all bg-card mcm-shadow hover:-translate-y-0.5 ${today ? 'bg-primary/10' : ''}`}
    >
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center justify-between mb-3 w-full text-left lg:pointer-events-none"
        aria-expanded={expanded}
      >
        <div>
          <h3 className="font-display font-normal text-lg tracking-wide leading-none">
            {formatDisplayDate(date)}
          </h3>
          {today && (
            <span className="text-sm font-semibold text-primary font-serif-mcm italic">✦ Today</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <motion.span key={total} initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="font-display font-normal text-2xl text-primary tracking-wide">
              £{total.toFixed(2)}
            </motion.span>
          )}
          {total < 0 && (
            <motion.span key={total} initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="font-display font-normal text-2xl tracking-wide text-budget-under">
              -£{Math.abs(total).toFixed(2)}
            </motion.span>
          )}
          {total === 0 && !hasContent && (
            <span className="text-xs text-muted-foreground italic lg:hidden">Tap to add</span>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform lg:hidden ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <div className={expanded ? '' : 'hidden lg:block'}>

      {/* Refund suggestion popup */}
      <AnimatePresence>
        {refundSuggestion && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-3 rounded-lg border-2 border-primary bg-primary/10 p-3 text-xs"
          >
            <p className="font-semibold mb-1">🔗 Possible refund match found</p>
            <p className="text-muted-foreground mb-2">
              We think <strong>{refundSuggestion.spendEntry.note || refundSuggestion.spendEntry.category} £{refundSuggestion.spendEntry.amount.toFixed(2)} ({refundSuggestion.spendEntry.date})</strong> and <strong>{refundSuggestion.creditEntry.note || refundSuggestion.creditEntry.category} £{refundSuggestion.creditEntry.amount.toFixed(2)}</strong> are a matching spend and refund. Shall we net these off?
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={confirmRefundLink}>✓ Confirm</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRefundSuggestion(null)}>✗ Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pie Chart */}
      {pieData.length > 0 && (
        <div className="h-44 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="92%" innerRadius="55%" strokeWidth={1.5} stroke="hsl(var(--card))">
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={getCategoryColor(entry.name, customCategories)} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Entries List */}
      <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
        <AnimatePresence>
          {entries.map((entry) => {
            const linked = isLinked(entry);
            const netLabel = getNetLabel(entry);
            return (
              <motion.div key={entry.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex flex-col gap-0.5 text-sm group">
                {editingId === entry.id ? (
                  <div className="flex flex-col gap-1.5 w-full">
                    <div className="grid grid-cols-2 gap-1 p-0.5 rounded-full bg-secondary text-xs">
                      <button type="button" onClick={() => switchType('spend')} className={`rounded-full py-1 font-semibold transition-colors ${entryType === 'spend' ? 'bg-budget-over/20 text-budget-over' : 'text-muted-foreground'}`}>− Spend</button>
                      <button type="button" onClick={() => switchType('credit')} className={`rounded-full py-1 font-semibold transition-colors ${entryType === 'credit' ? 'bg-budget-under/20 text-budget-under' : 'text-muted-foreground'}`}>+ Credit</button>
                    </div>
                    <div className="flex gap-1.5">
                      <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 text-sm flex-1" placeholder="£" />
                      <Select value={category} onValueChange={(v) => setCategory(v)}>
                        <SelectTrigger className="h-8 text-sm flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {getAllCategories(customCategories, entryType).map((c) => (
                            <SelectItem key={c} value={c} className="text-sm">{getCategoryEmoji(c, customCategories)} {c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <RetailerInput value={note} onChange={setNote} entries={allEntries} category={category} className="h-8 text-sm" />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-sm px-2" onClick={() => handleUpdate(entry.id)}><Check className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 text-sm px-2" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="shrink-0">{getCategoryEmoji(entry.category, customCategories)}</span>
                      <div className="truncate flex-1 min-w-0 text-muted-foreground text-sm" title={entry.note ? `${entry.category} (${entry.note})` : entry.category}>
                        {entry.category}
                        {entry.note && <span className="text-foreground/80 font-medium"> ({entry.note})</span>}
                        {linked && <span className="ml-1 text-[10px] text-primary font-semibold">🔗</span>}
                      </div>
                      {(entry.type ?? 'spend') === 'credit' ? (
                        <span className="font-semibold text-budget-under">+£{entry.amount.toFixed(2)}</span>
                      ) : (entry.type === 'investment') ? (
                        <span className="font-semibold text-blue-600">📊£{entry.amount.toFixed(2)}</span>
                      ) : (
                        <span className="font-semibold text-budget-over">-£{entry.amount.toFixed(2)}</span>
                      )}
                      <button onClick={() => startEdit(entry)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                      {linked ? (
                        <button onClick={() => onDataChange(unlinkRefundPair(entry.id))} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive" title="Unlink refund pair"><Link2Off className="w-3.5 h-3.5" /></button>
                      ) : (
                        <button onClick={() => onDelete(entry.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                    {linked && netLabel && (
                      <div className="ml-6 text-[11px] text-primary/80 italic">{netLabel}</div>
                    )}
                  </>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Monthly recurring payment splits — read-only */}
      {recurringSplits && recurringSplits.length > 0 && (
        <div className="mb-3 rounded-lg border border-dashed border-border bg-secondary/40 p-2 space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Recurring (week share)</div>
          {recurringSplits.map(({ payment, perWeek }) => (
            <div key={payment.id} className="flex items-center gap-1.5 text-xs">
              <span>{getCategoryEmoji(payment.category, customCategories)}</span>
              <span className="truncate flex-1 text-muted-foreground" title={payment.label}>{payment.label}</span>
              <span className="font-semibold">£{perWeek.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Add Form */}
      <AnimatePresence>
        {addMode && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-2">
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {addMode === 'spend' ? '− Add Spend' : addMode === 'credit' ? '+ Add Credit' : '📊 Add Investment'}
              </div>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9 text-base"
                placeholder="£ amount"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              {addMode !== 'investment' && (
                <Select value={category} onValueChange={(v) => setCategory(v)}>
                  <SelectTrigger className="h-9 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allCategories.map((c) => (
                      <SelectItem key={c} value={c} className="text-base">{getCategoryEmoji(c, customCategories)} {c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {addMode === 'investment' && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground px-1">Investment — tracked separately from budget</div>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer px-1">
                    <input
                      type="checkbox"
                      checked={isRecurringInvestment}
                      onChange={(e) => setIsRecurringInvestment(e.target.checked)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    Make this a recurring investment
                  </label>
                  {isRecurringInvestment && (
                    <div className="rounded-lg border border-dashed border-blue-400/60 bg-blue-50/40 p-2 space-y-2">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Platform</label>
                        <Select value={riPlatform} onValueChange={setRiPlatform}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(investmentPlatforms.length ? investmentPlatforms : ['T212 ISA']).map(p => (
                              <SelectItem key={p} value={p} className="text-sm">{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-muted-foreground">Start date</label>
                          <Input type="date" value={riStart} onChange={e => setRiStart(e.target.value)} className="h-8 text-sm" />
                        </div>
                        <div>
                          <label className="text-[11px] text-muted-foreground">End date</label>
                          <Input type="date" value={riEnd} onChange={e => setRiEnd(e.target.value)} className="h-8 text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Frequency</label>
                        <Select value={riFreq} onValueChange={(v) => setRiFreq(v as 'weekly' | 'fortnightly' | 'monthly')}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly" className="text-sm">Weekly</SelectItem>
                            <SelectItem value="fortnightly" className="text-sm">Fortnightly</SelectItem>
                            <SelectItem value="monthly" className="text-sm">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {riFreq !== 'monthly' && (
                        <div>
                          <label className="text-[11px] text-muted-foreground">Day of the week</label>
                          <Select value={String(riDow)} onValueChange={(v) => setRiDow(Number(v))}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                                <SelectItem key={d} value={String(i)} className="text-sm">{d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <RetailerInput
                value={note}
                onChange={setNote}
                entries={allEntries}
                category={addMode === 'investment' ? 'Investment' : category}
                className="h-9 text-base"
                onEnter={handleAdd}
              />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-9 text-sm" onClick={handleAdd}>Add</Button>
                <Button size="sm" variant="ghost" className="h-9 text-sm" onClick={() => { setAddMode(null); setAmount(''); setNote(''); }}>Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Three distinct add buttons */}
      {!addMode && editingId === null && (
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs border border-dashed border-budget-over/50 hover:border-budget-over hover:text-budget-over hover:bg-budget-over/10 transition-all"
            onClick={() => openAdd('spend')}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Spend
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs border border-dashed border-budget-under/50 hover:border-budget-under hover:text-budget-under hover:bg-budget-under/10 transition-all"
            onClick={() => openAdd('credit')}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Credits
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs border border-dashed border-blue-400/50 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all"
            onClick={() => openAdd('investment')}
          >
            <TrendingUp className="w-3.5 h-3.5 mr-1" /> Add Investment
          </Button>
        </div>
      )}
      </div>
    </motion.div>
  );
}
