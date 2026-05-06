CREATE TABLE public.backup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vault_id, snapshot_date)
);

ALTER TABLE public.backup_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read backup_snapshots"
  ON public.backup_snapshots FOR SELECT USING (true);

CREATE POLICY "Public write backup_snapshots"
  ON public.backup_snapshots FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX backup_snapshots_vault_date_idx
  ON public.backup_snapshots (vault_id, snapshot_date DESC);