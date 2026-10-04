CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_tenant_admin boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(_uid, 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  _is_tenant_admin := public.has_role(_uid, 'admin'::app_role)
    AND COALESCE(NEW.tenant_id, OLD.tenant_id) IS NOT NULL
    AND COALESCE(NEW.tenant_id, OLD.tenant_id) = public.get_user_tenant_id();

  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NOT NULL OR NEW.custom_role_id IS NOT NULL OR COALESCE(NEW.is_blocked,false) THEN
      RAISE EXCEPTION 'Mandant, Rolle und Sperre duerfen nur Administratoren setzen' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Nur Super-Admins duerfen Benutzer, Mandant oder E-Mail eines Profils aendern' USING ERRCODE = '42501';
  END IF;

  IF NEW.company_name IS DISTINCT FROM OLD.company_name AND NOT _is_tenant_admin THEN
    RAISE EXCEPTION 'Den Firmennamen duerfen nur Administratoren aendern' USING ERRCODE = '42501';
  END IF;

  IF NEW.custom_role_id IS DISTINCT FROM OLD.custom_role_id THEN
    IF NOT _is_tenant_admin OR _uid = OLD.user_id THEN
      RAISE EXCEPTION 'Keine Berechtigung, die Rolle zu aendern' USING ERRCODE = '42501';
    END IF;
    IF NEW.custom_role_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.custom_roles cr WHERE cr.id = NEW.custom_role_id AND cr.tenant_id = OLD.tenant_id
    ) THEN
      RAISE EXCEPTION 'Rolle gehoert nicht zu diesem Mandanten' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_profile_privileged_columns() FROM PUBLIC, anon, authenticated;
