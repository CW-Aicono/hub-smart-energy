-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Private schema for cron infrastructure (not exposed via API)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- Singleton settings table: empty by default → all scheduled jobs no-op on Lovable Cloud
CREATE TABLE IF NOT EXISTS private.cron_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  supabase_url text,
  service_role_key text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.cron_settings FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE private.cron_settings IS
  'Singleton config for pg_cron-driven Edge Function invocations on self-hosted deployments. '
  'Leave empty on Lovable Cloud (the managed scheduler already triggers these functions).';

-- Helper: invoke an Edge Function via pg_net, gracefully no-op when unconfigured
CREATE OR REPLACE FUNCTION private.invoke_edge_function(
  p_name text,
  p_body jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'private', 'public', 'extensions', 'net'
AS $$
DECLARE
  v_url text;
  v_key text;
  v_enabled boolean;
  v_request_id bigint;
BEGIN
  SELECT supabase_url, service_role_key, enabled
    INTO v_url, v_key, v_enabled
    FROM private.cron_settings
   WHERE id = true;

  -- No-op if unconfigured or explicitly disabled (e.g. on Lovable Cloud)
  IF NOT COALESCE(v_enabled, false) OR v_url IS NULL OR v_key IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey', v_key
    ),
    body := p_body,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Idempotent (re-)scheduling
DO $$
DECLARE
  v_jobs text[][] := ARRAY[
    -- [job_name, schedule, edge_function]
    ['ems-loxone-periodic-sync',         '* * * * *',    'loxone-periodic-sync'],
    ['ems-gateway-periodic-sync',        '* * * * *',    'gateway-periodic-sync'],
    ['ems-brighthub-periodic-sync',      '*/5 * * * *',  'brighthub-periodic-sync'],
    ['ems-automation-scheduler',         '* * * * *',    'automation-scheduler'],
    ['ems-dlm-scheduler',                '* * * * *',    'dlm-scheduler'],
    ['ems-power-limit-scheduler',        '* * * * *',    'power-limit-scheduler'],
    ['ems-cheap-charging-scheduler',     '* * * * *',    'cheap-charging-scheduler'],
    ['ems-solar-charging-scheduler',     '* * * * *',    'solar-charging-scheduler'],
    ['ems-pv-forecast',                  '7 * * * *',    'pv-forecast'],
    ['ems-fetch-spot-prices',            '30 14 * * *',  'fetch-spot-prices']
  ];
  v_row text[];
  v_existing int;
BEGIN
  FOREACH v_row SLICE 1 IN ARRAY v_jobs LOOP
    SELECT count(*) INTO v_existing FROM cron.job WHERE jobname = v_row[1];
    IF v_existing > 0 THEN
      PERFORM cron.unschedule(v_row[1]);
    END IF;

    PERFORM cron.schedule(
      v_row[1],
      v_row[2],
      format($f$SELECT private.invoke_edge_function(%L);$f$, v_row[3])
    );
  END LOOP;
END $$;