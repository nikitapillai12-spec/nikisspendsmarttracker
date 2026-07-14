import { supabase } from '@/integrations/supabase/client';

const VAULT_ID_KEY = 'spendsmart_vault_id';

async function hashPasscode(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(passcode);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Attach the current vault id as a request header so RLS policies can scope
// data access to just this vault. Called whenever the stored id changes.
function applyVaultHeader(id: string | null) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rest = (supabase as any).rest;
    if (rest && rest.headers) {
      if (id) rest.headers['x-vault-id'] = id;
      else delete rest.headers['x-vault-id'];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = (supabase as any).headers;
    if (headers) {
      if (id) headers['x-vault-id'] = id;
      else delete headers['x-vault-id'];
    }
  } catch (e) {
    console.warn('applyVaultHeader failed', e);
  }
}

export function getStoredVaultId(): string | null {
  const id = localStorage.getItem(VAULT_ID_KEY);
  if (id) applyVaultHeader(id);
  return id;
}

export function setStoredVaultId(id: string) {
  localStorage.setItem(VAULT_ID_KEY, id);
  applyVaultHeader(id);
}

export function clearStoredVaultId() {
  localStorage.removeItem(VAULT_ID_KEY);
  applyVaultHeader(null);
}

// Look up a vault by passcode hash via a secure RPC that never exposes hashes.
export async function findVaultByPasscode(passcode: string): Promise<string | null> {
  const hash = await hashPasscode(passcode);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('find_vault_id_by_passcode', { _hash: hash });
  if (error) {
    console.error('findVaultByPasscode error', error);
    return null;
  }
  return (data as string | null) ?? null;
}

export async function createVault(passcode: string): Promise<string | null> {
  const hash = await hashPasscode(passcode);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('create_vault', { _hash: hash });
  if (error) {
    console.error('createVault error', error);
    return null;
  }
  return (data as string | null) ?? null;
}

export async function updateVaultPasscode(vaultId: string, currentPasscode: string, newPasscode: string): Promise<boolean> {
  const currentHash = await hashPasscode(currentPasscode);
  const newHash = await hashPasscode(newPasscode);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('update_vault_passcode', {
    _vault_id: vaultId,
    _current_hash: currentHash,
    _new_hash: newHash,
  });
  if (error) {
    console.error('updateVaultPasscode error', error);
    return false;
  }
  return Boolean(data);
}
