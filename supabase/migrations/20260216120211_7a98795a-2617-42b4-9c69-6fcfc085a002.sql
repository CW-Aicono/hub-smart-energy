
-- Drop overly permissive policy
DROP POLICY "Service can manage weather data" ON public.weather_degree_days;

-- Edge functions use service_role key which bypasses RLS anyway,
-- so we only need the SELECT policy for authenticated users.
-- For insert/update by authenticated users (not needed currently), add specific policies later.
