
-- Tabelle für Hetzner-Node-Metriken
CREATE TABLE public.node_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  node_name TEXT NOT NULL,
  cpu_percent DOUBLE PRECISION,
  mem_percent DOUBLE PRECISION,
  disk_percent DOUBLE PRECISION,
  load_avg_1m DOUBLE PRECISION,
  uptime_seconds BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_node_metrics_node_recorded
  ON public.node_metrics (node_name, recorded_at DESC);
CREATE INDEX idx_node_metrics_recorded
  ON public.node_metrics (recorded_at DESC);

-- Grants: nur authenticated super_admins lesen, service_role schreibt
GRANT SELECT ON public.node_metrics TO authenticated;
GRANT ALL ON public.node_metrics TO service_role;

-- RLS
ALTER TABLE public.node_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view node metrics"
ON public.node_metrics
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- (Inserts laufen ausschließlich via service_role aus der Edge Function — keine Policy nötig)

-- Cleanup-Funktion: hält Tabelle auf 7 Tage Retention
CREATE OR REPLACE FUNCTION public.cleanup_old_node_metrics()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.node_metrics WHERE recorded_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Täglich um 03:15 Uhr UTC aufräumen
SELECT cron.schedule(
  'cleanup-node-metrics-daily',
  '15 3 * * *',
  $$ SELECT public.cleanup_old_node_metrics(); $$
);
