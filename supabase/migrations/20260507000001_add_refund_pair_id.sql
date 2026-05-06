-- Add refund_pair_id to spend_entries to link spend/refund pairs (Item 2)
ALTER TABLE spend_entries
  ADD COLUMN IF NOT EXISTS refund_pair_id uuid REFERENCES spend_entries(id) ON DELETE SET NULL;

-- Allow 'investment' as a valid type alongside 'spend' and 'credit'
ALTER TABLE spend_entries
  DROP CONSTRAINT IF EXISTS spend_entries_type_check;

ALTER TABLE spend_entries
  ADD CONSTRAINT spend_entries_type_check
  CHECK (type IN ('spend', 'credit', 'investment'));
