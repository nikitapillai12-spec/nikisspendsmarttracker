import { BudgetData, SpendEntry, CustomCategory, RecurringPayment, InvestmentEntry, AnnualBudget, BudgetPlan, RecurringInvestment, DEFAULT_INVESTMENT_PLATFORMS } from './budget-types';
import { supabase } from '@/integrations/supabase/client';
import { getStoredVaultId } from './vault-store';

// In-memory cache. Populated by initStore() after passcode unlock.
let cache: BudgetData = {
  entries: [],
  monthlyBudgets: [],
  customCategories: [],
  categoryBudgets: [],
  annualBudgets: [],
  recurringPayments: [],
  investmentEntries: [],
  investmentPlatforms: [],
  budgetPlan: null,
  recurringInvestments: [],
};

let initialized = false;
const listeners = new Set<(d: BudgetData) => void>();

function mapPlan(r: any): BudgetPlan {
  return {
    id: r.id,
    startDate: r.start_date,
    endDate: r.end_date,
    categories: (r.categories || {}) as Record<string, number>,
    locked: !!r.locked,
  };
}

function mapRecInv(r: any): RecurringInvestment {
  return {
    id: r.id,
    amount: Number(r.amount),
    platform: r.platform,
    startDate: r.start_date,
    endDate: r.end_date ?? undefined,
    frequency: (r.frequency ?? 'monthly') as RecurringInvestment['frequency'],
    dayOfWeek: r.day_of_week ?? undefined,
    note: r.note ?? undefined,
    active: !!r.active,
  };
}

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

async function fetchAll(vid: string): Promise<BudgetData> {
  const [entriesRes, mbRes, cbRes, ccRes, rpRes, ieRes, ipRes, abRes, bpRes, riRes] = await Promise.all([
    supabase.from('spend_entries').select('*').eq('vault_id', vid),
    supabase.from('monthly_budgets').select('*').eq('vault_id', vid),
    supabase.from('category_budgets').select('*').eq('vault_id', vid),
    supabase.from('custom_categories').select('*').eq('vault_id', vid),
    supabase.from('recurring_payments').select('*').eq('vault_id', vid),
    supabase.from('investment_entries').select('*').eq('vault_id', vid),
    supabase.from('investment_platforms').select('*').eq('vault_id', vid),
    supabase.from('annual_budgets').select('*').eq('vault_id', vid),
    supabase.from('budget_plans').select('*').eq('vault_id', vid).order('created_at', { ascending: false }).limit(1),
    supabase.from('recurring_investments').select('*').eq('vault_id', vid),
  ]);

  return {
    entries: (entriesRes.data || []).map(r => ({
      id: r.id,
      amount: Number(r.amount),
      category: r.category,
      date: r.entry_date,
      createdAt: new Date(r.created_at).getTime(),
      note: (r as any).note ?? undefined,
      type: ((r as any).type ?? 'spend') as 'spend' | 'credit' | 'investment',
      refundPairId: (r as any).refund_pair_id ?? undefined,
    })),
    monthlyBudgets: (mbRes.data || []).map(r => ({ month: r.month, amount: Number(r.amount) })),
    categoryBudgets: (cbRes.data || []).map(r => ({
      category: r.category, month: r.month, amount: Number(r.amount),
    })),
    annualBudgets: (abRes.data || []).map(r => ({
      year: Number(r.year), label: r.label, amount: Number(r.amount), categories: r.categories as string[],
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
    budgetPlan: (bpRes.data && bpRes.data.length) ? mapPlan(bpRes.data[0]) : null,
    recurringInvestments: (riRes.data || []).map(mapRecInv),
  };
}

export async function initStore(): Promise<BudgetData> {
  const vid = getStoredVaultId();
  if (!vid) {
    initialized = true;
    return cache;
  }
  try {
    cache = await fetchAll(vid);
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
    cache = await fetchAll(vid);
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'annual_budgets', filter }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_plans', filter }, scheduleRefetch)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_investments', filter }, scheduleRefetch)
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
    refund_pair_id: (entry as any).refundPairId ?? null,
  }).then(({ error }) => { if (error) console.error('addEntry sync', error); });
  return cache;
}

