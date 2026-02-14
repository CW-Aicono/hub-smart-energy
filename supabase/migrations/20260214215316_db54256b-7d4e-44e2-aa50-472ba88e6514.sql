
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service role full access" ON pending_ocpp_commands;

-- Allow tenant admins to read/manage commands for their charge points
CREATE POLICY "Tenant admins can manage their commands"
  ON pending_ocpp_commands FOR ALL
  USING (
    charge_point_ocpp_id IN (
      SELECT ocpp_id FROM charge_points 
      WHERE tenant_id = get_user_tenant_id()
    )
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    charge_point_ocpp_id IN (
      SELECT ocpp_id FROM charge_points 
      WHERE tenant_id = get_user_tenant_id()
    )
    AND has_role(auth.uid(), 'admin'::app_role)
  );
