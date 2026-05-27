DROP POLICY IF EXISTS "Authenticated can insert activity" ON public.activity_logs;

CREATE POLICY "Users can insert their own activity"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());