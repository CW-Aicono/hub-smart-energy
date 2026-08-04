DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(CURRENT_DATE - 3, CURRENT_DATE, '1 day')::date LOOP
    PERFORM public.compute_daily_totals_from_5min(d);
  END LOOP;
  PERFORM public.backfill_meter_power_hourly(4);
END $$;