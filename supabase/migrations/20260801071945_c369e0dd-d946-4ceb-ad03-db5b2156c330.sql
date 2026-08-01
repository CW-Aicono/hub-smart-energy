DROP TRIGGER IF EXISTS preserve_detached_5min_history_before_delete
ON public.meter_power_readings_5min;

DROP FUNCTION IF EXISTS public.preserve_detached_5min_history();