
REVOKE ALL ON FUNCTION public.bridge_event_log_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bridge_event_log_cleanup() TO service_role;
