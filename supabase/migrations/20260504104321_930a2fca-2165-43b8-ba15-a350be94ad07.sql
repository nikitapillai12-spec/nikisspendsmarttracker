-- Recurring monthly payments (Rent, Utilities, Subscriptions, etc.)
CREATE TABLE public.recurring_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id UUID NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  start_month TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  end_month TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.recurring_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read recurring_payments" ON public.recurring_payments FOR SELECT USING (true);
CREATE POLICY "Public write recurring_payments" ON public.recurring_payments FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.recurring_payments;
ALTER TABLE public.recurring_payments REPLICA IDENTITY FULL;

-- Investment platforms (editable list)
CREATE TABLE public.investment_platforms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vault_id, name)
);
ALTER TABLE public.investment_platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read investment_platforms" ON public.investment_platforms FOR SELECT USING (true);
CREATE POLICY "Public write investment_platforms" ON public.investment_platforms FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.investment_platforms;
ALTER TABLE public.investment_platforms REPLICA IDENTITY FULL;

-- Investment top-ups (neutral, separate from spend)
CREATE TABLE public.investment_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  platform TEXT NOT NULL,
  entry_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.investment_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read investment_entries" ON public.investment_entries FOR SELECT USING (true);
CREATE POLICY "Public write investment_entries" ON public.investment_entries FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.investment_entries;
ALTER TABLE public.investment_entries REPLICA IDENTITY FULL;