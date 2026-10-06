CREATE OR REPLACE FUNCTION public.guard_privileged_roles()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_new text := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.role::text END;
  v_old text := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.role::text END;
  v_priv text[] := ARRAY['super_admin','sales_partner','portal_commercial','portal_technical'];
BEGIN
  IF NOT (coalesce(v_new = ANY(v_priv), false) OR coalesce(v_old = ANY(v_priv), false)) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF v_caller IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_caller AND role = 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Privilege escalation blocked: only portal admins may modify privileged roles. Caller: %, target role: %',
      v_caller, coalesce(v_new, v_old) USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;