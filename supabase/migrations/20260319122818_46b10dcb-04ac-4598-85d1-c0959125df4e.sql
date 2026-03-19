CREATE TABLE IF NOT EXISTS public.pv_actual_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  meter_id UUID NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  hour_start TIMESTAMPTZ NOT NULL,
  actual_kwh DOUBLE PRECISION NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'aggregated_5min',
  sample_count INTEGER NOT NULL DEFAULT 0,
  coverage_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pv_actual_hourly_meter_hour_unique UNIQUE (meter_id, hour_start)
);

ALTER TABLE public.pv_actual_hourly ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pv_actual_hourly_location_hour ON public.pv_actual_hourly (location_id, hour_start);
CREATE INDEX IF NOT EXISTS idx_pv_actual_hourly_tenant_hour ON public.pv_actual_hourly (tenant_id, hour_start);
CREATE INDEX IF NOT EXISTS idx_pv_actual_hourly_meter_hour ON public.pv_actual_hourly (meter_id, hour_start);

DROP POLICY IF EXISTS "Users can view PV actual hourly for accessible locations" ON public.pv_actual_hourly;
CREATE POLICY "Users can view PV actual hourly for accessible locations"
ON public.pv_actual_hourly
FOR SELECT
TO authenticated
USING (public.has_location_access(auth.uid(), location_id));

DROP TRIGGER IF EXISTS update_pv_actual_hourly_updated_at ON public.pv_actual_hourly;
CREATE TRIGGER update_pv_actual_hourly_updated_at
BEFORE UPDATE ON public.pv_actual_hourly
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.aggregate_pv_actual_hourly(
  p_from timestamptz DEFAULT date_trunc('hour', now()) - interval '48 hours',
  p_to timestamptz DEFAULT date_trunc('hour', now())
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upserted integer := 0;
BEGIN
  IF p_to <= p_from THEN
    RETURN 0;
  END IF;

  INSERT INTO public.pv_actual_hourly (
    tenant_id,
    location_id,
    meter_id,
    hour_start,
    actual_kwh,
    source,
    sample_count,
    coverage_minutes
  )
  SELECT
    settings.tenant_id,
    settings.location_id,
    settings.pv_meter_id,
    date_trunc('hour', readings.bucket) AS hour_start,
    ROUND(SUM(readings.power_avg * (5.0 / 60.0))::numeric, 4)::double precision AS actual_kwh,
    'aggregated_5min' AS source,
    SUM(COALESCE(readings.sample_count, 0))::integer AS sample_count,
    COUNT(*)::integer * 5 AS coverage_minutes
  FROM public.pv_forecast_settings settings
  JOIN public.locations location
    ON location.id = settings.location_id
   AND location.tenant_id = settings.tenant_id
  JOIN public.meters meter
    ON meter.id = settings.pv_meter_id
   AND meter.tenant_id = settings.tenant_id
   AND (meter.location_id = settings.location_id OR meter.location_id IS NULL)
  JOIN public.meter_power_readings_5min readings
    ON readings.meter_id = settings.pv_meter_id
   AND readings.tenant_id = settings.tenant_id
   AND readings.bucket >= p_from
   AND readings.bucket < p_to
  WHERE settings.is_active = true
    AND settings.pv_meter_id IS NOT NULL
  GROUP BY settings.tenant_id, settings.location_id, settings.pv_meter_id, date_trunc('hour', readings.bucket)
  HAVING SUM(readings.power_avg * (5.0 / 60.0)) > 0
  ON CONFLICT (meter_id, hour_start)
  DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    location_id = EXCLUDED.location_id,
    actual_kwh = EXCLUDED.actual_kwh,
    source = EXCLUDED.source,
    sample_count = EXCLUDED.sample_count,
    coverage_minutes = EXCLUDED.coverage_minutes,
    updated_at = now();

  GET DIAGNOSTICS v_upserted = ROW_COUNT;
  RETURN v_upserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_pv_actual_hourly(
  p_location_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE(hour_start timestamptz, actual_kwh double precision, source text, coverage_minutes integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pah.hour_start,
    SUM(pah.actual_kwh)::double precision AS actual_kwh,
    CASE
      WHEN bool_or(pah.source <> 'aggregated_5min') THEN 'mixed'
      ELSE 'aggregated_5min'
    END AS source,
    MAX(pah.coverage_minutes)::integer AS coverage_minutes
  FROM public.pv_actual_hourly pah
  WHERE pah.location_id = p_location_id
    AND pah.hour_start >= p_from
    AND pah.hour_start < p_to
    AND public.has_location_access(auth.uid(), pah.location_id)
  GROUP BY pah.hour_start
  ORDER BY pah.hour_start;
$$;

CREATE OR REPLACE FUNCTION public.get_pv_actual_daily_sums(
  p_location_id uuid,
  p_from_date date,
  p_to_date date
)
RETURNS TABLE(day date, actual_kwh double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (pah.hour_start AT TIME ZONE 'Europe/Berlin')::date AS day,
    SUM(pah.actual_kwh)::double precision AS actual_kwh
  FROM public.pv_actual_hourly pah
  WHERE pah.location_id = p_location_id
    AND (pah.hour_start AT TIME ZONE 'Europe/Berlin')::date >= p_from_date
    AND (pah.hour_start AT TIME ZONE 'Europe/Berlin')::date <= p_to_date
    AND public.has_location_access(auth.uid(), pah.location_id)
  GROUP BY (pah.hour_start AT TIME ZONE 'Europe/Berlin')::date
  ORDER BY day;
$$;