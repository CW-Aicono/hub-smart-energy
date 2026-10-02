-- Allow tenant members to end (set ended_at) an active support session for their own tenant
CREATE POLICY "Tenant members can end own support sessions"
  ON public.support_sessions FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid())
  );

GRANT UPDATE ON public.support_sessions TO authenticated;