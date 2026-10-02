
CREATE OR REPLACE FUNCTION public.touch_location_integration_sync(
  _id uuid,
  _status text,
  _min_interval_seconds int DEFAULT 60
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.location_integrations
     SET sync_status  = _status,
         last_sync_at = now(),
         updated_at   = now()
   WHERE id = _id
     AND (
          sync_status IS DISTINCT FROM _status
       OR last_sync_at IS NULL
       OR last_sync_at < now() - make_interval(secs => _min_interval_seconds)
     );
$$;

GRANT EXECUTE ON FUNCTION public.touch_location_integration_sync(uuid, text, int) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_integration_errors_active_lookup
  ON public.integration_errors (location_integration_id, error_type, is_resolved, is_ignored);
