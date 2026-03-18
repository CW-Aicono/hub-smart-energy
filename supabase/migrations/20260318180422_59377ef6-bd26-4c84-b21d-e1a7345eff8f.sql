ALTER TABLE public.pv_forecast_hourly
ADD COLUMN IF NOT EXISTS legacy_estimated_kwh double precision,
ADD COLUMN IF NOT EXISTS corrected_estimated_kwh double precision,
ADD COLUMN IF NOT EXISTS legacy_ai_adjusted_kwh double precision,
ADD COLUMN IF NOT EXISTS corrected_ai_adjusted_kwh double precision,
ADD COLUMN IF NOT EXISTS poa_w_m2 double precision,
ADD COLUMN IF NOT EXISTS legacy_poa_w_m2 double precision,
ADD COLUMN IF NOT EXISTS dni_w_m2 double precision,
ADD COLUMN IF NOT EXISTS dhi_w_m2 double precision;

CREATE OR REPLACE FUNCTION public.get_pv_forecast_daily_compare(p_location_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(day date, estimated_kwh double precision, ai_adjusted_kwh double precision, legacy_estimated_kwh double precision, corrected_estimated_kwh double precision, legacy_ai_adjusted_kwh double precision, corrected_ai_adjusted_kwh double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    f.forecast_date AS day,
    SUM(f.estimated_kwh)::double precision,
    SUM(f.ai_adjusted_kwh)::double precision,
    SUM(COALESCE(f.legacy_estimated_kwh, f.estimated_kwh))::double precision,
    SUM(COALESCE(f.corrected_estimated_kwh, f.estimated_kwh))::double precision,
    SUM(COALESCE(f.legacy_ai_adjusted_kwh, f.ai_adjusted_kwh, f.estimated_kwh))::double precision,
    SUM(COALESCE(f.corrected_ai_adjusted_kwh, f.ai_adjusted_kwh, f.estimated_kwh))::double precision
  FROM public.pv_forecast_hourly f
  WHERE f.location_id = p_location_id
    AND f.forecast_date >= p_from_date
    AND f.forecast_date <= p_to_date
  GROUP BY f.forecast_date
  ORDER BY f.forecast_date;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pv_forecast_daily_compare_all(p_tenant_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(day date, estimated_kwh double precision, ai_adjusted_kwh double precision, legacy_estimated_kwh double precision, corrected_estimated_kwh double precision, legacy_ai_adjusted_kwh double precision, corrected_ai_adjusted_kwh double precision)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    f.forecast_date AS day,
    SUM(f.estimated_kwh)::double precision,
    SUM(f.ai_adjusted_kwh)::double precision,
    SUM(COALESCE(f.legacy_estimated_kwh, f.estimated_kwh))::double precision,
    SUM(COALESCE(f.corrected_estimated_kwh, f.estimated_kwh))::double precision,
    SUM(COALESCE(f.legacy_ai_adjusted_kwh, f.ai_adjusted_kwh, f.estimated_kwh))::double precision,
    SUM(COALESCE(f.corrected_ai_adjusted_kwh, f.ai_adjusted_kwh, f.estimated_kwh))::double precision
  FROM public.pv_forecast_hourly f
  WHERE f.tenant_id = p_tenant_id
    AND f.forecast_date >= p_from_date
    AND f.forecast_date <= p_to_date
    AND EXISTS (
      SELECT 1 FROM public.pv_forecast_settings s
      WHERE s.location_id = f.location_id
        AND s.is_active = true
    )
  GROUP BY f.forecast_date
  ORDER BY f.forecast_date;
END;
$function$;