
-- ============================================================
-- Phase 4 (Smart-Split): Bridge-Worker Datenfluss-Tabellen
-- ============================================================

-- 1) bridge_raw_samples: Ringpuffer für Roh-Events vom Worker
CREATE TABLE public.bridge_raw_samples (
  id           bigserial PRIMARY KEY,
  worker_id    uuid REFERENCES public.bridge_workers(id) ON DELETE CASCADE,
  link_id      uuid REFERENCES public.bridge_miniserver_links(id) ON DELETE CASCADE,
  tenant_id    uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  miniserver_serial text NOT NULL,
  uuid         text NOT NULL,
  value        double precision NOT NULL,
  received_at  timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone
);

CREATE INDEX idx_bridge_raw_samples_received    ON public.bridge_raw_samples (received_at DESC);
CREATE INDEX idx_bridge_raw_samples_uuid_recv   ON public.bridge_raw_samples (uuid, received_at DESC);
CREATE INDEX idx_bridge_raw_samples_unprocessed ON public.bridge_raw_samples (received_at) WHERE processed_at IS NULL;
CREATE INDEX idx_bridge_raw_samples_link        ON public.bridge_raw_samples (link_id, received_at DESC);

GRANT SELECT ON public.bridge_raw_samples TO authenticated;
GRANT ALL    ON public.bridge_raw_samples TO service_role;

ALTER TABLE public.bridge_raw_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read all raw samples"
  ON public.bridge_raw_samples
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Service role manages raw samples"
  ON public.bridge_raw_samples
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);


-- 2) meter_power_readings_5min_bridge: Schatten-Tabelle für 5-Min-Leistungen
CREATE TABLE public.meter_power_readings_5min_bridge (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id           uuid REFERENCES public.meters(id) ON DELETE SET NULL,
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  energy_type        text NOT NULL,
  power_avg          numeric NOT NULL,
  power_max          numeric NOT NULL,
  bucket             timestamp with time zone NOT NULL,
  sample_count       integer NOT NULL DEFAULT 1,
  resolution_minutes smallint NOT NULL DEFAULT 5 CHECK (resolution_minutes IN (5, 15)),
  source             text DEFAULT 'bridge_ws',
  created_at         timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX meter_power_5min_bridge_unique_idx
  ON public.meter_power_readings_5min_bridge (meter_id, bucket, resolution_minutes);
CREATE INDEX meter_power_5min_bridge_tenant_meter_idx
  ON public.meter_power_readings_5min_bridge (tenant_id, meter_id, bucket DESC);

GRANT SELECT ON public.meter_power_readings_5min_bridge TO authenticated;
GRANT ALL    ON public.meter_power_readings_5min_bridge TO service_role;

ALTER TABLE public.meter_power_readings_5min_bridge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users read their bridge power readings"
  ON public.meter_power_readings_5min_bridge
  FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Service role manages bridge power readings"
  ON public.meter_power_readings_5min_bridge
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);


-- 3) meter_cumulative_readings_bridge: Schatten-Tabelle für Zählerstände
CREATE TABLE public.meter_cumulative_readings_bridge (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id   uuid NOT NULL REFERENCES public.meters(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reading_at timestamp with time zone NOT NULL,
  kwh_total  double precision NOT NULL,
  source     text NOT NULL DEFAULT 'bridge_ws',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX meter_cum_bridge_unique_idx
  ON public.meter_cumulative_readings_bridge (meter_id, reading_at);
CREATE INDEX meter_cum_bridge_tenant_meter_idx
  ON public.meter_cumulative_readings_bridge (tenant_id, meter_id, reading_at DESC);

GRANT SELECT ON public.meter_cumulative_readings_bridge TO authenticated;
GRANT ALL    ON public.meter_cumulative_readings_bridge TO service_role;

ALTER TABLE public.meter_cumulative_readings_bridge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users read their bridge cumulative readings"
  ON public.meter_cumulative_readings_bridge
  FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Service role manages bridge cumulative readings"
  ON public.meter_cumulative_readings_bridge
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);


-- 4) Cleanup-Funktion: bridge_raw_samples älter als 24 h löschen
CREATE OR REPLACE FUNCTION public.cleanup_bridge_raw_samples()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.bridge_raw_samples
  WHERE received_at < now() - interval '24 hours';
$$;
