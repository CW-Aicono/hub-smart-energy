DROP POLICY IF EXISTS "Authenticated users can view OCPP logs for their tenant charge" ON public.ocpp_message_log;

CREATE POLICY "Tenant users can view their OCPP logs"
ON public.ocpp_message_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.charge_points cp
    JOIN public.profiles p ON p.tenant_id = cp.tenant_id
    WHERE p.user_id = auth.uid()
      AND (
        cp.id::text = ocpp_message_log.charge_point_id
        OR cp.ocpp_id = ocpp_message_log.charge_point_id
      )
  )
);