
DROP POLICY "Authenticated can insert entries" ON public.monitoring_entries;
DROP POLICY "Authenticated can update entries" ON public.monitoring_entries;
DROP POLICY "Authenticated can delete entries" ON public.monitoring_entries;

CREATE POLICY "Authenticated can insert entries" ON public.monitoring_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update entries" ON public.monitoring_entries
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete entries" ON public.monitoring_entries
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
