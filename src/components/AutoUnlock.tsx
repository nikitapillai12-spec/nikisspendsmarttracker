import { useEffect, useState, useRef } from 'react';
import { findVaultByPasscode, createVault, setStoredVaultId, getStoredVaultId } from '@/lib/vault-store';
import { initStore, migrateLocalDataIfAny } from '@/lib/budget-store';

// Session flag — cleared when the tab/app is closed, so passcode is required once per session
const SESSION_KEY = 'spendsmart_session_unlocked';

export function AutoUnlock({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'locked' | 'unlocked'>('checking');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Already unlocked this session?
    if (sessionStorage.getItem(SESSION_KEY) === '1' && getStoredVaultId()) {
      initStore().then(() => setState('unlocked'));
    } else {
      setState('locked');
    }
  }, []);

  useEffect(() => {
    if (state === 'locked') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state]);

  async function handleUnlock() {
    const code = input.trim();
    if (!code) { setError('Please enter your passcode.'); return; }
    setLoading(true);
    setError('');
    try {
      // Look up vault by passcode — same passcode = same vault on every device
      let vid = await findVaultByPasscode(code);
      if (!vid) {
        // First time this passcode is used — create the vault
        vid = await createVault(code);
      }
      if (!vid) {
        setError('Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      // Wrong passcode: if a vault already existed under a DIFFERENT passcode and
      // this device had that vault id stored, the new vid won't match — that's fine,
      // we just update to the new vault (which will have no data = wrong passcode path)
      // To prevent vault hopping we compare: if device had a vault id and the resolved
      // vid is different, it means the passcode was wrong for the original vault.
      const stored = getStoredVaultId();
      if (stored && stored !== vid) {
        // Passcode produced a different vault — likely wrong passcode
        setError('Incorrect passcode. Please try again.');
        setLoading(false);
        return;
      }
      setStoredVaultId(vid);
      await migrateLocalDataIfAny();
      await initStore();
      sessionStorage.setItem(SESSION_KEY, '1');
      setState('unlocked');
    } catch (e) {
      console.error('unlock error', e);
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleUnlock();
  }

  if (state === 'checking') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(40,30%,96%)' }}>
        <div style={{ width: 32, height: 32, border: '3px solid hsl(350,80%,52%)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (state === 'locked') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(40,30%,96%)', padding: 16 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ background: 'white', borderRadius: 16, borderTop: '4px solid hsl(350,80%,52%)', padding: '36px 32px', maxWidth: 360, width: '100%', boxShadow: '0 8px 32px -8px rgba(0,0,0,0.15)', textAlign: 'center' }}>
          {/* Logo mark */}
          <div style={{ display: 'inline-flex', position: 'relative', width: 48, height: 48, marginBottom: 16 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 10, background: 'hsl(350,80%,52%)' }} />
            <div style={{ position: 'absolute', inset: 6, borderRadius: 6, background: 'white' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'hsl(350,80%,52%)' }} />
            </div>
          </div>

          <div style={{ fontFamily: 'Rubik, sans-serif', fontWeight: 900, fontSize: 26, letterSpacing: '-0.02em', marginBottom: 4 }}>SpendSmart</div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 28 }}>Enter your passcode to continue</div>

          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            value={input}
            onChange={e => { setInput(e.target.value); setError(''); }}
            onKeyDown={handleKey}
            placeholder="Passcode"
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 10, fontSize: 20,
              border: `2px solid ${error ? 'hsl(350,80%,52%)' : '#e2e8f0'}`,
              outline: 'none', textAlign: 'center', letterSpacing: '0.3em',
              fontFamily: 'Rubik, monospace', fontWeight: 700, boxSizing: 'border-box',
              background: 'white', color: '#1e293b',
            }}
            maxLength={12}
            autoComplete="current-password"
          />

          {error && (
            <div style={{ marginTop: 8, fontSize: 13, color: 'hsl(350,80%,52%)', fontWeight: 600 }}>{error}</div>
          )}

          <button
            onPointerDown={handleUnlock}
            disabled={loading}
            style={{
              marginTop: 16, width: '100%', padding: '13px', borderRadius: 10, border: 'none',
              background: loading ? '#e2e8f0' : 'hsl(350,80%,52%)',
              color: loading ? '#94a3b8' : 'white', fontSize: 15, fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer', touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent', fontFamily: 'Rubik, sans-serif',
              letterSpacing: '0.02em',
            }}
          >
            {loading ? 'Unlocking…' : 'Unlock'}
          </button>

          <div style={{ marginTop: 20, fontSize: 11, color: '#cbd5e1' }}>
            Your data is end-to-end locked by your passcode
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
