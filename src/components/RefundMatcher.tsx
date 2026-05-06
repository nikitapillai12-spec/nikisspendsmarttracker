import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SpendEntry, BudgetData } from '@/lib/budget-types';
import { linkRefundPair, loadLearnedPatternsFromCloud, saveLearnedPatternsToCloud, LearnedPattern } from '@/lib/budget-store';

interface RefundPair {
  id: string;
  spend: SpendEntry;
  credit: SpendEntry;
  confidence: 'high' | 'medium';
  reason: string;
  netAmount: number;
  isFullRefund: boolean;
}

// Rejected pair with timestamp — stored in localStorage + synced to cloud
interface RejectedRecord {
  id: string;
  rejectedAt: number; // ms timestamp
}

const REJECTED_KEY = 'refund_rejected_records';
const MS_24H = 24 * 60 * 60 * 1000;

function loadRejectedRecords(): RejectedRecord[] {
  try { return JSON.parse(localStorage.getItem(REJECTED_KEY) || '[]'); } catch { return []; }
}

function saveRejectedRecords(records: RejectedRecord[]) {
  // Prune anything older than 24h before saving
  const cutoff = Date.now() - MS_24H;
  const pruned = records.filter(r => r.rejectedAt > cutoff);
  try { localStorage.setItem(REJECTED_KEY, JSON.stringify(pruned)); } catch {}
  return pruned;
}

function isWithin24h(record: RejectedRecord) {
  return Date.now() - record.rejectedAt < MS_24H;
}

// ── Matching algorithm ────────────────────────────────────────────────────────

const STOPWORDS = new Set(['the', 'and', 'for', 'via', 'from', 'with', 'ltd', 'inc', 'plc', 'uk', 'gb', 'ref', 'payment', 'purchase', 'order', 'transaction', 'debit', 'credit', 'card', 'online', 'store', 'shop']);

function merchantSimilarity(a: string, b: string): { level: 'exact' | 'strong' | 'weak' | 'none'; word?: string } {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (!na || !nb) return { level: 'none' };
  if (na === nb) return { level: 'exact' };
  const wordsA = na.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
  const wordsB = nb.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
  if (wordsA.length === 0 || wordsB.length === 0) return { level: 'none' };
  const strong = wordsA.find(wa => wordsB.some(wb => wb.includes(wa) || wa.includes(wb)));
  if (strong) return { level: 'strong', word: strong };
  const weak = wordsA.find(wa => wordsB.some(wb => wa.startsWith(wb.slice(0, 4)) || wb.startsWith(wa.slice(0, 4))));
  if (weak) return { level: 'weak', word: weak };
  return { level: 'none' };
}

