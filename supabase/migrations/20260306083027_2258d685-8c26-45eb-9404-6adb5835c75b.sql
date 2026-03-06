
-- Infrastructure metrics table
CREATE TABLE public.infrastructure_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type text NOT NULL,
  metric_name text NOT NULL,
  metric_value double precision,
  metadata jsonb DEFAULT '{}',
  recorded_at timestamptz DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_infra_metrics_type_recorded ON public.infrastructure_metrics (metric_type, recorded_at DESC);
CREATE INDEX idx_infra_metrics_recorded ON public.infrastructure_metrics (recorded_at DESC);

-- RLS
ALTER TABLE public.infrastructure_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read infrastructure metrics"
  ON public.infrastructure_metrics FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Service role can insert infrastructure metrics"
  ON public.infrastructure_metrics FOR INSERT
  WITH CHECK (true);

-- Cleanup function for retention (30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_infra_metrics()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.infrastructure_metrics WHERE recorded_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- DB metrics collection function (called by edge function)
CREATE OR REPLACE FUNCTION public.collect_db_metrics()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_active_connections integer;
  v_max_connections integer;
  v_db_size bigint;
  v_table_count integer;
BEGIN
  -- Active connections
  SELECT count(*) INTO v_active_connections FROM pg_stat_activity WHERE state = 'active';
  
  -- Max connections
  SELECT setting::integer INTO v_max_connections FROM pg_settings WHERE name = 'max_connections';
  
  -- Database size
  SELECT pg_database_size(current_database()) INTO v_db_size;
  
  -- Table count
  SELECT count(*) INTO v_table_count FROM information_schema.tables WHERE table_schema = 'public';

  -- Insert metrics
  INSERT INTO infrastructure_metrics (metric_type, metric_name, metric_value, metadata) VALUES
    ('db_connections', 'active_connections', v_active_connections, '{}'::jsonb),
    ('db_connections', 'max_connections', v_max_connections, '{}'::jsonb),
    ('disk_usage', 'database_size_bytes', v_db_size, '{}'::jsonb),
    ('db_info', 'table_count', v_table_count, '{}'::jsonb);

  -- Top 10 tables by size
  INSERT INTO infrastructure_metrics (metric_type, metric_name, metric_value, metadata)
  SELECT 'table_size', relname::text, pg_total_relation_size(c.oid)::double precision,
    jsonb_build_object('schema', n.nspname)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 10;

  v_result := jsonb_build_object(
    'active_connections', v_active_connections,
    'max_connections', v_max_connections,
    'database_size_bytes', v_db_size,
    'table_count', v_table_count
  );

  -- Cleanup old metrics
  PERFORM cleanup_old_infra_metrics();

  RETURN v_result;
END;
$$;
