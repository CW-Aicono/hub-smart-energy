ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS setup_status text NOT NULL DEFAULT 'active';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS setup_completed_by uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_setup_status_check') THEN
    ALTER TABLE public.tenants ADD CONSTRAINT tenants_setup_status_check CHECK (setup_status IN ('setup','active'));
  END IF;
END $$;
-- Bestand bleibt 'active'; neu angelegte Tenants starten in der Einrichtungsphase.
ALTER TABLE public.tenants ALTER COLUMN setup_status SET DEFAULT 'setup';

ALTER TABLE public.support_sessions ADD COLUMN IF NOT EXISTS session_kind text NOT NULL DEFAULT 'support';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_sessions_kind_check') THEN
    ALTER TABLE public.support_sessions ADD CONSTRAINT support_sessions_kind_check CHECK (session_kind IN ('support','setup'));
  END IF;
END $$;

-- Rückkehr in die Einrichtungsphase verhindern
CREATE OR REPLACE FUNCTION public.prevent_tenant_setup_reopen()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.setup_status = 'active' AND NEW.setup_status = 'setup' THEN
    RAISE EXCEPTION 'Ein übergebener Tenant kann nicht zurück in die Einrichtungsphase.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_tenant_setup_reopen ON public.tenants;
CREATE TRIGGER trg_prevent_tenant_setup_reopen BEFORE UPDATE OF setup_status ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_setup_reopen();

CREATE OR REPLACE FUNCTION public._finish_tenant_setup(_tenant_id uuid, _by uuid, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.tenants SET setup_status = 'active', setup_completed_at = now(), setup_completed_by = _by
   WHERE id = _tenant_id AND setup_status = 'setup';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RETURN false; END IF;
  UPDATE public.support_sessions SET ended_at = now()
   WHERE tenant_id = _tenant_id AND session_kind = 'setup' AND ended_at IS NULL;
  BEGIN
    INSERT INTO public.audit_logs(tenant_id, user_id, action, resource_type, resource_id, details)
    VALUES (_tenant_id, _by, 'tenant_setup_completed', 'tenant', _tenant_id::text, jsonb_build_object('reason', _reason));
  EXCEPTION WHEN others THEN NULL;
  END;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public._finish_tenant_setup(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_tenant_setup(_tenant_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (
       public.has_role(v_uid, 'super_admin')
       OR (public.is_partner_admin(v_uid) AND public.partner_has_tenant_access(v_uid, _tenant_id))
     ) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  RETURN public._finish_tenant_setup(_tenant_id, v_uid, 'manual_handover');
END $$;
REVOKE ALL ON FUNCTION public.complete_tenant_setup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_tenant_setup(uuid) TO authenticated;

-- Automatische Übergabe bei erster Anmeldung eines echten Tenant-Admins
CREATE OR REPLACE FUNCTION public.handover_tenant_on_admin_login()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  IF NEW.last_sign_in_at IS NULL OR NEW.last_sign_in_at IS NOT DISTINCT FROM OLD.last_sign_in_at THEN
    RETURN NEW;
  END IF;
  BEGIN
    IF COALESCE((NEW.raw_user_meta_data->>'is_support_user')::boolean, false) THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.tenant_support_users WHERE auth_user_id = NEW.id) THEN RETURN NEW; END IF;
    SELECT p.tenant_id INTO v_tenant FROM public.profiles p
     JOIN public.tenants t ON t.id = p.tenant_id AND t.setup_status = 'setup'
     WHERE p.user_id = NEW.id;
    IF v_tenant IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id AND role = 'admin') THEN
      PERFORM public._finish_tenant_setup(v_tenant, NEW.id, 'tenant_admin_first_login');
    END IF;
  EXCEPTION WHEN others THEN NULL; -- Anmeldung darf nie blockiert werden
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_handover_tenant_on_admin_login ON auth.users;
CREATE TRIGGER trg_handover_tenant_on_admin_login AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handover_tenant_on_admin_login();