function scoreMatch(spend: SpendEntry, credit: SpendEntry, learned: LearnedPattern[], rejectedIds: Set<string>): { score: number; reason: string; merchantMatch: 'exact' | 'partial' | 'none' } | null {
  if ((spend.type ?? 'spend') !== 'spend') return null;
  if (credit.type !== 'credit') return null;
  if (spend.refundPairId || credit.refundPairId) return null;
  if (credit.amount > spend.amount + 0.01) return null;
  const pairId = `${spend.id}-${credit.id}`;
  if (rejectedIds.has(pairId)) return null; // permanently excluded after 24h

  let score = 0;
  const reasons: string[] = [];

  const amountDiff = Math.abs(spend.amount - credit.amount);
  const amountRatio = amountDiff / spend.amount;
  if (amountDiff < 0.01)        { score += 50; reasons.push('exact amount'); }
  else if (amountRatio <= 0.02) { score += 40; reasons.push('near-exact amount'); }
  else if (amountRatio <= 0.10) { score += 25; reasons.push('similar amount'); }
  else if (amountRatio <= 0.25) { score += 10; reasons.push('partial amount'); }
  else return null;

  const spendNote = (spend.note || '').trim();
  const creditNote = (credit.note || '').trim();
  const bothHaveNotes = spendNote.length > 0 && creditNote.length > 0;
  const sim = merchantSimilarity(spendNote, creditNote);
  let merchantMatch: 'exact' | 'partial' | 'none' = 'none';

  if (bothHaveNotes) {
    if (sim.level === 'exact')        { score += 45; reasons.push(`same merchant "${spendNote}"`); merchantMatch = 'exact'; }
    else if (sim.level === 'strong')  { score += 30; reasons.push(`merchant match "${sim.word}"`); merchantMatch = 'partial'; }
    else if (sim.level === 'weak')    { score += 8;  reasons.push('weak merchant overlap'); merchantMatch = 'partial'; }
    else                              { score -= 40; merchantMatch = 'none'; }
  } else if (!spendNote && !creditNote) {
    score += 5;
  }

  const sc = spend.category.toLowerCase();
  const cc = credit.category.toLowerCase();
  if (sc === cc) { score += 20; reasons.push('same category'); }
  else if (cc.includes('refund')) { score += 15; reasons.push('refund category'); }
  else if (cc === 'other' || sc === 'other') { score += 3; }
  else if (merchantMatch === 'none' && amountRatio > 0.02) return null;

  const daysDiff = Math.abs(new Date(spend.date).getTime() - new Date(credit.date).getTime()) / 86400000;
  if (daysDiff <= 3)       { score += 20; reasons.push(`${Math.round(daysDiff)}d apart`); }
  else if (daysDiff <= 7)  { score += 15; reasons.push(`${Math.round(daysDiff)}d apart`); }
  else if (daysDiff <= 14) { score += 10; reasons.push(`${Math.round(daysDiff)}d apart`); }
  else if (daysDiff <= 30) { score += 5;  reasons.push(`${Math.round(daysDiff)}d apart`); }
  else if (daysDiff <= 60) { score += 2; }
  else return null;

  if (new Date(credit.date) < new Date(spend.date)) score -= 10;

  const pattern = learned.find(p => p.spendCategory === spend.category && p.creditCategory === credit.category);
  if (pattern) {
    const boost = Math.min(pattern.count * 5, 20);
    score += boost;
    if (boost >= 10) reasons.push('matches your past confirmations');
  }

  if (score < 40) return null;
  return { score, reason: reasons.join(' · '), merchantMatch };
}

export function findRefundPairs(entries: SpendEntry[], learned: LearnedPattern[] = [], rejectedIds: Set<string> = new Set()): RefundPair[] {
  const spends = entries.filter(e => (e.type ?? 'spend') === 'spend' && !e.refundPairId);
  const credits = entries.filter(e => e.type === 'credit' && !e.refundPairId);
  const pairs: RefundPair[] = [];
  const usedS = new Set<string>();
  const usedC = new Set<string>();
  const candidates: Array<{ spend: SpendEntry; credit: SpendEntry; score: number; reason: string; merchantMatch: 'exact' | 'partial' | 'none' }> = [];

  for (const s of spends) for (const c of credits) {
    const r = scoreMatch(s, c, learned, rejectedIds);
    if (r) candidates.push({ spend: s, credit: c, ...r });
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    if (usedS.has(c.spend.id) || usedC.has(c.credit.id)) continue;
    usedS.add(c.spend.id); usedC.add(c.credit.id);
    const net = Math.max(0, c.spend.amount - c.credit.amount);
    const isHighConf = c.score >= 75 && (c.merchantMatch !== 'none' || net < 0.01);
    pairs.push({ id: `${c.spend.id}-${c.credit.id}`, spend: c.spend, credit: c.credit, confidence: isHighConf ? 'high' : 'medium', reason: c.reason, netAmount: net, isFullRefund: net < 0.01 });
  }
  return pairs;
}

function buildUpdatedPatterns(confirmedPairs: Array<{ spend: SpendEntry; credit: SpendEntry }>, existing: LearnedPattern[]): LearnedPattern[] {
  const result = [...existing];
  for (const { spend, credit } of confirmedPairs) {
    const sim = merchantSimilarity((spend.note || '').trim(), (credit.note || '').trim());
    const merchantMatch: 'exact' | 'partial' | 'none' =
      sim.level === 'exact' ? 'exact' : (sim.level === 'strong' || sim.level === 'weak') ? 'partial' : 'none';
    const key = `${spend.category}|${credit.category}|${merchantMatch}`;
    const ep = result.find(p => `${p.spendCategory}|${p.creditCategory}|${p.merchantMatch}` === key);
    if (ep) { ep.count++; } else { result.push({ spendCategory: spend.category, creditCategory: credit.category, merchantMatch, count: 1 }); }
  }
  return result;
}

