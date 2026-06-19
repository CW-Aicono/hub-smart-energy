CREATE OR REPLACE FUNCTION public.touch_location_integration_sync(_id uuid, _status text, _min_interval_seconds integer DEFAULT 300)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;