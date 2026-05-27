
CREATE TABLE public.dashboard_persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_persons TO authenticated;
GRANT ALL ON public.dashboard_persons TO service_role;
ALTER TABLE public.dashboard_persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read persons" ON public.dashboard_persons FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert persons" ON public.dashboard_persons FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update persons" ON public.dashboard_persons FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete persons" ON public.dashboard_persons FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TABLE public.dashboard_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_locations TO authenticated;
GRANT ALL ON public.dashboard_locations TO service_role;
ALTER TABLE public.dashboard_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read locations" ON public.dashboard_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert locations" ON public.dashboard_locations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update locations" ON public.dashboard_locations FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete locations" ON public.dashboard_locations FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

INSERT INTO public.dashboard_persons (name, sort_order) VALUES
  ('Sahin', 1), ('Liakot', 2), ('Belayet', 3), ('Selim', 4), ('Taiyab', 5)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.dashboard_locations (name, sort_order) VALUES
  ('Cumilla',1),('Burichang',2),('Nangolkot',3),('Laksam',4),('Feni',5),
  ('Chouddagram',6),('Kotbari',7),('Barura',8),('Sonagazi',9),('Kasba',10),
  ('Muradnogor',11),('Gunabati',12),('Miabazar',13),('B Para',14),
  ('Debidwer',15),('Chandina',16),('Mudafforgonj',17),('Mohammad Ali',18)
ON CONFLICT (name) DO NOTHING;
