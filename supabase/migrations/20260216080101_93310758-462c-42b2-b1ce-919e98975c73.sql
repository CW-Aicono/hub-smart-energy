
-- Remove overly permissive policy - service role already bypasses RLS
DROP POLICY "Service role full access on power readings" ON public.meter_power_readings;