// ── UI helpers ────────────────────────────────────────────────────────────────

interface Props { data: BudgetData; onDataChange: (d: BudgetData) => void; }

function Btn({ label, onClick, bg, color, border }: { label: string; onClick: () => void; bg: string; color: string; border: string }) {
  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); onClick(); }}
      style={{ padding: '9px 16px', borderRadius: '8px', border: `2px solid ${border}`, background: bg, color, fontSize: '13px', fontWeight: 700, cursor: 'pointer', WebkitAppearance: 'none' as any, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', userSelect: 'none', display: 'inline-block', lineHeight: 1.2 }}
    >
      {label}
    </button>
  );
}

// CSS keyframes injected once
const POOF_STYLE = `
@keyframes refund-poof {
  0%   { opacity: 1; transform: scale(1); max-height: 120px; }
  40%  { opacity: 0.3; transform: scale(1.04); }
  100% { opacity: 0; transform: scale(0.85); max-height: 0; padding-top: 0; padding-bottom: 0; margin: 0; }
}
.refund-poof-out {
  animation: refund-poof 0.38s cubic-bezier(0.4,0,0.6,1) forwards;
  overflow: hidden;
  pointer-events: none;
}
`;

let styleInjected = false;
function ensurePoofStyle() {
  if (styleInjected) return;
  const s = document.createElement('style');
  s.textContent = POOF_STYLE;
  document.head.appendChild(s);
  styleInjected = true;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RefundMatcher({ data, onDataChange }: Props) {
  const [pairs, setPairs] = useState<RefundPair[]>([]);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  // poofing: ids currently animating out
  const [poofing, setPoofing] = useState<Set<string>>(new Set());
  // rejectedRecords: pairs user said "keep separate" — kept for 24h for undo
  const [rejectedRecords, setRejectedRecords] = useState<RejectedRecord[]>(() => loadRejectedRecords());
  const lastScannedCount = useRef<number>(-1);
  const learnedRef = useRef<LearnedPattern[]>([]);

  useEffect(() => { ensurePoofStyle(); }, []);

  // Derive the set of permanently rejected ids (past 24h)
  const permanentlyRejectedIds = useRef(new Set<string>());
  useEffect(() => {
    const expired = rejectedRecords.filter(r => !isWithin24h(r)).map(r => r.id);
    permanentlyRejectedIds.current = new Set(expired);
  }, [rejectedRecords]);

  // Load cloud patterns once
  useEffect(() => {
    loadLearnedPatternsFromCloud().then(p => { learnedRef.current = p; });
  }, []);

  // Rescan whenever entry count changes
  useEffect(() => {
    if (data.entries.length === 0) return;
    if (data.entries.length === lastScannedCount.current) return;
    lastScannedCount.current = data.entries.length;
    const rejIds = new Set(rejectedRecords.filter(r => !isWithin24h(r)).map(r => r.id));
    const found = findRefundPairs(data.entries, learnedRef.current, rejIds);
    // Filter out pairs the user already rejected within 24h (show them in undo section, not main list)
    const withinUndoWindow = new Set(rejectedRecords.filter(isWithin24h).map(r => r.id));
    const newPairs = found.filter(p => !withinUndoWindow.has(p.id));
    if (newPairs.length > 0) {
      setPairs(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const fresh = newPairs.filter(p => !existingIds.has(p.id));
        return [...prev.filter(p => newPairs.some(f => f.id === p.id)), ...fresh];
      });
      setConfirmed(prev => {
        const s = new Set(prev);
        newPairs.filter(p => p.confidence === 'high' && !prev.has(p.id)).forEach(p => s.add(p.id));
        return s;
      });
      setOpen(true);
    }
    // Also hold a full list ref for undo lookup
    allFoundRef.current = found;
  }, [data.entries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const allFoundRef = useRef<RefundPair[]>([]);

  const confirm = useCallback((id: string) => {
    setConfirmed(p => { const s = new Set(p); s.add(id); return s; });
    // If re-confirming something that was rejected within 24h, remove from rejected
    setRejectedRecords(prev => {
      const updated = prev.filter(r => r.id !== id);
      saveRejectedRecords(updated);
      return updated;
    });
  }, []);

  const rejectWithPoof = useCallback((id: string) => {
    // Start poof animation
    setPoofing(prev => { const s = new Set(prev); s.add(id); return s; });
    // After animation completes: remove from visible list, add to rejected records
    setTimeout(() => {
      setPoofing(prev => { const s = new Set(prev); s.delete(id); return s; });
      setPairs(prev => prev.filter(p => p.id !== id));
      setConfirmed(prev => { const s = new Set(prev); s.delete(id); return s; });
      setRejectedRecords(prev => {
        const updated = [{ id, rejectedAt: Date.now() }, ...prev.filter(r => r.id !== id)];
        saveRejectedRecords(updated);
        return updated;
      });
    }, 380);
  }, []);

  const undoReject = useCallback((id: string) => {
    // Remove from rejected records and add back to pairs list
    setRejectedRecords(prev => {
      const updated = prev.filter(r => r.id !== id);
      saveRejectedRecords(updated);
      return updated;
    });
    const pair = allFoundRef.current.find(p => p.id === id);
    if (pair) {
      setPairs(prev => prev.some(p => p.id === id) ? prev : [pair, ...prev]);
      setOpen(true);
    }
  }, []);

  const applyAll = useCallback(() => {
    let latest = data;
    const confirmedPairs: Array<{ spend: SpendEntry; credit: SpendEntry }> = [];
    for (const pair of pairs) {
      if (confirmed.has(pair.id)) {
        latest = linkRefundPair(pair.spend.id, pair.credit.id);
        confirmedPairs.push({ spend: pair.spend, credit: pair.credit });
      }
    }
    if (confirmedPairs.length > 0) {
      const updated = buildUpdatedPatterns(confirmedPairs, learnedRef.current);
      learnedRef.current = updated;
      saveLearnedPatternsToCloud(updated);
    }
    setPairs(p => p.filter(x => !confirmed.has(x.id)));
    setConfirmed(new Set());
    onDataChange(latest);
    setOpen(false);
  }, [data, pairs, confirmed, onDataChange]);

  const skip = useCallback(() => setOpen(false), []);
  const openModal = useCallback(() => setOpen(true), []);

  const confirmedCount = confirmed.size;
  const unreviewedCount = pairs.filter(p => !confirmed.has(p.id) && !poofing.has(p.id)).length;
  const undoableRecords = rejectedRecords.filter(isWithin24h);
  const bellCount = unreviewedCount + undoableRecords.length;

  const bell = !open && bellCount > 0 && (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999999 }}>
      <button
        onPointerDown={(e) => { e.stopPropagation(); openModal(); }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 999, border: 'none', background: 'hsl(350,80%,52%)', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 24px -4px rgba(0,0,0,0.4)', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', position: 'relative' as const }}
      >
        🔔 {unreviewedCount > 0 ? `${unreviewedCount} refund match${unreviewedCount !== 1 ? 'es' : ''} to review` : `${undoableRecords.length} rejected — undo available`}
        <span style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'white', color: 'hsl(350,80%,52%)', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {bellCount}
        </span>
      </button>
    </div>
  );

  const modal = open && (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) skip(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', borderTop: '4px solid hsl(350,80%,52%)' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>🔗 Refund Matches</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {pairs.length > 0
              ? <>Found <strong>{pairs.length} possible pair{pairs.length !== 1 ? 's' : ''}</strong> across {data.entries.length} transactions. <strong>Nothing changes until you click Apply.</strong></>
              : <>All caught up! No new matches to review.</>}
          </div>
          {unreviewedCount > 0 && <div style={{ fontSize: 12, color: '#b45309', fontWeight: 600, marginTop: 6 }}>⚠ {unreviewedCount} pair{unreviewedCount !== 1 ? 's' : ''} still need your decision</div>}
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' as any }}>

          {/* Active pairs */}
          {pairs.map((pair) => {
            const isC = confirmed.has(pair.id);
            const isPoof = poofing.has(pair.id);
            return (
              <div
                key={pair.id}
                className={isPoof ? 'refund-poof-out' : ''}
                style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: isC ? '#f0fdf4' : 'white' }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#1e293b' }}>
                  <span style={{ color: '#dc2626' }}>−{pair.spend.note || pair.spend.category} £{pair.spend.amount.toFixed(2)}</span>
                  <span style={{ color: '#94a3b8', margin: '0 6px' }}>({pair.spend.date})</span>
                  <span style={{ color: '#94a3b8' }}>↔</span>
                  <span style={{ color: '#16a34a', marginLeft: 6 }}>+{pair.credit.note || pair.credit.category} £{pair.credit.amount.toFixed(2)}</span>
                  <span style={{ color: '#94a3b8', margin: '0 6px' }}>({pair.credit.date})</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                  <span style={{ background: pair.confidence === 'high' ? '#dcfce7' : '#fef3c7', color: pair.confidence === 'high' ? '#166534' : '#92400e', padding: '1px 7px', borderRadius: 4, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' as const, marginRight: 8 }}>{pair.confidence}</span>
                  {pair.reason} ·{' '}
                  <strong style={{ color: pair.isFullRefund ? '#16a34a' : '#dc2626' }}>
                    {pair.isFullRefund ? 'Full refund — net: £0' : `Partial — net: £${pair.netAmount.toFixed(2)}`}
                  </strong>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <Btn label={isC ? '✓ Confirmed' : 'Yes — net these off'} onClick={() => confirm(pair.id)} bg={isC ? '#16a34a' : 'white'} color={isC ? 'white' : '#16a34a'} border='#16a34a' />
                  <Btn label='No — keep separate' onClick={() => rejectWithPoof(pair.id)} bg='white' color='#94a3b8' border='#cbd5e1' />
                </div>
              </div>
            );
          })}

          {/* Undo section — recently rejected, within 24h */}
          {undoableRecords.length > 0 && (
            <div style={{ padding: '12px 16px', background: '#fffbeb', borderTop: pairs.length > 0 ? '2px dashed #fde68a' : undefined }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                🕐 Recently kept separate — undo available for 24h
              </div>
              {undoableRecords.map(record => {
                const pair = allFoundRef.current.find(p => p.id === record.id);
                const hoursLeft = Math.max(0, Math.ceil((MS_24H - (Date.now() - record.rejectedAt)) / 3600000));
                return (
                  <div key={record.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #fde68a', gap: 10, flexWrap: 'wrap' as const }}>
                    <div style={{ fontSize: 12, color: '#78716c', flex: 1 }}>
                      {pair ? (
                        <><span style={{ color: '#dc2626' }}>−{pair.spend.note || pair.spend.category} £{pair.spend.amount.toFixed(2)}</span>
                        {' ↔ '}
                        <span style={{ color: '#16a34a' }}>+{pair.credit.note || pair.credit.category} £{pair.credit.amount.toFixed(2)}</span></>
                      ) : <span style={{ color: '#a8a29e' }}>Pair no longer available</span>}
                      <span style={{ color: '#a8a29e', marginLeft: 8 }}>({hoursLeft}h left to undo)</span>
                    </div>
                    {pair && <Btn label='↩ Undo' onClick={() => undoReject(record.id)} bg='white' color='#92400e' border='#fde68a' />}
                  </div>
                );
              })}
            </div>
          )}

          {pairs.length === 0 && undoableRecords.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center' as const, color: '#94a3b8', fontSize: 14 }}>
              All done — nothing to review right now.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10 }}>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            <strong style={{ color: '#16a34a' }}>{confirmedCount} confirmed</strong>
            {undoableRecords.length > 0 && <strong style={{ color: '#92400e' }}> · {undoableRecords.length} kept separate</strong>}
            {unreviewedCount > 0 && <strong style={{ color: '#b45309' }}> · {unreviewedCount} pending</strong>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn label='Skip for now' onClick={skip} bg='white' color='#64748b' border='#e2e8f0' />
            <Btn
              label={confirmedCount === 0 ? 'Apply matches' : `Apply ${confirmedCount} match${confirmedCount !== 1 ? 'es' : ''}`}
              onClick={confirmedCount > 0 ? applyAll : () => {}}
              bg={confirmedCount === 0 ? '#e2e8f0' : 'hsl(350,80%,52%)'}
              color={confirmedCount === 0 ? '#94a3b8' : 'white'}
              border={confirmedCount === 0 ? '#e2e8f0' : 'hsl(350,80%,52%)'}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {bell && createPortal(bell, document.body)}
      {modal && createPortal(modal, document.body)}
    </>
  );
}
