ALTER TABLE public.spend_entries ADD COLUMN IF NOT EXISTS refund_pair_id uuid;
ALTER TABLE public.spend_entries DROP CONSTRAINT IF EXISTS spend_entries_type_check;
ALTER TABLE public.spend_entries ADD CONSTRAINT spend_entries_type_check CHECK (type IN ('spend', 'credit', 'investment'));