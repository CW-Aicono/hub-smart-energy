
-- Helper to bootstrap private.cron_settings from an edge function (service-role JWT only)
CREATE OR REPLACE FUNCTION public.bootstrap_cron_settings(p_url text, p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  INSERT INTO private.cron_settings (id, supabase_url, service_role_key, enabled, updated_at)
  VALUES (true, p_url, p_key, true, now())
  ON CONFLICT (id) DO UPDATE
    SET supabase_url = EXCLUDED.supabase_url,
        service_role_key = EXCLUDED.service_role_key,
        enabled = true,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_cron_settings(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_cron_settings(text, text) TO service_role;

-- Make cron silent-failure visible in cron.job_run_details.return_message
CREATE OR REPLACE FUNCTION private.invoke_edge_function(p_name text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
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

  IF NOT COALESCE(v_enabled, false) OR v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'invoke_edge_function(%) skipped: cron_settings not configured or disabled (enabled=%, url_present=%, key_present=%)',
      p_name, COALESCE(v_enabled, false), v_url IS NOT NULL, v_key IS NOT NULL;
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
