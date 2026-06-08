CREATE INDEX IF NOT EXISTS idx_mpr_tenant_recorded_at
  ON public.meter_power_readings (tenant_id, recorded_at DESC);

ALTER TABLE public.meter_power_readings_5min REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'meter_power_readings_5min'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.meter_power_readings_5min';
  END IF;
END $$;