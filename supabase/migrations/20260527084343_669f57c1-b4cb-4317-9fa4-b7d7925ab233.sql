
CREATE TABLE public.monitoring_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_date DATE NOT NULL,
  person TEXT NOT NULL,
  location TEXT,
  slot_10 TEXT,
  slot_11 TEXT,
  slot_14 TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entry_date, person)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitoring_entries TO authenticated;
GRANT ALL ON public.monitoring_entries TO service_role;

ALTER TABLE public.monitoring_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view entries" ON public.monitoring_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert entries" ON public.monitoring_entries
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update entries" ON public.monitoring_entries
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete entries" ON public.monitoring_entries
  FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER monitoring_entries_touch
BEFORE UPDATE ON public.monitoring_entries
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
