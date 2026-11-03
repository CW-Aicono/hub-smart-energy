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
    INSERT INTO public.audit_logs(actor_user_id, tenant_id, action, entity_type, entity_id, metadata)
    VALUES (_by, _tenant_id, 'tenant_setup_completed', 'tenant', _tenant_id, jsonb_build_object('reason', _reason));
  EXCEPTION WHEN others THEN NULL;
  END;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public._finish_tenant_setup(uuid, uuid, text) FROM PUBLIC, anon, authenticated;