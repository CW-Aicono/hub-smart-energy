
-- Fix: period_start is date, not text
CREATE OR REPLACE FUNCTION public.compute_daily_totals_from_5min(p_day date DEFAULT (CURRENT_DATE - interval '1 day')::date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_inserted integer;
BEGIN
  v_start := p_day::timestamptz;
  v_end := (p_day + interval '1 day')::timestamptz;

  INSERT INTO meter_period_totals (tenant_id, meter_id, period_type, period_start, total_value, energy_type, source)
  SELECT
    r.tenant_id,
    r.meter_id,
    'day',
    p_day,
    SUM(r.power_avg * 5.0 / 60.0),
    r.energy_type,
    'computed_5min'
  FROM meter_power_readings_5min r
  WHERE r.bucket >= v_start AND r.bucket < v_end
  GROUP BY r.tenant_id, r.meter_id, r.energy_type
  HAVING SUM(r.power_avg * 5.0 / 60.0) > 0
  ON CONFLICT (meter_id, period_type, period_start)
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;
