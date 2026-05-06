import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, Check, X, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { SpendEntry, BudgetData } from '@/lib/budget-types';
import { linkRefundPair } from '@/lib/budget-store';

interface RefundPair {
  id: string;
  spend: SpendEntry;
  credit: SpendEntry;
  confidence: 'high' | 'medium';
  reason: string;
  netAmount: number;
  isFullRefund: boolean;
}

/** Score how likely two entries are a spend/refund pair. Returns null if not a match. */
function scoreMatch(spend: SpendEntry, credit: SpendEntry): { score: number; reason: string } | null {
  if ((spend.type ?? 'spend') !== 'spend') return null;
  if (credit.type !== 'credit') return null;
  if (spend.refundPairId || credit.refundPairId) return null;

  let score = 0;
  const reasons: string[] = [];

  const amountDiff = Math.abs(spend.amount - credit.amount);
  if (amountDiff < 0.01) {
    score += 40;
    reasons.push('same amount');
  } else if (amountDiff / spend.amount < 0.15) {
    score += 20;
    reasons.push('similar amount');
  } else if (credit.amount > spend.amount) {
    return null;
  }

  const spendNote = (spend.note || '').toLowerCase().trim();
  const creditNote = (credit.note || '').toLowerCase().trim();
  if (spendNote && creditNote) {
    if (spendNote === creditNote) {
      score += 40;
      reasons.push(`same merchant "${spend.note}"`);
    } else {
      const spendWords = spendNote.split(/\s+/);
      const creditWords = creditNote.split(/\s+/);
      const commonWords = spendWords.filter(w => w.length > 3 && creditWords.some(cw => cw.includes(w) || w.includes(cw)));
      if (commonWords.length > 0) {
        score += 25;
        reasons.push(`matching merchant "${commonWords[0]}"`);
      }
    }
  } else if (spendNote && !creditNote) {
    score += 5;
  }

  const spendCat = spend.category.toLowerCase();
  const creditCat = credit.category.toLowerCase();
  if (spendCat === creditCat) {
    score += 15;
    reasons.push('same category');
  } else if (creditCat === 'shopping refund') {
    score += 10;
    reasons.push('Shopping Refund credit');
  }

  const daysDiff = Math.abs(new Date(spend.date).getTime() - new Date(credit.date).getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff <= 7) {
    score += 20;
    reasons.push(`${Math.round(daysDiff)}d apart`);
  } else if (daysDiff <= 30) {
    score += 10;
    reasons.push(`${Math.round(daysDiff)}d apart`);
  } else if (daysDiff <= 60) {
    score += 3;
  } else {
    return null;
  }

  if (new Date(credit.date) < new Date(spend.date)) {
    score -= 15;
  }

  if (score < 30) return null;
  return { score, reason: reasons.join(' · ') };
}

