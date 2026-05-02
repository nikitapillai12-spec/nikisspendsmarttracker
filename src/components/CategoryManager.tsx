import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, Check, X, Settings2 } from 'lucide-react';
import { CustomCategory, DEFAULT_CATEGORIES, DEFAULT_CREDIT_CATEGORIES, EntryType, getCategoryEmoji } from '@/lib/budget-types';
import { addCustomCategory, updateCustomCategory, deleteCustomCategory } from '@/lib/budget-store';
import { BudgetData } from '@/lib/budget-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const EMOJI_OPTIONS = ['🏷️', '🎯', '🎮', '🎵', '📚', '🏋️', '🚗', '🍕', '🎬', '🛍️', '💻', '🏥', '🐕', '🎨', '🏖️', '🍷', '🧹', '💼'];
const COLOR_OPTIONS = [
  'hsl(0, 75%, 58%)', 'hsl(25, 90%, 55%)', 'hsl(45, 85%, 52%)',
  'hsl(120, 60%, 45%)', 'hsl(160, 65%, 48%)', 'hsl(200, 75%, 55%)',
  'hsl(250, 65%, 60%)', 'hsl(290, 60%, 58%)', 'hsl(330, 70%, 58%)',
  'hsl(15, 80%, 52%)', 'hsl(180, 65%, 45%)', 'hsl(60, 70%, 48%)',
];

interface CategoryManagerProps {
  data: BudgetData;
  onDataChange: (data: BudgetData) => void;
}

export function CategoryManager({ data, onDataChange }: CategoryManagerProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏷️');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [tab, setTab] = useState<EntryType>('spend');

  const customSpend = data.customCategories.filter(c => (c.type ?? 'spend') === 'spend');
  const customCredit = data.customCategories.filter(c => c.type === 'credit');
  const customForTab = tab === 'credit' ? customCredit : customSpend;
  const defaultsForTab = tab === 'credit' ? DEFAULT_CREDIT_CATEGORIES : DEFAULT_CATEGORIES;

  const handleAdd = () => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    const allDefaults = [...DEFAULT_CATEGORIES, ...DEFAULT_CREDIT_CATEGORIES];
    if (allDefaults.includes(trimmed as any) || data.customCategories.some(c => c.name === trimmed)) return;
    onDataChange(addCustomCategory({ name: trimmed, emoji, color, type: tab }));
    resetForm();
  };

  const handleUpdate = (oldName: string) => {
    if (!name.trim()) return;
    const original = data.customCategories.find(c => c.name === oldName);
    onDataChange(updateCustomCategory(oldName, {
      name: name.trim(),
      emoji,
      color,
      type: original?.type ?? tab,
    }));
    resetForm();
  };

  const handleDelete = (catName: string) => {
    onDataChange(deleteCustomCategory(catName));
  };

  const startEdit = (cat: CustomCategory) => {
    setEditingName(cat.name);
    setName(cat.name);
    setEmoji(cat.emoji);
    setColor(cat.color);
    setAdding(false);
  };

  const resetForm = () => {
    setAdding(false);
    setEditingName(null);
    setName('');
    setEmoji('🏷️');
    setColor(COLOR_OPTIONS[0]);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings2 className="w-4 h-4" />
          Categories
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Manage Categories</DialogTitle>
        </DialogHeader>

        {/* Tab switcher: Spend vs Credit */}
        <div className="grid grid-cols-2 gap-1 p-0.5 rounded-full bg-secondary mt-2 text-xs">
          <button
            type="button"
            onClick={() => { setTab('spend'); resetForm(); }}
            className={`rounded-full py-1.5 font-semibold transition-colors ${tab === 'spend' ? 'bg-budget-over/20 text-budget-over' : 'text-muted-foreground'}`}
          >− Spend Categories</button>
          <button
            type="button"
            onClick={() => { setTab('credit'); resetForm(); }}
            className={`rounded-full py-1.5 font-semibold transition-colors ${tab === 'credit' ? 'bg-budget-under/20 text-budget-under' : 'text-muted-foreground'}`}
          >+ Credit Categories</button>
        </div>

        <div className="space-y-2 mt-3">
          {/* Default categories for the active tab */}
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Default</p>
          <div className="flex flex-wrap gap-2">
            {defaultsForTab.map(cat => (
              <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                {getCategoryEmoji(cat, [])} {cat}
              </span>
            ))}
          </div>

          {/* Custom categories */}
          {customForTab.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-4">Custom</p>
              <div className="space-y-2">
                <AnimatePresence>
                  {customForTab.map(cat => (
                    <motion.div
                      key={cat.name}
                      layout
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="flex items-center gap-2 p-2 rounded-lg bg-secondary/50"
                    >
                      {editingName === cat.name ? (
                        <div className="flex-1 space-y-2">
                          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Category name" className="h-8 text-sm" />
                          <div className="flex gap-1 flex-wrap">
                            {EMOJI_OPTIONS.map(e => (
                              <button key={e} onClick={() => setEmoji(e)} className={`text-lg p-0.5 rounded ${emoji === e ? 'bg-primary/20 ring-2 ring-primary' : ''}`}>{e}</button>
                            ))}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {COLOR_OPTIONS.map(c => (
                              <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full ${color === c ? 'ring-2 ring-primary ring-offset-2' : ''}`} style={{ background: c }} />
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 text-xs" onClick={() => handleUpdate(cat.name)}><Check className="w-3 h-3 mr-1" />Save</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetForm}><X className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: cat.color }}><span className="text-xs">{cat.emoji}</span></span>
                          <span className="flex-1 text-sm font-medium">{cat.name}</span>
                          <button onClick={() => startEdit(cat)} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(cat.name)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}

          {/* Add new */}
          {adding ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 p-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 mt-4">
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={tab === 'credit' ? 'Credit category name' : 'Spend category name'} className="h-8 text-sm" autoFocus />
              <div className="flex gap-1 flex-wrap">
                {EMOJI_OPTIONS.map(e => (
                  <button key={e} onClick={() => setEmoji(e)} className={`text-lg p-0.5 rounded ${emoji === e ? 'bg-primary/20 ring-2 ring-primary' : ''}`}>{e}</button>
                ))}
              </div>
              <div className="flex gap-1 flex-wrap">
                {COLOR_OPTIONS.map(c => (
                  <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full ${color === c ? 'ring-2 ring-primary ring-offset-2' : ''}`} style={{ background: c }} />
                ))}
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="h-7 text-xs" onClick={handleAdd}><Check className="w-3 h-3 mr-1" />Add</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetForm}>Cancel</Button>
              </div>
            </motion.div>
          ) : (
            <Button variant="outline" size="sm" className="w-full border-dashed mt-4" onClick={() => { setAdding(true); setEditingName(null); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Custom {tab === 'credit' ? 'Credit' : 'Spend'} Category
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
