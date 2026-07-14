
-- Helper: current vault id from request header 'x-vault-id'
CREATE OR REPLACE FUNCTION public.current_vault_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  BEGIN
    v := current_setting('request.headers', true)::json ->> 'x-vault-id';
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  BEGIN
    RETURN v::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.current_vault_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_vault_id() TO anon, authenticated, service_role;

-- ============ VAULTS: remove direct client access, expose via RPCs ============
DROP POLICY IF EXISTS "Public read vaults" ON public.vaults;
DROP POLICY IF EXISTS "Public update vaults" ON public.vaults;
DROP POLICY IF EXISTS "Public insert vaults" ON public.vaults;

REVOKE ALL ON public.vaults FROM anon, authenticated;
GRANT ALL ON public.vaults TO service_role;
ALTER TABLE public.vaults ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.find_vault_id_by_passcode(_hash text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.vaults WHERE passcode_hash = _hash LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.create_vault(_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.vaults(passcode_hash) VALUES(_hash) RETURNING id INTO v;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_vault_passcode(_vault_id uuid, _current_hash text, _new_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.vaults
    SET passcode_hash = _new_hash, updated_at = now()
    WHERE id = _vault_id AND passcode_hash = _current_hash;
  IF FOUND THEN RETURN true; ELSE RETURN false; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.find_vault_id_by_passcode(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_vault(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_vault_passcode(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_vault_id_by_passcode(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_vault(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_vault_passcode(uuid, text, text) TO anon, authenticated;

-- ============ Data tables: scope to current_vault_id() ============
-- spend_entries
DROP POLICY IF EXISTS "Public read spend_entries" ON public.spend_entries;
DROP POLICY IF EXISTS "Public write spend_entries" ON public.spend_entries;
CREATE POLICY "vault scoped access" ON public.spend_entries
  FOR ALL TO anon, authenticated
  USING (vault_id = public.current_vault_id())
  WITH CHECK (vault_id = public.current_vault_id());

-- monthly_budgets
DROP POLICY IF EXISTS "Public read monthly_budgets" ON public.monthly_budgets;
DROP POLICY IF EXISTS "Public write monthly_budgets" ON public.monthly_budgets;
CREATE POLICY "vault scoped access" ON public.monthly_budgets
  FOR ALL TO anon, authenticated
  USING (vault_id = public.current_vault_id())
  WITH CHECK (vault_id = public.current_vault_id());

-- category_budgets
DROP POLICY IF EXISTS "Public read category_budgets" ON public.category_budgets;
DROP POLICY IF EXISTS "Public write category_budgets" ON public.category_budgets;
CREATE POLICY "vault scoped access" ON public.category_budgets
  FOR ALL TO anon, authenticated
  USING (vault_id = public.current_vault_id())
  WITH CHECK (vault_id = public.current_vault_id());

-- custom_categories
DROP POLICY IF EXISTS "Public read custom_categories" ON public.custom_categories;
DROP POLICY IF EXISTS "Public write custom_categories" ON public.custom_categories;
CREATE POLICY "vault scoped access" ON public.custom_categories
  FOR ALL TO anon, authenticated
  USING (vault_id = public.current_vault_id())
  WITH CHECK (vault_id = public.current_vault_id());

-- recurring_payments
DROP POLICY IF EXISTS "Public read recurring_payments" ON public.recurring_payments;
DROP POLICY IF EXISTS "Public write recurring_payments" ON public.recurring_payments;
CREATE POLICY "vault scoped access" ON public.recurring_payments
  FOR ALL TO anon, authenticated
  USING (vault_id = public.current_vault_id())
  WITH CHECK (vault_id = public.current_vault_id());

-- investment_platforms
DROP POLICY IF EXISTS "Public read investment_platforms" ON public.investment_platforms;
DROP POLICY IF EXISTS "Public write investment_platforms" ON public.investment_platforms;
CREATE POLICY "vault scoped access" ON public.investment_platforms
  FOR ALL TO anon, authenticated
  USING (vault_id = public.current_vault_id())
  WITH CHECK (vault_id = public.current_vault_id());

-- investment_entries
DROP POLICY IF EXISTS "Public read investment_entries" ON public.investment_entries;
DROP POLICY IF EXISTS "Public write investment_entries" ON public.investment_entries;
CREATE POLICY "vault scoped access" ON public.investment_entries
  FOR ALL TO anon, authenticated
  USING (vault_id = public.current_vault_id())
  WITH CHECK (vault_id = public.current_vault_id());

-- annual_budgets
DROP POLICY IF EXISTS "vault owner full access" ON public.annual_budgets;
CREATE POLICY "vault scoped access" ON public.annual_budgets
  FOR ALL TO anon, authenticated
  USING (vault_id = public.current_vault_id())
  WITH CHECK (vault_id = public.current_vault_id());

-- refund_learned_patterns
DROP POLICY IF EXISTS "vault owner full access" ON public.refund_learned_patterns;
CREATE POLICY "vault scoped access" ON public.refund_learned_patterns
  FOR ALL TO anon, authenticated
  USING (vault_id = public.current_vault_id())
  WITH CHECK (vault_id = public.current_vault_id());

-- backup_snapshots
DROP POLICY IF EXISTS "Public read backup_snapshots" ON public.backup_snapshots;
DROP POLICY IF EXISTS "Public write backup_snapshots" ON public.backup_snapshots;
CREATE POLICY "vault scoped access" ON public.backup_snapshots
  FOR ALL TO anon, authenticated
  USING (vault_id = public.current_vault_id())
  WITH CHECK (vault_id = public.current_vault_id());
