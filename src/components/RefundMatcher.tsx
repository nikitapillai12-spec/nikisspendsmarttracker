import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
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

function scoreMatch(spend: SpendEntry, credit: SpendEntry): { score: number; reason: string } | null {
  if ((spend.type ?? 'spend') !== 'spend') return null;
  if (credit.type !== 'credit') return null;
  if (spend.refundPairId || credit.refundPairId) return null;

  let score = 0;
  const reasons: string[] = [];

  const amountDiff = Math.abs(spend.amount - credit.amount);
  if (amountDiff < 0.01) {
    score += 40; reasons.push('same amount');
  } else if (amountDiff / spend.amount < 0.15) {
    score += 20; reasons.push('similar amount');
  } else if (credit.amount > spend.amount) {
    return null;
  }

  const spendNote = (spend.note || '').toLowerCase().trim();
  const creditNote = (credit.note || '').toLowerCase().trim();
  if (spendNote && creditNote) {
    if (spendNote === creditNote) {
      score += 40; reasons.push(`same merchant "${spend.note}"`);
    } else {
      const spendWords = spendNote.split(/\s+/);
      const creditWords = creditNote.split(/\s+/);
      const common = spendWords.filter(w => w.length > 3 && creditWords.some(cw => cw.includes(w) || w.includes(cw)));
      if (common.length > 0) { score += 25; reasons.push(`matching merchant "${common[0]}"`); }
    }
  }

  if (spend.category.toLowerCase() === credit.category.toLowerCase()) {
    score += 15; reasons.push('same category');
  } else if (credit.category.toLowerCase() === 'shopping refund') {
    score += 10; reasons.push('Shopping Refund credit');
  }

  const daysDiff = Math.abs(new Date(spend.date).getTime() - new Date(credit.date).getTime()) / 86400000;
  if (daysDiff <= 7) { score += 20; reasons.push(`${Math.round(daysDiff)}d apart`); }
  else if (daysDiff <= 30) { score += 10; reasons.push(`${Math.round(daysDiff)}d apart`); }
  else if (daysDiff <= 60) { score += 3; }
  else return null;

  if (new Date(credit.date) < new Date(spend.date)) score -= 15;
  if (score < 30) return null;
  return { score, reason: reasons.join(' · ') };
}

export function findRefundPairs(entries: SpendEntry[]): RefundPair[] {
  const spends = entries.filter(e => (e.type ?? 'spend') === 'spend' && !e.refundPairId);
  const credits = entries.filter(e => e.type === 'credit' && !e.refundPairId);
  const pairs: RefundPair[] = [];
  const usedS = new Set<string>();
  const usedC = new Set<string>();
  const candidates: Array<{ spend: SpendEntry; credit: SpendEntry; score: number; reason: string }> = [];
  for (const s of spends) for (const c of credits) {
    const r = scoreMatch(s, c);
    if (r) candidates.push({ spend: s, credit: c, ...r });
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (usedS.has(c.spend.id) || usedC.has(c.credit.id)) continue;
    usedS.add(c.spend.id); usedC.add(c.credit.id);
    const net = Math.max(0, c.spend.amount - c.credit.amount);
    pairs.push({ id: `${c.spend.id}-${c.credit.id}`, spend: c.spend, credit: c.credit, confidence: c.score >= 60 ? 'high' : 'medium', reason: c.reason, netAmount: net, isFullRefund: net < 0.01 });
  }
  return pairs;
}

interface Props { data: BudgetData; onDataChange: (d: BudgetData) => void; }

// Standalone button — no Tailwind, no Radix, pure HTML
function Btn({ label, onClick, bg, color, border }: { label: string; onClick: () => void; bg: string; color: string; border: string }) {
  return (
    <button
      onPointerDown={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        padding: '9px 16px', borderRadius: '8px', border: `2px solid ${border}`,
        background: bg, color, fontSize: '13px', fontWeight: 700,
        cursor: 'pointer', WebkitAppearance: 'none', touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent', userSelect: 'none',
        display: 'inline-block', lineHeight: 1.2,
      }}
    >
      {label}
    </button>
  );
}

