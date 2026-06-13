CREATE OR REPLACE FUNCTION public.get_charge_point_daily_uptime(
  p_charge_point_id uuid,
  p_days integer DEFAULT 7
)
RETURNS TABLE (day date, total bigint, online bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  -- Tenant des Ladepunkts ermitteln
  SELECT cp.tenant_id INTO v_tenant
  FROM public.charge_points cp
  WHERE cp.id = p_charge_point_id;

  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  -- Zugriffskontrolle: Super-Admin ODER gleicher Tenant
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR v_tenant = public.get_user_tenant_id()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      ((now() AT TIME ZONE 'Europe/Berlin')::date) - (p_days - 1),
      ((now() AT TIME ZONE 'Europe/Berlin')::date),
      interval '1 day'
    )::date AS day
  )
  SELECT
    d.day,
    COUNT(s.id)::bigint                                AS total,
    COUNT(s.id) FILTER (WHERE s.is_online)::bigint     AS online
  FROM days d
  LEFT JOIN public.charge_point_uptime_snapshots s
    ON s.charge_point_id = p_charge_point_id
   AND ((s.recorded_at AT TIME ZONE 'Europe/Berlin')::date) = d.day
  GROUP BY d.day
  ORDER BY d.day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_charge_point_daily_uptime(uuid, integer)
  TO authenticated, service_role;
