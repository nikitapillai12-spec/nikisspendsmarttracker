import { BudgetData, SpendEntry, CustomCategory, RecurringPayment, InvestmentEntry, DEFAULT_INVESTMENT_PLATFORMS } from './budget-types';
import { supabase } from '@/integrations/supabase/client';
import { getStoredVaultId } from './vault-store';

// In-memory cache. Populated by initStore() after passcode unlock.
let cache: BudgetData = {
  entries: [],
  monthlyBudgets: [],
  customCategories: [],
  categoryBudgets: [],
  recurringPayments: [],
  investmentEntries: [],
  investmentPlatforms: [],
};

let initialized = false;
const listeners = new Set<(d: BudgetData) => void>();

function notify() {
  const snap = { ...cache };
  listeners.forEach(l => l(snap));
}

export function subscribeStore(fn: (d: BudgetData) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function vaultId(): string {
  const id = getStoredVaultId();
  if (!id) throw new Error('No vault id — app not unlocked');
  return id;
}

export async function initStore(): Promise<BudgetData> {
  const vid = getStoredVaultId();
  if (!vid) {
    initialized = true;
    return cache;
  }
  try {
    const [entriesRes, mbRes, cbRes, ccRes, rpRes, ieRes, ipRes] = await Promise.all([
      supabase.from('spend_entries').select('*').eq('vault_id', vid),
      supabase.from('monthly_budgets').select('*').eq('vault_id', vid),
      supabase.from('category_budgets').select('*').eq('vault_id', vid),
      supabase.from('custom_categories').select('*').eq('vault_id', vid),
      supabase.from('recurring_payments').select('*').eq('vault_id', vid),
      supabase.from('investment_entries').select('*').eq('vault_id', vid),
      supabase.from('investment_platforms').select('*').eq('vault_id', vid),
    ]);

    cache = {
      entries: (entriesRes.data || []).map(r => ({
        id: r.id,
        amount: Number(r.amount),
        category: r.category,
        date: r.entry_date,
        createdAt: new Date(r.created_at).getTime(),
        note: (r as any).note ?? undefined,
        type: ((r as any).type ?? 'spend') as 'spend' | 'credit',
      })),
      monthlyBudgets: (mbRes.data || []).map(r => ({
        month: r.month,
        amount: Number(r.amount),
      })),
      categoryBudgets: (cbRes.data || []).map(r => ({
        category: r.category,
        month: r.month,
        amount: Number(r.amount),
      })),
      customCategories: (ccRes.data || []).map(r => ({
        name: r.name,
        emoji: r.emoji,
        color: r.color,
        type: ((r as any).type ?? 'spend') as 'spend' | 'credit',
      })),
      recurringPayments: (rpRes.data || []).map(r => ({
        id: r.id,
        label: r.label,
        amount: Number(r.amount),
        category: r.category,
        startMonth: r.start_month,
        endMonth: r.end_month ?? undefined,
        active: r.active,
      })),
      investmentEntries: (ieRes.data || []).map(r => ({
        id: r.id,
        amount: Number(r.amount),
        platform: r.platform,
        date: r.entry_date,
        note: r.note ?? undefined,
        createdAt: new Date(r.created_at).getTime(),
      })),
      investmentPlatforms: (ipRes.data || []).map(r => r.name),
    };
    await ensureDefaultPlatforms(vid);
  } catch (e) {
    console.error('initStore failed', e);
  }
  initialized = true;
  notify();
  setupRealtime();
  return cache;
}

async function ensureDefaultPlatforms(vid: string) {
  const existing = new Set(cache.investmentPlatforms || []);
  const missing = DEFAULT_INVESTMENT_PLATFORMS.filter(p => !existing.has(p));
  if (missing.length === 0) return;
  const rows = missing.map(name => ({ vault_id: vid, name }));
  const { error } = await supabase.from('investment_platforms').insert(rows);
  if (error) {
    // Likely a unique-constraint race from another device — safe to ignore
    return;
  }
  cache.investmentPlatforms = [...(cache.investmentPlatforms || []), ...missing];
}

// ---------- Realtime sync across devices ----------
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let realtimeVaultId: string | null = null;
let refetchTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefetch() {
  if (refetchTimer) clearTimeout(refetchTimer);
  // Coalesce bursts of changes within 250ms
  refetchTimer = setTimeout(() => { refetchAll(); }, 250);
}

async function refetchAll() {
  const vid = getStoredVaultId();
  if (!vid) return;
  try {
    const [entriesRes, mbRes, cbRes, ccRes, rpRes, ieRes, ipRes] = await Promise.all([
      supabase.from('spend_entries').select('*').eq('vault_id', vid),
      supabase.from('monthly_budgets').select('*').eq('vault_id', vid),
      supabase.from('category_budgets').select('*').eq('vault_id', vid),
      supabase.from('custom_categories').select('*').eq('vault_id', vid),
      supabase.from('recurring_payments').select('*').eq('vault_id', vid),
      supabase.from('investment_entries').select('*').eq('vault_id', vid),
      supabase.from('investment_platforms').select('*').eq('vault_id', vid),
    ]);
    cache = {
      entries: (entriesRes.data || []).map(r => ({
        id: r.id,
        amount: Number(r.amount),
        category: r.category,
        date: r.entry_date,
        createdAt: new Date(r.created_at).getTime(),
        note: (r as any).note ?? undefined,
        type: ((r as any).type ?? 'spend') as 'spend' | 'credit',
      })),
      monthlyBudgets: (mbRes.data || []).map(r => ({ month: r.month, amount: Number(r.amount) })),
      categoryBudgets: (cbRes.data || []).map(r => ({
        category: r.category, month: r.month, amount: Number(r.amount),
      })),
      customCategories: (ccRes.data || []).map(r => ({
        name: r.name, emoji: r.emoji, color: r.color,
        type: ((r as any).type ?? 'spend') as 'spend' | 'credit',
      })),
      recurringPayments: (rpRes.data || []).map(r => ({
        id: r.id,
        label: r.label,
        amount: Number(r.amount),
        category: r.category,
        startMonth: r.start_month,
        endMonth: r.end_month ?? undefined,
        active: r.active,
      })),
      investmentEntries: (ieRes.data || []).map(r => ({
        id: r.id,
        amount: Number(r.amount),
        platform: r.platform,
        date: r.entry_date,
        note: r.note ?? undefined,
        createdAt: new Date(r.created_at).getTime(),
      })),
      investmentPlatforms: (ipRes.data || []).map(r => r.name),
    };
    notify();
  } catch (e) {
    console.error('refetchAll failed', e);
  }
}

function setupRealtime() {
  const vid = getStoredVaultId();
  if (!vid) return;
  if (realtimeChannel && realtimeVaultId === vid) return;
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  realtimeVaultId = vid;
  const filter = `vault_id=eq.${vid}`;
  realtimeChannel = supabase
    .channel(`vault-${vid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'spend_entries', filter }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_budgets', filter }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'category_budgets', filter }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_categories', filter }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_payments', filter }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'investment_entries', filter }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'investment_platforms', filter }, scheduleRefetch)
    .subscribe();
}

// Re-fetch when window regains focus (PWA backgrounded → foreground)
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => { if (getStoredVaultId()) scheduleRefetch(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getStoredVaultId()) scheduleRefetch();
  });
}

export function isInitialized() {
  return initialized;
}

export function getAll(): BudgetData {
  return cache;
}

// ---------- Entries ----------
export function addEntry(entry: SpendEntry): BudgetData {
  cache.entries.push(entry);
  notify();
  supabase.from('spend_entries').insert({
    id: entry.id,
    vault_id: vaultId(),
    entry_date: entry.date,
    amount: entry.amount,
    category: entry.category,
    note: entry.note ?? null,
    type: entry.type ?? 'spend',
  }).then(({ error }) => { if (error) console.error('addEntry sync', error); });
  return cache;
}

export function updateEntry(id: string, updates: Partial<Pick<SpendEntry, 'amount' | 'category' | 'note' | 'type'>>): BudgetData {
  cache.entries = cache.entries.map(e => e.id === id ? { ...e, ...updates } : e);
  notify();
  const patch: { amount?: number; category?: string; note?: string | null; type?: string } = {};
  if (updates.amount !== undefined) patch.amount = updates.amount;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.note !== undefined) patch.note = updates.note ?? null;
  if (updates.type !== undefined) patch.type = updates.type;
  supabase.from('spend_entries').update(patch).eq('id', id)
    .then(({ error }) => { if (error) console.error('updateEntry sync', error); });
  return cache;
}

export function deleteEntry(id: string): BudgetData {
  cache.entries = cache.entries.filter(e => e.id !== id);
  notify();
  supabase.from('spend_entries').delete().eq('id', id)
    .then(({ error }) => { if (error) console.error('deleteEntry sync', error); });
  return cache;
}

// ---------- Monthly budgets ----------
export function setMonthlyBudget(month: string, amount: number): BudgetData {
  const existing = cache.monthlyBudgets.find(b => b.month === month);
  if (existing) existing.amount = amount;
  else cache.monthlyBudgets.push({ month, amount });
  notify();
  supabase.from('monthly_budgets').upsert(
    { vault_id: vaultId(), month, amount },
    { onConflict: 'vault_id,month' }
  ).then(({ error }) => { if (error) console.error('setMonthlyBudget sync', error); });
  return cache;
}

export function getMonthlyBudget(month: string): number | null {
  return getEffectiveMonthlyBudget(cache, month);
}

export function getEffectiveMonthlyBudget(data: BudgetData, month: string): number | null {
  const eligible = data.monthlyBudgets
    .filter(b => b.month <= month)
    .sort((a, b) => b.month.localeCompare(a.month));
  return eligible.length ? eligible[0].amount : null;
}

// ---------- Category budgets ----------
export function setCategoryBudget(category: string, month: string, amount: number): BudgetData {
  if (!cache.categoryBudgets) cache.categoryBudgets = [];
  const existing = cache.categoryBudgets.find(b => b.category === category && b.month === month);
  if (existing) existing.amount = amount;
  else cache.categoryBudgets.push({ category, month, amount });
  notify();
  supabase.from('category_budgets').upsert(
    { vault_id: vaultId(), category, month, amount },
    { onConflict: 'vault_id,category,month' }
  ).then(({ error }) => { if (error) console.error('setCategoryBudget sync', error); });
  return cache;
}

export function deleteCategoryBudget(category: string, month: string): BudgetData {
  cache.categoryBudgets = (cache.categoryBudgets || []).filter(
    b => !(b.category === category && b.month === month)
  );
  notify();
  supabase.from('category_budgets').delete()
    .eq('vault_id', vaultId()).eq('category', category).eq('month', month)
    .then(({ error }) => { if (error) console.error('deleteCategoryBudget sync', error); });
  return cache;
}

export function getEffectiveCategoryBudget(
  data: BudgetData,
  category: string,
  month: string
): number | null {
  const list = data.categoryBudgets || [];
  const eligible = list
    .filter(b => b.category === category && b.month <= month)
    .sort((a, b) => b.month.localeCompare(a.month));
  return eligible.length ? eligible[0].amount : null;
}

export function getEntriesForDate(date: string): SpendEntry[] {
  return cache.entries.filter(e => e.date === date);
}

export function getEntriesForWeek(weekStart: string, weekEnd: string): SpendEntry[] {
  return cache.entries.filter(e => e.date >= weekStart && e.date <= weekEnd);
}

// ---------- Custom categories ----------
export function addCustomCategory(cat: CustomCategory): BudgetData {
  cache.customCategories.push(cat);
  notify();
  supabase.from('custom_categories').insert({
    vault_id: vaultId(),
    name: cat.name,
    emoji: cat.emoji,
    color: cat.color,
    type: cat.type ?? 'spend',
  }).then(({ error }) => { if (error) console.error('addCustomCategory sync', error); });
  return cache;
}

export function updateCustomCategory(oldName: string, cat: CustomCategory): BudgetData {
  cache.customCategories = cache.customCategories.map(c => c.name === oldName ? cat : c);
  if (oldName !== cat.name) {
    cache.entries = cache.entries.map(e => e.category === oldName ? { ...e, category: cat.name } : e);
  }
  notify();
  const vid = vaultId();
  supabase.from('custom_categories').update({
    name: cat.name, emoji: cat.emoji, color: cat.color, type: cat.type ?? 'spend',
  }).eq('vault_id', vid).eq('name', oldName)
    .then(({ error }) => { if (error) console.error('updateCustomCategory sync', error); });
  if (oldName !== cat.name) {
    supabase.from('spend_entries').update({ category: cat.name })
      .eq('vault_id', vid).eq('category', oldName)
      .then(({ error }) => { if (error) console.error('rename entries sync', error); });
  }
  return cache;
}

export function deleteCustomCategory(name: string): BudgetData {
  cache.customCategories = cache.customCategories.filter(c => c.name !== name);
  notify();
  supabase.from('custom_categories').delete()
    .eq('vault_id', vaultId()).eq('name', name)
    .then(({ error }) => { if (error) console.error('deleteCustomCategory sync', error); });
  return cache;
}

// ---------- Migration: push existing localStorage data to new vault ----------
const LEGACY_KEY = 'budget-tracker-data';

export async function migrateLocalDataIfAny(): Promise<boolean> {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return false;
  try {
    const parsed: BudgetData = JSON.parse(raw);
    const vid = getStoredVaultId();
    if (!vid) return false;

    if (parsed.customCategories?.length) {
      await supabase.from('custom_categories').upsert(
        parsed.customCategories.map(c => ({
          vault_id: vid, name: c.name, emoji: c.emoji, color: c.color,
        })),
        { onConflict: 'vault_id,name' }
      );
    }
    if (parsed.monthlyBudgets?.length) {
      await supabase.from('monthly_budgets').upsert(
        parsed.monthlyBudgets.map(b => ({
          vault_id: vid, month: b.month, amount: b.amount,
        })),
        { onConflict: 'vault_id,month' }
      );
    }
    if (parsed.categoryBudgets?.length) {
      await supabase.from('category_budgets').upsert(
        parsed.categoryBudgets.map(b => ({
          vault_id: vid, category: b.category, month: b.month, amount: b.amount,
        })),
        { onConflict: 'vault_id,category,month' }
      );
    }
    if (parsed.entries?.length) {
      await supabase.from('spend_entries').upsert(
        parsed.entries.map(e => ({
          id: e.id,
          vault_id: vid,
          entry_date: e.date,
          amount: e.amount,
          category: e.category,
          note: e.note ?? null,
        })),
        { onConflict: 'id' }
      );
    }
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch (e) {
    console.error('migrateLocalDataIfAny failed', e);
    return false;
  }
}
