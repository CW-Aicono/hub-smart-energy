ALTER VIEW public.meter_data_quality_v SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.get_meter_daily_status(uuid[], date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_meter_daily_status(uuid[], date, date) FROM anon;