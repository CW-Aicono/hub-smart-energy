
DROP POLICY "Service role can insert solar charging log" ON public.solar_charging_log;

CREATE POLICY "Service role can insert solar charging log"
  ON public.solar_charging_log FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());
