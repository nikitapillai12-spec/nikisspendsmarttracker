import { useEffect, useState } from 'react';
import { findVaultByPasscode, createVault, setStoredVaultId, getStoredVaultId } from '@/lib/vault-store';
import { initStore, migrateLocalDataIfAny } from '@/lib/budget-store';

// Passcode removed — all devices auto-unlock the shared canonical vault.
const SHARED_BOOTSTRAP_KEY = 'spendsmart-shared-vault-v1';

export function AutoUnlock({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        let vid = await findVaultByPasscode(SHARED_BOOTSTRAP_KEY);
        if (!vid) vid = await createVault(SHARED_BOOTSTRAP_KEY);
        if (vid && getStoredVaultId() !== vid) setStoredVaultId(vid);
        await migrateLocalDataIfAny();
        await initStore();
      } catch (e) {
        console.error('auto-unlock error', e);
      }
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(40,30%,96%)' }}>
        <div style={{ width: 32, height: 32, border: '3px solid hsl(350,80%,52%)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
}