/** Link two entries as a spend/refund pair by setting refundPairId on both. */
export function linkRefundPair(spendId: string, creditId: string): BudgetData {
  cache.entries = cache.entries.map(e => {
    if (e.id === spendId) return { ...e, refundPairId: creditId };
    if (e.id === creditId) return { ...e, refundPairId: spendId };
    return e;
  });
  notify();
  const vid = vaultId();
  supabase.from('spend_entries').update({ refund_pair_id: creditId } as any).eq('id', spendId).eq('vault_id', vid)
    .then(({ error }) => { if (error) console.error('linkRefundPair spend sync', error); });
  supabase.from('spend_entries').update({ refund_pair_id: spendId } as any).eq('id', creditId).eq('vault_id', vid)
    .then(({ error }) => { if (error) console.error('linkRefundPair credit sync', error); });
  return cache;
}

/** Unlink a refund pair. */
export function unlinkRefundPair(entryId: string): BudgetData {
  const entry = cache.entries.find(e => e.id === entryId);
  const pairedId = entry?.refundPairId;
  cache.entries = cache.entries.map(e => {
    if (e.id === entryId || e.id === pairedId) {
      const { refundPairId: _, ...rest } = e as any;
      return rest;
    }
    return e;
  });
  notify();
  const vid = vaultId();
  supabase.from('spend_entries').update({ refund_pair_id: null } as any).eq('id', entryId).eq('vault_id', vid)
    .then(({ error }) => { if (error) console.error('unlinkRefundPair sync', error); });
  if (pairedId) {
    supabase.from('spend_entries').update({ refund_pair_id: null } as any).eq('id', pairedId).eq('vault_id', vid)
      .then(({ error }) => { if (error) console.error('unlinkRefundPair paired sync', error); });
  }
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

// ---------- Recurring monthly payments ----------
export function addRecurringPayment(p: RecurringPayment): BudgetData {
  cache.recurringPayments = [...(cache.recurringPayments || []), p];
  notify();
  supabase.from('recurring_payments').insert({
    id: p.id,
    vault_id: vaultId(),
    label: p.label,
    amount: p.amount,
    category: p.category,
    start_month: p.startMonth,
    end_month: p.endMonth ?? null,
    active: p.active,
  }).then(({ error }) => { if (error) console.error('addRecurringPayment sync', error); });
  return cache;
}

export function updateRecurringPayment(id: string, updates: Partial<Omit<RecurringPayment, 'id'>>): BudgetData {
  cache.recurringPayments = (cache.recurringPayments || []).map(p =>
    p.id === id ? { ...p, ...updates } : p
  );
  notify();
  const patch: { label?: string; amount?: number; category?: string; start_month?: string; end_month?: string | null; active?: boolean } = {};
  if (updates.label !== undefined) patch.label = updates.label;
  if (updates.amount !== undefined) patch.amount = updates.amount;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.startMonth !== undefined) patch.start_month = updates.startMonth;
  if (updates.endMonth !== undefined) patch.end_month = updates.endMonth ?? null;
  if (updates.active !== undefined) patch.active = updates.active;
  supabase.from('recurring_payments').update(patch).eq('id', id)
    .then(({ error }) => { if (error) console.error('updateRecurringPayment sync', error); });
  return cache;
}

export function deleteRecurringPayment(id: string): BudgetData {
  cache.recurringPayments = (cache.recurringPayments || []).filter(p => p.id !== id);
  notify();
  supabase.from('recurring_payments').delete().eq('id', id)
    .then(({ error }) => { if (error) console.error('deleteRecurringPayment sync', error); });
  return cache;
}

// ---------- Investment entries ----------
export function addInvestmentEntry(e: InvestmentEntry): BudgetData {
  cache.investmentEntries = [...(cache.investmentEntries || []), e];
  notify();
  supabase.from('investment_entries').insert({
    id: e.id,
    vault_id: vaultId(),
    amount: e.amount,
    platform: e.platform,
    entry_date: e.date,
    note: e.note ?? null,
  }).then(({ error }) => { if (error) console.error('addInvestmentEntry sync', error); });
  return cache;
}

