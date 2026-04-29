import { SpendEntry } from './budget-types';

/**
 * Returns a deduped, frequency-sorted list of retailer notes from past entries.
 * Optionally filters to a specific category (so suggestions are context-aware).
 */
export function getRetailerSuggestions(
  entries: SpendEntry[],
  query: string,
  category?: string,
  limit = 6
): string[] {
  const q = query.trim().toLowerCase();
  const counts = new Map<string, number>();

  for (const e of entries) {
    if (!e.note) continue;
    const note = e.note.trim();
    if (!note) continue;
    if (category && e.category !== category) {
      // de-prioritise but don't exclude — still useful
      counts.set(note, (counts.get(note) || 0) + 0.25);
    } else {
      counts.set(note, (counts.get(note) || 0) + 1);
    }
  }

  const all = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  if (!q) return all.slice(0, limit);
  return all.filter(n => n.toLowerCase().includes(q)).slice(0, limit);
}

/**
 * Top retailers by total spend for a given filter.
 */
export function topRetailers(
  entries: SpendEntry[],
  filter?: (e: SpendEntry) => boolean,
  limit = 10
): { note: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (!e.note?.trim()) continue;
    if (filter && !filter(e)) continue;
    const k = e.note.trim();
    totals.set(k, (totals.get(k) || 0) + e.amount);
  }
  return Array.from(totals.entries())
    .map(([note, total]) => ({ note, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}