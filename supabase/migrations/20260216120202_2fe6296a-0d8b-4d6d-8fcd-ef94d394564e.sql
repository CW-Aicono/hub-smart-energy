
-- Cache table for weather degree days per location and month
CREATE TABLE public.weather_degree_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- first day of the month
  heating_degree_days NUMERIC NOT NULL DEFAULT 0,
  cooling_degree_days NUMERIC NOT NULL DEFAULT 0,
  avg_temperature NUMERIC NOT NULL DEFAULT 0,
  reference_temperature NUMERIC NOT NULL DEFAULT 15.0,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one record per location + month + reference_temperature
ALTER TABLE public.weather_degree_days
  ADD CONSTRAINT weather_degree_days_unique UNIQUE (location_id, month, reference_temperature);

-- Index for fast lookups
CREATE INDEX idx_weather_degree_days_location_month ON public.weather_degree_days (location_id, month);

-- Enable RLS
ALTER TABLE public.weather_degree_days ENABLE ROW LEVEL SECURITY;

-- RLS: users can read data belonging to their tenant
CREATE POLICY "Users can view own tenant weather data"
  ON public.weather_degree_days
  FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

-- RLS: service role / edge functions can insert/update (via service_role key)
CREATE POLICY "Service can manage weather data"
  ON public.weather_degree_days
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_weather_degree_days_updated_at
  BEFORE UPDATE ON public.weather_degree_days
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
