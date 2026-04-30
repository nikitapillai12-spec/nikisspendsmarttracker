ALTER TABLE public.spend_entries REPLICA IDENTITY FULL;
ALTER TABLE public.monthly_budgets REPLICA IDENTITY FULL;
ALTER TABLE public.category_budgets REPLICA IDENTITY FULL;
ALTER TABLE public.custom_categories REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.spend_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monthly_budgets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.category_budgets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_categories;