export function updateInvestmentEntry(id: string, updates: Partial<Pick<InvestmentEntry, 'amount' | 'platform' | 'date' | 'note'>>): BudgetData {
  cache.investmentEntries = (cache.investmentEntries || []).map(e =>
    e.id === id ? { ...e, ...updates } : e
  );
  notify();
  const patch: { amount?: number; platform?: string; entry_date?: string; note?: string | null } = {};
  if (updates.amount !== undefined) patch.amount = updates.amount;
  if (updates.platform !== undefined) patch.platform = updates.platform;
  if (updates.date !== undefined) patch.entry_date = updates.date;
  if (updates.note !== undefined) patch.note = updates.note ?? null;
  supabase.from('investment_entries').update(patch).eq('id', id)
    .then(({ error }) => { if (error) console.error('updateInvestmentEntry sync', error); });
  return cache;
}

export function deleteInvestmentEntry(id: string): BudgetData {
  cache.investmentEntries = (cache.investmentEntries || []).filter(e => e.id !== id);
  notify();
  supabase.from('investment_entries').delete().eq('id', id)
    .then(({ error }) => { if (error) console.error('deleteInvestmentEntry sync', error); });
  return cache;
}

// ---------- Annual budgets ----------
export function setAnnualBudget(budget: AnnualBudget): BudgetData {
  if (!cache.annualBudgets) cache.annualBudgets = [];
  const idx = cache.annualBudgets.findIndex(b => b.year === budget.year && b.label === budget.label);
  if (idx >= 0) cache.annualBudgets[idx] = budget;
  else cache.annualBudgets.push(budget);
  notify();
  supabase.from('annual_budgets').upsert(
    { vault_id: vaultId(), year: budget.year, label: budget.label, amount: budget.amount, categories: budget.categories },
    { onConflict: 'vault_id,year,label' }
  ).then(({ error }) => { if (error) console.error('setAnnualBudget sync', error); });
  return cache;
}

export function deleteAnnualBudget(year: number, label: string): BudgetData {
  cache.annualBudgets = (cache.annualBudgets || []).filter(b => !(b.year === year && b.label === label));
  notify();
  supabase.from('annual_budgets').delete()
    .eq('vault_id', vaultId()).eq('year', year).eq('label', label)
    .then(({ error }) => { if (error) console.error('deleteAnnualBudget sync', error); });
  return cache;
}

export function getAnnualBudget(year: number, label: string): AnnualBudget | null {
  return (cache.annualBudgets || []).find(b => b.year === year && b.label === label) ?? null;
}

// ---------- Investment platforms ----------
export function addInvestmentPlatform(name: string): BudgetData {
  const trimmed = name.trim();
  if (!trimmed) return cache;
  if ((cache.investmentPlatforms || []).includes(trimmed)) return cache;
  cache.investmentPlatforms = [...(cache.investmentPlatforms || []), trimmed];
  notify();
  supabase.from('investment_platforms').insert({ vault_id: vaultId(), name: trimmed })
    .then(({ error }) => { if (error) console.error('addInvestmentPlatform sync', error); });
  return cache;
}

export function deleteInvestmentPlatform(name: string): BudgetData {
  cache.investmentPlatforms = (cache.investmentPlatforms || []).filter(n => n !== name);
  notify();
  supabase.from('investment_platforms').delete()
    .eq('vault_id', vaultId()).eq('name', name)
    .then(({ error }) => { if (error) console.error('deleteInvestmentPlatform sync', error); });
  return cache;
}

// ---------- Backup / Restore ----------

/** Returns a full snapshot of the current vault data, suitable for JSON export. */
export function exportSnapshot(): BudgetData & { _meta: { exportedAt: string; vaultId: string } } {
  return {
    ...cache,
    _meta: {
      exportedAt: new Date().toISOString(),
      vaultId: getStoredVaultId() ?? '',
    },
  };
}

