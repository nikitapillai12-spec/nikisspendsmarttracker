import { supabase } from '@/integrations/supabase/client';

const VAULT_ID_KEY = 'spendsmart_vault_id';

async function hashPasscode(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(passcode);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getStoredVaultId(): string | null {
  return localStorage.getItem(VAULT_ID_KEY);
}

export function setStoredVaultId(id: string) {
  localStorage.setItem(VAULT_ID_KEY, id);
}

export function clearStoredVaultId() {
  localStorage.removeItem(VAULT_ID_KEY);
}

// Look up a vault by passcode hash (cross-device login).
// Returns vault id if matched, null otherwise.
export async function findVaultByPasscode(passcode: string): Promise<string | null> {
  const hash = await hashPasscode(passcode);
  const { data, error } = await supabase
    .from('vaults')
    .select('id')
    .eq('passcode_hash', hash)
    .maybeSingle();
  if (error) {
    console.error('findVaultByPasscode error', error);
    return null;
  }
  return data?.id ?? null;
}

export async function createVault(passcode: string): Promise<string | null> {
  const hash = await hashPasscode(passcode);
  const { data, error } = await supabase
    .from('vaults')
    .insert({ passcode_hash: hash })
    .select('id')
    .single();
  if (error) {
    console.error('createVault error', error);
    return null;
  }
  return data.id;
}

export async function updateVaultPasscode(vaultId: string, newPasscode: string): Promise<boolean> {
  const hash = await hashPasscode(newPasscode);
  const { error } = await supabase
    .from('vaults')
    .update({ passcode_hash: hash, updated_at: new Date().toISOString() })
    .eq('id', vaultId);
  if (error) {
    console.error('updateVaultPasscode error', error);
    return false;
  }
  return true;
}
