
CREATE TABLE public.vaults (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  passcode_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.spend_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spend_entries_vault_date ON public.spend_entries(vault_id, entry_date);

CREATE TABLE public.monthly_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  UNIQUE (vault_id, month)
);

CREATE TABLE public.category_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  month TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  UNIQUE (vault_id, category, month)
);

CREATE TABLE public.custom_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id UUID NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vault_id, name)
);

ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spend_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;

-- Passcode-gated shared vault: access controlled in-app, policies permit anon read/write.
CREATE POLICY "Public read vaults" ON public.vaults FOR SELECT USING (true);
CREATE POLICY "Public insert vaults" ON public.vaults FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update vaults" ON public.vaults FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Public read spend_entries" ON public.spend_entries FOR SELECT USING (true);
CREATE POLICY "Public write spend_entries" ON public.spend_entries FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read monthly_budgets" ON public.monthly_budgets FOR SELECT USING (true);
CREATE POLICY "Public write monthly_budgets" ON public.monthly_budgets FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read category_budgets" ON public.category_budgets FOR SELECT USING (true);
CREATE POLICY "Public write category_budgets" ON public.category_budgets FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read custom_categories" ON public.custom_categories FOR SELECT USING (true);
CREATE POLICY "Public write custom_categories" ON public.custom_categories FOR ALL USING (true) WITH CHECK (true);
