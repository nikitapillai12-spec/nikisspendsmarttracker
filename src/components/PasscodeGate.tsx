import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, KeyRound, Check, X, Loader2 } from 'lucide-react';
import {
  findVaultByPasscode,
  createVault,
  setStoredVaultId,
  getStoredVaultId,
  clearStoredVaultId,
} from '@/lib/vault-store';
import { initStore, migrateLocalDataIfAny } from '@/lib/budget-store';

interface PasscodeGateProps {
  children: React.ReactNode;
}

// Kept for backwards compatibility with Settings menu imports.
export const PASSCODE_KEY = 'spendsmart_passcode'; // legacy, no longer written
export const SESSION_KEY = 'spendsmart_unlocked';

export const PasscodeGate = ({ children }: PasscodeGateProps) => {
  const [mode, setMode] = useState<'loading' | 'setup' | 'login' | 'unlocked'>('loading');
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const vaultId = getStoredVaultId();
    const session = sessionStorage.getItem(SESSION_KEY);
    if (vaultId && session === 'true') {
      // Already unlocked on this device — hydrate cache and go.
      initStore().then(() => setMode('unlocked'));
    } else if (vaultId) {
      // This device has a known vault but needs login.
      setMode('login');
    } else {
      // Brand new device. Setup flow — but if a passcode matches an existing
      // vault in the cloud, we'll link it instead of creating a new one.
      setMode('setup');
    }
  }, []);

  useEffect(() => {
    if (mode !== 'unlocked' && mode !== 'loading') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [mode, step]);

  const triggerShake = (msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const unlockWithVault = async (vaultId: string, runMigrate: boolean) => {
    setStoredVaultId(vaultId);
    sessionStorage.setItem(SESSION_KEY, 'true');
    // Always try migration — it's idempotent (upsert) and will only act if
    // legacy localStorage data exists. This self-heals devices whose data
    // was written locally before cross-device sync was wired up.
    await migrateLocalDataIfAny();
    await initStore();
    setMode('unlocked');
  };

  const handleSetup = async () => {
    if (busy) return;
    if (step === 'enter') {
      if (passcode.length < 4) {
        triggerShake('At least 4 characters');
        return;
      }
      setStep('confirm');
      setConfirmPasscode('');
      setError('');
      return;
    }
    if (confirmPasscode !== passcode) {
      triggerShake('Passcodes don\'t match');
      setConfirmPasscode('');
      return;
    }
    setBusy(true);
    try {
      // First check if a vault with this passcode already exists in the cloud
      // (i.e. user setting up on a second device). If so, link to it.
      const existing = await findVaultByPasscode(passcode);
      if (existing) {
        await unlockWithVault(existing, false);
      } else {
        const newId = await createVault(passcode);
        if (!newId) {
          triggerShake('Could not set up. Check your connection and try again.');
          return;
        }
        await unlockWithVault(newId, true);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const match = await findVaultByPasscode(passcode);
      if (match) {
        await unlockWithVault(match, false);
      } else {
        triggerShake('Wrong passcode');
        setPasscode('');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      mode === 'setup' ? handleSetup() : handleLogin();
    }
  };

  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (mode === 'unlocked') return <>{children}</>;

  const isSetup = mode === 'setup';
  const currentValue = isSetup && step === 'confirm' ? confirmPasscode : passcode;
  const setCurrentValue = isSetup && step === 'confirm' ? setConfirmPasscode : setPasscode;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <motion.div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4"
            animate={{ rotate: [0, -5, 5, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            {isSetup ? (
              <KeyRound className="w-10 h-10 text-primary" />
            ) : (
              <Lock className="w-10 h-10 text-primary" />
            )}
          </motion.div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {isSetup ? 'Set Your Passcode' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSetup
              ? step === 'enter'
                ? 'Use the same passcode on all your devices to sync'
                : 'Confirm your passcode'
              : 'Enter your passcode to continue'}
          </p>
        </div>

        <motion.div
          animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
          transition={{ duration: 0.4 }}
        >
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            value={currentValue}
            onChange={(e) => { setCurrentValue(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            onTouchStart={(e) => { e.currentTarget.focus(); }}
            placeholder="••••••"
            style={{ fontSize: '24px', userSelect: 'text', WebkitUserSelect: 'text', touchAction: 'manipulation' }}
            className="w-full h-14 text-center tracking-[0.5em] rounded-xl border-2 border-border bg-card focus:border-primary focus:outline-none transition-colors font-mono"
          />
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-destructive text-sm text-center mt-2 flex items-center justify-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={isSetup ? handleSetup : handleLogin}
          disabled={busy}
          className="w-full mt-4 h-12 rounded-xl bg-primary text-primary-foreground font-display font-semibold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isSetup ? (
            step === 'enter' ? 'Next' : <><Check className="w-4 h-4" /> Set Passcode</>
          ) : (
            <><Lock className="w-4 h-4" /> Unlock</>
          )}
        </motion.button>
      </motion.div>
    </div>
  );
};
