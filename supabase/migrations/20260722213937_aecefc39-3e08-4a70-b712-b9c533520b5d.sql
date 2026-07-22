CREATE OR REPLACE FUNCTION public.purge_meter_power_readings_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted bigint := 0;
  v_batch   bigint;
BEGIN
  LOOP
    WITH del AS (
      DELETE FROM public.meter_power_readings
      WHERE ctid IN (
        SELECT ctid FROM public.meter_power_readings
        WHERE recorded_at < now() - INTERVAL '7 days'
        LIMIT 10000
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_batch FROM del;
    EXIT WHEN v_batch = 0;
    v_deleted := v_deleted + v_batch;
    PERFORM pg_sleep(0.1);
  END LOOP;
  RAISE NOTICE 'purge_meter_power_readings_retention: % rows deleted', v_deleted;
END;
$function$;