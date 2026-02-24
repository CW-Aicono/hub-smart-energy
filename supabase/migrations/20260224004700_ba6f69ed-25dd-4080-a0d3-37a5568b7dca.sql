
-- Allow tenant users to see active support sessions for their tenant
CREATE POLICY "Tenant users can view their active support sessions"
ON public.support_sessions
FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND ended_at IS NULL
  AND expires_at > now()
);
