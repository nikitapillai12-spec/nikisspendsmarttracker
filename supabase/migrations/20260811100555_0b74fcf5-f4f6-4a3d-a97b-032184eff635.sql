CREATE TABLE public.budget_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id uuid NOT NULL REFERENCES public.vaults(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_plans TO anon, authenticated;
GRANT ALL ON public.budget_plans TO service_role;

ALTER TABLE public.budget_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault scoped access" ON public.budget_plans
  FOR ALL TO anon, authenticated
  USING (vault_id = current_vault_id())
  WITH CHECK (vault_id = current_vault_id());

CREATE TABLE public.recurring_investments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_id uuid NOT NULL REFERENCES public.vaults(id),
  amount numeric NOT NULL,
  platform text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  frequency text NOT NULL DEFAULT 'monthly',
  day_of_week integer,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_investments TO anon, authenticated;
GRANT ALL ON public.recurring_investments TO service_role;

ALTER TABLE public.recurring_investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault scoped access" ON public.recurring_investments
  FOR ALL TO anon, authenticated
  USING (vault_id = current_vault_id())
  WITH CHECK (vault_id = current_vault_id());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_budget_plans_updated_at
  BEFORE UPDATE ON public.budget_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recurring_investments_updated_at
  BEFORE UPDATE ON public.recurring_investments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();