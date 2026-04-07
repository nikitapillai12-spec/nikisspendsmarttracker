import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, KeyRound, Check, X } from 'lucide-react';

interface PasscodeGateProps {
  children: React.ReactNode;
}

const PASSCODE_KEY = 'spendsmart_passcode';
const SESSION_KEY = 'spendsmart_unlocked';

export const PasscodeGate = ({ children }: PasscodeGateProps) => {
  const [mode, setMode] = useState<'loading' | 'setup' | 'login' | 'unlocked'>('loading');
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(PASSCODE_KEY);
    const session = sessionStorage.getItem(SESSION_KEY);
    if (!stored) {
      setMode('setup');
    } else if (session === 'true') {
      setMode('unlocked');
    } else {
      setMode('login');
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

  const handleSetup = () => {
    if (step === 'enter') {
      if (passcode.length < 4) {
        triggerShake('At least 4 characters');
        return;
      }
      setStep('confirm');
      setConfirmPasscode('');
      setError('');
    } else {
      if (confirmPasscode !== passcode) {
        triggerShake('Passcodes don\'t match');
        setConfirmPasscode('');
        return;
      }
      localStorage.setItem(PASSCODE_KEY, btoa(passcode));
      sessionStorage.setItem(SESSION_KEY, 'true');
      setMode('unlocked');
    }
  };

  const handleLogin = () => {
    const stored = localStorage.getItem(PASSCODE_KEY);
    if (stored && atob(stored) === passcode) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setMode('unlocked');
    } else {
      triggerShake('Wrong passcode');
      setPasscode('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      mode === 'setup' ? handleSetup() : handleLogin();
    }
  };

  if (mode === 'loading') return null;
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
                ? 'Choose a passcode to protect your data'
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
            value={currentValue}
            onChange={(e) => { setCurrentValue(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="••••••"
            className="w-full h-14 text-center text-2xl tracking-[0.5em] rounded-xl border-2 border-border bg-card focus:border-primary focus:outline-none transition-colors font-mono"
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
          className="w-full mt-4 h-12 rounded-xl bg-primary text-primary-foreground font-display font-semibold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          {isSetup ? (
            step === 'enter' ? 'Next' : <><Check className="w-4 h-4" /> Set Passcode</>
          ) : (
            <><Lock className="w-4 h-4" /> Unlock</>
          )}
        </motion.button>
      </motion.div>
    </div>
  );
};
