import { useRef, useState } from 'react';
import { Upload, FileText, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { SpendEntry, EntryType, DEFAULT_CATEGORIES, DEFAULT_CREDIT_CATEGORIES, getCategoryEmoji } from '@/lib/budget-types';
import { addEntry, getAll } from '@/lib/budget-store';
import { toast } from '@/components/ui/sonner';

type Bank = 'AMEX' | 'Natwest' | 'Lloyds' | 'Barclays' | 'Unknown';

interface ParsedRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  suggestedType: EntryType;
  suggestedCategory: string;
  suggestedNote: string;
  approved: boolean;
  duplicate: boolean;
}

const ALL_SPEND_CATS = [...DEFAULT_CATEGORIES];
const ALL_CREDIT_CATS = [...DEFAULT_CREDIT_CATEGORIES];

/** Keyword-based auto-classifier */
function classifyTransaction(description: string, amount: number): { type: EntryType; category: string; note: string } {
  const desc = description.toLowerCase();
  const note = description.slice(0, 60).trim();

  if (amount < 0 || desc.includes('refund') || desc.includes('credit') || desc.includes('cashback')) {
    return { type: 'credit', category: 'Shopping Refund', note };
  }
  if (desc.includes('salary') || desc.includes('payroll') || desc.includes('wages')) {
    return { type: 'credit', category: 'Salary Payment', note };
  }
  if (desc.includes('dividend') || desc.includes('interest')) {
    return { type: 'credit', category: 'Shopping Refund', note };
  }
  if (desc.includes('invest') || desc.includes('t212') || desc.includes('freetrade') || desc.includes('vanguard') || desc.includes('hargreaves') || desc.includes('isa ') || desc.includes('gia')) {
    return { type: 'investment', category: 'Investment', note };
  }
  if (desc.includes('tesco') || desc.includes('sainsbury') || desc.includes('waitrose') || desc.includes('lidl') || desc.includes('aldi') || desc.includes('asda') || desc.includes('morrisons') || desc.includes('ocado') || desc.includes('marks') || desc.includes('m&s food')) {
    return { type: 'spend', category: 'Groceries', note };
  }
  if (desc.includes('restaurant') || desc.includes('deliveroo') || desc.includes('uber eats') || desc.includes('just eat') || desc.includes('nando') || desc.includes('wagamama') || desc.includes('mcdonalds') || desc.includes('kfc') || desc.includes('pizza') || desc.includes('cafe') || desc.includes('bistro')) {
    return { type: 'spend', category: 'Eating Out', note };
  }
  if (desc.includes('coffee') || desc.includes('starbucks') || desc.includes('costa') || desc.includes('pret') || desc.includes('nero')) {
    return { type: 'spend', category: 'Coffee', note };
  }
  if (desc.includes('tfl') || desc.includes('transport') || desc.includes('rail') || desc.includes('train') || desc.includes('bus') || desc.includes('uber') || desc.includes('taxi') || desc.includes('oyster') || desc.includes('national rail')) {
    return { type: 'spend', category: 'Transport', note };
  }
  if (desc.includes('flight') || desc.includes('airline') || desc.includes('ryanair') || desc.includes('easyjet') || desc.includes('british airways') || desc.includes('heathrow') || desc.includes('gatwick')) {
    return { type: 'spend', category: 'Flights', note };
  }
  if (desc.includes('hotel') || desc.includes('airbnb') || desc.includes('booking.com') || desc.includes('expedia') || desc.includes('trivago')) {
    return { type: 'spend', category: 'Travel Spend', note };
  }
  if (desc.includes('rent') || desc.includes('landlord') || desc.includes('letting')) {
    return { type: 'spend', category: 'Rent', note };
  }
  if (desc.includes('electric') || desc.includes('gas') || desc.includes('water') || desc.includes('council tax') || desc.includes('bulb') || desc.includes('octopus') || desc.includes('british gas') || desc.includes('edf') || desc.includes('e.on')) {
    return { type: 'spend', category: 'Utilities', note };
  }
  if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('amazon prime') || desc.includes('apple') || desc.includes('disney') || desc.includes('now tv') || desc.includes('sky') || desc.includes('gym') || desc.includes('subscription') || desc.includes('monthly')) {
    return { type: 'spend', category: 'Subscriptions', note };
  }
  if (desc.includes('boots') || desc.includes('superdrug') || desc.includes('chemist') || desc.includes('pharmacy') || desc.includes('lloyds pharmacy')) {
    return { type: 'spend', category: 'Toiletries', note };
  }
  if (desc.includes('gym') || desc.includes('fitness') || desc.includes('nuffield') || desc.includes('pure gym') || desc.includes('doctor') || desc.includes('dentist') || desc.includes('optician') || desc.includes('hospital') || desc.includes('nhs')) {
    return { type: 'spend', category: 'Health & Wellness', note };
  }
  if (desc.includes('insurance') || desc.includes('aviva') || desc.includes('axa') || desc.includes('admiral') || desc.includes('direct line')) {
    return { type: 'spend', category: 'Insurance', note };
  }
  if (desc.includes('amazon') || desc.includes('ebay') || desc.includes('asos') || desc.includes('zara') || desc.includes('h&m') || desc.includes('next') || desc.includes('primark') || desc.includes('john lewis') || desc.includes('argos') || desc.includes('currys')) {
    return { type: 'spend', category: 'Gifts', note };
  }
  if (desc.includes('b&q') || desc.includes('ikea') || desc.includes('wickes') || desc.includes('homebase') || desc.includes('screwfix')) {
    return { type: 'spend', category: 'Home Improvement', note };
  }

  return { type: 'spend', category: 'Other', note };
}

