DROP POLICY IF EXISTS "Tenant users can view own ws sessions" ON public.loxone_ws_session_log;

CREATE POLICY "Tenant users can view own ws sessions"
ON public.loxone_ws_session_log
FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT profiles.tenant_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  )
);