/** Saves today's snapshot to Cloud (one snapshot per vault per day). */
export async function saveDailyBackupToCloud(): Promise<{ saved: boolean; date: string }> {
  const vid = getStoredVaultId();
  const today = new Date().toISOString().slice(0, 10);
  if (!vid) return { saved: false, date: today };
  const snap = exportSnapshot();
  const { error } = await supabase.from('backup_snapshots').upsert(
    { vault_id: vid, snapshot_date: today, data: snap as any },
    { onConflict: 'vault_id,snapshot_date' }
  );
  if (error) {
    console.error('saveDailyBackupToCloud', error);
    return { saved: false, date: today };
  }
  return { saved: true, date: today };
}

export interface BackupListItem { id: string; date: string; createdAt: string; }

export async function listCloudBackups(): Promise<BackupListItem[]> {
  const vid = getStoredVaultId();
  if (!vid) return [];
  const { data, error } = await supabase
    .from('backup_snapshots')
    .select('id, snapshot_date, created_at')
    .eq('vault_id', vid)
    .order('snapshot_date', { ascending: false })
    .limit(60);
  if (error) { console.error('listCloudBackups', error); return []; }
  return (data || []).map(r => ({ id: r.id, date: r.snapshot_date, createdAt: r.created_at }));
}

export async function fetchCloudBackup(id: string): Promise<BudgetData | null> {
  const { data, error } = await supabase
    .from('backup_snapshots').select('data').eq('id', id).maybeSingle();
  if (error || !data) { console.error('fetchCloudBackup', error); return null; }
  return data.data as unknown as BudgetData;
}

/** Restore a backup payload into the cloud DB for the current vault.
 *  Existing rows with conflicting ids/keys are upserted (overwritten). */
export async function restoreFromBackup(payload: BudgetData): Promise<boolean> {
  const vid = getStoredVaultId();
  if (!vid) return false;
  try {
    if (payload.customCategories?.length) {
      await supabase.from('custom_categories').upsert(
        payload.customCategories.map(c => ({
          vault_id: vid, name: c.name, emoji: c.emoji, color: c.color, type: c.type ?? 'spend',
        })),
        { onConflict: 'vault_id,name' }
      );
    }
    if (payload.monthlyBudgets?.length) {
      await supabase.from('monthly_budgets').upsert(
        payload.monthlyBudgets.map(b => ({ vault_id: vid, month: b.month, amount: b.amount })),
        { onConflict: 'vault_id,month' }
      );
    }
    if (payload.categoryBudgets?.length) {
      await supabase.from('category_budgets').upsert(
        payload.categoryBudgets.map(b => ({
          vault_id: vid, category: b.category, month: b.month, amount: b.amount,
        })),
        { onConflict: 'vault_id,category,month' }
      );
    }
    if (payload.recurringPayments?.length) {
      await supabase.from('recurring_payments').upsert(
        payload.recurringPayments.map(p => ({
          id: p.id, vault_id: vid, label: p.label, amount: p.amount, category: p.category,
          start_month: p.startMonth, end_month: p.endMonth ?? null, active: p.active,
        })),
        { onConflict: 'id' }
      );
    }
    if (payload.investmentPlatforms?.length) {
      await supabase.from('investment_platforms').upsert(
        payload.investmentPlatforms.map(name => ({ vault_id: vid, name })),
        { onConflict: 'vault_id,name' }
      );
    }
    if (payload.investmentEntries?.length) {
      await supabase.from('investment_entries').upsert(
        payload.investmentEntries.map(e => ({
          id: e.id, vault_id: vid, amount: e.amount, platform: e.platform,
          entry_date: e.date, note: e.note ?? null,
        })),
        { onConflict: 'id' }
      );
    }
    if (payload.entries?.length) {
      // Chunk to avoid oversized payloads
      const rows = payload.entries.map(e => ({
        id: e.id, vault_id: vid, entry_date: e.date, amount: e.amount,
        category: e.category, note: e.note ?? null, type: e.type ?? 'spend',
      }));
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { error } = await supabase.from('spend_entries').upsert(slice, { onConflict: 'id' });
        if (error) { console.error('restoreFromBackup entries chunk', error); return false; }
      }
    }
    await refetchAll();
    return true;
  } catch (e) {
    console.error('restoreFromBackup failed', e);
    return false;
  }
}

