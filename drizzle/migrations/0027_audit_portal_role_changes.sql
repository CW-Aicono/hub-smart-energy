CREATE OR REPLACE FUNCTION public.audit_portal_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.user_roles := COALESCE(NEW, OLD);
  v_actor uuid := auth.uid();
  v_label text;
  v_actor_email text;
BEGIN
  IF v_row.role::text NOT IN ('super_admin','portal_commercial','portal_technical') THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(NULLIF(contact_person,''), email) INTO v_label FROM public.profiles WHERE user_id = v_row.user_id;
  SELECT email INTO v_actor_email FROM public.profiles WHERE user_id = v_actor;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, entity_label, actor_user_id, actor_email, actor_role, before, after, metadata)
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'portal_role_granted' ELSE 'portal_role_revoked' END,
    'portal_role', v_row.user_id::text, v_label, v_actor, v_actor_email,
    CASE WHEN v_actor IS NULL THEN 'system' ELSE 'super_admin' END,
    CASE WHEN TG_OP = 'DELETE' THEN jsonb_build_object('role', OLD.role) END,
    CASE WHEN TG_OP = 'INSERT' THEN jsonb_build_object('role', NEW.role) END,
    jsonb_build_object('role', v_row.role)
  );
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.audit_portal_role_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_portal_role_change_trigger ON public.user_roles;
CREATE TRIGGER audit_portal_role_change_trigger AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_portal_role_change();
CREATE INDEX IF NOT EXISTS idx_audit_logs_portal_role ON public.audit_logs (created_at DESC) WHERE entity_type = 'portal_role';