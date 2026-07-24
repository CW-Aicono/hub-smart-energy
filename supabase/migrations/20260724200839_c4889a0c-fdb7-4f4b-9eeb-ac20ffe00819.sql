
CREATE OR REPLACE FUNCTION public.latest_meter_cumulative(_meter_ids uuid[])
RETURNS TABLE(meter_id uuid, kwh_total double precision, reading_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (r.meter_id) r.meter_id, r.kwh_total, r.reading_at
  FROM public.meter_cumulative_readings r
  WHERE r.meter_id = ANY(_meter_ids)
    AND EXISTS (
      SELECT 1 FROM public.meters m
      WHERE m.id = r.meter_id
        AND m.tenant_id = public.get_user_tenant_id()
    )
  ORDER BY r.meter_id, r.reading_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.latest_meter_cumulative(uuid[]) TO authenticated;
