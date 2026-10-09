CREATE OR REPLACE FUNCTION public.audit_portal_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_actor uuid;
  v_actor_email text;
  v_label text;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF v_row.role::text NOT IN ('super_admin','portal_commercial','portal_technical') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  v_actor := auth.uid();
  SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor;
  SELECT COALESCE(p.contact_person, u.email) INTO v_label
  FROM auth.users u LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = v_row.user_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, entity_label, actor_user_id, actor_email, actor_role, before, after, metadata)
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'portal_role_granted' ELSE 'portal_role_revoked' END,
    'portal_role', v_row.user_id, v_label, v_actor, v_actor_email,
    CASE WHEN v_actor IS NULL THEN 'system' ELSE 'super_admin' END,
    CASE WHEN TG_OP = 'DELETE' THEN jsonb_build_object('role', OLD.role) END,
    CASE WHEN TG_OP = 'INSERT' THEN jsonb_build_object('role', NEW.role) END,
    jsonb_build_object('role', v_row.role)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;