/** Find all likely spend/refund pairs across all entries */
export function findRefundPairs(entries: SpendEntry[]): RefundPair[] {
  const spends = entries.filter(e => (e.type ?? 'spend') === 'spend' && !e.refundPairId);
  const credits = entries.filter(e => e.type === 'credit' && !e.refundPairId);

  const pairs: RefundPair[] = [];
  const usedSpendIds = new Set<string>();
  const usedCreditIds = new Set<string>();

  const candidates: Array<{ spend: SpendEntry; credit: SpendEntry; score: number; reason: string }> = [];
  for (const spend of spends) {
    for (const credit of credits) {
      const result = scoreMatch(spend, credit);
      if (result) candidates.push({ spend, credit, score: result.score, reason: result.reason });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    if (usedSpendIds.has(c.spend.id) || usedCreditIds.has(c.credit.id)) continue;
    usedSpendIds.add(c.spend.id);
    usedCreditIds.add(c.credit.id);
    const netAmount = Math.max(0, c.spend.amount - c.credit.amount);
    pairs.push({
      id: `${c.spend.id}-${c.credit.id}`,
      spend: c.spend,
      credit: c.credit,
      confidence: c.score >= 60 ? 'high' : 'medium',
      reason: c.reason,
      netAmount,
      isFullRefund: netAmount < 0.01,
    });
  }

  return pairs;
}

interface Props {
  data: BudgetData;
  onDataChange: (d: BudgetData) => void;
}

export function RefundMatcher({ data, onDataChange }: Props) {
  const [pairs, setPairs] = useState<RefundPair[]>([]);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (data.entries.length === 0) return;
    if (scanned) return;
    const found = findRefundPairs(data.entries);
    if (found.length > 0) {
      setPairs(found);
      const preConfirmed = new Set(found.filter(p => p.confidence === 'high').map(p => p.id));
      setConfirmed(preConfirmed);
      setOpen(true);
    }
    setScanned(true);
  }, [data.entries.length, scanned]);

  const handleConfirm = useCallback((id: string) => {
    setConfirmed(prev => { const s = new Set(prev); s.add(id); return s; });
    setRejected(prev => { const s = new Set(prev); s.delete(id); return s; });
  }, []);

  const handleReject = useCallback((id: string) => {
    setRejected(prev => { const s = new Set(prev); s.add(id); return s; });
    setConfirmed(prev => { const s = new Set(prev); s.delete(id); return s; });
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }, []);

  const handleApplyAll = useCallback(() => {
    let latest = data;
    for (const pair of pairs) {
      if (confirmed.has(pair.id)) {
        latest = linkRefundPair(pair.spend.id, pair.credit.id);
      }
    }
    setPairs(prev => prev.filter(p => !confirmed.has(p.id) && !rejected.has(p.id)));
    setConfirmed(new Set());
    setRejected(new Set());
    onDataChange(latest);
    setOpen(false);
  }, [data, pairs, confirmed, rejected, onDataChange]);

  const handleSkip = useCallback(() => {
    setOpen(false);
  }, []);

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const confirmedCount = confirmed.size;
  const unreviewedCount = pairs.filter(p => !confirmed.has(p.id) && !rejected.has(p.id)).length;

  const bell = !open && pairs.length > 0 ? (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 99999,
      }}
    >
      <button
        onClick={handleOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 18px',
          borderRadius: '999px',
          border: 'none',
          background: 'hsl(350, 80%, 52%)',
          color: 'white',
          fontSize: '14px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 8px 24px -4px rgba(0,0,0,0.35)',
          position: 'relative',
        }}
      >
        <Bell style={{ width: '16px', height: '16px' }} />
        {unreviewedCount > 0 ? `${unreviewedCount} refund match${unreviewedCount !== 1 ? 'es' : ''} to review` : 'Review refund matches'}
        {unreviewedCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'white',
            color: 'hsl(350, 80%, 52%)',
            fontSize: '11px',
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {unreviewedCount}
          </span>
        )}
      </button>
    </div>
  ) : null;

  const modal = open ? (
    <div
      onClick={handleSkip}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '16px',
          border: '2px solid #e2e8f0',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px -12px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', borderTop: '4px solid hsl(350, 80%, 52%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'hsl(350, 80%, 52%, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Link style={{ width: '16px', height: '16px', color: 'hsl(350, 80%, 52%)' }} />
            </div>
            <h2 style={{ fontFamily: 'Rubik, sans-serif', fontWeight: 700, fontSize: '18px', margin: 0 }}>
              Possible Refund Matches Found
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            We scanned your {data.entries.length} transactions and found <strong>{pairs.length} possible spend/refund pair{pairs.length !== 1 ? 's' : ''}</strong>. Confirm to net them off, or reject to keep separate. <strong>Nothing changes until you click Apply.</strong>
          </p>
          {unreviewedCount > 0 && (
            <p style={{ fontSize: '12px', color: 'hsl(38, 90%, 42%)', fontWeight: 600, marginTop: '6px', marginBottom: 0 }}>
              ⚠ {unreviewedCount} pair{unreviewedCount !== 1 ? 's' : ''} still need your decision
            </p>
          )}
        </div>

        {/* Pairs list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {pairs.map((pair) => {
            const isConfirmed = confirmed.has(pair.id);
            const isRejected = rejected.has(pair.id);
            const isExp = expanded.has(pair.id);

            return (
              <div
                key={pair.id}
                style={{
                  padding: '16px',
                  borderBottom: '1px solid #e2e8f0',
                  background: isConfirmed ? 'hsl(145, 55%, 38%, 0.06)' : isRejected ? '#f8fafc' : 'white',
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                  <span style={{
                    flexShrink: 0,
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.08em',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    marginTop: '2px',
                    background: pair.confidence === 'high' ? 'rgba(46,160,67,0.15)' : 'rgba(210,140,0,0.15)',
                    color: pair.confidence === 'high' ? 'hsl(145, 55%, 32%)' : 'hsl(38, 90%, 35%)',
                  }}>
                    {pair.confidence}
                  </span>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, display: 'flex', flexWrap: 'wrap' as const, gap: '6px', alignItems: 'center' }}>
                      <span style={{ color: 'hsl(5, 75%, 48%)' }}>
                        -{pair.spend.note || pair.spend.category} £{pair.spend.amount.toFixed(2)}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>({pair.spend.date})</span>
                      <span style={{ color: '#94a3b8' }}>↔</span>
                      <span style={{ color: 'hsl(145, 55%, 38%)' }}>
                        +{pair.credit.note || pair.credit.category} £{pair.credit.amount.toFixed(2)}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>({pair.credit.date})</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
                      <span>Match: {pair.reason}</span>
                      <span style={{ fontWeight: 700, color: pair.isFullRefund ? 'hsl(145, 55%, 38%)' : 'hsl(350, 80%, 52%)' }}>
                        {pair.isFullRefund ? '✓ Full refund — net: £0' : `Partial refund — net: £${pair.netAmount.toFixed(2)}`}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleExpand(pair.id)}
                    style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
                  >
                    {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ borderRadius: '8px', border: '1px solid rgba(220,50,50,0.25)', background: 'rgba(220,50,50,0.04)', padding: '10px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 700, color: 'hsl(5, 75%, 48%)', marginBottom: '6px' }}>SPEND</div>
                      <div><span style={{ color: '#64748b' }}>Date: </span>{pair.spend.date}</div>
                      <div><span style={{ color: '#64748b' }}>Amount: </span>£{pair.spend.amount.toFixed(2)}</div>
                      <div><span style={{ color: '#64748b' }}>Category: </span>{pair.spend.category}</div>
                      {pair.spend.note && <div><span style={{ color: '#64748b' }}>Merchant: </span>{pair.spend.note}</div>}
                    </div>
                    <div style={{ borderRadius: '8px', border: '1px solid rgba(46,160,67,0.25)', background: 'rgba(46,160,67,0.04)', padding: '10px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 700, color: 'hsl(145, 55%, 38%)', marginBottom: '6px' }}>CREDIT / REFUND</div>
                      <div><span style={{ color: '#64748b' }}>Date: </span>{pair.credit.date}</div>
                      <div><span style={{ color: '#64748b' }}>Amount: </span>£{pair.credit.amount.toFixed(2)}</div>
                      <div><span style={{ color: '#64748b' }}>Category: </span>{pair.credit.category}</div>
                      {pair.credit.note && <div><span style={{ color: '#64748b' }}>Merchant: </span>{pair.credit.note}</div>}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    onClick={() => handleConfirm(pair.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '2px solid hsl(145, 55%, 38%)',
                      background: isConfirmed ? 'hsl(145, 55%, 38%)' : 'white',
                      color: isConfirmed ? 'white' : 'hsl(145, 55%, 38%)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Check size={14} />
                    {isConfirmed ? 'Confirmed ✓' : 'Yes — net these off'}
                  </button>
                  <button
                    onClick={() => handleReject(pair.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: '2px solid #cbd5e1',
                      background: isRejected ? '#e2e8f0' : 'white',
                      color: isRejected ? '#475569' : '#94a3b8',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <X size={14} />
                    {isRejected ? 'Kept separate' : 'No — keep separate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '12px' }}>
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            <span style={{ fontWeight: 700, color: 'hsl(145, 55%, 38%)' }}>{confirmedCount} confirmed</span>
            {' · '}
            <span style={{ fontWeight: 700, color: '#94a3b8' }}>{rejected.size} rejected</span>
            {unreviewedCount > 0 && <span style={{ color: 'hsl(38, 90%, 42%)', fontWeight: 600 }}> · {unreviewedCount} pending</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSkip}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '2px solid #e2e8f0',
                background: 'white',
                color: '#64748b',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Skip for now
            </button>
            <button
              onClick={handleApplyAll}
              disabled={confirmedCount === 0}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: confirmedCount === 0 ? '#e2e8f0' : 'hsl(350, 80%, 52%)',
                color: confirmedCount === 0 ? '#94a3b8' : 'white',
                fontSize: '13px',
                fontWeight: 700,
                cursor: confirmedCount === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Apply {confirmedCount} confirmed match{confirmedCount !== 1 ? 'es' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {typeof document !== 'undefined' && bell && createPortal(bell, document.body)}
      {typeof document !== 'undefined' && modal && createPortal(modal, document.body)}
    </>
  );
}
