import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { SpendEntry, Category, CustomCategory, getAllCategories, getCategoryColor, getCategoryEmoji } from '@/lib/budget-types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatDisplayDate, isToday } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RetailerInput } from './RetailerInput';

interface DayBoxProps {
  date: Date;
  dateStr: string;
  entries: SpendEntry[];
  customCategories: CustomCategory[];
  /** All entries across history — used to power retailer autocomplete suggestions. */
  allEntries: SpendEntry[];
  onAdd: (amount: number, category: Category, note?: string) => void;
  onUpdate: (id: string, amount: number, category: Category, note?: string) => void;
  onDelete: (id: string) => void;
}

export function DayBox({ date, dateStr, entries, customCategories, allEntries, onAdd, onUpdate, onDelete }: DayBoxProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('Groceries');
  const [note, setNote] = useState('');

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const today = isToday(date);
  const allCategories = getAllCategories(customCategories);

  const pieData = Object.entries(
    entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  // Retailers per category for this day (for pie hover)
  const retailersByCat: Record<string, { note: string; total: number }[]> = {};
  for (const cat of pieData.map(p => p.name)) {
    const totals = new Map<string, number>();
    entries.filter(e => e.category === cat && e.note?.trim())
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

  const handleAdd = () => {
    const val = parseFloat(amount);
    if (val > 0) {
      onAdd(val, category, note.trim() || undefined);
      setAmount('');
      setCategory('Groceries');
      setNote('');
      setIsAdding(false);
    }
  };

  const handleUpdate = (id: string) => {
    const val = parseFloat(amount);
    if (val > 0) {
      onUpdate(id, val, category, note.trim() || undefined);
      setEditingId(null);
      setAmount('');
      setNote('');
    }
  };

  const startEdit = (entry: SpendEntry) => {
    setEditingId(entry.id);
    setAmount(entry.amount.toString());
    setCategory(entry.category);
    setNote(entry.note || '');
    setIsAdding(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border border-border p-4 transition-all bg-card mcm-shadow hover:-translate-y-0.5 ${
        today
          ? 'bg-primary/10'
          : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-normal text-lg tracking-wide leading-none">
            {formatDisplayDate(date)}
          </h3>
          {today && (
            <span className="text-sm font-semibold text-primary font-serif-mcm italic">✦ Today</span>
          )}
        </div>
        {total > 0 && (
          <motion.span
            key={total}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="font-display font-normal text-2xl text-primary tracking-wide"
          >
            £{total.toFixed(2)}
          </motion.span>
        )}
      </div>

      {/* Pie Chart */}
      {pieData.length > 0 && (
        <div className="h-44 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="92%"
                innerRadius="55%"
                strokeWidth={1.5}
                stroke="hsl(var(--card))"
              >
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
          {entries.map((entry) => (
            <motion.div key={entry.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex items-center gap-1.5 text-sm group">
              {editingId === entry.id ? (
                <div className="flex flex-col gap-1.5 w-full">
                  <div className="flex gap-1.5">
                    <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 text-sm flex-1" placeholder="£" />
                    <Select value={category} onValueChange={(v) => setCategory(v)}>
                      <SelectTrigger className="h-8 text-sm flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {allCategories.map((c) => (
                          <SelectItem key={c} value={c} className="text-sm">{getCategoryEmoji(c, customCategories)} {c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <RetailerInput
                    value={note}
                    onChange={setNote}
                    entries={allEntries}
                    category={category}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 text-sm px-2" onClick={() => handleUpdate(entry.id)}><Check className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 text-sm px-2" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="shrink-0">{getCategoryEmoji(entry.category, customCategories)}</span>
                  <div className="truncate flex-1 min-w-0 text-muted-foreground text-sm" title={entry.note ? `${entry.category} (${entry.note})` : entry.category}>
                    {entry.category}
                    {entry.note && (
                      <span className="text-foreground/80 font-medium"> ({entry.note})</span>
                    )}
                  </div>
                  <span className="font-semibold">£{entry.amount.toFixed(2)}</span>
                  <button onClick={() => startEdit(entry)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => onDelete(entry.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-2">
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-base" placeholder="£ amount" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
              <Select value={category} onValueChange={(v) => setCategory(v)}>
                <SelectTrigger className="h-9 text-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allCategories.map((c) => (
                    <SelectItem key={c} value={c} className="text-base">{getCategoryEmoji(c, customCategories)} {c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <RetailerInput
                value={note}
                onChange={setNote}
                entries={allEntries}
                category={category}
                className="h-9 text-base"
                onEnter={handleAdd}
              />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-9 text-sm" onClick={handleAdd}>Add</Button>
                <Button size="sm" variant="ghost" className="h-9 text-sm" onClick={() => { setIsAdding(false); setAmount(''); setNote(''); }}>Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isAdding && editingId === null && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-9 text-sm border border-dashed border-border hover:border-primary hover:text-primary hover:bg-primary/10 transition-all"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Spend
        </Button>
      )}
    </motion.div>
  );
}
