GRANT SELECT, INSERT, UPDATE, DELETE ON public.sensor_readings_raw TO authenticated;
GRANT ALL ON public.sensor_readings_raw TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sensor_readings_5min TO authenticated;
GRANT ALL ON public.sensor_readings_5min TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sensor_readings_hourly TO authenticated;
GRANT ALL ON public.sensor_readings_hourly TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sensor_readings_daily TO authenticated;
GRANT ALL ON public.sensor_readings_daily TO service_role;