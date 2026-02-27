-- RPC to get daily forecast sums across ALL active PV locations for a tenant
CREATE OR REPLACE FUNCTION public.get_pv_forecast_daily_sums_all(
  p_tenant_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE(day DATE, estimated_kwh DOUBLE PRECISION, ai_adjusted_kwh DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.forecast_date AS day,
    SUM(f.estimated_kwh)::double precision,
    SUM(f.ai_adjusted_kwh)::double precision
  FROM pv_forecast_hourly f
  WHERE f.tenant_id = p_tenant_id
    AND f.forecast_date >= p_from_date
    AND f.forecast_date <= p_to_date
  GROUP BY f.forecast_date
  ORDER BY f.forecast_date;
END;
$$;