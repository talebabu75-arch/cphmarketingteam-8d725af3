
-- ============ APPROVAL SYSTEM ============
ALTER TABLE public.monitoring_entries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Constrain status values
DO $$ BEGIN
  ALTER TABLE public.monitoring_entries
    ADD CONSTRAINT monitoring_entries_status_check
    CHECK (status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS monitoring_entries_status_idx
  ON public.monitoring_entries(status);

-- Trigger: auto-set status & submitter based on role
CREATE OR REPLACE FUNCTION public.handle_monitoring_entry_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  v_is_privileged := public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'manager');

  IF TG_OP = 'INSERT' THEN
    IF NEW.submitted_by IS NULL THEN NEW.submitted_by := v_uid; END IF;
    IF v_is_privileged THEN
      NEW.status := COALESCE(NEW.status, 'approved');
      IF NEW.status = 'approved' THEN
        NEW.approved_by := v_uid;
        NEW.approved_at := now();
      END IF;
    ELSE
      NEW.status := 'pending';
      NEW.approved_by := NULL;
      NEW.approved_at := NULL;
    END IF;
    NEW.updated_by := v_uid;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_by := v_uid;
    -- if non-privileged user edits an approved row, send back to pending
    IF NOT v_is_privileged THEN
      IF (NEW.location IS DISTINCT FROM OLD.location
        OR NEW.slot_10 IS DISTINCT FROM OLD.slot_10
        OR NEW.slot_11 IS DISTINCT FROM OLD.slot_11
        OR NEW.slot_14 IS DISTINCT FROM OLD.slot_14) THEN
        NEW.status := 'pending';
        NEW.approved_by := NULL;
        NEW.approved_at := NULL;
      END IF;
    ELSE
      -- privileged user: if they changed status to approved, stamp approver
      IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved' OR NEW.approved_at IS NULL) THEN
        NEW.approved_by := v_uid;
        NEW.approved_at := now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_monitoring_entries_approval ON public.monitoring_entries;
CREATE TRIGGER trg_monitoring_entries_approval
BEFORE INSERT OR UPDATE ON public.monitoring_entries
FOR EACH ROW EXECUTE FUNCTION public.handle_monitoring_entry_approval();

-- ============ ACTIVITY LOG ============
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  action text NOT NULL, -- INSERT | UPDATE | DELETE | APPROVE | REJECT
  table_name text NOT NULL,
  record_id uuid,
  entry_date date,
  person text,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view all activity"
ON public.activity_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Users can view their own activity"
ON public.activity_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated can insert activity"
ON public.activity_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_user_idx ON public.activity_logs(user_id);

-- Trigger to log monitoring_entries changes
CREATE OR REPLACE FUNCTION public.log_monitoring_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_changes jsonb;
  v_action text := TG_OP;
BEGIN
  IF v_uid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  IF TG_OP = 'INSERT' THEN
    v_changes := jsonb_build_object(
      'location', NEW.location,
      'slot_10', NEW.slot_10, 'slot_11', NEW.slot_11, 'slot_14', NEW.slot_14,
      'status', NEW.status
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_changes := jsonb_build_object();
    IF NEW.location IS DISTINCT FROM OLD.location THEN
      v_changes := v_changes || jsonb_build_object('location', jsonb_build_array(OLD.location, NEW.location));
    END IF;
    IF NEW.slot_10 IS DISTINCT FROM OLD.slot_10 THEN
      v_changes := v_changes || jsonb_build_object('slot_10', jsonb_build_array(OLD.slot_10, NEW.slot_10));
    END IF;
    IF NEW.slot_11 IS DISTINCT FROM OLD.slot_11 THEN
      v_changes := v_changes || jsonb_build_object('slot_11', jsonb_build_array(OLD.slot_11, NEW.slot_11));
    END IF;
    IF NEW.slot_14 IS DISTINCT FROM OLD.slot_14 THEN
      v_changes := v_changes || jsonb_build_object('slot_14', jsonb_build_array(OLD.slot_14, NEW.slot_14));
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_changes := v_changes || jsonb_build_object('status', jsonb_build_array(OLD.status, NEW.status));
      IF NEW.status = 'approved' THEN v_action := 'APPROVE';
      ELSIF NEW.status = 'rejected' THEN v_action := 'REJECT';
      END IF;
    END IF;
    IF v_changes = '{}'::jsonb THEN RETURN NEW; END IF;
  ELSE
    v_changes := jsonb_build_object(
      'location', OLD.location,
      'slot_10', OLD.slot_10, 'slot_11', OLD.slot_11, 'slot_14', OLD.slot_14
    );
  END IF;

  INSERT INTO public.activity_logs (user_id, user_email, action, table_name, record_id, entry_date, person, changes)
  VALUES (
    v_uid, v_email, v_action, TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.entry_date, OLD.entry_date),
    COALESCE(NEW.person, OLD.person),
    v_changes
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_monitoring_activity_log ON public.monitoring_entries;
CREATE TRIGGER trg_monitoring_activity_log
AFTER INSERT OR UPDATE OR DELETE ON public.monitoring_entries
FOR EACH ROW EXECUTE FUNCTION public.log_monitoring_activity();

-- Update RLS on monitoring_entries: staff can only update their own pending rows
DROP POLICY IF EXISTS "Authenticated can update entries" ON public.monitoring_entries;
CREATE POLICY "Privileged can update any entry"
ON public.monitoring_entries FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Staff can update their own pending entries"
ON public.monitoring_entries FOR UPDATE TO authenticated
USING (
  NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  AND (submitted_by = auth.uid() OR submitted_by IS NULL)
  AND status IN ('pending','rejected')
)
WITH CHECK (auth.uid() IS NOT NULL);

-- Restrict delete to privileged
DROP POLICY IF EXISTS "Authenticated can delete entries" ON public.monitoring_entries;
CREATE POLICY "Privileged can delete entries"
ON public.monitoring_entries FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
