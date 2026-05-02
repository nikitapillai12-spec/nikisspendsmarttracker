ALTER TABLE public.spend_entries ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'spend';
ALTER TABLE public.custom_categories ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'spend';
ALTER TABLE public.spend_entries ADD CONSTRAINT spend_entries_type_check CHECK (type IN ('spend','credit'));
ALTER TABLE public.custom_categories ADD CONSTRAINT custom_categories_type_check CHECK (type IN ('spend','credit'));