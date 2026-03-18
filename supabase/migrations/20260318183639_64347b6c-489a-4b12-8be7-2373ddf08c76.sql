ALTER TABLE public.pv_forecast_hourly
ADD COLUMN IF NOT EXISTS cell_temp_c double precision,
ADD COLUMN IF NOT EXISTS temperature_2m double precision;

COMMENT ON COLUMN public.pv_forecast_hourly.cell_temp_c IS 'Estimated module temperature in °C based on GTI/POA and NOCT model.';
COMMENT ON COLUMN public.pv_forecast_hourly.temperature_2m IS 'Ambient air temperature in °C from the forecast provider.';