import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  findVaultByPasscode,
  createVault,
  setStoredVaultId,
  getStoredVaultId,
} from '@/lib/vault-store';
import { initStore, migrateLocalDataIfAny } from '@/lib/budget-store';

/**
 * Replaces PasscodeGate. The app no longer prompts for a passcode.
 *
 * Behaviour:
 *  - If this device already has a vault id stored, we keep using it (so all
 *    existing data — including data created under the old passcode flow —
 *    stays accessible).
 *  - Otherwise we look up / create a single shared "no-passcode" vault using
 *    a fixed bootstrap key. Because the same fixed key is used on every
 *    device, the phone and the web both resolve to the SAME vault id, so
 *    entries sync across devices in real-time exactly as before.
 */
const SHARED_BOOTSTRAP_KEY = '__spendsmart_open_vault__';

export function AutoUnlock({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let vid = getStoredVaultId();
      if (!vid) {
        const existing = await findVaultByPasscode(SHARED_BOOTSTRAP_KEY);
        vid = existing ?? (await createVault(SHARED_BOOTSTRAP_KEY));
        if (vid) setStoredVaultId(vid);
      }
      if (vid) {
        await migrateLocalDataIfAny();
        await initStore();
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}
