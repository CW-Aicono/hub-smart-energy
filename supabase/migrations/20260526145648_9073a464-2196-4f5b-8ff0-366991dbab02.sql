-- Allow tenant members to see active support sessions for their own tenant (for the banner)
CREATE POLICY "Tenant members can view own support sessions"
  ON public.support_sessions FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Ensure Data API grants are present
GRANT SELECT ON public.support_sessions TO authenticated;
GRANT ALL ON public.support_sessions TO service_role;