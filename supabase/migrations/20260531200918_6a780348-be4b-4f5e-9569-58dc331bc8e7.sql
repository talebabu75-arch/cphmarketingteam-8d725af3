
CREATE TABLE public.tour_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  person TEXT NOT NULL,
  plan_date DATE NOT NULL,
  location TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (person, plan_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_plans TO authenticated;
GRANT ALL ON public.tour_plans TO service_role;

ALTER TABLE public.tour_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view tour plans" ON public.tour_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tour plans" ON public.tour_plans
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update tour plans" ON public.tour_plans
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete tour plans" ON public.tour_plans
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TRIGGER tour_plans_touch_updated
BEFORE UPDATE ON public.tour_plans
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_tour_plans_person_date ON public.tour_plans (person, plan_date);
