-- Drop the old restrictive app user policy
DROP POLICY IF EXISTS "App users can view their own sessions" ON public.charging_sessions;

-- Create improved policy: app users can see sessions where their RFID tag or app tag was used
CREATE POLICY "App users can view their own sessions"
ON public.charging_sessions FOR SELECT
TO authenticated
USING (
  -- Tenant-based access (covers admin/manager users)
  (tenant_id IN (SELECT profiles.tenant_id FROM profiles WHERE profiles.user_id = auth.uid()))
  OR
  -- App user access: match by any tag linked to this auth user
  (EXISTS (
    SELECT 1 FROM charging_users cu
    WHERE cu.auth_user_id = auth.uid()
      AND cu.status = 'active'
      AND (
        (cu.rfid_tag IS NOT NULL AND cu.rfid_tag = charging_sessions.id_tag)
        OR (cu.app_tag IS NOT NULL AND charging_sessions.id_tag LIKE 'APP%' AND cu.app_tag = charging_sessions.id_tag)
      )
  ))
);