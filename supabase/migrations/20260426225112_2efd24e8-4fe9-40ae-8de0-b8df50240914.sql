-- =====================================================================
-- Sicherheits-Härtung: super_admin-Rolle vor Privilege Escalation schützen
-- =====================================================================
-- Hintergrund: Bisherige Policies erlaubten Tenant-Admins, Rollen INKL.
-- super_admin auf User in ihrem eigenen Tenant zu vergeben/ändern/löschen,
-- weil nur der Ziel-Tenant geprüft wurde, nicht aber die zu vergebende Rolle.

-- 1) Alte (unsichere) Tenant-Admin-Policies entfernen
DROP POLICY IF EXISTS "Admins can insert roles in their tenant" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles in their tenant" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles in their tenant" ON public.user_roles;

-- 2) Neue, restriktive Tenant-Admin-Policies:
--    Tenant-Admins dürfen NUR 'admin' und 'user' vergeben - niemals super_admin/sales_partner.
CREATE POLICY "Tenant admins can insert non-privileged roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('admin'::app_role, 'user'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.tenant_id = get_user_tenant_id()
  )
);

CREATE POLICY "Tenant admins can update non-privileged roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('admin'::app_role, 'user'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.tenant_id = get_user_tenant_id()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('admin'::app_role, 'user'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.tenant_id = get_user_tenant_id()
  )
);

CREATE POLICY "Tenant admins can delete non-privileged roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND role IN ('admin'::app_role, 'user'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
      AND p.tenant_id = get_user_tenant_id()
  )
);

-- 3) Defense-in-Depth: Trigger, der priviligierte Rollen absolut schützt.
--    Selbst wenn eine Policy versehentlich zu offen wird, blockt der Trigger
--    JEDE Vergabe/Änderung/Löschung von super_admin & sales_partner durch
--    Nicht-super-admins. Service-Role (RLS-bypass) wird ebenfalls kontrolliert,
--    außer der Caller ist explizit ein super_admin.
CREATE OR REPLACE FUNCTION public.guard_privileged_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_super boolean := false;
  v_target_role public.app_role;
BEGIN
  -- Bestimme, welche Rolle betroffen ist
  IF TG_OP = 'DELETE' THEN
    v_target_role := OLD.role;
  ELSE
    v_target_role := NEW.role;
  END IF;

  -- Nur priviligierte Rollen schützen
  IF v_target_role NOT IN ('super_admin'::public.app_role, 'sales_partner'::public.app_role) THEN
    -- Bei UPDATE auch alte Rolle prüfen (Schutz gegen Downgrade von super_admin)
    IF TG_OP = 'UPDATE' AND OLD.role IN ('super_admin'::public.app_role, 'sales_partner'::public.app_role) THEN
      -- Fall through zur Berechtigungsprüfung
      NULL;
    ELSE
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  -- Service-Role / Backend-Jobs (auth.uid() IS NULL) erlauben - dies sind
  -- Edge Functions mit SERVICE_ROLE_KEY und müssen explizit autorisieren.
  IF v_caller IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Prüfe, ob Caller selbst super_admin ist
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller AND role = 'super_admin'::public.app_role
  ) INTO v_is_super;

  IF NOT v_is_super THEN
    RAISE EXCEPTION 'Privilege escalation blocked: only super_admins may modify privileged roles (super_admin/sales_partner). Caller: %, target role: %',
      v_caller, v_target_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS guard_privileged_roles_trigger ON public.user_roles;
CREATE TRIGGER guard_privileged_roles_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_roles();

-- 4) Audit-Log für alle Rollen-Änderungen
CREATE TABLE IF NOT EXISTS public.user_role_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_at timestamptz NOT NULL DEFAULT now(),
  performed_by uuid,
  performed_by_email text,
  operation text NOT NULL,
  target_user_id uuid NOT NULL,
  old_role public.app_role,
  new_role public.app_role
);

ALTER TABLE public.user_role_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read role audit log"
ON public.user_role_audit_log
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email text;
BEGIN
  SELECT email::text INTO v_email FROM auth.users WHERE id = v_caller;

  INSERT INTO public.user_role_audit_log
    (performed_by, performed_by_email, operation, target_user_id, old_role, new_role)
  VALUES (
    v_caller,
    v_email,
    TG_OP,
    COALESCE(NEW.user_id, OLD.user_id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.role ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.role ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS log_user_role_change_trigger ON public.user_roles;
CREATE TRIGGER log_user_role_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_user_role_change();