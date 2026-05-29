CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO service_role;

ALTER POLICY "Admins and managers can view all activity"
ON public.activity_logs
USING (app_private.has_role(auth.uid(), 'admin'::public.app_role) OR app_private.has_role(auth.uid(), 'manager'::public.app_role));

ALTER POLICY "Privileged can delete entries"
ON public.monitoring_entries
USING (app_private.has_role(auth.uid(), 'admin'::public.app_role) OR app_private.has_role(auth.uid(), 'manager'::public.app_role));

ALTER POLICY "Admins can delete roles"
ON public.user_roles
USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can insert roles"
ON public.user_roles
WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can update roles"
ON public.user_roles
USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can view all roles"
ON public.user_roles
USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.handle_monitoring_entry_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_privileged boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  v_is_privileged := app_private.has_role(v_uid, 'admin') OR app_private.has_role(v_uid, 'manager');

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
      IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved' OR NEW.approved_at IS NULL) THEN
        NEW.approved_by := v_uid;
        NEW.approved_at := now();
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;