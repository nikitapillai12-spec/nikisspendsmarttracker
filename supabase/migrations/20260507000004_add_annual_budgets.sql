CREATE TABLE IF NOT EXISTS annual_budgets (
  vault_id   uuid        NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  year       integer     NOT NULL,
  label      text        NOT NULL,
  amount     numeric     NOT NULL DEFAULT 0,
  categories jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vault_id, year, label)
);

ALTER TABLE annual_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault owner full access" ON annual_budgets
  USING (vault_id = (SELECT id FROM vaults WHERE id = vault_id));
