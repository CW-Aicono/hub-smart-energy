-- ============================================================
-- 1) Raw sensor readings (short retention)
-- ============================================================
CREATE TABLE public.sensor_readings_raw (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  sensor_uuid text,
  value numeric NOT NULL,
  unit text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sensor_readings_raw TO authenticated;
GRANT ALL ON public.sensor_readings_raw TO service_role;

ALTER TABLE public.sensor_readings_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sensor_readings_raw_tenant_select" ON public.sensor_readings_raw
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "sensor_readings_raw_service_all" ON public.sensor_readings_raw
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX sensor_readings_raw_meter_time_idx
  ON public.sensor_readings_raw (meter_id, recorded_at DESC);
CREATE INDEX sensor_readings_raw_tenant_idx
  ON public.sensor_readings_raw (tenant_id);
CREATE INDEX sensor_readings_raw_recorded_at_brin
  ON public.sensor_readings_raw USING brin (recorded_at);

ALTER TABLE public.sensor_readings_raw SET (fillfactor = 90, autovacuum_vacuum_scale_factor = 0.05);

-- ============================================================
-- 2) 5-minute aggregate (long retention)
-- ============================================================
CREATE TABLE public.sensor_readings_5min (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  meter_id uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  bucket timestamptz NOT NULL,
  value_avg numeric NOT NULL,
  value_min numeric NOT NULL,
  value_max numeric NOT NULL,
  value_last numeric NOT NULL,
  sample_count integer NOT NULL DEFAULT 1,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sensor_readings_5min_unique UNIQUE (meter_id, bucket)
);

GRANT SELECT ON public.sensor_readings_5min TO authenticated;
GRANT ALL ON public.sensor_readings_5min TO service_role;

ALTER TABLE public.sensor_readings_5min ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sensor_readings_5min_tenant_select" ON public.sensor_readings_5min
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "sensor_readings_5min_service_all" ON public.sensor_readings_5min
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX sensor_readings_5min_meter_bucket_idx
  ON public.sensor_readings_5min (meter_id, bucket DESC);
CREATE INDEX sensor_readings_5min_tenant_idx
  ON public.sensor_readings_5min (tenant_id);

-- ============================================================
-- 3) Kill switch
-- ============================================================
INSERT INTO public.system_settings (key, value, description)
VALUES (
  'sensor_history_enabled',
  'true',
  'Wenn true: Sensor-Rohwerte werden in sensor_readings_raw historisiert. Notfall-Kill-Switch bei IO-Druck.'
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4) Retention cleanup functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_sensor_readings_raw()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sensor_readings_raw
  WHERE recorded_at < now() - interval '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_sensor_readings_5min()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sensor_readings_5min
  WHERE bucket < now() - interval '400 days';
END;
$$;

-- ============================================================
-- 5) pg_cron schedules (idempotent)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
      'sensor-readings-raw-cleanup',
      'sensor-readings-5min-cleanup'
    );
    PERFORM cron.schedule(
      'sensor-readings-raw-cleanup',
      '17 3 * * *',
      $cron$SELECT public.cleanup_sensor_readings_raw();$cron$
    );
    PERFORM cron.schedule(
      'sensor-readings-5min-cleanup',
      '43 4 * * 0',
      $cron$SELECT public.cleanup_sensor_readings_5min();$cron$
    );
  END IF;
END $$;