function detectBank(text: string): Bank {
  const t = text.toLowerCase();
  if (t.includes('american express') || t.includes('amex')) return 'AMEX';
  if (t.includes('natwest')) return 'Natwest';
  if (t.includes('lloyds')) return 'Lloyds';
  if (t.includes('barclays')) return 'Barclays';
  return 'Unknown';
}

/** Very lightweight PDF text extraction — uses pdfjs-dist if available, otherwise reads raw text */
async function extractTextFromPdf(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        // Try to use pdf.js if loaded globally
        const pdfjsLib = (window as any).pdfjsLib;
        if (pdfjsLib) {
          const data = new Uint8Array(reader.result as ArrayBuffer);
          const pdf = await pdfjsLib.getDocument({ data }).promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item: any) => item.str).join(' ') + '\n';
          }
          resolve(text);
        } else {
          // Fallback: read as text (works for some unencrypted PDFs)
          const decoder = new TextDecoder('latin1');
          const raw = decoder.decode(reader.result as ArrayBuffer);
          resolve(raw);
        }
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/** Parse transaction lines from extracted PDF text */
function parseTransactions(text: string, bank: Bank): Omit<ParsedRow, 'id' | 'approved' | 'duplicate'>[] {
  const rows: Omit<ParsedRow, 'id' | 'approved' | 'duplicate'>[] = [];

  // Date patterns: DD/MM/YYYY, DD MMM YYYY, YYYY-MM-DD
  const datePatterns = [
    /(\d{2}\/\d{2}\/\d{4})/g,
    /(\d{2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi,
    /(\d{4}-\d{2}-\d{2})/g,
  ];

  // Amount patterns: £1,234.56 or 1,234.56 or -1,234.56
  const amountPattern = /[-−]?£?[\d,]+\.\d{2}/g;

  const lines = text.split(/\n|\r/).filter(l => l.trim().length > 5);

  for (const line of lines) {
    let dateStr = '';
    let amount = 0;

    // Try each date pattern
    for (const pat of datePatterns) {
      pat.lastIndex = 0;
      const m = pat.exec(line);
      if (m) { dateStr = m[1]; break; }
    }
    if (!dateStr) continue;

    // Parse date to YYYY-MM-DD
    let parsedDate = '';
    try {
      if (dateStr.includes('/')) {
        const [d, mo, y] = dateStr.split('/');
        parsedDate = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
      } else if (dateStr.match(/\d{4}-\d{2}-\d{2}/)) {
        parsedDate = dateStr;
      } else {
        const dt = new Date(dateStr);
        if (!isNaN(dt.getTime())) parsedDate = dt.toISOString().slice(0, 10);
      }
    } catch { continue; }
    if (!parsedDate || parsedDate < '2020-01-01') continue;

    // Extract amount(s)
    const amounts = line.match(amountPattern);
    if (!amounts || amounts.length === 0) continue;
    const rawAmt = amounts[amounts.length - 1].replace(/[£,\s]/g, '').replace('−', '-');
    amount = Math.abs(parseFloat(rawAmt));
    if (isNaN(amount) || amount <= 0) continue;

    // Description: text between date and amount
    const description = line
      .replace(/\d{2}\/\d{2}\/\d{4}|\d{2}\s+\w{3}\s+\d{4}|\d{4}-\d{2}-\d{2}/g, '')
      .replace(amountPattern, '')
      .replace(/[£,]/g, '')
      .trim()
      .replace(/\s+/g, ' ');

    if (description.length < 2) continue;

    const { type, category, note } = classifyTransaction(description + ' ' + rawAmt, parseFloat(rawAmt));

    rows.push({ date: parsedDate, description, amount, suggestedType: type, suggestedCategory: category, suggestedNote: note });
  }

  return rows;
}

function isDuplicate(row: Omit<ParsedRow, 'id' | 'approved' | 'duplicate'>, existing: SpendEntry[]): boolean {
  return existing.some(e =>
    e.date === row.date &&
    Math.abs(e.amount - row.amount) < 0.01 &&
    (e.type ?? 'spend') === row.suggestedType
  );
}

export function PdfImport({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [bank, setBank] = useState<Bank>('Unknown');
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function processText(text: string) {
    const detectedBank = detectBank(text);
    setBank(detectedBank);
    const existing = getAll().entries;
    const parsed = parseTransactions(text, detectedBank);
    if (parsed.length === 0) {
      toast.error('No transactions found. Check the format — dates and amounts must be present on each line.');
      return;
    }
    const withIds: ParsedRow[] = parsed.map(r => ({
      ...r,
      id: crypto.randomUUID(),
      approved: !isDuplicate(r, existing),
      duplicate: isDuplicate(r, existing),
    }));
    setRows(withIds);
  }

  const handleFile = async (file: File) => {
    setLoading(true);
    setRows([]);
    try {
      const text = await extractTextFromPdf(file);
      const detectedBank = detectBank(text);
      setBank(detectedBank);
      const existing = getAll().entries;
      const parsed = parseTransactions(text, detectedBank);

      if (parsed.length === 0) {
        // PDF extraction failed — switch to paste mode automatically
        setMode('paste');
        toast('PDF text could not be read. Please copy-paste the statement text below instead.', { duration: 6000 });
        setLoading(false);
        return;
      }

      const withIds: ParsedRow[] = parsed.map(r => ({
        ...r,
        id: crypto.randomUUID(),
        approved: !isDuplicate(r, existing),
        duplicate: isDuplicate(r, existing),
      }));
      setRows(withIds);
    } catch (e) {
      setMode('paste');
      toast('Could not read PDF. Please paste the statement text below instead.', { duration: 6000 });
      console.error(e);
    }
    setLoading(false);
  };

  const handleParse = () => {
    if (!pasteText.trim()) { toast.error('Please paste your statement text first.'); return; }
    setRows([]);
    processText(pasteText);
  };

  const toggleApprove = (id: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, approved: !r.approved } : r));
  };

  const updateRow = (id: string, field: keyof ParsedRow, value: any) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSave = async () => {
    const toSave = rows.filter(r => r.approved && !r.duplicate);
    if (toSave.length === 0) { toast.error('No rows approved.'); return; }
    setSaving(true);
    for (const row of toSave) {
      const entry: SpendEntry = {
        id: crypto.randomUUID(),
        amount: row.amount,
        category: row.suggestedCategory,
        date: row.date,
        createdAt: Date.now(),
        note: row.suggestedNote || undefined,
        type: row.suggestedType,
      };
      addEntry(entry);
    }
    setSaving(false);
    toast.success(`Saved ${toSave.length} transaction${toSave.length > 1 ? 's' : ''}`);
    setOpen(false);
    setRows([]);
  };

  const approvedCount = rows.filter(r => r.approved && !r.duplicate).length;
  const dupCount = rows.filter(r => r.duplicate).length;

  const allCats = [...ALL_SPEND_CATS, ...ALL_CREDIT_CATS, 'Investment'];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Import Bank Statement (PDF)</DialogTitle>
          <DialogDescription>
            Supports AMEX, Natwest, Lloyds, Barclays. Review and approve each transaction before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode tabs */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm font-semibold">
            <button
              onClick={() => setMode('upload')}
              className={`flex-1 py-2 flex items-center justify-center gap-2 transition-colors ${mode === 'upload' ? 'bg-primary text-white' : 'bg-background text-muted-foreground hover:text-foreground'}`}
            >
              <Upload className="w-3.5 h-3.5" /> Upload PDF
            </button>
            <button
              onClick={() => setMode('paste')}
              className={`flex-1 py-2 flex items-center justify-center gap-2 transition-colors ${mode === 'paste' ? 'bg-primary text-white' : 'bg-background text-muted-foreground hover:text-foreground'}`}
            >
              <FileText className="w-3.5 h-3.5" /> Paste Text
            </button>
          </div>

          {/* Upload area */}
          {mode === 'upload' && (
            <>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-semibold">Click to upload bank statement PDF</p>
                <p className="text-xs text-muted-foreground mt-1">AMEX · Natwest · Lloyds · Barclays</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                If your PDF is encrypted or image-based, use <button className="underline text-primary" onClick={() => setMode('paste')}>Paste Text</button> instead.
              </p>
            </>
          )}

          {/* Paste text area */}
          {mode === 'paste' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">How to copy from AMEX / your bank:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Open your PDF statement in a browser or PDF viewer</li>
                  <li>Press <kbd className="bg-muted px-1 rounded text-[10px]">Cmd+A</kbd> (Mac) or <kbd className="bg-muted px-1 rounded text-[10px]">Ctrl+A</kbd> (Windows) to select all</li>
                  <li>Press <kbd className="bg-muted px-1 rounded text-[10px]">Cmd+C</kbd> / <kbd className="bg-muted px-1 rounded text-[10px]">Ctrl+C</kbd> to copy</li>
                  <li>Paste it in the box below</li>
                </ol>
              </div>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste your bank statement text here…"
                className="w-full h-40 rounded-xl border border-border p-3 text-xs font-mono resize-none focus:outline-none focus:border-primary bg-background"
              />
              <Button className="w-full" onClick={handleParse} disabled={!pasteText.trim()}>
                Parse Transactions
              </Button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Parsing PDF…</span>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex items-center gap-3 flex-wrap text-sm">
                <span className="font-semibold">Bank detected: <span className="text-primary">{bank}</span></span>
                <span className="text-muted-foreground">·</span>
                <span>{rows.length} transactions found</span>
                {dupCount > 0 && (
                  <span className="flex items-center gap-1 text-budget-warning">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {dupCount} duplicate{dupCount > 1 ? 's' : ''} (auto-deselected)
                  </span>
                )}
                <span className="ml-auto font-semibold text-budget-under">{approvedCount} approved</span>
              </div>

              {/* Select all / none */}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setRows(prev => prev.map(r => ({ ...r, approved: !r.duplicate })))}>
                  Select all non-duplicates
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRows(prev => prev.map(r => ({ ...r, approved: false })))}>
                  Deselect all
                </Button>
              </div>

              {/* Transaction review table */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary sticky top-0">
                      <tr>
                        <th className="p-2 text-left w-8">✓</th>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Description</th>
                        <th className="p-2 text-right">Amount</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-left">Category</th>
                        <th className="p-2 text-left">Note</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={row.id} className={`border-t border-border transition-colors ${row.duplicate ? 'opacity-40 bg-muted/50' : row.approved ? 'bg-budget-under/5' : 'bg-background'}`}>
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={row.approved && !row.duplicate}
                              disabled={row.duplicate}
                              onChange={() => toggleApprove(row.id)}
                              className="w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="p-2 whitespace-nowrap font-mono">{row.date}</td>
                          <td className="p-2 max-w-[180px] truncate text-muted-foreground" title={row.description}>{row.description}</td>
                          <td className="p-2 text-right font-semibold whitespace-nowrap">
                            £{row.amount.toFixed(2)}
                          </td>
                          <td className="p-2">
                            <Select
                              value={row.suggestedType}
                              onValueChange={(v) => updateRow(row.id, 'suggestedType', v)}
                              disabled={row.duplicate}
                            >
                              <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="spend">Spend</SelectItem>
                                <SelectItem value="credit">Credit</SelectItem>
                                <SelectItem value="investment">Investment</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Select
                              value={row.suggestedCategory}
                              onValueChange={(v) => updateRow(row.id, 'suggestedCategory', v)}
                              disabled={row.duplicate}
                            >
                              <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {allCats.map(c => (
                                  <SelectItem key={c} value={c} className="text-xs">{getCategoryEmoji(c, [])} {c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Input
                              value={row.suggestedNote}
                              onChange={e => updateRow(row.id, 'suggestedNote', e.target.value)}
                              disabled={row.duplicate}
                              className="h-7 text-xs w-32"
                              placeholder="Merchant…"
                            />
                          </td>
                          <td className="p-2">
                            {row.duplicate ? (
                              <span className="text-[10px] text-muted-foreground italic">duplicate</span>
                            ) : row.approved ? (
                              <span className="text-[10px] text-budget-under font-semibold">✓ approved</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">skipped</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Button
                className="w-full"
                disabled={approvedCount === 0 || saving}
                onClick={handleSave}
              >
                {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : `Save ${approvedCount} Approved Transaction${approvedCount !== 1 ? 's' : ''}`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
