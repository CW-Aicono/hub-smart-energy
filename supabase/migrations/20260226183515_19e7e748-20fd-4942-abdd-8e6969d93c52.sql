
-- Fix overly permissive policy: restrict writes to service role only
DROP POLICY "Service role can manage PV forecasts" ON public.pv_forecast_hourly;

-- No INSERT/UPDATE/DELETE policies for anon/authenticated – only service_role (bypasses RLS) writes
