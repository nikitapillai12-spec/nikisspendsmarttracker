import { supabase } from '@/integrations/supabase/client';

const VAULT_ID_KEY = 'spendsmart_vault_id';

// Patch global fetch once so every Supabase REST/RPC request carries the
// current vault id. supabase-js does not expose a supported way to mutate
// headers after createClient(), so injecting at the fetch layer is the
// reliable path. Realtime uses WebSockets and is not affected.
let fetchPatched = false;
function ensureFetchPatched() {
  if (fetchPatched) return;
  fetchPatched = true;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url && url.includes('.supabase.co/')) {
        const id = localStorage.getItem(VAULT_ID_KEY);
        if (id) {
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          headers.set('x-vault-id', id);
          return orig(input, { ...(init ?? {}), headers });
        }
      }
    } catch { /* fall through */ }
    return orig(input, init);
  };
}
ensureFetchPatched();

async function hashPasscode(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(passcode);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Header injection is handled by the fetch patch above; these helpers are
// no-ops kept for API compatibility.
function applyVaultHeader(_id: string | null) { /* handled by fetch patch */ }

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
