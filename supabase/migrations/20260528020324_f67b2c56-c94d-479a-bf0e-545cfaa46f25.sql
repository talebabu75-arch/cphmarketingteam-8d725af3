
DROP POLICY IF EXISTS "Staff can update their own pending entries" ON public.monitoring_entries;
DROP POLICY IF EXISTS "Privileged can update any entry" ON public.monitoring_entries;

CREATE POLICY "Authenticated can update entries"
ON public.monitoring_entries
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
