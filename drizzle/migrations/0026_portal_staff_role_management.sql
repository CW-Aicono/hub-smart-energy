CREATE OR REPLACE FUNCTION public.portal_staff_overview()
RETURNS TABLE(user_id uuid, email text, name text, roles text[], is_blocked boolean, last_sign_in_at timestamptz, invited boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Nur Portal-Admins dürfen Portal-Rollen einsehen.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT ur.user_id,
         COALESCE(p.email, u.email)::text,
         COALESCE(p.contact_person, '')::text,
         array_agg(ur.role::text ORDER BY ur.role::text),
         COALESCE(p.is_blocked, false),
         u.last_sign_in_at,
         (u.last_sign_in_at IS NULL)
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role::text IN ('super_admin','portal_commercial','portal_technical')
  GROUP BY ur.user_id, p.email, u.email, p.contact_person, p.is_blocked, u.last_sign_in_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.portal_staff_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_staff_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_set_user_roles(_target uuid, _roles text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_allowed text[] := ARRAY['super_admin','portal_commercial','portal_technical'];
  v_r text;
BEGIN
  IF v_caller IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_caller AND role = 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Nur Portal-Admins dürfen Portal-Rollen ändern.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  _roles := COALESCE(_roles, ARRAY[]::text[]);
  FOREACH v_r IN ARRAY _roles LOOP
    IF NOT v_r = ANY(v_allowed) THEN RAISE EXCEPTION 'Ungültige Portal-Rolle: %', v_r; END IF;
  END LOOP;
  IF NOT ('super_admin' = ANY(_roles))
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'super_admin'::public.app_role) THEN
    IF _target = v_caller THEN
      RAISE EXCEPTION 'Sie können sich die Portal-Admin-Rolle nicht selbst entziehen.';
    END IF;
    IF (SELECT count(*) FROM public.user_roles WHERE role = 'super_admin'::public.app_role) <= 1 THEN
      RAISE EXCEPTION 'Der letzte verbleibende Portal-Admin kann nicht herabgestuft werden.';
    END IF;
  END IF;
  -- nur Portal-Rollen; Partner-/Mandantenrollen bleiben unberührt
  DELETE FROM public.user_roles
   WHERE user_id = _target AND role::text = ANY(v_allowed) AND NOT (role::text = ANY(_roles));
  INSERT INTO public.user_roles (user_id, role)
  SELECT _target, x::public.app_role FROM unnest(_roles) x
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role::text = x);
END $$;
REVOKE EXECUTE ON FUNCTION public.portal_set_user_roles(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_set_user_roles(uuid, text[]) TO authenticated;

-- DB-Schutz: letzter Portal-Admin darf nie entfernt werden (auch nicht per direktem API-Aufruf)
CREATE OR REPLACE FUNCTION public.guard_last_portal_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.role = 'super_admin'::public.app_role AND auth.uid() IS NOT NULL THEN
    IF OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'Sie können sich die Portal-Admin-Rolle nicht selbst entziehen.';
    END IF;
    IF (SELECT count(*) FROM public.user_roles WHERE role = 'super_admin'::public.app_role AND id <> OLD.id) < 1 THEN
      RAISE EXCEPTION 'Der letzte verbleibende Portal-Admin kann nicht herabgestuft werden.';
    END IF;
  END IF;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_last_portal_admin() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_last_portal_admin_trigger ON public.user_roles;
CREATE TRIGGER guard_last_portal_admin_trigger BEFORE DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_last_portal_admin();