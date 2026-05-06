import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { SpendEntry, BudgetData } from '@/lib/budget-types';
import { linkRefundPair } from '@/lib/budget-store';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

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
  if (spend.refundPairId || credit.refundPairId) return null; // already linked

  let score = 0;
  const reasons: string[] = [];

  // Same amount = strong signal
  const amountDiff = Math.abs(spend.amount - credit.amount);
  if (amountDiff < 0.01) {
    score += 40;
    reasons.push('same amount');
  } else if (amountDiff / spend.amount < 0.15) {
    score += 20;
    reasons.push('similar amount');
  } else if (credit.amount > spend.amount) {
    return null; // credit larger than spend — unlikely refund
  }

  // Note/merchant similarity
  const spendNote = (spend.note || '').toLowerCase().trim();
  const creditNote = (credit.note || '').toLowerCase().trim();
  if (spendNote && creditNote) {
    if (spendNote === creditNote) {
      score += 40;
      reasons.push(`same merchant "${spend.note}"`);
    } else {
      // Check if first word matches (e.g. "Zara Oxford St" vs "Zara")
      const spendWords = spendNote.split(/\s+/);
      const creditWords = creditNote.split(/\s+/);
      const commonWords = spendWords.filter(w => w.length > 3 && creditWords.some(cw => cw.includes(w) || w.includes(cw)));
      if (commonWords.length > 0) {
        score += 25;
        reasons.push(`matching merchant "${commonWords[0]}"`);
      }
    }
  } else if (spendNote && !creditNote) {
    // Credit has no note — category match is weaker
    score += 5;
  }

  // Category match (e.g. Groceries spend → Shopping Refund credit, or same category)
  const spendCat = spend.category.toLowerCase();
  const creditCat = credit.category.toLowerCase();
  if (spendCat === creditCat) {
    score += 15;
    reasons.push('same category');
  } else if (creditCat === 'shopping refund') {
    score += 10;
    reasons.push('Shopping Refund credit');
  }

  // Date proximity — within 60 days
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
    return null; // too far apart
  }

  // Credit must come after spend (refunds come after purchase)
  if (new Date(credit.date) < new Date(spend.date)) {
    score -= 15; // penalise but don't exclude (data entry order may vary)
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

  // Build all candidate matches sorted by score desc
  const candidates: Array<{ spend: SpendEntry; credit: SpendEntry; score: number; reason: string }> = [];
  for (const spend of spends) {
    for (const credit of credits) {
      const result = scoreMatch(spend, credit);
      if (result) {
        candidates.push({ spend, credit, score: result.score, reason: result.reason });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  // Greedy match — each entry used at most once
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
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (data.entries.length === 0) return;
    if (done) return;
    const found = findRefundPairs(data.entries);
    if (found.length > 0) {
      setPairs(found);
      // Pre-confirm high-confidence pairs, leave medium for manual review
      const preConfirmed = new Set(found.filter(p => p.confidence === 'high').map(p => p.id));
      setConfirmed(preConfirmed);
      setOpen(true);
    }
  }, [data.entries.length]);

  const toggle = (id: string, action: 'confirm' | 'reject') => {
    if (action === 'confirm') {
      setConfirmed(prev => { const s = new Set(prev); s.add(id); return s; });
      setRejected(prev => { const s = new Set(prev); s.delete(id); return s; });
    } else {
      setRejected(prev => { const s = new Set(prev); s.add(id); return s; });
      setConfirmed(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const handleApplyAll = () => {
    let latest = data;
    for (const pair of pairs) {
      if (confirmed.has(pair.id)) {
        latest = linkRefundPair(pair.spend.id, pair.credit.id);
      }
    }
    onDataChange(latest);
    setDone(true);
    setOpen(false);
  };

  const confirmedCount = confirmed.size;
  const pendingCount = pairs.length - confirmed.size - rejected.size;

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            className="bg-card rounded-2xl border-2 border-border w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            style={{ boxShadow: '0 24px 60px -12px hsl(230 25% 12% / 0.35)' }}
          >
            {/* Header */}
            <div className="p-5 border-b border-border" style={{ borderTop: '4px solid hsl(var(--primary))' }}>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Link className="w-4 h-4 text-primary" />
                </div>
                <h2 className="font-display text-xl">Possible Refund Matches Found</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                We scanned your {data.entries.length} transactions and found <strong>{pairs.length} possible spend/refund pair{pairs.length !== 1 ? 's' : ''}</strong>. Review each one — confirm to net them off, or reject to leave them separate. Nothing changes until you click "Apply confirmed matches".
              </p>
              {pendingCount > 0 && (
                <p className="text-xs text-budget-warning mt-1 font-semibold">⚠ {pendingCount} pair{pendingCount !== 1 ? 's' : ''} still need your review</p>
              )}
            </div>

            {/* Pairs list */}
            <div className="overflow-y-auto flex-1 divide-y divide-border">
              {pairs.map((pair) => {
                const isConfirmed = confirmed.has(pair.id);
                const isRejected = rejected.has(pair.id);
                const isPending = !isConfirmed && !isRejected;
                const isExp = expanded.has(pair.id);

                return (
                  <div
                    key={pair.id}
                    className={`p-4 transition-colors ${isConfirmed ? 'bg-budget-under/8' : isRejected ? 'bg-muted/40' : 'bg-background'}`}
                  >
                    {/* Summary row */}
                    <div className="flex items-start gap-3">
                      {/* Confidence badge */}
                      <span className={`shrink-0 mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${pair.confidence === 'high' ? 'bg-budget-under/20 text-budget-under' : 'bg-budget-warning/20 text-budget-warning'}`}>
                        {pair.confidence}
                      </span>

                      {/* Pair description */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                          <span className="text-budget-over">
                            -{pair.spend.note || pair.spend.category} £{pair.spend.amount.toFixed(2)}
                          </span>
                          <span className="text-muted-foreground text-xs">({pair.spend.date})</span>
                          <span className="text-muted-foreground">↔</span>
                          <span className="text-budget-under">
                            +{pair.credit.note || pair.credit.category} £{pair.credit.amount.toFixed(2)}
                          </span>
                          <span className="text-muted-foreground text-xs">({pair.credit.date})</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">Match reason: {pair.reason}</span>
                          <span className="text-[11px] font-bold">
                            {pair.isFullRefund
                              ? <span className="text-budget-under">✓ Full refund — net: £0</span>
                              : <span className="text-primary">Partial refund — net: £{pair.netAmount.toFixed(2)}</span>
                            }
                          </span>
                        </div>
                      </div>

                      {/* Expand toggle */}
                      <button onClick={() => toggleExpand(pair.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                        {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isExp && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                            <div className="rounded-lg border border-budget-over/30 bg-budget-over/5 p-3">
                              <div className="font-bold text-budget-over mb-1">SPEND</div>
                              <div><span className="text-muted-foreground">Date:</span> {pair.spend.date}</div>
                              <div><span className="text-muted-foreground">Amount:</span> £{pair.spend.amount.toFixed(2)}</div>
                              <div><span className="text-muted-foreground">Category:</span> {pair.spend.category}</div>
                              {pair.spend.note && <div><span className="text-muted-foreground">Merchant:</span> {pair.spend.note}</div>}
                            </div>
                            <div className="rounded-lg border border-budget-under/30 bg-budget-under/5 p-3">
                              <div className="font-bold text-budget-under mb-1">CREDIT / REFUND</div>
                              <div><span className="text-muted-foreground">Date:</span> {pair.credit.date}</div>
                              <div><span className="text-muted-foreground">Amount:</span> £{pair.credit.amount.toFixed(2)}</div>
                              <div><span className="text-muted-foreground">Category:</span> {pair.credit.category}</div>
                              {pair.credit.note && <div><span className="text-muted-foreground">Merchant:</span> {pair.credit.note}</div>}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => toggle(pair.id, 'confirm')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          isConfirmed
                            ? 'bg-budget-under text-white border-budget-under'
                            : 'border-budget-under/40 text-budget-under hover:bg-budget-under/10'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        {isConfirmed ? 'Confirmed' : 'Yes, these match — net them off'}
                      </button>
                      <button
                        onClick={() => toggle(pair.id, 'reject')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          isRejected
                            ? 'bg-muted text-muted-foreground border-muted'
                            : 'border-border text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        <X className="w-3.5 h-3.5" />
                        {isRejected ? 'Rejected' : 'No, keep separate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border bg-secondary/40 flex items-center justify-between gap-4 flex-wrap">
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-budget-under">{confirmedCount} confirmed</span>
                {' · '}
                <span className="font-semibold text-destructive">{rejected.size} rejected</span>
                {pendingCount > 0 && <span className="text-budget-warning"> · {pendingCount} pending</span>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDone(true); setOpen(false); }}>
                  Skip for now
                </Button>
                <Button
                  size="sm"
                  disabled={confirmedCount === 0}
                  onClick={handleApplyAll}
                  className="bg-primary text-white hover:bg-primary/90"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Apply {confirmedCount} confirmed match{confirmedCount !== 1 ? 'es' : ''}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
