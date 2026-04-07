import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { SpendEntry, CATEGORIES, Category, CATEGORY_COLORS, CATEGORY_EMOJI } from '@/lib/budget-types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatDisplayDate, isToday } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DayBoxProps {
  date: Date;
  dateStr: string;
  entries: SpendEntry[];
  onAdd: (amount: number, category: Category) => void;
  onUpdate: (id: string, amount: number, category: Category) => void;
  onDelete: (id: string) => void;
}

export function DayBox({ date, dateStr, entries, onAdd, onUpdate, onDelete }: DayBoxProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('Groceries');

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const today = isToday(date);

  const pieData = Object.entries(
    entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const handleAdd = () => {
    const val = parseFloat(amount);
    if (val > 0) {
      onAdd(val, category);
      setAmount('');
      setCategory('Groceries');
      setIsAdding(false);
    }
  };

  const handleUpdate = (id: string) => {
    const val = parseFloat(amount);
    if (val > 0) {
      onUpdate(id, val, category);
      setEditingId(null);
      setAmount('');
    }
  };

  const startEdit = (entry: SpendEntry) => {
    setEditingId(entry.id);
    setAmount(entry.amount.toString());
    setCategory(entry.category);
    setIsAdding(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border-2 p-4 transition-all ${
        today
          ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
          : 'border-border bg-card hover:border-primary/30'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-sm">
            {formatDisplayDate(date)}
          </h3>
          {today && (
            <span className="text-xs font-medium text-primary">Today</span>
          )}
        </div>
        {total > 0 && (
          <motion.span
            key={total}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="font-display font-bold text-lg"
          >
            £{total.toFixed(2)}
          </motion.span>
        )}
      </div>

      {/* Pie Chart */}
      {pieData.length > 0 && (
        <div className="h-28 mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={45}
                innerRadius={25}
                strokeWidth={2}
                stroke="hsl(var(--card))"
              >
                {pieData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={CATEGORY_COLORS[entry.name as Category]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `£${value.toFixed(2)}`}
                contentStyle={{
                  borderRadius: '8px',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  fontSize: '12px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Entries List */}
      <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
        <AnimatePresence>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex items-center gap-1.5 text-xs group"
            >
              {editingId === entry.id ? (
                <div className="flex flex-col gap-1.5 w-full">
                  <div className="flex gap-1.5">
                    <Input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="h-7 text-xs flex-1"
                      placeholder="£"
                    />
                    <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {CATEGORY_EMOJI[c]} {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-xs px-2" onClick={() => handleUpdate(entry.id)}>
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="shrink-0">{CATEGORY_EMOJI[entry.category]}</span>
                  <span className="truncate flex-1 text-muted-foreground">{entry.category}</span>
                  <span className="font-semibold">£{entry.amount.toFixed(2)}</span>
                  <button
                    onClick={() => startEdit(entry)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDelete(entry.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-2"
          >
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-8 text-sm"
                placeholder="£ amount"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="text-sm">
                      {CATEGORY_EMOJI[c]} {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1.5">
                <Button size="sm" className="flex-1 h-7" onClick={handleAdd}>
                  Add
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => { setIsAdding(false); setAmount(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isAdding && editingId === null && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs border-dashed hover:border-primary hover:text-primary transition-colors"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Spend
        </Button>
      )}
    </motion.div>
  );
}
