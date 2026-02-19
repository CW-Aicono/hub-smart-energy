
-- ============================================================
-- meter_power_readings_5min: Verdichtete 5-Minuten-Leistungsdaten
-- ============================================================
CREATE TABLE IF NOT EXISTS public.meter_power_readings_5min (
  id           uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meter_id     uuid         NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  tenant_id    uuid         NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  energy_type  text         NOT NULL,
  power_avg    numeric      NOT NULL,
  power_max    numeric      NOT NULL,
  bucket       timestamptz  NOT NULL,
  sample_count integer      NOT NULL DEFAULT 1,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

-- Unique constraint: nur ein Eintrag pro Meter/Bucket
CREATE UNIQUE INDEX IF NOT EXISTS meter_power_readings_5min_meter_bucket_idx
  ON public.meter_power_readings_5min (meter_id, bucket);

-- Performance-Index für Zeitreihenabruf
CREATE INDEX IF NOT EXISTS meter_power_readings_5min_tenant_meter_bucket_idx
  ON public.meter_power_readings_5min (tenant_id, meter_id, bucket DESC);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.meter_power_readings_5min ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view 5min readings"
  ON public.meter_power_readings_5min FOR SELECT
  USING (tenant_id = get_user_tenant_id());

CREATE POLICY "Tenant users can insert 5min readings"
  ON public.meter_power_readings_5min FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "Tenant users can delete 5min readings"
  ON public.meter_power_readings_5min FOR DELETE
  USING (tenant_id = get_user_tenant_id());

-- ── Performance-Index für meter_power_readings (Rohdaten) ─────────────────────
-- Beschleunigt den täglichen Cleanup und die Verdichtungsabfrage
CREATE INDEX IF NOT EXISTS meter_power_readings_recorded_at_idx
  ON public.meter_power_readings (recorded_at DESC);
