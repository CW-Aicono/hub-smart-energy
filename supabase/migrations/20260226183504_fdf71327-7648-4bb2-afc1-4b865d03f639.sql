
-- Table to store hourly PV forecast snapshots
CREATE TABLE public.pv_forecast_hourly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  location_id UUID NOT NULL REFERENCES public.locations(id),
  forecast_date DATE NOT NULL,
  hour_timestamp TIMESTAMPTZ NOT NULL,
  radiation_w_m2 DOUBLE PRECISION NOT NULL DEFAULT 0,
  cloud_cover_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  estimated_kwh DOUBLE PRECISION NOT NULL DEFAULT 0,
  ai_adjusted_kwh DOUBLE PRECISION,
  peak_power_kwp DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, hour_timestamp)
);

ALTER TABLE public.pv_forecast_hourly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their PV forecasts"
  ON public.pv_forecast_hourly FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

CREATE POLICY "Service role can manage PV forecasts"
  ON public.pv_forecast_hourly FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast date-range queries
CREATE INDEX idx_pv_forecast_hourly_location_date 
  ON public.pv_forecast_hourly (location_id, forecast_date);

-- RPC to get daily forecast sums for a location over a date range
CREATE OR REPLACE FUNCTION public.get_pv_forecast_daily_sums(
  p_location_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE(day DATE, estimated_kwh DOUBLE PRECISION, ai_adjusted_kwh DOUBLE PRECISION)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.forecast_date AS day,
    SUM(f.estimated_kwh)::double precision,
    SUM(f.ai_adjusted_kwh)::double precision
  FROM pv_forecast_hourly f
  WHERE f.location_id = p_location_id
    AND f.forecast_date >= p_from_date
    AND f.forecast_date <= p_to_date
  GROUP BY f.forecast_date
  ORDER BY f.forecast_date;
END;
$$;