/** Triggers the "save once a day" cloud backup. Safe to call on every app load;
 *  the upsert keys make repeat calls a no-op for the same date. */
export async function maybeRunDailyBackup(): Promise<void> {
  const vid = getStoredVaultId();
  if (!vid) return;
  const today = new Date().toISOString().slice(0, 10);
  const flagKey = `spendsmart_last_backup_${vid}`;
  if (localStorage.getItem(flagKey) === today) return;
  const res = await saveDailyBackupToCloud();
  if (res.saved) localStorage.setItem(flagKey, today);
}

// ---------- Refund learned patterns (cross-device) ----------

const LOCAL_PATTERNS_KEY = 'refund_learned_patterns';

export interface LearnedPattern {
  spendCategory: string;
  creditCategory: string;
  merchantMatch: 'exact' | 'partial' | 'none';
  count: number;
}

/** Load patterns — tries Supabase first, falls back to localStorage. */
export async function loadLearnedPatternsFromCloud(): Promise<LearnedPattern[]> {
  const vid = getStoredVaultId();
  if (vid) {
    const { data, error } = await supabase
      .from('refund_learned_patterns')
      .select('patterns')
      .eq('vault_id', vid)
      .maybeSingle();
    if (!error && data?.patterns) {
      const cloud = data.patterns as unknown as LearnedPattern[];
      // Merge with any local-only patterns not yet synced
      const local = loadLocalPatterns();
      const merged = mergePatterns(cloud, local);
      // Write merged back locally as cache
      try { localStorage.setItem(LOCAL_PATTERNS_KEY, JSON.stringify(merged)); } catch {}
      return merged;
    }
  }
  return loadLocalPatterns();
}

/** Save an updated patterns array to both Supabase and localStorage. */
export async function saveLearnedPatternsToCloud(patterns: LearnedPattern[]): Promise<void> {
  try { localStorage.setItem(LOCAL_PATTERNS_KEY, JSON.stringify(patterns)); } catch {}
  const vid = getStoredVaultId();
  if (!vid) return;
  const { error } = await supabase
    .from('refund_learned_patterns')
    .upsert({ vault_id: vid, patterns: patterns as unknown as never, updated_at: new Date().toISOString() } as never, { onConflict: 'vault_id' });
  if (error) console.error('saveLearnedPatternsToCloud', error);
}

function loadLocalPatterns(): LearnedPattern[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_PATTERNS_KEY) || '[]'); } catch { return []; }
}

function mergePatterns(a: LearnedPattern[], b: LearnedPattern[]): LearnedPattern[] {
  const result = [...a];
  for (const bp of b) {
    const existing = result.find(p => p.spendCategory === bp.spendCategory && p.creditCategory === bp.creditCategory && p.merchantMatch === bp.merchantMatch);
    if (existing) { existing.count = Math.max(existing.count, bp.count); }
    else { result.push(bp); }
  }
  return result;
}

// ---------- Budget plan (Setup page) ----------

/** Creates or updates the single budget plan for this vault. */
export async function saveBudgetPlan(plan: Omit<BudgetPlan, 'id'> & { id?: string }): Promise<BudgetData> {
  const vid = vaultId();
  const row = {
    vault_id: vid,
    start_date: plan.startDate,
    end_date: plan.endDate,
    categories: plan.categories as never,
    locked: plan.locked,
  };
  if (plan.id) {
    cache.budgetPlan = { ...plan, id: plan.id } as BudgetPlan;
    notify();
    const { error } = await supabase.from('budget_plans').update(row).eq('id', plan.id).eq('vault_id', vid);
    if (error) console.error('saveBudgetPlan update', error);
  } else {
    const { data, error } = await supabase.from('budget_plans').insert(row).select().maybeSingle();
    if (error) console.error('saveBudgetPlan insert', error);
    if (data) cache.budgetPlan = mapPlan(data);
    notify();
  }
  return cache;
}

