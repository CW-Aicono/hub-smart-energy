
-- 1. Fallback: compute daily totals from 5-minute aggregates
-- Only fills days that don't already have a record in meter_period_totals
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
    p_day::text,
    SUM(r.power_avg * 5.0 / 60.0),  -- kW * (5/60)h = kWh
    r.energy_type,
    'computed_5min'
  FROM meter_power_readings_5min r
  WHERE r.bucket >= v_start AND r.bucket < v_end
  GROUP BY r.tenant_id, r.meter_id, r.energy_type
  HAVING SUM(r.power_avg * 5.0 / 60.0) > 0
  ON CONFLICT (meter_id, period_type, period_start)
  DO NOTHING;  -- Don't overwrite Loxone values

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- 2. RPC: get aggregated period sums for arbitrary date ranges
CREATE OR REPLACE FUNCTION public.get_meter_period_sums(
  p_meter_ids uuid[],
  p_from_date date,
  p_to_date date
)
RETURNS TABLE(meter_id uuid, total_value double precision)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mpt.meter_id,
    SUM(mpt.total_value)::double precision AS total_value
  FROM meter_period_totals mpt
  WHERE mpt.meter_id = ANY(p_meter_ids)
    AND mpt.period_type = 'day'
    AND mpt.period_start::date >= p_from_date
    AND mpt.period_start::date <= p_to_date
  GROUP BY mpt.meter_id;
END;
$$;

-- 3. RPC: get daily breakdown for a date range (for chart bars per day)
CREATE OR REPLACE FUNCTION public.get_meter_daily_totals(
  p_meter_ids uuid[],
  p_from_date date,
  p_to_date date
)
RETURNS TABLE(meter_id uuid, day date, total_value double precision)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mpt.meter_id,
    mpt.period_start::date AS day,
    mpt.total_value::double precision
  FROM meter_period_totals mpt
  WHERE mpt.meter_id = ANY(p_meter_ids)
    AND mpt.period_type = 'day'
    AND mpt.period_start::date >= p_from_date
    AND mpt.period_start::date <= p_to_date
  ORDER BY mpt.period_start::date;
END;
$$;
