-- 1) Fix column name in ensure_bridge_miniserver_link (bridge_workers has last_heartbeat_at, not last_seen_at)
CREATE OR REPLACE FUNCTION public.ensure_bridge_miniserver_link(
  p_serial TEXT,
  p_tenant_id UUID,
  p_location_id UUID,
  p_connection_kind public.bridge_connection_kind DEFAULT 'cloud_dns'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id UUID;
  v_link_id   UUID;
BEGIN
  IF p_serial IS NULL OR length(trim(p_serial)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_worker_id
  FROM public.bridge_workers
  WHERE status = 'online'
  ORDER BY last_heartbeat_at DESC NULLS LAST
  LIMIT 1;

  IF v_worker_id IS NULL THEN
    SELECT id INTO v_worker_id
    FROM public.bridge_workers
    ORDER BY last_heartbeat_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_worker_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.bridge_miniserver_links
    (worker_id, tenant_id, location_id, miniserver_serial, connection_kind, enabled)
  VALUES
    (v_worker_id, p_tenant_id, p_location_id, upper(trim(p_serial)), p_connection_kind, TRUE)
  ON CONFLICT (worker_id, miniserver_serial)
  DO UPDATE SET
    tenant_id   = COALESCE(public.bridge_miniserver_links.tenant_id,   EXCLUDED.tenant_id),
    location_id = COALESCE(public.bridge_miniserver_links.location_id, EXCLUDED.location_id),
    updated_at  = now()
  RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_bridge_miniserver_link(TEXT, UUID, UUID, public.bridge_connection_kind) TO service_role, authenticated;

-- 2) Grant EXECUTE on get_user_tenant_id — required by RLS policies invoked from authenticated role
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO authenticated, anon, service_role;

-- 3) Ensure has_role is executable by all roles that RLS references
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;