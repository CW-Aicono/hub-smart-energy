
-- Fix OCPP logs: Replace public policy with tenant-isolated authenticated policy
DROP POLICY IF EXISTS "Users can view OCPP logs for their tenant charge points" ON public.ocpp_message_log;

CREATE POLICY "Authenticated users can view OCPP logs for their tenant charge points"
  ON public.ocpp_message_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.charge_points cp
      JOIN public.profiles p ON p.tenant_id = cp.tenant_id
      WHERE cp.ocpp_id = ocpp_message_log.charge_point_id
        AND p.user_id = auth.uid()
    )
  );