export function RefundMatcher({ data, onDataChange }: Props) {
  const [pairs, setPairs] = useState<RefundPair[]>([]);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [scanned, setScanned] = useState(false);
  const portalRoot = useRef<HTMLElement | null>(null);

  useEffect(() => { portalRoot.current = document.body; }, []);

  useEffect(() => {
    if (data.entries.length === 0 || scanned) return;
    const found = findRefundPairs(data.entries);
    if (found.length > 0) {
      setPairs(found);
      setConfirmed(new Set(found.filter(p => p.confidence === 'high').map(p => p.id)));
      setOpen(true);
    }
    setScanned(true);
  }, [data.entries.length, scanned]);

  const confirm = useCallback((id: string) => {
    setConfirmed(p => { const s = new Set(p); s.add(id); return s; });
    setRejected(p => { const s = new Set(p); s.delete(id); return s; });
  }, []);

  const reject = useCallback((id: string) => {
    setRejected(p => { const s = new Set(p); s.add(id); return s; });
    setConfirmed(p => { const s = new Set(p); s.delete(id); return s; });
  }, []);

  const applyAll = useCallback(() => {
    let latest = data;
    for (const pair of pairs) {
      if (confirmed.has(pair.id)) latest = linkRefundPair(pair.spend.id, pair.credit.id);
    }
    setPairs(p => p.filter(x => !confirmed.has(x.id) && !rejected.has(x.id)));
    setConfirmed(new Set()); setRejected(new Set());
    onDataChange(latest); setOpen(false);
  }, [data, pairs, confirmed, rejected, onDataChange]);

  const skip = useCallback(() => setOpen(false), []);
  const openModal = useCallback(() => setOpen(true), []);

  const confirmedCount = confirmed.size;
  const unreviewedCount = pairs.filter(p => !confirmed.has(p.id) && !rejected.has(p.id)).length;

  if (!portalRoot.current) return null;

  const bell = !open && pairs.length > 0 && (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999999 }}>
      <button
        onPointerDown={(e) => { e.stopPropagation(); openModal(); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px',
          borderRadius: 999, border: 'none', background: 'hsl(350,80%,52%)',
          color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 8px 24px -4px rgba(0,0,0,0.4)',
          touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
          position: 'relative' as const,
        }}
      >
        🔔 {unreviewedCount > 0 ? `${unreviewedCount} refund match${unreviewedCount !== 1 ? 'es' : ''} to review` : 'Review refund matches'}
        {unreviewedCount > 0 && (
          <span style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'white', color: 'hsl(350,80%,52%)', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {unreviewedCount}
          </span>
        )}
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
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>🔗 Possible Refund Matches Found</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            Found <strong>{pairs.length} possible spend/refund pair{pairs.length !== 1 ? 's' : ''}</strong> across your {data.entries.length} transactions. Confirm to net them off, or keep separate. <strong>Nothing changes until you click Apply.</strong>
          </div>
          {unreviewedCount > 0 && <div style={{ fontSize: 12, color: '#b45309', fontWeight: 600, marginTop: 6 }}>⚠ {unreviewedCount} pair{unreviewedCount !== 1 ? 's' : ''} still need your decision</div>}
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' as any }}>
          {pairs.map((pair) => {
            const isC = confirmed.has(pair.id);
            const isR = rejected.has(pair.id);
            return (
              <div key={pair.id} style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: isC ? '#f0fdf4' : isR ? '#f8fafc' : 'white' }}>
                {/* Pair summary */}
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#1e293b' }}>
                  <span style={{ color: '#dc2626' }}>−{pair.spend.note || pair.spend.category} £{pair.spend.amount.toFixed(2)}</span>
                  <span style={{ color: '#94a3b8', margin: '0 6px' }}>({pair.spend.date})</span>
                  <span style={{ color: '#94a3b8' }}>↔</span>
                  <span style={{ color: '#16a34a', marginLeft: 6 }}>+{pair.credit.note || pair.credit.category} £{pair.credit.amount.toFixed(2)}</span>
                  <span style={{ color: '#94a3b8', margin: '0 6px' }}>({pair.credit.date})</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                  <span style={{ background: pair.confidence === 'high' ? '#dcfce7' : '#fef3c7', color: pair.confidence === 'high' ? '#166534' : '#92400e', padding: '1px 7px', borderRadius: 4, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', marginRight: 8 }}>{pair.confidence}</span>
                  {pair.reason} ·{' '}
                  <strong style={{ color: pair.isFullRefund ? '#16a34a' : '#dc2626' }}>
                    {pair.isFullRefund ? 'Full refund — net: £0' : `Partial — net: £${pair.netAmount.toFixed(2)}`}
                  </strong>
                </div>
                {/* Buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                  <Btn
                    label={isC ? '✓ Confirmed' : 'Yes — net these off'}
                    onClick={() => confirm(pair.id)}
                    bg={isC ? '#16a34a' : 'white'}
                    color={isC ? 'white' : '#16a34a'}
                    border='#16a34a'
                  />
                  <Btn
                    label={isR ? 'Kept separate' : 'No — keep separate'}
                    onClick={() => reject(pair.id)}
                    bg={isR ? '#e2e8f0' : 'white'}
                    color={isR ? '#475569' : '#94a3b8'}
                    border='#cbd5e1'
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10 }}>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            <strong style={{ color: '#16a34a' }}>{confirmedCount} confirmed</strong>
            {' · '}
            <strong style={{ color: '#94a3b8' }}>{rejected.size} rejected</strong>
            {unreviewedCount > 0 && <strong style={{ color: '#b45309' }}> · {unreviewedCount} pending</strong>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn label="Skip for now" onClick={skip} bg="white" color="#64748b" border="#e2e8f0" />
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
