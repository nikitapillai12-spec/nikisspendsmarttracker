-- Stores per-vault learned refund matching patterns (cross-device sync)
CREATE TABLE IF NOT EXISTS refund_learned_patterns (
  vault_id uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vault_id)
);

ALTER TABLE refund_learned_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault owner full access" ON refund_learned_patterns
  USING (vault_id = (SELECT id FROM vaults WHERE id = vault_id))
  WITH CHECK (vault_id = (SELECT id FROM vaults WHERE id = vault_id));
