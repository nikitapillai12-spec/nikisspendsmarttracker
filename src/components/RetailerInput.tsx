import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { getRetailerSuggestions } from '@/lib/retailers';
import { SpendEntry } from '@/lib/budget-types';

interface RetailerInputProps {
  value: string;
  onChange: (v: string) => void;
  entries: SpendEntry[];
  category?: string;
  className?: string;
  placeholder?: string;
  onEnter?: () => void;
  autoFocus?: boolean;
}

export function RetailerInput({
  value, onChange, entries, category, className,
  placeholder = 'Which shop, retailer or company did you spend this with?',
  onEnter, autoFocus,
}: RetailerInputProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const suggestions = getRetailerSuggestions(entries, value, category);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        autoFocus={autoFocus}
        className={className}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (open && suggestions.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); return; }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); return; }
            if (e.key === 'Tab' || (e.key === 'Enter' && suggestions[highlight] && suggestions[highlight].toLowerCase() !== value.trim().toLowerCase())) {
              e.preventDefault();
              pick(suggestions[highlight]);
              return;
            }
            if (e.key === 'Escape') { setOpen(false); return; }
          }
          if (e.key === 'Enter' && onEnter) { onEnter(); }
        }}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border-2 border-foreground rounded-lg shadow-[4px_4px_0_0_hsl(var(--foreground))] max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-1.5 text-xs font-medium ${i === highlight ? 'bg-primary/15 text-foreground' : 'hover:bg-secondary'}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}