export async function deleteBudgetPlan(id: string): Promise<BudgetData> {
  cache.budgetPlan = null;
  notify();
  const { error } = await supabase.from('budget_plans').delete().eq('id', id).eq('vault_id', vaultId());
  if (error) console.error('deleteBudgetPlan', error);
  return cache;
}

/** True if the plan is locked and the given YYYY-MM-DD date falls inside its range. */
export function isPlanActiveOn(plan: BudgetPlan | null | undefined, date: string): boolean {
  if (!plan || !plan.locked) return false;
  return date >= plan.startDate && date <= plan.endDate;
}

/** Monthly budget for a category from the locked plan, for a given YYYY-MM month. */
export function getPlanCategoryBudget(data: BudgetData, category: string, month: string): number | null {
  const plan = data.budgetPlan;
  if (!plan || !plan.locked) return null;
  if (month < plan.startDate.slice(0, 7) || month > plan.endDate.slice(0, 7)) return null;
  const v = plan.categories?.[category];
  return typeof v === 'number' && v > 0 ? v : null;
}

/** Total monthly budget from the locked plan for a given month, or null. */
export function getPlanMonthlyTotal(data: BudgetData, month: string): number | null {
  const plan = data.budgetPlan;
  if (!plan || !plan.locked) return null;
  if (month < plan.startDate.slice(0, 7) || month > plan.endDate.slice(0, 7)) return null;
  const total = Object.values(plan.categories || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  return total > 0 ? total : null;
}

// ---------- Recurring investments ----------
export function addRecurringInvestment(r: RecurringInvestment): BudgetData {
  cache.recurringInvestments = [...(cache.recurringInvestments || []), r];
  notify();
  supabase.from('recurring_investments').insert({
    id: r.id,
    vault_id: vaultId(),
    amount: r.amount,
    platform: r.platform,
    start_date: r.startDate,
    end_date: r.endDate ?? null,
    frequency: r.frequency,
    day_of_week: r.dayOfWeek ?? null,
    note: r.note ?? null,
    active: r.active,
  }).then(({ error }) => { if (error) console.error('addRecurringInvestment sync', error); });
  return cache;
}

export function deleteRecurringInvestment(id: string): BudgetData {
  cache.recurringInvestments = (cache.recurringInvestments || []).filter(r => r.id !== id);
  notify();
  supabase.from('recurring_investments').delete().eq('id', id)
    .then(({ error }) => { if (error) console.error('deleteRecurringInvestment sync', error); });
  return cache;
}

export function updateRecurringInvestment(id: string, updates: Partial<Omit<RecurringInvestment, 'id'>>): BudgetData {
  cache.recurringInvestments = (cache.recurringInvestments || []).map(r => r.id === id ? { ...r, ...updates } : r);
  notify();
  const patch: {
    amount?: number; platform?: string; start_date?: string; end_date?: string | null;
    frequency?: string; day_of_week?: number | null; note?: string | null; active?: boolean;
  } = {};
  if (updates.amount !== undefined) patch.amount = updates.amount;
  if (updates.platform !== undefined) patch.platform = updates.platform;
  if (updates.startDate !== undefined) patch.start_date = updates.startDate;
  if (updates.endDate !== undefined) patch.end_date = updates.endDate ?? null;
  if (updates.frequency !== undefined) patch.frequency = updates.frequency;
  if (updates.dayOfWeek !== undefined) patch.day_of_week = updates.dayOfWeek ?? null;
  if (updates.note !== undefined) patch.note = updates.note ?? null;
  if (updates.active !== undefined) patch.active = updates.active;
  supabase.from('recurring_investments').update(patch).eq('id', id)
    .then(({ error }) => { if (error) console.error('updateRecurringInvestment sync', error); });
  return cache;
}
